import { createHash, randomBytes } from "node:crypto";
import { env } from "../env.js";

/**
 * Google OAuth 2.0 — minimal authorization-code flow с PKCE без зависимостей.
 *
 * Endpoints из официальной discovery:
 *   https://accounts.google.com/.well-known/openid-configuration
 *
 * Захардкожены, чтобы не делать сетевой discovery на каждом холодном старте.
 */
const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
  picture?: string | null;
};

type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

function requireConfig(): GoogleConfig {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth is not configured (missing GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI)");
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI
  };
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  // PKCE S256: verifier = base64url(32 bytes), challenge = base64url(sha256(verifier)).
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildGoogleAuthUrl(params: {
  state: string;
  codeChallenge: string;
}): string {
  const cfg = requireConfig();
  const url = new URL(GOOGLE_AUTHORIZATION_URL);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeGoogleCode(params: {
  code: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; idToken: string | null }> {
  const cfg = requireConfig();
  const body = new URLSearchParams({
    code: params.code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
    code_verifier: params.codeVerifier
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as { access_token?: string; id_token?: string };
  if (!json.access_token) {
    throw new Error("Google token response missing access_token");
  }
  return { accessToken: json.access_token, idToken: json.id_token ?? null };
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google userinfo failed: ${response.status} ${text}`);
  }
  const json = (await response.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!json.sub || !json.email) {
    throw new Error("Google profile missing sub/email");
  }
  return {
    sub: json.sub,
    email: json.email,
    emailVerified: json.email_verified ?? false,
    name: json.name ?? null,
    picture: json.picture ?? null
  };
}
