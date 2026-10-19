import type { Client } from "@notionhq/client";
export type FileUploadTransport = "stdio" | "http";
export declare const FILE_SCHEME_HTTP_ERROR = "file:// URLs are only supported in stdio transport, where the server runs on your machine. In HTTP mode, host the file at an HTTPS URL and use that instead.";
export declare const DRY_RUN_FILE_UPLOAD_ERROR = "dry-run cannot validate file uploads without creating Notion uploads. Use HTTPS URLs or run without dry-run.";
type CodeRange = {
    start: number;
    end: number;
};
export type FileUploadReference = {
    full: string;
    url: string;
    start: number;
};
export declare function getCodeRanges(markdown: string): CodeRange[];
export declare function detectFileUploadReferences(markdown: string): FileUploadReference[];
export declare function processFileUploads(client: Client, markdown: string, transport: FileUploadTransport): Promise<string>;
export {};
