import { useQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  MapPin,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";

import { ActivityDialog } from "@/components/common/ActivityDialog";
import { ActivityRow } from "@/components/common/ActivityRow";
import { SectionTitle } from "@/components/common/bits";
import { ReminderRow } from "@/components/common/ReminderRow";
import { TaskDialog } from "@/components/common/TaskDialog";
import { TaskRow } from "@/components/common/TaskRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { formatLongDate, formatTime } from "@/lib/datetime";
import { fetchToday, keys } from "@/lib/queries";

function shiftDay(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function TodayPage() {
  const [day, setDay] = useState(todayISO);
  const [taskOpen, setTaskOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const isToday = day === todayISO();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.today(day),
    queryFn: () => fetchToday(day),
    staleTime: 20_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isToday ? "Today" : formatLongDate(`${day}T12:00:00`)}
        description={formatLongDate(`${day}T12:00:00`)}
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => setDay((value) => shiftDay(value, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft />
            </Button>
            {!isToday && (
              <Button variant="secondary" size="sm" onClick={() => setDay(todayISO())}>
                <RotateCcw /> Today
              </Button>
            )}
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => setDay((value) => shiftDay(value, 1))}
              aria-label="Next day"
            >
              <ChevronRight />
            </Button>
            <Button size="sm" onClick={() => setTaskOpen(true)} className="ml-1">
              <Plus /> Task
            </Button>
          </div>
        }
      />

      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {data?.overdue_tasks.length ? (
              <section>
                <SectionTitle count={data.overdue_tasks.length}>Overdue</SectionTitle>
                <div className="space-y-2">
                  {data.overdue_tasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <SectionTitle count={data?.tasks.length}>
                <ListChecks className="size-4 text-muted-foreground" />
                Tasks
              </SectionTitle>
              {isLoading ? (
                <ListSkeleton rows={3} />
              ) : data?.tasks.length ? (
                <div className="space-y-2">
                  {data.tasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ListChecks}
                  title="No tasks scheduled"
                  description="Anything due on this day will show up here."
                  action={
                    <Button size="sm" variant="secondary" onClick={() => setTaskOpen(true)}>
                      <Plus /> Add a task
                    </Button>
                  }
                />
              )}
            </section>

            {data?.completed_tasks.length ? (
              <section>
                <SectionTitle count={data.completed_tasks.length}>
                  <CheckCircle2 className="size-4 text-success" />
                  Completed
                </SectionTitle>
                <div className="space-y-2">
                  {data.completed_tasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <div className="space-y-5">
            {/* Schedule is Google-only, so it stays out of the way until
                the integration is configured on the server. */}
            {data?.google_configured && (
            <section>
              <SectionTitle count={data?.events.length}>
                <CalendarDays className="size-4 text-muted-foreground" />
                Schedule
              </SectionTitle>
              <Card>
                <CardContent className="pt-4">
                  {isLoading ? (
                    <ListSkeleton rows={2} />
                  ) : data?.events.length ? (
                    <ul className="space-y-3">
                      {data.events.map((event) => (
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
                            </p>
                            {event.location && (
                              <p className="mt-0.5 inline-flex items-center gap-1 text-2xs text-muted-foreground">
                                <MapPin className="size-2.5" />
                                {event.location}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState compact icon={CalendarDays} title="Nothing scheduled" className="border-0" />
                  )}
                </CardContent>
              </Card>
            </section>
            )}

            <section>
              <SectionTitle count={data?.reminders.length}>
                <Bell className="size-4 text-muted-foreground" />
                Reminders
              </SectionTitle>
              {isLoading ? (
                <ListSkeleton rows={2} />
              ) : data?.reminders.length ? (
                <div className="space-y-2">
                  {data.reminders.map((reminder) => (
                    <ReminderRow key={reminder.id} reminder={reminder} />
                  ))}
                </div>
              ) : (
                <EmptyState compact icon={Bell} title="No reminders" />
              )}
            </section>

            <section>
              <SectionTitle
                count={data?.activities.length}
                action={
                  <Button variant="ghost" size="sm" onClick={() => setActivityOpen(true)}>
                    <Plus /> Log
                  </Button>
                }
              >
                <ActivityIcon className="size-4 text-muted-foreground" />
                Activities
              </SectionTitle>
              <Card>
                <CardContent className="px-1.5 py-1.5">
                  {isLoading ? (
                    <div className="p-3">
                      <ListSkeleton rows={2} />
                    </div>
                  ) : data?.activities.length ? (
                    <div className="divide-y divide-border/60">
                      {data.activities.map((activity) => (
                        <ActivityRow key={activity.id} activity={activity} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      compact
                      icon={ActivityIcon}
                      title="Nothing logged"
                      description="Record what you actually did today."
                      className="border-0"
                    />
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      )}

      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} />
      <ActivityDialog open={activityOpen} onOpenChange={setActivityOpen} />
    </div>
  );
}
