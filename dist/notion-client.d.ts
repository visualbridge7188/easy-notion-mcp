import { Client } from "@notionhq/client";
import type { ListDatabaseViewsParameters, UpdateDataSourceParameters } from "@notionhq/client/build/src/api-endpoints.js";
import { stat } from "fs/promises";
import type { NotionBlock } from "./types.js";
export type PageParent = {
    type: "page_id";
    page_id: string;
} | {
    type: "workspace";
    workspace: true;
};
export declare function createNotionClient(token: string): Client;
export declare function resolveWorkspaceUploadPath(fileUrl: string): Promise<{
    filePath: string;
    realFilePath: string;
    fileStat: Awaited<ReturnType<typeof stat>>;
}>;
type PropertiesUpdate = UpdateDataSourceParameters["properties"];
export type PaginatedPropertyType = "title" | "rich_text" | "relation" | "people";
export type TruncatedPropertyEntry = {
    name: string;
    type: PaginatedPropertyType;
    returned_count: number;
    cap: number;
};
export type PaginationOpts = {
    maxPropertyItems: number;
    onlyTypes?: PaginatedPropertyType[];
};
export type SchemaEntry = {
    name: string;
    type: string;
    [extra: string]: unknown;
};
export declare function paginatePageProperties(client: Client, page: any, opts: PaginationOpts): Promise<{
    page: any;
    warnings: TruncatedPropertyEntry[];
}>;
declare function paginatePropertyValue(client: Client, pageId: string, propertyId: string, propertyType: PaginatedPropertyType, cap: number): Promise<{
    values: unknown[];
    truncatedAtCap: boolean;
}>;
/**
 * Resolve page_id alias to a database_id.
 * When page_id is a page containing exactly one inline database, resolves to that database.
 * When page_id is already a database ID, passes through.
 * Caches resolution results with the same TTL as schema/dataSourceId caches.
 */
export declare function resolvePageIdAlias(client: Client, args: {
    database_id?: unknown;
    page_id?: unknown;
}): Promise<string>;
/**
 * Get cached schema (properties) for a database.
 * Database properties live on the data source, not the database container.
 */
