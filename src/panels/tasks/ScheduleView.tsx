import { useCallback, useEffect, useMemo, useRef, type MouseEvent, type MutableRefObject, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import styled, { css } from "styled-components";
import { CrossListDragProvider, DragPreview, Icon, t, useCrossListDrag } from "@soft-machine/sdk";
import { BUCKET_LABELS, SCHEDULE_BUCKETS, bucketDate, bucketFor, combineDayAndTime, deadlineMs, hasTime, timeInputValue, type ScheduleBucket } from "../../state/dates";
import { PRIORITY_RANK } from "../../state/tones";
import type { Board, Card, Column } from "../../state/types";
import { Count, EmptyBlock } from "../../ui/shared";
import { TaskRow } from "./TaskRow";

const Bucket = styled.section<{ $receiving?: boolean; $today?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0 8px;
  border-radius: ${t.radius};
  ${({ $receiving }) =>
    $receiving &&
    css`
      background: rgba(${t.accent.primaryRgb}, 0.06);
      box-shadow: inset 0 0 0 1px rgba(${t.accent.primaryRgb}, 0.4);
    `}
`;

const BucketHeader = styled.div<{ $tone?: "danger" | "accent" | "default" }>`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 6px;
  font-size: ${t.typography.xs};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: ${({ $tone }) => ($tone === "danger" ? t.status.error : $tone === "accent" ? t.accent.primary : t.text.muted)};
  & > .label {
    flex: 1;
  }
`;

const DropHint = styled.div<{ $active?: boolean }>`
  min-height: 26px;
  margin: 0 6px;
  border-radius: ${t.radius};
  border: 1px dashed ${({ $active }) => ($active ? t.accent.primary : "transparent")};
  display: grid;
  place-items: center;
  font-size: ${t.typography.xs};
  color: ${t.text.muted};
`;

const Slot = styled.div<{ $before?: boolean; $after?: boolean }>`
  position: relative;
  ${({ $before }) =>
    $before &&
    css`
      &::before {
        content: "";
        position: absolute;
        left: 6px;
        right: 6px;
        top: -1px;
        height: 2px;
        background: ${t.accent.primary};
      }
    `}
  ${({ $after }) =>
    $after &&
    css`
      &::after {
        content: "";
        position: absolute;
        left: 6px;
        right: 6px;
        bottom: -1px;
        height: 2px;
        background: ${t.accent.primary};
      }
    `}
`;

export interface ScheduleViewProps {
  cards: Card[];
  boards: Record<string, Board>;
  columns: Record<string, Column>;
  showBoard: boolean;
  weekStartsOn: 0 | 1;
  onOpen: (cardId: string) => void;
  onToggleComplete: (cardId: string) => void;
  onContextMenu: (event: MouseEvent, card: Card) => void;
  onReschedule: (cardId: string, dueAt: string | null) => void;
  peerColors: Record<string, string>;
  todayRef?: (element: HTMLElement | null) => void;
}

export function ScheduleView(props: ScheduleViewProps) {
  const { cards, weekStartsOn } = props;
  const now = useMemo(() => new Date(), [cards]);
  const clickGuard = useRef(0);
  const byBucket = useMemo(() => {
    const map: Record<ScheduleBucket, Card[]> = { overdue: [], today: [], tomorrow: [], week: [], nextWeek: [], later: [], none: [] };
    for (const card of cards) map[bucketFor(card.dueAt, now, weekStartsOn)].push(card);
    for (const bucket of SCHEDULE_BUCKETS) {
      map[bucket].sort((a, b) => (deadlineMs(a.dueAt) ?? Infinity) - (deadlineMs(b.dueAt) ?? Infinity) || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.order.localeCompare(b.order));
    }
    return map;
  }, [cards, now, weekStartsOn]);

  if (cards.length === 0) {
    return (
      <EmptyBlock>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Icon name="Calendar" size={20} />
          <span>No tasks to schedule. Add one above.</span>
        </div>
      </EmptyBlock>
    );
  }

  return (
    <CrossListDragProvider>
      {SCHEDULE_BUCKETS.map((bucket) => (
        <BucketList key={bucket} {...props} bucket={bucket} cards={byBucket[bucket]} now={now} clickGuard={clickGuard} />
      ))}
    </CrossListDragProvider>
  );
}

function BucketList({
  bucket,
  cards,
  boards,
  columns,
  showBoard,
  weekStartsOn,
  onOpen,
  onToggleComplete,
  onContextMenu,
  onReschedule,
  peerColors,
  todayRef,
  now,
  clickGuard,
}: ScheduleViewProps & { bucket: ScheduleBucket; cards: Card[]; now: Date; clickGuard: MutableRefObject<number> }) {
  const onReceive = useCallback(
    (itemId: string) => {
      const day = bucketDate(bucket, now, weekStartsOn);
      if (bucket === "none") {
        onReschedule(itemId, null);
        return;
      }
      if (!day) return;
      onReschedule(itemId, `${bucket}::${day.toISOString()}`);
    },
    [bucket, now, weekStartsOn, onReschedule]
  );

  const drag = useCrossListDrag({
    listId: `schedule:${bucket}`,
    group: "schedule",
    items: cards,
    direction: "vertical",
    onReorder: () => {},
    onReceive,
  }) as {
    getItemState: (id: string) => { isDragging: boolean; showDropBefore: boolean; showDropAfter: boolean };
    getItemHandlers: (id: string) => { onPointerDown: (event: PointerEvent<HTMLElement>) => void; ref: (element: HTMLElement | null) => void; "data-drag-item": string };
    listRef: (element: HTMLDivElement | null) => void;
    isDragActive: boolean;
    isReceiving: boolean;
    draggingId: string | null;
    draggingFromListId: string | null;
    dragPreviewProps: { x: number; y: number; width: number; height: number; offsetX: number; offsetY: number };
  };

  const draggedCard = drag.isDragActive && drag.draggingFromListId === `schedule:${bucket}` ? cards.find((c) => c.id === drag.draggingId) : undefined;
  const preview =
    draggedCard && typeof document !== "undefined"
      ? createPortal(
          <DragPreview
            $x={drag.dragPreviewProps.x}
            $y={drag.dragPreviewProps.y}
            $offsetX={drag.dragPreviewProps.offsetX}
            $offsetY={drag.dragPreviewProps.offsetY}
            $width={drag.dragPreviewProps.width}
            $height={drag.dragPreviewProps.height}
          >
            <div style={{ background: t.bg.elevated, height: "100%" }}>
              <TaskRow card={draggedCard} board={boards[draggedCard.boardId]} column={columns[draggedCard.columnId]} showBoard={showBoard} onOpen={() => {}} onToggleComplete={() => {}} onContextMenu={() => {}} />
            </div>
          </DragPreview>,
          document.body
        )
      : null;

  // Swallow the click that follows a completed drag.
  const wasActive = useRef(false);
  useEffect(() => {
    if (drag.isDragActive) {
      wasActive.current = true;
    } else if (wasActive.current) {
      wasActive.current = false;
      clickGuard.current = Date.now() + 300;
    }
  }, [drag.isDragActive, clickGuard]);

  const tone = bucket === "overdue" ? "danger" : bucket === "today" ? "accent" : "default";
  const empty = cards.length === 0;
  // Empty buckets stay mounted (so they are always valid drop targets) but collapse to a slim header.
  const hidden = empty && !drag.isDragActive && bucket !== "today" && bucket !== "none";

  return (
    <Bucket ref={bucket === "today" ? (todayRef as never) : undefined} $receiving={drag.isReceiving} aria-label={BUCKET_LABELS[bucket]} style={hidden ? { padding: 0 } : undefined}>
      {preview}
      {!hidden ? (
        <BucketHeader $tone={tone}>
          <span className="label">{BUCKET_LABELS[bucket]}</span>
          <Count>{cards.length}</Count>
        </BucketHeader>
      ) : null}
      <div ref={drag.listRef} style={{ display: "flex", flexDirection: "column", gap: 1, minHeight: hidden ? 2 : 4 }}>
        {cards.map((card) => {
          const state = drag.getItemState(card.id);
          return (
            <Slot key={card.id} $before={state.showDropBefore} $after={state.showDropAfter}>
              <TaskRow
                card={card}
                board={boards[card.boardId]}
                column={columns[card.columnId]}
                showBoard={showBoard}
                onOpen={onOpen}
                onToggleComplete={onToggleComplete}
                onContextMenu={onContextMenu}
                dragHandlers={drag.getItemHandlers(card.id)}
                isDragging={state.isDragging}
                peerColor={peerColors[card.id] ?? null}
                clickGuard={clickGuard}
              />
            </Slot>
          );
        })}
        {empty && !hidden ? (
          <DropHint $active={drag.isReceiving}>
            {drag.isDragActive ? `Drop to schedule ${BUCKET_LABELS[bucket].toLowerCase()}` : bucket === "today" ? "Nothing due today" : "Drag tasks here to clear their date"}
          </DropHint>
        ) : null}
      </div>
    </Bucket>
  );
}

/** Resolve the encoded reschedule payload from BucketList into a stored due value. */
export function resolveReschedule(payload: string | null, card: Card): string | null {
  if (payload === null) return null;
  const [, iso] = payload.split("::");
  const day = new Date(iso);
  if (Number.isNaN(day.getTime())) return card.dueAt;
  const time = card.dueAt && hasTime(card.dueAt) ? timeInputValue(card.dueAt) : null;
  return combineDayAndTime(day, time || null);
}
