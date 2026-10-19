import { Client } from "@notionhq/client";
import { readFile, realpath, stat } from "fs/promises";
import { basename, extname, isAbsolute, resolve as pathResolve, sep } from "path";
import { fileURLToPath } from "url";
import { NOTION_VERSION } from "./notion-version.js";
import { normalizeBlockRichTextForWrite, normalizeBlockUpdatePayloadRichTextForWrite, splitLongRichText, } from "./rich-text.js";
export function createNotionClient(token) {
    return new Client({ auth: token, notionVersion: NOTION_VERSION });
}
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const NOTION_BLOCK_CHILDREN_LIMIT = 100;
const MIME_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
    ".heic": "image/heic", ".bmp": "image/bmp", ".tiff": "image/tiff",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".m4a": "audio/mp4", ".flac": "audio/flac", ".aac": "audio/aac",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".pdf": "application/pdf", ".doc": "application/msword",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv", ".zip": "application/zip",
    ".md": "text/markdown", ".txt": "text/plain",
};
function getMimeType(filePath) {
    const ext = extname(filePath).toLowerCase();
    return MIME_TYPES[ext] ?? "application/octet-stream";
}
export async function resolveWorkspaceUploadPath(fileUrl) {
    const filePath = fileURLToPath(fileUrl);
    if (!isAbsolute(filePath)) {
        throw new Error(`uploadFile: file path must be absolute: ${filePath}`);
    }
    const workspaceRoot = process.env.NOTION_MCP_WORKSPACE_ROOT || process.cwd();
    let realFilePath;
    let realWorkspaceRoot;
    try {
        realFilePath = await realpath(pathResolve(filePath));
    }
    catch (err) {
        if (err?.code === "ENOENT") {
            throw new Error(`uploadFile: file not found: ${filePath}`);
        }
        throw err;
    }
    try {
        realWorkspaceRoot = await realpath(pathResolve(workspaceRoot));
    }
    catch {
        throw new Error(`uploadFile: configured workspace root does not resolve: ${workspaceRoot}`);
    }
    const rootWithSep = realWorkspaceRoot.endsWith(sep)
        ? realWorkspaceRoot
        : realWorkspaceRoot + sep;
    if (realFilePath !== realWorkspaceRoot &&
        !realFilePath.startsWith(rootWithSep)) {
        throw new Error(`uploadFile: file resolves outside the allowed workspace root: ${filePath}`);
    }
    const fileStat = await stat(realFilePath);
    if (!fileStat.isFile())
        throw new Error(`Not a regular file: ${filePath}`);
    if (fileStat.size > MAX_FILE_SIZE)
        throw new Error(`File too large (${Math.round(fileStat.size / 1024 / 1024)}MB). Max 20MB: ${filePath}`);
    return { filePath, realFilePath, fileStat };
}
function titleRichText(content) {
    return splitLongRichText([{ type: "text", text: { content } }]);
}
function emptyParagraphBlock() {
    return {
        type: "paragraph",
        paragraph: { rich_text: [] },
    };
}
function getBlockChildren(block) {
    const body = block[block.type];
    return Array.isArray(body?.children) ? body.children : [];
}
function withoutBlockChildren(block) {
    const body = { ...(block[block.type] ?? {}) };
    delete body.children;
    return { ...block, [block.type]: body };
}
function isOptionalChildrenContainer(block) {
    switch (block.type) {
        case "bulleted_list_item":
        case "numbered_list_item":
        case "to_do":
        case "toggle":
        case "callout":
            return true;
        case "heading_1":
            return block.heading_1.is_toggleable === true;
        case "heading_2":
            return block.heading_2.is_toggleable === true;
        case "heading_3":
            return block.heading_3.is_toggleable === true;
        default:
            return false;
    }
}
function canInlineChildrenInOneWrite(block) {
    if (!isOptionalChildrenContainer(block)) {
        return false;
    }
    const children = getBlockChildren(block);
    return children.length > 0 &&
        children.length <= NOTION_BLOCK_CHILDREN_LIMIT &&
        children.every((child) => getBlockChildren(child).length === 0);
}
function canUseAsColumnSeed(block) {
    return block.type !== "table" && block.type !== "column_list";
}
function usesPlaceholderColumnSeed(block) {
    if (block.type !== "column") {
        return false;
    }
    const firstChild = getBlockChildren(block)[0];
    return firstChild !== undefined && !canUseAsColumnSeed(firstChild);
}
function prepareBlockForWrite(block, atTopLevel = true) {
    block = normalizeBlockRichTextForWrite(block);
    if (isOptionalChildrenContainer(block)) {
        if (atTopLevel && canInlineChildrenInOneWrite(block)) {
            const body = { ...(block[block.type] ?? {}) };
            body.children = getBlockChildren(block).map((child) => prepareBlockForWrite(child, false));
            return { ...block, [block.type]: body };
        }
        return withoutBlockChildren(block);
    }
    if (block.type === "table") {
        const rows = getBlockChildren(block);
        const table = { ...block.table };
        delete table.children;
        if (rows.length > 0) {
            table.children = [prepareBlockForWrite(rows[0], false)];
        }
        return { ...block, table };
    }
    if (block.type === "column_list") {
        return {
            ...block,
            column_list: {
                ...block.column_list,
                children: getBlockChildren(block).map((child) => prepareBlockForWrite(child, false)),
            },
        };
    }
    if (block.type === "column") {
        const children = getBlockChildren(block);
        const column = { ...block.column };
        delete column.children;
        const seed = children[0] && canUseAsColumnSeed(children[0])
            ? children[0]
            : emptyParagraphBlock();
        column.children = [prepareBlockForWrite(seed, false)];
        return { ...block, column };
    }
    return block;
}
function needsDeferredChildWrites(block, atTopLevel = true) {
    const children = getBlockChildren(block);
    if (isOptionalChildrenContainer(block)) {
        if (children.length === 0) {
            return false;
        }
        if (atTopLevel && canInlineChildrenInOneWrite(block)) {
            return false;
        }
        return true;
    }
    if (block.type === "table") {
        return children.length > 1;
    }
    if (block.type === "column") {
        return usesPlaceholderColumnSeed(block) ||
            children.length > 1 ||
            (children[0] ? needsDeferredChildWrites(children[0], false) : false);
    }
    if (block.type === "column_list") {
        return children.some((child) => needsDeferredChildWrites(child, false));
    }
    return false;
}
async function requireCreatedChildId(client, parentId, index, context) {
    const children = await listChildren(client, parentId);
    const childId = children[index]?.id;
    if (typeof childId !== "string" || childId.length === 0) {
        throw new Error(`Notion append returned no id for ${context}`);
    }
    return childId;
}
async function appendDeferredChildren(client, blockId, sourceBlock) {
    const children = getBlockChildren(sourceBlock);
    if (isOptionalChildrenContainer(sourceBlock)) {
        if (children.length > 0) {
            await appendBlocks(client, blockId, children);
        }
        return;
    }
    if (sourceBlock.type === "table") {
        if (children.length > 1) {
            await appendBlocks(client, blockId, children.slice(1));
        }
        return;
    }
    if (sourceBlock.type === "column") {
        if (children.length === 0) {
            return;
        }
        if (usesPlaceholderColumnSeed(sourceBlock)) {
            await appendBlocks(client, blockId, children);
            return;
        }
        if (needsDeferredChildWrites(children[0], false)) {
            const firstChildId = await requireCreatedChildId(client, blockId, 0, "column child block");
            await appendDeferredChildren(client, firstChildId, children[0]);
        }
        if (children.length > 1) {
            await appendBlocks(client, blockId, children.slice(1));
        }
        return;
    }
    if (sourceBlock.type === "column_list") {
        const columns = children.filter((child) => child.type === "column");
        if (columns.length === 0 || !columns.some((column) => needsDeferredChildWrites(column, false))) {
            return;
        }
        const createdColumns = await listChildren(client, blockId);
        for (let index = 0; index < columns.length; index += 1) {
            if (!needsDeferredChildWrites(columns[index], false)) {
                continue;
            }
            const columnId = createdColumns[index]?.id;
            if (typeof columnId !== "string" || columnId.length === 0) {
                throw new Error("Notion append returned no id for column block");
            }
            await appendDeferredChildren(client, columnId, columns[index]);
        }
    }
}
async function appendPreparedBlocks(client, parentBlockId, blocks, afterBlockId) {
    const results = [];
    for (let index = 0; index < blocks.length; index += NOTION_BLOCK_CHILDREN_LIMIT) {
        const chunk = blocks.slice(index, index + NOTION_BLOCK_CHILDREN_LIMIT);
        const appendRequest = {
            block_id: parentBlockId,
            children: chunk.map((block) => prepareBlockForWrite(block)),
            ...(afterBlockId
                ? { position: { type: "after_block", after_block: { id: afterBlockId } } }
                : {}),
        };
        const response = await client.blocks.children.append(appendRequest);
        results.push(...response.results);
        if (response.results.length > 0) {
            afterBlockId = response.results[response.results.length - 1].id;
        }
        for (let offset = 0; offset < chunk.length; offset += 1) {
            if (!needsDeferredChildWrites(chunk[offset])) {
                continue;
            }
            const createdBlockId = response.results[offset]?.id;
            if (typeof createdBlockId !== "string" || createdBlockId.length === 0) {
                throw new Error("Notion append returned no id for child block");
            }
            await appendDeferredChildren(client, createdBlockId, chunk[offset]);
        }
    }
    return results;
}
const PROPERTY_PAGINATION_RUNAWAY_ERROR = "paginatePropertyValue: runaway loop detected (no progress)";
const VALID_SCHEMA_TYPES = [
    "title",
    "rich_text",
    "text",
    "number",
    "select",
    "multi_select",
    "status",
    "date",
    "checkbox",
    "url",
    "email",
    "phone",
    "formula",
    "rollup",
    "relation",
    "unique_id",
    "people",
    "files",
    "verification",
    "place",
    "location",
    "button",
    "created_time",
    "last_edited_time",
    "created_by",
    "last_edited_by",
];
const VALID_SCHEMA_TYPES_SET = new Set(VALID_SCHEMA_TYPES);
const RAW_PROPERTY_SHAPE_KEYS = new Set([
    "title",
    "rich_text",
    "number",
    "select",
    "multi_select",
    "status",
    "date",
    "checkbox",
    "url",
    "email",
    "phone_number",
    "formula",
    "rollup",
    "relation",
    "people",
    "files",
    "unique_id",
    "verification",
    "place",
    "button",
    "location",
    "created_time",
    "last_edited_time",
    "created_by",
    "last_edited_by",
    "name",
]);
const schemaCache = new Map();
const dataSourceIdCache = new Map();
const pageIdResolutionCache = new Map();
const SCHEMA_CACHE_TTL = 5 * 60 * 1000;
function isPaginatedPropertyType(type) {
    return type === "title" || type === "rich_text" || type === "relation" || type === "people";
}
function propertyItemValue(item, propertyType) {
    switch (propertyType) {
        case "title":
            return item.title;
        case "rich_text":
            return item.rich_text;
        case "relation":
            return item.relation;
        case "people":
            return item.people;
    }
}
export async function paginatePageProperties(client, page, opts) {
    if (!page?.properties) {
        return { page, warnings: [] };
    }
    const properties = page.properties;
    const nextProperties = { ...properties };
    const warnings = [];
    for (const [name, prop] of Object.entries(properties)) {
        const propertyType = prop?.type;
        if (!isPaginatedPropertyType(propertyType)) {
            continue;
        }
        if (opts.onlyTypes && !opts.onlyTypes.includes(propertyType)) {
            continue;
        }
        const values = prop[propertyType];
        if (!Array.isArray(values) || values.length !== 25) {
            continue;
        }
        const paginated = await paginatePropertyValue(client, page.id, prop.id, propertyType, opts.maxPropertyItems);
        nextProperties[name] = { ...prop, [propertyType]: paginated.values };
        if (paginated.truncatedAtCap) {
            warnings.push({
                name,
                type: propertyType,
                returned_count: paginated.values.length,
                cap: opts.maxPropertyItems,
            });
        }
    }
    return { page: { ...page, properties: nextProperties }, warnings };
}
async function paginatePropertyValue(client, pageId, propertyId, propertyType, cap) {
    const values = [];
    let cursor;
    while (true) {
        const request = {
            page_id: pageId,
            property_id: propertyId,
        };
        if (cursor !== undefined) {
            request.start_cursor = cursor;
        }
        const response = await client.pages.properties.retrieve(request);
        if (!Array.isArray(response?.results)) {
            throw new Error("paginatePropertyValue: expected paginated property results");
        }
        const hasMore = response.has_more === true;
        if (hasMore && response.results.length === 0) {
            throw new Error(PROPERTY_PAGINATION_RUNAWAY_ERROR);
        }
        const nextCursor = typeof response.next_cursor === "string" ? response.next_cursor : undefined;
        if (hasMore && (!nextCursor || nextCursor === cursor)) {
            throw new Error(PROPERTY_PAGINATION_RUNAWAY_ERROR);
        }
        values.push(...response.results.map((item) => propertyItemValue(item, propertyType)));
        if (cap > 0 && values.length >= cap) {
            return {
                values: values.slice(0, cap),
                truncatedAtCap: values.length > cap || hasMore,
            };
        }
        if (!hasMore) {
            return { values, truncatedAtCap: false };
        }
        cursor = nextCursor;
    }
}
/**
 * Resolve a database_id to its primary data_source_id.
 * Caches the mapping with the same TTL as schema cache.
 */
