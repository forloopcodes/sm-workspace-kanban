import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import styled, { css } from "styled-components";
import { Icon, IconButton, t, useCrossListDrag } from "@soft-machine/sdk";
import type { Card, Column as ColumnModel } from "../../state/types";
import { Count, ToneDot } from "../../ui/shared";
import { useBoardUi, type LaneValue } from "./boardContext";
import { CardTile } from "./CardTile";

const Shell = styled.section<{ $width: number; $collapsed?: boolean; $dragging?: boolean; $receiving?: boolean }>`
  flex: 0 0 auto;
  width: ${({ $width, $collapsed }) => ($collapsed ? 40 : $width)}px;
  min-width: 0;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: calc(${t.radius} * 1.25);
  background: ${t.bg.tertiary};
  opacity: ${({ $dragging }) => ($dragging ? 0.4 : 1)};
  ${({ $receiving }) =>
    $receiving &&
    css`
      box-shadow: inset 0 0 0 1px rgba(${t.accent.primaryRgb}, 0.5);
    `}
  @container (max-width: 520px) {
    width: 100%;
    flex: 1 1 auto;
  }
`;

const Header = styled.header<{ $collapsed?: boolean }>`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 6px 0 10px;
  min-width: 0;
  cursor: grab;
  user-select: none;
  touch-action: none;
  ${({ $collapsed }) =>
    $collapsed &&
    css`
      flex-direction: column;
      padding: 8px 0;
      gap: 8px;
      cursor: pointer;
    `}
`;

const Name = styled.span<{ $collapsed?: boolean }>`
  flex: 1;
  min-width: 0;
  font-size: ${t.typography.sm};
  font-weight: 600;
  color: ${t.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  ${({ $collapsed }) =>
    $collapsed &&
    css`
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      flex: 0 0 auto;
      max-height: 160px;
    `}
`;

const HeaderActions = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  ${Header}:hover &,
  ${Header}:focus-within & {
    opacity: 1;
  }
`;

const WipCount = styled(Count)<{ $over?: boolean }>`
  color: ${({ $over }) => ($over ? t.status.error : t.text.muted)};
`;

const List = styled.div<{ $compact?: boolean }>`
  flex: 1 1 auto;
  min-height: 24px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 6px 6px;
  display: flex;
  flex-direction: column;
  gap: ${({ $compact }) => ($compact ? 4 : 6)}px;
  scrollbar-width: thin;
`;

const Slot = styled.div<{ $before?: boolean; $after?: boolean }>`
  position: relative;
  min-width: 0;
  ${({ $before }) =>
    $before &&
    css`
      &::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: -4px;
        height: 2px;
        border-radius: 1px;
        background: ${t.accent.primary};
      }
    `}
  ${({ $after }) =>
    $after &&
    css`
      &::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: -4px;
        height: 2px;
        border-radius: 1px;
        background: ${t.accent.primary};
      }
    `}
`;

const EmptyDrop = styled.div<{ $active?: boolean }>`
  min-height: 40px;
  border-radius: ${t.radius};
  border: 1px dashed ${({ $active }) => ($active ? t.accent.primary : "transparent")};
  display: grid;
  place-items: center;
  font-size: ${t.typography.xs};
  color: ${t.text.muted};
`;

const Footer = styled.div`
  flex: 0 0 auto;
  padding: 0 6px 6px;
`;

const AddButton = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 6px;
  border: none;
  border-radius: ${t.radius};
  font: inherit;
  font-size: ${t.typography.sm};
  color: ${t.text.muted};
  background: transparent;
  cursor: pointer;
  &:hover {
    color: ${t.text.primary};
    background: ${t.bg.secondary};
  }
`;

const Composer = styled.textarea`
  width: 100%;
  min-height: 56px;
  resize: none;
  padding: 8px 10px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.25);
  font: inherit;
  font-size: ${t.typography.base};
  line-height: 1.35;
  color: ${t.text.primary};
  background: ${t.bg.elevated};
  outline: none;
  &:focus {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
  }
  &::placeholder {
    color: ${t.text.muted};
  }
`;

