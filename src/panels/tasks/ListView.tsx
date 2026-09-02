import { useMemo, useState, type MouseEvent } from "react";
import styled from "styled-components";
import { Icon, t } from "@soft-machine/sdk";
import { BUCKET_LABELS, SCHEDULE_BUCKETS, bucketFor, deadlineMs } from "../../state/dates";
import { PRIORITY_RANK, priorityLabel } from "../../state/tones";
import type { Board, Card, Column } from "../../state/types";
import { Count, EmptyBlock } from "../../ui/shared";
import { TaskRow } from "./TaskRow";

export type GroupBy = "none" | "board" | "column" | "assignee" | "priority" | "due" | "label";
export type SortBy = "manual" | "due" | "priority" | "created" | "title";

const GroupHeader = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 6px;
  border: none;
  background: transparent;
  font: inherit;
  font-size: ${t.typography.xs};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: ${t.text.muted};
  cursor: pointer;
  text-align: left;
  & > span {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  &:hover {
    color: ${t.text.primary};
  }
`;

const Chevron = styled.span<{ $open: boolean }>`
  display: inline-flex;
  transition: transform 0.15s ease;
  transform: rotate(${({ $open }) => ($open ? 90 : 0)}deg);
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Group = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-bottom: 8px;
`;

export interface ListViewProps {
  cards: Card[];
  boards: Record<string, Board>;
  columns: Record<string, Column>;
  columnsByBoard: Record<string, Column[]>;
  groupBy: GroupBy;
  sortBy: SortBy;
  showBoard: boolean;
  onOpen: (cardId: string) => void;
  onToggleComplete: (cardId: string) => void;
  onContextMenu: (event: MouseEvent, card: Card) => void;
  peerColors: Record<string, string>;
}

interface GroupSpec {
  key: string;
  label: string;
  cards: Card[];
}

export function sortCards(cards: Card[], sortBy: SortBy, columns: Record<string, Column>): Card[] {
  const list = [...cards];
  switch (sortBy) {
    case "due":
      return list.sort((a, b) => (deadlineMs(a.dueAt) ?? Infinity) - (deadlineMs(b.dueAt) ?? Infinity) || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
    case "priority":
      return list.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || (deadlineMs(a.dueAt) ?? Infinity) - (deadlineMs(b.dueAt) ?? Infinity));
    case "created":
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "title":
      return list.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return list.sort((a, b) => {
        const ca = columns[a.columnId]?.order ?? "";
        const cb = columns[b.columnId]?.order ?? "";
        return ca.localeCompare(cb) || a.order.localeCompare(b.order);
      });
  }
}

export function ListView({ cards, boards, columns, columnsByBoard, groupBy, sortBy, showBoard, onOpen, onToggleComplete, onContextMenu, peerColors }: ListViewProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo<GroupSpec[]>(() => {
    const sorted = sortCards(cards, sortBy, columns);
    switch (groupBy) {
      case "board": {
        const map = new Map<string, Card[]>();
        for (const card of sorted) (map.get(card.boardId) ?? map.set(card.boardId, []).get(card.boardId)!).push(card);
        return Object.values(boards)
          .sort((a, b) => a.order.localeCompare(b.order))
          .filter((board) => map.has(board.id))
          .map((board) => ({ key: board.id, label: board.name, cards: map.get(board.id)! }));
      }
      case "column": {
        const map = new Map<string, Card[]>();
        for (const card of sorted) (map.get(card.columnId) ?? map.set(card.columnId, []).get(card.columnId)!).push(card);
        const ordered: GroupSpec[] = [];
        for (const board of Object.values(boards).sort((a, b) => a.order.localeCompare(b.order))) {
          for (const column of columnsByBoard[board.id] ?? []) {
            if (map.has(column.id)) ordered.push({ key: column.id, label: showBoard ? `${board.name} · ${column.name}` : column.name, cards: map.get(column.id)! });
          }
        }
        return ordered;
      }
      case "assignee": {
        const map = new Map<string, { label: string; cards: Card[] }>();
        for (const card of sorted) {
          if (card.assignees.length === 0) (map.get("none") ?? map.set("none", { label: "Unassigned", cards: [] }).get("none")!).cards.push(card);
          for (const assignee of card.assignees) (map.get(assignee.id) ?? map.set(assignee.id, { label: assignee.name, cards: [] }).get(assignee.id)!).cards.push(card);
        }
        return Array.from(map.entries())
          .sort((a, b) => (a[0] === "none" ? 1 : b[0] === "none" ? -1 : a[1].label.localeCompare(b[1].label)))
          .map(([key, value]) => ({ key, label: value.label, cards: value.cards }));
      }
      case "priority": {
        const map = new Map<string, Card[]>();
        for (const card of sorted) (map.get(card.priority) ?? map.set(card.priority, []).get(card.priority)!).push(card);
        return (["urgent", "high", "medium", "low", "none"] as const).filter((p) => map.has(p)).map((p) => ({ key: p, label: priorityLabel(p), cards: map.get(p)! }));
      }
      case "due": {
        const now = new Date();
        const map = new Map<string, Card[]>();
        for (const card of sorted) {
          const bucket = bucketFor(card.dueAt, now);
          (map.get(bucket) ?? map.set(bucket, []).get(bucket)!).push(card);
        }
        return SCHEDULE_BUCKETS.filter((bucket) => map.has(bucket)).map((bucket) => ({ key: bucket, label: BUCKET_LABELS[bucket], cards: map.get(bucket)! }));
      }
      case "label": {
        const map = new Map<string, { label: string; cards: Card[] }>();
        for (const card of sorted) {
          const board = boards[card.boardId];
          if (card.labels.length === 0) (map.get("none") ?? map.set("none", { label: "No label", cards: [] }).get("none")!).cards.push(card);
          for (const id of card.labels) {
            const name = board?.labels.find((l) => l.id === id)?.name ?? "Label";
            (map.get(name) ?? map.set(name, { label: name, cards: [] }).get(name)!).cards.push(card);
          }
        }
        return Array.from(map.entries())
          .sort((a, b) => (a[0] === "none" ? 1 : b[0] === "none" ? -1 : a[1].label.localeCompare(b[1].label)))
          .map(([key, value]) => ({ key, label: value.label, cards: value.cards }));
      }
      default:
        return [{ key: "all", label: "", cards: sorted }];
    }
  }, [cards, boards, columns, columnsByBoard, groupBy, sortBy, showBoard]);

  if (cards.length === 0) {
    return (
      <EmptyBlock>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Icon name="Check" size={20} />
          <span>Nothing here. Add a task above or adjust the filters.</span>
        </div>
      </EmptyBlock>
    );
  }

  return (
    <>
      {groups.map((group) => {
        const isCollapsed = collapsed[group.key] ?? false;
        return (
          <Group key={group.key}>
            {group.label ? (
              <GroupHeader type="button" onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: !isCollapsed }))} aria-expanded={!isCollapsed}>
                <Chevron $open={!isCollapsed}>
                  <Icon name="ChevronRight" size={11} />
                </Chevron>
                <span>{group.label}</span>
                <Count>{group.cards.length}</Count>
              </GroupHeader>
            ) : null}
            {!isCollapsed
              ? group.cards.map((card) => (
                  <TaskRow
                    key={`${group.key}:${card.id}`}
                    card={card}
                    board={boards[card.boardId]}
                    column={columns[card.columnId]}
                    showBoard={showBoard && groupBy !== "board"}
                    onOpen={onOpen}
                    onToggleComplete={onToggleComplete}
                    onContextMenu={onContextMenu}
                    peerColor={peerColors[card.id] ?? null}
                  />
                ))
              : null}
          </Group>
        );
      })}
    </>
  );
}
