export interface ExecOptions {
	cwd?: string;
	timeoutSeconds?: number;
	abortSignal?: AbortSignal;
}

export interface ExecResult {
	output: string;
	exitCode: number | null;
	truncated: boolean;
	fullOutputRef?: string;
	timedOut: boolean;
	aborted: boolean;
}

export interface EdgePiFs {
	readFile(path: string): Promise<Uint8Array>;
	readFile(path: string, encoding: BufferEncoding): Promise<string>;
	writeFile(path: string, content: string | Uint8Array, encoding?: BufferEncoding): Promise<void>;
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
	readdir(path: string): Promise<string[]>;
	stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }>;
	access(path: string, mode?: number): Promise<void>;
	exists(path: string): Promise<boolean>;
}

export interface EdgePiPath {
	join(...parts: string[]): string;
	dirname(path: string): string;
	relative(from: string, to: string): string;
	resolve(...parts: string[]): string;
	isAbsolute(path: string): boolean;
	basename(path: string): string;
}

export interface EdgePiOs {
	homedir(): string;
	tmpdir(): string;
}

export interface EdgePiRuntime {
	exec(command: string, options?: ExecOptions): Promise<ExecResult>;
	fs: EdgePiFs;
	path: EdgePiPath;
	os: EdgePiOs;
}
