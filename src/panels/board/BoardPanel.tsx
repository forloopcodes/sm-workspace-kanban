import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import styled from "styled-components";
import {
  Button,
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubMenu,
  Icon,
  Input,
  Select,
  t,
  toast,
  useContextMenu,
  useGlobalPersistedState,
  useOpenPanelSafe,
  usePanelSignal,
  usePersistedState,
  usePluginSettings,
} from "@soft-machine/sdk";
import { registerPanel, setActivePanel, useCommandHandler } from "../../state/bus";
import { addDays, atNoon, startOfWeek, toDayKey } from "../../state/dates";
import { EMPTY_FILTERS, cardMatches, countActiveFilters, normalizeFilters, type BoardFilters } from "../../state/filters";
import { useArchivedCards, useBoard, useBoardCards, useBoards, useColumns, useDerived, useMembers } from "../../state/hooks";
import { KanbanProvider, useKanban } from "../../state/KanbanContext";
import { parseQuickAdd } from "../../state/nlp";
import { useReminders } from "../../state/reminders";
import { BOARD_TEMPLATES } from "../../state/templates";
import { priorityLabel } from "../../state/tones";
import { PRIORITIES, TONES, type Board, type Card, type Column, type DragPresence, type KanbanPresence, type Peer, type Swimlane, type Tone } from "../../state/types";
import { Modal } from "../../ui/Modal";
import { Canvas, EmptyBlock, ErrorState, FieldRow, GhostButton, LoadingState, Muted, Root, Row, Stack, ToneDot, Workspace } from "../../ui/shared";
import { BoardCanvas } from "./BoardCanvas";
import { BoardUiContext, type BoardUi, type LaneValue } from "./boardContext";
import { BoardSettings } from "./BoardSettings";
import { BoardSidebar } from "./BoardSidebar";
import { BoardTopBar } from "./BoardTopBar";
import { CardEditor } from "./CardEditor";
import { ToneSwatches } from "./pickers";

