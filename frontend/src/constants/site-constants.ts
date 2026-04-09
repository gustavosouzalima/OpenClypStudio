import { OcDataBuddyIcon, OcMarbleIcon } from "@opencut/ui/icons";

export const SITE_URL = "https://opencut.app";

export const SITE_INFO = {
	title: "OpenClyp Studio",
	description:
		"AI-assisted video editing, transcription and compilation studio built on top of OpenCut.",
	url: SITE_URL,
	openGraphImage: "/open-graph/default.jpg",
	twitterImage: "/open-graph/default.jpg",
	favicon: "/favicon.ico",
};

export type ExternalTool = {
	name: string;
	description: string;
	url: string;
	icon: React.ElementType;
};

export const EXTERNAL_TOOLS: ExternalTool[] = [
	{
		name: "Marble",
		description:
			"Modern headless CMS powering the blog for the upstream OpenCut editor.",
		url: "https://marblecms.com?utm_source=opencut",
		icon: OcMarbleIcon,
	},
	{
		name: "Databuddy",
		description: "GDPR compliant analytics used by the upstream OpenCut editor.",
		url: "https://databuddy.cc?utm_source=opencut",
		icon: OcDataBuddyIcon,
	},
];

export const DEFAULT_LOGO_URL = "/logos/opencut/svg/logo.svg";

export const SOCIAL_LINKS = {
	x: "https://x.com/opencutapp",
	github: "https://github.com/OpenCut-app/OpenCut",
	discord: "https://discord.com/invite/Mu3acKZvCp",
};

export type Sponsor = {
	name: string;
	url: string;
	logo: string;
	description: string;
	invertOnDark?: boolean;
};

export const SPONSORS: Sponsor[] = [
	{
		name: "Fal.ai",
		url: "https://fal.ai?utm_source=opencut",
		logo: "/logos/others/fal.svg",
		description: "Generative image, video, and audio models — sponsor of the upstream OpenCut editor.",
		invertOnDark: true,
	},
	{
		name: "Vercel",
		url: "https://vercel.com?utm_source=opencut",
		logo: "/logos/others/vercel.svg",
		description: "Deployment and hosting platform — sponsor of the upstream OpenCut editor.",
		invertOnDark: true,
	},
];
