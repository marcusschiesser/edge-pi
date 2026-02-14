declare module "@webcontainer/api" {
	export interface WebContainerProcess {
		output: ReadableStream<string>;
		exit: Promise<number>;
		kill(): void;
	}

	export interface WebContainer {
		spawn(command: string, args?: string[], options?: { cwd?: string }): Promise<WebContainerProcess>;
		fs: {
			readFile(path: string): Promise<Uint8Array>;
			readFile(path: string, encoding: BufferEncoding): Promise<string>;
			writeFile(path: string, content: string | Uint8Array): Promise<void>;
			mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
			readdir(path: string): Promise<string[]>;
			stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }>;
		};
	}
}