export declare function getCachedSchema(client: Client, dbId: string): Promise<any>;
export declare function uploadFile(client: Client, fileUrl: string): Promise<{
    id: string;
    blockType: string;
}>;
export declare function getDatabase(client: Client, dbId: string): Promise<{
    id: any;
    title: any;
    url: any;
    properties: Record<string, unknown>[];
}>;
export declare function buildTextFilter(client: Client, dbId: string, text: string): Promise<{
    [x: number]: {
        contains: string;
    };
    property: any;
} | {
    or: {
        [x: number]: {
            contains: string;
        };
        property: any;
    }[];
} | undefined>;
export declare function schemaToProperties(schema: SchemaEntry[]): Record<string, any>;
/** @internal Exported for test seams; not part of the public API contract. */
export declare function convertPropertyValue(type: string, key: string, value: unknown): Record<string, unknown>;
export declare function createPage(client: Client, parent: string | PageParent, title: string, blocks: NotionBlock[], icon?: string, cover?: string): Promise<import("@notionhq/client").CreatePageResponse>;
export declare function findWorkspacePages(client: Client, limit?: number): Promise<Array<{
    id: string;
    title: string;
}>>;
export declare function appendBlocks(client: Client, pageId: string, blocks: NotionBlock[]): Promise<any[]>;
export declare function appendBlocksAfter(client: Client, pageId: string, blocks: NotionBlock[], afterBlockId?: string): Promise<any[]>;
export declare function listChildren(client: Client, blockId: string): Promise<any[]>;
export declare function deleteBlock(client: Client, blockId: string): Promise<import("@notionhq/client").DeleteBlockResponse>;
export declare function retrieveBlock(client: Client, blockId: string): Promise<import("@notionhq/client").GetBlockResponse>;
export declare function replacePageMarkdown(client: Client, pageId: string, newStr: string, options?: {
    allowDeletingContent?: boolean;
}): Promise<any>;
export declare function updateBlock(client: Client, blockId: string, payload: Record<string, unknown>): Promise<any>;
export declare function getPage(client: Client, pageId: string): Promise<import("@notionhq/client").GetPageResponse>;
export declare function updatePage(client: Client, pageId: string, props: {
    title?: string;
    icon?: string;
    cover?: string | {
        type: string;
        [key: string]: any;
    };
}): Promise<import("@notionhq/client").UpdatePageResponse>;
export declare function archivePage(client: Client, pageId: string): Promise<import("@notionhq/client").UpdatePageResponse>;
export declare function restorePage(client: Client, pageId: string): Promise<import("@notionhq/client").UpdatePageResponse>;
export declare function movePage(client: Client, pageId: string, newParentId: string): Promise<import("@notionhq/client").MovePageResponse>;
export declare function searchNotion(client: Client, query: string, filter?: "pages" | "databases"): Promise<any[]>;
export declare function createDatabase(client: Client, parentId: string, title: string, schema: SchemaEntry[], options?: {
    is_inline?: boolean;
}): Promise<import("@notionhq/client").CreateDatabaseResponse>;
export declare function updateDataSource(client: Client, databaseId: string, updates: {
    title?: string;
    properties?: PropertiesUpdate;
    in_trash?: boolean;
}): Promise<{
    result: import("@notionhq/client").UpdateDataSourceResponse;
    warnings: {
        code: string;
        property: string;
        removed: string[];
    }[];
}>;
export declare function queryDatabase(client: Client, dbId: string, filter?: Record<string, unknown>, sorts?: unknown[]): Promise<any[]>;
export type ListViewsParameters = Pick<ListDatabaseViewsParameters, "database_id" | "data_source_id" | "page_size" | "start_cursor">;
export declare function listViews(client: Client, params: ListViewsParameters, options?: {
    includeConfig?: boolean;
}): Promise<import("@notionhq/client").ListDatabaseViewsResponse | {
    object: any;
    results: any;
    next_cursor: any;
    has_more: any;
}>;
export declare function getView(client: Client, viewId: string, options?: {
    includeConfig?: boolean;
}): Promise<import("@notionhq/client").PartialDataSourceViewObjectResponse | CompactView>;
export type ViewType = "table" | "board" | "list" | "calendar" | "timeline" | "gallery" | "form" | "chart" | "map";
export type CreateViewInput = {
    database_id: string;
    name: string;
    type: ViewType;
    filter?: unknown;
    sorts?: unknown;
    quick_filters?: unknown;
    configuration?: unknown;
    position?: unknown;
};
export type UpdateViewInput = {
    name?: string;
    filter?: unknown;
    sorts?: unknown;
    quick_filters?: unknown;
    configuration?: unknown;
};
export type CompactView = {
    id: unknown;
    object: unknown;
    name?: unknown;
    type?: unknown;
    url?: unknown;
    data_source_id?: unknown;
};
export declare function compactView(view: any): CompactView;
export declare function createView(client: Client, input: CreateViewInput): Promise<CompactView>;
export declare function updateView(client: Client, viewId: string, updates: UpdateViewInput): Promise<CompactView>;
export declare function deleteView(client: Client, viewId: string): Promise<{
    success: boolean;
    deleted: string;
    view: CompactView;
}>;
export declare function queryView(client: Client, viewId: string, options?: {
    page_size?: number;
    start_cursor?: string;
}): Promise<import("@notionhq/client").GetViewQueryResultsResponse>;
export declare function listComments(client: Client, pageId: string): Promise<any[]>;
export declare function addComment(client: Client, pageId: string, richText: any[]): Promise<import("@notionhq/client").CreateCommentResponse>;
export declare function createDatabaseEntry(client: Client, dbId: string, properties: Record<string, unknown>): Promise<import("@notionhq/client").CreatePageResponse>;
export declare function updateDatabaseEntry(client: Client, pageId: string, properties: Record<string, unknown>): Promise<import("@notionhq/client").UpdatePageResponse>;
export declare function listUsers(client: Client): Promise<any[]>;
export declare function getMe(client: Client): Promise<import("@notionhq/client").UserObjectResponse>;
/** @internal */
export { paginatePropertyValue };
