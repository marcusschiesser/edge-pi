export interface WorkspacePathResolverOptions {
	rootdir: string;
	resolvePath: (...parts: string[]) => string;
	finalizeAbsolute?: (absolutePath: string) => string;
}

function normalizePathSeparators(value: string): string {
	return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function createWorkspacePathResolver(
	options: WorkspacePathResolverOptions,
): (targetPath: string, resolveOptions?: { cwd?: string }) => string {
	const { rootdir, resolvePath, finalizeAbsolute } = options;
	const rootdirWithoutLeadingSlash = rootdir.startsWith("/") ? rootdir.slice(1) : rootdir;

	const resolveWorkspacePath = (targetPath: string, resolveOptions?: { cwd?: string }): string => {
		const normalized = normalizePathSeparators(targetPath);
		if (normalized === "~") {
			return rootdir;
		}
		if (normalized.startsWith("~/")) {
			return resolvePath(rootdir, normalized.slice(2));
		}

		if (normalized === rootdirWithoutLeadingSlash || normalized.startsWith(`${rootdirWithoutLeadingSlash}/`)) {
			return rootdir.startsWith("/") ? `/${normalized}` : normalized;
		}

		if (normalized.startsWith("/")) {
			const rootdirPrefix = rootdir.endsWith("/") ? rootdir : `${rootdir}/`;
			const nestedIndex = normalized.indexOf(rootdirPrefix);
			if (nestedIndex > 0) {
				return normalized.slice(nestedIndex);
			}
			return finalizeAbsolute ? finalizeAbsolute(normalized) : normalized;
		}

		const baseCwd = resolveOptions?.cwd ? resolveWorkspacePath(resolveOptions.cwd) : rootdir;
		return resolvePath(baseCwd, normalized);
	};

	return resolveWorkspacePath;
}
