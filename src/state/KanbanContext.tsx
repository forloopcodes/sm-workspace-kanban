import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast, useCollabDoc, useCurrentUser, usePersistedState, usePresence } from "@soft-machine/sdk";
import { registerStore } from "./bus";
import { CARD_SOFT_CAP, CARD_WARN_AT, KanbanStore, type MirrorPayload } from "./store";
import type { DragPresence, KanbanPresence, Peer, Viewer } from "./types";

export const DOC_ID = "workspace-kanban";
const DEFAULT_BOARD_NAME = "Workspace";

const EMPTY_PRESENCE: KanbanPresence = { boardId: null, viewingCardId: null, editingCardId: null, editingField: null };
const EMPTY_DRAG: DragPresence = { draggingCardId: null, overColumnId: null };
const EMPTY_PEERS: never[] = [];

export type PanelKind = "board" | "tasks";

export interface KanbanContextValue {
  store: KanbanStore | null;
  ready: boolean;
  unavailable: boolean;
  /** True for the first mounted provider in this tab; per-tab side effects run here only. */
  primary: boolean;
  viewer: Viewer;
  /** Peers from both panel kinds (board presence and tasks presence). */
  peers: Peer<KanbanPresence>[];
  dragPeers: Peer<DragPresence>[];
  setPresence: (patch: Partial<KanbanPresence>) => void;
  setDragPresence: (patch: Partial<DragPresence>) => void;
  clientId: number | null;
}

const KanbanContext = createContext<KanbanContextValue | null>(null);

interface CollabResult {
  doc: unknown;
  awareness: unknown;
  ready: boolean;
  unavailable?: boolean;
  failed?: boolean;
}

interface AwarenessLike {
  clientID?: number;
  getStates?: () => Map<number, unknown>;
}

function noopSubscribe() {
  return () => {};
}

