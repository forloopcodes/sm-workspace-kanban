import { createElement, lazy, Suspense, useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { PluginCommand, PluginInitialization, PluginLoadingState, PluginModule, PluginPersistence, PluginSimulation, PluginUndoRedo } from "@soft-machine/sdk";
import { Icon, registerPluginModule, useOpenPanelSafe } from "@soft-machine/sdk";
import { emitCommand, getActiveStore, subscribeStores } from "./state/bus";
import { LoadingState } from "./ui/shared";

const LazyBoardPanel = lazy(() => import("./panels/board/BoardPanel").then((module) => ({ default: module.BoardPanel })));
const LazyTasksPanel = lazy(() => import("./panels/tasks/TasksPanel").then((module) => ({ default: module.TasksPanel })));

function Provider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function BoardPanel({ instanceId }: { instanceId?: string }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <LazyBoardPanel instanceId={instanceId} />
    </Suspense>
  );
}

function TasksPanel({ instanceId }: { instanceId?: string }) {
  return (
    <Suspense fallback={<LoadingState title="Opening tasks…" text="Connecting to the shared workspace board." />}>
      <LazyTasksPanel instanceId={instanceId} />
    </Suspense>
  );
}

function useLoadingState(): PluginLoadingState {
  return useMemo(() => ({ isLoading: false, error: null }), []);
}

function usePersistence(): PluginPersistence {
  return useMemo(
    () => ({
      getState: () => null,
      restoreState: () => {},
      getMetrics: () => ({ primaryCount: 0, primaryLabel: "cards", generation: 1 }),
      getMetadataString: () => "Collaborative kanban boards and tasks",
      generation: 1,
      isReady: true,
      setReady: () => {},
    }),
    []
  );
}

function useSimulation(): PluginSimulation {
  return useMemo(() => ({ isRunning: false, run: () => {}, stop: () => {}, step: () => {}, reset: () => {} }), []);
}

function useInitialization(): PluginInitialization {
  return useMemo(() => ({ clear: () => {}, refresh: () => {} }), []);
}

function useCommands(): PluginCommand[] {
  const openPanel = useOpenPanelSafe() as ((request: Record<string, unknown>) => unknown) | null;
  return useMemo(
    () => [
      {
        id: "kanban.open",
        label: "Kanban: Open board",
        description: "Open the shared kanban board",
        icon: createElement(Icon, { name: "LayoutDashboard", size: 14 }),
        action: () => openPanel?.({ panelTypeId: "kanban-board", mode: "findOrOpen", placement: "float" }),
      },
      {
        id: "kanban.tasks.open",
        label: "Kanban: Open tasks",
        description: "Open the tasks list, schedule and timeline",
        icon: createElement(Icon, { name: "LayoutList", size: 14 }),
        action: () => openPanel?.({ panelTypeId: "kanban-tasks", mode: "findOrOpen", placement: "float" }),
      },
      {
        id: "kanban.newCard",
        label: "Kanban: New card",
        description: "Create a card in the first column of the focused board",
        key: "KeyC",
        whenPanelFocused: "kanban-board",
        action: () => emitCommand("board", "newCard"),
      },
      {
        id: "kanban.search",
        label: "Kanban: Search cards",
        key: "Slash",
        whenPanelFocused: "kanban-board",
        action: () => emitCommand("board", "search"),
      },
      {
        id: "kanban.toggleSidebar",
        label: "Kanban: Toggle sidebar",
        key: "Backslash",
        whenPanelFocused: "kanban-board",
        action: () => emitCommand("board", "toggleSidebar"),
      },
      {
        id: "kanban.boardSettings",
        label: "Kanban: Board settings",
        description: "Columns, labels, fields, automations and display",
        whenPanelFocused: "kanban-board",
        action: () => emitCommand("board", "settings"),
      },
      {
        id: "kanban.tasks.quickAdd",
        label: "Tasks: Quick add",
        description: "Focus the quick-add box in the Tasks panel",
        key: "KeyN",
        whenPanelFocused: "kanban-tasks",
        action: () => emitCommand("tasks", "quickAdd"),
      },
      {
        id: "kanban.tasks.today",
        label: "Tasks: Jump to today",
        key: "KeyT",
        whenPanelFocused: "kanban-tasks",
        action: () => emitCommand("tasks", "today"),
      },
      {
        id: "kanban.tasks.cycleView",
        label: "Tasks: Next view",
        description: "Cycle List → Schedule → Timeline",
        key: "KeyV",
        whenPanelFocused: "kanban-tasks",
        action: () => emitCommand("tasks", "cycleView"),
      },
    ],
    [openPanel]
  );
}

