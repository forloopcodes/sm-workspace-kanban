import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import styled from "styled-components";
import {
  Button,
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubMenu,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  Icon,
  IconButton,
  Select,
  Tooltip,
  t,
  toast,
  useContextMenu,
  useInteractionRegister,
  useOpenPanelSafe,
  usePanelSignal,
  usePersistedState,
  usePluginSettings,
} from "@soft-machine/sdk";
import { registerPanel, setActivePanel, useCommandHandler } from "../../state/bus";
import { addDays, atNoon, startOfWeek, toDayKey } from "../../state/dates";
import { matchesQuery } from "../../state/filters";
import { useAllCards, useBoards, useDerived, useMembers, useSnapshot } from "../../state/hooks";
import { cardsToCsv, cardsToIcs, downloadText } from "../../state/io";
import { KanbanProvider, useKanban } from "../../state/KanbanContext";
import { parseQuickAdd } from "../../state/nlp";
import { useReminders } from "../../state/reminders";
import { priorityLabel } from "../../state/tones";
import { PRIORITIES, TONES, type Card } from "../../state/types";
import { Modal } from "../../ui/Modal";
import { Canvas, Count, CreateButton, ErrorState, LoadingState, Muted, PanelTitle, Root, Row, SearchBox, SearchInput, ToneDot, ToolbarGroup, TopBar } from "../../ui/shared";
import { CardEditor } from "../board/CardEditor";
import { ListView, type GroupBy, type SortBy } from "./ListView";
import { QuickAdd } from "./QuickAdd";
import { ScheduleView, resolveReschedule } from "./ScheduleView";
import { TaskRow } from "./TaskRow";
import { TimelineView } from "./TimelineView";

type View = "list" | "schedule" | "timeline";
const VIEWS: View[] = ["list", "schedule", "timeline"];

const Body = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ListScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 6px 12px;
  scrollbar-width: thin;
`;

const ViewSelect = styled(Select)`
  min-width: 92px;
`;

const NarrowHide = styled.div`
  display: contents;
  @container (max-width: 420px) {
    display: none;
  }