export function KanbanProvider({ children, kind }: { children: ReactNode; kind: PanelKind }) {
  const collab = useCollabDoc(DOC_ID) as unknown as CollabResult;
  const doc = collab.doc as KanbanStore["doc"] | null;
  const awareness = collab.awareness as AwarenessLike | null;
  const ready = Boolean(collab.ready) && Boolean(doc);
  const unavailable = Boolean(collab.unavailable ?? collab.failed);
  const currentUser = useCurrentUser() as { id: string | null; name: string; avatarUrl: string | null };

  const viewer = useMemo<Viewer>(
    () => ({ id: currentUser?.id ?? null, name: currentUser?.name || "You", avatarUrl: currentUser?.avatarUrl ?? null }),
    [currentUser?.id, currentUser?.name, currentUser?.avatarUrl]
  );

  const store = useMemo(() => (doc ? KanbanStore.forDoc(doc) : null), [doc]);

  // Retain the pooled store; the first holder becomes "primary" for per-tab side effects.
  const [token, setToken] = useState<symbol | null>(null);
  useEffect(() => {
    if (!store) return;
    const handle = store.retain();
    const unregister = registerStore(store);
    setToken(handle.token);
    return () => {
      handle.release();
      unregister();
      setToken(null);
    };
  }, [store]);
  const subscribePrimary = useCallback((listener: () => void) => (store ? store.subscribePrimary(listener) : noopSubscribe()), [store]);
  const primary = useSyncExternalStore(
    subscribePrimary,
    () => Boolean(store && token && store.isPrimary(token)),
    () => false
  );

  useEffect(() => {
    if (store) store.viewer = viewer;
  }, [store, viewer]);

  // Automation notifications → toasts (once per tab).
  useEffect(() => {
    if (!store || !primary) return;
    return store.onNotify((message) => toast(message));
  }, [store, primary]);

  // Mirror for fork survival: write debounced, read only into an empty, never-seeded doc.
  const [mirror, setMirror] = usePersistedState("kanban", "mirror", null as MirrorPayload | null, { tier: "lazy" }) as [
    MirrorPayload | null,
    (value: MirrorPayload | null) => void,
  ];
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;
  const seededRef = useRef(false);

  useEffect(() => {
    if (!store || !ready || !primary || seededRef.current) return;
    // Give the initial sync a moment to land before deciding the doc is empty.
    const timer = window.setTimeout(() => {
      if (seededRef.current) return;
      seededRef.current = true;
      if (!store.isEmpty() || store.isSeeded()) return;
      if (mirrorRef.current && mirrorRef.current.boards?.length) {
        store.seedFromMirror(mirrorRef.current);
        store.clearHistory();
        toast("Kanban restored from the workspace mirror");
        return;
      }
      store.createBoard({ name: DEFAULT_BOARD_NAME, templateId: "basic", withStarterCards: true, deterministicKey: "default" });
      store.markSeeded();
      store.clearHistory();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [store, ready, primary]);

  useEffect(() => {
    if (!store || !ready || !primary) return;
    let timer: number | null = null;
    const unsubscribe = store.subscribe(() => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (!store.isEmpty()) setMirror(store.toMirror());
      }, 4000);
    });
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [store, ready, primary, setMirror]);

  // Timed automations: run from the lowest connected clientID only (stale peers just delay
  // by the awareness timeout); the per-card stamp makes a rare double run converge.
  useEffect(() => {
    if (!store || !ready || !primary) return;
    const isElected = () => {
      const states = awareness?.getStates?.();
      const self = awareness?.clientID;
      if (!states || self === undefined) return true;
      let min = Infinity;
      states.forEach((_value, clientId) => {
        if (clientId < min) min = clientId;
      });
      return min === Infinity || min === self;
    };
    const run = () => {
      if (isElected()) store.runTimedAutomations(new Date());
    };
    const initial = window.setTimeout(run, 2000);
    const interval = window.setInterval(run, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [store, ready, primary, awareness]);

  // Soft card cap: warn once per tab when the workspace document is getting large.
  const capWarned = useRef(false);
  useEffect(() => {
    if (!store || !ready || !primary) return;
    const check = () => {
      if (capWarned.current) return;
      const count = store.getDerived().activeCardCount;
      if (count >= CARD_WARN_AT) {
        capWarned.current = true;
        toast.warning(`${count} active cards in this workspace`, {
          description: `Archive finished cards to keep boards fast (soft limit ${CARD_SOFT_CAP}).`,
        });
      }
    };
    check();
    return store.subscribe(check);
  }, [store, ready, primary]);

  // Presence. Each panel kind publishes its own field so a Tasks panel never
  // clobbers the Board panel's "viewing board X"; consumers see both.
  const [presence, setPresenceState] = useState<KanbanPresence>(EMPTY_PRESENCE);
  const [drag, setDragState] = useState<DragPresence>(EMPTY_DRAG);
  const ownField = kind === "board" ? "kanban" : "kanban-tasks";
  const otherField = kind === "board" ? "kanban-tasks" : "kanban";
  const ownPeers = usePresence(awareness as never, presence, { field: ownField }) as unknown as Peer<KanbanPresence>[];
  const otherPeers = usePresence(awareness as never, null, { field: otherField }) as unknown as Peer<KanbanPresence>[];
  const dragPeers = usePresence(awareness as never, drag, { field: kind === "board" ? "drags" : "drags-tasks" }) as unknown as Peer<DragPresence>[];
  const peers = useMemo(() => {
    const own = ownPeers ?? EMPTY_PEERS;
    const other = otherPeers ?? EMPTY_PEERS;
    return other.length === 0 ? own : [...own, ...other];
  }, [ownPeers, otherPeers]);

  const setPresence = useCallback((patch: Partial<KanbanPresence>) => {
    setPresenceState((prev) => {
      const next = { ...prev, ...patch };
      return next.boardId === prev.boardId &&
        next.viewingCardId === prev.viewingCardId &&
        next.editingCardId === prev.editingCardId &&
        next.editingField === prev.editingField
        ? prev
        : next;
    });
  }, []);
  const setDragPresence = useCallback((patch: Partial<DragPresence>) => {
    setDragState((prev) => {
      const next = { ...prev, ...patch };
      return next.draggingCardId === prev.draggingCardId && next.overColumnId === prev.overColumnId ? prev : next;
    });
  }, []);

  const value = useMemo<KanbanContextValue>(
    () => ({
      store,
      ready,
      unavailable,
      primary,
      viewer,
      peers,
      dragPeers: dragPeers ?? EMPTY_PEERS,
      setPresence,
      setDragPresence,
      clientId: awareness?.clientID ?? null,
    }),
    [store, ready, unavailable, primary, viewer, peers, dragPeers, setPresence, setDragPresence, awareness?.clientID]
  );

  return <KanbanContext.Provider value={value}>{children}</KanbanContext.Provider>;
}

export function useKanban(): KanbanContextValue {
  const context = useContext(KanbanContext);
  if (!context) throw new Error("useKanban must be used within KanbanProvider");
  return context;
}