function isObjectNotFoundError(error) {
    const code = error?.body?.code ?? error?.code;
    return code === "object_not_found";
}
async function getDataSourceId(client, dbId) {
    const cached = dataSourceIdCache.get(dbId);
    if (cached && cached.expires > Date.now()) {
        return cached.dsId;
    }
    let db;
    try {
        db = await client.databases.retrieve({ database_id: dbId });
    }
    catch (error) {
        if (!isObjectNotFoundError(error)) {
            throw error;
        }
        const originalError = error;
        let probe;
        try {
            probe = await client.dataSources.retrieve({ data_source_id: dbId });
        }
        catch {
            throw originalError;
        }
        const parentId = probe.parent?.database_id;
        throw new Error(`ID ${dbId} is a data_source ID, not a database container ID. Pass the parent database ID${parentId ? ` (${parentId})` : ""}; use list_databases to find database container IDs.`);
    }
    const dsId = db.data_sources?.[0]?.id;
    if (!dsId) {
        throw new Error(`Database ${dbId} has no data sources`);
    }
    dataSourceIdCache.set(dbId, { dsId, expires: Date.now() + SCHEMA_CACHE_TTL });
    return dsId;
}
/** Canonical dashed Notion UUID: 8-4-4-4-12 hexadecimal characters. */
const DASHED_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The same UUID with the dashes removed. */
const BARE_UUID_RE = /^[0-9a-f]{32}$/i;
/**
 * Normalize a Notion ID for comparison. Notion UUIDs appear both dashed and
 * undashed, and in either case, so the two forms of one ID must compare equal.
 * Only those two forms are normalized. Any other string is returned unchanged,
 * so values that merely look ID-like stay distinct: `db-1` and `db1` remain
 * different keys, and a UUID with misplaced dashes cannot collide with a
 * canonical UUID's resolution-cache entry.
 */
