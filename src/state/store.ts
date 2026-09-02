import * as Y from "yjs";
import { evaluateRules, type AutomationEvent } from "./automations";
import { makeId } from "./ids";
import { needsRebalance, orderAfter, orderAtIndex, orderBefore, orderBetween, sortByOrder, spreadOrders } from "./order";
import { nextStoredOccurrence } from "./recurrence";
import { STARTER_CARDS, getTemplate, type TemplateCard } from "./templates";
import { addDays, deadlineMs, toDayKey } from "./dates";
import {
  DEFAULT_DISPLAY,
  type ActivityEntry,
  type Assignee,
  type AutomationAction,
  type AutomationCondition,
  type AutomationRule,
  type Board,
  type BoardDisplay,
  type Card,
  type CardDraft,
  type CardPatch,
  type ChecklistItem,
  type Column,
  type Comment,
  type CustomFieldDefinition,
  type Label,
  type Priority,
  type Tone,
  type Viewer,
} from "./types";

/** User edits — tracked by the undo manager. */
export const LOCAL_ORIGIN = { plugin: "kanban", kind: "local" };
/** Seeding, migrations, imports of system data — never on the undo stack. */
export const SYSTEM_ORIGIN = { plugin: "kanban", kind: "system" };
/** Timed automations — never on the undo stack. */
export const AUTOMATION_ORIGIN = { plugin: "kanban", kind: "automation" };
/** Live text typing — handled by the textarea's native undo, not Yjs undo. */
export const TEXT_ORIGIN = { plugin: "kanban", kind: "text" };
export const SCHEMA_VERSION = 1;
export const MAX_ACTIVITY_PER_CARD = 50;
export const CARD_SOFT_CAP = 2000;
export const CARD_WARN_AT = 1500;

type YMapAny = Y.Map<unknown>;

export interface Snapshot {
  version: number;
  boards: Record<string, Board>;
  columns: Record<string, Column>;
  cards: Record<string, Card>;
  comments: Record<string, Comment>;
  activity: Record<string, ActivityEntry>;
}

export interface Derived {
  boards: Board[];
  columnsByBoard: Record<string, Column[]>;
  cardsByColumn: Record<string, Card[]>;
  cardsByBoard: Record<string, Card[]>;
  archivedByBoard: Record<string, Card[]>;
  commentsByCard: Record<string, Comment[]>;
  activityByCard: Record<string, ActivityEntry[]>;
  members: Assignee[];
  activeCardCount: number;
}

export interface ExportedBoard {
  format: "kanban-board";
  version: number;
  exportedAt: string;
  board: Omit<Board, "id" | "order">;
  columns: Array<Omit<Column, "boardId">>;
  cards: Array<Omit<Card, "boardId">>;
  comments: Comment[];
}

export interface MirrorPayload {
  format: "kanban-mirror";
  version: number;
  savedAt: string;
  boards: Board[];
  columns: Column[];
  cards: Card[];
  comments: Comment[];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown, fallback: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function arr<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}
function obj<T>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : fallback;
}

const TONES_SET = new Set(["accent", "green", "amber", "red", "blue", "purple", "cyan", "gray"]);
function tone(value: unknown, fallback: Tone = "accent"): Tone {
  return typeof value === "string" && TONES_SET.has(value) ? (value as Tone) : fallback;
}
const PRIORITY_SET = new Set(["none", "low", "medium", "high", "urgent"]);
function priority(value: unknown): Priority {
  return typeof value === "string" && PRIORITY_SET.has(value) ? (value as Priority) : "none";
}

export function normalizeRule(rule: unknown, index: number): AutomationRule | null {
  const r = obj<Partial<AutomationRule>>(rule, {});
  if (!r.trigger || typeof r.trigger !== "object" || typeof r.trigger.type !== "string") return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : `rule_${index}`,
    name: typeof r.name === "string" ? r.name : "Rule",
    enabled: r.enabled !== false,
    trigger: r.trigger,
    conditions: arr<AutomationCondition>(r.conditions).filter((c) => c && typeof c === "object" && typeof c.field === "string"),
    actions: arr<AutomationAction>(r.actions).filter((a) => a && typeof a === "object" && typeof a.type === "string"),
  };
}

function readBoard(id: string, map: YMapAny): Board {
  return {
    id,
    name: str(map.get("name"), "Untitled board"),
    tone: tone(map.get("tone")),
    order: str(map.get("order"), "V"),
    createdAt: str(map.get("createdAt")),
    createdBy: str(map.get("createdBy")),
    labels: arr<Label>(map.get("labels")).filter((l) => l && typeof l === "object" && typeof l.id === "string"),
    fields: arr<CustomFieldDefinition>(map.get("fields")).filter((f) => f && typeof f === "object" && typeof f.id === "string"),
    automations: arr<unknown>(map.get("automations"))
      .map((rule, index) => normalizeRule(rule, index))
      .filter((rule): rule is AutomationRule => rule !== null),
    display: { ...DEFAULT_DISPLAY, ...obj<Partial<BoardDisplay>>(map.get("display"), {}) },
    archived: bool(map.get("archived")),
    cardCounter: num(map.get("cardCounter"), 0) ?? 0,
  };
}

function readColumn(id: string, map: YMapAny): Column {
  return {
    id,
    boardId: str(map.get("boardId")),
    name: str(map.get("name"), "Untitled"),
    order: str(map.get("order"), "V"),
    tone: tone(map.get("tone"), "gray"),
    wipLimit: num(map.get("wipLimit"), null),
    isDone: bool(map.get("isDone")),
  };
}

function readCard(id: string, map: YMapAny): Card {
  const description = map.get("description");
  const fields: Record<string, Card["fields"][string]> = {};
  map.forEach((value, key) => {
    if (key.startsWith("f:")) fields[key.slice(2)] = value as Card["fields"][string];
  });
  return {
    id,
    number: num(map.get("number"), 0) ?? 0,
    boardId: str(map.get("boardId")),
    columnId: str(map.get("columnId")),
    order: str(map.get("order"), "V"),
    title: str(map.get("title"), "Untitled"),
    description: description instanceof Y.Text ? description.toString() : str(description),
    labels: arr<string>(map.get("labels")),
    assignees: arr<Assignee>(map.get("assignees")),
    priority: priority(map.get("priority")),
    dueAt: str(map.get("dueAt")) || null,
    startAt: str(map.get("startAt")) || null,
    estimate: num(map.get("estimate"), null),
    checklist: arr<ChecklistItem>(map.get("checklist")),
    recurrence: obj<Card["recurrence"]>(map.get("recurrence"), null),
    reminderMinutes: num(map.get("reminderMinutes"), null),
    completedAt: str(map.get("completedAt")) || null,
    archived: bool(map.get("archived")),
    cover: map.get("cover") ? tone(map.get("cover")) : null,
    fields,
    createdAt: str(map.get("createdAt")),
    createdBy: str(map.get("createdBy")),
    updatedAt: str(map.get("updatedAt")),
  };
}

function readComment(id: string, map: YMapAny): Comment {
  return {
    id,
    cardId: str(map.get("cardId")),
    body: str(map.get("body")),
    authorId: str(map.get("authorId")) || null,
    authorName: str(map.get("authorName"), "Someone"),
    createdAt: str(map.get("createdAt")),
    editedAt: str(map.get("editedAt")) || null,
  };
}

function readActivity(id: string, value: unknown): ActivityEntry | null {
  const v = obj<Partial<ActivityEntry>>(value, {});
  if (!v.cardId) return null;
  return {
    id,
    cardId: v.cardId,
    boardId: v.boardId ?? "",
    kind: v.kind ?? "note",
    summary: v.summary ?? "",
    actor: v.actor ?? "",
    at: v.at ?? "",
  };
}

type Listener = () => void;

