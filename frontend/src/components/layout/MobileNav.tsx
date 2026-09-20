import { Plus } from "lucide-react";
import { NavLink } from "react-router-dom";

import { MOBILE_NAV } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

/**
 * Bottom navigation for phones. Four destinations plus a centred quick-add
 * button, sized for thumbs and padded for the home indicator.
 */
export function MobileNav({ onQuickAdd }: { onQuickAdd: () => void }) {
  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-center px-1">
        {MOBILE_NAV.slice(0, 2).map((item) => (
          <MobileNavLink key={item.to} item={item} />
        ))}

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onQuickAdd}
            aria-label="Quick add"
            className="-mt-5 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float transition-transform active:scale-95"
          >
            <Plus className="size-5" />
          </button>
        </div>

        {MOBILE_NAV.slice(2, 4).map((item) => (
          <MobileNavLink key={item.to} item={item} />
        ))}
      </div>
    </nav>
  );
}

function MobileNavLink({ item }: { item: (typeof MOBILE_NAV)[number] }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "flex min-h-[3.5rem] flex-col items-center justify-center gap-1 text-2xs font-medium transition-colors",
          isActive ? "text-primary" : "text-muted-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn("size-[18px]", isActive && "stroke-[2.4]")} />
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}
