import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Bell, Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ReminderDialog } from "@/components/common/ReminderDialog";
import { ReminderRow } from "@/components/common/ReminderRow";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api";
import { fetchReminders, keys } from "@/lib/queries";
import { pluralise } from "@/lib/utils";

const VIEWS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Done" },
  { value: "all", label: "All" },
];

export function RemindersPage() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const [view, setView] = useState("upcoming");
  const [dialogOpen, setDialogOpen] = useState(false);

  const params = { view, limit: 200 };
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.reminders(params),
    queryFn: () => fetchReminders(params),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reminders"
        description={data ? pluralise(data.total, "reminder") : undefined}
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus /> New reminder
          </Button>
        }
      />

      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          {VIEWS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <ListSkeleton rows={5} />
      ) : data?.items.length ? (
        <div className="space-y-2">
          <AnimatePresence initial={false} mode="popLayout">
            {data.items.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                highlighted={focusId === reminder.id}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title="No reminders here"
          description="Reminders nudge you at a specific moment, and can repeat."
          action={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus /> New reminder
            </Button>
          }
        />
      )}

      <ReminderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
