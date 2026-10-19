#!/usr/bin/env node
import "dotenv/config";
import express from "express";
export interface CreateAppOptions {
    notionToken?: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthRedirectUri?: string;
    rootPageId?: string;
    trustContent?: boolean;
    /**
     * Shared-secret bearer required on every /mcp request in static-token HTTP mode.
     * Required when neither oauthClientId nor oauthClientSecret is set.
     * Not used in OAuth mode (OAuth issues its own bearers).
     */
    bearer?: string;
}
/**
 * Resolve the bind host for the HTTP server.
 * Default is `127.0.0.1` (loopback only); set `NOTION_MCP_BIND_HOST` to change it
 * (e.g. `0.0.0.0` for all interfaces, or a specific interface IP).
 */
export declare function getBindHost(env: NodeJS.ProcessEnv): string;
/**
 * Create the Express app with MCP endpoints.
 * Exported so integration tests can use it without starting a real server.
 */
export declare function createApp(options?: CreateAppOptions): Promise<express.Express>;
