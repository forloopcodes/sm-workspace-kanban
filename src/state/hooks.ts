import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useKanban } from "./KanbanContext";
import type { Derived, KanbanStore, Snapshot } from "./store";
import type { ActivityEntry, Assignee, Board, Card, Column, Comment } from "./types";

const EMPTY_SNAPSHOT: Snapshot = { version: 0, boards: {}, columns: {}, cards: {}, comments: {}, activity: {} };
const EMPTY_DERIVED: Derived = {
  boards: [],
  columnsByBoard: {},
  cardsByColumn: {},
  cardsByBoard: {},
  archivedByBoard: {},
  commentsByCard: {},
  activityByCard: {},
  members: [],
  activeCardCount: 0,
};
const EMPTY_ARRAY: never[] = [];

function noopSubscribe() {
  return () => {};
}

export function useStore(): KanbanStore {
  const { store } = useKanban();
  if (!store) throw new Error("Kanban store is not ready");
  return store;
}

export function useSnapshot(): Snapshot {
  const { store } = useKanban();
  const subscribe = useCallback((listener: () => void) => (store ? store.subscribe(listener) : noopSubscribe()), [store]);
  return useSyncExternalStore(subscribe, store ? store.getSnapshot : () => EMPTY_SNAPSHOT, store ? store.getSnapshot : () => EMPTY_SNAPSHOT);
}

export function useDerived(): Derived {
  const { store } = useKanban();
  const snapshot = useSnapshot();
  return useMemo(() => (store ? store.getDerived(snapshot) : EMPTY_DERIVED), [store, snapshot]);
}

export function useBoards(): Board[] {
  return useDerived().boards;
}

export function useBoard(boardId: string | null | undefined): Board | null {
  const snapshot = useSnapshot();
  return boardId ? (snapshot.boards[boardId] ?? null) : null;
}

export function useColumns(boardId: string | null | undefined): Column[] {
  const derived = useDerived();
  return boardId ? (derived.columnsByBoard[boardId] ?? EMPTY_ARRAY) : EMPTY_ARRAY;
}

export function useColumnCards(columnId: string | null | undefined): Card[] {
  const derived = useDerived();
  return columnId ? (derived.cardsByColumn[columnId] ?? EMPTY_ARRAY) : EMPTY_ARRAY;
}

export function useBoardCards(boardId: string | null | undefined): Card[] {
  const derived = useDerived();
  return boardId ? (derived.cardsByBoard[boardId] ?? EMPTY_ARRAY) : EMPTY_ARRAY;
}

export function useArchivedCards(boardId: string | null | undefined): Card[] {
  const derived = useDerived();
  return boardId ? (derived.archivedByBoard[boardId] ?? EMPTY_ARRAY) : EMPTY_ARRAY;
}

export function useAllCards(): Card[] {
  const derived = useDerived();
  return useMemo(() => derived.boards.flatMap((board) => derived.cardsByBoard[board.id] ?? []), [derived]);
}

export function useCard(cardId: string | null | undefined): Card | null {
  const snapshot = useSnapshot();
  return cardId ? (snapshot.cards[cardId] ?? null) : null;
}

export function useComments(cardId: string | null | undefined): Comment[] {
  const derived = useDerived();
  return cardId ? (derived.commentsByCard[cardId] ?? EMPTY_ARRAY) : EMPTY_ARRAY;
}

export function useActivity(cardId: string | null | undefined): ActivityEntry[] {
  const derived = useDerived();
  return cardId ? (derived.activityByCard[cardId] ?? EMPTY_ARRAY) : EMPTY_ARRAY;
}

/** Members: everyone assigned anywhere plus the viewer and current peers. */
export function useMembers(): Assignee[] {
  const derived = useDerived();
  const { viewer, peers } = useKanban();
  return useMemo(() => {
    const map = new Map<string, Assignee>();
    if (viewer.id) map.set(viewer.id, { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl });
    for (const member of derived.members) if (!map.has(member.id)) map.set(member.id, member);
    for (const peer of peers) {
      if (peer.user?.name) {
        const id = `name:${peer.user.name}`;
        if (!Array.from(map.values()).some((m) => m.name === peer.user?.name)) map.set(id, { id, name: peer.user.name });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [derived.members, viewer, peers]);
}

export function useHistory(): { canUndo: boolean; canRedo: boolean } {
  const { store } = useKanban();
  const subscribe = useCallback((listener: () => void) => (store ? store.subscribeHistory(listener) : noopSubscribe()), [store]);
  const getKey = useCallback(() => (store ? `${store.canUndo() ? 1 : 0}${store.canRedo() ? 1 : 0}` : "00"), [store]);
  const key = useSyncExternalStore(subscribe, getKey, getKey);
  return { canUndo: key[0] === "1", canRedo: key[1] === "1" };
}
