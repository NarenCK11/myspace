import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Plus, Search, StickyNote, X } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { NoteCard } from "@/components/common/NoteCard";
import { NoteDialog } from "@/components/common/NoteDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import { fetchNotes, keys } from "@/lib/queries";
import { pluralise } from "@/lib/utils";
import type { Note } from "@/types/api";

const VIEWS = [
  { value: "all", label: "All" },
  { value: "pinned", label: "Pinned" },
  { value: "important", label: "Important" },
  { value: "archived", label: "Archived" },
];

export function NotesPage() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const debouncedQuery = useDebounced(query, 250);

  const params = {
    view,
    limit: 200,
    ...(debouncedQuery.trim() ? { q: debouncedQuery.trim() } : {}),
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.notes(params),
    queryFn: () => fetchNotes(params),
    staleTime: 15_000,
  });

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notes"
        description={data ? pluralise(data.total, "note") : undefined}
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus /> New note
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            {VIEWS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter notes..."
            className="pl-9 pr-9"
            aria-label="Filter notes"
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
      </div>

      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <ListSkeleton rows={4} />
      ) : data?.items.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false} mode="popLayout">
            {data.items.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                highlighted={focusId === note.id}
                onEdit={(selected) => {
                  setEditing(selected);
                  setDialogOpen(true);
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <EmptyState
          icon={StickyNote}
          title={debouncedQuery ? "No matching notes" : "No notes yet"}
          description="Keep passwords, ideas and things worth remembering in one place."
          action={
            <Button size="sm" onClick={openNew}>
              <Plus /> New note
            </Button>
          }
        />
      )}

      <NoteDialog open={dialogOpen} onOpenChange={setDialogOpen} note={editing} />
    </div>
  );
}
