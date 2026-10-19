export type ProfileMode = "readonly" | "readwrite";
export type Profile = {
    token_env: string;
    mode: ProfileMode;
    root_page_id?: string;
};
export type ProfileConfig = {
    default?: string;
    profiles: Record<string, Profile>;
};
export type ResolvedProfile = {
    kind: "profile";
    name: string;
    profile: Profile;
    token: string;
    tokenEnv: string;
    rootPageId?: string;
} | {
    kind: "env";
    name: "NOTION_TOKEN";
    profile: {
        mode: "readwrite";
        token_env: "NOTION_TOKEN";
    };
    token: string;
    tokenEnv: "NOTION_TOKEN";
    rootPageId?: string;
};
export declare class CliError extends Error {
    readonly code: string;
    readonly exitCode: number;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, exitCode?: number, details?: Record<string, unknown> | undefined);
}
export declare function getConfigDir(env?: NodeJS.ProcessEnv): string;
export declare function getConfigPath(configDir: string): string;
export declare function sanitizeProfile(profile: Profile, env?: NodeJS.ProcessEnv): {
    root_page_id?: string | undefined;
    token_env: string;
    token_present: boolean;
    mode: ProfileMode;
};
export declare function configExists(configDir: string): boolean;
export declare function loadProfileConfig(configDir: string): Promise<ProfileConfig>;
export declare function saveProfileConfig(configDir: string, config: ProfileConfig): Promise<void>;
export declare function assertValidProfileName(name: string): void;
export declare function assertValidTokenEnv(name: string): void;
export declare function resolveProfileFromConfig(config: ProfileConfig, options: {
    requestedProfile?: string;
    env?: NodeJS.ProcessEnv;
    configFileExists: boolean;
    notionRootPageId?: string;
}): ResolvedProfile;
