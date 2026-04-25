import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { blogs, seoScans, seoIssues } from "@/lib/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { crawlBlog } from "@/lib/services/seo-crawler";
import { scoreBlog } from "@/lib/services/seo-scorer";
import {
  runPageSpeedAudit,
  severityFromAuditScore,
} from "@/lib/services/pagespeed-client";

export const maxDuration = 120;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [blog] = await db
      .select()
      .from(blogs)
      .where(eq(blogs.status, "active"))
      .orderBy(asc(sql`coalesce(${blogs.lastSeoScanAt}, '1970-01-01')`))
      .limit(1);

    if (!blog || !blog.wpUrl) {
      return NextResponse.json({ message: "No blogs to scan" });
    }

    const startTime = Date.now();

    // Cheerio crawl + PSI in parallel
    const [pages, pagespeed] = await Promise.all([
      crawlBlog(blog.wpUrl, 20),
      runPageSpeedAudit(blog.wpUrl, "mobile"),
    ]);

    const scores = scoreBlog(pages);
    const duration = Date.now() - startTime;

    // PSI's SEO score is THE score when available — that's what the user
    // wants displayed everywhere. Fall back to the cheerio overall only if
    // PSI couldn't compute it (API down / quota / transient error).
    const displayedScore = pagespeed.scores.seo ?? scores.overall;

    const [scan] = await db
      .insert(seoScans)
      .values({
        blogId: blog.id,
        clientId: blog.clientId,
        overallScore: displayedScore,
        metaScore: scores.meta,
        contentScore: scores.content,
        // technicalScore now reflects PSI's performance category (the closest
        // analogue), with the cheerio technical score as fallback.
        technicalScore: pagespeed.scores.performance ?? scores.technical,
        linkScore: scores.links,
        imageScore: scores.images,
        pagesCrawled: scores.pagesCrawled,
        issuesFound: scores.issuesFound + pagespeed.failedAudits.length,
        criticalIssues: scores.criticalIssues,
        warnings: scores.warnings,
        notices: scores.notices,
        rawData: { pages, pagespeed },
        scanDurationMs: duration,
      })
      .returning();

    if (scores.issues.length > 0) {
      await db.insert(seoIssues).values(
        scores.issues.map((issue) => ({
          scanId: scan.id,
          blogId: blog.id,
          clientId: blog.clientId,
          pageUrl: issue.pageUrl,
          category: issue.category as
            | "meta" | "content" | "technical" | "links" | "images" | "schema" | "performance",
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
          autoFixable: issue.autoFixable,
          status: "detected" as const,
        })),
      );
    }

    if (pagespeed.failedAudits.length > 0) {
      await db.insert(seoIssues).values(
        pagespeed.failedAudits.map((audit) => ({
          scanId: scan.id,
          blogId: blog.id,
          clientId: blog.clientId,
          pageUrl: blog.wpUrl,
          category: "performance" as const,
          severity: severityFromAuditScore(audit.score),
          title: audit.title,
          description: audit.displayValue
            ? `${audit.description} (current: ${audit.displayValue})`
            : audit.description,
          autoFixable: false,
          status: "detected" as const,
        })),
      );
    }

    await db
      .update(blogs)
      .set({
        currentSeoScore: displayedScore, // ← PSI SEO score (or crawler fallback)
        lastSeoScanAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(blogs.id, blog.id));

    return NextResponse.json({
      blog: blog.domain,
      score: displayedScore,
      source: pagespeed.scores.seo !== null ? "pagespeed" : "crawler-fallback",
      pageSpeed: {
        seo: pagespeed.scores.seo,
        performance: pagespeed.scores.performance,
        accessibility: pagespeed.scores.accessibility,
        bestPractices: pagespeed.scores.bestPractices,
        vitals: pagespeed.vitals,
        error: pagespeed.error,
      },
      issues: scores.issuesFound + pagespeed.failedAudits.length,
      pages: scores.pagesCrawled,
      durationMs: duration,
    });
  } catch (error) {
    console.error("SEO scan cron error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}