import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { ArrowRight, CornerDownLeft, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ALL_NAV } from "@/components/layout/nav-items";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { InlineSpinner } from "@/components/ui/states";
import { useDebounced } from "@/hooks/useDebounced";
import { keys, search as searchApi } from "@/lib/queries";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  task: "Task",
  note: "Note",
  reminder: "Reminder",
  activity: "Activity",
  meal: "Meal",
  event: "Event",
  tag: "Tag",
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuickAdd: () => void;
}

export function CommandPalette({ open, onOpenChange, onQuickAdd }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 220);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: keys.search(debounced, []),
    queryFn: () => searchApi(debounced, [], 8),
    enabled: open && debounced.trim().length > 1,
    staleTime: 15_000,
  });

  function go(to: string) {
    onOpenChange(false);
    navigate(to);
  }

  const hits = data?.hits ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="top-[12%] max-w-xl translate-y-0 overflow-hidden p-0 sm:top-[18%]"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command shouldFilter={false} loop className="flex flex-col">
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search tasks, notes, reminders..."
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
            {isFetching && <InlineSpinner />}
            <kbd className="kbd hidden sm:inline-flex">Esc</kbd>
          </div>

          <Command.List className="max-h-[min(24rem,60dvh)] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              {debounced.trim().length > 1 ? "No matches found." : "Type to search across everything."}
            </Command.Empty>

            {hits.length > 0 && (
              <Command.Group heading={<GroupHeading>Results</GroupHeading>}>
                {hits.map((hit) => (
                  <Item key={`${hit.kind}-${hit.id}`} onSelect={() => go(hit.url)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{hit.title}</span>
                      {hit.snippet && (
                        <span className="block truncate text-xs text-muted-foreground">{hit.snippet}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
                      {KIND_LABELS[hit.kind] ?? hit.kind}
                    </span>
                  </Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading={<GroupHeading>Actions</GroupHeading>}>
              <Item
                onSelect={() => {
                  onOpenChange(false);
                  onQuickAdd();
                }}
              >
                <Plus className="size-4 text-muted-foreground" />
                <span className="flex-1">Quick add</span>
                <kbd className="kbd">N</kbd>
              </Item>
              {query.trim().length > 0 && (
                <Item onSelect={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}>
                  <Search className="size-4 text-muted-foreground" />
                  <span className="flex-1">Search for "{query.trim()}"</span>
                  <CornerDownLeft className="size-3.5 text-muted-foreground" />
                </Item>
              )}
            </Command.Group>

            <Command.Group heading={<GroupHeading>Go to</GroupHeading>}>
              {ALL_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <Item key={item.to} onSelect={() => go(item.to)}>
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1">{item.label}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                  </Item>
                );
              })}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
      {children}
    </span>
  );
}

function Item({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none",
        "data-[selected=true]:bg-muted",
      )}
    >
      {children}
    </Command.Item>
  );
}
