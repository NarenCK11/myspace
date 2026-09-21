import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { formatLongDate, formatTime, toDate } from "@/lib/datetime";
import { fetchCalendar, keys } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import type { CalendarItem, CalendarItemKind } from "@/types/api";

const KIND_STYLES: Record<CalendarItemKind, { label: string; dot: string; chip: string }> = {
  google_event: { label: "Event", dot: "bg-info", chip: "bg-info-soft text-info" },
  task: { label: "Task", dot: "bg-primary", chip: "bg-primary-soft text-primary" },
  reminder: { label: "Reminder", dot: "bg-warning", chip: "bg-warning-soft text-warning" },
  activity: { label: "Activity", dot: "bg-success", chip: "bg-success-soft text-success" },
};

const ALL_KINDS = Object.keys(KIND_STYLES) as CalendarItemKind[];

export function CalendarPage() {
  const { user } = useAuth();
  const weekStartsOn = user?.week_starts_on === 0 ? 0 : 1;
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [hiddenKinds, setHiddenKinds] = useState<CalendarItemKind[]>([]);

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn });

  const params = { start: gridStart.toISOString(), end: gridEnd.toISOString() };
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: keys.calendar(params),
    queryFn: () => fetchCalendar(params),
    staleTime: 30_000,
  });

  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart.getTime(), gridEnd.getTime()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // The Event filter can only ever match Google events, so it is left out
  // until the integration is configured.
  const visibleKinds = useMemo(
    () => (data?.google_configured ? ALL_KINDS : ALL_KINDS.filter((k) => k !== "google_event")),
    [data?.google_configured],
  );

  const visibleItems = useMemo(
    () => (data?.items ?? []).filter((item) => !hiddenKinds.includes(item.kind)),
    [data, hiddenKinds],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of visibleItems) {
      const key = format(toDate(item.start_at), "yyyy-MM-dd");
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [visibleItems]);

  const selectedItems = byDay.get(format(selected, "yyyy-MM-dd")) ?? [];

  function toggleKind(kind: CalendarItemKind) {
    setHiddenKinds((current) =>
      current.includes(kind) ? current.filter((value) => value !== kind) : [...current, kind],
    );
  }

  function jumpToday() {
    const now = new Date();
    setCursor(now);
    setSelected(now);
  }

  const weekdayLabels = days.slice(0, 7).map((day) => format(day, "EEEEE"));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description={
          data?.google_connected
            ? data.last_synced_at
              ? `Google synced ${format(toDate(data.last_synced_at), "d MMM, HH:mm")}`
              : "Google connected"
            : data?.google_configured
              ? "Connect Google Calendar in Settings to see your events here."
              : "Tasks, reminders and logged activities across the month."
        }
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon-sm" onClick={() => setCursor(subMonths(cursor, 1))} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <Button variant="secondary" size="sm" onClick={jumpToday}>
              Today
            </Button>
            <Button variant="secondary" size="icon-sm" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
              <ChevronRight />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="Refresh"
            >
              <RefreshCw className={cn(isFetching && "animate-spin")} />
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{format(cursor, "MMMM yyyy")}</h2>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {visibleKinds.map((kind) => {
            const hidden = hiddenKinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => toggleKind(kind)}
                aria-pressed={!hidden}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors",
                  hidden
                    ? "border-border text-muted-foreground/60"
                    : "border-transparent " + KIND_STYLES[kind].chip,
                )}
              >
                <span className={cn("size-1.5 rounded-full", KIND_STYLES[kind].dot)} aria-hidden />
                {KIND_STYLES[kind].label}
              </button>
            );
          })}
        </div>
      </div>

      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-surface-sunken">
              {weekdayLabels.map((label, index) => (
                <div
                  key={index}
                  className="px-1 py-2 text-center text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const items = byDay.get(key) ?? [];
                const outside = !isSameMonth(day, cursor);
                const isSelected = isSameDay(day, selected);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(day)}
                    className={cn(
                      "relative flex min-h-[4.5rem] flex-col gap-1 border-b border-r border-border/60 p-1.5 text-left transition-colors sm:min-h-[6rem]",
                      "hover:bg-muted/60 focus-visible:z-10",
                      outside && "bg-surface-sunken/50 text-muted-foreground/60",
                      isSelected && "bg-accent/60",
                    )}
                    aria-label={formatLongDate(day)}
                    aria-current={isToday(day) ? "date" : undefined}
                  >
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        isToday(day) && "bg-primary font-semibold text-primary-foreground",
                        isSelected && !isToday(day) && "font-semibold text-accent-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>

                    {isLoading ? (
                      <Skeleton className="h-2 w-3/4" />
                    ) : (
                      <>
                        {/* Compact dots on phones, labelled chips from sm up. */}
                        <span className="flex flex-wrap gap-0.5 sm:hidden">
                          {items.slice(0, 4).map((item) => (
                            <span
                              key={item.id}
                              className={cn("size-1.5 rounded-full", KIND_STYLES[item.kind].dot)}
                              aria-hidden
                            />
                          ))}
                        </span>
                        <span className="hidden flex-col gap-0.5 sm:flex">
                          {items.slice(0, 3).map((item) => (
                            <span
                              key={item.id}
                              className={cn(
                                "truncate rounded px-1 py-0.5 text-[0.625rem] leading-tight",
                                KIND_STYLES[item.kind].chip,
                              )}
                            >
                              {item.all_day ? "" : `${formatTime(item.start_at)} `}
                              {item.title}
                            </span>
                          ))}
                          {items.length > 3 && (
                            <span className="px-1 text-[0.625rem] text-muted-foreground">
                              +{items.length - 3} more
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <aside className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">{formatLongDate(selected)}</h3>
              <p className="text-xs text-muted-foreground">
                {selectedItems.length
                  ? `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}`
                  : "Nothing scheduled"}
              </p>
            </div>

            {selectedItems.length ? (
              <ul className="space-y-2">
                {selectedItems.map((item) => (
                  <li key={item.id}>
                    <Card className="p-3">
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "mt-1 w-1 shrink-0 self-stretch rounded-full",
                            KIND_STYLES[item.kind].dot,
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start gap-2">
                            <p className="min-w-0 flex-1 text-sm leading-snug">{item.title}</p>
                            <Badge variant="outline">{KIND_STYLES[item.kind].label}</Badge>
                          </div>
                          <p className="text-2xs text-muted-foreground">
                            {item.all_day
                              ? "All day"
                              : `${formatTime(item.start_at)} – ${formatTime(item.end_at)}`}
                            {item.calendar_name ? ` · ${item.calendar_name}` : ""}
                          </p>
                          {item.location && (
                            <p className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                              <MapPin className="size-2.5" /> {item.location}
                            </p>
                          )}
                          {item.description && (
                            <p className="line-clamp-3 text-xs text-muted-foreground">
                              {item.description}
                            </p>
                          )}
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline"
                            >
                              Open in Google <ExternalLink className="size-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={CalendarDays}
                title="Nothing on this day"
                description={
                  data?.google_connected
                    ? "Tasks, reminders and events all land here."
                    : data?.google_configured
                      ? "Connect Google Calendar to bring your events in."
                      : "Tasks, reminders and logged activities all land here."
                }
                action={
                  data?.google_configured && !data?.google_connected ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/settings">Go to settings</Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