function normalizeNotionId(id) {
    if (DASHED_UUID_RE.test(id)) {
        return id.replace(/-/g, "").toLowerCase();
    }
    if (BARE_UUID_RE.test(id)) {
        return id.toLowerCase();
    }
    return id;
}
/**
 * True when Notion rejected a databases.retrieve because the ID names a page.
 * Requires the structured error code and inspects both the response body
 * message and the top-level message; unrelated errors return false so callers
 * propagate them unchanged.
 */
function isPageNotDatabaseError(error) {
    const code = error?.body?.code ?? error?.code;
    if (code !== "validation_error") {
        return false;
    }
    const messages = [error?.body?.message, error?.message];
    return messages.some((message) => typeof message === "string" && /is a page, not a database/i.test(message));
}
/**
 * Resolve page_id alias to a database_id.
 * When page_id is a page containing exactly one inline database, resolves to that database.
 * When page_id is already a database ID, passes through.
 * Caches resolution results with the same TTL as schema/dataSourceId caches.
 */
export async function resolvePageIdAlias(client, args) {
    const { database_id, page_id } = args;
    const hasDatabaseId = database_id !== undefined;
    const hasPageId = page_id !== undefined;
    if (!hasDatabaseId && !hasPageId) {
        throw new Error("Pass exactly one of `database_id` or `page_id`.");
    }
    if (hasDatabaseId && (typeof database_id !== "string" || database_id.trim() === "")) {
        throw new Error("`database_id` must be a non-empty string.");
    }
    if (hasPageId && (typeof page_id !== "string" || page_id.trim() === "")) {
        throw new Error("`page_id` must be a non-empty string.");
    }
    if (hasDatabaseId && hasPageId) {
        if (normalizeNotionId(database_id) === normalizeNotionId(page_id)) {
            return database_id;
        }
        throw new Error("database_id and page_id refer to different objects. Pass exactly one.");
    }
    if (hasDatabaseId) {
        return database_id;
    }
    const pageId = page_id;
    const cacheKey = normalizeNotionId(pageId);
    const cached = pageIdResolutionCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
        return cached.dbId;
    }
    try {
        await client.databases.retrieve({ database_id: pageId });
        pageIdResolutionCache.set(cacheKey, { dbId: pageId, expires: Date.now() + SCHEMA_CACHE_TTL });
        return pageId;
    }
    catch (error) {
        if (!isPageNotDatabaseError(error)) {
            throw error;
        }
        // Drain every child block before deciding uniqueness. A single page of
        // results can hide a database past child 100, and can make a page with
        // two inline databases look unambiguous, which would cache the wrong
        // target for the mutating tools.
        const children = await listChildren(client, pageId);
        const dbs = children.filter((block) => block?.type === "child_database");
        if (dbs.length === 1) {
            const resolvedId = dbs[0].id;
            pageIdResolutionCache.set(cacheKey, { dbId: resolvedId, expires: Date.now() + SCHEMA_CACHE_TTL });
            return resolvedId;
        }
        if (dbs.length === 0) {
            throw new Error(`ID ${pageId} is a page, not a database. The page contains no inline database. Use list_databases to find the database container ID.`);
        }
        throw new Error(`ID ${pageId} is a page, not a database. The page contains ${dbs.length} inline databases. Pass one of: ` +
            dbs.map((block) => block.id + " (" + (block.child_database?.title ?? "untitled") + ")").join(", ") +
            ".");
    }
}
/**
 * Get cached schema (properties) for a database.
 * Database properties live on the data source, not the database container.
 */
