import { useState, type MouseEvent } from "react";
import styled from "styled-components";
import { Checkbox, Icon, IconButton, Select, UserAvatar, t } from "@soft-machine/sdk";
import type { BoardFilters } from "../../state/filters";
import { priorityLabel } from "../../state/tones";
import { PRIORITIES, type Assignee, type Board, type Card, type Peer, type KanbanPresence, type Viewer } from "../../state/types";
import { AvatarStack } from "../../ui/AvatarStack";
import {
  Count,
  FooterText,
  InlineInput,
  RowActions,
  Sidebar,
  SidebarFooter,
  SidebarGrow,
  SidebarHeading,
  SidebarRow,
  SidebarSection,
  ToneDot,
} from "../../ui/shared";

const FilterRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  padding: 0 6px;
  border-radius: ${t.radius};
  font-size: ${t.typography.sm};
  color: ${t.text.secondary};
  cursor: pointer;
  &:hover {
    background: ${t.bg.secondary};
    color: ${t.text.primary};
  }
  & > .label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const SmallSelect = styled(Select)`
  width: 100%;
`;

export interface BoardSidebarProps {
  open: boolean;
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: () => void;
  onBoardContextMenu: (event: MouseEvent, board: Board) => void;
  onRenameBoard: (boardId: string, name: string) => void;
  filters: BoardFilters;
  onFiltersChange: (next: BoardFilters) => void;
  board: Board | null;
  cards: Card[];
  members: Assignee[];
  viewer: Viewer;
  peers: Peer<KanbanPresence>[];
  archivedCount: number;
  onOpenArchive: () => void;
}

