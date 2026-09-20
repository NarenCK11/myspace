import { cva } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Priority, Tag } from "@/types/api";

/** Priority dot + label. Colour carries urgency; the label carries meaning. */
const priorityDot = cva("size-1.5 shrink-0 rounded-full", {
  variants: {
    priority: {
      low: "bg-muted-foreground/50",
      medium: "bg-info",
      high: "bg-warning",
      urgent: "bg-danger",
    },
  },
});

export function PriorityMark({ priority, showLabel }: { priority: Priority; showLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
      <span className={priorityDot({ priority })} aria-hidden />
      {showLabel && <span className="capitalize">{priority}</span>}
      <span className="sr-only">{priority} priority</span>
    </span>
  );
}

export function TagPills({ tags, className }: { tags: Tag[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {tags.map((tag) => (
        <Badge key={tag.id} variant="outline">
          {tag.name}
        </Badge>
      ))}
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "danger" | "success" | "warning" | "info";
  onClick?: () => void;
}

const toneStyles: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

export function StatCard({ label, value, hint, icon: Icon, tone = "default", onClick }: StatCardProps) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "card-surface flex items-start gap-3 p-4 text-left transition-all",
        onClick && "hover:-translate-y-0.5 hover:shadow-raised active:translate-y-0",
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", toneStyles[tone])}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="block text-2xl font-semibold leading-tight tracking-tight tabular-nums">
          {value}
        </span>
        {hint && <span className="block text-xs leading-snug text-muted-foreground">{hint}</span>}
      </span>
    </Wrapper>
  );
}

/** Thin progress bar used for the daily completion rate. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-spring"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function SectionTitle({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        {children}
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}
