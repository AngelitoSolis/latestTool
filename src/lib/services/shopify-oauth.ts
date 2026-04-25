import crypto from "crypto";
import axios from "axios";

// ─── Env ────────────────────────────────────────────────────────────────────

export function getShopifyOAuthConfig(): {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  appUrl: string;
} {
  const apiKey = process.env.SHOPIFY_APP_API_KEY || "";
  const apiSecret = process.env.SHOPIFY_APP_API_SECRET || "";
  const scopes = process.env.SHOPIFY_APP_SCOPES || "read_content,write_content";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005";

  if (!apiKey || !apiSecret) {
    throw new Error(
      "Shopify OAuth is not configured. Set SHOPIFY_APP_API_KEY and SHOPIFY_APP_API_SECRET in .env.",
    );
  }

  return { apiKey, apiSecret, scopes, appUrl };
}

// ─── Shop domain validation ─────────────────────────────────────────────────

const SHOP_DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export function normalizeShopDomain(input: string): string | null {
  const stripped = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return SHOP_DOMAIN_RE.test(stripped) ? stripped : null;
}

// ─── State token (signed, stateless) ────────────────────────────────────────

// The state ties the install request to a specific blog row and protects against
// CSRF. We sign it with the app secret so the callback can verify it without
// requiring server-side session storage.

export interface StatePayload {
  blogId: string;
  nonce: string;
  issuedAt: number;
}

export function signState(payload: StatePayload): string {
  const { apiSecret } = getShopifyOAuthConfig();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", apiSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): StatePayload | null {
  const { apiSecret } = getShopifyOAuthConfig();
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  const expected = crypto
    .createHmac("sha256", apiSecret)
    .update(body)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    // 10 minute install window
    if (Date.now() - payload.issuedAt > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── HMAC validation of callback query ──────────────────────────────────────

/**
 * Validate the `hmac` query parameter Shopify sends on the OAuth callback.
 * Per Shopify docs: remove `hmac` and `signature`, sort remaining params,
 * serialize as `k=v&k=v`, HMAC-SHA256 with the app secret, compare hex.
 */
export function validateCallbackHmac(query: Record<string, string>): boolean {
  const { apiSecret } = getShopifyOAuthConfig();
  const { hmac, signature: _signature, ...rest } = query;
  if (!hmac) return false;

  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", apiSecret)
    .update(message)
    .digest("hex");

  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── Authorize URL ──────────────────────────────────────────────────────────

export function buildAuthorizeUrl(shop: string, state: string): string {
  const { apiKey, scopes, appUrl } = getShopifyOAuthConfig();
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/shopify/oauth/callback`;
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
    "grant_options[]": "",
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

// ─── Token exchange ─────────────────────────────────────────────────────────

export interface AccessTokenResponse {
  access_token: string;
  scope: string;
}

export async function exchangeCodeForToken(
  shop: string,
  code: string,
): Promise<AccessTokenResponse> {
  const { apiKey, apiSecret } = getShopifyOAuthConfig();
  const res = await axios.post<AccessTokenResponse>(
    `https://${shop}/admin/oauth/access_token`,
    {
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    },
  );
  return res.data;
}
