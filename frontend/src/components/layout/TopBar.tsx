import { Check, Keyboard, LogOut, Menu, Monitor, Moon, Plus, Search, Sun, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { SidebarNav } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { cn, initials } from "@/lib/utils";
import type { Theme } from "@/types/api";

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

interface TopBarProps {
  onQuickAdd: () => void;
  onCommandPalette: () => void;
  onShortcutHelp: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

export function TopBar({
  onQuickAdd,
  onCommandPalette,
  onShortcutHelp,
  mobileNavOpen,
  setMobileNavOpen,
}: TopBarProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      <div className="flex items-center gap-2 lg:hidden">
        <span className="text-sm font-semibold tracking-tight">MySpace</span>
      </div>

      {/* Desktop: a command-palette launcher that looks like a search field. */}
      <button
        type="button"
        onClick={onCommandPalette}
        className={cn(
          "hidden h-9 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-surface px-3",
          "text-sm text-muted-foreground shadow-subtle transition-colors hover:bg-muted lg:flex",
        )}
      >
        <Search className="size-4" />
        <span>Search or jump to...</span>
        <kbd className="kbd ml-auto">Ctrl K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={() => navigate("/search")}
          aria-label="Search"
        >
          <Search />
        </Button>

        <Button size="sm" onClick={onQuickAdd} className="hidden sm:inline-flex">
          <Plus /> Quick add
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-2xs font-semibold text-primary-foreground shadow-subtle transition-transform hover:scale-105"
              aria-label="Account menu"
            >
              {initials(user?.display_name ?? "Owner")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user?.display_name ?? "Owner"}</DropdownMenuLabel>
            <p className="px-2 pb-1.5 text-2xs text-muted-foreground">{user?.timezone}</p>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
                <Icon />
                {label}
                {theme === value && <Check className="ml-auto size-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              <User /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onShortcutHelp}>
              <Keyboard /> Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void logout()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile navigation drawer. */}
      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent className="left-0 top-0 h-dvh w-[17rem] max-w-[85vw] translate-x-0 translate-y-0 rounded-none rounded-r-xl data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
          <DialogHeader className="pb-2">
            <DialogTitle>MySpace</DialogTitle>
          </DialogHeader>
          <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
        </DialogContent>
      </Dialog>
    </header>
  );
}
