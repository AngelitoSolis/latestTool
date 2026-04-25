"use server";

import { db } from "@/lib/db";
import { blogs, postVerifications } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/helpers";
import { fetchRecentPosts } from "@/lib/services/platform-client";

export async function getPostVerifications(params?: {
  blogId?: string;
  clientId?: string;
  onSchedule?: boolean;
  page?: number;
  pageSize?: number;
}) {
  await requireAdmin();
  const { blogId, clientId, onSchedule, page = 1, pageSize = 25 } = params || {};

  const conditions = [];
  if (blogId) conditions.push(eq(postVerifications.blogId, blogId));
  if (clientId) conditions.push(eq(postVerifications.clientId, clientId));
  if (onSchedule !== undefined) conditions.push(eq(postVerifications.onSchedule, onSchedule));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [records, [{ count }]] = await Promise.all([
    db.select({
      verification: postVerifications,
      blogDomain: blogs.domain,
    })
      .from(postVerifications)
      .innerJoin(blogs, eq(postVerifications.blogId, blogs.id))
      .where(where)
      .orderBy(desc(postVerifications.checkedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` })
      .from(postVerifications)
      .where(where),
  ]);

  return { records, total: count, page, pageSize };
}

export async function verifyBlogPosts(blogId: string) {
  await requireAdmin();

  const [blog] = await db.select().from(blogs).where(eq(blogs.id, blogId)).limit(1);
  if (!blog) throw new Error("Blog not found");

  const posts = await fetchRecentPosts(blog, 5);

  const latestPost = posts[0];
  const latestPostDate = latestPost?.publishedAt ?? null;
  const daysSinceLastPost = latestPostDate
    ? Math.ceil((Date.now() - latestPostDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const onSchedule = daysSinceLastPost !== null && blog.postingFrequencyDays !== null
    ? daysSinceLastPost <= blog.postingFrequencyDays
    : true;

  const alertTriggered = !onSchedule;

  const [verification] = await db.insert(postVerifications).values({
    blogId: blog.id,
    clientId: blog.clientId,
    checkType: "manual",
    latestPostDate,
    latestPostTitle: latestPost?.title || null,
    latestPostUrl: latestPost?.url || null,
    postsInPeriod: posts.length,
    expectedPosts: blog.postingFrequencyDays ? Math.ceil(7 / blog.postingFrequencyDays) : 0,
    onSchedule,
    daysSinceLastPost,
    alertTriggered,
  }).returning();

  await db.update(blogs).set({
    lastPostVerifiedAt: new Date(),
    lastPostTitle: latestPost?.title || blog.lastPostTitle,
    updatedAt: new Date(),
  }).where(eq(blogs.id, blogId));

  return verification;
}

// Called by cron job
export async function runPostVerificationCron() {
  const activeBlogs = await db.select().from(blogs).where(eq(blogs.status, "active"));

  let verified = 0;
  let alerts = 0;

  for (const blog of activeBlogs) {
    const hasWp = blog.wpUrl && blog.wpUsername && blog.wpAppPassword;
    const hasShopify = blog.shopifyStoreUrl && blog.shopifyAdminApiToken;
    if (blog.platform === "wordpress" && !hasWp) continue;
    if (blog.platform === "shopify" && !hasShopify) continue;

    try {
      const posts = await fetchRecentPosts(blog, 5);
      const latestPost = posts[0];
      const latestPostDate = latestPost?.publishedAt ?? null;
      const daysSinceLastPost = latestPostDate
        ? Math.ceil((Date.now() - latestPostDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const onSchedule = daysSinceLastPost !== null && blog.postingFrequencyDays !== null
        ? daysSinceLastPost <= blog.postingFrequencyDays
        : true;

      const alertTriggered = !onSchedule;
      if (alertTriggered) alerts++;

      await db.insert(postVerifications).values({
        blogId: blog.id,
        clientId: blog.clientId,
        checkType: "scheduled",
        latestPostDate,
        latestPostTitle: latestPost?.title || null,
        latestPostUrl: latestPost?.url || null,
        postsInPeriod: posts.length,
        expectedPosts: blog.postingFrequencyDays ? Math.ceil(7 / blog.postingFrequencyDays) : 0,
        onSchedule,
        daysSinceLastPost,
        alertTriggered,
      });

      await db.update(blogs).set({
        lastPostVerifiedAt: new Date(),
        lastPostTitle: latestPost?.title || blog.lastPostTitle,
      }).where(eq(blogs.id, blog.id));

      verified++;
    } catch (error) {
      console.error(`Post verification failed for ${blog.domain}:`, error);
    }
  }

  return { verified, alerts, total: activeBlogs.length };
}
