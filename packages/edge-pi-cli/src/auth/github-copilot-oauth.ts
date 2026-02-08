/**
 * GitHub Copilot OAuth provider implementation.
 * Uses the GitHub Device Code flow followed by Copilot token exchange.
 */

import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "./types.js";

const CLIENT_ID = "Iv1.b507a08c87ecfe98";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";

interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	interval: number;
	expires_in: number;
}

interface CopilotTokenResponse {
	token: string;
	expires_at: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Login cancelled"));
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new Error("Login cancelled"));
			},
			{ once: true },
		);
	});
}

async function exchangeForCopilotToken(githubAccessToken: string): Promise<{ token: string; expires: number }> {
	const response = await fetch(COPILOT_TOKEN_URL, {
		headers: {
			Authorization: `token ${githubAccessToken}`,
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Copilot token exchange failed (${response.status}): ${text}`);
	}

	const data = (await response.json()) as CopilotTokenResponse;
	return {
		token: data.token,
		// expires_at is a Unix timestamp in seconds
		expires: data.expires_at * 1000 - 60 * 1000,
	};
}

async function loginGitHubCopilot(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
	// Step 1: Request device code
	const deviceResponse = await fetch(DEVICE_CODE_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: CLIENT_ID,
			scope: "user:email",
		}),
	});

	if (!deviceResponse.ok) {
		throw new Error(`Device code request failed: ${await deviceResponse.text()}`);
	}

	const deviceData = (await deviceResponse.json()) as DeviceCodeResponse;

	// Step 2: Show verification URL and user code
	callbacks.onAuth({
		url: deviceData.verification_uri,
		instructions: `Enter code: ${deviceData.user_code}`,
	});

	callbacks.onProgress?.("Waiting for browser authentication...");

	// Step 3: Poll for access token
	const interval = (deviceData.interval || 5) * 1000;
	const expiresAt = Date.now() + deviceData.expires_in * 1000;
	let githubAccessToken: string | undefined;

	while (Date.now() < expiresAt) {
		await sleep(interval, callbacks.signal);

		const tokenResponse = await fetch(ACCESS_TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				client_id: CLIENT_ID,
				device_code: deviceData.device_code,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}),
		});

		const tokenData = (await tokenResponse.json()) as {
			access_token?: string;
			error?: string;
		};

		if (tokenData.access_token) {
			githubAccessToken = tokenData.access_token;
			break;
		}

		if (tokenData.error === "authorization_pending") {
			continue;
		}

		if (tokenData.error === "slow_down") {
			await sleep(5000, callbacks.signal);
			continue;
		}

		if (tokenData.error === "expired_token") {
			throw new Error("Device code expired. Please try again.");
		}

		if (tokenData.error === "access_denied") {
			throw new Error("Authorization was denied.");
		}

		if (tokenData.error) {
			throw new Error(`OAuth error: ${tokenData.error}`);
		}
	}

	if (!githubAccessToken) {
		throw new Error("Device code expired. Please try again.");
	}

	callbacks.onProgress?.("Exchanging token for Copilot access...");

	// Step 4: Exchange GitHub token for Copilot session token
	const copilot = await exchangeForCopilotToken(githubAccessToken);

	return {
		refresh: githubAccessToken,
		access: copilot.token,
		expires: copilot.expires,
	};
}

async function refreshCopilotToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
	const copilot = await exchangeForCopilotToken(credentials.refresh);

	return {
		refresh: credentials.refresh,
		access: copilot.token,
		expires: copilot.expires,
	};
}

/** The built-in GitHub Copilot OAuth provider. */
export const githubCopilotOAuthProvider: OAuthProviderInterface = {
	id: "github-copilot",
	name: "GitHub Copilot",
	login: loginGitHubCopilot,
	refreshToken: refreshCopilotToken,
	getApiKey: (cred) => cred.access,
};
