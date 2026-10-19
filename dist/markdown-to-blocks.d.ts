import type { NotionBlock, RichText } from "./types.js";
/**
 * Options shared by every markdown-to-Notion conversion entry point.
 *
 * `collapseSoftWraps` opts in to CommonMark soft-wrap handling: a single newline
 * inside a paragraph becomes a space. Default off, so conversion behavior is
 * unchanged unless a caller asks for it. Threaded as an argument rather than
 * module state so concurrent conversions cannot observe each other's settings.
 */
export type ConversionOptions = {
    collapseSoftWraps?: boolean;
};
export declare function isSafeUrl(url: string): boolean;
export declare function notionUrlToPageId(url: string): string | null;
export declare function blockTextToRichText(text: string, options?: ConversionOptions): RichText[];
/**
 * Removes a document's leading H1 when a page-creation caller opts in, so a file
 * whose first line repeats the page title does not put that title on the page
 * twice.
 *
 * Deliberately NOT a `ConversionOptions` field. `markdownToBlocks` forwards its
 * options object into the recursive conversions for toggle bodies and columns,
 * so a converter option would strip H1s inside those containers too. Keeping the
 * behavior outside the converter means no recursive path and no non-creation
 * surface can reach it.
 *
 * Apply it exactly once, to the OUTER document's block array, and only at a
 * page-creation call site. Never pass it a nested `children` array.
 *
 * Only index 0 is examined. It is removed only when it is a `heading_1` whose
 * `is_toggleable` is not true; a toggleable heading is a container, not a
 * duplicated title. When index 0 fails either test the array is returned
 * unchanged and nothing further is inspected, so a later H1 is never promoted
 * into the candidate slot.
 */
export declare function stripLeadingH1(blocks: NotionBlock[], enabled?: boolean): NotionBlock[];
export declare function markdownToBlocks(markdown: string, options?: ConversionOptions): NotionBlock[];
export declare function blocksContainPageMention(blocks: NotionBlock[]): boolean;
type DowngradedMention = {
    page_id: string;
    url?: string;
};
export declare function downgradeMentionsToLinks(blocks: NotionBlock[]): {
    blocks: NotionBlock[];
    downgraded: DowngradedMention[];
};
export declare function isMentionTargetError(err: unknown): boolean;
export {};
