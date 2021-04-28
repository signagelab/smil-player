import Debug from 'debug';
import * as path from 'path';
import * as URL from 'url';
import { corsAnywhere } from '../../../../config/parameters';
import { MediaInfoObject, MergedDownloadList } from '../../../models/filesModels';
import { checksumString } from './checksum';
export const debug = Debug('@signageos/smil-player:filesModule');
// regExp for valid path testing
const reg = new RegExp('^([A-Za-z]:|[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*)((/[A-Za-z0-9_.-]+)*)$');

export function getRandomInt(max: number) {
	return Math.floor(Math.random() * Math.floor(max));
}

export function getFileName(url: string) {
	if (!url) {
		return url;
	}
	const parsedUrl = URL.parse(url);
	const filePathChecksum = parsedUrl.host ? `_${checksumString(url, 8)}` : '';
	const fileName = path.basename(parsedUrl.pathname ?? url);
	const sanitizedExtname = path.extname(parsedUrl.pathname ?? url).replace(/[^\w\.\-]+/gi, '').substr(0, 10);
	const sanitizedFileName = decodeURIComponent(fileName.substr(0, fileName.length - sanitizedExtname.length))
		.replace(/[^\w\.\-]+/gi, '-')
		.substr(0, 10);
	return `${sanitizedFileName}${filePathChecksum}${sanitizedExtname}`;
}

export function getPath(filePath: string) {
	return path.dirname(filePath);
}

export function isValidLocalPath(filePath: string) {
	return reg.test(filePath);
}

export function createDownloadPath(sourceUrl: string): string {
	return `${corsAnywhere}${sourceUrl}?v=${getRandomInt(1000000)}`;
}

export function createLocalFilePath(localFilePath: string, src: string): string {
	return `${localFilePath}/${getFileName(src)}`;
}

export function createJsonStructureMediaInfo(fileList: MergedDownloadList[]): MediaInfoObject {
	let fileLastModifiedObject: MediaInfoObject = {};
	for (let file of fileList) {
		fileLastModifiedObject[getFileName(file.src)] = file.lastModified ? file.lastModified : 0;
	}
	return fileLastModifiedObject;
}

export function updateJsonObject(jsonObject: MediaInfoObject, attr: string, value: any) {
	jsonObject[attr] = value;
}
