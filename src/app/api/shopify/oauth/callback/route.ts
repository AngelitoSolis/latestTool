import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  exchangeCodeForToken,
  normalizeShopDomain,
  validateCallbackHmac,
  verifyState,
} from "@/lib/services/shopify-oauth";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005").replace(/\/$/, "");
}

function errorRedirect(blogId: string | null, message: string): NextResponse {
  const target = blogId ? `${appUrl()}/blogs/${blogId}` : `${appUrl()}/blogs`;
  const url = new URL(target);
  url.searchParams.set("shopify_error", message);
  return NextResponse.redirect(url);
}

function successRedirect(blogId: string): NextResponse {
  const url = new URL(`${appUrl()}/blogs/${blogId}`);
  url.searchParams.set("shopify_connected", "1");
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query: Record<string, string> = {};
  searchParams.forEach((v, k) => (query[k] = v));

  const { shop: shopParam, state, code } = query;
  let blogIdForError: string | null = null;

  if (!shopParam || !state || !code) {
    return errorRedirect(null, "Missing required OAuth parameters from Shopify.");
  }

  const shop = normalizeShopDomain(shopParam);
  if (!shop) {
    return errorRedirect(null, "Invalid shop domain in OAuth callback.");
  }

  const statePayload = verifyState(state);
  if (!statePayload) {
    return errorRedirect(null, "OAuth state invalid or expired. Please retry the install.");
  }
  blogIdForError = statePayload.blogId;

  if (!validateCallbackHmac(query)) {
    return errorRedirect(blogIdForError, "HMAC validation failed. Refusing to trust the callback.");
  }

  let token: { access_token: string; scope: string };
  try {
    token = await exchangeCodeForToken(shop, code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to exchange code for access token.";
    return errorRedirect(blogIdForError, msg);
  }

  const [existing] = await db
    .select({ id: blogs.id })
    .from(blogs)
    .where(eq(blogs.id, statePayload.blogId));
  if (!existing) {
    return errorRedirect(blogIdForError, "Blog no longer exists.");
  }

  await db
    .update(blogs)
    .set({
      platform: "shopify",
      shopifyStoreUrl: `https://${shop}`,
      shopifyAdminApiToken: token.access_token,
      updatedAt: new Date(),
    })
    .where(eq(blogs.id, statePayload.blogId));

  return successRedirect(statePayload.blogId);
}
