import { useEffect, useRef } from "react";
import { toast, usePersistedState } from "@soft-machine/sdk";
import { deadlineMs, formatDue, hasTime } from "./dates";
import type { KanbanStore } from "./store";

/**
 * Per-viewer reminders. Every client toasts its own reminders; a user-scoped
 * persisted set dedupes across reloads and panels, and a module-scope set
 * dedupes two panels in the same tab racing within one tick.
 */
const firedThisSession = new Set<string>();

export function useReminders(store: KanbanStore | null, enabled: boolean, onOpen: (cardId: string) => void) {
  const [reminded, setReminded] = usePersistedState("kanban", "reminded", {} as Record<string, number>, { scope: "user" }) as [
    Record<string, number>,
    (value: Record<string, number>) => void,
  ];
  const remindedRef = useRef(reminded);
  remindedRef.current = reminded;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!store || !enabled) return;
    const check = () => {
      const now = Date.now();
      const derived = store.getDerived();
      const updates: Record<string, number> = {};
      for (const board of derived.boards) {
        for (const card of derived.cardsByBoard[board.id] ?? []) {
          if (card.completedAt || card.reminderMinutes === null || card.reminderMinutes < 0 || !card.dueAt) continue;
          const due = deadlineMs(card.dueAt);
          if (due === null) continue;
          // Date-only due dates remind relative to 09:00 that day.
          const anchor = hasTime(card.dueAt) ? due : due - 15 * 3_600_000;
          const fireAt = anchor - card.reminderMinutes * 60_000;
          const key = `${card.id}:${card.dueAt}:${card.reminderMinutes}`;
          if (fireAt > now) continue;
          if (now - fireAt > 6 * 3_600_000) continue; // too old, skip silently
          if (firedThisSession.has(key) || remindedRef.current[key]) continue;
          firedThisSession.add(key);
          updates[key] = now;
          const cardId = card.id;
          toast(card.title, {
            description: card.reminderMinutes === 0 ? `Due ${formatDue(card.dueAt).toLowerCase()}` : `Due in ${card.reminderMinutes} minutes · ${formatDue(card.dueAt)}`,
            duration: 30_000,
            action: { label: "Open", onClick: () => onOpenRef.current(cardId) },
          });
        }
      }
      if (Object.keys(updates).length > 0) {
        // Keep the persisted set bounded.
        const merged = { ...remindedRef.current, ...updates };
        const entries = Object.entries(merged)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 500);
        setReminded(Object.fromEntries(entries));
      }
    };
    check();
    const interval = window.setInterval(check, 30_000);
    return () => window.clearInterval(interval);
  }, [store, enabled, setReminded]);
}
