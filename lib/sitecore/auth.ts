const TOKEN_URL = "https://auth.sitecorecloud.io/oauth/token";
const AUDIENCE = "https://api.sitecorecloud.io";

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

let cached: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string> | null = null;

async function request(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SITECORE_CLIENT_ID!,
      client_secret: process.env.SITECORE_CLIENT_SECRET!,
      grant_type: "client_credentials",
      audience: AUDIENCE,
    }),
  });

  if (!res.ok) {
    throw new Error(`Sitecore auth failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as TokenResponse;
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cached.token;
}

export async function getSitecoreToken(): Promise<string> {
  // 5-minute safety buffer before actual expiry
  if (cached && Date.now() < cached.expiresAt - 300_000) return cached.token;

  // Collapse concurrent refreshes into one request
  if (!inFlight) {
    inFlight = request().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
