// declare const jQuery: any;
import { applyFetchPolyfill } from './polyfills/fetch';
// @ts-ignore
import backupImage from '../public/backupImage/backupImage.jpg';
applyFetchPolyfill();
import sos from '@signageos/front-applet';
import { isNil } from 'lodash';
import Debug from 'debug';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';

import { processSmil } from './components/xmlParser/xmlParse';
import { Files } from './components/files/files';
import { Playlist } from './components/playlist/playlist';
import { SMILEnums } from './enums/generalEnums';
import { getFileName } from './components/files/tools';
import { FileStructure } from './enums/fileEnums';
import { SMILFile, SMILFileObject } from './models/filesModels';
import { generateBackupImagePlaylist, getDefaultRegion, sleep } from './components/playlist/tools/generalTools';
import { convertAIRToSMIL } from '@signageos/broadsign-air-to-smil-convertor';
import { corsAnywhere } from '../config/parameters';
import { AIRPlaylistResponse } from '@signageos/broadsign-air-to-smil-convertor/dist/node/AIR/playlist';
import { Duration } from '@signageos/broadsign-air-to-smil-convertor/dist/node/AIR/general';
const files = new Files(sos);

const debug = Debug('@signageos/smil-player:main');
const playlist = new Playlist(sos, files);
let airConfig: AIRConfig;

interface AIRConfig {
	baseUrl: string;
	duration: Duration;
	playerId: string;
	authToken: string;
}

export async function proofOfPlay(token: string) {
	const airProofOfPlayPath = `/playlist/v1/confirm_playback`;
	const airProofOfPlayUrl = `${corsAnywhere}${airConfig.baseUrl}${airProofOfPlayPath}`;
	const headers = {
		'Authorization': `Bearer ${airConfig.authToken}`,
		'Content-Type': 'application/json',
		'Accept': 'application/json',
	};
	const body = JSON.stringify({
		player_identifier: airConfig.playerId,
		confirmed_items: [
			{
				playlist_item_token: token,
				custom_data: {},
			},
		],
	});
	const resp = await fetch(
		airProofOfPlayUrl,
		{
			method: 'POST',
			headers,
			body,
		},
	);
	if (!resp.ok) {
		throw new Error(`Cannot proof of play ${airProofOfPlayUrl}: ${await resp.text()}`);
	}
}

