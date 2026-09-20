import { NavLink } from "react-router-dom";

import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden
            className={cn(
              "absolute left-0 h-4 w-[3px] rounded-r-full bg-primary transition-opacity",
              isActive ? "opacity-100" : "opacity-0",
            )}
          />
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{item.label}</span>
          {item.shortcut && (
            <kbd className="kbd ml-auto opacity-0 transition-opacity group-hover:opacity-100">
              g {item.shortcut}
            </kbd>
          )}
        </>
      )}
    </NavLink>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="Main">
      <div className="space-y-0.5">
        {PRIMARY_NAV.map((item) => (
          <NavRow key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="space-y-0.5">
        <p className="px-3 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          More
        </p>
        {SECONDARY_NAV.map((item) => (
          <NavRow key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

export function Sidebar({ children }: { children?: React.ReactNode }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface-sunken lg:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-subtle">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
            <path
              d="M6 17V8l6 5 6-5v9"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="text-sm font-semibold tracking-tight">MySpace</span>
      </div>
      <SidebarNav />
      {children}
    </aside>
  );
}
