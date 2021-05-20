import { RegionAttributes } from './xmlJsonModels';

export type SMILVideo = {
	expr?: string,
	src: string,
	fit?: string,
	dur?: number,
	region: string,
	lastModified?: number,
	localFilePath: string,
	arguments?: any[],
	playing?: boolean,
	regionInfo: RegionAttributes,
	media?: string,
	triggerValue?: string,
	'data-token'?: string;
};

export type SMILAudio = {
	id?: string,
	expr?: string,
	src: string,
	dur: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
	triggerValue?: string,
	'data-token'?: string;
};

export type SMILImage = {
	id?: string,
	expr?: string,
	src: string,
	region: string,
	dur: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
	triggerValue?: string,
	'data-token'?: string;
};

export type SMILWidget = {
	id?: string,
	expr?: string,
	src: string,
	region: string,
	dur: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
	triggerValue?: string,
	'data-token'?: string;
};

export type SosHtmlElement = {
	expr?: string,
	src: string,
	id: string,
	media?: string,
	playing?: boolean,
	isTrigger?: boolean,
	triggerValue?: string,
	regionInfo: RegionAttributes,
	localFilePath: string,
};

export type SMILIntro = {
	expr?: string,
	video?: SMILVideo,
	img?: SMILImage,
	[key: string]: string | SMILImage | SMILVideo | undefined,
};

export type SMILMedia =
	SMILImage
	| SMILImage []
	| SMILWidget
	| SMILWidget[]
	| SMILAudio
	| SMILAudio[]
	| SMILVideo
	| SMILVideo[];

export type SMILMediaSingle = SMILImage | SMILWidget | SMILAudio | SMILVideo | SMILIntro;
export type SMILMediaNoVideo = SMILImage | SMILWidget | SMILAudio;
