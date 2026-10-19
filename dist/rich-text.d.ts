import type { NotionBlock, RichText, TextRichText } from "./types.js";
export declare const NOTION_RICH_TEXT_CONTENT_LIMIT = 2000;
type LooseRichText = {
    type?: unknown;
    mention?: unknown;
    text?: {
        content?: unknown;
        link?: TextRichText["text"]["link"];
    } | null;
    annotations?: RichText["annotations"];
    plain_text?: unknown;
    href?: unknown;
};
export declare function splitLongRichText(richText: LooseRichText[]): any[];
export declare function normalizeBlockRichTextForWrite(block: NotionBlock): NotionBlock;
export declare function normalizeBlockUpdatePayloadRichTextForWrite(payload: Record<string, unknown>): Record<string, unknown>;
export {};
