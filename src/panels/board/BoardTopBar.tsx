import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import styled from "styled-components";
import { Icon, IconButton, Select, Tooltip, t, useInteractionRegister } from "@soft-machine/sdk";
import type { Board, KanbanPresence, Peer, Swimlane } from "../../state/types";
import { AvatarStack } from "../../ui/AvatarStack";
import { CreateButton, InlineInput, PanelTitle, SearchBox, SearchInput, ToolbarGroup, TopBar } from "../../ui/shared";

const SidebarToggle = styled(IconButton)`
  @container (max-width: 760px) {
    display: none;
  }
`;

const SwimlaneSelect = styled(Select)`
  min-width: 96px;
  @container (max-width: 420px) {
    display: none;
  }
`;

const Badge = styled.span`
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: ${t.typography.micro};
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  color: ${t.accent.text};
  background: ${t.accent.primary};
`;

const BadgeWrap = styled.span`
  position: relative;
  display: inline-flex;
`;

export interface BoardTopBarProps {
  board: Board | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  filterCount: number;
  onToggleFilters: () => void;
  swimlane: Swimlane;
  onSwimlaneChange: (value: Swimlane) => void;
  hasFields: boolean;
  onOpenSettings: () => void;
  onNewCard: () => void;
  onRename: (name: string) => void;
  peers: Peer<KanbanPresence>[];
  onBoardMenu: (event: MouseEvent) => void;
}

export function BoardTopBar({
  board,
  sidebarOpen,
  onToggleSidebar,
  query,
  onQueryChange,
  searchRef,
  filterCount,
  onToggleFilters,
  swimlane,
  onSwimlaneChange,
  hasFields,
  onOpenSettings,
  onNewCard,
  onRename,
  peers,
  onBoardMenu,
}: BoardTopBarProps) {
  const [searchOpen, setSearchOpen] = useState(Boolean(query));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(board?.name ?? "");
  const titleRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);

  // Agent-callable controls (inspect_panel / interact).
  useInteractionRegister("new-card", "action", {
    label: "New card",
    description: "Create a card in the first column of the current board",
    getValue: () => null,
    execute: () => onNewCard(),
    elementRef: createRef,
  });
  useInteractionRegister("search", "input", {
    label: "Search cards",
    description: "Filter cards by text, label, assignee or #number",
    getValue: () => query,
    execute: (value: unknown) => {
      onQueryChange(value === undefined || value === null ? "" : String(value));
      setSearchOpen(true);
    },
    elementRef: searchRef,
  });
  useInteractionRegister("board-settings", "action", {
    label: "Board settings",
    description: "Open settings for the current board",
    getValue: () => null,
    execute: () => onOpenSettings(),
    elementRef: settingsRef,
  });
  useInteractionRegister("swimlanes", "select", {
    label: "Swimlanes",
    description: "Group board rows by assignee, priority, label or a custom field",
    getValue: () => swimlane,
    execute: (value: unknown) => onSwimlaneChange(String(value) as Swimlane),
    options: ["none", "assignee", "priority", "label", ...(hasFields ? ["field"] : [])],
  });

  useEffect(() => {
    if (query && !searchOpen) setSearchOpen(true);
  }, [query, searchOpen]);

  useEffect(() => {
    setName(board?.name ?? "");
  }, [board?.name]);

  const people = peers
    .filter((peer) => peer.user && board && peer.value.boardId === board.id)
    .map((peer) => ({ id: `peer:${peer.clientId}`, name: peer.user!.name, color: peer.user!.color, hint: peer.value.editingCardId ? "editing a card" : "viewing" }));

  return (
    <TopBar>
      <ToolbarGroup>
        <SidebarToggle title={sidebarOpen ? "Hide sidebar" : "Show sidebar"} aria-label="Toggle sidebar" $active={false} onClick={onToggleSidebar}>
          <Icon name={sidebarOpen ? "PanelLeftClose" : "PanelLeft"} size={14} />
        </SidebarToggle>
        {renaming && board ? (
          <InlineInput
            autoFocus
            value={name}
            aria-label="Board name"
            style={{ maxWidth: 260, fontSize: t.typography.md, fontWeight: 600 }}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              if (name.trim() && name.trim() !== board.name) onRename(name.trim());
              setRenaming(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              if (event.key === "Escape") {
                setName(board.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <PanelTitle
            ref={titleRef}
            title={board ? "Double-click to rename" : undefined}
            onDoubleClick={() => board && setRenaming(true)}
            onContextMenu={(event) => board && onBoardMenu(event)}
          >
            {board?.name ?? "Kanban"}
          </PanelTitle>
        )}
        {people.length > 0 ? <AvatarStack people={people} size={16} max={4} /> : null}
      </ToolbarGroup>
      <ToolbarGroup>
        {searchOpen ? (
          <SearchBox>
            <Icon name="Search" size={12} />
            <SearchInput
              ref={searchRef}
              data-interaction-id="search"
              value={query}
              placeholder="Search cards"
              aria-label="Search cards"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => onQueryChange(event.target.value)}
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Escape") {
                  onQueryChange("");
                  setSearchOpen(false);
                  (event.target as HTMLInputElement).blur();
                }
              }}
              onBlur={() => {
                if (!query) setSearchOpen(false);
              }}
            />
            <IconButton
              title="Clear search"
              aria-label="Clear search"
              onClick={() => {
                onQueryChange("");
                setSearchOpen(false);
              }}
            >
              <Icon name="X" size={12} />
            </IconButton>
          </SearchBox>
        ) : (
          <IconButton
            title="Search (/)"
            aria-label="Search cards"
            onClick={() => {
              setSearchOpen(true);
              window.setTimeout(() => searchRef.current?.focus(), 0);
            }}
          >
            <Icon name="Search" size={14} />
          </IconButton>
        )}
        <SwimlaneSelect aria-label="Swimlanes" value={swimlane} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onSwimlaneChange(event.target.value as Swimlane)} title="Group rows by">
          <option value="none">No lanes</option>
          <option value="assignee">By assignee</option>
          <option value="priority">By priority</option>
          <option value="label">By label</option>
          {hasFields ? <option value="field">By field</option> : null}
        </SwimlaneSelect>
        <Tooltip content={filterCount ? `${filterCount} active filter${filterCount === 1 ? "" : "s"}` : "Filters live in the sidebar"} delay={300}>
          <BadgeWrap>
            <IconButton title="Filters" aria-label="Filters" $active={filterCount > 0} onClick={onToggleFilters}>
              <Icon name="Filter" size={14} />
            </IconButton>
            {filterCount > 0 ? <Badge>{filterCount}</Badge> : null}
          </BadgeWrap>
        </Tooltip>
        <IconButton ref={settingsRef as never} data-interaction-id="board-settings" title="Board settings" aria-label="Board settings" onClick={onOpenSettings} disabled={!board}>
          <Icon name="Settings" size={14} />
        </IconButton>
        <CreateButton ref={createRef} data-interaction-id="new-card" type="button" onClick={onNewCard} disabled={!board} title="New card (C)" aria-label="New card">
          <Icon name="Plus" size={14} />
        </CreateButton>
      </ToolbarGroup>
    </TopBar>
  );
}
