import { requireAdmin } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import {
  clients,
  blogs,
  seoIssues,
  invoices,
  renewalAlerts,
  activityLog,
  generatedPosts,
  postVerifications,
  users,
} from "@/lib/db/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function DashboardPage() {
  await requireAdmin();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Aggregate stats in parallel.
  const [
    [clientCount],
    [blogCount],
    [avgSeo],
    [issueCount],
    [overdueInvoices],
    [postsThisWeek],
    [postsTotal],
    urgentAlerts,
    recentActivity,
    clientList,
    allVerifications,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(sql`${clients.status} IN ('active', 'onboarding')`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(blogs)
      .where(eq(blogs.status, "active")),
    // Avg only across blogs that actually have a score; null if none scanned.
    db
      .select({
        avg: sql<number | null>`avg(${blogs.currentSeoScore})::int`,
        scanned: sql<number>`count(${blogs.currentSeoScore})::int`,
      })
      .from(blogs)
      .where(eq(blogs.status, "active")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(seoIssues)
      .where(sql`${seoIssues.status} NOT IN ('verified', 'dismissed')`),
    db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${invoices.amount}::numeric), 0)::numeric`,
      })
      .from(invoices)
      .where(eq(invoices.status, "overdue")),
    // Auto-published posts in the last 7 days (from the new generated_posts table).
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(generatedPosts)
      .where(
        and(
          eq(generatedPosts.status, "published"),
          gte(generatedPosts.publishedAt, weekAgo),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(generatedPosts)
      .where(eq(generatedPosts.status, "published")),
    db
      .select({ alert: renewalAlerts, blogDomain: blogs.domain, clientName: clients.name })
      .from(renewalAlerts)
      .innerJoin(blogs, eq(renewalAlerts.blogId, blogs.id))
      .innerJoin(clients, eq(renewalAlerts.clientId, clients.id))
      .where(
        and(
          eq(renewalAlerts.renewed, false),
          sql`${renewalAlerts.alertLevel} IN ('urgent', 'overdue')`,
        ),
      )
      .limit(10),
    // Activity log + joined names so the feed is actually readable.
    db
      .select({
        log: activityLog,
        userName: users.name,
        clientName: clients.name,
      })
      .from(activityLog)
      .leftJoin(users, eq(activityLog.userId, users.id))
      .leftJoin(clients, eq(activityLog.clientId, clients.id))
      .orderBy(desc(activityLog.createdAt))
      .limit(15),
    db
      .select({
        client: clients,
        blogCount: sql<number>`count(${blogs.id})::int`,
        avgScore: sql<number | null>`avg(${blogs.currentSeoScore})::int`,
      })
      .from(clients)
      .leftJoin(blogs, and(eq(clients.id, blogs.clientId), eq(blogs.status, "active")))
      .where(sql`${clients.status} IN ('active', 'onboarding')`)
      .groupBy(clients.id)
      .orderBy(desc(clients.createdAt))
      .limit(20),
    // Pull all post_verifications newest-first, then dedupe per blog in JS so
    // each blog contributes only its LATEST status. Avoids raw SQL/CTE that
    // varies by Drizzle driver. Capped at 1000 rows — more than enough for
    // any realistic dashboard since the cron writes at most a few per blog
    // per day.
    db
      .select({
        blogId: postVerifications.blogId,
        onSchedule: postVerifications.onSchedule,
      })
      .from(postVerifications)
      .orderBy(desc(postVerifications.checkedAt))
      .limit(1000),
  ]);

  // Dedupe verifications: first occurrence per blog wins (= the latest, since
  // we sorted by checked_at desc).
  const seenBlogs = new Set<string>();
  let offScheduleCount = 0;
  for (const v of allVerifications) {
    if (seenBlogs.has(v.blogId)) continue;
    seenBlogs.add(v.blogId);
    if (v.onSchedule === false) offScheduleCount++;
  }

  const avgSeoValue = avgSeo.scanned > 0 && avgSeo.avg !== null ? avgSeo.avg : null;

  function seoColor(score: number | null): string {
    if (score === null) return "text-muted-foreground";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats Row — each card links to its drill-in page */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Link href="/clients">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Clients</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{clientCount.count}</p></CardContent>
          </Card>
        </Link>
        <Link href="/blogs">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Active Blogs</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{blogCount.count}</p></CardContent>
          </Card>
        </Link>
        <Link href="/seo">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Avg SEO Score</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${seoColor(avgSeoValue)}`}>
                {avgSeoValue ?? "—"}
              </p>
              {avgSeo.scanned === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No scans yet</p>
              )}
            </CardContent>
          </Card>
        </Link>
        <Link href="/seo/fix-queue">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Open Issues</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{issueCount.count}</p></CardContent>
          </Card>
        </Link>
        <Link href="/posts">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Posts (7d)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{postsThisWeek.count}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {postsTotal.count} total
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/invoices">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Overdue Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${overdueInvoices.count > 0 ? "text-red-600" : ""}`}>
                ${Number(overdueInvoices.total).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {overdueInvoices.count} invoice{overdueInvoices.count === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Alert Panel */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-lg">Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {urgentAlerts.length === 0 && offScheduleCount === 0 && overdueInvoices.count === 0 ? (
              <p className="text-sm text-muted-foreground">No urgent alerts.</p>
            ) : (
              <>
                {overdueInvoices.count > 0 && (
                  <Link href="/invoices">
                    <div className="flex items-center justify-between p-2 bg-red-50 rounded cursor-pointer hover:bg-red-100">
                      <span className="text-sm font-medium text-red-800">
                        {overdueInvoices.count} overdue invoice{overdueInvoices.count === 1 ? "" : "s"}
                      </span>
                      <Badge variant="destructive">
                        ${Number(overdueInvoices.total).toLocaleString()}
                      </Badge>
                    </div>
                  </Link>
                )}
                {offScheduleCount > 0 && (
                  <Link href="/posts">
                    <div className="flex items-center justify-between p-2 bg-yellow-50 rounded cursor-pointer hover:bg-yellow-100">
                      <span className="text-sm font-medium text-yellow-800">
                        {offScheduleCount} blog{offScheduleCount === 1 ? "" : "s"} off schedule
                      </span>
                    </div>
                  </Link>
                )}
                {urgentAlerts.map(({ alert, blogDomain }) => (
                  <Link key={alert.id} href="/renewals">
                    <div className="flex items-center justify-between p-2 bg-orange-50 rounded cursor-pointer hover:bg-orange-100">
                      <span className="text-sm text-orange-800 truncate">
                        {blogDomain} — {alert.renewalType} expires
                      </span>
                      <Badge className="bg-orange-100 text-orange-800">
                        {alert.daysUntilExpiry}d
                      </Badge>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Client Grid */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            {clientList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active or onboarding clients yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {clientList.map(({ client, blogCount: bc, avgScore }) => (
                  <Link key={client.id} href={`/clients/${client.id}`}>
                    <div className="border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium truncate">{client.name}</p>
                        <Badge variant={client.billingStatus === "active" ? "default" : "destructive"}>
                          {client.billingStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{bc} blog{bc === 1 ? "" : "s"}</span>
                        <span className={seoColor(avgScore)}>
                          SEO: {avgScore ?? "—"}
                        </span>
                        {client.niche && <span>{client.niche}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed — now shows actor + client name when joined */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map(({ log, userName, clientName }) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-4 text-sm border-b last:border-0 pb-2 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">
                      {log.action.replace(/_/g, " ")}
                    </span>
                    {(userName || clientName) && (
                      <span className="text-muted-foreground">
                        {" — "}
                        {userName ? userName : "system"}
                        {clientName ? ` · ${clientName}` : ""}
                      </span>
                    )}
                    {log.entityType && (
                      <span className="text-muted-foreground text-xs ml-2">
                        ({log.entityType})
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}