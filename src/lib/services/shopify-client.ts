import axios, { type AxiosInstance, type AxiosError } from "axios";
import type { ConnectionResult, PublishPostInput, PublishPostResult } from "@/lib/types";

const DEFAULT_API_VERSION = "2024-07";
const SHOPIFY_TIMEOUT_MS = 10000;

export interface ShopifyArticle {
  id: number;
  title: string;
  body_html: string;
  author: string;
  blog_id: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  handle: string;
  tags: string;
  summary_html: string | null;
  user_id: number | null;
  template_suffix: string | null;
}

export interface ShopifyBlog {
  id: number;
  title: string;
  handle: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifyShop {
  id: number;
  name: string;
  email: string;
  domain: string;
  myshopify_domain: string;
  plan_name: string;
  plan_display_name: string;
}

function normalizeStoreUrl(storeUrl: string): string {
  let url = storeUrl.trim().replace(/\/+$/, "");
  url = url.replace(/^https?:\/\//i, "");
  return url;
}

function createClient(
  storeUrl: string,
  adminToken: string,
  apiVersion: string = DEFAULT_API_VERSION,
): AxiosInstance {
  const host = normalizeStoreUrl(storeUrl);
  return axios.create({
    baseURL: `https://${host}/admin/api/${apiVersion}`,
    timeout: SHOPIFY_TIMEOUT_MS,
    headers: {
      "X-Shopify-Access-Token": adminToken,
      "Content-Type": "application/json",
    },
  });
}

function formatError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<{ errors?: string | Record<string, string[]> }>;
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const data = axiosErr.response.data;
      if (status === 401) {
        return "Authentication failed. Check your Shopify Admin API access token.";
      }
      if (status === 403) {
        return "Token lacks required scopes. Enable write_content/read_content for blog articles.";
      }
      if (status === 404) {
        return "Shopify store or resource not found. Verify the store URL.";
      }
      if (status === 429) {
        return "Shopify rate limit hit. Try again shortly.";
      }
      if (typeof data?.errors === "string") return data.errors;
      if (data?.errors && typeof data.errors === "object") {
        return Object.entries(data.errors)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("; ");
      }
      return `Shopify returned HTTP ${status}`;
    }
    if (axiosErr.code === "ECONNABORTED") {
      return "Connection timed out. Shopify may be slow or unreachable.";
    }
    if (axiosErr.code === "ENOTFOUND" || axiosErr.code === "ECONNREFUSED") {
      return "Cannot reach the Shopify store. Check the store URL.";
    }
    return axiosErr.message;
  }
  if (error instanceof Error) return error.message;
  return "An unknown error occurred";
}

/**
 * Verify Shopify credentials by hitting the shop info endpoint.
 */
export async function testConnection(
  storeUrl: string,
  adminToken: string,
  apiVersion: string = DEFAULT_API_VERSION,
): Promise<ConnectionResult> {
  try {
    const client = createClient(storeUrl, adminToken, apiVersion);
    const res = await client.get<{ shop: ShopifyShop }>("/shop.json");
    const shop = res.data.shop;
    return {
      success: true,
      platform: "shopify",
      message: `Connected to ${shop.name} (${shop.myshopify_domain})`,
      shopifyStoreName: shop.name,
      shopifyPlan: shop.plan_display_name,
    };
  } catch (error) {
    return {
      success: false,
      platform: "shopify",
      message: formatError(error),
    };
  }
}

/**
 * List blogs belonging to the Shopify store. A store can have multiple
 * "blog" collections; articles live under one of them.
 */
export async function listBlogs(
  storeUrl: string,
  adminToken: string,
  apiVersion: string = DEFAULT_API_VERSION,
): Promise<ShopifyBlog[]> {
  const client = createClient(storeUrl, adminToken, apiVersion);
  const res = await client.get<{ blogs: ShopifyBlog[] }>("/blogs.json");
  return res.data.blogs;
}

/**
 * Fetch recent articles from a specific blog. Falls back to the first blog
 * on the store when no blogId is provided.
 */
export async function fetchRecentArticles(
  storeUrl: string,
  adminToken: string,
  apiVersion: string = DEFAULT_API_VERSION,
  blogId?: string,
  count: number = 5,
): Promise<ShopifyArticle[]> {
  const client = createClient(storeUrl, adminToken, apiVersion);

  let targetBlogId = blogId;
  if (!targetBlogId) {
    const blogs = await listBlogs(storeUrl, adminToken, apiVersion);
    if (blogs.length === 0) return [];
    targetBlogId = String(blogs[0].id);
  }

  const res = await client.get<{ articles: ShopifyArticle[] }>(
    `/blogs/${targetBlogId}/articles.json`,
    { params: { limit: count, order: "published_at desc" } },
  );
  return res.data.articles;
}

/**
 * Publish or draft an article to a Shopify blog.
 */
/**
 * Publish or draft an article to a Shopify blog. If `input.featuredImageUrl`
 * is set, it's passed as `article.image.src` — Shopify fetches and stores it
 * in the store's files.
 */
export async function createArticle(
  storeUrl: string,
  adminToken: string,
  apiVersion: string = DEFAULT_API_VERSION,
  input: PublishPostInput,
  blogId?: string,
): Promise<PublishPostResult> {
  try {
    const client = createClient(storeUrl, adminToken, apiVersion);

    let targetBlogId = blogId;
    if (!targetBlogId) {
      const blogs = await listBlogs(storeUrl, adminToken, apiVersion);
      if (blogs.length === 0) {
        return { success: false, message: "No blogs exist on this Shopify store. Create one first." };
      }
      targetBlogId = String(blogs[0].id);
    }

    const published = (input.status ?? "publish") === "publish";

    const res = await client.post<{ article: ShopifyArticle }>(
      `/blogs/${targetBlogId}/articles.json`,
      {
        article: {
          title: input.title,
          body_html: input.content,
          summary_html: input.excerpt,
          tags: input.tags?.join(", "),
          published,
          ...(input.featuredImageUrl && {
            image: { src: input.featuredImageUrl, alt: input.title },
          }),
        },
      },
    );

    const article = res.data.article;
    const storeHost = normalizeStoreUrl(storeUrl);
    return {
      success: true,
      message: `Article "${article.title}" ${published ? "published" : "saved as draft"}${
        input.featuredImageUrl ? " with cover image" : ""
      }`,
      postId: article.id,
      postUrl: `https://${storeHost}/blogs/${article.handle}`,
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
