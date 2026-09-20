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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/datetime";
import { CONTENT_KEYS } from "@/lib/queries";
import type { Reminder, RepeatRule } from "@/types/api";

const REPEATS: RepeatRule[] = ["none", "daily", "weekly", "monthly", "yearly"];

function defaultRemindAt() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return toLocalInputValue(date);
}

export function ReminderDialog({
  open,
  onOpenChange,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder?: Reminder | null;
}) {
  const editing = Boolean(reminder);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [remindAt, setRemindAt] = useState(defaultRemindAt);
  const [repeat, setRepeat] = useState<RepeatRule>("none");
  const [tagIds, setTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle(reminder?.title ?? "");
    setNotes(reminder?.notes ?? "");
    setRemindAt(reminder ? toLocalInputValue(reminder.remind_at) : defaultRemindAt());
    setRepeat(reminder?.repeat_rule ?? "none");
    setTagIds(reminder?.tags.map((tag) => tag.id) ?? []);
  }, [open, reminder]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing ? api.patch(`/reminders/${reminder!.id}`, body) : api.post("/reminders", body),
    onSuccess: () => {
      CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success(editing ? "Reminder updated" : "Reminder created");
      onOpenChange(false);
    },
    onError: (error) => toast.error("Could not save reminder", { description: errorMessage(error) }),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    const when = fromLocalInputValue(remindAt);
    if (!trimmed || !when) {
      toast.error("A title and a time are both required.");
      return;
    }
    mutation.mutate({
      title: trimmed,
      notes: notes.trim() || null,
      remind_at: when,
      repeat_rule: repeat,
      tag_ids: tagIds,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit reminder" : "New reminder"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-title">Title</Label>
              <Input
                id="reminder-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What should I remind you about?"
                maxLength={300}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reminder-notes">Notes</Label>
              <Textarea
                id="reminder-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Optional"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reminder-at">Remind at</Label>
                <Input
                  id="reminder-at"
                  type="datetime-local"
                  value={remindAt}
                  onChange={(event) => setRemindAt(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Repeat</Label>
                <Select value={repeat} onValueChange={(value) => setRepeat(value as RepeatRule)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPEATS.map((value) => (
                      <SelectItem key={value} value={value} className="capitalize">
                        {value === "none" ? "Does not repeat" : value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              {editing ? "Save changes" : "Create reminder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
