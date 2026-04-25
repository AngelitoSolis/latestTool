"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";

type FixQueueItem = {
  issue: {
    id: string;
    title: string;
    description: string | null;
    severity: string;
    category: string;
    pageUrl: string | null;
    autoFixable: boolean | null;
    suggestedFix: string | null;
    status: string;
  };
  blogDomain: string;
};

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  warning: "secondary",
  notice: "outline",
};

export default function FixQueuePage() {
  const [queue, setQueue] = useState<FixQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchPending, startBatch] = useTransition();

  useEffect(() => {
    fetch("/api/seo/fix-queue")
      .then((r) => r.json())
      .then(setQueue)
      .catch(() => toast.error("Failed to load fix queue"))
      .finally(() => setLoading(false));
  }, []);

  function refetch() {
    fetch("/api/seo/fix-queue")
      .then((r) => r.json())
      .then(setQueue)
      .catch(() => toast.error("Failed to refresh queue"));
  }

 async function handleApply(issueId: string) {
  setBusyId(issueId);
  try {
    const res = await fetch("/api/seo/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId, action: "apply" }),
    });
    const data = await res.json();
    if (res.ok && data.applied) {
      // Show score delta if rescan happened
      if (data.score && data.score.newScore !== null) {
        const { previousScore, newScore, delta } = data.score;
        const arrow = delta && delta > 0 ? "↑" : delta && delta < 0 ? "↓" : "→";
        toast.success(
          `${data.message} · SEO ${previousScore ?? "—"} → ${newScore} ${arrow}${
            delta !== null && delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta})` : ""
          }`,
        );
      } else {
        toast.success(data.message || "Fix applied to live site");
      }
      setQueue((q) => q.filter((item) => item.issue.id !== issueId));
    } else {
      toast.error(data.message || data.error || "Could not apply fix");
    }
  } catch {
    toast.error("Network error applying fix");
  } finally {
    setBusyId(null);
  }
}

  async function handleDismiss(issueId: string) {
    setBusyId(issueId);
    try {
      const res = await fetch("/api/seo/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, action: "dismiss" }),
      });
      if (res.ok) {
        setQueue((q) => q.filter((item) => item.issue.id !== issueId));
        toast.success("Issue dismissed");
      } else {
        toast.error("Failed to dismiss");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleGeneratePreview(issueId: string) {
    setBusyId(issueId);
    try {
      const res = await fetch("/api/seo/fix/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });
      if (res.ok) {
        const data = await res.json();
        setQueue((q) =>
          q.map((item) =>
            item.issue.id === issueId
              ? {
                  ...item,
                  issue: { ...item.issue, suggestedFix: data.fixContent, status: "queued" },
                }
              : item,
          ),
        );
        toast.success("Preview generated");
      } else {
        toast.error("Failed to generate preview");
      }
    } finally {
      setBusyId(null);
    }
  }

  function handleApplyAll() {
  startBatch(async () => {
    const res = await fetch("/api/seo/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "applyAll" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Apply All failed");
      return;
    }
    const data = await res.json();
    const applied = data.applied ?? 0;
    const failed = data.failed ?? 0;

    if (applied > 0) {
      toast.success(`Applied ${applied} fix${applied === 1 ? "" : "es"} to live sites`);
    }
    if (failed > 0) {
      toast.error(`${failed} fix${failed === 1 ? "" : "es"} failed`);
    }
    if (applied === 0 && failed === 0) {
      toast.info("No auto-fixable issues to apply");
    }

    // Show one delta toast per blog that actually moved
    const updates: Array<{
      blogId: string;
      previousScore: number | null;
      newScore: number | null;
      delta: number | null;
      error?: string;
    }> = data.scoreUpdates ?? [];
    for (const u of updates) {
      if (u.error) continue;
      if (u.newScore === null) continue;
      const arrow = u.delta && u.delta > 0 ? "↑" : u.delta && u.delta < 0 ? "↓" : "→";
      toast.message(
        `Score on blog ${u.blogId.slice(0, 8)}: ${u.previousScore ?? "—"} → ${u.newScore} ${arrow}${
          u.delta !== null && u.delta !== 0 ? ` (${u.delta > 0 ? "+" : ""}${u.delta})` : ""
        }`,
      );
    }

    refetch();
  });
}

  const severityOrder = { critical: 0, warning: 1, notice: 2 };
  const sorted = [...queue].sort(
    (a, b) =>
      (severityOrder[a.issue.severity as keyof typeof severityOrder] ?? 3) -
      (severityOrder[b.issue.severity as keyof typeof severityOrder] ?? 3),
  );

  const autoFixableCount = sorted.filter((i) => i.issue.autoFixable).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">SEO Fix Queue</h1>
          <p className="text-muted-foreground">
            {queue.length} issue{queue.length === 1 ? "" : "s"} pending
            {autoFixableCount > 0 && (
              <> · {autoFixableCount} auto-fixable</>
            )}
          </p>
        </div>
        {autoFixableCount > 0 && (
          <Button onClick={handleApplyAll} disabled={batchPending}>
            {batchPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wrench className="size-4" />
            )}
            Apply All Auto-Fixable ({autoFixableCount})
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="h-24 animate-pulse bg-muted" />
            </Card>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            No pending issues in the fix queue.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((item) => {
            const isBusy = busyId === item.issue.id;
            const canAutoFix = !!item.issue.autoFixable;

            return (
              <Card key={item.issue.id}>
                <CardContent className="py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={severityVariant[item.issue.severity] ?? "outline"}>
                          {item.issue.severity}
                        </Badge>
                        <Badge variant="outline">{item.issue.category}</Badge>
                        {canAutoFix ? (
                          <Badge variant="outline" className="text-green-600">
                            <Sparkles className="size-3 mr-1" />
                            Auto-fixable
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Manual fix
                          </Badge>
                        )}
                        <span className="text-sm text-muted-foreground truncate">
                          {item.blogDomain}
                        </span>
                      </div>
                      <p className="font-medium">{item.issue.title}</p>
                      {item.issue.pageUrl && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.issue.pageUrl}
                        </p>
                      )}
                      {item.issue.description && (
                        <p className="text-sm text-muted-foreground">
                          {item.issue.description}
                        </p>
                      )}
                      {item.issue.suggestedFix && (
                        <div className="mt-2 p-2 bg-muted rounded text-sm">
                          <p className="font-medium text-xs mb-1">AI preview:</p>
                          <p>{item.issue.suggestedFix}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                      {canAutoFix && (
                        <Button
                          size="sm"
                          onClick={() => handleApply(item.issue.id)}
                          disabled={isBusy || batchPending}
                        >
                          {isBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Wrench className="size-4" />
                          )}
                          Apply Fix
                        </Button>
                      )}
                      {canAutoFix && !item.issue.suggestedFix && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGeneratePreview(item.issue.id)}
                          disabled={isBusy || batchPending}
                        >
                          Preview
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDismiss(item.issue.id)}
                        disabled={isBusy || batchPending}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}