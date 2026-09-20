import { useQuery } from "@tanstack/react-query";
import { Check, Tag as TagIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { fetchTags, keys } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface TagSelectorProps {
  value: string[];
  onChange: (next: string[]) => void;
}

/** Toggleable pill list. Tags themselves are managed from Settings. */
export function TagSelector({ value, onChange }: TagSelectorProps) {
  const { data: tags, isLoading } = useQuery({ queryKey: keys.tags, queryFn: fetchTags });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading tags...</p>;
  }

  if (!tags?.length) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TagIcon className="size-3.5" />
        No tags yet — create them in Settings.
      </p>
    );
  }

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const selected = value.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            aria-pressed={selected}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors",
              selected
                ? "border-primary/40 bg-primary-soft text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {selected && <Check className="size-3" />}
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}

export function TagCount({ count, label }: { count: number; label: string }) {
  if (!count) return null;
  return (
    <Badge variant="outline">
      {count} {label}
    </Badge>
  );
}
