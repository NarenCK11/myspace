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
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/api";
import { CONTENT_KEYS } from "@/lib/queries";
import type { Note } from "@/types/api";

export function NoteDialog({
  open,
  onOpenChange,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note?: Note | null;
}) {
  const editing = Boolean(note);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [important, setImportant] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setPinned(note?.is_pinned ?? false);
    setImportant(note?.is_important ?? false);
    setTagIds(note?.tags.map((tag) => tag.id) ?? []);
  }, [open, note]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing ? api.patch(`/notes/${note!.id}`, body) : api.post("/notes", body),
    onSuccess: () => {
      CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success(editing ? "Note updated" : "Note created");
      onOpenChange(false);
    },
    onError: (error) => toast.error("Could not save note", { description: errorMessage(error) }),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    mutation.mutate({
      title: trimmed,
      content,
      is_pinned: pinned,
      is_important: important,
      tag_ids: tagIds,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit note" : "New note"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5">
            <div className="space-y-1.5">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What do you want to remember?"
                maxLength={300}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note-content">Content</Label>
              <Textarea
                id="note-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={8}
                placeholder="Write it down..."
                className="min-h-[9rem]"
              />
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2.5 text-sm">
                <Switch checked={pinned} onCheckedChange={setPinned} />
                Pin to top
              </label>
              <label className="flex items-center gap-2.5 text-sm">
                <Switch checked={important} onCheckedChange={setImportant} />
                Mark important
              </label>
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
              {editing ? "Save changes" : "Create note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