const FilterBanner = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 12px;
  font-size: ${t.typography.sm};
  color: ${t.text.muted};
  border-bottom: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.tertiary};
  & > span {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const ArchiveRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  min-width: 0;
  & > .label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export function BoardPanel({ instanceId }: { instanceId?: string }) {
  return (
    <KanbanProvider kind="board">
      <BoardPanelInner instanceId={instanceId ?? "kanban-board"} />
    </KanbanProvider>
  );
}

function BoardPanelInner({ instanceId }: { instanceId: string }) {
  const { store, ready, unavailable, viewer, peers, dragPeers, setPresence, setDragPresence } = useKanban();
  const boards = useBoards();
  const derived = useDerived();
  const members = useMembers();
  const openPanel = useOpenPanelSafe() as ((request: Record<string, unknown>) => unknown) | null;
  const settings = usePluginSettings("kanban") as { values: Record<string, unknown> };
  const remindersEnabled = settings.values.reminders !== false;

  // Panel substance (shared) and personal view state.
  const [boardPref, setBoardPref] = usePersistedState("boardId", null as string | null, { scope: "shared" }) as [string | null, (value: string | null) => void];
  const [sidebarOpen, setSidebarOpen] = useGlobalPersistedState("kanban/sidebar", true, { scope: "user" }) as [boolean, (value: boolean) => void];
  const [query, setQuery] = usePersistedState("query", "", { scope: "user" }) as [string, (value: string) => void];
  const [rawFilters, setFilters] = usePersistedState("filters", EMPTY_FILTERS as BoardFilters, { scope: "user" }) as [BoardFilters, (value: BoardFilters) => void];
  const [collapsedColumns, setCollapsedColumns] = usePersistedState("collapsed", [] as string[], { scope: "user" }) as [string[], (value: string[]) => void];
  const filters = useMemo(() => normalizeFilters(rawFilters), [rawFilters]);

  const activeBoardId = boards.find((b) => b.id === boardPref)?.id ?? boards[0]?.id ?? null;
  const board = useBoard(activeBoardId);
  const columns = useColumns(activeBoardId);
  const boardCards = useBoardCards(activeBoardId);
  const archived = useArchivedCards(activeBoardId);

  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [deleteColumnTarget, setDeleteColumnTarget] = useState<Column | null>(null);
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<Board | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wipWarned = useRef(new Set<string>());

  const cardMenu = useContextMenu() as ContextMenuApi<Card>;
  const columnMenu = useContextMenu() as ContextMenuApi<Column>;
  const boardMenu = useContextMenu() as ContextMenuApi<Board>;
  // Menus return fresh objects each render; route through refs so the board UI context stays stable.
  const cardMenuRef = useRef(cardMenu);
  cardMenuRef.current = cardMenu;
  const columnMenuRef = useRef(columnMenu);
  columnMenuRef.current = columnMenu;
  const clickGuard = useRef(0);
  const onCardContextMenu = useCallback((event: MouseEvent, card: Card) => cardMenuRef.current.handleContextMenu(event, card), []);
  const onColumnContextMenu = useCallback((event: MouseEvent, column: Column) => columnMenuRef.current.handleContextMenu(event, column), []);

  // Bus registration and focus tracking so module-level commands target this instance.
  useEffect(() => registerPanel(instanceId, "board"), [instanceId]);
  const markActive = useCallback(() => setActivePanel(instanceId, "board"), [instanceId]);

  useEffect(() => {
    setPresence({ boardId: activeBoardId });
  }, [activeBoardId, setPresence]);

  const openCard = useCallback((cardId: string) => setEditingCardId(cardId), []);

  const openInTasks = useCallback(
    (cardId: string) => {
      openPanel?.({ panelTypeId: "kanban-tasks", mode: "findOrOpen", signal: { kind: "show-task", payload: { cardId } } });
    },
    [openPanel]
  );

  useReminders(ready ? store : null, remindersEnabled, openCard);

  usePanelSignal("show-card", (payload: { cardId?: string; boardId?: string }) => {
    if (!store) return;
    if (payload?.cardId) {
      const card = store.snapshot.cards[payload.cardId];
      if (card) {
        setBoardPref(card.boardId);
        setEditingCardId(card.id);
        return;
      }
    }
    if (payload?.boardId && store.snapshot.boards[payload.boardId]) setBoardPref(payload.boardId);
  });

  const labelNames = useMemo(() => Object.fromEntries((board?.labels ?? []).map((label) => [label.id, label.name])), [board?.labels]);

  const filteredByColumn = useMemo(() => {
    const result: Record<string, Card[]> = {};
    if (!board) return result;
    const now = new Date();
    const active = countActiveFilters(filters) > 0 || query.trim().length > 0 || !board.display.showCompleted;
    for (const column of columns) {
      const cards = derived.cardsByColumn[column.id] ?? [];
      result[column.id] = active
        ? cards.filter((card) => (board.display.showCompleted || !card.completedAt) && cardMatches(card, filters, query, labelNames, viewer.id, now))
        : cards;
    }
    return result;
  }, [board, columns, derived.cardsByColumn, filters, query, labelNames, viewer.id]);

  const visibleCount = useMemo(() => Object.values(filteredByColumn).reduce((sum, cards) => sum + cards.length, 0), [filteredByColumn]);

  const createCard = useCallback(
    (columnId: string, text: string, laneValue?: LaneValue): string | null => {
      if (!store || !board) return null;
      const parsed = parseQuickAdd(text, {
        labels: board.labels,
        members,
        viewer: viewer.id ? { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl } : null,
        weekStartsOn: settings.values.weekStartsMonday === false ? 0 : 1,
      });
      const labelIds = [...parsed.labelIds];
      for (const name of parsed.newLabels) {
        const label = store.addLabel(board.id, name, TONES[(board.labels.length + labelIds.length) % TONES.length]);
        if (label) labelIds.push(label.id);
      }
      const draft: Parameters<typeof store.createCard>[0] = {
        boardId: board.id,
        columnId,
        title: parsed.title || text.trim(),
        labels: labelIds,
        assignees: parsed.assignees,
        priority: parsed.priority ?? "none",
        dueAt: parsed.dueAt,
        startAt: parsed.startAt,
        estimate: parsed.estimate,
      };
      if (laneValue) {
        if (laneValue.kind === "priority" && laneValue.value) draft.priority = laneValue.value as Card["priority"];
        if (laneValue.kind === "label" && laneValue.value) draft.labels = [...labelIds, laneValue.value];
        if (laneValue.kind === "assignee" && laneValue.value) {
          const member = members.find((m) => m.id === laneValue.value);
          if (member) draft.assignees = [member];
        }
        if (laneValue.kind === "field" && laneValue.value) {
          const [fieldId, value] = laneValue.value.split("::");
          if (fieldId && value) draft.fields = { [fieldId]: value };
        }
      }
      return store.createCard(draft);
    },
    [store, board, members, viewer, settings.values.weekStartsMonday]
  );

  const newCardInFirstColumn = useCallback(() => {
    if (!store || !board) return;
    const first = columns.find((c) => !c.isDone) ?? columns[0];
    if (!first) {
      toast.error("Add a column first");
      return;
    }
    const id = store.createCard({ boardId: board.id, columnId: first.id, title: "New card", position: "top" });
    if (id) setEditingCardId(id);
  }, [store, board, columns]);

  useCommandHandler(instanceId, "newCard", newCardInFirstColumn);
  useCommandHandler(
    instanceId,
    "search",
    useCallback(() => {
      searchRef.current?.focus();
      if (!searchRef.current) {
        // Search box is collapsed; open it by setting a space then clearing.
        setQuery(" ");
        window.setTimeout(() => {
          setQuery("");
          searchRef.current?.focus();
        }, 0);
      }
    }, [setQuery])
  );
  useCommandHandler(
    instanceId,
    "toggleSidebar",
    useCallback(() => setSidebarOpen(!sidebarOpen), [sidebarOpen, setSidebarOpen])
  );
  useCommandHandler(
    instanceId,
    "settings",
    useCallback(() => setSettingsOpen(true), [])
  );

  const editingByCard = useMemo(() => groupPeers(peers, (value) => value.editingCardId), [peers]);
  const draggingByCard = useMemo(() => groupPeers(dragPeers, (value) => value.draggingCardId), [dragPeers]);

  const onWipExceeded = useCallback((column: Column) => {
    if (wipWarned.current.has(column.id)) return;
    wipWarned.current.add(column.id);
    window.setTimeout(() => wipWarned.current.delete(column.id), 60_000);
    toast.warning(`${column.name} is over its WIP limit`, { description: `Limit is ${column.wipLimit} cards.` });
  }, []);

  const ui = useMemo<BoardUi | null>(() => {
    if (!store || !board) return null;
    return {
      board,
      columns,
      display: board.display,
      store,
      viewerId: viewer.id,
      labelNames,
      editingByCard,
      draggingByCard,
      openCard,
      onCardContextMenu,
      onColumnContextMenu,
      collapsedColumns,
      toggleColumnCollapsed: (columnId) =>
        setCollapsedColumns(collapsedColumns.includes(columnId) ? collapsedColumns.filter((id) => id !== columnId) : [...collapsedColumns, columnId]),
      createCard: (columnId, text, laneValue) => {
        createCard(columnId, text, laneValue);
      },
      setDragPresence,
      onWipExceeded,
      clickGuard,
    };
  }, [store, board, columns, viewer.id, labelNames, editingByCard, draggingByCard, openCard, onCardContextMenu, onColumnContextMenu, collapsedColumns, setCollapsedColumns, createCard, setDragPresence, onWipExceeded]);

  if (unavailable) {
    return (
      <Root>
        <ErrorState />
      </Root>
    );
  }
  if (!ready || !store) {
    return (
      <Root>
        <LoadingState />
      </Root>
    );
  }

  const menuCard = cardMenu.state.data;
  const menuColumn = columnMenu.state.data;
  const menuBoard = boardMenu.state.data;
  const weekStartsOn: 0 | 1 = settings.values.weekStartsMonday === false ? 0 : 1;

  return (
    <Root onPointerDownCapture={markActive} onFocusCapture={markActive}>
      <BoardTopBar
        board={board}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        query={query}
        onQueryChange={setQuery}
        searchRef={searchRef}
        filterCount={countActiveFilters(filters)}
        onToggleFilters={() => setSidebarOpen(true)}
        swimlane={board?.display.swimlane ?? "none"}
        onSwimlaneChange={(value: Swimlane) => board && store.updateBoard(board.id, { display: { ...board.display, swimlane: value, swimlaneFieldId: value === "field" ? board.display.swimlaneFieldId ?? board.fields[0]?.id : board.display.swimlaneFieldId } })}
        hasFields={Boolean(board && board.fields.length > 0)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewCard={newCardInFirstColumn}
        onRename={(name) => board && store.updateBoard(board.id, { name })}
        peers={peers}
        onBoardMenu={(event) => board && boardMenu.handleContextMenu(event, board)}
      />
      <Workspace>
        <BoardSidebar
          open={sidebarOpen}
          boards={boards}
          activeBoardId={activeBoardId}
          onSelectBoard={setBoardPref}
          onCreateBoard={() => setNewBoardOpen(true)}
          onBoardContextMenu={(event, item) => boardMenu.handleContextMenu(event, item)}
          onRenameBoard={(boardId, name) => store.updateBoard(boardId, { name })}
          filters={filters}
          onFiltersChange={setFilters}
          board={board}
          cards={boardCards}
          members={members}
          viewer={viewer}
          peers={peers}
          archivedCount={archived.length}
          onOpenArchive={() => setArchiveOpen(true)}
        />
        <Canvas>
          {board && (countActiveFilters(filters) > 0 || query.trim()) ? (
            <FilterBanner>
              <Icon name="Filter" size={12} />
              <span>
                Showing {visibleCount} of {boardCards.length} cards
                {query.trim() ? ` matching “${query.trim()}”` : ""}
                {countActiveFilters(filters) > 0 ? ` · ${countActiveFilters(filters)} filter${countActiveFilters(filters) === 1 ? "" : "s"}` : ""}
              </span>
              <GhostButton
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilters(EMPTY_FILTERS);
                }}
              >
                Clear
              </GhostButton>
            </FilterBanner>
          ) : null}
          {ui && board ? (
            <BoardUiContext.Provider value={ui}>
              <BoardCanvas cardsByColumn={filteredByColumn} />
            </BoardUiContext.Provider>
          ) : (
            <EmptyBlock>
              <Stack $gap={8} style={{ alignItems: "center" }}>
                <Icon name="LayoutDashboard" size={24} />
                <div>No boards yet.</div>
                <Button $variant="primary" $compact onClick={() => setNewBoardOpen(true)}>
                  Create a board
                </Button>
              </Stack>
            </EmptyBlock>
          )}
        </Canvas>
      </Workspace>

      {editingCardId ? (
        <CardEditor cardId={editingCardId} onClose={() => setEditingCardId(null)} crossAction={{ label: "Open in Tasks", icon: "LayoutList", onClick: openInTasks }} />
      ) : null}

      {settingsOpen && board ? <BoardSettings board={board} columns={columns} onClose={() => setSettingsOpen(false)} onDeleteBoard={() => setDeleteBoardTarget(board)} /> : null}

      <NewBoardModal
        open={newBoardOpen}
        onClose={() => setNewBoardOpen(false)}
        onCreate={(name, templateId, tone) => {
          const id = store.createBoard({ name, templateId, tone });
          setBoardPref(id);
          setNewBoardOpen(false);
          toast.success(`Board “${name}” created`);
        }}
      />

      <Modal open={archiveOpen} onClose={() => setArchiveOpen(false)} title={`Archive · ${archived.length}`} width={480}>
        {archived.length === 0 ? <Muted>No archived cards.</Muted> : null}
        {archived.map((card) => (
          <ArchiveRow key={card.id}>
            <Muted style={{ fontFamily: t.fontMono }}>#{card.number}</Muted>
            <span className="label">{card.title}</span>
            <GhostButton type="button" onClick={() => store.setArchived(card.id, false)}>
              Restore
            </GhostButton>
            <GhostButton
              type="button"
              $danger
              onClick={() => {
                const record = store.deleteCard(card.id);
                if (record) toast("Card deleted", { action: { label: "Undo", onClick: () => store.restoreCard(record) } });
              }}
            >
              Delete
            </GhostButton>
          </ArchiveRow>
        ))}
      </Modal>

      <Modal
        open={Boolean(deleteColumnTarget)}
        onClose={() => setDeleteColumnTarget(null)}
        title={`Delete “${deleteColumnTarget?.name ?? ""}”`}
        width={420}
        footer={
          <>
            <Button $variant="secondary" $compact onClick={() => setDeleteColumnTarget(null)}>
              Cancel
            </Button>
            {columns.filter((c) => c.id !== deleteColumnTarget?.id).length > 0 ? (
              <Button
                $variant="secondary"
                $compact
                onClick={() => {
                  if (!deleteColumnTarget) return;
                  const target = columns.find((c) => c.id !== deleteColumnTarget.id);
                  store.deleteColumn(deleteColumnTarget.id, target?.id ?? null);
                  setDeleteColumnTarget(null);
                  toast.success(`Cards moved to ${target?.name ?? "another column"}`);
                }}
              >
                Move cards &amp; delete
              </Button>
            ) : null}
            <Button
              $variant="danger"
              $compact
              onClick={() => {
                if (!deleteColumnTarget) return;
                store.deleteColumn(deleteColumnTarget.id, null);
                setDeleteColumnTarget(null);
              }}
            >
              Delete with cards
            </Button>
          </>
        }
      >
        <Muted>
          This column has {(derived.cardsByColumn[deleteColumnTarget?.id ?? ""] ?? []).length} card(s). Move them to the next column or delete them along with the column.
        </Muted>
      </Modal>

      <Modal
        open={Boolean(deleteBoardTarget)}
        onClose={() => setDeleteBoardTarget(null)}
        title={`Delete board “${deleteBoardTarget?.name ?? ""}”`}
        width={420}
        footer={
          <>
            <Button $variant="secondary" $compact onClick={() => setDeleteBoardTarget(null)}>
              Cancel
            </Button>
            <Button
              $variant="danger"
              $compact
              onClick={() => {
                if (!deleteBoardTarget) return;
                const exported = store.exportBoard(deleteBoardTarget.id);
                store.deleteBoard(deleteBoardTarget.id);
                setDeleteBoardTarget(null);
                setSettingsOpen(false);
                toast("Board deleted", {
                  action: {
                    label: "Undo",
                    onClick: () => {
                      if (exported) store.importBoard(exported, deleteBoardTarget.name);
                    },
                  },
                });
              }}
            >
              Delete board
            </Button>
          </>
        }
      >
        <Muted>All columns and {(derived.cardsByBoard[deleteBoardTarget?.id ?? ""] ?? []).length} card(s) on this board will be deleted for everyone in the workspace. You can undo from the toast right after.</Muted>
      </Modal>

      {cardMenu.state.isOpen && menuCard ? (
        <ContextMenu x={cardMenu.state.x} y={cardMenu.state.y} onDismiss={cardMenu.close}>
          <ContextMenuItem
            icon={<Icon name="Pencil" size={12} />}
            onClick={() => {
              openCard(menuCard.id);
              cardMenu.close();
            }}
          >
            Open
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Icon name="Check" size={12} />}
            onClick={() => {
              store.toggleComplete(menuCard.id);
              cardMenu.close();
            }}
          >
            {menuCard.completedAt ? "Reopen" : "Mark complete"}
          </ContextMenuItem>
          <ContextMenuSubMenu label="Move to" icon={<Icon name="ArrowRight" size={12} />}>
            {columns.map((column) => (
              <ContextMenuItem
                key={column.id}
                disabled={column.id === menuCard.columnId}
                onClick={() => {
                  store.moveCard(menuCard.id, column.id, Number.MAX_SAFE_INTEGER);
                  cardMenu.close();
                }}
              >
                <Row $gap={6}>
                  <ToneDot $tone={column.tone} />
                  {column.name}
                </Row>
              </ContextMenuItem>
            ))}
            {boards.length > 1 ? <ContextMenuSeparator /> : null}
            {boards
              .filter((b) => b.id !== menuCard.boardId)
              .map((b) => {
                const firstColumn = (derived.columnsByBoard[b.id] ?? [])[0];
                return (
                  <ContextMenuItem
                    key={b.id}
                    disabled={!firstColumn}
                    onClick={() => {
                      if (firstColumn) store.moveCardToBoard(menuCard.id, b.id, firstColumn.id);
                      cardMenu.close();
                      toast.success(`Moved to ${b.name}`);
                    }}
                  >
                    <Row $gap={6}>
                      <ToneDot $tone={b.tone} />
                      Board: {b.name}
                    </Row>
                  </ContextMenuItem>
                );
              })}
          </ContextMenuSubMenu>
          <ContextMenuSubMenu label="Priority" icon={<Icon name="ArrowUp" size={12} />}>
            {PRIORITIES.map((priority) => (
              <ContextMenuItem
                key={priority}
                selected={menuCard.priority === priority}
                onClick={() => {
                  store.updateCard(menuCard.id, { priority });
                  cardMenu.close();
                }}
              >
                {priorityLabel(priority)}
              </ContextMenuItem>
            ))}
          </ContextMenuSubMenu>
          <ContextMenuSubMenu label="Due" icon={<Icon name="Calendar" size={12} />}>
            {[
              { label: "Today", value: toDayKey(atNoon(new Date())) },
              { label: "Tomorrow", value: toDayKey(addDays(new Date(), 1)) },
              { label: "Next week", value: toDayKey(addDays(startOfWeek(new Date(), weekStartsOn), 7)) },
              { label: "In 2 weeks", value: toDayKey(addDays(new Date(), 14)) },
              { label: "Clear", value: null },
            ].map((option) => (
              <ContextMenuItem
                key={option.label}
                onClick={() => {
                  store.updateCard(menuCard.id, { dueAt: option.value });
                  cardMenu.close();
                }}
              >
                {option.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubMenu>
          <ContextMenuItem
            icon={<Icon name="User" size={12} />}
            onClick={() => {
              if (viewer.id) {
                const me = { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl };
                const has = menuCard.assignees.some((a) => a.id === viewer.id);
                store.updateCard(menuCard.id, { assignees: has ? menuCard.assignees.filter((a) => a.id !== viewer.id) : [...menuCard.assignees, me] });
              }
              cardMenu.close();
            }}
          >
            {menuCard.assignees.some((a) => a.id === viewer.id) ? "Unassign me" : "Assign to me"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            icon={<Icon name="LayoutList" size={12} />}
            onClick={() => {
              openInTasks(menuCard.id);
              cardMenu.close();
            }}
          >
            Open in Tasks
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Icon name="Copy" size={12} />}
            onClick={() => {
              store.duplicateCard(menuCard.id);
              cardMenu.close();
              toast.success("Card duplicated");
            }}
          >
            Duplicate
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Icon name="Link" size={12} />}
            onClick={() => {
              navigator.clipboard?.writeText(`#${menuCard.number} ${menuCard.title}`).then(() => toast.success("Copied card reference"));
              cardMenu.close();
            }}
          >
            Copy reference
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            icon={<Icon name="Box" size={12} />}
            onClick={() => {
              store.setArchived(menuCard.id, true);
              cardMenu.close();
              toast("Card archived", { action: { label: "Undo", onClick: () => store.setArchived(menuCard.id, false) } });
            }}
          >
            Archive
          </ContextMenuItem>
          <ContextMenuItem
            variant="danger"
            icon={<Icon name="Trash2" size={12} />}
            onClick={() => {
              const record = store.deleteCard(menuCard.id);
              cardMenu.close();
              if (record) toast("Card deleted", { action: { label: "Undo", onClick: () => store.restoreCard(record) } });
            }}
          >
            Delete
          </ContextMenuItem>
        </ContextMenu>
      ) : null}

      {columnMenu.state.isOpen && menuColumn ? (
        <ContextMenu x={columnMenu.state.x} y={columnMenu.state.y} onDismiss={columnMenu.close}>
          <ContextMenuItem
            icon={<Icon name="Plus" size={12} />}
            onClick={() => {
              const id = store.createCard({ boardId: menuColumn.boardId, columnId: menuColumn.id, title: "New card", position: "top" });
              if (id) setEditingCardId(id);
              columnMenu.close();
            }}
          >
            Add card
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Icon name="Pencil" size={12} />}
            onClick={() => {
              setSettingsOpen(true);
              columnMenu.close();
            }}
          >
            Edit columns…
          </ContextMenuItem>
          <ContextMenuSubMenu label="Color" icon={<Icon name="Palette" size={12} />}>
            <div style={{ padding: "6px 8px" }}>
              <ToneSwatches value={menuColumn.tone} onChange={(tone: Tone | null) => tone && store.updateColumn(menuColumn.id, { tone })} />
            </div>
          </ContextMenuSubMenu>
          <ContextMenuItem
            icon={<Icon name="Check" size={12} />}
            selected={menuColumn.isDone}
            onClick={() => {
              store.setDoneColumn(menuColumn.boardId, menuColumn.isDone ? null : menuColumn.id);
              columnMenu.close();
            }}
          >
            {menuColumn.isDone ? "Unset as done column" : "Set as done column"}
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Icon name={ui?.collapsedColumns.includes(menuColumn.id) ? "ChevronRight" : "ChevronLeft"} size={12} />}
            onClick={() => {
              ui?.toggleColumnCollapsed(menuColumn.id);
              columnMenu.close();
            }}
          >
            {ui?.collapsedColumns.includes(menuColumn.id) ? "Expand" : "Collapse"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="danger"
            icon={<Icon name="Trash2" size={12} />}
            onClick={() => {
              const count = (derived.cardsByColumn[menuColumn.id] ?? []).length;
              columnMenu.close();
              if (count === 0) store.deleteColumn(menuColumn.id, null);
              else setDeleteColumnTarget(menuColumn);
            }}
          >
            Delete column
          </ContextMenuItem>
        </ContextMenu>
      ) : null}

      {boardMenu.state.isOpen && menuBoard ? (
        <ContextMenu x={boardMenu.state.x} y={boardMenu.state.y} onDismiss={boardMenu.close}>
          <ContextMenuItem
            icon={<Icon name="Settings" size={12} />}
            onClick={() => {
              setBoardPref(menuBoard.id);
              setSettingsOpen(true);
              boardMenu.close();
            }}
          >
            Board settings
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Icon name="Download" size={12} />}
            onClick={() => {
              const exported = store.exportBoard(menuBoard.id);
              if (exported) downloadJson(`${menuBoard.name.replace(/[^\w-]+/g, "-").toLowerCase()}.kanban.json`, exported);
              boardMenu.close();
            }}
          >
            Export JSON
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Icon name="Copy" size={12} />}
            onClick={() => {
              const exported = store.exportBoard(menuBoard.id);
              if (exported) {
                const id = store.importBoard(exported, `${menuBoard.name} (copy)`);
                if (id) setBoardPref(id);
              }
              boardMenu.close();
            }}
          >
            Duplicate board
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="danger"
            icon={<Icon name="Trash2" size={12} />}
            onClick={() => {
              setDeleteBoardTarget(menuBoard);
              boardMenu.close();
            }}
          >
            Delete board
          </ContextMenuItem>
        </ContextMenu>
      ) : null}
    </Root>
  );
}

