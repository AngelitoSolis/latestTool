import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { blogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  buildAuthorizeUrl,
  normalizeShopDomain,
  signState,
} from "@/lib/services/shopify-oauth";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const shopParam = searchParams.get("shop");
  const blogId = searchParams.get("blogId");

  if (!shopParam || !blogId) {
    return NextResponse.json(
      { error: "Missing required parameters: shop, blogId" },
      { status: 400 },
    );
  }

  const shop = normalizeShopDomain(shopParam);
  if (!shop) {
    return NextResponse.json(
      { error: "Invalid shop domain. Expected <store>.myshopify.com" },
      { status: 400 },
    );
  }

  // Verify the blog exists before redirecting
  const [blog] = await db.select({ id: blogs.id }).from(blogs).where(eq(blogs.id, blogId));
  if (!blog) {
    return NextResponse.json({ error: "Blog not found" }, { status: 404 });
  }

  let state: string;
  try {
    state = signState({
      blogId,
      nonce: crypto.randomBytes(16).toString("hex"),
      issuedAt: Date.now(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OAuth not configured" },
      { status: 500 },
    );
  }

  const authorizeUrl = buildAuthorizeUrl(shop, state);
  return NextResponse.redirect(authorizeUrl);
}