export function BoardSidebar({
  open,
  boards,
  activeBoardId,
  onSelectBoard,
  onCreateBoard,
  onBoardContextMenu,
  onRenameBoard,
  filters,
  onFiltersChange,
  board,
  cards,
  members,
  viewer,
  peers,
  archivedCount,
  onOpenArchive,
}: BoardSidebarProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const toggle = (key: keyof BoardFilters) => onFiltersChange({ ...filters, [key]: !filters[key] } as BoardFilters);
  const toggleInList = (key: "labels" | "assignees" | "priorities", value: string) => {
    const list = filters[key] as string[];
    onFiltersChange({ ...filters, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] } as BoardFilters);
  };

  const labelCounts = new Map<string, number>();
  for (const card of cards) for (const id of card.labels) labelCounts.set(id, (labelCounts.get(id) ?? 0) + 1);
  const onlinePeople = peers
    .filter((peer) => peer.user && peer.value.boardId === activeBoardId)
    .map((peer) => ({ id: `peer:${peer.clientId}`, name: peer.user!.name, color: peer.user!.color, hint: "viewing this board" }));

  return (
    <Sidebar $open={open} aria-hidden={!open}>
      <SidebarSection>
        <SidebarHeading>
          <span className="label">Boards</span>
          <IconButton title="New board" aria-label="New board" onClick={onCreateBoard}>
            <Icon name="Plus" size={12} />
          </IconButton>
        </SidebarHeading>
        {boards.map((item) => (
          <SidebarRow
            key={item.id}
            role="button"
            tabIndex={0}
            aria-current={item.id === activeBoardId ? "true" : undefined}
            $active={item.id === activeBoardId}
            onClick={() => onSelectBoard(item.id)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectBoard(item.id);
              } else if (event.key === "F2") {
                setRenaming(item.id);
                setRenameValue(item.name);
              }
            }}
            onContextMenu={(event) => onBoardContextMenu(event, item)}
            onDoubleClick={() => {
              setRenaming(item.id);
              setRenameValue(item.name);
            }}
            title={item.name}
          >
            <ToneDot $tone={item.tone} />
            {renaming === item.id ? (
              <InlineInput
                autoFocus
                value={renameValue}
                aria-label="Board name"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={() => {
                  if (renameValue.trim() && renameValue.trim() !== item.name) onRenameBoard(item.id, renameValue.trim());
                  setRenaming(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                  if (event.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <span className="label">{item.name}</span>
            )}
            <RowActions>
              <IconButton
                title="Board menu"
                aria-label={`${item.name} menu`}
                onClick={(event: MouseEvent) => {
                  event.stopPropagation();
                  onBoardContextMenu(event, item);
                }}
              >
                <Icon name="MoreHorizontal" size={12} />
              </IconButton>
            </RowActions>
          </SidebarRow>
        ))}
      </SidebarSection>

      <SidebarGrow>
        <SidebarHeading>
          <span className="label">Filters</span>
          {countFilters(filters) > 0 ? (
            <IconButton
              title="Clear filters"
              aria-label="Clear filters"
              onClick={() => onFiltersChange({ ...filters, mine: false, unassigned: false, overdue: false, dueWithinDays: null, labels: [], assignees: [], priorities: [], hideCompleted: false })}
            >
              <Icon name="X" size={12} />
            </IconButton>
          ) : null}
        </SidebarHeading>
        <FilterRow>
          <Checkbox checked={filters.mine} onChange={() => toggle("mine")} aria-label="Assigned to me" />
          <span className="label">Assigned to me</span>
        </FilterRow>
        <FilterRow>
          <Checkbox checked={filters.unassigned} onChange={() => toggle("unassigned")} aria-label="Unassigned" />
          <span className="label">Unassigned</span>
        </FilterRow>
        <FilterRow>
          <Checkbox checked={filters.overdue} onChange={() => toggle("overdue")} aria-label="Overdue" />
          <span className="label">Overdue</span>
        </FilterRow>
        <FilterRow>
          <Checkbox checked={filters.hideCompleted} onChange={() => toggle("hideCompleted")} aria-label="Hide completed" />
          <span className="label">Hide completed</span>
        </FilterRow>
        <FilterRow as="div">
          <span className="label">Due within</span>
          <SmallSelect
            aria-label="Due within"
            value={filters.dueWithinDays === null ? "" : String(filters.dueWithinDays)}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onFiltersChange({ ...filters, dueWithinDays: event.target.value === "" ? null : Number(event.target.value) })}
            style={{ width: 84, flex: "0 0 auto" }}
          >
            <option value="">Any</option>
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">1 week</option>
            <option value="14">2 weeks</option>
            <option value="30">1 month</option>
          </SmallSelect>
        </FilterRow>

        {board && board.labels.length > 0 ? (
          <>
            <SidebarHeading style={{ marginTop: 8 }}>
              <span className="label">Labels</span>
            </SidebarHeading>
            {board.labels.map((label) => (
              <FilterRow key={label.id}>
                <Checkbox checked={filters.labels.includes(label.id)} onChange={() => toggleInList("labels", label.id)} aria-label={label.name} />
                <ToneDot $tone={label.tone} />
                <span className="label">{label.name}</span>
                <Count>{labelCounts.get(label.id) ?? 0}</Count>
              </FilterRow>
            ))}
          </>
        ) : null}

        <SidebarHeading style={{ marginTop: 8 }}>
          <span className="label">Priority</span>
        </SidebarHeading>
        {PRIORITIES.filter((p) => p !== "none").map((priority) => (
          <FilterRow key={priority}>
            <Checkbox checked={filters.priorities.includes(priority)} onChange={() => toggleInList("priorities", priority)} aria-label={priorityLabel(priority)} />
            <span className="label">{priorityLabel(priority)}</span>
          </FilterRow>
        ))}

        {members.length > 0 ? (
          <>
            <SidebarHeading style={{ marginTop: 8 }}>
              <span className="label">People</span>
            </SidebarHeading>
            {members.map((member) => (
              <FilterRow key={member.id}>
                <Checkbox checked={filters.assignees.includes(member.id)} onChange={() => toggleInList("assignees", member.id)} aria-label={member.name} />
                <UserAvatar name={member.name} avatarUrl={member.avatarUrl ?? null} size={14} />
                <span className="label">{member.name}</span>
              </FilterRow>
            ))}
          </>
        ) : null}

        {archivedCount > 0 ? (
          <SidebarRow
            role="button"
            tabIndex={0}
            onClick={onOpenArchive}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenArchive();
              }
            }}
            style={{ marginTop: 8 }}
          >
            <Icon name="Box" size={12} />
            <span className="label">Archive</span>
            <Count>{archivedCount}</Count>
          </SidebarRow>
        ) : null}
      </SidebarGrow>

      <SidebarFooter>
        <UserAvatar name={viewer.name} avatarUrl={viewer.avatarUrl} size={24} />
        <FooterText>
          <span className="label">Shared board</span>
          <span className="label">{onlinePeople.length > 0 ? `${onlinePeople.length} other${onlinePeople.length === 1 ? "" : "s"} here` : "Shared with everyone here"}</span>
        </FooterText>
        <div style={{ marginLeft: "auto" }}>
          <AvatarStack people={onlinePeople} size={16} max={3} />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function countFilters(filters: BoardFilters): number {
  return (
    (filters.mine ? 1 : 0) +
    (filters.unassigned ? 1 : 0) +
    (filters.overdue ? 1 : 0) +
    (filters.dueWithinDays !== null ? 1 : 0) +
    filters.labels.length +
    filters.assignees.length +
    filters.priorities.length +
    (filters.hideCompleted ? 1 : 0)
  );
}
