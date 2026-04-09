import type {
	MarbleAuthorList,
	MarbleCategoryList,
	MarblePost,
	MarblePostList,
	MarbleTagList,
} from "@/types/blog";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize from "rehype-sanitize";

const url =
	process.env.NEXT_PUBLIC_MARBLE_API_URL ?? "https://api.marblecms.com";
const key = process.env.MARBLE_WORKSPACE_KEY ?? "cmd4iw9mm0006l804kwqv0k46";
const isLocalFallbackEnabled =
	process.env.NODE_ENV !== "production" ||
	process.env.PIXEL_DISABLE_REMOTE_BLOG === "true";

function emptyPagination() {
	return {
		limit: 0,
		currpage: 1,
		nextPage: null,
		prevPage: null,
		totalItems: 0,
		totalPages: 0,
	};
}

function emptyPostList(): MarblePostList {
	return { posts: [], pagination: emptyPagination() };
}

function emptyTagList(): MarbleTagList {
	return { tags: [], pagination: emptyPagination() };
}

function emptyCategoryList(): MarbleCategoryList {
	return { categories: [], pagination: emptyPagination() };
}

function emptyAuthorList(): MarbleAuthorList {
	return { authors: [], pagination: emptyPagination() };
}

function emptySinglePost(): MarblePost {
	return { post: null as never };
}

async function fetchFromMarble<T>({
	endpoint,
	fallback,
}: {
	endpoint: string;
	fallback: () => T;
}): Promise<T> {
	try {
		const response = await fetch(`${url}/${key}/${endpoint}`);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch ${endpoint}: ${response.status} ${response.statusText}`,
			);
		}
		return (await response.json()) as T;
	} catch (error) {
		console.error(`Error fetching ${endpoint}:`, error);
		if (isLocalFallbackEnabled) {
			return fallback();
		}
		throw error;
	}
}

export async function getPosts() {
	return fetchFromMarble<MarblePostList>({
		endpoint: "posts",
		fallback: emptyPostList,
	});
}

export async function getTags() {
	return fetchFromMarble<MarbleTagList>({
		endpoint: "tags",
		fallback: emptyTagList,
	});
}

export async function getSinglePost({ slug }: { slug: string }) {
	return fetchFromMarble<MarblePost>({
		endpoint: `posts/${slug}`,
		fallback: emptySinglePost,
	});
}

export async function getCategories() {
	return fetchFromMarble<MarbleCategoryList>({
		endpoint: "categories",
		fallback: emptyCategoryList,
	});
}

export async function getAuthors() {
	return fetchFromMarble<MarbleAuthorList>({
		endpoint: "authors",
		fallback: emptyAuthorList,
	});
}

export async function processHtmlContent({
	html,
}: {
	html: string;
}): Promise<string> {
	const processor = unified()
		.use(rehypeSanitize)
		.use(rehypeParse, { fragment: true })
		.use(rehypeSlug)
		.use(rehypeAutolinkHeadings, { behavior: "append" })
		.use(rehypeStringify);

	const file = await processor.process({ value: html, type: "html" });
	return String(file);
}
