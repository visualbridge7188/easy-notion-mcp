import { type ConversionOptions } from "./markdown-to-blocks.js";
/**
 * GFM-with-extensions → Notion Enhanced Markdown translator.
 *
 * Bridges this server's I/O dialect (GFM plus the conventions in CLAUDE.md
 * "Custom markdown conventions") to the dialect Notion's `pages.updateMarkdown`
 * actually parses (Enhanced / Notion-flavored Markdown, with XML-style tags
 * for callouts, toggles, columns, tables, mentions, ToC).
 *
 * Spec source: https://developers.notion.com/guides/data-apis/enhanced-markdown
 *
 * Live-probe ground truth (`scripts/bench/pr3-live-probes.ts`, findings memo
 * `.meta/research/pr3-live-probe-findings-2026-04-28.md`):
 * - `+++ Toggle`, `::: columns`, `> [!NOTE]`, `[toc]`, `$$equation$$`, bare-URL
 *   bookmarks all land as paragraphs/quotes when sent unmodified through
 *   `pages.updateMarkdown` with `replace_content`. Translation is mandatory.
 * - GFM-alerts (`> [!NOTE]`) → Enhanced `<callout>` mapping owned by us; spec
 *   does not auto-convert them.
 *
 * Design: re-use `markdownToBlocks` (our existing GFM-extensions parser) to
 * produce a `NotionBlock` tree, then serialize each block to Enhanced Markdown.
 * This sidesteps a fragile text-to-text translator and reuses the parser the
 * server has been hardened against for v0.1–v0.5.
 */
export type TranslateWarning = {
    code: "bookmark_lost_on_atomic_replace";
    url: string;
} | {
    code: "embed_lost_on_atomic_replace";
    url: string;
} | {
    code: "unrepresentable_block";
    type: string;
};
export type TranslateResult = {
    enhanced: string;
    warnings: TranslateWarning[];
};
/**
 * Translate a GFM-with-extensions markdown string to Notion Enhanced Markdown.
 * The output is suitable for `pages.updateMarkdown` with `replace_content`,
 * `insert_content`, or any other endpoint that consumes Enhanced Markdown.
 */
export declare function translateGfmToEnhancedMarkdown(markdown: string, options?: ConversionOptions): TranslateResult;
