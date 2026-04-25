import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/helpers";
import { getReport } from "@/lib/actions/report-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReportHtmlContent } from "@/components/reports/report-html-content";
import { ArrowLeft } from "lucide-react";

interface ReportDetailPageProps {
  params: { reportId: string };
}

export default async function ReportDetailPage({
  params,
}: ReportDetailPageProps) {
  await requireAdmin();
  const result = await getReport(params.reportId);

  if (!result) notFound();

  const { report, clientName } = result;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{report.title}</h1>
            <p className="text-sm text-muted-foreground">
              {clientName} &middot; {report.periodStart} — {report.periodEnd}
            </p>
          </div>
        </div>
        <Badge variant={report.visibleToClient ? "default" : "outline"}>
          {report.visibleToClient ? "Published" : "Draft"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg SEO Score</CardDescription>
            <CardTitle className="text-2xl">
              {report.avgSeoScore ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Posts Published</CardDescription>
            <CardTitle className="text-2xl">
              {report.totalPostsPublished ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Issues Fixed</CardDescription>
            <CardTitle className="text-2xl">
              {report.totalIssuesFixed ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Trend</CardDescription>
            <CardTitle className="text-2xl capitalize">
              {report.overallSeoTrend ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {report.summaryHtml ? (
            <ReportHtmlContent html={report.summaryHtml} />
          ) : (
            <p className="text-muted-foreground">
              No summary content available.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
