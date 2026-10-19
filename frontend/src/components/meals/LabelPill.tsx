import { labelColor } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import type { FoodLabel } from "@/types/api";

interface LabelPillProps {
  label: Pick<FoodLabel, "name" | "color">;
  className?: string;
  count?: number;
}

/**
 * The colour lives on the dot and a faint wash, never on the text: label text
 * always uses the normal ink so every colour stays legible in both themes.
 */
export function LabelPill({ label, className, count }: LabelPillProps) {
  const hex = labelColor(label.color);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium text-foreground",
        className,
      )}
      style={{ backgroundColor: `${hex}1a`, borderColor: `${hex}55` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} aria-hidden />
      {label.name}
      {count !== undefined && <span className="tabular-nums text-muted-foreground">{count}</span>}
    </span>
  );
}
