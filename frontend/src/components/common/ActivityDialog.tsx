import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { TagSelector } from "@/components/common/TagSelector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/datetime";
import { CONTENT_KEYS } from "@/lib/queries";

export function ActivityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [duration, setDuration] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setOccurredAt(toLocalInputValue(new Date()));
    setDuration("");
    setTagIds([]);
  }, [open]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/activities", body),
    onSuccess: () => {
      CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success("Activity logged");
      onOpenChange(false);
    },
    onError: (error) => toast.error("Could not log activity", { description: errorMessage(error) }),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    mutation.mutate({
      title: trimmed,
      description: description.trim() || null,
      occurred_at: fromLocalInputValue(occurredAt),
      duration_minutes: duration ? Number(duration) : null,
      tag_ids: tagIds,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Log an activity</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5">
            <div className="space-y-1.5">
              <Label htmlFor="activity-title">What did you do?</Label>
              <Input
                id="activity-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Morning run"
                maxLength={300}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="activity-description">Notes</Label>
              <Textarea
                id="activity-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Optional"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="activity-when">When</Label>
                <Input
                  id="activity-when"
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="activity-duration">Duration (minutes)</Label>
                <Input
                  id="activity-duration"
                  type="number"
                  min={0}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  placeholder="e.g. 45"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tags</Label>
              <TagSelector value={tagIds} onChange={setTagIds} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!title.trim()}>
              Log activity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
