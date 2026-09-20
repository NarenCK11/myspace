import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";

import { CommandPalette } from "@/components/common/CommandPalette";
import { QuickAdd } from "@/components/common/QuickAdd";
import { ShortcutHelp } from "@/components/common/ShortcutHelp";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export function AppShell() {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openQuickAdd = useCallback(() => setQuickAddOpen(true), []);
  const openPalette = useCallback(() => setPaletteOpen((value) => !value), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);

  useKeyboardShortcuts({
    onQuickAdd: openQuickAdd,
    onCommandPalette: openPalette,
    onShortcutHelp: openHelp,
  });

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onQuickAdd={openQuickAdd}
          onCommandPalette={openPalette}
          onShortcutHelp={openHelp}
          mobileNavOpen={mobileNavOpen}
          setMobileNavOpen={setMobileNavOpen}
        />

        <main className="flex-1 overflow-y-auto overscroll-contain">
          {/* Bottom padding clears the mobile navigation bar. */}
          <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:pb-10">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNav onQuickAdd={openQuickAdd} />

      <QuickAdd open={quickAddOpen} onOpenChange={setQuickAddOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onQuickAdd={openQuickAdd} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
