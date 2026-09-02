import { memo, type MouseEvent, type MutableRefObject, type PointerEvent } from "react";
import styled from "styled-components";
import { Checkbox, Icon, t } from "@soft-machine/sdk";
import { formatDue, formatEstimate, isOverdue } from "../../state/dates";
import type { Board, Card, Column } from "../../state/types";
import { AvatarStack } from "../../ui/AvatarStack";
import { Chip, MetaChip, PriorityIcon, ToneDot } from "../../ui/shared";

const Row = styled.div<{ $dragging?: boolean; $completed?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  min-width: 0;
  padding: 2px 6px 2px 8px;
  border-radius: ${t.radius};
  opacity: ${({ $dragging, $completed }) => ($dragging ? 0.35 : $completed ? 0.65 : 1)};
  cursor: pointer;
  user-select: none;
  &:hover {
    background: ${t.bg.secondary};
  }
  &:focus-visible {
    outline: none;
    background: ${t.bg.secondary};
  }
`;

const Title = styled.span<{ $completed?: boolean }>`
  flex: 1 1 auto;
  min-width: 0;
  font-size: ${t.typography.base};
  color: ${t.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: ${({ $completed }) => ($completed ? "line-through" : "none")};
`;

const Meta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  @container (max-width: 380px) {
    & > .optional {
      display: none;
    }
  }
`;

const BoardChip = styled(Chip)`
  @container (max-width: 480px) {
    display: none;
  }
`;

const Handle = styled.span`
  display: inline-flex;
  color: ${t.text.muted};
  opacity: 0;
  cursor: grab;
  touch-action: none;
  ${Row}:hover & {
    opacity: 1;
  }
`;

export interface TaskRowProps {
  card: Card;
  board: Board | undefined;
  column: Column | undefined;
  showBoard: boolean;
  onOpen: (cardId: string) => void;
  onToggleComplete: (cardId: string) => void;
  onContextMenu: (event: MouseEvent, card: Card) => void;
  dragHandlers?: { onPointerDown: (event: PointerEvent<HTMLElement>) => void; ref: (element: HTMLElement | null) => void; "data-drag-item": string };
  isDragging?: boolean;
  peerColor?: string | null;
  /** Timestamp until which clicks are ignored (set right after a drag ends). */
  clickGuard?: MutableRefObject<number>;
}

export const TaskRow = memo(function TaskRow({ card, board, column, showBoard, onOpen, onToggleComplete, onContextMenu, dragHandlers, isDragging, peerColor, clickGuard }: TaskRowProps) {
  const overdue = !card.completedAt && isOverdue(card.dueAt);
  const labels = card.labels.map((id) => board?.labels.find((l) => l.id === id)).filter(Boolean);
  const done = card.checklist.filter((item) => item.done).length;
  const { onPointerDown, ref, ...dragAttrs } = dragHandlers ?? ({} as Partial<NonNullable<TaskRowProps["dragHandlers"]>>);
  return (
    <Row
      ref={ref as never}
      {...dragAttrs}
      role="button"
      tabIndex={0}
      aria-label={card.title}
      $dragging={isDragging}
      $completed={Boolean(card.completedAt)}
      onClick={() => {
        if (clickGuard && Date.now() < clickGuard.current) return;
        onOpen(card.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(card.id);
        }
      }}
      onContextMenu={(event) => onContextMenu(event, card)}
      style={peerColor ? { boxShadow: `inset 2px 0 0 ${peerColor}` } : undefined}
    >
      {onPointerDown ? (
        <Handle onPointerDown={onPointerDown} aria-hidden>
          <Icon name="GripVertical" size={12} />
        </Handle>
      ) : null}
      <span onClick={(event) => event.stopPropagation()} style={{ display: "inline-flex" }}>
        <Checkbox checked={Boolean(card.completedAt)} onChange={() => onToggleComplete(card.id)} aria-label={card.completedAt ? `Reopen ${card.title}` : `Complete ${card.title}`} />
      </span>
      <PriorityIcon priority={card.priority} size={12} />
      <Title $completed={Boolean(card.completedAt)} title={card.title}>
        {card.title}
      </Title>
      <Meta>
        {labels.slice(0, 2).map((label) => (
          <Chip key={label!.id} $tone={label!.tone} className="optional">
            {label!.name}
          </Chip>
        ))}
        {showBoard && board ? (
          <BoardChip $muted title={`${board.name} · ${column?.name ?? ""}`}>
            <ToneDot $tone={board.tone} $size={6} />
            {board.name}
          </BoardChip>
        ) : column ? (
          <BoardChip $muted className="optional">
            <ToneDot $tone={column.tone} $size={6} />
            {column.name}
          </BoardChip>
        ) : null}
        {card.checklist.length > 0 ? (
          <MetaChip className="optional">
            <Icon name="Check" size={11} />
            {done}/{card.checklist.length}
          </MetaChip>
        ) : null}
        {card.estimate !== null ? <MetaChip className="optional">{formatEstimate(card.estimate)}</MetaChip> : null}
        {card.dueAt ? (
          <MetaChip $tone={overdue ? "danger" : card.completedAt ? "muted" : "default"} title={card.dueAt}>
            <Icon name="Calendar" size={11} />
            {formatDue(card.dueAt)}
          </MetaChip>
        ) : null}
        {card.assignees.length > 0 ? <AvatarStack people={card.assignees} size={16} max={2} /> : null}
      </Meta>
    </Row>
  );
});
