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
import type { Priority, Task, TaskStatus } from "@/types/api";

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
}

export function TaskDialog({ open, onOpenChange, task }: TaskDialogProps) {
  const editing = Boolean(task);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueAt, setDueAt] = useState("");
  const [estimate, setEstimate] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? "todo");
    setPriority(task?.priority ?? "medium");
    setDueAt(toLocalInputValue(task?.due_at));
    setEstimate(task?.estimate_minutes ? String(task.estimate_minutes) : "");
    setTagIds(task?.tags.map((tag) => tag.id) ?? []);
  }, [open, task]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing ? api.patch(`/tasks/${task!.id}`, body) : api.post("/tasks", body),
    onSuccess: () => {
      CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success(editing ? "Task updated" : "Task created");
      onOpenChange(false);
    },
    onError: (error) => toast.error("Could not save task", { description: errorMessage(error) }),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    mutation.mutate({
      title: trimmed,
      description: description.trim() || null,
      status,
      priority,
      due_at: fromLocalInputValue(dueAt),
      estimate_minutes: estimate ? Number(estimate) : null,
      tag_ids: tagIds,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs doing?"
                maxLength={300}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Optional details"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-due">Due</Label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-estimate">Estimate (minutes)</Label>
                <Input
                  id="task-estimate"
                  type="number"
                  min={0}
                  value={estimate}
                  onChange={(event) => setEstimate(event.target.value)}
                  placeholder="e.g. 30"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((value) => (
                      <SelectItem key={value} value={value} className="capitalize">
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value.replace("_", " ")}
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
              {editing ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