function useUndoRedo(): PluginUndoRedo {
  const subscribe = useCallback((listener: () => void) => {
    let unsubscribeHistory: (() => void) | null = null;
    const bind = () => {
      unsubscribeHistory?.();
      unsubscribeHistory = getActiveStore()?.subscribeHistory(listener) ?? null;
      listener();
    };
    const unsubscribeStores = subscribeStores(bind);
    bind();
    return () => {
      unsubscribeStores();
      unsubscribeHistory?.();
    };
  }, []);
  const getKey = useCallback(() => {
    const store = getActiveStore();
    return store ? `${store.canUndo() ? 1 : 0}${store.canRedo() ? 1 : 0}` : "00";
  }, []);
  const key = useSyncExternalStore(subscribe, getKey, getKey);
  return useMemo(
    () => ({
      canUndo: key[0] === "1",
      canRedo: key[1] === "1",
      undo: () => getActiveStore()?.undo(),
      redo: () => getActiveStore()?.redo(),
      saveCheckpoint: () => {},
      clearHistory: () => getActiveStore()?.clearHistory(),
      initHistory: () => {},
    }),
    [key]
  );
}

const PANELS = [
  { id: "kanban-board", title: "Kanban", layout: { width: 960, minWidth: "default" as const } },
  { id: "kanban-tasks", title: "Tasks", layout: { width: 440, minWidth: "default" as const } },
];

const pluginModule: PluginModule = {
  id: "kanban",
  meta: {
    id: "kanban",
    label: "Kanban",
    shortLabel: "KAN",
    color: "#7C6FE0",
    description: "Multiplayer kanban boards with tasks, scheduling and automations.",
    panels: PANELS,
    panelExtensions: [],
  },
  Provider,
  panels: [
    {
      id: "kanban-board",
      title: "Kanban",
      description: "Shared kanban board with columns, cards, swimlanes and automations.",
      icon: createElement(Icon, { name: "LayoutDashboard", size: 16 }),
      component: BoardPanel,
      allowMultiple: true,
      defaultVisible: true,
      layout: PANELS[0].layout,
    } as PluginModule["panels"][number],
    {
      id: "kanban-tasks",
      title: "Tasks",
      description: "Tasks across boards: list, schedule and timeline views with quick add.",
      icon: createElement(Icon, { name: "LayoutList", size: 16 }),
      component: TasksPanel,
      allowMultiple: true,
      layout: PANELS[1].layout,
    } as PluginModule["panels"][number],
  ],
  panelExtensions: [],
  toolbar: { component: () => null },
  settings: {
    declarations: [
      {
        key: "reminders",
        label: "Due reminders",
        description: "Show a toast when a card with a reminder comes due.",
        kind: "toggle",
        default: true,
      },
      {
        key: "weekStartsMonday",
        label: "Week starts on Monday",
        description: "Affects date pickers, quick-add parsing and the Schedule view.",
        kind: "toggle",
        default: true,
      },
      {
        key: "confirmDelete",
        label: "Confirm before deleting",
        description: "Ask before deleting cards from the Tasks panel.",
        kind: "toggle",
        default: true,
      },
    ],
  } as PluginModule["settings"],
  useLoadingState,
  usePersistence,
  useSimulation,
  useInitialization,
  useCommands,
  useUndoRedo,
};

registerPluginModule(pluginModule);

export default pluginModule;
