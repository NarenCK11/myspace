import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { ALL_NAV } from "@/components/layout/nav-items";

const CHORD_TIMEOUT_MS = 1500;

/** True when focus is somewhere the user is actually typing. */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

interface Options {
  onQuickAdd: () => void;
  onCommandPalette: () => void;
  onShortcutHelp: () => void;
}

/**
 * Global shortcuts. Navigation uses a "g then key" chord (g d, g t, ...), which
 * keeps single letters free for future in-page actions.
 *
 * The listener is registered exactly once and reads its callbacks through a ref.
 * Re-registering on every render would reset a half-typed chord whenever an
 * unrelated dependency (such as the router's navigate function) changed identity.
 */
export function useKeyboardShortcuts(options: Options) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const optionsRef = useRef(options);
  const chordActive = useRef(false);
  const chordTimer = useRef<number | null>(null);

  navigateRef.current = navigate;
  optionsRef.current = options;

  useEffect(() => {
    function clearChord() {
      chordActive.current = false;
      if (chordTimer.current !== null) {
        window.clearTimeout(chordTimer.current);
        chordTimer.current = null;
      }
    }

    function handler(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        optionsRef.current.onCommandPalette();
        return;
      }

      if (isTypingTarget(event.target) || event.altKey) return;

      if (chordActive.current) {
        const match = ALL_NAV.find((item) => item.shortcut === event.key.toLowerCase());
        clearChord();
        if (match) {
          event.preventDefault();
          navigateRef.current(match.to);
        }
        return;
      }

      if (meta) return;

      switch (event.key) {
        case "g":
          chordActive.current = true;
          chordTimer.current = window.setTimeout(clearChord, CHORD_TIMEOUT_MS);
          break;
        case "n":
          event.preventDefault();
          optionsRef.current.onQuickAdd();
          break;
        case "/":
          event.preventDefault();
          navigateRef.current("/search");
          break;
        case "?":
          event.preventDefault();
          optionsRef.current.onShortcutHelp();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearChord();
    };
  }, []);
}
