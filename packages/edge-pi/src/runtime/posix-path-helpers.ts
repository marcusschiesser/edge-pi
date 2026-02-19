export interface PosixPathHelpers {
	join(...parts: string[]): string;
	dirname(path: string): string;
	relative(from: string, to: string): string;
	resolve(...parts: string[]): string;
	isAbsolute(path: string): boolean;
	basename(path: string): string;
}

function normalizePathSeparators(value: string): string {
	return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function createPosixPathHelpers(): PosixPathHelpers {
	const join = (...parts: string[]): string => normalizePathSeparators(parts.filter(Boolean).join("/"));

	return {
		join,
		dirname: (targetPath: string) => {
			const normalized = normalizePathSeparators(targetPath);
			const pieces = normalized.split("/").filter((piece) => piece.length > 0);
			if (pieces.length <= 1) {
				return normalized.startsWith("/") ? "/" : ".";
			}
			const prefix = normalized.startsWith("/") ? "/" : "";
			return `${prefix}${pieces.slice(0, -1).join("/")}`;
		},
		relative: (from: string, to: string) => {
			const fromParts = normalizePathSeparators(from).split("/").filter(Boolean);
			const toParts = normalizePathSeparators(to).split("/").filter(Boolean);
			let index = 0;
			while (index < fromParts.length && index < toParts.length && fromParts[index] === toParts[index]) {
				index += 1;
			}
			const back = new Array(fromParts.length - index).fill("..");
			const next = toParts.slice(index);
			const value = [...back, ...next].join("/");
			return value.length > 0 ? value : ".";
		},
		resolve: (...parts: string[]) => {
			const normalized = normalizePathSeparators(parts.join("/"));
			const absolute = normalized.startsWith("/");
			const stack: string[] = [];
			for (const part of normalized.split("/")) {
				if (!part || part === ".") continue;
				if (part === "..") {
					stack.pop();
					continue;
				}
				stack.push(part);
			}
			const result = `${absolute ? "/" : ""}${stack.join("/")}`;
			return result || (absolute ? "/" : ".");
		},
		isAbsolute: (targetPath: string) => normalizePathSeparators(targetPath).startsWith("/"),
		basename: (targetPath: string) => {
			const normalized = normalizePathSeparators(targetPath).replace(/\/$/, "");
			const parts = normalized.split("/");
			return parts[parts.length - 1] || normalized;
		},
	};
}