const storePool = new WeakMap<Y.Doc, KanbanStore>();

export class KanbanStore {
  readonly doc: Y.Doc;
  readonly boards: Y.Map<YMapAny>;
  readonly columns: Y.Map<YMapAny>;
  readonly cards: Y.Map<YMapAny>;
  readonly comments: Y.Map<YMapAny>;
  readonly activity: Y.Map<unknown>;
  readonly meta: Y.Map<unknown>;
  readonly undoManager: Y.UndoManager;

  snapshot: Snapshot;
  private derivedCache: { snapshot: Snapshot; derived: Derived } | null = null;
  private listeners = new Set<Listener>();
  private historyListeners = new Set<Listener>();
  private notifyListeners = new Set<(message: string) => void>();
  private pendingNotify: Listener | null = null;
  private refCount = 0;
  private detach: (() => void) | null = null;
  private holders: symbol[] = [];
  private primaryListeners = new Set<Listener>();
  viewer: Viewer = { id: null, name: "Workspace member", avatarUrl: null };

  static forDoc(doc: Y.Doc): KanbanStore {
    let store = storePool.get(doc);
    if (!store) {
      store = new KanbanStore(doc);
      storePool.set(doc, store);
    }
    return store;
  }

  private constructor(doc: Y.Doc) {
    this.doc = doc;
    this.boards = doc.getMap("boards") as Y.Map<YMapAny>;
    this.columns = doc.getMap("columns") as Y.Map<YMapAny>;
    this.cards = doc.getMap("cards") as Y.Map<YMapAny>;
    this.comments = doc.getMap("comments") as Y.Map<YMapAny>;
    this.activity = doc.getMap("activity");
    this.meta = doc.getMap("meta");
    this.undoManager = new Y.UndoManager([this.boards, this.columns, this.cards, this.comments], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 400,
    });
    this.snapshot = this.readAll();
  }

  /**
   * Reference-counted attach: observers live while at least one panel is
   * mounted. The first holder is the "primary" for per-tab side effects
   * (toasts, mirror writes, timers) so several panels never duplicate them.
   */
  retain(): { release: () => void; token: symbol } {
    const token = Symbol("kanban-holder");
    this.refCount += 1;
    this.holders.push(token);
    if (this.refCount === 1) this.attach();
    this.primaryListeners.forEach((listener) => listener());
    let released = false;
    return {
      token,
      release: () => {
        if (released) return;
        released = true;
        this.refCount -= 1;
        this.holders = this.holders.filter((h) => h !== token);
        if (this.refCount === 0) this.detachObservers();
        this.primaryListeners.forEach((listener) => listener());
      },
    };
  }

  isPrimary(token: symbol): boolean {
    return this.holders[0] === token;
  }

  subscribePrimary(listener: Listener): () => void {
    this.primaryListeners.add(listener);
    return () => this.primaryListeners.delete(listener);
  }

  private attach() {
    this.snapshot = this.readAll();
    const onBoards = (events: Y.YEvent<any>[]) => this.applyEvents("boards", events);
    const onColumns = (events: Y.YEvent<any>[]) => this.applyEvents("columns", events);
    const onCards = (events: Y.YEvent<any>[]) => this.applyEvents("cards", events);
    const onComments = (events: Y.YEvent<any>[]) => this.applyEvents("comments", events);
    const onActivity = (events: Y.YEvent<any>[]) => this.applyEvents("activity", events);
    this.boards.observeDeep(onBoards);
    this.columns.observeDeep(onColumns);
    this.cards.observeDeep(onCards);
    this.comments.observeDeep(onComments);
    this.activity.observeDeep(onActivity);
    const onHistory = () => this.historyListeners.forEach((listener) => listener());
    this.undoManager.on("stack-item-added", onHistory);
    this.undoManager.on("stack-item-popped", onHistory);
    this.undoManager.on("stack-cleared", onHistory);
    this.detach = () => {
      this.boards.unobserveDeep(onBoards);
      this.columns.unobserveDeep(onColumns);
      this.cards.unobserveDeep(onCards);
      this.comments.unobserveDeep(onComments);
      this.activity.unobserveDeep(onActivity);
      this.undoManager.off("stack-item-added", onHistory);
      this.undoManager.off("stack-item-popped", onHistory);
      this.undoManager.off("stack-cleared", onHistory);
    };
    this.emit();
  }

  private detachObservers() {
    this.detach?.();
    this.detach = null;
  }

  // ---------------------------------------------------------------------------
  // Snapshot maintenance

  private readAll(): Snapshot {
    const boards: Record<string, Board> = {};
    const columns: Record<string, Column> = {};
    const cards: Record<string, Card> = {};
    const comments: Record<string, Comment> = {};
    const activity: Record<string, ActivityEntry> = {};
    this.boards.forEach((map, id) => {
      if (map instanceof Y.Map) boards[id] = readBoard(id, map);
    });
    this.columns.forEach((map, id) => {
      if (map instanceof Y.Map) columns[id] = readColumn(id, map);
    });
    this.cards.forEach((map, id) => {
      if (map instanceof Y.Map) cards[id] = readCard(id, map);
    });
    this.comments.forEach((map, id) => {
      if (map instanceof Y.Map) comments[id] = readComment(id, map);
    });
    this.activity.forEach((value, id) => {
      const entry = readActivity(id, value);
      if (entry) activity[id] = entry;
    });
    return { version: (this.snapshot?.version ?? 0) + 1, boards, columns, cards, comments, activity };
  }

  private applyEvents(kind: keyof Omit<Snapshot, "version">, events: Y.YEvent<any>[]) {
    const root = this[kind === "activity" ? "activity" : kind] as Y.Map<unknown>;
    const touched = new Set<string>();
    for (const event of events) {
      if (event.target === root) {
        event.changes.keys.forEach((_change, key) => touched.add(key));
      } else if (event.path.length > 0) {
        touched.add(String(event.path[0]));
      }
    }
    if (touched.size === 0) return;
    const next: Record<string, unknown> = { ...(this.snapshot[kind] as Record<string, unknown>) };
    touched.forEach((id) => {
      const value = root.get(id);
      if (value === undefined) {
        delete next[id];
        return;
      }
      switch (kind) {
        case "boards":
          if (value instanceof Y.Map) next[id] = readBoard(id, value);
          break;
        case "columns":
          if (value instanceof Y.Map) next[id] = readColumn(id, value);
          break;
        case "cards":
          if (value instanceof Y.Map) next[id] = readCard(id, value);
          break;
        case "comments":
          if (value instanceof Y.Map) next[id] = readComment(id, value);
          break;
        case "activity": {
          const entry = readActivity(id, value);
          if (entry) next[id] = entry;
          else delete next[id];
          break;
        }
      }
    });
    this.snapshot = { ...this.snapshot, version: this.snapshot.version + 1, [kind]: next } as Snapshot;
    this.emit();
  }

  private emit() {
    // Coalesce multiple root events from one transaction into a single notify.
    if (this.pendingNotify) return;
    this.pendingNotify = () => {
      this.pendingNotify = null;
      this.listeners.forEach((listener) => listener());
    };
    queueMicrotask(this.pendingNotify);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeHistory(listener: Listener): () => void {
    this.historyListeners.add(listener);
    return () => this.historyListeners.delete(listener);
  }

  onNotify(listener: (message: string) => void): () => void {
    this.notifyListeners.add(listener);
    return () => this.notifyListeners.delete(listener);
  }

  private notify(message: string) {
    this.notifyListeners.forEach((listener) => listener(message));
  }

  getSnapshot = (): Snapshot => this.snapshot;

  getDerived(snapshot: Snapshot = this.snapshot): Derived {
    if (this.derivedCache && this.derivedCache.snapshot === snapshot) return this.derivedCache.derived;
    const boards = sortByOrder(Object.values(snapshot.boards));
    const columnsByBoard: Record<string, Column[]> = {};
    for (const column of Object.values(snapshot.columns)) {
      if (!snapshot.boards[column.boardId]) continue;
      (columnsByBoard[column.boardId] ??= []).push(column);
    }
    for (const key of Object.keys(columnsByBoard)) columnsByBoard[key] = sortByOrder(columnsByBoard[key]);
    const cardsByColumn: Record<string, Card[]> = {};
    const cardsByBoard: Record<string, Card[]> = {};
    const archivedByBoard: Record<string, Card[]> = {};
    const memberMap = new Map<string, Assignee>();
    let activeCardCount = 0;
    for (const card of Object.values(snapshot.cards)) {
      if (!snapshot.boards[card.boardId]) continue;
      for (const assignee of card.assignees) if (assignee?.id && !memberMap.has(assignee.id)) memberMap.set(assignee.id, assignee);
      if (card.archived) {
        (archivedByBoard[card.boardId] ??= []).push(card);
        continue;
      }
      activeCardCount += 1;
      (cardsByBoard[card.boardId] ??= []).push(card);
      (cardsByColumn[card.columnId] ??= []).push(card);
    }
    for (const key of Object.keys(cardsByColumn)) cardsByColumn[key] = sortByOrder(cardsByColumn[key]);
    for (const key of Object.keys(cardsByBoard)) cardsByBoard[key] = sortByOrder(cardsByBoard[key]);
    for (const key of Object.keys(archivedByBoard)) archivedByBoard[key].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const commentsByCard: Record<string, Comment[]> = {};
    for (const comment of Object.values(snapshot.comments)) (commentsByCard[comment.cardId] ??= []).push(comment);
    for (const key of Object.keys(commentsByCard)) commentsByCard[key].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const activityByCard: Record<string, ActivityEntry[]> = {};
    for (const entry of Object.values(snapshot.activity)) (activityByCard[entry.cardId] ??= []).push(entry);
    for (const key of Object.keys(activityByCard)) activityByCard[key].sort((a, b) => b.at.localeCompare(a.at));
    const derived: Derived = {
      boards,
      columnsByBoard,
      cardsByColumn,
      cardsByBoard,
      archivedByBoard,
      commentsByCard,
      activityByCard,
      members: Array.from(memberMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      activeCardCount,
    };
    this.derivedCache = { snapshot, derived };
    return derived;
  }

  // ---------------------------------------------------------------------------
  // Helpers

  private now(): string {
    return new Date().toISOString();
  }

  private actorName(): string {
    return this.viewer.name || "Workspace member";
  }

  viewerAsAssignee(): Assignee | null {
    if (!this.viewer.id) return null;
    return { id: this.viewer.id, name: this.viewer.name, avatarUrl: this.viewer.avatarUrl };
  }

  transact(fn: () => void, origin: object = LOCAL_ORIGIN) {
    this.doc.transact(fn, origin);
  }

  isEmpty(): boolean {
    return this.boards.size === 0;
  }

  isSeeded(): boolean {
    return this.meta.get("seededAt") !== undefined;
  }

  markSeeded() {
    this.transact(() => {
      if (this.meta.get("seededAt") === undefined) this.meta.set("seededAt", this.now());
      this.meta.set("schemaVersion", SCHEMA_VERSION);
    }, SYSTEM_ORIGIN);
  }

  getCardText(cardId: string): Y.Text | null {
    const map = this.cards.get(cardId);
    if (!(map instanceof Y.Map)) return null;
    let text = map.get("description");
    if (!(text instanceof Y.Text)) {
      const initial = typeof text === "string" ? text : "";
      const created = new Y.Text();
      this.transact(() => {
        map.set("description", created);
        if (initial) created.insert(0, initial);
      }, SYSTEM_ORIGIN);
      text = created;
    }
    return text as Y.Text;
  }

  private logActivity(cardId: string, boardId: string, kind: string, summary: string) {
    const id = makeId("act");
    this.activity.set(id, { cardId, boardId, kind, summary, actor: this.actorName(), at: this.now() });
    // Trim old entries for this card using the derived index (snapshot may lag by this transaction; harmless).
    const existing = this.getDerived().activityByCard[cardId] ?? [];
    if (existing.length >= MAX_ACTIVITY_PER_CARD) {
      existing
        .slice()
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(0, existing.length - MAX_ACTIVITY_PER_CARD + 1)
        .forEach((entry) => this.activity.delete(entry.id));
    }
  }

  // ---------------------------------------------------------------------------
  // Boards

  /**
   * Create a board from a template. `deterministicKey` derives every id from a
   * fixed key so two clients seeding the same default board concurrently
   * converge on one board instead of two.
   */
  createBoard(input: { name: string; tone?: Tone; templateId?: string; withStarterCards?: boolean; deterministicKey?: string }): string {
    const template = getTemplate(input.templateId ?? "basic");
    const key = input.deterministicKey;
    const id = (prefix: string, index?: number) => (key ? `${prefix}_${key}${index === undefined ? "" : `_${index}`}` : makeId(prefix));
    const boardId = id("board");
    const derived = this.getDerived();
    const last = derived.boards.length ? derived.boards[derived.boards.length - 1].order : null;
    const createdAt = this.now();
    // Deterministic (seed) boards are system data and stay off the undo stack.
    this.transact(() => {
      const labels: Label[] = template.labels.map((label, index) => ({ id: id("lbl", index), name: label.name, tone: label.tone }));
      const board = new Y.Map<unknown>();
      board.set("name", input.name.trim() || template.name);
      board.set("tone", input.tone ?? template.tone);
      board.set("order", orderAfter(last));
      board.set("createdAt", createdAt);
      board.set("createdBy", this.actorName());
      board.set("labels", labels);
      board.set("fields", []);
      board.set("display", { ...DEFAULT_DISPLAY });
      board.set("archived", false);
      board.set("cardCounter", 0);
      this.boards.set(boardId, board);

      const columnIds = spreadOrders(template.columns.length).map((order, index) => {
        const column = template.columns[index];
        const columnId = id("col", index);
        const map = new Y.Map<unknown>();
        map.set("boardId", boardId);
        map.set("name", column.name);
        map.set("order", order);
        map.set("tone", column.tone);
        map.set("wipLimit", column.wipLimit ?? null);
        map.set("isDone", Boolean(column.isDone));
        this.columns.set(columnId, map);
        return columnId;
      });

      const automations: AutomationRule[] = template.automations.map((rule, index) => ({
        id: id("rule", index),
        name: rule.name,
        enabled: rule.enabled,
        trigger: {
          type: rule.trigger.type,
          columnId: rule.trigger.columnIndex !== undefined ? columnIds[rule.trigger.columnIndex] : undefined,
          field: rule.trigger.field,
          value: rule.trigger.value,
        },
        conditions: rule.conditions,
        actions: rule.actions.map((action) => ({
          type: action.type,
          field: action.field,
          value: action.value,
          columnId: action.columnIndex !== undefined ? columnIds[action.columnIndex] : action.columnId,
          labelId: action.labelName ? labels.find((l) => l.name === action.labelName)?.id : action.labelId,
          relative: action.relative,
          message: action.message,
        })),
      }));
      board.set("automations", automations);

      if (input.withStarterCards) {
        this.seedCards(boardId, columnIds, labels, STARTER_CARDS, board, key);
      } else if (template.cards) {
        this.seedCards(boardId, columnIds, labels, template.cards, board, key);
      }
    }, key ? SYSTEM_ORIGIN : LOCAL_ORIGIN);
    return boardId;
  }

  private seedCards(boardId: string, columnIds: string[], labels: Label[], cards: TemplateCard[], board: Y.Map<unknown>, key?: string) {
    const orders = spreadOrders(cards.length);
    cards.forEach((card, index) => {
      const columnId = columnIds[Math.min(card.column, columnIds.length - 1)];
      const id = key ? `card_${key}_${index}` : makeId("card");
      const map = new Y.Map<unknown>();
      const counter = (num(board.get("cardCounter"), 0) ?? 0) + 1;
      board.set("cardCounter", counter);
      const text = new Y.Text();
      map.set("number", counter);
      map.set("boardId", boardId);
      map.set("columnId", columnId);
      map.set("order", orders[index]);
      map.set("title", card.title);
      map.set("description", text);
      map.set("labels", (card.labels ?? []).map((name) => labels.find((l) => l.name === name)?.id).filter(Boolean));
      map.set("assignees", []);
      map.set("priority", card.priority ?? "none");
      map.set("dueAt", card.dueInDays !== undefined ? toDayKey(addDays(new Date(), card.dueInDays)) : null);
      map.set("startAt", null);
      map.set("estimate", null);
      map.set("checklist", (card.checklist ?? []).map((textItem) => ({ id: makeId("chk"), text: textItem, done: false })));
      map.set("recurrence", null);
      map.set("reminderMinutes", null);
      map.set("completedAt", null);
      map.set("archived", false);
      map.set("cover", null);
      map.set("createdAt", this.now());
      map.set("createdBy", this.actorName());
      map.set("updatedAt", this.now());
      this.cards.set(id, map);
      if (card.description) text.insert(0, card.description);
    });
  }

  updateBoard(boardId: string, patch: Partial<Omit<Board, "id" | "createdAt" | "createdBy" | "cardCounter">>) {
    const board = this.boards.get(boardId);
    if (!(board instanceof Y.Map)) return;
    this.transact(() => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (key === "display") board.set("display", { ...DEFAULT_DISPLAY, ...obj<Partial<BoardDisplay>>(board.get("display"), {}), ...(value as Partial<BoardDisplay>) });
        else board.set(key, value);
      }
    });
  }

  deleteBoard(boardId: string) {
    this.transact(() => {
      const cardIds: string[] = [];
      this.cards.forEach((map, id) => {
        if (map instanceof Y.Map && map.get("boardId") === boardId) cardIds.push(id);
      });
      cardIds.forEach((id) => this.deleteCardInternal(id));
      const columnIds: string[] = [];
      this.columns.forEach((map, id) => {
        if (map instanceof Y.Map && map.get("boardId") === boardId) columnIds.push(id);
      });
      columnIds.forEach((id) => this.columns.delete(id));
      this.boards.delete(boardId);
    });
  }

  moveBoard(boardId: string, toIndex: number) {
    const boards = this.getDerived().boards.filter((b) => b.id !== boardId);
    this.updateBoard(boardId, { order: orderAtIndex(boards, toIndex) });
  }

  // ---------------------------------------------------------------------------
  // Columns

  createColumn(boardId: string, name: string, options: { tone?: Tone; wipLimit?: number | null; isDone?: boolean; index?: number } = {}): string {
    const columns = this.getDerived().columnsByBoard[boardId] ?? [];
    const order = options.index === undefined ? orderAfter(columns.length ? columns[columns.length - 1].order : null) : orderAtIndex(columns, options.index);
    const columnId = makeId("col");
    this.transact(() => {
      const map = new Y.Map<unknown>();
      map.set("boardId", boardId);
      map.set("name", name.trim() || "Untitled");
      map.set("order", order);
      map.set("tone", options.tone ?? "gray");
      map.set("wipLimit", options.wipLimit ?? null);
      map.set("isDone", Boolean(options.isDone));
      this.columns.set(columnId, map);
    });
    return columnId;
  }

  updateColumn(columnId: string, patch: Partial<Omit<Column, "id" | "boardId">>) {
    const column = this.columns.get(columnId);
    if (!(column instanceof Y.Map)) return;
    this.transact(() => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        column.set(key, value);
      }
    });
  }

  /** Only one done column per board; setting one clears the others. */
  setDoneColumn(boardId: string, columnId: string | null) {
    this.transact(() => {
      this.columns.forEach((map, id) => {
        if (map instanceof Y.Map && map.get("boardId") === boardId) map.set("isDone", id === columnId);
      });
    });
  }

  deleteColumn(columnId: string, moveCardsTo: string | null) {
    const snapshot = this.snapshot;
    const column = snapshot.columns[columnId];
    if (!column) return;
    const cards = this.getDerived().cardsByColumn[columnId] ?? [];
    this.transact(() => {
      if (moveCardsTo && snapshot.columns[moveCardsTo]) {
        const target = this.getDerived().cardsByColumn[moveCardsTo] ?? [];
        let last = target.length ? target[target.length - 1].order : null;
        for (const card of cards) {
          const map = this.cards.get(card.id);
          if (!(map instanceof Y.Map)) continue;
          const order = orderAfter(last);
          last = order;
          map.set("columnId", moveCardsTo);
          map.set("order", order);
          map.set("updatedAt", this.now());
        }
      } else {
        cards.forEach((card) => this.deleteCardInternal(card.id));
      }
      this.columns.delete(columnId);
    });
  }

  moveColumn(columnId: string, toIndex: number) {
    const column = this.snapshot.columns[columnId];
    if (!column) return;
    const others = (this.getDerived().columnsByBoard[column.boardId] ?? []).filter((c) => c.id !== columnId);
    this.updateColumn(columnId, { order: orderAtIndex(others, toIndex) });
  }

  // ---------------------------------------------------------------------------
  // Cards

  createCard(draft: CardDraft): string | null {
    const board = this.boards.get(draft.boardId);
    if (!(board instanceof Y.Map)) return null;
    if (!this.snapshot.columns[draft.columnId]) return null;
    const siblings = this.getDerived().cardsByColumn[draft.columnId] ?? [];
    const order =
      draft.position === "top" ? orderBefore(siblings.length ? siblings[0].order : null) : orderAfter(siblings.length ? siblings[siblings.length - 1].order : null);
    const id = makeId("card");
    const now = this.now();
    this.transact(() => {
      const counter = (num(board.get("cardCounter"), 0) ?? 0) + 1;
      board.set("cardCounter", counter);
      const map = new Y.Map<unknown>();
      const text = new Y.Text();
      map.set("number", counter);
      map.set("boardId", draft.boardId);
      map.set("columnId", draft.columnId);
      map.set("order", order);
      map.set("title", draft.title.trim() || "Untitled");
      map.set("description", text);
      map.set("labels", draft.labels ?? []);
      map.set("assignees", draft.assignees ?? []);
      map.set("priority", draft.priority ?? "none");
      map.set("dueAt", draft.dueAt ?? null);
      map.set("startAt", draft.startAt ?? null);
      map.set("estimate", draft.estimate ?? null);
      map.set("checklist", draft.checklist ?? []);
      map.set("recurrence", draft.recurrence ?? null);
      map.set("reminderMinutes", draft.reminderMinutes ?? null);
      map.set("completedAt", null);
      map.set("archived", false);
      map.set("cover", draft.cover ?? null);
      map.set("createdAt", now);
      map.set("createdBy", this.actorName());
      map.set("updatedAt", now);
      for (const [fieldId, value] of Object.entries(draft.fields ?? {})) map.set(`f:${fieldId}`, value);
      this.cards.set(id, map);
      if (draft.description) text.insert(0, draft.description);
      this.logActivity(id, draft.boardId, "created", "created this card");
      this.runRules({ type: "card-created", card: readCard(id, map), now: new Date() }, map);
    });
    return id;
  }

  /** Apply a patch; handles done-column semantics, recurrence and automations. */
  updateCard(cardId: string, patch: CardPatch, options: { silent?: boolean; origin?: object } = {}) {
    const map = this.cards.get(cardId);
    if (!(map instanceof Y.Map)) return;
    const previous = readCard(cardId, map);
    this.transact(() => {
      this.applyPatch(map, patch);
      const now = new Date();
      const nowIso = now.toISOString();
      const current = readCard(cardId, map);
      const changed = Object.keys(patch).filter(
        (key) => JSON.stringify((previous as unknown as Record<string, unknown>)[key]) !== JSON.stringify((current as unknown as Record<string, unknown>)[key])
      );
      if (changed.length === 0) return;
      map.set("updatedAt", nowIso);

      // Done-column semantics: moving into the done column completes, moving out reopens.
      if (changed.includes("columnId")) {
        const target = this.snapshot.columns[current.columnId];
        const source = this.snapshot.columns[previous.columnId];
        if (target?.isDone && !current.completedAt) map.set("completedAt", nowIso);
        else if (source?.isDone && !target?.isDone && current.completedAt && !changed.includes("completedAt")) map.set("completedAt", null);
        if (!options.silent) this.logActivity(cardId, current.boardId, "moved", `moved this card to ${target?.name ?? "another column"}`);
      }
      // Explicit completion toggles move the card into / out of the done column.
      if (changed.includes("completedAt") && !changed.includes("columnId")) {
        const columns = this.getDerived().columnsByBoard[current.boardId] ?? [];
        if (current.completedAt) {
          const done = columns.find((c) => c.isDone);
          if (done && current.columnId !== done.id) {
            const targetCards = this.getDerived().cardsByColumn[done.id] ?? [];
            map.set("columnId", done.id);
            map.set("order", orderBefore(targetCards.length ? targetCards[0].order : null));
          }
        } else if (this.snapshot.columns[current.columnId]?.isDone) {
          const first = columns.find((c) => !c.isDone);
          if (first) {
            const targetCards = this.getDerived().cardsByColumn[first.id] ?? [];
            map.set("columnId", first.id);
            map.set("order", orderAfter(targetCards.length ? targetCards[targetCards.length - 1].order : null));
          }
        }
      }
      if (!options.silent) {
        for (const key of changed) {
          if (key === "columnId" || key === "completedAt" || key === "order" || key === "updatedAt") continue;
          this.logActivity(cardId, current.boardId, "changed", describeChange(key, previous, readCard(cardId, map)));
        }
      }

      // Automations: moved, then field-changed per field, then checklist.
      const latest = readCard(cardId, map);
      if (changed.includes("columnId")) {
        this.runRules({ type: "card-moved", card: latest, previous, now }, map);
      }
      for (const key of changed) {
        if (key === "columnId" || key === "order") continue;
        if (key === "fields") {
          const ids = new Set([...Object.keys(previous.fields), ...Object.keys(latest.fields)]);
          for (const fieldId of ids) {
            if (JSON.stringify(previous.fields[fieldId] ?? null) === JSON.stringify(latest.fields[fieldId] ?? null)) continue;
            this.runRules({ type: "field-changed", card: readCard(cardId, map), previous, changedField: `f:${fieldId}`, now }, map);
          }
          continue;
        }
        this.runRules({ type: "field-changed", card: readCard(cardId, map), previous, changedField: key, now }, map);
      }
      if (changed.includes("checklist")) {
        const list = latest.checklist;
        const prevList = previous.checklist;
        const allDone = list.length > 0 && list.every((item) => item.done);
        const wasAllDone = prevList.length > 0 && prevList.every((item) => item.done);
        if (allDone && !wasAllDone) this.runRules({ type: "checklist-complete", card: readCard(cardId, map), previous, now }, map);
      }

      // Completion transitions are derived from state (not patch keys) so drags,
      // toggles and automations all behave the same way.
      this.finalizeCompletion(cardId, map, previous, now, options.silent);
    }, options.origin ?? LOCAL_ORIGIN);
  }

  /** Log completion/reopen and spawn the next recurrence when a card became complete in this transaction. */
  private finalizeCompletion(cardId: string, map: YMapAny, previous: Card, now: Date, silent?: boolean) {
    const after = readCard(cardId, map);
    const becameComplete = !previous.completedAt && Boolean(after.completedAt);
    const becameOpen = Boolean(previous.completedAt) && !after.completedAt;
    if (becameComplete) {
      if (!silent) this.logActivity(cardId, after.boardId, "completed", "completed this card");
      this.spawnNextOccurrence(cardId, map, now);
    } else if (becameOpen && !silent) {
      this.logActivity(cardId, after.boardId, "reopened", "reopened this card");
    }
  }

  /**
   * Move a card next to visible neighbours. `beforeId`/`afterId` are the cards
   * adjacent to the drop position in the list the user saw (which may be
   * filtered or a swimlane); the order key is resolved against the full column.
   */
  moveCardBetween(cardId: string, toColumnId: string, beforeId: string | null, afterId: string | null) {
    const card = this.snapshot.cards[cardId];
    if (!card || !this.snapshot.columns[toColumnId]) return;
    const full = (this.getDerived().cardsByColumn[toColumnId] ?? []).filter((c) => c.id !== cardId);
    let before = beforeId ? full.find((c) => c.id === beforeId) ?? null : null;
    let after = afterId ? full.find((c) => c.id === afterId) ?? null : null;
    if (before) {
      // Insert directly after the visible predecessor.
      after = full[full.indexOf(before) + 1] ?? null;
    } else if (after) {
      before = full[full.indexOf(after) - 1] ?? null;
    } else if (full.length > 0 && (beforeId !== null || afterId !== null)) {
      // Neighbours vanished (concurrent edit): append.
      before = full[full.length - 1];
      after = null;
    } else if (full.length > 0) {
      // Empty visible list in a non-empty column: append at the end.
      before = full[full.length - 1];
    }
    let order: string;
    try {
      order = orderBetween(before?.order ?? null, after?.order ?? null);
    } catch {
      order = orderAfter(before?.order ?? null);
    }
    this.updateCard(cardId, { columnId: toColumnId, order });
    if (needsRebalance([...full.map((c) => c.order), order])) this.rebalanceColumn(toColumnId);
  }

  private applyPatch(map: YMapAny, patch: CardPatch) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (key === "fields") {
        const fields = value as Card["fields"];
        // Remove fields absent from the patch value only when explicitly null.
        for (const [fieldId, fieldValue] of Object.entries(fields)) {
          if (fieldValue === null || fieldValue === undefined) map.delete(`f:${fieldId}`);
          else map.set(`f:${fieldId}`, fieldValue);
        }
        continue;
      }
      map.set(key, value);
    }
  }

  private runRules(event: AutomationEvent, map: YMapAny) {
    const board = this.snapshot.boards[event.card.boardId];
    if (!board || board.automations.length === 0) return;
    const outcome = evaluateRules(board.automations, event, {
      board,
      columns: this.getDerived().columnsByBoard[board.id] ?? [],
      viewer: this.viewerAsAssignee(),
    });
    if (Object.keys(outcome.patch).length > 0) {
      const before = readCard(event.card.id, map);
      this.applyPatch(map, outcome.patch);
      if (outcome.patch.columnId && outcome.patch.columnId !== before.columnId) {
        const targetCards = (this.getDerived().cardsByColumn[outcome.patch.columnId] ?? []).filter((c) => c.id !== event.card.id);
        map.set("order", orderAfter(targetCards.length ? targetCards[targetCards.length - 1].order : null));
        const target = this.snapshot.columns[outcome.patch.columnId];
        if (target?.isDone && !map.get("completedAt")) map.set("completedAt", event.now.toISOString());
      }
      const names = outcome.matchedRuleIds.map((id) => board.automations.find((r) => r.id === id)?.name).filter(Boolean);
      this.logActivity(event.card.id, board.id, "automation", `automation ran: ${names.join(", ")}`);
    }
    outcome.notifications.forEach((message) => this.notify(message));
    return outcome.matchedRuleIds.length > 0;
  }

  private spawnNextOccurrence(cardId: string, map: YMapAny, now: Date) {
    const card = readCard(cardId, map);
    if (!card.recurrence) return;
    const nextDue = nextStoredOccurrence(card.recurrence, card.dueAt, now);
    if (!nextDue) {
      map.set("recurrence", null);
      return;
    }
    let nextStart: string | null = null;
    if (card.startAt && card.dueAt) {
      const startMs = deadlineMs(card.startAt);
      const dueMs = deadlineMs(card.dueAt);
      const nextDueMs = deadlineMs(nextDue);
      if (startMs !== null && dueMs !== null && nextDueMs !== null) {
        nextStart = nextStoredOccurrence(card.recurrence, card.startAt, now);
      }
    }
    const columns = this.getDerived().columnsByBoard[card.boardId] ?? [];
    const first = columns.find((c) => !c.isDone) ?? columns[0];
    if (!first) return;
    const siblings = this.getDerived().cardsByColumn[first.id] ?? [];
    const board = this.boards.get(card.boardId);
    if (!(board instanceof Y.Map)) return;
    const counter = (num(board.get("cardCounter"), 0) ?? 0) + 1;
    board.set("cardCounter", counter);
    const id = makeId("card");
    const next = new Y.Map<unknown>();
    const text = new Y.Text();
    next.set("number", counter);
    next.set("boardId", card.boardId);
    next.set("columnId", first.id);
    next.set("order", orderAfter(siblings.length ? siblings[siblings.length - 1].order : null));
    next.set("title", card.title);
    next.set("description", text);
    next.set("labels", card.labels);
    next.set("assignees", card.assignees);
    next.set("priority", card.priority);
    next.set("dueAt", nextDue);
    next.set("startAt", nextStart);
    next.set("estimate", card.estimate);
    next.set("checklist", card.checklist.map((item) => ({ ...item, id: makeId("chk"), done: false })));
    next.set("recurrence", card.recurrence);
    next.set("reminderMinutes", card.reminderMinutes);
    next.set("completedAt", null);
    next.set("archived", false);
    next.set("cover", card.cover);
    next.set("createdAt", now.toISOString());
    next.set("createdBy", this.actorName());
    next.set("updatedAt", now.toISOString());
    for (const [fieldId, value] of Object.entries(card.fields)) next.set(`f:${fieldId}`, value);
    this.cards.set(id, next);
    if (card.description) text.insert(0, card.description);
    map.set("recurrence", null);
    this.logActivity(id, card.boardId, "created", "created from a recurring card");
  }

  /**
   * Move a card to `toColumnId` at `toIndex`, where `toIndex` is the index in
   * the destination list *excluding* the moving card (post-removal semantics).
   */
  moveCard(cardId: string, toColumnId: string, toIndex: number) {
    const card = this.snapshot.cards[cardId];
    if (!card || !this.snapshot.columns[toColumnId]) return;
    const target = (this.getDerived().cardsByColumn[toColumnId] ?? []).filter((c) => c.id !== cardId);
    const order = orderAtIndex(target, toIndex);
    this.updateCard(cardId, { columnId: toColumnId, order });
    if (needsRebalance([...target.map((c) => c.order), order])) this.rebalanceColumn(toColumnId);
  }

  rebalanceColumn(columnId: string) {
    const cards = this.getDerived().cardsByColumn[columnId] ?? [];
    const orders = spreadOrders(cards.length);
    this.transact(() => {
      cards.forEach((card, index) => {
        const map = this.cards.get(card.id);
        if (map instanceof Y.Map) map.set("order", orders[index]);
      });
    });
  }

  toggleComplete(cardId: string) {
    const card = this.snapshot.cards[cardId];
    if (!card) return;
    this.updateCard(cardId, { completedAt: card.completedAt ? null : this.now() });
  }

  setArchived(cardId: string, archived: boolean) {
    const card = this.snapshot.cards[cardId];
    if (!card) return;
    this.transact(() => {
      const map = this.cards.get(cardId);
      if (!(map instanceof Y.Map)) return;
      map.set("archived", archived);
      map.set("updatedAt", this.now());
      this.logActivity(cardId, card.boardId, archived ? "archived" : "restored", archived ? "archived this card" : "restored this card");
    });
  }

  /** Returns a serializable record so callers can offer Undo via `restoreCard`. */
  deleteCard(cardId: string): { card: Card; comments: Comment[] } | null {
    const card = this.snapshot.cards[cardId];
    if (!card) return null;
    const comments = this.getDerived().commentsByCard[cardId] ?? [];
    this.transact(() => this.deleteCardInternal(cardId));
    return { card, comments };
  }

  private deleteCardInternal(cardId: string) {
    this.cards.delete(cardId);
    const derived = this.getDerived();
    (derived.commentsByCard[cardId] ?? []).forEach((comment) => this.comments.delete(comment.id));
    (derived.activityByCard[cardId] ?? []).forEach((entry) => this.activity.delete(entry.id));
  }

  restoreCard(record: { card: Card; comments: Comment[] }) {
    const { card, comments } = record;
    if (!this.snapshot.boards[card.boardId]) return;
    const columnId = this.snapshot.columns[card.columnId] ? card.columnId : (this.getDerived().columnsByBoard[card.boardId] ?? [])[0]?.id;
    if (!columnId) return;
    this.transact(() => {
      this.writeCardFromJson({ ...card, columnId });
      comments.forEach((comment) => this.writeCommentFromJson(comment));
      this.logActivity(card.id, card.boardId, "restored", "restored this card");
    });
  }

  private writeCardFromJson(card: Card) {
    const map = new Y.Map<unknown>();
    const text = new Y.Text();
    map.set("number", card.number);
    map.set("boardId", card.boardId);
    map.set("columnId", card.columnId);
    map.set("order", card.order);
    map.set("title", card.title);
    map.set("description", text);
    map.set("labels", card.labels);
    map.set("assignees", card.assignees);
    map.set("priority", card.priority);
    map.set("dueAt", card.dueAt);
    map.set("startAt", card.startAt);
    map.set("estimate", card.estimate);
    map.set("checklist", card.checklist);
    map.set("recurrence", card.recurrence);
    map.set("reminderMinutes", card.reminderMinutes);
    map.set("completedAt", card.completedAt);
    map.set("archived", card.archived);
    map.set("cover", card.cover);
    map.set("createdAt", card.createdAt);
    map.set("createdBy", card.createdBy);
    map.set("updatedAt", card.updatedAt);
    for (const [fieldId, value] of Object.entries(card.fields ?? {})) map.set(`f:${fieldId}`, value);
    this.cards.set(card.id, map);
    if (card.description) text.insert(0, card.description);
  }

  private writeCommentFromJson(comment: Comment) {
    const map = new Y.Map<unknown>();
    map.set("cardId", comment.cardId);
    map.set("body", comment.body);
    map.set("authorId", comment.authorId);
    map.set("authorName", comment.authorName);
    map.set("createdAt", comment.createdAt);
    map.set("editedAt", comment.editedAt);
    this.comments.set(comment.id, map);
  }

  duplicateCard(cardId: string): string | null {
    const card = this.snapshot.cards[cardId];
    if (!card) return null;
    return this.createCard({
      boardId: card.boardId,
      columnId: card.columnId,
      title: `${card.title} (copy)`,
      description: card.description,
      labels: card.labels,
      assignees: card.assignees,
      priority: card.priority,
      dueAt: card.dueAt,
      startAt: card.startAt,
      estimate: card.estimate,
      checklist: card.checklist.map((item) => ({ ...item, id: makeId("chk"), done: false })),
      recurrence: card.recurrence,
      reminderMinutes: card.reminderMinutes,
      cover: card.cover,
      fields: card.fields,
    });
  }

  moveCardToBoard(cardId: string, boardId: string, columnId: string) {
    const card = this.snapshot.cards[cardId];
    const target = this.snapshot.columns[columnId];
    if (!card || !target || target.boardId !== boardId) return;
    const board = this.boards.get(boardId);
    if (!(board instanceof Y.Map)) return;
    const siblings = this.getDerived().cardsByColumn[columnId] ?? [];
    this.transact(() => {
      const map = this.cards.get(cardId);
      if (!(map instanceof Y.Map)) return;
      const counter = (num(board.get("cardCounter"), 0) ?? 0) + 1;
      board.set("cardCounter", counter);
      map.set("number", counter);
      map.set("boardId", boardId);
      map.set("columnId", columnId);
      map.set("order", orderAfter(siblings.length ? siblings[siblings.length - 1].order : null));
      // Labels and custom fields belong to the source board; drop them.
      map.set("labels", []);
      const keys: string[] = [];
      map.forEach((_v, key) => {
        if (key.startsWith("f:")) keys.push(key);
      });
      keys.forEach((key) => map.delete(key));
      map.set("updatedAt", this.now());
      this.logActivity(cardId, boardId, "moved", `moved this card to board ${this.snapshot.boards[boardId]?.name ?? ""}`.trim());
    });
  }

  // Checklist helpers ---------------------------------------------------------

  addChecklistItem(cardId: string, text: string) {
    const card = this.snapshot.cards[cardId];
    if (!card || !text.trim()) return;
    this.updateCard(cardId, { checklist: [...card.checklist, { id: makeId("chk"), text: text.trim(), done: false }] }, { silent: true });
  }

  updateChecklistItem(cardId: string, itemId: string, patch: Partial<ChecklistItem>) {
    const card = this.snapshot.cards[cardId];
    if (!card) return;
    this.updateCard(cardId, { checklist: card.checklist.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }, { silent: true });
  }

  removeChecklistItem(cardId: string, itemId: string) {
    const card = this.snapshot.cards[cardId];
    if (!card) return;
    this.updateCard(cardId, { checklist: card.checklist.filter((item) => item.id !== itemId) }, { silent: true });
  }

  // Comments ------------------------------------------------------------------

  addComment(cardId: string, body: string): string | null {
    const card = this.snapshot.cards[cardId];
    if (!card || !body.trim()) return null;
    const id = makeId("cmt");
    this.transact(() => {
      this.writeCommentFromJson({
        id,
        cardId,
        body: body.trim(),
        authorId: this.viewer.id,
        authorName: this.actorName(),
        createdAt: this.now(),
        editedAt: null,
      });
      this.logActivity(cardId, card.boardId, "commented", "commented");
    });
    return id;
  }

  updateComment(commentId: string, body: string) {
    const map = this.comments.get(commentId);
    if (!(map instanceof Y.Map)) return;
    this.transact(() => {
      map.set("body", body.trim());
      map.set("editedAt", this.now());
    });
  }

  deleteComment(commentId: string) {
    this.transact(() => this.comments.delete(commentId));
  }

  // Labels / fields on a board -----------------------------------------------

  addLabel(boardId: string, name: string, toneValue: Tone = "blue"): Label | null {
    const board = this.snapshot.boards[boardId];
    if (!board || !name.trim()) return null;
    const existing = board.labels.find((l) => l.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    const label: Label = { id: makeId("lbl"), name: name.trim(), tone: toneValue };
    this.updateBoard(boardId, { labels: [...board.labels, label] });
    return label;
  }

  updateLabel(boardId: string, labelId: string, patch: Partial<Label>) {
    const board = this.snapshot.boards[boardId];
    if (!board) return;
    this.updateBoard(boardId, { labels: board.labels.map((l) => (l.id === labelId ? { ...l, ...patch, id: l.id } : l)) });
  }

  deleteLabel(boardId: string, labelId: string) {
    const board = this.snapshot.boards[boardId];
    if (!board) return;
    this.transact(() => {
      const map = this.boards.get(boardId);
      if (map instanceof Y.Map) map.set("labels", board.labels.filter((l) => l.id !== labelId));
      this.cards.forEach((card) => {
        if (!(card instanceof Y.Map) || card.get("boardId") !== boardId) return;
        const labels = arr<string>(card.get("labels"));
        if (labels.includes(labelId)) card.set("labels", labels.filter((id) => id !== labelId));
      });
    });
  }

  addField(boardId: string, field: Omit<CustomFieldDefinition, "id">): CustomFieldDefinition | null {
    const board = this.snapshot.boards[boardId];
    if (!board || !field.name.trim()) return null;
    const created: CustomFieldDefinition = { ...field, id: makeId("fld"), name: field.name.trim() };
    this.updateBoard(boardId, { fields: [...board.fields, created] });
    return created;
  }

  updateField(boardId: string, fieldId: string, patch: Partial<CustomFieldDefinition>) {
    const board = this.snapshot.boards[boardId];
    if (!board) return;
    this.updateBoard(boardId, { fields: board.fields.map((f) => (f.id === fieldId ? { ...f, ...patch, id: f.id } : f)) });
  }

  deleteField(boardId: string, fieldId: string) {
    const board = this.snapshot.boards[boardId];
    if (!board) return;
    this.transact(() => {
      const map = this.boards.get(boardId);
      if (map instanceof Y.Map) map.set("fields", board.fields.filter((f) => f.id !== fieldId));
      this.cards.forEach((card) => {
        if (card instanceof Y.Map && card.get("boardId") === boardId) card.delete(`f:${fieldId}`);
      });
    });
  }

  setAutomations(boardId: string, rules: AutomationRule[]) {
    this.updateBoard(boardId, { automations: rules });
  }

  // ---------------------------------------------------------------------------
  // Timed automations (idempotent compare-and-set; safe to run on every client)

  /**
   * Timed rules. Callers run this from one elected client; the per-card stamp
   * makes a rare double run converge (both write the same stamp and the same
   * idempotent actions). Runs under AUTOMATION_ORIGIN so it never hits undo.
   */
  runTimedAutomations(now = new Date()) {
    const derived = this.getDerived();
    for (const board of derived.boards) {
      const timed = board.automations.filter((rule) => rule.enabled && (rule.trigger.type === "due-passed" || rule.trigger.type === "start-reached"));
      if (timed.length === 0) continue;
      const cards = derived.cardsByBoard[board.id] ?? [];
      for (const card of cards) {
        const map = this.cards.get(card.id);
        if (!(map instanceof Y.Map)) continue;
        for (const rule of timed) {
          const stampKey = `auto:${rule.id}`;
          const anchor = rule.trigger.type === "due-passed" ? card.dueAt : card.startAt;
          if (!anchor) continue;
          const ms = deadlineMs(anchor);
          if (ms === null || ms > now.getTime()) continue;
          if (map.get(stampKey) === anchor) continue;
          const previous = readCard(card.id, map);
          this.transact(() => {
            // Re-check inside the transaction; a concurrent stamp may have landed.
            if (map.get(stampKey) === anchor) return;
            map.set(stampKey, anchor);
            const matched = this.runRules({ type: rule.trigger.type, card: readCard(card.id, map), now }, map);
            if (matched) {
              map.set("updatedAt", now.toISOString());
              this.finalizeCompletion(card.id, map, previous, now, false);
            }
          }, AUTOMATION_ORIGIN);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Undo / redo

  undo() {
    this.undoManager.undo();
  }
  redo() {
    this.undoManager.redo();
  }
  canUndo(): boolean {
    return this.undoManager.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.undoManager.redoStack.length > 0;
  }
  clearHistory() {
    this.undoManager.clear();
  }

  // ---------------------------------------------------------------------------
  // Import / export / mirror

  exportBoard(boardId: string): ExportedBoard | null {
    const board = this.snapshot.boards[boardId];
    if (!board) return null;
    const derived = this.getDerived();
    const cards = [...(derived.cardsByBoard[boardId] ?? []), ...(derived.archivedByBoard[boardId] ?? [])];
    const cardIds = new Set(cards.map((c) => c.id));
    const { id: _id, order: _order, ...boardRest } = board;
    return {
      format: "kanban-board",
      version: SCHEMA_VERSION,
      exportedAt: this.now(),
      board: boardRest,
      columns: (derived.columnsByBoard[boardId] ?? []).map(({ boardId: _b, ...rest }) => rest),
      cards: cards.map(({ boardId: _b, ...rest }) => rest),
      comments: Object.values(this.snapshot.comments).filter((c) => cardIds.has(c.cardId)),
    };
  }

  importBoard(payload: ExportedBoard, nameOverride?: string): string | null {
    if (!payload || payload.format !== "kanban-board") return null;
    if (!payload.board || typeof payload.board !== "object" || !Array.isArray(payload.columns) || !Array.isArray(payload.cards)) return null;
    if (payload.columns.length === 0) return null;
    payload = {
      ...payload,
      comments: Array.isArray(payload.comments) ? payload.comments : [],
      board: {
        ...payload.board,
        labels: arr(payload.board.labels),
        fields: arr(payload.board.fields),
        automations: arr<unknown>(payload.board.automations)
          .map((rule, index) => normalizeRule(rule, index))
          .filter((rule): rule is AutomationRule => rule !== null),
      },
      cards: payload.cards.filter((card) => card && typeof card === "object" && typeof card.title === "string"),
    };
    const boardId = makeId("board");
    const derived = this.getDerived();
    const last = derived.boards.length ? derived.boards[derived.boards.length - 1].order : null;
    const columnIdMap = new Map<string, string>();
    const cardIdMap = new Map<string, string>();
    this.transact(() => {
      const board = new Y.Map<unknown>();
      board.set("name", nameOverride?.trim() || payload.board.name || "Imported board");
      board.set("tone", payload.board.tone ?? "accent");
      board.set("order", orderAfter(last));
      board.set("createdAt", this.now());
      board.set("createdBy", this.actorName());
      board.set("labels", payload.board.labels ?? []);
      board.set("fields", payload.board.fields ?? []);
      board.set("display", { ...DEFAULT_DISPLAY, ...(payload.board.display ?? {}) });
      board.set("archived", false);
      board.set("cardCounter", payload.board.cardCounter ?? payload.cards.length);
      this.boards.set(boardId, board);
      for (const column of payload.columns) {
        const id = makeId("col");
        columnIdMap.set(column.id, id);
        const map = new Y.Map<unknown>();
        map.set("boardId", boardId);
        map.set("name", column.name);
        map.set("order", column.order);
        map.set("tone", column.tone ?? "gray");
        map.set("wipLimit", column.wipLimit ?? null);
        map.set("isDone", Boolean(column.isDone));
        this.columns.set(id, map);
      }
      const rules = (payload.board.automations ?? []).map((rule) => ({
        ...rule,
        id: makeId("rule"),
        trigger: { ...rule.trigger, columnId: rule.trigger.columnId ? columnIdMap.get(rule.trigger.columnId) : undefined },
        actions: rule.actions.map((action) => ({ ...action, columnId: action.columnId ? columnIdMap.get(action.columnId) : undefined })),
      }));
      board.set("automations", rules);
      const fallbackColumn = columnIdMap.values().next().value as string | undefined;
      for (const card of payload.cards) {
        const id = makeId("card");
        cardIdMap.set(card.id, id);
        const columnId = columnIdMap.get(card.columnId) ?? fallbackColumn;
        if (!columnId) continue;
        this.writeCardFromJson({ ...card, id, boardId, columnId, fields: card.fields ?? {} } as Card);
      }
      for (const comment of payload.comments ?? []) {
        const cardId = cardIdMap.get(comment.cardId);
        if (cardId) this.writeCommentFromJson({ ...comment, id: makeId("cmt"), cardId });
      }
    });
    return boardId;
  }

  toMirror(): MirrorPayload {
    const snapshot = this.snapshot;
    return {
      format: "kanban-mirror",
      version: SCHEMA_VERSION,
      savedAt: this.now(),
      boards: Object.values(snapshot.boards),
      columns: Object.values(snapshot.columns),
      cards: Object.values(snapshot.cards),
      comments: Object.values(snapshot.comments),
    };
  }

  /** Restore from a mirror into an empty document (after a fork). */
  seedFromMirror(mirror: MirrorPayload) {
    if (!mirror || mirror.format !== "kanban-mirror" || !this.isEmpty()) return;
    if (!Array.isArray(mirror.boards) || !Array.isArray(mirror.columns) || !Array.isArray(mirror.cards)) return;
    mirror = { ...mirror, comments: Array.isArray(mirror.comments) ? mirror.comments : [] };
    this.transact(() => {
      for (const board of mirror.boards) {
        const map = new Y.Map<unknown>();
        map.set("name", board.name);
        map.set("tone", board.tone);
        map.set("order", board.order);
        map.set("createdAt", board.createdAt);
        map.set("createdBy", board.createdBy);
        map.set("labels", board.labels);
        map.set("fields", board.fields);
        map.set("automations", board.automations);
        map.set("display", board.display);
        map.set("archived", board.archived);
        map.set("cardCounter", board.cardCounter);
        this.boards.set(board.id, map);
      }
      for (const column of mirror.columns) {
        const map = new Y.Map<unknown>();
        map.set("boardId", column.boardId);
        map.set("name", column.name);
        map.set("order", column.order);
        map.set("tone", column.tone);
        map.set("wipLimit", column.wipLimit);
        map.set("isDone", column.isDone);
        this.columns.set(column.id, map);
      }
      mirror.cards.forEach((card) => this.writeCardFromJson(card));
      mirror.comments.forEach((comment) => this.writeCommentFromJson(comment));
      this.meta.set("seededAt", this.now());
      this.meta.set("schemaVersion", SCHEMA_VERSION);
    }, SYSTEM_ORIGIN);
  }
}

function describeChange(key: string, previous: Card, current: Card): string {
  switch (key) {
    case "title":
      return `renamed this card to "${current.title}"`;
    case "priority":
      return `set priority to ${current.priority}`;
    case "dueAt":
      return current.dueAt ? `set the due date to ${current.dueAt}` : "removed the due date";
    case "startAt":
      return current.startAt ? `set the start date to ${current.startAt}` : "removed the start date";
    case "assignees": {
      const added = current.assignees.filter((a) => !previous.assignees.some((p) => p.id === a.id)).map((a) => a.name);
      const removed = previous.assignees.filter((a) => !current.assignees.some((p) => p.id === a.id)).map((a) => a.name);
      const parts = [];
      if (added.length) parts.push(`assigned ${added.join(", ")}`);
      if (removed.length) parts.push(`unassigned ${removed.join(", ")}`);
      return parts.join(" and ") || "changed assignees";
    }
    case "labels":
      return "changed labels";
    case "estimate":
      return current.estimate !== null ? `set the estimate to ${current.estimate}h` : "removed the estimate";
    case "checklist":
      return "updated the checklist";
    case "recurrence":
      return current.recurrence ? "made this card recurring" : "stopped recurrence";
    case "cover":
      return "changed the cover";
    case "archived":
      return current.archived ? "archived this card" : "restored this card";
    case "fields":
      return "updated custom fields";
    case "reminderMinutes":
      return "changed the reminder";
    default:
      return `changed ${key}`;
  }
}

export { readCard, readBoard, readColumn };
