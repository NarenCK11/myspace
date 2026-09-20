import {
  Activity,
  Bell,
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  Search,
  Settings,
  StickyNote,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Second key of the "g then <key>" navigation chord. */
  shortcut?: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, shortcut: "d" },
  { to: "/today", label: "Today", icon: Sun, shortcut: "t" },
  { to: "/tasks", label: "Tasks", icon: ListChecks, shortcut: "k" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, shortcut: "c" },
  { to: "/reminders", label: "Reminders", icon: Bell, shortcut: "r" },
  { to: "/notes", label: "Notes", icon: StickyNote, shortcut: "n" },
  { to: "/activities", label: "Activities", icon: Activity, shortcut: "a" },
];

export const SECONDARY_NAV: NavItem[] = [
  { to: "/search", label: "Search", icon: Search, shortcut: "/" },
  { to: "/settings", label: "Settings", icon: Settings, shortcut: "s" },
];

export const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

/** The four destinations pinned to the mobile bottom bar. */
export const MOBILE_NAV: NavItem[] = [
  PRIMARY_NAV[0],
  PRIMARY_NAV[1],
  PRIMARY_NAV[2],
  PRIMARY_NAV[3],
];
