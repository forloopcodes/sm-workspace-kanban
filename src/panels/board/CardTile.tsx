import { memo, type KeyboardEvent, type PointerEvent } from "react";
import styled, { css } from "styled-components";
import { Icon, t } from "@soft-machine/sdk";
import { formatDue, formatEstimate, isOverdue } from "../../state/dates";
import { toneColor } from "../../state/tones";
import type { Card } from "../../state/types";
import { AvatarStack } from "../../ui/AvatarStack";
import { Chip, MetaChip, PriorityIcon, Truncate } from "../../ui/shared";
import { useBoardUi } from "./boardContext";

const Tile = styled.div<{ $dragging?: boolean; $compact?: boolean; $completed?: boolean; $peerColor?: string | null; $remoteDrag?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${({ $compact }) => ($compact ? 4 : 6)}px;
  min-width: 0;
  padding: ${({ $compact }) => ($compact ? "6px 8px" : "8px 10px")};
  border: ${t.borderWidth} solid ${({ $peerColor }) => $peerColor ?? t.border};
  border-radius: calc(${t.radius} * 1.25);
  background: ${t.bg.elevated};
  cursor: grab;
  user-select: none;
  touch-action: none;
  opacity: ${({ $dragging, $remoteDrag, $completed }) => ($dragging ? 0.35 : $remoteDrag ? 0.6 : $completed ? 0.7 : 1)};
  ${({ $peerColor }) =>
    $peerColor &&
    css`
      box-shadow: 0 0 0 1px ${$peerColor};
    `}
  &:hover {
    border-color: ${({ $peerColor }) => $peerColor ?? `color-mix(in srgb, ${t.text.muted} 35%, ${t.border})`};
  }
  &:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, ${t.border} 60%, ${t.text.muted} 40%);
  }
`;

const Cover = styled.div<{ $tone: string }>`
  height: 4px;
  margin: -8px -10px 2px;
  border-radius: calc(${t.radius} * 1.25) calc(${t.radius} * 1.25) 0 0;
  background: ${({ $tone }) => $tone};
`;

const Title = styled.div<{ $completed?: boolean }>`
  min-width: 0;
  font-size: ${t.typography.base};
  line-height: 1.35;
  color: ${t.text.primary};
  text-decoration: ${({ $completed }) => ($completed ? "line-through" : "none")};
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Labels = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
`;

const Meta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
`;

const MetaLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex-wrap: wrap;
`;

const PeerTag = styled.span<{ $color: string }>`
  position: absolute;
  top: -8px;
  right: 8px;
  padding: 0 5px;
  border-radius: 999px;
  font-size: ${t.typography.micro};
  line-height: 14px;
  color: ${t.accent.text};
  background: ${({ $color }) => $color};
  white-space: nowrap;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CardNumber = styled.span`
  font-family: ${t.fontMono};
  font-size: ${t.typographyMono.micro};
  color: ${t.text.muted};
`;

export interface CardTileProps {
  card: Card;
  dragHandlers?: { onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; ref: (element: HTMLDivElement | null) => void; "data-drag-item": string };
  isDragging?: boolean;
}

export const CardTile = memo(function CardTile({ card, dragHandlers, isDragging }: CardTileProps) {
  const ui = useBoardUi();
  const { display, board } = ui;
  const compact = display.density === "compact";
  const editing = ui.editingByCard[card.id];
  const remoteDrag = ui.draggingByCard[card.id];
  const peer = editing?.[0] ?? remoteDrag?.[0];
  const peerColor = peer?.user?.color ?? null;
  const overdue = !card.completedAt && isOverdue(card.dueAt);
  const doneCount = card.checklist.filter((item) => item.done).length;
  const labels = display.showLabels ? card.labels.map((id) => board.labels.find((l) => l.id === id)).filter(Boolean) : [];
  const commentCount = ui.store.getDerived().commentsByCard[card.id]?.length ?? 0;
  const fieldChips = board.fields.filter((field) => field.showOnCard && card.fields[field.id] !== undefined && card.fields[field.id] !== null && card.fields[field.id] !== "");

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      ui.openCard(card.id);
    }
  };

  const showMeta =
    (display.showDue && card.dueAt) ||
    (display.showPriority && card.priority !== "none") ||
    (display.showChecklist && card.checklist.length > 0) ||
    (display.showComments && commentCount > 0) ||
    (display.showEstimate && card.estimate !== null) ||
    (display.showAssignees && card.assignees.length > 0) ||
    display.showCardIds ||
    fieldChips.length > 0;

  return (
    <Tile
      role="button"
      tabIndex={0}
      aria-label={card.title}
      $dragging={isDragging}
      $remoteDrag={Boolean(remoteDrag?.length)}
      $compact={compact}
      $completed={Boolean(card.completedAt)}
      $peerColor={peerColor}
      onClick={() => {
        if (Date.now() < ui.clickGuard.current) return;
        ui.openCard(card.id);
      }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => ui.onCardContextMenu(event, card)}
      {...(dragHandlers ?? {})}
    >
      {peer?.user ? <PeerTag $color={peer.user.color}>{editing?.length ? `${peer.user.name} editing` : `${peer.user.name} moving`}</PeerTag> : null}
      {display.showCover && card.cover ? <Cover $tone={toneColor(card.cover)} /> : null}
      {labels.length > 0 ? (
        <Labels>
          {labels.map((label) => (
            <Chip key={label!.id} $tone={label!.tone} title={label!.name}>
              {compact ? label!.name.slice(0, 12) : label!.name}
            </Chip>
          ))}
        </Labels>
      ) : null}
      <Title $completed={Boolean(card.completedAt)}>
        {card.completedAt ? (
          <span style={{ color: t.status.connected, marginRight: 4, display: "inline-flex", verticalAlign: "middle" }}>
            <Icon name="Check" size={11} />
          </span>
        ) : null}
        {card.title}
      </Title>
      {showMeta ? (
        <Meta>
          <MetaLeft>
            {display.showCardIds ? <CardNumber>#{card.number}</CardNumber> : null}
            {display.showPriority ? <PriorityIcon priority={card.priority} /> : null}
            {display.showDue && card.dueAt ? (
              <MetaChip $tone={overdue ? "danger" : card.completedAt ? "muted" : "default"} title={card.dueAt}>
                <Icon name="Calendar" size={11} />
                {formatDue(card.dueAt)}
              </MetaChip>
            ) : null}
            {display.showChecklist && card.checklist.length > 0 ? (
              <MetaChip $tone={doneCount === card.checklist.length ? "muted" : "default"}>
                <Icon name="Check" size={11} />
                {doneCount}/{card.checklist.length}
              </MetaChip>
            ) : null}
            {display.showComments && commentCount > 0 ? (
              <MetaChip>
                <Icon name="MessageSquare" size={11} />
                {commentCount}
              </MetaChip>
            ) : null}
            {display.showEstimate && card.estimate !== null ? (
              <MetaChip>
                <Icon name="Clock" size={11} />
                {formatEstimate(card.estimate)}
              </MetaChip>
            ) : null}
            {fieldChips.map((field) => (
              <MetaChip key={field.id} title={field.name}>
                <Truncate>
                  {field.kind === "checkbox" ? (card.fields[field.id] ? field.name : null) : `${field.name}: ${String(card.fields[field.id])}`}
                </Truncate>
              </MetaChip>
            ))}
          </MetaLeft>
          {display.showAssignees && card.assignees.length > 0 ? <AvatarStack people={card.assignees} size={compact ? 16 : 18} max={3} /> : null}
        </Meta>
      ) : null}
    </Tile>
  );
});
