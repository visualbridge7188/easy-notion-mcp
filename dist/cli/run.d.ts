import type { Client } from "@notionhq/client";
import { blockTextToRichText, markdownToBlocks } from "../markdown-to-blocks.js";
import { type PageParent } from "../notion-client.js";
import { type FetchContext } from "../server.js";
type CliIO = {
    stdout: {
        write(chunk: string): unknown;
    };
    stderr: {
        write(chunk: string): unknown;
    };
    stdin: NodeJS.ReadStream;
    env: NodeJS.ProcessEnv;
    cwd: string;
};
type NotionOps = {
    createClient(token: string): Client;
    getMe(client: Client): Promise<unknown>;
    listUsers(client: Client): Promise<unknown[]>;
    search(client: Client, query: string, filter?: "pages" | "databases"): Promise<unknown[]>;
    getDatabase(client: Client, databaseId: string): Promise<unknown>;
    validateDatabaseEntriesTarget(client: Client, databaseId: string): Promise<unknown>;
    buildTextFilter(client: Client, databaseId: string, text: string): Promise<Record<string, unknown> | undefined>;
    queryDatabase(client: Client, databaseId: string, filter?: Record<string, unknown>, sorts?: unknown[]): Promise<unknown[]>;
    createDatabaseEntry(client: Client, databaseId: string, properties: Record<string, unknown>): Promise<unknown>;
    updateDatabaseEntry(client: Client, pageId: string, properties: Record<string, unknown>): Promise<unknown>;
    getPage(client: Client, pageId: string): Promise<unknown>;
    createPage(client: Client, parent: string | PageParent, title: string, blocks: ReturnType<typeof markdownToBlocks>, icon?: string, cover?: string): Promise<unknown>;
    updatePage(client: Client, pageId: string, props: {
        title?: string;
        icon?: string;
        cover?: string | {
            type: string;
            [key: string]: any;
        };
    }): Promise<unknown>;
    archivePage(client: Client, pageId: string): Promise<unknown>;
    restorePage(client: Client, pageId: string): Promise<unknown>;
    movePage(client: Client, pageId: string, newParentId: string): Promise<unknown>;
    listChildren(client: Client, blockId: string): Promise<unknown[]>;
    listComments(client: Client, pageId: string): Promise<unknown[]>;
    addComment(client: Client, pageId: string, richText: ReturnType<typeof blockTextToRichText>): Promise<unknown>;
    uploadFile(client: Client, fileUrl: string): Promise<{
        id: string;
        blockType: string;
    }>;
    paginatePageProperties(client: Client, page: unknown, opts: {
        maxPropertyItems: number;
        onlyTypes?: Array<"title" | "rich_text" | "relation" | "people">;
    }): Promise<{
        page: unknown;
        warnings: unknown[];
    }>;
    fetchBlocksRecursive(client: Client, pageId: string, ctx: FetchContext): Promise<unknown[]>;
    fetchBlocksWithLimit(client: Client, pageId: string, maxBlocks: number, ctx: FetchContext): Promise<{
        blocks: unknown[];
        hasMore: boolean;
    }>;
    processFileUploads(client: Client, markdown: string): Promise<string>;
    appendBlocks(client: Client, pageId: string, blocks: ReturnType<typeof markdownToBlocks>): Promise<unknown[]>;
    appendBlocksAfter(client: Client, pageId: string, blocks: ReturnType<typeof markdownToBlocks>, afterBlockId?: string): Promise<unknown[]>;
    deleteBlock(client: Client, blockId: string): Promise<unknown>;
    retrieveBlock(client: Client, blockId: string): Promise<unknown>;
    updateBlock(client: Client, blockId: string, payload: Record<string, unknown>): Promise<unknown>;
    replacePageMarkdown(client: Client, pageId: string, newStr: string, options?: {
        allowDeletingContent?: boolean;
    }): Promise<unknown>;
    retrieveMarkdown(client: Client, pageId: string): Promise<unknown>;
    updateMarkdown(client: Client, payload: Record<string, unknown>): Promise<unknown>;
};
export type CliDeps = {
    ops?: Partial<NotionOps>;
    configDir?: string;
};
export declare function runCli(argv: string[], partialIo?: Partial<CliIO>, deps?: CliDeps): Promise<number>;
export {};
