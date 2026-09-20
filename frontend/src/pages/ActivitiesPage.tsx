import { useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ActivityDialog } from "@/components/common/ActivityDialog";
import { ActivityRow } from "@/components/common/ActivityRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api";
import { formatDay } from "@/lib/datetime";
import { fetchActivities, keys } from "@/lib/queries";
import { pluralise } from "@/lib/utils";
import type { Activity } from "@/types/api";

const SOURCES = [
  { value: "all", label: "Everything" },
  { value: "manual", label: "Logged by me" },
  { value: "system", label: "History" },
];

/** Groups the feed into day buckets, preserving the server's ordering. */
function groupByDay(items: Activity[]) {
  const groups = new Map<string, Activity[]>();
  for (const item of items) {
    const key = item.occurred_at.slice(0, 10);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()];
}

export function ActivitiesPage() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const [source, setSource] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const params = { source, limit: 200 };
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.activities(params),
    queryFn: () => fetchActivities(params),
    staleTime: 15_000,
  });

  const grouped = useMemo(() => groupByDay(data?.items ?? []), [data]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activities"
        description={
          data ? `${pluralise(data.total, "entry", "entries")} in your personal history` : undefined
        }
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus /> Log activity
          </Button>
        }
      />

      <Tabs value={source} onValueChange={setSource}>
        <TabsList>
          {SOURCES.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <ListSkeleton rows={6} />
      ) : grouped.length ? (
        <div className="space-y-5">
          {grouped.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {formatDay(`${day}T12:00:00`)}
              </h2>
              <Card>
                <CardContent className="px-1.5 py-1.5">
                  <div className="divide-y divide-border/60">
                    {items.map((activity) => (
                      <ActivityRow
                        key={activity.id}
                        activity={activity}
                        highlighted={focusId === activity.id}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ActivityIcon}
          title="Nothing here yet"
          description="Log what you do, and everything you create or complete is recorded automatically."
          action={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus /> Log activity
            </Button>
          }
        />
      )}

      <ActivityDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
