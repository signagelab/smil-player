import * as chai from 'chai';
import {
	createDownloadPath,
	getFileName,
	getPath,
	getProtocol,
	isRelativePath,
} from '../../../src/components/files/tools';

const expect = chai.expect;

describe('Files tools component', () => {

	describe('Files tools component getFileName tests', () => {
		it('Should return correct file name for vairous strings', () => {
			const filesPaths = [
				`https://butikstv.centrumkanalen.com/play/smil/234.smil`,
				`http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10826.png`,
				'localFile/inFolder/something//myfile.txt',
				'../file.png',
				'./../../../idontknow.mp3',
				'fileName.mp4',
				'https://butikstv.centrumkanalen.com/localFile/inFolder/something/my fi $ le.txt',
				`https://butikstv.centrumkanalen.com/play/smil/234.smil?some=var&xxx=yyy`,
				`filesystem:https://butikstv.centrumkanalen.com/persistent/play/smil/234.smil?some=var&xxx=yyy`,
				'',
			];
			const fileNames = [
				'234_e978d68b.smil',
				'10826_d7be1ea5.png',
				'myfile.txt',
				'file.png',
				'idontknow.mp3',
				'fileName.mp4',
				'my-fi-le_28eee269.txt',
				'234_0d7ef620.smil',
				'234_866496b7.smil',
				'',
			];

			for (let i = 0; i < filesPaths.length; i += 1) {
				const response = getFileName(filesPaths[i]);
				expect(response).to.be.equal(fileNames[i]);
			}
		});

		it('Should return correct path for vairous strings', () => {
			const filesPaths = [
				`https://butikstv.centrumkanalen.com/play/smil/234.smil`,
				`http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10826.png`,
				'localFile/inFolder/something//myfile.txt',
				'../file.png',
				'./../../../idontknow.mp3',
				'fileName.mp4',
			];
			const parsedFilePaths = [
				'https://butikstv.centrumkanalen.com/play/smil',
				'http://butikstv.centrumkanalen.com/play/media/rendered/bilder',
				'localFile/inFolder/something/',
				'..',
				'./../../..',
				'.',
			];

			for (let i = 0; i < filesPaths.length; i += 1) {
				const response = getPath(filesPaths[i]);
				expect(response).to.be.equal(parsedFilePaths[i]);
			}
		});

		it('Should return valid path', () => {
			const validUrls = [
				'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape2.jpg',
				'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/portrait2.mp4',
				'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.wgt',
			];

			for (let i = 0; i < validUrls.length; i += 1) {
				const response = createDownloadPath(validUrls[i]);
				const responseNumber: number = parseInt(response.split('?__smil_version=')[1]);
				expect(responseNumber).to.be.lessThan(1000000);
				expect(responseNumber > 0).to.be.equal(true);
			}
		});

		it('Should return valid protocol', () => {
			const urls = [
				'https://www.rmp-streaming.com/media/bbb-360p.mp4',
				'http://www.rmp-streaming.com/media/bbb-360p.mp4',
				'rtsp://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov',
				'RTMP://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov',
				'UDP://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov',
				'rtp://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov',
				'HLS://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov',
				'internal://pc',
				'internal://dvi',
				'internal://dp',
				'internal://hdmi1',
			];

			const protocol = [
				'http',
				'http',
				'rtsp',
				'rtmp',
				'udp',
				'rtp',
				'hls',
				'internal',
				'internal',
				'internal',
				'internal',
			];

			for (let i = 0; i < urls.length; i += 1) {
				const response = getProtocol(urls[i]);
				expect(response).equal(protocol[i]);
			}
		});

	});

	describe('isRelativePath', () => {
		const data = [
			['/root/path', true],
			['root/path', true],
			['http://example.com/root/path', false],
			['https://localhost/root/path', false],
			['https://10.0.0.1/root/path', false],
			['https://10.0.0.1', false],
		] as const;

		data.forEach(([filePath, expected]) => {
			it(`should return ${expected} only on ${filePath} paths`, () => {
				expect(isRelativePath(filePath)).equal(expected);
			});
		});
	});
});
