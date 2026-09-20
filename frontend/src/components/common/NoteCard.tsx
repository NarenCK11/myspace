import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Archive, MoreHorizontal, Pencil, Pin, Star, Trash2 } from "lucide-react";
import { forwardRef } from "react";
import { toast } from "sonner";

import { TagPills } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/datetime";
import { CONTENT_KEYS } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Note } from "@/types/api";

interface NoteCardProps {
  note: Note;
  onEdit?: (note: Note) => void;
  highlighted?: boolean;
}

/** Ref-forwarding so AnimatePresence can measure the card (see TaskRow). */
export const NoteCard = forwardRef<HTMLElement, NoteCardProps>(function NoteCard(
  { note, onEdit, highlighted },
  ref,
) {
  const queryClient = useQueryClient();

  function invalidate() {
    CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  }

  const patch = useMutation({
    mutationFn: (body: Partial<Note>) => api.patch(`/notes/${note.id}`, body),
    onSuccess: invalidate,
    onError: (error) => toast.error("Could not update note", { description: errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/notes/${note.id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Note deleted", { description: note.title });
    },
    onError: (error) => toast.error("Could not delete note", { description: errorMessage(error) }),
  });

  return (
    <motion.article
      ref={ref}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group flex h-full flex-col rounded-lg border border-border bg-surface p-4 transition-all",
        "hover:-translate-y-0.5 hover:shadow-raised",
        note.is_important && "border-warning/40 bg-warning-soft/40",
        highlighted && "ring-2 ring-primary/40",
      )}
    >
      <div className="mb-1.5 flex items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{note.title}</h3>
        <div className="flex shrink-0 items-center gap-0.5">
          {note.is_pinned && <Pin className="size-3.5 text-primary" aria-label="Pinned" />}
          {note.is_important && <Star className="size-3.5 fill-warning text-warning" aria-label="Important" />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 max-lg:opacity-100"
                aria-label={`Actions for ${note.title}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onSelect={() => onEdit(note)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => patch.mutate({ is_pinned: !note.is_pinned })}>
                <Pin /> {note.is_pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => patch.mutate({ is_important: !note.is_important })}>
                <Star /> {note.is_important ? "Remove importance" : "Mark important"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => patch.mutate({ is_archived: !note.is_archived })}>
                <Archive /> {note.is_archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => remove.mutate()}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {note.content && (
        <p className="line-clamp-5 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {note.content}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
        <TagPills tags={note.tags} />
        <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
          {formatRelative(note.updated_at)}
        </span>
      </div>
    </motion.article>
  );
});
