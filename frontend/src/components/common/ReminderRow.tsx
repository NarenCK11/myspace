import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlarmClock, Check, MoreHorizontal, Repeat, Trash2, X } from "lucide-react";
import { forwardRef } from "react";
import { toast } from "sonner";

import { TagPills } from "@/components/common/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, isOverdue } from "@/lib/datetime";
import { CONTENT_KEYS } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Reminder } from "@/types/api";

const SNOOZE_OPTIONS = [
  { minutes: 10, label: "10 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 60 * 4, label: "4 hours" },
  { minutes: 60 * 24, label: "Tomorrow" },
];

interface ReminderRowProps {
  reminder: Reminder;
  highlighted?: boolean;
}

/** Ref-forwarding so AnimatePresence can measure the row (see TaskRow). */
export const ReminderRow = forwardRef<HTMLDivElement, ReminderRowProps>(function ReminderRow(
  { reminder, highlighted },
  ref,
) {
  const queryClient = useQueryClient();
  const pending = reminder.status === "pending";
  const at = reminder.snoozed_until ?? reminder.remind_at;
  const overdue = pending && isOverdue(at);

  function invalidate() {
    CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  }

  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) =>
      api.post(`/reminders/${reminder.id}/${action}`, body ?? {}),
    onSuccess: invalidate,
    onError: (error) => toast.error("Could not update reminder", { description: errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/reminders/${reminder.id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Reminder deleted", { description: reminder.title });
    },
    onError: (error) => toast.error("Could not delete reminder", { description: errorMessage(error) }),
  });

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group flex items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:shadow-subtle",
        !pending && "opacity-60",
        highlighted && "ring-2 ring-primary/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
          overdue ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
        )}
      >
        <AlarmClock className="size-4" />
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-sm leading-snug", !pending && "line-through")}>{reminder.title}</p>
          {reminder.repeat_rule !== "none" && (
            <Badge variant="default">
              <Repeat className="size-2.5" />
              {reminder.repeat_rule}
            </Badge>
          )}
          {reminder.status === "dismissed" && <Badge variant="outline">Dismissed</Badge>}
        </div>

        {reminder.notes && <p className="line-clamp-2 text-xs text-muted-foreground">{reminder.notes}</p>}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn("text-2xs", overdue ? "font-medium text-danger" : "text-muted-foreground")}>
            {formatDateTime(at)}
            {reminder.snoozed_until && " (snoozed)"}
          </span>
          <TagPills tags={reminder.tags} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {pending && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => act.mutate({ action: "complete" })}
            disabled={act.isPending}
            aria-label={`Complete ${reminder.title}`}
          >
            <Check />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${reminder.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {pending && (
              <>
                <DropdownMenuLabel>Snooze</DropdownMenuLabel>
                {SNOOZE_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.minutes}
                    onSelect={() => act.mutate({ action: "snooze", body: { minutes: option.minutes } })}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => act.mutate({ action: "dismiss" })}>
                  <X /> Dismiss
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem destructive onSelect={() => remove.mutate()}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
});
