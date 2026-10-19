import type { Response, Request } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { TokenStore } from "./token-store.js";
export interface NotionOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}
export declare class NotionOAuthProvider implements OAuthServerProvider {
    readonly clientsStore: OAuthRegisteredClientsStore;
    /**
     * Pending auth sessions: sessionId -> AuthSession
     * (between /authorize redirect to Notion and /callback return)
     */
    private authSessions;
    /**
     * Pending authorization codes: our auth code -> PendingCode
     * (between /callback and token exchange)
     */
    private pendingCodes;
    private tokenStore;
    private config;
    constructor(tokenStore: TokenStore, config: NotionOAuthConfig);
    /**
     * Redirect user to Notion OAuth consent screen.
     * The `res` is an Express Response object.
     */
    authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void>;
    /**
     * Handle Notion's OAuth callback.
     * This is mounted as a separate Express route (NOT part of mcpAuthRouter).
     */
    handleNotionCallback(req: Request, res: Response): Promise<void>;
    /**
     * Return the PKCE code_challenge for this authorization code.
     * Called by the SDK's token handler for local PKCE validation.
     */
    challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string>;
    /**
     * Exchange our auth code for MCP bearer tokens.
     * The SDK has already validated PKCE by this point.
     */
    exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, _redirectUri?: string, _resource?: URL): Promise<OAuthTokens>;
    /**
     * Exchange an MCP refresh token for a new MCP access token.
     */
    exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, _scopes?: string[], _resource?: URL): Promise<OAuthTokens>;
    /**
     * Verify an MCP bearer token and return AuthInfo.
     * Attaches the Notion token in `extra.notionToken` for the HTTP handler.
     */
    verifyAccessToken(token: string): Promise<AuthInfo>;
    /**
     * Revoke an MCP token.
     */
    revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void>;
    /**
     * Clean up expired auth sessions and pending codes (call periodically).
     */
    cleanup(): void;
}
