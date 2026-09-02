import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import styled, { css } from "styled-components";
import { Icon, IconButton, t } from "@soft-machine/sdk";
import { addDays, atNoon, daysBetween, formatDue, hasTime, isSameDay, parseStored, startOfWeek, toDayKey, combineDayAndTime, timeInputValue } from "../../state/dates";
import { toneColor, priorityColor } from "../../state/tones";
import type { Board, Card, Column } from "../../state/types";
import { Count, EmptyBlock, GhostButton, Muted } from "../../ui/shared";

const DAY_WIDTH = 28;
const ROW_HEIGHT = 30;
const LABEL_WIDTH = 200;

const Frame = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  flex: 1;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: ${t.borderWidth} solid ${t.border};
  font-size: ${t.typography.sm};
  color: ${t.text.secondary};
  & > span:first-of-type {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  position: relative;
`;

const Grid = styled.div<{ $days: number; $rows: number }>`
  position: relative;
  display: grid;
  grid-template-columns: ${LABEL_WIDTH}px ${({ $days }) => $days * DAY_WIDTH}px;
  grid-template-rows: 34px repeat(${({ $rows }) => $rows}, ${ROW_HEIGHT}px);
  min-width: max-content;
`;

const Corner = styled.div`
  position: sticky;
  left: 0;
  top: 0;
  z-index: 3;
  background: ${t.bg.tertiary};
  border-right: ${t.borderWidth} solid ${t.border};
  border-bottom: ${t.borderWidth} solid ${t.border};
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: ${t.typography.xs};
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: ${t.text.muted};
`;

const DayHeader = styled.div`
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  background: ${t.bg.tertiary};
  border-bottom: ${t.borderWidth} solid ${t.border};
`;

const DayCell = styled.div<{ $weekend?: boolean; $today?: boolean; $weekStart?: boolean }>`
  flex: 0 0 ${DAY_WIDTH}px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: ${t.typography.micro};
  line-height: 1.2;
  color: ${({ $today }) => ($today ? t.accent.primary : t.text.muted)};
  border-left: ${({ $weekStart }) => ($weekStart ? `${t.borderWidth} solid ${t.border}` : "none")};
  background: ${({ $weekend }) => ($weekend ? `color-mix(in srgb, ${t.bg.secondary} 60%, ${t.bg.tertiary})` : "transparent")};
  & > strong {
    font-weight: ${({ $today }) => ($today ? 700 : 500)};
    font-size: ${t.typography.xs};
    font-variant-numeric: tabular-nums;
  }
`;

const RowLabel = styled.div<{ $completed?: boolean }>`
  position: sticky;
  left: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  min-width: 0;
  background: ${t.bg.secondary};
  border-right: ${t.borderWidth} solid ${t.border};
  border-bottom: ${t.borderWidth} solid ${t.border};
  font-size: ${t.typography.sm};
  color: ${({ $completed }) => ($completed ? t.text.muted : t.text.primary)};
  cursor: pointer;
  & > span {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-decoration: ${({ $completed }) => ($completed ? "line-through" : "none")};
  }
  &:hover {
    background: ${t.bg.tertiary};
  }
`;

const RowTrack = styled.div<{ $days: number }>`
  position: relative;
  border-bottom: ${t.borderWidth} solid ${t.border};
  background-image: repeating-linear-gradient(to right, transparent 0, transparent ${DAY_WIDTH * 7 - 1}px, ${t.border} ${DAY_WIDTH * 7 - 1}px, ${t.border} ${DAY_WIDTH * 7}px);
`;

const TodayLine = styled.div<{ $left: number }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${({ $left }) => $left}px;
  width: 1px;
  background: ${t.accent.primary};
  opacity: 0.6;
  pointer-events: none;
  z-index: 1;
`;

const Bar = styled.div<{ $color: string; $completed?: boolean; $ghost?: boolean }>`
  position: absolute;
  top: 6px;
  height: ${ROW_HEIGHT - 12}px;
  border-radius: ${t.radius};
  background: ${({ $color, $completed }) => ($completed ? `color-mix(in srgb, ${$color} 35%, transparent)` : `color-mix(in srgb, ${$color} 70%, ${t.bg.elevated})`)};
  border: ${t.borderWidth} solid ${({ $color }) => $color};
  cursor: grab;
  touch-action: none;
  display: flex;
  align-items: center;
  padding: 0 6px;
  min-width: 0;
  font-size: ${t.typography.xs};
  color: ${t.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  ${({ $ghost }) =>
    $ghost &&
    css`
      opacity: 0.85;
      cursor: grabbing;
    `}
  &::before,
  &::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
  }
  &::before {
    left: 0;
  }
  &::after {
    right: 0;
  }
`;

const Unscheduled = styled.div`
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-top: ${t.borderWidth} solid ${t.border};
`;

const UnscheduledRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  padding: 0 6px;
  border-radius: ${t.radius};
  font-size: ${t.typography.sm};
  min-width: 0;
  & > span {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  &:hover {
    background: ${t.bg.tertiary};
  }
`;

export interface TimelineViewProps {
  cards: Card[];
  boards: Record<string, Board>;
  columns: Record<string, Column>;
  weekStartsOn: 0 | 1;
  anchor: Date;
  onAnchorChange: (date: Date) => void;
  onOpen: (cardId: string) => void;
  onContextMenu: (event: MouseEvent, card: Card) => void;
  onSetDates: (cardId: string, startAt: string | null, dueAt: string | null) => void;
  todayRef?: (element: HTMLElement | null) => void;
}

interface DragState {
  cardId: string;
  mode: "move" | "start" | "end";
  originX: number;
  startIndex: number;
  endIndex: number;
  deltaDays: number;
}

export function TimelineView({ cards, boards, columns, weekStartsOn, anchor, onAnchorChange, onOpen, onContextMenu, onSetDates, todayRef }: TimelineViewProps) {
  const weeks = 8;
  const rangeStart = useMemo(() => addDays(startOfWeek(atNoon(anchor), weekStartsOn), -7), [anchor, weekStartsOn]);
  const totalDays = weeks * 7;
  const days = useMemo(() => Array.from({ length: totalDays }, (_, index) => addDays(rangeStart, index)), [rangeStart, totalDays]);
  const today = atNoon(new Date());
  const todayIndex = daysBetween(rangeStart, today);

  const scheduled = useMemo(() => cards.filter((card) => card.dueAt || card.startAt).sort((a, b) => (parseStored(a.startAt ?? a.dueAt)?.getTime() ?? 0) - (parseStored(b.startAt ?? b.dueAt)?.getTime() ?? 0)), [cards]);
  const unscheduled = useMemo(() => cards.filter((card) => !card.dueAt && !card.startAt), [cards]);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Center on today on first render.
    const element = scrollRef.current;
    if (!element) return;
    element.scrollLeft = Math.max(0, (todayIndex - 3) * DAY_WIDTH);
  }, [rangeStart, todayIndex]);

  const indices = useCallback(
    (card: Card) => {
      const due = parseStored(card.dueAt) ?? parseStored(card.startAt)!;
      const start = parseStored(card.startAt) ?? due;
      const s = daysBetween(rangeStart, start);
      const e = daysBetween(rangeStart, due);
      return { startIndex: Math.min(s, e), endIndex: Math.max(s, e) };
    },
    [rangeStart]
  );

  const beginDrag = (event: PointerEvent<HTMLDivElement>, card: Card) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - rect.left;
    const mode: DragState["mode"] = offset <= 7 ? "start" : rect.width - offset <= 7 ? "end" : "move";
    const { startIndex, endIndex } = indices(card);
    const state: DragState = { cardId: card.id, mode, originX: event.clientX, startIndex, endIndex, deltaDays: 0 };
    dragRef.current = state;
    setDrag(state);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state) return;
    const deltaDays = Math.round((event.clientX - state.originX) / DAY_WIDTH);
    if (deltaDays === state.deltaDays) return;
    const next = { ...state, deltaDays };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!state) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (state.deltaDays === 0) {
      if (state.mode === "move") onOpen(state.cardId);
      return;
    }
    const card = cards.find((c) => c.id === state.cardId);
    if (!card) return;
    let { startIndex, endIndex } = state;
    if (state.mode === "move") {
      startIndex += state.deltaDays;
      endIndex += state.deltaDays;
    } else if (state.mode === "start") {
      startIndex = Math.min(endIndex, startIndex + state.deltaDays);
    } else {
      endIndex = Math.max(startIndex, endIndex + state.deltaDays);
    }
    const startDay = addDays(rangeStart, startIndex);
    const endDay = addDays(rangeStart, endIndex);
    const dueTime = card.dueAt && hasTime(card.dueAt) ? timeInputValue(card.dueAt) : null;
    const startTime = card.startAt && hasTime(card.startAt) ? timeInputValue(card.startAt) : null;
    const nextDue = combineDayAndTime(endDay, dueTime);
    const hadStart = Boolean(card.startAt) || state.mode === "start" || startIndex !== endIndex;
    const nextStart = hadStart ? combineDayAndTime(startDay, startTime) : null;
    onSetDates(card.id, nextStart, nextDue);
  };

  if (cards.length === 0) {
    return (
      <EmptyBlock>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Icon name="Calendar" size={20} />
          <span>No tasks to place on the timeline.</span>
        </div>
      </EmptyBlock>
    );
  }

  return (
    <Frame>
      <Controls>
        <span>
          {formatDue(toDayKey(rangeStart))} → {formatDue(toDayKey(addDays(rangeStart, totalDays - 1)))}
        </span>
        <IconButton title="Earlier" aria-label="Earlier" onClick={() => onAnchorChange(addDays(anchor, -14))}>
          <Icon name="ChevronLeft" size={12} />
        </IconButton>
        <GhostButton type="button" onClick={() => onAnchorChange(new Date())}>
          Today
        </GhostButton>
        <IconButton title="Later" aria-label="Later" onClick={() => onAnchorChange(addDays(anchor, 14))}>
          <Icon name="ChevronRight" size={12} />
        </IconButton>
      </Controls>
      <Scroll ref={scrollRef}>
        <Grid $days={totalDays} $rows={scheduled.length}>
          <Corner>Task</Corner>
          <DayHeader>
            {days.map((day, index) => (
              <DayCell key={toDayKey(day)} $weekend={day.getDay() === 0 || day.getDay() === 6} $today={isSameDay(day, today)} $weekStart={index > 0 && day.getDay() === weekStartsOn} ref={isSameDay(day, today) ? (todayRef as never) : undefined}>
                <span>{["S", "M", "T", "W", "T", "F", "S"][day.getDay()]}</span>
                <strong>{day.getDate()}</strong>
              </DayCell>
            ))}
          </DayHeader>
          {scheduled.map((card) => {
            const board = boards[card.boardId];
            const base = indices(card);
            let { startIndex, endIndex } = base;
            const ghost = drag && drag.cardId === card.id;
            if (ghost) {
              if (drag.mode === "move") {
                startIndex += drag.deltaDays;
                endIndex += drag.deltaDays;
              } else if (drag.mode === "start") startIndex = Math.min(endIndex, startIndex + drag.deltaDays);
              else endIndex = Math.max(startIndex, endIndex + drag.deltaDays);
            }
            const visibleStart = Math.max(0, startIndex);
            const visibleEnd = Math.min(totalDays - 1, endIndex);
            const color = card.cover ? toneColor(card.cover) : card.priority !== "none" ? priorityColor(card.priority) : toneColor(board?.tone ?? "accent");
            return (
              <RowFragment key={card.id}>
                <RowLabel $completed={Boolean(card.completedAt)} onClick={() => onOpen(card.id)} onContextMenu={(event) => onContextMenu(event, card)} title={card.title}>
                  <span>{card.title}</span>
                  <Muted style={{ fontSize: t.typography.xs, flex: "0 0 auto" }}>{formatDue(card.dueAt)}</Muted>
                </RowLabel>
                <RowTrack $days={totalDays}>
                  {todayIndex >= 0 && todayIndex < totalDays ? <TodayLine $left={todayIndex * DAY_WIDTH + DAY_WIDTH / 2} /> : null}
                  {visibleEnd >= 0 && visibleStart < totalDays ? (
                    <Bar
                      $color={color}
                      $completed={Boolean(card.completedAt)}
                      $ghost={Boolean(ghost)}
                      style={{ left: visibleStart * DAY_WIDTH + 1, width: Math.max(DAY_WIDTH - 2, (visibleEnd - visibleStart + 1) * DAY_WIDTH - 2) }}
                      title={`${card.title}${card.startAt ? ` · ${formatDue(card.startAt)} →` : ""} ${formatDue(card.dueAt)}`}
                      onPointerDown={(event) => beginDrag(event, card)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onContextMenu={(event) => onContextMenu(event, card)}
                    >
                      {visibleEnd - visibleStart >= 2 ? card.title : ""}
                    </Bar>
                  ) : null}
                </RowTrack>
              </RowFragment>
            );
          })}
        </Grid>
        {unscheduled.length > 0 ? (
          <Unscheduled>
            <Muted style={{ textTransform: "uppercase", letterSpacing: 0.3, fontSize: t.typography.xs }}>
              Unscheduled <Count>{unscheduled.length}</Count>
            </Muted>
            {unscheduled.slice(0, 50).map((card) => (
              <UnscheduledRow key={card.id} onContextMenu={(event) => onContextMenu(event, card)}>
                <span onClick={() => onOpen(card.id)}>{card.title}</span>
                <GhostButton type="button" onClick={() => onSetDates(card.id, null, toDayKey(addDays(today, 2)))}>
                  Due in 2 days
                </GhostButton>
                <GhostButton type="button" onClick={() => onSetDates(card.id, toDayKey(today), toDayKey(addDays(today, 6)))}>
                  This week
                </GhostButton>
              </UnscheduledRow>
            ))}
          </Unscheduled>
        ) : null}
      </Scroll>
    </Frame>
  );
}

function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
