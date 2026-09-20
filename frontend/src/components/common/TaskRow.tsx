import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarClock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { forwardRef } from "react";
import { toast } from "sonner";

import { PriorityMark, TagPills } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, isOverdue } from "@/lib/datetime";
import { CONTENT_KEYS } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/api";

interface TaskRowProps {
  task: Task;
  onEdit?: (task: Task) => void;
  highlighted?: boolean;
}

/**
 * Forwards a ref to the animated element: AnimatePresence in popLayout mode
 * measures its children, which it cannot do through a plain function component.
 */
export const TaskRow = forwardRef<HTMLDivElement, TaskRowProps>(function TaskRow(
  { task, onEdit, highlighted },
  ref,
) {
  const queryClient = useQueryClient();
  const done = task.status === "done";
  const overdue = !done && isOverdue(task.due_at);

  function invalidate() {
    CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  }

  const toggle = useMutation({
    mutationFn: () => api.post(`/tasks/${task.id}/${done ? "reopen" : "complete"}`),
    onSuccess: invalidate,
    onError: (error) => toast.error("Could not update task", { description: errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/tasks/${task.id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Task deleted", { description: task.title });
    },
    onError: (error) => toast.error("Could not delete task", { description: errorMessage(error) }),
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
        "group flex items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-colors",
        "hover:border-border hover:bg-surface-raised hover:shadow-subtle",
        done && "opacity-60",
        highlighted && "ring-2 ring-primary/40",
      )}
    >
      <Checkbox
        checked={done}
        onCheckedChange={() => toggle.mutate()}
        disabled={toggle.isPending}
        className="mt-0.5"
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
      />

      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn("text-sm leading-snug", done && "line-through")}>{task.title}</p>

        {task.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <PriorityMark priority={task.priority} />
          {task.due_at && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-2xs",
                overdue ? "font-medium text-danger" : "text-muted-foreground",
              )}
            >
              <CalendarClock className="size-3" />
              {formatDateTime(task.due_at)}
            </span>
          )}
          <TagPills tags={task.tags} />
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 max-lg:opacity-100"
            aria-label={`Actions for ${task.title}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onEdit && (
            <DropdownMenuItem onSelect={() => onEdit(task)}>
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem destructive onSelect={() => remove.mutate()}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  );
});
