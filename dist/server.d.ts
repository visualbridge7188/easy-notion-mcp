import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createNotionClient } from "./notion-client.js";
import type { NotionBlock } from "./types.js";
/** @internal Exported for test seams; not part of the public API contract. */
export declare function countOccurrences(text: string, find: string): number;
/** @internal Exported for test seams; not part of the public API contract. */
export declare function simplifyProperty(prop: any): unknown;
export declare function getPageTitle(page: any): string | undefined;
export declare function getBlockHeadingText(block: any): string | null;
export declare function getHeadingLevel(type: string): number;
export declare function getToggleTitle(block: any): string | null;
export declare function findSectionRange(allBlocks: any[], heading: string): {
    ok: true;
    headingIndex: number;
    sectionEnd: number;
    headingBlock: any;
} | {
    ok: false;
    availableHeadings: string[];
};
export declare function isToggleableHeading(block: any): boolean;
export declare function updateSectionPreserveHeadingBody(replacementBlocks: NotionBlock[], headingBlock: any): NotionBlock[];
export type OmittedBlock = {
    id: string;
    type: string;
};
export declare const READ_ONLY_BLOCK_RENDERED_MESSAGE = "Rendered read-only Notion AI meeting notes as ordinary markdown. Round-tripping this markdown replaces the native meeting-notes block with ordinary blocks. Blocks marked transcript_omitted had transcript content available but not included.";
export type ReadOnlyRenderedBlock = {
    id: string;
    type: "transcription" | "meeting_notes";
    transcript_omitted?: boolean;
    sections_unreadable?: Array<{
        key: string;
        block_id: string;
        code?: string;
    }>;
};
export type FetchContext = {
    omitted: OmittedBlock[];
    renderedReadOnly?: ReadOnlyRenderedBlock[];
    includeTranscript?: boolean;
};
/**
 * Block types that `normalizeBlock` can map to a `NotionBlock`. Must stay in
 * sync with the switch in `normalizeBlock` below — exported so the test suite
 * can guard against drift (a type added here but not implemented below would
 * surface as an `omitted_block_types` warning on read).
 */
export declare const SUPPORTED_BLOCK_TYPES: Set<string>;
/**
 * Block types that `update_block` can rewrite via markdown. Subset of
 * SUPPORTED_BLOCK_TYPES — excludes container/structural types whose only
 * meaningful update would change their children (which `blocks.update` cannot
 * do — see plan §3.3) and read-only types whose content has no useful edit.
 */
export declare const UPDATABLE_BLOCK_TYPES: Set<string>;
/**
 * Convert a parsed `markdownToBlocks` output (which may contain N top-level
 * blocks + `children` arrays) into a `blocks.update` body payload for the
 * given existing block type.
 *
 * Returns `{ ok: true, payload }` on a single-block snippet whose type matches
 * the existing block, or `{ ok: false, error }` otherwise. The payload is the
 * SDK-shaped variant body (e.g. `{ paragraph: { rich_text: [...] } }`) with no
 * `block_id`, `in_trash`, or `archived` keys — those are added by the caller.
 */
export declare function buildUpdateBlockPayload(parsed: NotionBlock[], existingType: string, options?: {
    checked?: boolean;
}): {
    ok: true;
    payload: Record<string, unknown>;
} | {
    ok: false;
    error: string;
};
export declare function normalizeBlock(block: any): NotionBlock | null;
export declare function attachChildren(block: NotionBlock, children: NotionBlock[]): void;
export declare function fetchBlocksRecursive(client: ReturnType<typeof createNotionClient>, blockId: string, ctx?: FetchContext): Promise<NotionBlock[]>;
export declare function fetchBlockRecursive(client: ReturnType<typeof createNotionClient>, blockId: string, ctx?: FetchContext): Promise<{
    raw: any;
    block: NotionBlock | null;
}>;
export declare function fetchRawBlocksRecursive(client: ReturnType<typeof createNotionClient>, rawBlocks: any[], ctx?: FetchContext): Promise<NotionBlock[]>;
export declare function findToggleRecursive(client: ReturnType<typeof createNotionClient>, pageId: string, title: string): Promise<{
    block: any | null;
    availableTitles: string[];
}>;
type ListChildrenFn = (client: ReturnType<typeof createNotionClient>, blockId: string) => Promise<unknown[]>;
export declare function findToggleRecursiveWithListChildren(client: ReturnType<typeof createNotionClient>, pageId: string, title: string, listChildrenFn?: ListChildrenFn): Promise<{
    block: any | null;
    availableTitles: string[];
}>;
export type SearchInPageScope = {
    type: "page";
} | {
    type: "toggle";
    title: string;
    block_id: string;
    block_type: string;
};
export type SearchInPageToggleContext = {
    block_id: string;
    title: string;
    type: string;
};
export type SearchInPageMatch = {
    block_id: string;
    type: string;
    text: string;
    snippets: string[];
    match_count: number;
    toggle_context?: SearchInPageToggleContext;
};
export type SearchInPageResponse = {
    page_id: string;
    query: string;
    scope: SearchInPageScope;
    match_count: number;
    block_count: number;
    matches: SearchInPageMatch[];
};
export declare function blockSearchText(block: any): string;
export declare function blockTextPreview(block: any): string;
export declare function blockMapFromBlocks(blocks: any[]): Array<{
    block_id: string;
    type: string;
    text_preview: string;
}>;
export declare function searchInPage(client: ReturnType<typeof createNotionClient>, pageId: string, query: string, options?: {
    withinToggle?: string;
}, listChildrenFn?: ListChildrenFn): Promise<SearchInPageResponse | {
    error: string;
    available_toggles: string[];
}>;
export declare function fetchBlocksWithLimit(client: ReturnType<typeof createNotionClient>, blockId: string, maxBlocks: number, ctx?: FetchContext): Promise<{
    blocks: NotionBlock[];
    hasMore: boolean;
}>;
export declare function enhanceError(error: unknown, toolName: string, args: Record<string, unknown>): string;
export type ServerTransport = "stdio" | "http";
/**
 * Where `workspaceRoot` came from. Passed in explicitly rather than inferred:
 * the stdio entry point collapses the env var and the cwd default into one
 * value before this factory sees it, so `createServer` cannot tell them apart
 * on its own, and reading `process.env` back here would be a guess.
 */
export type WorkspaceRootSource = "env" | "cwd_default" | "config" | "unset" | "not_applicable";
export interface CreateServerConfig {
    rootPageId?: string;
    trustContent?: boolean;
    allowWorkspaceParent?: boolean;
    transport?: ServerTransport;
    workspaceRoot?: string;
    workspaceRootSource?: WorkspaceRootSource;
}
export declare function createServer(notionClientFactory: () => ReturnType<typeof createNotionClient>, config?: CreateServerConfig): Server;
export {};
