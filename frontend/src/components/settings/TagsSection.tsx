import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { CONTENT_KEYS, fetchTags, keys } from "@/lib/queries";

const COLORS = ["slate", "indigo", "emerald", "amber", "rose", "sky"];

export function TagsSection() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.tags,
    queryFn: fetchTags,
  });

  function invalidate() {
    CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  }

  const create = useMutation({
    mutationFn: (body: { name: string; color: string }) => api.post("/tags", body),
    onSuccess: () => {
      invalidate();
      setName("");
      toast.success("Tag created");
    },
    onError: (caught) => toast.error("Could not create tag", { description: errorMessage(caught) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/tags/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Tag deleted");
    },
    onError: (caught) => toast.error("Could not delete tag", { description: errorMessage(caught) }),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed, color });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Tags</CardTitle>
          <CardDescription>Shared across tasks, reminders, notes and activities.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New tag name"
            maxLength={64}
            aria-label="New tag name"
          />
          <div className="flex gap-2">
            <div className="flex items-center gap-1 rounded-md border border-input bg-surface px-2">
              {COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setColor(value)}
                  aria-label={value}
                  aria-pressed={color === value}
                  className={`size-4 rounded-full ring-offset-1 transition-all ${
                    color === value ? "ring-2 ring-primary" : ""
                  }`}
                  style={{ backgroundColor: colorHex(value) }}
                />
              ))}
            </div>
            <Button type="submit" size="sm" loading={create.isPending} disabled={!name.trim()}>
              <Plus /> Add
            </Button>
          </div>
        </form>

        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <ListSkeleton rows={3} />
        ) : data?.length ? (
          <ul className="divide-y divide-border">
            {data.map((tag) => {
              const usage =
                tag.task_count + tag.note_count + tag.reminder_count + tag.activity_count;
              return (
                <li key={tag.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorHex(tag.color) }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{tag.name}</span>
                  <Badge variant="outline">
                    {usage} use{usage === 1 ? "" : "s"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      if (window.confirm(`Delete the tag "${tag.name}"?`)) remove.mutate(tag.id);
                    }}
                    aria-label={`Delete ${tag.name}`}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={TagIcon}
            title="No tags yet"
            description="Tags help you slice tasks and notes by area of life."
            className="border-0"
          />
        )}
      </CardContent>
    </Card>
  );
}

function colorHex(name: string) {
  const map: Record<string, string> = {
    slate: "#64748b",
    indigo: "#6366f1",
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#f43f5e",
    sky: "#0ea5e9",
  };
  return map[name] ?? map.slate;
}
