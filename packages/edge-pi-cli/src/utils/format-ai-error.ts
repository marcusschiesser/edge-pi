type MaybeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MaybeRecord {
	return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function extractNestedError(error: unknown): unknown {
	if (!isRecord(error)) return undefined;
	if (Array.isArray(error.errors) && error.errors.length > 0) {
		return error.errors[error.errors.length - 1];
	}
	if ("lastError" in error) {
		return error.lastError;
	}
	if ("cause" in error) {
		return error.cause;
	}
	return undefined;
}

function formatErrorDetails(error: unknown): string[] {
	if (!isRecord(error)) return [];

	const details: string[] = [];
	const statusCode = getNumber(error.statusCode);
	const responseBody = getString(error.responseBody);
	const url = getString(error.url);

	if (statusCode !== undefined) {
		details.push(`status ${statusCode}`);
	}
	if (url) {
		details.push(url);
	}
	if (responseBody) {
		details.push(responseBody);
	}

	const data = error.data;
	if (!responseBody && data !== undefined) {
		try {
			details.push(JSON.stringify(data));
		} catch {
			// Ignore non-serializable data
		}
	}

	return details;
}

export function formatAIError(error: unknown): string {
	const rootMessage = error instanceof Error ? error.message : String(error);

	const firstLevel = formatErrorDetails(error);
	if (firstLevel.length > 0) {
		return `${rootMessage}\n${firstLevel.join("\n")}`;
	}

	const nested = extractNestedError(error);
	const nestedDetails = formatErrorDetails(nested);
	if (nestedDetails.length > 0) {
		return `${rootMessage}\n${nestedDetails.join("\n")}`;
	}

	return rootMessage;
}
