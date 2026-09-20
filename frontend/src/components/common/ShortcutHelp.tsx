import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "General",
    items: [
      { keys: ["Ctrl", "K"], label: "Open command palette" },
      { keys: ["N"], label: "Quick add" },
      { keys: ["/"], label: "Go to search" },
      { keys: ["?"], label: "Show this help" },
      { keys: ["Esc"], label: "Close dialog" },
    ],
  },
  {
    title: "Navigation",
    items: [
      { keys: ["G", "D"], label: "Dashboard" },
      { keys: ["G", "T"], label: "Today" },
      { keys: ["G", "K"], label: "Tasks" },
      { keys: ["G", "C"], label: "Calendar" },
      { keys: ["G", "R"], label: "Reminders" },
      { keys: ["G", "N"], label: "Notes" },
      { keys: ["G", "A"], label: "Activities" },
      { keys: ["G", "S"], label: "Settings" },
    ],
  },
];

export function ShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 px-5 pb-6 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group.title} className="space-y-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="flex shrink-0 gap-1">
                      {item.keys.map((key) => (
                        <kbd key={key} className="kbd">
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
