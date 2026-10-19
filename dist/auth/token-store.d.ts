export interface TokenRecord {
    mcpToken: string;
    kind: "access" | "refresh";
    notionToken: string;
    refreshToken?: string;
    workspaceId?: string;
    clientId: string;
    scopes: string[];
    createdAt: number;
    expiresAt?: number;
}
export declare class TokenStore {
    private key;
    private dir;
    private tokensPath;
    private keyPath;
    constructor(dir?: string);
    init(): Promise<void>;
    private encrypt;
    private decrypt;
    private load;
    private save;
    storeToken(record: TokenRecord): Promise<void>;
    getByMcpToken(mcpToken: string): Promise<TokenRecord | undefined>;
    getByNotionToken(notionToken: string): Promise<TokenRecord | undefined>;
    deleteToken(mcpToken: string): Promise<void>;
    deleteByRefreshToken(refreshToken: string): Promise<void>;
}
