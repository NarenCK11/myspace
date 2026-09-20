import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { ListChecks, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { TaskDialog } from "@/components/common/TaskDialog";
import { TaskRow } from "@/components/common/TaskRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import { fetchTasks, keys } from "@/lib/queries";
import { pluralise } from "@/lib/utils";
import type { Task } from "@/types/api";

const VIEWS = [
  { value: "open", label: "Open" },
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming" },
  { value: "unscheduled", label: "Someday" },
  { value: "completed", label: "Done" },
  { value: "all", label: "All" },
];

const SORTS = [
  { value: "due_at", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "created_at", label: "Created" },
  { value: "updated_at", label: "Updated" },
  { value: "title", label: "Title" },
];

export function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") ?? "open";
  const focusId = searchParams.get("focus");

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("due_at");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const debouncedQuery = useDebounced(query, 250);

  const params = {
    view,
    sort,
    order,
    limit: 200,
    ...(debouncedQuery.trim() ? { q: debouncedQuery.trim() } : {}),
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: keys.tasks(params),
    queryFn: () => fetchTasks(params),
    staleTime: 15_000,
  });

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setDialogOpen(true);
  }

  function setView(next: string) {
    const params = new URLSearchParams(searchParams);
    params.set("view", next);
    params.delete("focus");
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        description={data ? pluralise(data.total, "task") : undefined}
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus /> New task
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            {VIEWS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter tasks..."
              className="pl-9 pr-9"
              aria-label="Filter tasks"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Clear filter"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[9.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={order} onValueChange={(value) => setOrder(value as "asc" | "desc")}>
              <SelectTrigger className="w-[6.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Asc</SelectItem>
                <SelectItem value="desc">Desc</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <ListSkeleton rows={6} />
      ) : data?.items.length ? (
        <div className="space-y-2" aria-busy={isFetching}>
          <AnimatePresence initial={false} mode="popLayout">
            {data.items.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onEdit={openEdit}
                highlighted={focusId === task.id}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <EmptyState
          icon={ListChecks}
          title={debouncedQuery ? "No matching tasks" : "No tasks here"}
          description={
            debouncedQuery
              ? "Try a different search, or switch views."
              : "Create your first task to get started."
          }
          action={
            <Button size="sm" onClick={openNew}>
              <Plus /> New task
            </Button>
          }
        />
      )}

      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editing} />
    </div>
  );
}
