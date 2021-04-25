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
import { resetBodyContent } from './components/playlist/tools/htmlTools';
import { convertAEMToSMIL } from '@signageos/adobe-aem-to-smil-convertor';
import { AEMAutoAuth } from '@signageos/adobe-aem-auth';
import { corsAnywhere } from '../config/parameters';
const files = new Files(sos);

const debug = Debug('@signageos/smil-player:main');

async function main(
	internalStorageUnit: IStorageUnit,
	aemBaseUrl: string,
	deviceUsername: string,
	thisSos: FrontApplet,
) {
	const aemDisplayPath = `/content/screens/svc.config.json?id=${deviceUsername}&needData=true`;
	const aemPingPath = `/content/screens/svc.ping.json?id=${deviceUsername}`;
	const aemDisplayUrl = `${aemBaseUrl}${aemDisplayPath}`;
	const smilLocalPath = `${FileStructure.rootFolder}/${getFileName(aemDisplayUrl)}`;
	const maxResolution = {
		width: window.innerWidth,
		height: window.innerHeight,
	};
	const fetcher = (name: string) => async (relativePath: string, headers?: Record<string, string>) => {
		const url = `${corsAnywhere}${aemBaseUrl}${relativePath}`;
		const authHeaders = window.getAuthHeaders?.(url);
		const resp = await fetch(url, {
			headers: { ...authHeaders, ...headers },
		});
		if (!resp.ok) {
			throw new Error(`Cannot download resource ${name} from ${aemBaseUrl + relativePath}: ${await resp.text()}`);
		}
		const json = resp.json();
		return json;
	};
	const fetchers = {
		channel: fetcher('channel'),
	};

	const playlist = new Playlist(sos, files);
	// enable internal endless loops for playing media
	playlist.disableLoop(false);
	// enable endless loop for checking files updated
	playlist.setCheckFilesLoop(true);

	resetBodyContent();

	let downloadPromises: Promise<Function[]>[] = [];
	let forceDownload = false;

	// set smilUrl in files instance ( links to files might me in media/file.mp4 format )
	files.setSmilUrl(aemDisplayUrl);

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

	async function downloadSMIL() {
		// This is the replacement for standard SMIL download. AEM needs to process JSON files to create SMIL file
		const aemDisplay = await fetcher('display')(aemDisplayPath);
		const smilContent = await convertAEMToSMIL(
			aemDisplay,
			fetchers,
			{ baseUrl: aemBaseUrl, maxResolution },
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
		const pingHeaders = {
			'X-SET-HEARTBEAT': 'TRUE',
			'Content-Type': 'application/x-www-form-urlencoded',
			'Accept': 'application/json',
		};
		try {
			const { lastModified } = await fetcher('ping')(aemPingPath, pingHeaders);
			return lastModified;
		} catch (error) {
			debug('Cannot fetch last-modified header of SMIL', error);
			return null;
		}
	}
	const aemDisplayFile: SMILFile = {
		src: aemDisplayUrl,
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
				downloadPromises = await files.parallelDownloadAllFiles(internalStorageUnit, [aemDisplayFile], FileStructure.rootFolder, forceDownload);
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
			await playlist.processPlaylist(backupPlaylist);
			await sleep(SMILEnums.defaultDownloadRetry * 1000);
		}
	}

	try {
		const smilObject: SMILFileObject = await processSmil(smilFileContent);
		debug('SMIL file parsed: %O', smilObject);

		// download and play intro file if exists ( image or video )
		if (smilObject.intro.length > 0) {
			await playlist.playIntro(smilObject, internalStorageUnit, aemDisplayUrl);
		} else {
			// no intro
			debug('No intro element found');
			downloadPromises = await files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);
			await Promise.all(downloadPromises);
			debug('SMIL media files download finished');
			await playlist.manageFilesAndInfo(smilObject, internalStorageUnit, aemDisplayUrl);
		}

		debug('Starting to process parsed smil file');
		await playlist.processingLoop(internalStorageUnit, smilObject, aemDisplayFile);
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
		await playlist.processPlaylist(backupPlaylist);
	}
}

async function startAEM(aemBaseUrl: string, registrationKey: string) {
	const aemAutoAuth = new AEMAutoAuth({
		baseUrl: `${corsAnywhere}${aemBaseUrl}`,
		csrfIntervalMs: 30e3,
		initiateRetryCount: Infinity,
		retryCount: 3,
		retryIntervalMs: 5e3,
		resetCredentialsEveryRetryCount: Infinity,
		resetLoginTokenEveryRetryCount: 10,
	});
	window.getAuthHeaders = (url: string) => {
		return url.startsWith(`${corsAnywhere}${aemBaseUrl}`) ? aemAutoAuth.getRequestHeaders() : {};
	};
	const { initPromise, initError } = await aemAutoAuth.start(registrationKey);
	if (initError) {
		debug('Initiation of AEM authentication failed', initError);
	}

	let aemCredentials = aemAutoAuth.getCredentials();

	if (!aemCredentials) {
		// First registration has to wait for resolve initiation
		await initPromise;
		aemCredentials = aemAutoAuth.getCredentials();
		if (!aemCredentials) {
			// This should not happen because initiateRetryCount is Infinite
			throw new Error('Credentials are still not available');
		}
	}
	const storageUnits = await sos.fileSystem.listStorageUnits();

	// reference to persistent storage unit, where player stores all content
	const internalStorageUnit = <IStorageUnit> storageUnits.find((storageUnit) => !storageUnit.removable);

	await files.createFileStructure(internalStorageUnit);

	debug('File structure created');

	while (true) {
		try {
			await main(internalStorageUnit, aemBaseUrl, aemCredentials.username, sos);
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

	if (!sos.config.aemBaseUrl || !sos.config.registrationKey) {
		throw new Error('SOS config aemBaseUrl & registrationKey are required');
	}

	debug('AEM display config: %s', sos.config.aemBaseUrl, sos.config.registrationKey);
	await startAEM(sos.config.aemBaseUrl, sos.config.registrationKey);
})();