`;

export function TasksPanel({ instanceId }: { instanceId?: string }) {
  return (
    <KanbanProvider kind="tasks">
      <TasksInner instanceId={instanceId ?? "kanban-tasks"} />
    </KanbanProvider>
  );
}

function TasksInner({ instanceId }: { instanceId: string }) {
  const { store, ready, unavailable, viewer, peers } = useKanban();
  const snapshot = useSnapshot();
  const derived = useDerived();
  const boards = useBoards();
  const allCards = useAllCards();
  const members = useMembers();
  const openPanel = useOpenPanelSafe() as ((request: Record<string, unknown>) => unknown) | null;
  const settings = usePluginSettings("kanban") as { values: Record<string, unknown> };
  const weekStartsOn: 0 | 1 = settings.values.weekStartsMonday === false ? 0 : 1;
  const confirmDelete = settings.values.confirmDelete !== false;

  // Always pass options: a two-argument call with a string default is parsed as the explicit (panelId, key) form.
  const [boardFilter, setBoardFilter] = usePersistedState("boardId", "all", { scope: "shared" }) as [string, (value: string) => void];
  const [view, setView] = usePersistedState("view", "list" as View, { scope: "user" }) as [View, (value: View) => void];
  const [groupBy, setGroupBy] = usePersistedState("groupBy", "due" as GroupBy, { scope: "user" }) as [GroupBy, (value: GroupBy) => void];
  const [sortBy, setSortBy] = usePersistedState("sortBy", "due" as SortBy, { scope: "user" }) as [SortBy, (value: SortBy) => void];
  const [query, setQuery] = usePersistedState("query", "", { scope: "user" }) as [string, (value: string) => void];
  const [onlyMine, setOnlyMine] = usePersistedState("onlyMine", false, { scope: "user" }) as [boolean, (value: boolean) => void];
  const [showCompleted, setShowCompleted] = usePersistedState("showCompleted", false, { scope: "user" }) as [boolean, (value: boolean) => void];
  const [targetBoardPref, setTargetBoardPref] = usePersistedState("targetBoard", null as string | null, { scope: "user" }) as [string | null, (value: string | null) => void];

  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => new Date());
  const [searchOpen, setSearchOpen] = useState(Boolean(query));
  const [pendingDelete, setPendingDelete] = useState<Card | null>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const todayElement = useRef<HTMLElement | null>(null);
  const menu = useContextMenu() as {
    state: { isOpen: boolean; x: number; y: number; data?: Card };
    close: () => void;
    handleContextMenu: (event: MouseEvent, data?: Card) => void;
  };

  useEffect(() => registerPanel(instanceId, "tasks"), [instanceId]);
  const markActive = useCallback(() => setActivePanel(instanceId, "tasks"), [instanceId]);

  const boardScope = boards.find((b) => b.id === boardFilter) ?? null;
  const targetBoard = boards.find((b) => b.id === (boardScope?.id ?? targetBoardPref)) ?? boards[0] ?? null;

  const openCard = useCallback((cardId: string) => setEditingCardId(cardId), []);
  useReminders(ready ? store : null, settings.values.reminders !== false, openCard);

  usePanelSignal("show-task", (payload: { cardId?: string }) => {
    if (payload?.cardId && store?.snapshot.cards[payload.cardId]) setEditingCardId(payload.cardId);
  });

  const openInBoard = useCallback(
    (cardId: string) => {
      openPanel?.({ panelTypeId: "kanban-board", mode: "findOrOpen", signal: { kind: "show-card", payload: { cardId } } });
    },
    [openPanel]
  );

  const labelNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const board of boards) for (const label of board.labels) map[label.id] = label.name;
    return map;
  }, [boards]);

  const visibleCards = useMemo(() => {
    const scoped = boardScope ? derived.cardsByBoard[boardScope.id] ?? [] : allCards;
    return scoped.filter((card) => {
      if (!showCompleted && card.completedAt) return false;
      if (onlyMine && !(viewer.id && card.assignees.some((a) => a.id === viewer.id))) return false;
      return matchesQuery(card, query, labelNames);
    });
  }, [boardScope, derived.cardsByBoard, allCards, showCompleted, onlyMine, viewer.id, query, labelNames]);

  const peerColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const peer of peers) if (peer.user && peer.value.editingCardId) map[peer.value.editingCardId] = peer.user.color;
    return map;
  }, [peers]);

  const parseContext = useMemo(
    () => ({
      labels: targetBoard?.labels ?? [],
      members,
      viewer: viewer.id ? { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl } : null,
      weekStartsOn,
    }),
    [targetBoard?.labels, members, viewer, weekStartsOn]
  );

  const quickAdd = useCallback(
    (text: string) => {
      if (!store || !targetBoard) {
        toast.error("Create a board first");
        return;
      }
      const columns = derived.columnsByBoard[targetBoard.id] ?? [];
      const column = columns.find((c) => !c.isDone) ?? columns[0];
      if (!column) {
        toast.error(`${targetBoard.name} has no columns`);
        return;
      }
      const parsed = parseQuickAdd(text, parseContext);
      const labelIds = [...parsed.labelIds];
      for (const name of parsed.newLabels) {
        const label = store.addLabel(targetBoard.id, name, TONES[(targetBoard.labels.length + labelIds.length) % TONES.length]);
        if (label) labelIds.push(label.id);
      }
      const id = store.createCard({
        boardId: targetBoard.id,
        columnId: column.id,
        title: parsed.title || text.trim(),
        labels: labelIds,
        assignees: parsed.assignees,
        priority: parsed.priority ?? "none",
        dueAt: parsed.dueAt,
        startAt: parsed.startAt,
        estimate: parsed.estimate,
      });
      if (id) toast.success(`Added to ${targetBoard.name} · ${column.name}`, { action: { label: "Open", onClick: () => setEditingCardId(id) } });
    },
    [store, targetBoard, derived.columnsByBoard, parseContext]
  );

  const cycleView = useCallback(() => setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]), [view, setView]);
  const jumpToday = useCallback(() => {
    setAnchor(new Date());
    todayElement.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  useCommandHandler(instanceId, "quickAdd", useCallback(() => quickAddRef.current?.focus(), []));
  useCommandHandler(instanceId, "today", jumpToday);
  useCommandHandler(instanceId, "cycleView", cycleView);

  useInteractionRegister("view", "select", {
    label: "Tasks view",
    description: "Switch between List, Schedule and Timeline",
    getValue: () => view,
    execute: (value: unknown) => VIEWS.includes(value as View) && setView(value as View),
    options: VIEWS,
  });
  useInteractionRegister("quick-add", "input", {
    label: "Quick add task",
    description: "Type a task; supports dates, !priority, #labels, @people and ~estimates. Submits on Enter.",
    getValue: () => quickAddRef.current?.value ?? "",
    execute: (value: unknown) => {
      if (value === undefined || value === null) return;
      quickAdd(String(value));
    },
    elementRef: quickAddRef,
  });
  useInteractionRegister("board-scope", "select", {
    label: "Board scope",
    description: "Limit tasks to one board or show all",
    getValue: () => boardFilter,
    execute: (value: unknown) => setBoardFilter(String(value)),
    options: ["all", ...boards.map((b) => b.id)],
  });
  useInteractionRegister("show-completed", "toggle", {
    label: "Show completed",
    description: "Include completed tasks",
    getValue: () => showCompleted,
    execute: (value: unknown) => setShowCompleted(value === undefined ? !showCompleted : Boolean(value)),
  });

  const deleteCard = useCallback(
    (card: Card) => {
      if (!store) return;
      const record = store.deleteCard(card.id);
      if (record) toast("Task deleted", { action: { label: "Undo", onClick: () => store.restoreCard(record) } });
    },
    [store]
  );

  if (unavailable) {
    return (
      <Root>
        <ErrorState title="Tasks unavailable" />
      </Root>
    );
  }
  if (!ready || !store) {
    return (
      <Root>
        <LoadingState title="Opening tasks…" />
      </Root>
    );
  }

  const menuCard = menu.state.data;
  const dueOptions = [
    { label: "Today", value: toDayKey(atNoon(new Date())) },
    { label: "Tomorrow", value: toDayKey(addDays(new Date(), 1)) },
    { label: "Next week", value: toDayKey(addDays(startOfWeek(new Date(), weekStartsOn), 7)) },
    { label: "In 2 weeks", value: toDayKey(addDays(new Date(), 14)) },
    { label: "Clear", value: null },
  ];

  return (
    <Root onPointerDownCapture={markActive} onFocusCapture={markActive}>
      <TopBar>
        <ToolbarGroup>
          <PanelTitle>{boardScope ? boardScope.name : "Tasks"}</PanelTitle>
          <Count>{visibleCards.length}</Count>
        </ToolbarGroup>
        <ToolbarGroup>
          {searchOpen ? (
            <SearchBox>
              <Icon name="Search" size={12} />
              <SearchInput
                ref={searchRef}
                autoFocus
                value={query}
                placeholder="Search tasks"
                aria-label="Search tasks"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setQuery("");
                    setSearchOpen(false);
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
                  setQuery("");
                  setSearchOpen(false);
                }}
              >
                <Icon name="X" size={12} />
              </IconButton>
            </SearchBox>
          ) : (
            <IconButton title="Search" aria-label="Search tasks" onClick={() => setSearchOpen(true)}>
              <Icon name="Search" size={14} />
            </IconButton>
          )}
          <NarrowHide>
            <Select aria-label="Board" value={boardFilter} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setBoardFilter(event.target.value)} style={{ maxWidth: 140 }}>
              <option value="all">All boards</option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </Select>
          </NarrowHide>
          <ViewSelect aria-label="View" value={view} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setView(event.target.value as View)}>
            <option value="list">List</option>
            <option value="schedule">Schedule</option>
            <option value="timeline">Timeline</option>
          </ViewSelect>
          {view === "list" ? (
            <NarrowHide>
              <Select aria-label="Group by" value={groupBy} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setGroupBy(event.target.value as GroupBy)}>
                <option value="none">No groups</option>
                <option value="due">By due</option>
                <option value="board">By board</option>
                <option value="column">By column</option>
                <option value="assignee">By assignee</option>
                <option value="priority">By priority</option>
                <option value="label">By label</option>
              </Select>
            </NarrowHide>
          ) : null}
          <Dropdown
            align="end"
            minWidth={220}
            trigger={
              <IconButton title="More" aria-label="More options">
                <Icon name="MoreHorizontal" size={14} />
              </IconButton>
            }
          >
            <DropdownItem selected={onlyMine} closeOnClick={false} icon={<Icon name="User" size={12} />} onClick={() => setOnlyMine(!onlyMine)}>
              Only my tasks
            </DropdownItem>
            <DropdownItem selected={showCompleted} closeOnClick={false} icon={<Icon name="Check" size={12} />} onClick={() => setShowCompleted(!showCompleted)}>
              Show completed
            </DropdownItem>
            <DropdownSeparator />
            {view === "list" ? (
              <>
                {(["due", "priority", "created", "title", "manual"] as SortBy[]).map((option) => (
                  <DropdownItem key={option} selected={sortBy === option} closeOnClick={false} onClick={() => setSortBy(option)}>
                    Sort by {option === "manual" ? "board order" : option}
                  </DropdownItem>
                ))}
                <DropdownSeparator />
              </>
            ) : null}
            <DropdownItem
              icon={<Icon name="Calendar" size={12} />}
              onClick={() => {
                downloadText("tasks.ics", cardsToIcs(visibleCards, snapshot.boards, snapshot.columns), "text/calendar");
                toast.success("Exported due dates as ICS");
              }}
            >
              Export ICS (due dates)
            </DropdownItem>
            <DropdownItem
              icon={<Icon name="Download" size={12} />}
              onClick={() => {
                downloadText("tasks.csv", cardsToCsv(visibleCards, snapshot.boards, snapshot.columns), "text/csv");
                toast.success("Exported CSV");
              }}
            >
              Export CSV
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<Icon name="LayoutDashboard" size={12} />} onClick={() => openPanel?.({ panelTypeId: "kanban-board", mode: "findOrOpen", signal: boardScope ? { kind: "show-card", payload: { boardId: boardScope.id } } : undefined })}>
              Open board
            </DropdownItem>
          </Dropdown>
          <Tooltip content="Quick add (N)" delay={300}>
            <CreateButton type="button" aria-label="Quick add" onClick={() => quickAddRef.current?.focus()}>
              <Icon name="Plus" size={14} />
            </CreateButton>
          </Tooltip>
        </ToolbarGroup>
      </TopBar>

      <QuickAdd
        ref={quickAddRef}
        boards={boards}
        targetBoardId={targetBoard?.id ?? null}
        onTargetBoardChange={(id) => setTargetBoardPref(id)}
        parseContext={parseContext}
        onSubmit={quickAdd}
        showBoardPicker={!boardScope && boards.length > 1}
      />

      <Body>
        {view === "list" ? (
          <ListScroll>
            <ListView
              cards={visibleCards}
              boards={snapshot.boards}
              columns={snapshot.columns}
              columnsByBoard={derived.columnsByBoard}
              groupBy={groupBy}
              sortBy={sortBy}
              showBoard={!boardScope}
              onOpen={openCard}
              onToggleComplete={(id) => store.toggleComplete(id)}
              onContextMenu={(event, card) => menu.handleContextMenu(event, card)}
              peerColors={peerColors}
            />
          </ListScroll>
        ) : view === "schedule" ? (
          <ListScroll>
            <ScheduleView
              cards={visibleCards}
              boards={snapshot.boards}
              columns={snapshot.columns}
              showBoard={!boardScope}
              weekStartsOn={weekStartsOn}
              onOpen={openCard}
              onToggleComplete={(id) => store.toggleComplete(id)}
              onContextMenu={(event, card) => menu.handleContextMenu(event, card)}
              onReschedule={(cardId, payload) => {
                const card = store.snapshot.cards[cardId];
                if (!card) return;
                store.updateCard(cardId, { dueAt: resolveReschedule(payload, card) });
              }}
              peerColors={peerColors}
              todayRef={(element) => {
                todayElement.current = element;
              }}
            />
          </ListScroll>
        ) : (
          <TimelineView
            cards={visibleCards}
            boards={snapshot.boards}
            columns={snapshot.columns}
            weekStartsOn={weekStartsOn}
            anchor={anchor}
            onAnchorChange={setAnchor}
            onOpen={openCard}
            onContextMenu={(event, card) => menu.handleContextMenu(event, card)}
            onSetDates={(cardId, startAt, dueAt) => store.updateCard(cardId, { startAt, dueAt })}
            todayRef={(element) => {
              todayElement.current = element;
            }}
          />
        )}
      </Body>

      {editingCardId ? (
        <CardEditor cardId={editingCardId} onClose={() => setEditingCardId(null)} crossAction={{ label: "Open in board", icon: "LayoutDashboard", onClick: openInBoard }} />
      ) : null}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete task"
        width={380}
        footer={
          <>
            <Button $variant="secondary" $compact onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              $variant="danger"
              $compact
              onClick={() => {
                if (pendingDelete) deleteCard(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <Muted>Delete “{pendingDelete?.title}” for everyone? You can undo from the toast right after.</Muted>
      </Modal>

      {menu.state.isOpen && menuCard ? (
        <ContextMenu x={menu.state.x} y={menu.state.y} onDismiss={menu.close}>
          <ContextMenuItem
            icon={<Icon name="Pencil" size={12} />}
            onClick={() => {
              openCard(menuCard.id);
              menu.close();
            }}
          >
            Open
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Icon name="Check" size={12} />}
            onClick={() => {
              store.toggleComplete(menuCard.id);
              menu.close();
            }}
          >
            {menuCard.completedAt ? "Reopen" : "Mark complete"}
          </ContextMenuItem>
          <ContextMenuSubMenu label="Due" icon={<Icon name="Calendar" size={12} />}>
            {dueOptions.map((option) => (
              <ContextMenuItem
                key={option.label}
                onClick={() => {
                  store.updateCard(menuCard.id, { dueAt: option.value });
                  menu.close();
                }}
              >
                {option.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubMenu>
          <ContextMenuSubMenu label="Priority" icon={<Icon name="ArrowUp" size={12} />}>
            {PRIORITIES.map((priority) => (
              <ContextMenuItem
                key={priority}
                selected={menuCard.priority === priority}
                onClick={() => {
                  store.updateCard(menuCard.id, { priority });
                  menu.close();
                }}
              >
                {priorityLabel(priority)}
              </ContextMenuItem>
            ))}
          </ContextMenuSubMenu>
          <ContextMenuSubMenu label="Move to" icon={<Icon name="ArrowRight" size={12} />}>
            {(derived.columnsByBoard[menuCard.boardId] ?? []).map((column) => (
              <ContextMenuItem
                key={column.id}
                disabled={column.id === menuCard.columnId}
                onClick={() => {
                  store.moveCard(menuCard.id, column.id, Number.MAX_SAFE_INTEGER);
                  menu.close();
                }}
              >
                <Row $gap={6}>
                  <ToneDot $tone={column.tone} />
                  {column.name}
                </Row>
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
              menu.close();
            }}
          >
            {menuCard.assignees.some((a) => a.id === viewer.id) ? "Unassign me" : "Assign to me"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            icon={<Icon name="LayoutDashboard" size={12} />}
            onClick={() => {
              openInBoard(menuCard.id);
              menu.close();
            }}
          >
            Open in board
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Icon name="Box" size={12} />}
            onClick={() => {
              store.setArchived(menuCard.id, true);
              menu.close();
              toast("Task archived", { action: { label: "Undo", onClick: () => store.setArchived(menuCard.id, false) } });
            }}
          >
            Archive
          </ContextMenuItem>
          <ContextMenuItem
            variant="danger"
            icon={<Icon name="Trash2" size={12} />}
            onClick={() => {
              menu.close();
              if (confirmDelete) setPendingDelete(menuCard);
              else deleteCard(menuCard);
            }}
          >
            Delete
          </ContextMenuItem>
        </ContextMenu>
      ) : null}
    </Root>
  );
}

export { TaskRow };
