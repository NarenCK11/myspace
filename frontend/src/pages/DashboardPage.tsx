import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Circle,
  Flame,
  ListChecks,
  MapPin,
  Plus,
  StickyNote,
} from "lucide-react";
import { Link } from "react-router-dom";

import { ActivityRow } from "@/components/common/ActivityRow";
import { NoteCard } from "@/components/common/NoteCard";
import { NutritionCard } from "@/components/meals/NutritionCard";
import { ProgressBar, SectionTitle, StatCard } from "@/components/common/bits";
import { ReminderRow } from "@/components/common/ReminderRow";
import { TaskRow } from "@/components/common/TaskRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSkeleton, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { formatLongDate, formatTime } from "@/lib/datetime";
import { fetchDashboard, keys } from "@/lib/queries";
import { useAuth } from "@/providers/AuthProvider";

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.dashboard,
    queryFn: fetchDashboard,
    staleTime: 30_000,
  });

  if (isError) {
    return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  }

  const counts = data?.counts;
  const now = new Date();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {formatLongDate(now)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting(now)}, {data?.greeting_name ?? user?.display_name ?? "there"}.
        </h1>
        {data && (
          <p className="text-sm text-muted-foreground">
            {counts?.tasks_open
              ? `${counts.tasks_open} task${counts.tasks_open === 1 ? "" : "s"} open`
              : "Nothing open — enjoy the clear runway."}
            {counts?.events_today ? ` · ${counts.events_today} event(s) today` : ""}
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading || !counts ? (
          Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)
        ) : (
          <>
            <StatCard
              icon={Circle}
              label="Open"
              value={counts.tasks_open}
              hint={`${counts.tasks_due_today} due today`}
              tone="info"
            />
            <StatCard
              icon={CheckCircle2}
              label="Done today"
              value={counts.tasks_completed_today}
              hint={`${counts.tasks_completed_this_week} this week`}
              tone="success"
            />
            <StatCard
              icon={AlertTriangle}
              label="Overdue"
              value={counts.tasks_overdue}
              hint={counts.tasks_overdue ? "Needs attention" : "All clear"}
              tone={counts.tasks_overdue ? "danger" : "default"}
            />
            <StatCard
              icon={Flame}
              label="Streak"
              value={data.streak_days}
              hint={data.streak_days === 1 ? "day" : "days"}
              tone="warning"
            />
          </>
        )}
      </section>

      {data && (counts?.tasks_due_today || counts?.tasks_completed_today) ? (
        <Card>
          <CardContent className="pt-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Today&apos;s progress
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {Math.round(data.completion_rate * 100)}%
              </span>
            </div>
            <ProgressBar value={data.completion_rate} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section>
            <SectionTitle
              count={data?.overdue_tasks.length}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/tasks?view=overdue">View all</Link>
                </Button>
              }
            >
              <AlertTriangle className="size-4 text-danger" />
              Overdue
            </SectionTitle>
            {isLoading ? (
              <ListSkeleton rows={2} />
            ) : data?.overdue_tasks.length ? (
              <div className="space-y-2">
                {data.overdue_tasks.slice(0, 5).map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            ) : (
              <EmptyState compact icon={CheckCircle2} title="Nothing overdue" />
            )}
          </section>

          <section>
            <SectionTitle
              count={data?.today_tasks.length}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/today">Open today</Link>
                </Button>
              }
            >
              <ListChecks className="size-4 text-muted-foreground" />
              Due today
            </SectionTitle>
            {isLoading ? (
              <ListSkeleton rows={3} />
            ) : data?.today_tasks.length ? (
              <div className="space-y-2">
                {data.today_tasks.slice(0, 6).map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={ListChecks}
                title="Nothing due today"
                description="Add a task from quick add, or check what is coming up."
              />
            )}
          </section>

          <section>
            <SectionTitle count={data?.recent_activities.length}>
              <CheckCircle2 className="size-4 text-muted-foreground" />
              Recent activity
            </SectionTitle>
            <Card>
              <CardContent className="px-1.5 py-1.5">
                {isLoading ? (
                  <div className="p-3">
                    <ListSkeleton rows={3} />
                  </div>
                ) : data?.recent_activities.length ? (
                  <div className="divide-y divide-border/60">
                    {data.recent_activities.slice(0, 8).map((activity) => (
                      <ActivityRow key={activity.id} activity={activity} />
                    ))}
                  </div>
                ) : (
                  <EmptyState compact icon={CheckCircle2} title="No activity yet" className="border-0" />
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        <div className="space-y-5">
          {/*
            This card only ever shows Google events, so it is hidden entirely
            until the integration is configured on the server. Nothing here
            nags about a feature the owner has not asked for.
          */}
          {data?.google_configured && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                Today&apos;s schedule
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/calendar">Calendar</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ListSkeleton rows={2} />
              ) : data?.today_events.length ? (
                <ul className="space-y-2.5">
                  {data.today_events.map((event) => (
                    <li key={event.id} className="flex gap-3">
                      <span
                        className="mt-1 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: event.color ?? "hsl(var(--primary))" }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{event.title}</p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {event.all_day
                            ? "All day"
                            : `${formatTime(event.start_at)} – ${formatTime(event.end_at)}`}
                          {event.location && (
                            <span className="inline-flex items-center gap-1">
                              {" · "}
                              <MapPin className="size-2.5" />
                              {event.location}
                            </span>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title={data?.google_connected ? "No events today" : "Calendar not connected"}
                  description={
                    data?.google_connected
                      ? undefined
                      : "Connect Google Calendar in Settings to see your events here."
                  }
                  action={
                    data?.google_connected ? undefined : (
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/settings">Connect</Link>
                      </Button>
                    )
                  }
                  className="border-0"
                />
              )}
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-4 text-muted-foreground" />
                Reminders
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/reminders">All</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ListSkeleton rows={2} />
              ) : data?.upcoming_reminders.length ? (
                <div className="space-y-2">
                  {data.upcoming_reminders.slice(0, 4).map((reminder) => (
                    <ReminderRow key={reminder.id} reminder={reminder} />
                  ))}
                </div>
              ) : (
                <EmptyState compact icon={Bell} title="No reminders pending" className="border-0" />
              )}
            </CardContent>
          </Card>

          {data?.nutrition && <NutritionCard nutrition={data.nutrition} />}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StickyNote className="size-4 text-muted-foreground" />
                Important notes
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/notes">All</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ListSkeleton rows={2} />
              ) : data?.important_notes.length ? (
                <div className="grid gap-2.5">
                  {data.important_notes.slice(0, 3).map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={StickyNote}
                  title="Nothing pinned"
                  description="Mark a note important to surface it here."
                  action={
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/notes">
                        <Plus /> New note
                      </Link>
                    </Button>
                  }
                  className="border-0"
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
