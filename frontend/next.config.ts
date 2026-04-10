import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";
import path from "node:path";

const nextConfig: NextConfig = {
	turbopack: {
		// Ensures Turbopack uses frontend/ as root, not the monorepo root.
		// Required when running from the parent directory (e.g. npm run frontend:dev).
		root: path.resolve(__dirname),
		rules: {
			"*.glsl": {
				loaders: [require.resolve("raw-loader")],
				as: "*.js",
			},
		},
	},
	experimental: {
		// Tells Turbopack/webpack to only compile the named exports actually used
		// from packages with large barrel files (icons, UI libs). Biggest single
		// win for dev startup time.
		optimizePackageImports: [
			"lucide-react",
			"@hugeicons/core-free-icons",
			"@hugeicons/react",
			"@radix-ui/react-icons",
			"motion/react",
			"framer-motion",
			"recharts",
			"@designcombo/timeline",
			"@designcombo/state",
			"@designcombo/types",
		],
	},
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	transpilePackages: ["@opencut/env", "@opencut/ui"],
	reactStrictMode: true,
	productionBrowserSourceMaps: false,
	output: "standalone",
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
		],
	},
};

export default withContentCollections(withBotId(nextConfig));
