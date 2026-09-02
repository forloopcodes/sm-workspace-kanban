import { useEffect } from "react";
import type { KanbanStore } from "./store";

/**
 * Module-scope plumbing that lets module-level hooks (commands, undo/redo)
 * reach the panel instances that are actually mounted. Only definitions live
 * here — no timers, sockets or DOM access at import time.
 */

export type PanelKind = "board" | "tasks";

type Handler = (payload?: unknown) => void;

interface Registration {
  instanceId: string;
  kind: PanelKind;
  handlers: Map<string, Handler>;
}

const registrations = new Map<string, Registration>();
const activeByKind: Record<PanelKind, string | null> = { board: null, tasks: null };
const activeListeners = new Set<() => void>();

export function registerPanel(instanceId: string, kind: PanelKind): () => void {
  registrations.set(instanceId, { instanceId, kind, handlers: new Map() });
  if (!activeByKind[kind]) setActivePanel(instanceId, kind);
  return () => {
    registrations.delete(instanceId);
    if (activeByKind[kind] === instanceId) {
      const next = Array.from(registrations.values()).find((r) => r.kind === kind);
      setActivePanel(next?.instanceId ?? null, kind);
    }
  };
}

export function setActivePanel(instanceId: string | null, kind: PanelKind) {
  if (activeByKind[kind] === instanceId) return;
  activeByKind[kind] = instanceId;
  activeListeners.forEach((listener) => listener());
}

export function getActivePanel(kind: PanelKind): string | null {
  return activeByKind[kind];
}

export function subscribeActive(listener: () => void): () => void {
  activeListeners.add(listener);
  return () => activeListeners.delete(listener);
}

export function emitCommand(kind: PanelKind, command: string, payload?: unknown): boolean {
  const activeId = activeByKind[kind];
  const target = (activeId && registrations.get(activeId)) || Array.from(registrations.values()).find((r) => r.kind === kind);
  const handler = target?.handlers.get(command);
  if (!handler) return false;
  handler(payload);
  return true;
}

export function useCommandHandler(instanceId: string, command: string, handler: Handler) {
  useEffect(() => {
    const registration = registrations.get(instanceId);
    if (!registration) return;
    registration.handlers.set(command, handler);
    return () => {
      const current = registrations.get(instanceId);
      if (current && current.handlers.get(command) === handler) current.handlers.delete(command);
    };
  }, [instanceId, command, handler]);
}

// Active store registry (module-level undo/redo) --------------------------------

const stores = new Set<KanbanStore>();
const storeListeners = new Set<() => void>();

export function registerStore(store: KanbanStore): () => void {
  stores.add(store);
  storeListeners.forEach((listener) => listener());
  return () => {
    stores.delete(store);
    storeListeners.forEach((listener) => listener());
  };
}

export function getActiveStore(): KanbanStore | null {
  return stores.values().next().value ?? null;
}

export function subscribeStores(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}
