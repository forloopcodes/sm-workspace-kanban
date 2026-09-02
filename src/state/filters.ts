import { deadlineMs, isOverdue } from "./dates";
import type { Card, Priority } from "./types";

export interface BoardFilters {
  mine: boolean;
  unassigned: boolean;
  overdue: boolean;
  dueWithinDays: number | null;
  labels: string[];
  assignees: string[];
  priorities: Priority[];
  hideCompleted: boolean;
}

export const EMPTY_FILTERS: BoardFilters = {
  mine: false,
  unassigned: false,
  overdue: false,
  dueWithinDays: null,
  labels: [],
  assignees: [],
  priorities: [],
  hideCompleted: false,
};

export function normalizeFilters(value: unknown): BoardFilters {
  const v = (value && typeof value === "object" ? value : {}) as Partial<BoardFilters>;
  return {
    mine: Boolean(v.mine),
    unassigned: Boolean(v.unassigned),
    overdue: Boolean(v.overdue),
    dueWithinDays: typeof v.dueWithinDays === "number" ? v.dueWithinDays : null,
    labels: Array.isArray(v.labels) ? v.labels : [],
    assignees: Array.isArray(v.assignees) ? v.assignees : [],
    priorities: Array.isArray(v.priorities) ? v.priorities : [],
    hideCompleted: Boolean(v.hideCompleted),
  };
}

export function countActiveFilters(filters: BoardFilters): number {
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

export function matchesQuery(card: Card, query: string, labelNames: Record<string, string>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (q.startsWith("#") && /^#\d+$/.test(q)) return String(card.number) === q.slice(1);
  const haystack = [
    card.title,
    card.description,
    card.priority,
    ...card.labels.map((id) => labelNames[id] ?? ""),
    ...card.assignees.map((a) => a.name),
    ...card.checklist.map((item) => item.text),
    ...Object.values(card.fields).map((value) => String(value ?? "")),
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

export function cardMatches(card: Card, filters: BoardFilters, query: string, labelNames: Record<string, string>, viewerId: string | null, now = new Date()): boolean {
  if (filters.hideCompleted && card.completedAt) return false;
  if (filters.mine && !(viewerId && card.assignees.some((a) => a.id === viewerId))) return false;
  if (filters.unassigned && card.assignees.length > 0) return false;
  if (filters.overdue && !(isOverdue(card.dueAt, now) && !card.completedAt)) return false;
  if (filters.dueWithinDays !== null) {
    const ms = deadlineMs(card.dueAt);
    if (ms === null || ms > now.getTime() + filters.dueWithinDays * 86_400_000) return false;
  }
  if (filters.labels.length && !filters.labels.some((id) => card.labels.includes(id))) return false;
  if (filters.assignees.length && !filters.assignees.some((id) => card.assignees.some((a) => a.id === id))) return false;
  if (filters.priorities.length && !filters.priorities.includes(card.priority)) return false;
  return matchesQuery(card, query, labelNames);
}
