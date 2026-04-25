import type {
  ConnectionResult,
  Platform,
  PublishPostInput,
  PublishPostResult,
} from "@/lib/types";
import * as wp from "./wp-client";
import * as shopify from "./shopify-client";

/**
 * Minimal shape of a blog row for the dispatcher. Only the credential
 * fields are required; callers can pass a wider blog object.
 */
export interface PlatformBlog {
  platform: Platform | null;
  wpUrl?: string | null;
  wpUsername?: string | null;
  wpAppPassword?: string | null;
  shopifyStoreUrl?: string | null;
  shopifyAdminApiToken?: string | null;
  shopifyApiVersion?: string | null;
  shopifyBlogId?: string | null;
}

export interface RecentPost {
  title: string;
  url: string;
  publishedAt: Date | null;
}

function resolvePlatform(blog: PlatformBlog): Platform {
  return blog.platform ?? "wordpress";
}

export async function testConnection(blog: PlatformBlog): Promise<ConnectionResult> {
  const platform = resolvePlatform(blog);

  if (platform === "shopify") {
    if (!blog.shopifyStoreUrl || !blog.shopifyAdminApiToken) {
      return {
        success: false,
        platform,
        message: "Shopify credentials are incomplete. Set store URL and Admin API token.",
      };
    }
    return shopify.testConnection(
      blog.shopifyStoreUrl,
      blog.shopifyAdminApiToken,
      blog.shopifyApiVersion || undefined,
    );
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return {
      success: false,
      platform,
      message: "WordPress credentials are incomplete. Set URL, username, and application password.",
    };
  }
  return wp.testConnection(blog.wpUrl, blog.wpUsername, blog.wpAppPassword);
}

export async function fetchRecentPosts(
  blog: PlatformBlog,
  count: number = 5,
): Promise<RecentPost[]> {
  const platform = resolvePlatform(blog);

  if (platform === "shopify") {
    if (!blog.shopifyStoreUrl || !blog.shopifyAdminApiToken) return [];
    const articles = await shopify.fetchRecentArticles(
      blog.shopifyStoreUrl,
      blog.shopifyAdminApiToken,
      blog.shopifyApiVersion || undefined,
      blog.shopifyBlogId || undefined,
      count,
    );
    const storeHost = blog.shopifyStoreUrl
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
    return articles.map((a) => ({
      title: a.title,
      url: `https://${storeHost}/blogs/${a.handle}`,
      publishedAt: a.published_at ? new Date(a.published_at) : null,
    }));
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) return [];
  const posts = await wp.fetchRecentPosts(
    blog.wpUrl,
    blog.wpUsername,
    blog.wpAppPassword,
    count,
  );
  return posts.map((p) => ({
    title: p.title?.rendered ?? "",
    url: p.link,
    publishedAt: p.date ? new Date(p.date) : null,
  }));
}

export async function publishPost(
  blog: PlatformBlog,
  input: PublishPostInput,
): Promise<PublishPostResult> {
  const platform = resolvePlatform(blog);

  if (platform === "shopify") {
    if (!blog.shopifyStoreUrl || !blog.shopifyAdminApiToken) {
      return {
        success: false,
        message: "Shopify credentials are incomplete. Set store URL and Admin API token.",
      };
    }
    return shopify.createArticle(
      blog.shopifyStoreUrl,
      blog.shopifyAdminApiToken,
      blog.shopifyApiVersion || undefined,
      input,
      blog.shopifyBlogId || undefined,
    );
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return {
      success: false,
      message: "WordPress credentials are incomplete.",
    };
  }
  return wp.createPost(blog.wpUrl, blog.wpUsername, blog.wpAppPassword, input);
}