export async function main(
	internalStorageUnit: IStorageUnit,
	thisSos: FrontApplet,
) {
	const airGeneratePath = `/playlist/v1/generate`;
	const airGenerateUrl = `${airConfig.baseUrl}${airGeneratePath}`;
	const smilLocalPath = `${FileStructure.rootFolder}/${getFileName(airGenerateUrl)}`;
	const maxResolution = {
		width: window.innerWidth,
		height: window.innerHeight,
	};
	const fetcher = async (relativePath: string) => {
		const headers = {
			'Authorization': `Bearer ${airConfig.authToken}`,
			'Content-Type': 'application/json',
			'Accept': 'application/json',
		};
		const body = JSON.stringify({
			player_identifier: airConfig.playerId,
			duration: airConfig.duration,
		});
		const url = `${corsAnywhere}${airConfig.baseUrl}${relativePath}`;
		const resp = await fetch(url, {
			method: 'POST',
			headers,
			body,
		});
		if (!resp.ok) {
			throw new Error(`Cannot download resource ${name} from ${airConfig.baseUrl + relativePath}: ${await resp.text()}`);
		}
		const json = resp.json();
		return json;
	};

	// enable internal endless loops for playing media
	playlist.disableLoop(false);
	// enable endless loop for checking files updated
	playlist.setCheckFilesLoop(true);
	playlist.setPlaylistVersion();

	let downloadPromises: Promise<Function[]>[] = [];
	let forceDownload = false;

	// set smilUrl in files instance ( links to files might me in media/file.mp4 format )
	files.setSmilUrl(airGenerateUrl);

	try {
		if (!isNil(sos.config.backupImageUrl) && !isNil(await files.fetchLastModified(sos.config.backupImageUrl))) {
			forceDownload = true;
			const backupImageObject = {
				src: sos.config.backupImageUrl,
			};
			downloadPromises = await files.parallelDownloadAllFiles(internalStorageUnit, [backupImageObject], FileStructure.images, forceDownload);
			await Promise.all(downloadPromises);
		}
	} catch (err) {
		debug('Unexpected error occurred during backup image download : %O', err);
	}

	let lastPlaylist: { response: AIRPlaylistResponse; modifiedAt: number } | null = null;

	function didPlaylistChanged(lastPlaylistResp: AIRPlaylistResponse | undefined, newPlaylistResp: AIRPlaylistResponse) {
		if (!lastPlaylistResp) {
			return true;
		}
		if (lastPlaylistResp.contents.length !== newPlaylistResp.contents.length) {
			return true;
		}
		if (lastPlaylistResp.items.map((i) => i.token).join(',') !== newPlaylistResp.items.map((i) => i.token).join(',')) {
			return true;
		}
		if (JSON.stringify(lastPlaylistResp.contents) !== JSON.stringify(newPlaylistResp.contents)) {
			return true;
		}
		return false;
	}

	async function downloadSMIL() {
		// This is the replacement for standard SMIL download. Broadsign AIR needs to process JSON files to create SMIL file
		if (!lastPlaylist?.response) {
			throw new Error(`The AIR playlist was not generated yet`);
		}
		const smilContent = await convertAIRToSMIL(
			lastPlaylist?.response,
			{ maxResolution },
		);
		await thisSos.fileSystem.writeFile(
			{
				storageUnit: internalStorageUnit,
				filePath: smilLocalPath,
			},
			smilContent,
		);
	}
	async function fetchLastModifiedSMIL(): Promise<number | null> {
		try {
			const airPlaylistResponse: AIRPlaylistResponse = await fetcher(airGeneratePath);
			if (didPlaylistChanged(lastPlaylist?.response, airPlaylistResponse)) {
				lastPlaylist = {
					modifiedAt: new Date().valueOf(),
					response: airPlaylistResponse,
				};
			}
			return lastPlaylist?.modifiedAt ?? null;
		} catch (error) {
			debug('Cannot fetch last-modified header of SMIL', error);
			return null;
		}
	}
	const airGenFile: SMILFile = {
		src: airGenerateUrl,
		download: downloadSMIL,
		fetchLastModified: fetchLastModifiedSMIL,
	};

	let smilFileContent: string = '';

	// wait for successful download of SMIL file, if download or read from internal storage fails
	// wait for one minute and then try to download it again
	while (smilFileContent === '') {
		try {
			// download SMIL file if device has internet connection and smil file exists on remote server
			if (!isNil(await fetchLastModifiedSMIL())) {
				forceDownload = true;
				downloadPromises = await files.parallelDownloadAllFiles(internalStorageUnit, [airGenFile], FileStructure.rootFolder, forceDownload);
				await Promise.all(downloadPromises);
			}

			smilFileContent = await thisSos.fileSystem.readFile({
				storageUnit: internalStorageUnit,
				filePath: smilLocalPath,
			});

			debug('SMIL file downloaded');
			downloadPromises = [];

		} catch (err) {
			debug('Unexpected error occurred during smil file download : %O', err);
			debug('Starting to play backup image');
			const backupImageUrl = !isNil(sos.config.backupImageUrl) ? sos.config.backupImageUrl : backupImage;
			const backupPlaylist = generateBackupImagePlaylist(backupImageUrl, '1');
			const regionInfo = <SMILFileObject> getDefaultRegion();

			await playlist.getAllInfo(backupPlaylist, regionInfo, internalStorageUnit);
			if (isNil(sos.config.backupImageUrl)) {
				backupPlaylist.seq.img.localFilePath = backupImageUrl;
			}
			await playlist.processPlaylist(backupPlaylist, 0);
			await sleep(SMILEnums.defaultDownloadRetry * 1000);
		}
	}

	try {
		const smilObject: SMILFileObject = await processSmil(smilFileContent);
		debug('SMIL file parsed: %O', smilObject);

		// download and play intro file if exists ( image or video )
		if (smilObject.intro.length > 0) {
			await playlist.playIntro(smilObject, internalStorageUnit, airGenerateUrl);
		} else {
			// no intro
			debug('No intro element found');
			downloadPromises = await files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);
			await Promise.all(downloadPromises);
			debug('SMIL media files download finished');
			await playlist.manageFilesAndInfo(smilObject, internalStorageUnit, airGenerateUrl);
		}

		debug('Starting to process parsed smil file');
		await playlist.processingLoop(internalStorageUnit, smilObject, airGenFile);
	} catch (err) {
		debug('Unexpected error during xml parse: %O', err);
		debug('Starting to play backup image');
		const backupImageUrl = !isNil(sos.config.backupImageUrl) ? sos.config.backupImageUrl : backupImage;
		const backupPlaylist = generateBackupImagePlaylist(backupImageUrl, 'indefinite');
		const regionInfo = <SMILFileObject> getDefaultRegion();

		await playlist.getAllInfo(backupPlaylist, regionInfo, internalStorageUnit);
		if (isNil(sos.config.backupImageUrl)) {
			backupPlaylist.seq.img.localFilePath = backupImageUrl;
		}
		await playlist.processPlaylist(backupPlaylist, 0);
	}
}

async function startAIR() {
	const storageUnits = await sos.fileSystem.listStorageUnits();

	// reference to persistent storage unit, where player stores all content
	const internalStorageUnit = <IStorageUnit> storageUnits.find((storageUnit) => !storageUnit.removable);

	await files.createFileStructure(internalStorageUnit);

	debug('File structure created');

	while (true) {
		try {
			await main(internalStorageUnit, sos);
			debug('One smil iteration finished');
		} catch (err) {
			debug('Unexpected error : %O', err);
			await sleep(SMILEnums.defaultRefresh * 1000);
		}
	}
}

// self invoking function to start smil processing if defined in sos.config via timings
(async() => {
	await sos.onReady();
	debug('sOS is ready');

	if (!sos.config.authToken || !sos.config.playerId) {
		throw new Error('SOS config authToken & playerId are required');
	}

	airConfig = {
		baseUrl: sos.config.airBaseUrl || 'https://air.broadsign.com',
		authToken: sos.config.authToken,
		playerId: sos.config.playerId,
		duration: sos.config.playerDuration || '600s',
	};

	debug('Broadsign AIR playlist config: %s', airConfig);
	await startAIR();
})();
