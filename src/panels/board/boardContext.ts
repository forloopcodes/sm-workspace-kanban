import { createContext, useContext, type MouseEvent, type MutableRefObject } from "react";
import type { KanbanStore } from "../../state/store";
import type { Board, BoardDisplay, Card, Column, DragPresence, KanbanPresence, Peer } from "../../state/types";

export interface BoardUi {
  board: Board;
  columns: Column[];
  display: BoardDisplay;
  store: KanbanStore;
  viewerId: string | null;
  labelNames: Record<string, string>;
  editingByCard: Record<string, Peer<KanbanPresence>[]>;
  draggingByCard: Record<string, Peer<DragPresence>[]>;
  openCard: (cardId: string) => void;
  onCardContextMenu: (event: MouseEvent, card: Card) => void;
  onColumnContextMenu: (event: MouseEvent, column: Column) => void;
  collapsedColumns: string[];
  toggleColumnCollapsed: (columnId: string) => void;
  createCard: (columnId: string, text: string, laneValue?: LaneValue) => void;
  setDragPresence: (patch: Partial<DragPresence>) => void;
  onWipExceeded: (column: Column) => void;
  /** Timestamp until which card clicks are ignored (set right after a drag ends). */
  clickGuard: MutableRefObject<number>;
}

export interface LaneValue {
  kind: "assignee" | "priority" | "label" | "field";
  value: string | null;
}

export interface Lane {
  key: string;
  label: string;
  value: LaneValue;
  match: (card: Card) => boolean;
}

export const BoardUiContext = createContext<BoardUi | null>(null);

export function useBoardUi(): BoardUi {
  const context = useContext(BoardUiContext);
  if (!context) throw new Error("useBoardUi must be used within BoardUiContext");
  return context;
}
