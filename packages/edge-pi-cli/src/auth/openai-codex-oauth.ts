/**
 * OpenAI Codex OAuth provider implementation.
 * Uses the OpenAI Device Code flow for ChatGPT subscription authentication.
 */

import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "./types.js";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ISSUER = "https://auth.openai.com";
const USERCODE_URL = `${ISSUER}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${ISSUER}/api/accounts/deviceauth/token`;
const TOKEN_URL = `${ISSUER}/oauth/token`;
const VERIFICATION_URL = `${ISSUER}/codex/device`;

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

async function loginOpenAICodex(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
	// Step 1: Request device code
	const userCodeResponse = await fetch(USERCODE_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({ client_id: CLIENT_ID }),
	});

	if (!userCodeResponse.ok) {
		throw new Error(`Device code request failed: ${await userCodeResponse.text()}`);
	}

	const userCodeData = (await userCodeResponse.json()) as {
		device_auth_id: string;
		user_code: string;
		interval: string | number;
	};

	const interval = (Number(userCodeData.interval) || 5) * 1000;

	// Step 2: Show verification URL and user code
	callbacks.onAuth({
		url: VERIFICATION_URL,
		instructions: `Enter code: ${userCodeData.user_code}`,
	});

	callbacks.onProgress?.("Waiting for browser authentication...");

	// Step 3: Poll for authorization code
	const maxWait = 15 * 60 * 1000;
	const expiresAt = Date.now() + maxWait;
	let authorizationCode: string | undefined;
	let codeVerifier: string | undefined;

	while (Date.now() < expiresAt) {
		await sleep(interval, callbacks.signal);

		const pollResponse = await fetch(DEVICE_TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				device_auth_id: userCodeData.device_auth_id,
				user_code: userCodeData.user_code,
			}),
		});

		if (pollResponse.ok) {
			const data = (await pollResponse.json()) as {
				authorization_code: string;
				code_challenge: string;
				code_verifier: string;
			};
			authorizationCode = data.authorization_code;
			codeVerifier = data.code_verifier;
			break;
		}

		// 403/404 = authorization pending, keep polling
		if (pollResponse.status === 403 || pollResponse.status === 404) {
			continue;
		}

		throw new Error(`Device auth failed with status ${pollResponse.status}`);
	}

	if (!authorizationCode || !codeVerifier) {
		throw new Error("Device code expired. Please try again.");
	}

	callbacks.onProgress?.("Exchanging code for tokens...");

	// Step 4: Exchange authorization code for tokens
	const redirectUri = `${ISSUER}/deviceauth/callback`;
	const tokenResponse = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: authorizationCode,
			redirect_uri: redirectUri,
			client_id: CLIENT_ID,
			code_verifier: codeVerifier,
		}).toString(),
	});

	if (!tokenResponse.ok) {
		throw new Error(`Token exchange failed: ${await tokenResponse.text()}`);
	}

	const tokens = (await tokenResponse.json()) as {
		access_token: string;
		refresh_token: string;
		id_token: string;
	};

	return {
		refresh: tokens.refresh_token,
		access: tokens.access_token,
		expires: Date.now() + 8 * 24 * 60 * 60 * 1000,
	};
}

async function refreshOpenAICodexToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_id: CLIENT_ID,
			grant_type: "refresh_token",
			refresh_token: credentials.refresh,
			scope: "openid profile email",
		}),
	});

	if (!response.ok) {
		throw new Error(`Token refresh failed: ${await response.text()}`);
	}

	const data = (await response.json()) as {
		access_token: string;
		refresh_token: string;
		id_token: string;
	};

	return {
		refresh: data.refresh_token,
		access: data.access_token,
		expires: Date.now() + 8 * 24 * 60 * 60 * 1000,
	};
}

/** The built-in OpenAI Codex OAuth provider. */
export const openaiCodexOAuthProvider: OAuthProviderInterface = {
	id: "openai-codex",
	name: "OpenAI (ChatGPT Plus/Pro)",
	login: loginOpenAICodex,
	refreshToken: refreshOpenAICodexToken,
	getApiKey: (cred) => cred.access,
};
