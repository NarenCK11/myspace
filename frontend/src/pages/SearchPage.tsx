import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { keys, search as searchApi } from "@/lib/queries";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "task", label: "Tasks" },
  { value: "note", label: "Notes" },
  { value: "reminder", label: "Reminders" },
  { value: "activity", label: "Activities" },
  { value: "event", label: "Events" },
  { value: "tag", label: "Tags" },
];

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [kinds, setKinds] = useState<string[]>([]);
  const debounced = useDebounced(query, 250);

  // Keep the URL in step so a search can be shared or reloaded.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    if (debounced.trim()) next.set("q", debounced.trim());
    else next.delete("q");
    setSearchParams(next, { replace: true });
  }, [debounced, setSearchParams]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.search(debounced, kinds),
    queryFn: () => searchApi(debounced, kinds, 50),
    enabled: debounced.trim().length > 0,
    staleTime: 15_000,
  });

  function toggleKind(value: string) {
    setKinds((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Search"
        description="Look across tasks, notes, reminders, activities and calendar events."
      />

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search everything..."
          className="h-11 pl-10 pr-10 text-base"
          autoFocus
          aria-label="Search"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {KINDS.map((kind) => {
          const active = kinds.includes(kind.value);
          const count = data?.counts?.[kind.value];
          return (
            <button
              key={kind.value}
              type="button"
              onClick={() => toggleKind(kind.value)}
              aria-pressed={active}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary/40 bg-primary-soft text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {kind.label}
              {count !== undefined && count > 0 && (
                <span className="tabular-nums opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {!debounced.trim() ? (
        <EmptyState
          icon={SearchIcon}
          title="Start typing to search"
          description="Results update as you type. Press Ctrl+K anywhere for the quick palette."
        />
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <ListSkeleton rows={5} />
      ) : data?.hits.length ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {data.total} result{data.total === 1 ? "" : "s"} for &quot;{data.query}&quot;
          </p>
          {data.hits.map((hit) => (
            <Card key={`${hit.kind}-${hit.id}`} className="transition-shadow hover:shadow-raised">
              <Link to={hit.url} className="flex items-start gap-3 p-3.5">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium">{hit.title}</p>
                  {hit.snippet && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{hit.snippet}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                    {hit.occurred_at && <span>{formatDateTime(hit.occurred_at)}</span>}
                    {hit.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Badge variant="primary" className="shrink-0 capitalize">
                  {hit.kind}
                </Badge>
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={SearchIcon}
          title="No results"
          description={`Nothing matched "${debounced.trim()}". Try a different word.`}
        />
      )}
    </div>
  );
}
