import { applyRelative, deadlineMs, toStored, hasTime } from "./dates";
import type {
  Assignee,
  AutomationAction,
  AutomationCondition,
  AutomationRule,
  Board,
  Card,
  CardPatch,
  Column,
  Priority,
  TriggerType,
} from "./types";
import { PRIORITIES } from "./types";

export interface AutomationEvent {
  type: TriggerType;
  card: Card;
  previous?: Card | null;
  changedField?: string;
  now: Date;
}

export interface AutomationContext {
  board: Board;
  columns: Column[];
  viewer: Assignee | null;
}

export interface AutomationOutcome {
  patch: CardPatch;
  notifications: string[];
  matchedRuleIds: string[];
}

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  "card-created": "Card is created",
  "card-moved": "Card is moved to a column",
  "field-changed": "A field changes",
  "checklist-complete": "Checklist is completed",
  "due-passed": "Due date passes",
  "start-reached": "Start date arrives",
};

export const CONDITION_FIELDS: Array<{ id: string; label: string }> = [
  { id: "title", label: "Title" },
  { id: "priority", label: "Priority" },
  { id: "columnId", label: "Column" },
  { id: "labels", label: "Labels" },
  { id: "assignees", label: "Assignees" },
  { id: "dueAt", label: "Due date" },
  { id: "startAt", label: "Start date" },
  { id: "estimate", label: "Estimate" },
  { id: "completedAt", label: "Completed" },
];

function fieldValue(card: Card, field: string): unknown {
  if (field.startsWith("f:")) return card.fields[field.slice(2)] ?? null;
  return (card as unknown as Record<string, unknown>)[field] ?? null;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => (item && typeof item === "object" && "name" in item ? String((item as { name: string }).name) : String(item)))
      .join(",");
  }
  return String(value);
}

export function evaluateCondition(condition: AutomationCondition, card: Card, now: Date): boolean {
  const raw = fieldValue(card, condition.field);
  const expected = (condition.value ?? "").trim().toLowerCase();
  const actualText = asText(raw).toLowerCase();
  switch (condition.op) {
    case "isEmpty":
      return raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);
    case "isNotEmpty":
      return !(raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0));
    case "is":
      if (Array.isArray(raw)) return raw.some((item) => asText([item]).toLowerCase() === expected || (item && typeof item === "object" && "id" in item && String((item as { id: string }).id).toLowerCase() === expected));
      return actualText === expected;
    case "isNot":
      if (Array.isArray(raw)) return !raw.some((item) => asText([item]).toLowerCase() === expected);
      return actualText !== expected;
    case "contains":
      return actualText.includes(expected);
    case "before":
    case "after": {
      const ms = deadlineMs(typeof raw === "string" ? raw : null);
      if (ms === null) return false;
      const target = expected === "now" || expected === "" ? now.getTime() : (applyRelative(expected, now)?.getTime() ?? deadlineMs(expected));
      if (target === null) return false;
      return condition.op === "before" ? ms < target : ms > target;
    }
    default:
      return false;
  }
}

function triggerMatches(rule: AutomationRule, event: AutomationEvent): boolean {
  const trigger = rule.trigger;
  if (trigger.type !== event.type) return false;
  switch (trigger.type) {
    case "card-moved":
      return !trigger.columnId || trigger.columnId === event.card.columnId;
    case "field-changed": {
      if (trigger.field && trigger.field !== event.changedField) return false;
      if (trigger.value !== undefined && trigger.value !== "") {
        return asText(fieldValue(event.card, event.changedField ?? "")).toLowerCase() === trigger.value.toLowerCase();
      }
      return true;
    }
    default:
      return true;
  }
}