interface ContextMenuApi<T> {
  state: { isOpen: boolean; x: number; y: number; data?: T };
  open: (x: number, y: number, data?: T, anchor?: HTMLElement | null) => void;
  close: () => void;
  handleContextMenu: (event: MouseEvent, data?: T) => void;
}

function groupPeers<T>(peers: Peer<T>[], pick: (value: T) => string | null | undefined): Record<string, Peer<T>[]> {
  const result: Record<string, Peer<T>[]> = {};
  for (const peer of peers) {
    const key = pick(peer.value);
    if (!key) continue;
    (result[key] ??= []).push(peer);
  }
  return result;
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NewBoardModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string, templateId: string, tone: Tone) => void }) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("basic");
  const [tone, setTone] = useState<Tone>("accent");
  useEffect(() => {
    if (open) {
      setName("");
      setTemplateId("basic");
      setTone("accent");
    }
  }, [open]);
  const template = BOARD_TEMPLATES.find((item) => item.id === templateId) ?? BOARD_TEMPLATES[0];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New board"
      width={420}
      footer={
        <>
          <Button $variant="secondary" $compact onClick={onClose}>
            Cancel
          </Button>
          <Button $variant="primary" $compact disabled={!name.trim()} onClick={() => onCreate(name.trim(), templateId, tone)}>
            Create
          </Button>
        </>
      }
    >
      <FieldRow>
        <label>Name</label>
        <Input
          autoFocus
          $fullWidth
          value={name}
          placeholder="Board name"
          aria-label="Board name"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" && name.trim()) onCreate(name.trim(), templateId, tone);
          }}
        />
      </FieldRow>
      <FieldRow>
        <label>Template</label>
        <Select aria-label="Template" value={templateId} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setTemplateId(event.target.value)}>
          {BOARD_TEMPLATES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </FieldRow>
      <Muted style={{ paddingLeft: 104 }}>
        {template.description} {template.columns.map((c) => c.name).join(" → ")}.
      </Muted>
      <FieldRow>
        <label>Color</label>
        <ToneSwatches value={tone} onChange={(next) => next && setTone(next)} />
      </FieldRow>
    </Modal>
  );
}