export async function getCachedSchema(client, dbId) {
    const cached = schemaCache.get(dbId);
    if (cached && cached.expires > Date.now()) {
        return cached.schema;
    }
    const dsId = await getDataSourceId(client, dbId);
    const ds = await client.dataSources.retrieve({ data_source_id: dsId });
    schemaCache.set(dbId, { schema: ds, expires: Date.now() + SCHEMA_CACHE_TTL });
    return ds;
}
export async function uploadFile(client, fileUrl) {
    const { filePath, realFilePath } = await resolveWorkspaceUploadPath(fileUrl);
    const filename = basename(filePath);
    const contentType = getMimeType(filePath);
    const upload = await client.fileUploads.create({
        mode: "single_part",
        filename,
        content_type: contentType,
    });
    const buffer = await readFile(realFilePath);
    const blob = new Blob([buffer], { type: contentType });
    await client.fileUploads.send({
        file_upload_id: upload.id,
        file: { data: blob, filename },
    });
    const blockType = contentType.startsWith("image/") ? "image"
        : contentType.startsWith("audio/") ? "audio"
            : contentType.startsWith("video/") ? "video"
                : "file";
    return { id: upload.id, blockType };
}
export async function getDatabase(client, dbId) {
    const db = await client.databases.retrieve({ database_id: dbId });
    const ds = await getCachedSchema(client, dbId);
    const properties = Object.entries(ds.properties ?? {}).map(([name, config]) => {
        const prop = { name, type: config.type };
        if (config.type === "select" && config.select?.options) {
            prop.options = config.select.options.map((o) => o.name);
        }
        else if (config.type === "multi_select" && config.multi_select?.options) {
            prop.options = config.multi_select.options.map((o) => o.name);
        }
        else if (config.type === "status" && config.status?.options) {
            prop.options = config.status.options.map((o) => o.name);
        }
        else if (config.type === "formula" && config.formula?.expression !== undefined) {
            prop.expression = config.formula.expression;
        }
        else if (config.type === "relation") {
            if (config.relation?.data_source_id !== undefined) {
                prop.data_source_id = config.relation.data_source_id;
            }
            if (config.relation?.type !== undefined) {
                prop.relation_type = config.relation.type;
            }
        }
        else if (config.type === "rollup") {
            if (config.rollup?.function !== undefined) {
                prop.function = config.rollup.function;
            }
            if (config.rollup?.relation_property_name ?? config.rollup?.relation_property_id) {
                prop.relation_property =
                    config.rollup.relation_property_name ?? config.rollup.relation_property_id;
            }
            if (config.rollup?.rollup_property_name ?? config.rollup?.rollup_property_id) {
                prop.rollup_property =
                    config.rollup.rollup_property_name ?? config.rollup.rollup_property_id;
            }
        }
        else if (config.type === "unique_id" && config.unique_id?.prefix !== undefined) {
            prop.prefix = config.unique_id.prefix;
        }
        else if (config.type === "number" && config.number?.format !== undefined) {
            prop.format = config.number.format;
        }
        return prop;
    });
    return {
        id: db.id,
        title: db.title?.[0]?.plain_text ?? "",
        url: db.url,
        properties,
    };
}
export async function buildTextFilter(client, dbId, text) {
    const schema = await getCachedSchema(client, dbId);
    const props = schema.properties ?? {};
    const textTypes = ["title", "rich_text", "url", "email", "phone_number"];
    const textProps = Object.entries(props)
        .filter(([_, v]) => textTypes.includes(v.type))
        .map(([name, v]) => ({ property: name, [v.type]: { contains: text } }));
    if (textProps.length === 0)
        return undefined;
    if (textProps.length === 1)
        return textProps[0];
    return { or: textProps };
}
function validTypeList() {
    return VALID_SCHEMA_TYPES.join(", ");
}
function invalidSchemaTypeError(name, type) {
    return new Error(`Property "${name}" has type "${type}", which is not a valid Notion property type. ` +
        `Valid types: ${validTypeList()}.`);
}
function normalizeSchemaOptions(name, options) {
    if (options === undefined) {
        return undefined;
    }
    if (!Array.isArray(options)) {
        throw new Error(`Property "${name}" must provide options as an array.`);
    }
    return options.map((option) => {
        if (typeof option === "string") {
            return { name: option };
        }
        if (option && typeof option === "object" && !Array.isArray(option)) {
            const { name: optionName, color, description } = option;
            if (typeof optionName !== "string" || optionName.length === 0) {
                throw new Error(`Property "${name}" has an option without a valid name.`);
            }
            const normalized = { name: optionName };
            if (color !== undefined)
                normalized.color = color;
            if (description !== undefined)
                normalized.description = description;
            return normalized;
        }
        throw new Error(`Property "${name}" has an invalid option. Use a string or {name, color, description}.`);
    });
}
async function maybeResolveSchemaDataSourceId(client, value) {
    try {
        return await getDataSourceId(client, value);
    }
    catch {
        return value;
    }
}
async function resolveRelationDataSourceIds(client, schema, props) {
    for (const entry of schema) {
        if (entry.type !== "relation") {
            continue;
        }
        const dataSourceId = entry.data_source_id;
        if (typeof dataSourceId === "string" && props[entry.name]?.relation) {
            props[entry.name].relation.data_source_id = await maybeResolveSchemaDataSourceId(client, dataSourceId);
        }
    }
    return props;
}
function isSchemaShapePropertiesMap(properties) {
    return Object.values(properties).every((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return false;
        }
        const record = value;
        if (typeof record.type !== "string" || !VALID_SCHEMA_TYPES_SET.has(record.type)) {
            return false;
        }
        return !Object.keys(record).some((key) => key !== "type" && RAW_PROPERTY_SHAPE_KEYS.has(key));
    });
}
export function schemaToProperties(schema) {
    const props = {};
    for (const entry of schema) {
        const { name, type } = entry;
        switch (type) {
            case "title":
                props[name] = { title: {} };
                break;
            case "rich_text":
            case "text":
                props[name] = { rich_text: {} };
                break;
            case "number": {
                const format = entry.format;
                props[name] = { number: format !== undefined ? { format } : {} };
                break;
            }
            case "select": {
                const options = normalizeSchemaOptions(name, entry.options);
                props[name] = { select: options ? { options } : {} };
                break;
            }
            case "multi_select": {
                const options = normalizeSchemaOptions(name, entry.options);
                props[name] = { multi_select: options ? { options } : {} };
                break;
            }
            case "status": {
                const options = normalizeSchemaOptions(name, entry.options);
                props[name] = { status: options ? { options } : {} };
                break;
            }
            case "date":
                props[name] = { date: {} };
                break;
            case "checkbox":
                props[name] = { checkbox: {} };
                break;
            case "url":
                props[name] = { url: {} };
                break;
            case "email":
                props[name] = { email: {} };
                break;
            case "phone":
                props[name] = { phone_number: {} };
                break;
            case "formula":
                if (typeof entry.expression !== "string" || entry.expression.trim().length === 0) {
                    throw new Error(`Property "${name}" is a formula and requires a non-empty expression.`);
                }
                props[name] = { formula: { expression: entry.expression } };
                break;
            case "rollup":
                if (typeof entry.function !== "string" || entry.function.length === 0) {
                    throw new Error(`Property "${name}" is a rollup and requires a function.`);
                }
                if (typeof entry.relation_property !== "string" || entry.relation_property.length === 0) {
                    throw new Error(`Property "${name}" is a rollup and requires relation_property.`);
                }
                if (typeof entry.rollup_property !== "string" || entry.rollup_property.length === 0) {
                    throw new Error(`Property "${name}" is a rollup and requires rollup_property.`);
                }
                props[name] = {
                    rollup: {
                        function: entry.function,
                        relation_property_name: entry.relation_property,
                        rollup_property_name: entry.rollup_property,
                    },
                };
                break;
            case "relation": {
                if (typeof entry.data_source_id !== "string" || entry.data_source_id.length === 0) {
                    throw new Error(`Property "${name}" is a relation and requires data_source_id.`);
                }
                const relationType = entry.relation_type === "dual_property" ? "dual_property" : "single_property";
                props[name] = relationType === "dual_property"
                    ? {
                        relation: {
                            data_source_id: entry.data_source_id,
                            type: "dual_property",
                            dual_property: entry.synced_property_name !== undefined
                                ? { synced_property_name: entry.synced_property_name }
                                : {},
                        },
                    }
                    : {
                        relation: {
                            data_source_id: entry.data_source_id,
                            type: "single_property",
                            single_property: {},
                        },
                    };
                break;
            }
            case "unique_id":
                props[name] = { unique_id: entry.prefix !== undefined ? { prefix: entry.prefix } : {} };
                break;
            case "people":
                props[name] = { people: {} };
                break;
            case "files":
                props[name] = { files: {} };
                break;
            case "verification":
                props[name] = { verification: {} };
                break;
            case "place":
                props[name] = { place: {} };
                break;
            case "location":
                props[name] = { location: {} };
                break;
            case "button":
                props[name] = { button: {} };
                break;
            case "created_time":
                props[name] = { created_time: {} };
                break;
            case "last_edited_time":
                props[name] = { last_edited_time: {} };
                break;
            case "created_by":
                props[name] = { created_by: {} };
                break;
            case "last_edited_by":
                props[name] = { last_edited_by: {} };
                break;
            default:
                throw invalidSchemaTypeError(name, type);
        }
    }
    return props;
}
/** @internal Exported for test seams; not part of the public API contract. */
export function convertPropertyValue(type, key, value) {
    switch (type) {
        case "title":
            return { title: titleRichText(String(value)) };
        case "rich_text":
            return { rich_text: titleRichText(String(value)) };
        case "number":
            return { number: Number(value) };
        case "select":
            return { select: { name: String(value) } };
        case "multi_select":
            return {
                multi_select: (Array.isArray(value) ? value : [value]).map((item) => ({
                    name: String(item),
                })),
            };
        case "date":
            return { date: { start: String(value) } };
        case "checkbox":
            return { checkbox: Boolean(value) };
        case "url":
            return { url: String(value) };
        case "email":
            return { email: String(value) };
        case "phone_number":
            return { phone_number: String(value) };
        case "status":
            return { status: { name: String(value) } };
        case "relation":
            return {
                relation: (Array.isArray(value) ? value : [value])
                    .filter((id) => id)
                    .map((id) => ({ id: String(id) })),
            };
        case "people":
            return {
                people: (Array.isArray(value) ? value : [value])
                    .filter((id) => id)
                    .map((id) => ({ id: String(id) })),
            };
        case "files":
            throw new Error(`Property '${key}' has type '${type}'. ` +
                `easy-notion-mcp does not support writing '${type}' properties yet. ` +
                `Tracked task: notion-files-value-write. Only external URL writes are planned. ` +
                `Remove '${key}' from the payload, or set this field in the Notion UI.`);
        case "formula":
        case "rollup":
        case "created_time":
        case "last_edited_time":
        case "created_by":
        case "last_edited_by":
        case "unique_id":
            throw new Error(`Property '${key}' has type '${type}'. ` +
                `This type is computed by Notion and cannot be set via API. ` +
                `Remove '${key}' from the payload; Notion populates the value automatically.`);
        case "verification":
            throw new Error(`Property '${key}' has type '${type}'. ` +
                `easy-notion-mcp does not support writing '${type}' properties yet. ` +
                `Tracked task: notion-verification-value-write. ` +
                `Remove '${key}' from the payload, or set this field in the Notion UI.`);
        case "place":
        case "location":
            throw new Error(`Property '${key}' has type '${type}'. ` +
                `This type is computed by Notion or not yet supported for writes. ` +
                `Remove '${key}' from the payload for now.`);
        case "button":
            throw new Error(`Property '${key}' has type '${type}'. ` +
                `This type is trigger-only; buttons have no write value. ` +
                `Remove '${key}' from the payload for now.`);
        default:
            throw new Error(`Property '${key}' has type '${type}', which this server does not recognize. ` +
                `Remove '${key}' from the payload for now, or set it in the Notion UI. ` +
                `If this is a new Notion property type, file an issue at the easy-notion-mcp repository.`);
    }
}
async function convertPropertyValues(client, dbId, values) {
    let ds = (await getCachedSchema(client, dbId));
    const quoted = (ks) => ks.map((k) => `'${k}'`).join(", ");
    let unknownKeys = Object.keys(values).filter((k) => !(k in (ds.properties ?? {})));
    if (unknownKeys.length > 0) {
        // Cache may be stale (5-minute TTL); a user who just added a property in
        // the Notion UI would otherwise be told their new key is unknown. Bust
        // and refetch ONCE before throwing so the error reflects reality.
        schemaCache.delete(dbId);
        ds = (await getCachedSchema(client, dbId));
        unknownKeys = Object.keys(values).filter((k) => !(k in (ds.properties ?? {})));
    }
    if (unknownKeys.length > 0) {
        const validKeys = Object.keys(ds.properties ?? {});
        throw new Error(`Unknown property name(s): ${quoted(unknownKeys)}. ` +
            `Valid property names for this database: ${quoted(validKeys)}. ` +
            `Property names are case-sensitive.`);
    }
    const result = {};
    for (const [key, value] of Object.entries(values)) {
        const propConfig = ds.properties[key];
        result[key] = convertPropertyValue(propConfig.type, key, value);
    }
    return result;
}
export async function createPage(client, parent, title, blocks, icon, cover) {
    const resolvedParent = typeof parent === "string"
        ? { type: "page_id", page_id: parent }
        : parent;
    const initialBlocks = blocks.slice(0, NOTION_BLOCK_CHILDREN_LIMIT);
    const initialBlocksNeedDeferredWrites = initialBlocks.some((block) => needsDeferredChildWrites(block));
    const page = await client.pages.create({
        parent: resolvedParent,
        properties: {
            title: {
                title: titleRichText(title),
            },
        },
        children: initialBlocks.map((block) => prepareBlockForWrite(block)),
        ...(icon ? { icon: { type: "emoji", emoji: icon } } : {}),
        ...(cover ? { cover: { type: "external", external: { url: cover } } } : {}),
    });
    const remainingBlocks = blocks.slice(NOTION_BLOCK_CHILDREN_LIMIT);
    if (initialBlocksNeedDeferredWrites || remainingBlocks.length > 0) {
        try {
            if (initialBlocksNeedDeferredWrites) {
                const createdInitialBlocks = await listChildren(client, page.id);
                for (let index = 0; index < initialBlocks.length; index += 1) {
                    if (!needsDeferredChildWrites(initialBlocks[index])) {
                        continue;
                    }
                    const createdBlockId = createdInitialBlocks[index]?.id;
                    if (typeof createdBlockId !== "string" || createdBlockId.length === 0) {
                        throw new Error("Notion page creation returned no id for child block");
                    }
                    await appendDeferredChildren(client, createdBlockId, initialBlocks[index]);
                }
            }
            if (remainingBlocks.length > 0) {
                await appendBlocks(client, page.id, remainingBlocks);
            }
        }
        catch (error) {
            try {
                await client.pages.update({ page_id: page.id, in_trash: true });
            }
            catch {
                // Best-effort rollback: preserve the append failure as the caller-visible error.
            }
            throw error;
        }
    }
    return page;
}
export async function findWorkspacePages(client, limit = 5) {
    const pages = [];
    let start_cursor;
    do {
        const response = await client.search({
            filter: { property: "object", value: "page" },
            sort: { timestamp: "last_edited_time", direction: "descending" },
            start_cursor,
            page_size: 20,
        });
        for (const page of response.results) {
            if (page.parent?.type !== "workspace") {
                continue;
            }
            const titleProperty = Object.values(page.properties ?? {}).find((property) => property?.type === "title");
            const title = (titleProperty?.title ?? [])
                .map((item) => item.plain_text ?? item.text?.content ?? "")
                .join("");
            pages.push({ id: page.id, title: title || "Untitled" });
            if (pages.length >= limit) {
                return pages;
            }
        }
        start_cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (start_cursor);
    return pages;
}
export async function appendBlocks(client, pageId, blocks) {
    return appendPreparedBlocks(client, pageId, blocks);
}
export async function appendBlocksAfter(client, pageId, blocks, afterBlockId) {
    return appendPreparedBlocks(client, pageId, blocks, afterBlockId);
}
export async function listChildren(client, blockId) {
    const results = [];
    let start_cursor;
    do {
        const response = await client.blocks.children.list({
            block_id: blockId,
            start_cursor,
            page_size: 100,
        });
        results.push(...response.results);
        start_cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (start_cursor);
    return results;
}
export async function deleteBlock(client, blockId) {
    return client.blocks.delete({ block_id: blockId });
}
export async function retrieveBlock(client, blockId) {
    return client.blocks.retrieve({ block_id: blockId });
}
export async function replacePageMarkdown(client, pageId, newStr, options = {}) {
    return client.pages.updateMarkdown({
        page_id: pageId,
        type: "replace_content",
        replace_content: {
            new_str: newStr,
            allow_deleting_content: options.allowDeletingContent ?? true,
        },
    });
}
export async function updateBlock(client, blockId, payload) {
    return client.blocks.update({
        block_id: blockId,
        ...normalizeBlockUpdatePayloadRichTextForWrite(payload),
    });
}
export async function getPage(client, pageId) {
    return client.pages.retrieve({ page_id: pageId });
}
export async function updatePage(client, pageId, props) {
    const payload = {};
    if (props.title) {
        payload.properties = {
            title: {
                title: titleRichText(props.title),
            },
        };
    }
    if (props.icon) {
        payload.icon = { type: "emoji", emoji: props.icon };
    }
    if (props.cover) {
        if (typeof props.cover === "string") {
            payload.cover = { type: "external", external: { url: props.cover } };
        }
        else {
            payload.cover = props.cover;
        }
    }
    return client.pages.update({
        page_id: pageId,
        ...payload,
    });
}
export async function archivePage(client, pageId) {
    return client.pages.update({ page_id: pageId, in_trash: true });
}
export async function restorePage(client, pageId) {
    return client.pages.update({ page_id: pageId, in_trash: false });
}
export async function movePage(client, pageId, newParentId) {
    return client.pages.move({
        page_id: pageId,
        parent: { page_id: newParentId },
    });
}
export async function searchNotion(client, query, filter) {
    const results = [];
    let start_cursor;
    do {
        const response = await client.search({
            query,
            start_cursor,
            page_size: 100,
            ...(filter
                ? {
                    filter: {
                        property: "object",
                        value: filter === "pages" ? "page" : "data_source",
                    },
                }
                : {}),
        });
        results.push(...response.results);
        start_cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (start_cursor);
    return results;
}
export async function createDatabase(client, parentId, title, schema, options) {
    const properties = await resolveRelationDataSourceIds(client, schema, schemaToProperties(schema));
    return client.databases.create({
        parent: { type: "page_id", page_id: parentId },
        title: titleRichText(title),
        initial_data_source: { properties },
        ...(options?.is_inline !== undefined ? { is_inline: options.is_inline } : {}),
    });
}
export async function updateDataSource(client, databaseId, updates) {
    const warnings = [];
    if (updates.title === undefined &&
        updates.properties === undefined &&
        updates.in_trash === undefined) {
        throw new Error("updateDataSource: at least one of `title`, `properties`, or `in_trash` must be provided");
    }
    const dataSourceId = await getDataSourceId(client, databaseId);
    const body = { data_source_id: dataSourceId };
    if (updates.title !== undefined)
        body.title = titleRichText(updates.title);
    if (updates.properties !== undefined) {
        const rawProperties = updates.properties;
        const schemaEntries = Object.entries(rawProperties).map(([name, value]) => ({ name, ...value }));
        body.properties = isSchemaShapePropertiesMap(rawProperties)
            ? await resolveRelationDataSourceIds(client, schemaEntries, schemaToProperties(schemaEntries))
            : updates.properties;
        const currentSchema = await getCachedSchema(client, databaseId);
        const resolvedProperties = body.properties;
        for (const [name, value] of Object.entries(resolvedProperties)) {
            if (value === null || typeof value !== "object") {
                continue;
            }
            for (const optionType of ["select", "multi_select", "status"]) {
                const optionPayload = value[optionType];
                if (!Array.isArray(optionPayload?.options)) {
                    continue;
                }
                const newIdentifiers = new Set();
                for (const option of optionPayload.options) {
                    if (typeof option?.name === "string")
                        newIdentifiers.add(option.name);
                    if (typeof option?.id === "string")
                        newIdentifiers.add(option.id);
                }
                const currentOptions = currentSchema.properties?.[name]?.[optionType]?.options ?? [];
                const removed = currentOptions
                    .filter((option) => (typeof option?.name === "string" &&
                    !newIdentifiers.has(option.name) &&
                    (typeof option?.id !== "string" || !newIdentifiers.has(option.id))))
                    .map((option) => option.name);
                if (removed.length > 0) {
                    warnings.push({ code: "data_source_options_removed", property: name, removed });
                }
            }
        }
    }
    if (updates.in_trash !== undefined)
        body.in_trash = updates.in_trash;
    const result = await client.dataSources.update(body);
    schemaCache.delete(databaseId);
    return { result, warnings };
}
export async function queryDatabase(client, dbId, filter, sorts) {
    const dsId = await getDataSourceId(client, dbId);
    const results = [];
    let start_cursor;
    do {
        const response = await client.dataSources.query({
            data_source_id: dsId,
            start_cursor,
            page_size: 100,
            ...(filter ? { filter: filter } : {}),
            ...(sorts ? { sorts: sorts } : {}),
        });
        results.push(...response.results);
        start_cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (start_cursor);
    return results;
}
export async function listViews(client, params, options = {}) {
    const result = await client.views.list(params);
    if (options.includeConfig)
        return result;
    return {
        object: result.object,
        results: (result.results ?? []).map(compactView),
        next_cursor: result.next_cursor,
        has_more: result.has_more,
    };
}
export async function getView(client, viewId, options = {}) {
    const result = await client.views.retrieve({ view_id: viewId });
    if (options.includeConfig)
        return result;
    return compactView(result);
}
export function compactView(view) {
    return {
        id: view?.id,
        object: view?.object,
        ...(view?.name !== undefined ? { name: view.name } : {}),
        ...(view?.type !== undefined ? { type: view.type } : {}),
        ...(view?.url !== undefined ? { url: view.url } : {}),
        ...(view?.data_source_id !== undefined ? { data_source_id: view.data_source_id } : {}),
    };
}
export async function createView(client, input) {
    const dataSourceId = await getDataSourceId(client, input.database_id);
    const body = {
        database_id: input.database_id,
        data_source_id: dataSourceId,
        name: input.name,
        type: input.type,
    };
    if (input.filter !== undefined)
        body.filter = input.filter;
    if (input.sorts !== undefined)
        body.sorts = input.sorts;
    if (input.quick_filters !== undefined)
        body.quick_filters = input.quick_filters;
    if (input.configuration !== undefined)
        body.configuration = input.configuration;
    if (input.position !== undefined)
        body.position = input.position;
    // Live create-view needs database_id, while the generated SDK layer still
    // requires data_source_id. Send both after resolving the database's primary
    // data source.
    const result = await client.views.create(body);
    return compactView(result);
}
export async function updateView(client, viewId, updates) {
    const body = { view_id: viewId };
    for (const key of ["name", "filter", "sorts", "quick_filters", "configuration"]) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            body[key] = updates[key];
        }
    }
    const result = await client.views.update(body);
    return compactView(result);
}
export async function deleteView(client, viewId) {
    const result = await client.views.delete({ view_id: viewId });
    return {
        success: true,
        deleted: viewId,
        view: compactView(result),
    };
}
export async function queryView(client, viewId, options = {}) {
    const query = await client.views.queries.create({
        view_id: viewId,
        ...(options.page_size !== undefined ? { page_size: options.page_size } : {}),
    });
    try {
        const results = await client.views.queries.results({
            view_id: viewId,
            query_id: query.id,
            ...(options.page_size !== undefined ? { page_size: options.page_size } : {}),
            ...(options.start_cursor !== undefined ? { start_cursor: options.start_cursor } : {}),
        });
        // Return only the curated results payload. The transient view-query object
        // is an internal implementation detail (a throwaway query we create and
        // immediately delete) and must not leak into the tool's response contract.
        return results;
    }
    finally {
        await client.views.queries.delete({ view_id: viewId, query_id: query.id });
    }
}
export async function listComments(client, pageId) {
    const results = [];
    let start_cursor;
    do {
        const response = await client.comments.list({
            block_id: pageId,
            start_cursor,
            page_size: 100,
        });
        results.push(...response.results);
        start_cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (start_cursor);
    return results;
}
export async function addComment(client, pageId, richText) {
    return client.comments.create({
        parent: { page_id: pageId },
        rich_text: splitLongRichText(richText),
    });
}
export async function createDatabaseEntry(client, dbId, properties) {
    const dsId = await getDataSourceId(client, dbId);
    const convertedProperties = await convertPropertyValues(client, dbId, properties);
    return client.pages.create({
        parent: { data_source_id: dsId },
        properties: convertedProperties,
    });
}
export async function updateDatabaseEntry(client, pageId, properties) {
    const page = (await client.pages.retrieve({ page_id: pageId }));
    // Support both old (database_id) and new (data_source_id) parent types
    const dbId = page.parent?.type === "database_id"
        ? page.parent.database_id
        : page.parent?.type === "data_source_id"
            ? page.parent.database_id // data_source parent also exposes database_id
            : null;
    if (!dbId) {
        throw new Error("Page is not part of a database");
    }
    const convertedProperties = await convertPropertyValues(client, dbId, properties);
    return client.pages.update({
        page_id: pageId,
        properties: convertedProperties,
    });
}
export async function listUsers(client) {
    const results = [];
    let start_cursor;
    do {
        const response = await client.users.list({
            start_cursor,
            page_size: 100,
        });
        results.push(...response.results);
        start_cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (start_cursor);
    return results;
}
export async function getMe(client) {
    return client.users.me({});
}
/** @internal */
export { paginatePropertyValue };
