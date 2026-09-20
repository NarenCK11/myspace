import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Bell, ListChecks, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/datetime";
import { CONTENT_KEYS, quickAdd } from "@/lib/queries";
import type { Priority, QuickAddKind } from "@/types/api";

const KINDS: { value: QuickAddKind; label: string; icon: typeof ListChecks; placeholder: string }[] = [
  { value: "task", label: "Task", icon: ListChecks, placeholder: "What needs doing?" },
  { value: "reminder", label: "Reminder", icon: Bell, placeholder: "What should I remind you about?" },
  { value: "note", label: "Note", icon: StickyNote, placeholder: "What do you want to remember?" },
  { value: "activity", label: "Activity", icon: Activity, placeholder: "What did you do?" },
];

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

function defaultWhen(kind: QuickAddKind) {
  if (kind === "note") return "";
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return toLocalInputValue(date);
}

export function QuickAdd({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [kind, setKind] = useState<QuickAddKind>("task");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState(() => defaultWhen("task"));
  const [priority, setPriority] = useState<Priority>("medium");
  const titleRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Reset to a clean form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setPriority("medium");
    setWhen(defaultWhen(kind));
    const timer = window.setTimeout(() => titleRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setWhen(defaultWhen(kind));
  }, [kind]);

  const mutation = useMutation({
    mutationFn: quickAdd,
    onSuccess: (result) => {
      CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success(`${result.kind[0].toUpperCase()}${result.kind.slice(1)} added`, {
        description: result.title,
      });
      onOpenChange(false);
    },
    onError: (error) => toast.error("Could not save", { description: errorMessage(error) }),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      titleRef.current?.focus();
      return;
    }
    mutation.mutate({
      kind,
      title: trimmed,
      body: body.trim() || null,
      when: kind === "note" ? null : fromLocalInputValue(when),
      priority,
    });
  }

  const active = KINDS.find((item) => item.value === kind)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Quick add</DialogTitle>
            <DialogDescription>Capture it now, organise it later.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5">
            <Tabs value={kind} onValueChange={(value) => setKind(value as QuickAddKind)}>
              <TabsList className="w-full">
                {KINDS.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger key={value} value={value} className="flex-1">
                    <Icon className="size-3.5" />
                    <span>{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="space-y-1.5">
              <Label htmlFor="quick-title">Title</Label>
              <Input
                id="quick-title"
                ref={titleRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={active.placeholder}
                maxLength={300}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quick-body">{kind === "note" ? "Content" : "Details"}</Label>
              <Textarea
                id="quick-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Optional"
                rows={3}
              />
            </div>

            {kind !== "note" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="quick-when">
                    {kind === "task" ? "Due" : kind === "reminder" ? "Remind at" : "Happened at"}
                  </Label>
                  <Input
                    id="quick-when"
                    type="datetime-local"
                    value={when}
                    onChange={(event) => setWhen(event.target.value)}
                  />
                </div>
                {kind === "task" && (
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
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!title.trim()}>
              Add {active.label.toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
