import { getReports } from "@/lib/actions/report-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportHtmlContent } from "@/components/reports/report-html-content";
import { AutoRefresh } from "@/components/messages/auto-refresh";
import { Calendar, TrendingDown, TrendingUp, Minus } from "lucide-react";

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function trendVariant(
  trend: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  if (trend === "improving") return "default";
  if (trend === "declining") return "destructive";
  return "secondary";
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp className="size-3" />;
  if (trend === "declining") return <TrendingDown className="size-3" />;
  return <Minus className="size-3" />;
}

export default async function PortalReportsPage() {
  const { reports } = await getReports();

  return (
    <div className="space-y-6">
      {/* Polls in case admin publishes a new report while client is on the page */}
      <AutoRefresh intervalMs={30000} />

      <div>
        <h1 className="text-2xl font-bold">Performance Reports</h1>
        <p className="text-muted-foreground">
          Monthly summaries of your network&apos;s SEO health, posts, and growth.
        </p>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">No reports yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your first report will be generated at the end of the month.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map(({ report }) => (
            <Card key={report.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>{report.title || "Monthly Report"}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                      {report.generatedAt && (
                        <>
                          <span className="mx-1.5">·</span>
                          <span className="text-xs">
                            generated {formatDate(report.generatedAt)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  {report.overallSeoTrend && (
                    <Badge
                      variant={trendVariant(report.overallSeoTrend)}
                      className="flex items-center gap-1"
                    >
                      <TrendIcon trend={report.overallSeoTrend} />
                      {report.overallSeoTrend}
                    </Badge>
                  )}
                </div>

                {/* Quick stats strip — only shown if any of the fields are populated */}
                {(report.avgSeoScore != null ||
                  report.totalPostsPublished != null ||
                  report.totalIssuesFixed != null) && (
                  <div className="mt-3 flex flex-wrap gap-4 border-t pt-3 text-sm">
                    {report.avgSeoScore != null && (
                      <div>
                        <span className="text-muted-foreground">Avg SEO score: </span>
                        <span className="font-semibold">{report.avgSeoScore}</span>
                      </div>
                    )}
                    {report.totalPostsPublished != null && (
                      <div>
                        <span className="text-muted-foreground">Posts published: </span>
                        <span className="font-semibold">{report.totalPostsPublished}</span>
                      </div>
                    )}
                    {report.totalIssuesFixed != null && (
                      <div>
                        <span className="text-muted-foreground">Issues fixed: </span>
                        <span className="font-semibold">{report.totalIssuesFixed}</span>
                      </div>
                    )}
                    {report.blogsOnSchedule != null && report.blogsOffSchedule != null && (
                      <div>
                        <span className="text-muted-foreground">On schedule: </span>
                        <span className="font-semibold">
                          {report.blogsOnSchedule} / {report.blogsOnSchedule + report.blogsOffSchedule}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {report.summaryHtml ? (
                  <ReportHtmlContent html={report.summaryHtml} />
                ) : (
                  <p className="italic text-muted-foreground">
                    Report content not available.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}