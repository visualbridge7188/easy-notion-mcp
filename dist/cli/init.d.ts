export type NotionProbe = {
    getMe(): Promise<unknown>;
    search(query: string, filter?: "pages" | "databases"): Promise<unknown[]>;
    getPage(id: string): Promise<unknown>;
};
export type InitFs = {
    exists(path: string): Promise<boolean>;
    mkdir(path: string, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    readdir(path: string, opts?: {
        withFileTypes?: boolean;
    }): Promise<any[]>;
    readFile(path: string): Promise<Buffer | string>;
    writeFile(path: string, data: string | Buffer): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    rm(path: string, opts?: {
        recursive?: boolean;
        force?: boolean;
    }): Promise<void>;
    stat(path: string): Promise<{
        isDirectory(): boolean;
    }>;
};
export type InitDeps = {
    io: {
        stdout: {
            write(str: string): unknown;
        };
        stderr: {
            write(str: string): unknown;
        };
    };
    prompt(question: string, opts?: {
        mask?: boolean;
    }): Promise<string>;
    confirm(question: string, defaultNo: boolean): Promise<boolean>;
    which(bin: string): Promise<string | null>;
    exec(cmd: string, args: string[]): Promise<{
        code: number;
        stdout: string;
        stderr: string;
    }>;
    openBrowser(url: string): Promise<void>;
    createClient(token: string): NotionProbe;
    fs: InitFs;
    skillsSourceDir: string;
    skillsTargetDir: string;
    isTTY: boolean;
    env: Record<string, string>;
};
export declare function runInit(args: string[], partialDeps?: Partial<InitDeps>): Promise<number>;