export function applyAction(
  action: AutomationAction,
  card: Card,
  patch: CardPatch,
  context: AutomationContext,
  now: Date,
  notifications: string[]
): void {
  const current = { ...card, ...patch } as Card;
  switch (action.type) {
    case "set-field": {
      if (!action.field) return;
      if (action.field.startsWith("f:")) {
        patch.fields = { ...(patch.fields ?? current.fields), [action.field.slice(2)]: action.value ?? null };
      } else if (action.field === "title" && action.value) {
        patch.title = action.value;
      } else if (action.field === "estimate") {
        const num = Number(action.value);
        patch.estimate = Number.isFinite(num) ? num : null;
      } else if (action.field === "cover") {
        patch.cover = (action.value as Card["cover"]) || null;
      }
      return;
    }
    case "move-to-column": {
      if (action.columnId && context.columns.some((c) => c.id === action.columnId && c.boardId === card.boardId)) {
        patch.columnId = action.columnId;
      }
      return;
    }
    case "assign": {
      const who: Assignee | null =
        action.value === "me" || !action.value
          ? context.viewer
          : (current.assignees.find((a) => a.name.toLowerCase() === action.value?.toLowerCase()) ?? { id: `name:${action.value}`, name: action.value });
      if (!who) return;
      if (!current.assignees.some((a) => a.id === who.id)) patch.assignees = [...current.assignees, who];
      return;
    }
    case "unassign":
      patch.assignees = [];
      return;
    case "add-label":
      if (action.labelId && !current.labels.includes(action.labelId)) patch.labels = [...current.labels, action.labelId];
      return;
    case "remove-label":
      if (action.labelId && current.labels.includes(action.labelId)) patch.labels = current.labels.filter((id) => id !== action.labelId);
      return;
    case "set-due": {
      if (!action.relative || action.relative === "clear") {
        patch.dueAt = null;
        return;
      }
      const date = applyRelative(action.relative, now);
      if (date) patch.dueAt = toStored(date, hasTime(current.dueAt) || /h$/i.test(action.relative));
      return;
    }
    case "set-priority": {
      const value = (action.value ?? "none") as Priority;
      if (PRIORITIES.includes(value)) patch.priority = value;
      return;
    }
    case "complete": {
      patch.completedAt = now.toISOString();
      const done = context.columns.find((c) => c.boardId === card.boardId && c.isDone);
      if (done && current.columnId !== done.id) patch.columnId = done.id;
      return;
    }
    case "reopen":
      patch.completedAt = null;
      return;
    case "archive":
      patch.archived = true;
      return;
    case "notify":
      notifications.push((action.message || `Automation "${"rule"}" ran`).replace(/\{title\}/g, card.title));
      return;
    default:
      return;
  }
}

/**
 * Evaluate rules against one event. Pure: returns a patch to merge into the
 * card inside the same transaction. Rules never re-trigger on their own
 * patches (no cascades), which keeps behaviour predictable across peers.
 */
export function evaluateRules(rules: AutomationRule[], event: AutomationEvent, context: AutomationContext): AutomationOutcome {
  const patch: CardPatch = {};
  const notifications: string[] = [];
  const matchedRuleIds: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !triggerMatches(rule, event)) continue;
    const card = { ...event.card, ...patch } as Card;
    if (!rule.conditions.every((condition) => evaluateCondition(condition, card, event.now))) continue;
    matchedRuleIds.push(rule.id);
    for (const action of rule.actions) {
      if (action.type === "notify") {
        notifications.push((action.message || `${rule.name} ran on "{title}"`).replace(/\{title\}/g, card.title));
        continue;
      }
      applyAction(action, card, patch, context, event.now, notifications);
    }
  }
  return { patch, notifications, matchedRuleIds };
}

export function describeTrigger(rule: AutomationRule, columns: Column[]): string {
  const trigger = rule.trigger;
  switch (trigger.type) {
    case "card-moved": {
      const column = columns.find((c) => c.id === trigger.columnId);
      return column ? `When a card moves to ${column.name}` : "When a card moves";
    }
    case "field-changed":
      return trigger.field ? `When ${trigger.field.replace(/^f:/, "")} changes${trigger.value ? ` to ${trigger.value}` : ""}` : "When a field changes";
    default:
      return `When ${(TRIGGER_LABELS[trigger.type] ?? String(trigger.type)).toLowerCase()}`;
  }
}

export function describeAction(action: AutomationAction, board: Board, columns: Column[]): string {
  switch (action.type) {
    case "move-to-column":
      return `move to ${columns.find((c) => c.id === action.columnId)?.name ?? "column"}`;
    case "add-label":
      return `add label ${board.labels.find((l) => l.id === action.labelId)?.name ?? ""}`.trim();
    case "remove-label":
      return `remove label ${board.labels.find((l) => l.id === action.labelId)?.name ?? ""}`.trim();
    case "assign":
      return action.value && action.value !== "me" ? `assign ${action.value}` : "assign to the actor";
    case "unassign":
      return "clear assignees";
    case "set-due":
      return action.relative && action.relative !== "clear" ? `set due ${action.relative}` : "clear due date";
    case "set-priority":
      return `set priority ${action.value ?? "none"}`;
    case "set-field":
      return `set ${action.field?.replace(/^f:/, "") ?? "field"} = ${action.value ?? ""}`;
    case "complete":
      return "mark complete";
    case "reopen":
      return "reopen";
    case "archive":
      return "archive";
    case "notify":
      return `notify: ${action.message ?? ""}`;
    default:
      return action.type;
  }
}
