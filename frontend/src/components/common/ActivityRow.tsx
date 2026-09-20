import { CheckCircle2, CirclePlus, Clock, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { TagPills } from "@/components/common/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { formatTime } from "@/lib/datetime";
import { CONTENT_KEYS } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Activity } from "@/types/api";

const ACTION_ICON: Record<string, typeof CheckCircle2> = {
  created: CirclePlus,
  completed: CheckCircle2,
  deleted: Trash2,
};

export function ActivityRow({ activity, highlighted }: { activity: Activity; highlighted?: boolean }) {
  const queryClient = useQueryClient();
  const isSystem = activity.source === "system";
  const Icon = (activity.action && ACTION_ICON[activity.action]) || Clock;

  const remove = useMutation({
    mutationFn: () => api.delete(`/activities/${activity.id}`),
    onSuccess: () => {
      CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success("Entry removed");
    },
    onError: (error) => toast.error("Could not remove entry", { description: errorMessage(error) }),
  });

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60",
        highlighted && "ring-2 ring-primary/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          isSystem ? "bg-muted text-muted-foreground" : "bg-success-soft text-success",
        )}
      >
        <Icon className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm leading-snug">{activity.title}</p>
        {activity.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{activity.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
          <span>{formatTime(activity.occurred_at)}</span>
          {activity.duration_minutes ? <span>· {activity.duration_minutes} min</span> : null}
          {isSystem && <Badge variant="outline">Auto</Badge>}
          <TagPills tags={activity.tags} />
        </div>
      </div>

      {!isSystem && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-100"
          onClick={() => remove.mutate()}
          aria-label={`Remove ${activity.title}`}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}