const ComposerHint = styled.div`
  padding: 4px 2px 0;
  font-size: ${t.typography.xs};
  color: ${t.text.muted};
  display: flex;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
  & > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export interface ColumnProps {
  column: ColumnModel;
  cards: Card[];
  listId: string;
  group: string;
  laneValue?: LaneValue;
  columnDrag?: {
    ref: (element: HTMLElement | null) => void;
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    isDragging: boolean;
    showDropBefore: boolean;
    showDropAfter: boolean;
  };
  /** Total cards in this column across lanes (for WIP display). */
  totalCount: number;
}

export function Column({ column, cards, listId, group, laneValue, columnDrag, totalCount }: ColumnProps) {
  const ui = useBoardUi();
  const collapsed = ui.collapsedColumns.includes(column.id);
  const compact = ui.display.density === "compact";
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // The drag hook reports indices into the VISIBLE list (filtered / lane), so we
  // translate to neighbours and let the store resolve the order in the full column.
  const onReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      const card = cards[fromIndex];
      if (card) {
        const visible = cards.filter((c) => c.id !== card.id);
        ui.store.moveCardBetween(card.id, column.id, visible[toIndex - 1]?.id ?? null, visible[toIndex]?.id ?? null);
      }
      ui.setDragPresence({ draggingCardId: null, overColumnId: null });
    },
    [cards, column.id, ui]
  );

  const onReceive = useCallback(
    (itemId: string, _fromListId: string, toIndex: number) => {
      const visible = cards.filter((c) => c.id !== itemId);
      ui.store.moveCardBetween(itemId, column.id, visible[toIndex - 1]?.id ?? null, visible[toIndex]?.id ?? null);
      if (laneValue) applyLaneValue(ui, itemId, laneValue);
      if (column.wipLimit !== null && totalCount + 1 > column.wipLimit) ui.onWipExceeded(column);
      ui.setDragPresence({ draggingCardId: null, overColumnId: null });
    },
    [cards, column, laneValue, totalCount, ui]
  );

  const drag = useCrossListDrag({
    listId,
    group,
    items: cards,
    direction: "vertical",
    onReorder,
    onReceive,
  }) as {
    getItemState: (id: string) => { isDragging: boolean; showDropBefore: boolean; showDropAfter: boolean };
    getItemHandlers: (id: string) => { onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; ref: (element: HTMLDivElement | null) => void; "data-drag-item": string };
    listRef: (element: HTMLDivElement | null) => void;
    isDragActive: boolean;
    isReceiving: boolean;
    draggingId: string | null;
    draggingFromListId: string | null;
  };

  // Stream drag state over presence (one write per change, not per pointer move).
  const lastPresence = useRef<string>("");
  useEffect(() => {
    if (!drag.isDragActive || !drag.draggingId) return;
    const isSource = drag.draggingFromListId === listId;
    if (!isSource && !drag.isReceiving) return;
    const key = `${drag.draggingId}:${drag.isReceiving ? column.id : ""}`;
    if (lastPresence.current === key) return;
    lastPresence.current = key;
    ui.setDragPresence({ draggingCardId: drag.draggingId, overColumnId: drag.isReceiving ? column.id : null });
  }, [drag.isDragActive, drag.draggingId, drag.isReceiving, drag.draggingFromListId, listId, column.id, ui]);
  const wasActive = useRef(false);
  useEffect(() => {
    if (drag.isDragActive) {
      wasActive.current = true;
      return;
    }
    if (wasActive.current) {
      wasActive.current = false;
      // Swallow the click that follows a completed drag.
      ui.clickGuard.current = Date.now() + 300;
    }
    if (lastPresence.current) {
      lastPresence.current = "";
      ui.setDragPresence({ draggingCardId: null, overColumnId: null });
    }
  }, [drag.isDragActive, ui]);

  useEffect(() => {
    if (composing) composerRef.current?.focus();
  }, [composing]);

  const submit = () => {
    const text = draft.trim();
    if (!text) {
      setComposing(false);
      return;
    }
    ui.createCard(column.id, text, laneValue);
    setDraft("");
    if (column.wipLimit !== null && totalCount + 1 > column.wipLimit) ui.onWipExceeded(column);
  };

  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft("");
      setComposing(false);
    }
  };

  const over = column.wipLimit !== null && totalCount > column.wipLimit;
  const showEmptyDrop = cards.length === 0;

  return (
    <Shell
      ref={columnDrag?.ref as never}
      data-drag-item={column.id}
      $width={ui.display.columnWidth}
      $collapsed={collapsed}
      $dragging={columnDrag?.isDragging}
      $receiving={drag.isReceiving && drag.draggingFromListId !== listId}
      aria-label={`${column.name} column`}
      style={
        columnDrag?.showDropBefore
          ? { boxShadow: `-3px 0 0 0 ${t.accent.primary}` }
          : columnDrag?.showDropAfter
            ? { boxShadow: `3px 0 0 0 ${t.accent.primary}` }
            : undefined
      }
    >
      <Header
        $collapsed={collapsed}
        onPointerDown={collapsed ? undefined : columnDrag?.onPointerDown}
        onContextMenu={(event) => ui.onColumnContextMenu(event, column)}
        onClick={collapsed ? () => ui.toggleColumnCollapsed(column.id) : undefined}
        onDoubleClick={collapsed ? undefined : () => ui.toggleColumnCollapsed(column.id)}
        title={collapsed ? `Expand ${column.name}` : undefined}
      >
        <ToneDot $tone={column.tone} $size={8} />
        <Name $collapsed={collapsed}>{column.name}</Name>
        <WipCount $over={over} title={column.wipLimit !== null ? `${totalCount} of ${column.wipLimit} (WIP limit)` : `${totalCount} cards`}>
          {column.wipLimit !== null ? `${totalCount}/${column.wipLimit}` : totalCount}
        </WipCount>
        {!collapsed ? (
          <HeaderActions data-no-drag>
            <IconButton
              title="Add card"
              aria-label={`Add card to ${column.name}`}
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation();
                setComposing(true);
              }}
            >
              <Icon name="Plus" size={12} />
            </IconButton>
            <IconButton
              title="Column menu"
              aria-label={`${column.name} menu`}
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation();
                ui.onColumnContextMenu(event, column);
              }}
            >
              <Icon name="MoreHorizontal" size={12} />
            </IconButton>
          </HeaderActions>
        ) : null}
      </Header>
      {collapsed ? null : (
        <>
          <List ref={drag.listRef} $compact={compact} role="list">
            {cards.map((card) => {
              const state = drag.getItemState(card.id);
              return (
                <Slot key={card.id} role="listitem" $before={state.showDropBefore} $after={state.showDropAfter}>
                  <CardTile card={card} dragHandlers={drag.getItemHandlers(card.id)} isDragging={state.isDragging} />
                </Slot>
              );
            })}
            {showEmptyDrop ? <EmptyDrop $active={drag.isReceiving}>{drag.isDragActive ? "Drop here" : "No cards"}</EmptyDrop> : null}
          </List>
          <Footer>
            {composing ? (
              <div>
                <Composer
                  ref={composerRef}
                  rows={2}
                  value={draft}
                  placeholder="Card title — try “Fix login tomorrow 3pm !high #bug @me”"
                  aria-label={`New card in ${column.name}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onComposerKey}
                  onBlur={() => {
                    if (!draft.trim()) setComposing(false);
                  }}
                />
                <ComposerHint>
                  <span>Enter to add · Shift+Enter for a new line</span>
                  <span>Esc to close</span>
                </ComposerHint>
              </div>
            ) : (
              <AddButton type="button" onClick={() => setComposing(true)} data-no-drag>
                <Icon name="Plus" size={12} />
                Add card
              </AddButton>
            )}
          </Footer>
        </>
      )}
    </Shell>
  );
}

function applyLaneValue(ui: ReturnType<typeof useBoardUi>, cardId: string, lane: LaneValue) {
  const card = ui.store.snapshot.cards[cardId];
  if (!card) return;
  switch (lane.kind) {
    case "priority":
      ui.store.updateCard(cardId, { priority: (lane.value as Card["priority"]) ?? "none" });
      break;
    case "label": {
      if (!lane.value) break;
      if (!card.labels.includes(lane.value)) ui.store.updateCard(cardId, { labels: [...card.labels, lane.value] });
      break;
    }
    case "assignee": {
      if (!lane.value) {
        ui.store.updateCard(cardId, { assignees: [] });
        break;
      }
      const member = ui.store.getDerived().members.find((m) => m.id === lane.value);
      if (member && !card.assignees.some((a) => a.id === member.id)) ui.store.updateCard(cardId, { assignees: [member] });
      break;
    }
    case "field": {
      const [fieldId, value] = (lane.value ?? "").split("::");
      if (fieldId) ui.store.updateCard(cardId, { fields: { [fieldId]: value || null } });
      break;
    }
  }
}
