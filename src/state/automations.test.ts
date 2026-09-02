import { describe, expect, test } from "bun:test";
import { evaluateRules } from "./automations";
import type { Board, Card, Column } from "./types";
import { DEFAULT_DISPLAY } from "./types";

const now = new Date(2026, 8, 2, 10, 0);
const board: Board = {
  id: "b1",
  name: "Board",
  tone: "accent",
  order: "V",
  createdAt: "",
  createdBy: "",
  labels: [{ id: "l1", name: "Bug", tone: "red" }],
  fields: [],
  automations: [],
  display: DEFAULT_DISPLAY,
  archived: false,
  cardCounter: 0,
};
const columns: Column[] = [
  { id: "c1", boardId: "b1", name: "To do", order: "A", tone: "gray", wipLimit: null, isDone: false },
  { id: "c2", boardId: "b1", name: "Done", order: "B", tone: "green", wipLimit: null, isDone: true },
];
const card: Card = {
  id: "k1",
  number: 1,
  boardId: "b1",
  columnId: "c1",
  order: "V",
  title: "Crash on login",
  description: "",
  labels: [],
  assignees: [],
  priority: "none",
  dueAt: "2026-09-01",
  startAt: null,
  estimate: null,
  checklist: [],
  recurrence: null,
  reminderMinutes: null,
  completedAt: null,
  archived: false,
  cover: null,
  fields: {},
  createdAt: "",
  createdBy: "",
  updatedAt: "",
};
const ctx = { board, columns, viewer: { id: "me", name: "Me" } };

describe("evaluateRules", () => {
  test("move to done completes", () => {
    const out = evaluateRules(
      [{ id: "r", name: "done", enabled: true, trigger: { type: "card-moved", columnId: "c2" }, conditions: [], actions: [{ type: "complete" }] }],
      { type: "card-moved", card: { ...card, columnId: "c2" }, now },
      ctx
    );
    expect(out.patch.completedAt).toBe(now.toISOString());
    expect(out.matchedRuleIds).toEqual(["r"]);
  });

  test("trigger column mismatch does nothing", () => {
    const out = evaluateRules(
      [{ id: "r", name: "done", enabled: true, trigger: { type: "card-moved", columnId: "c2" }, conditions: [], actions: [{ type: "complete" }] }],
      { type: "card-moved", card, now },
      ctx
    );
    expect(out.patch).toEqual({});
  });

  test("conditions and multiple actions", () => {
    const out = evaluateRules(
      [
        {
          id: "r",
          name: "escalate",
          enabled: true,
          trigger: { type: "card-created" },
          conditions: [
            { field: "title", op: "contains", value: "crash" },
            { field: "assignees", op: "isEmpty" },
          ],
          actions: [
            { type: "set-priority", value: "urgent" },
            { type: "add-label", labelId: "l1" },
            { type: "assign", value: "me" },
            { type: "set-due", relative: "+3d" },
            { type: "notify", message: "Escalated {title}" },
          ],
        },
      ],
      { type: "card-created", card, now },
      ctx
    );
    expect(out.patch.priority).toBe("urgent");
    expect(out.patch.labels).toEqual(["l1"]);
    expect(out.patch.assignees?.[0].id).toBe("me");
    expect(out.patch.dueAt).toBe("2026-09-05");
    expect(out.notifications).toEqual(["Escalated Crash on login"]);
  });

  test("disabled rules skip; due-passed condition before now", () => {
    const rules = [
      { id: "off", name: "off", enabled: false, trigger: { type: "due-passed" as const }, conditions: [], actions: [{ type: "archive" as const }] },
      {
        id: "on",
        name: "on",
        enabled: true,
        trigger: { type: "due-passed" as const },
        conditions: [{ field: "dueAt", op: "before" as const, value: "now" }, { field: "completedAt", op: "isEmpty" as const }],
        actions: [{ type: "set-priority" as const, value: "high" }],
      },
    ];
    const out = evaluateRules(rules, { type: "due-passed", card, now }, ctx);
    expect(out.patch.archived).toBeUndefined();
    expect(out.patch.priority).toBe("high");
  });

  test("field-changed with value filter", () => {
    const out = evaluateRules(
      [
        {
          id: "r",
          name: "prio",
          enabled: true,
          trigger: { type: "field-changed", field: "priority", value: "urgent" },
          conditions: [],
          actions: [{ type: "move-to-column", columnId: "c1" }],
        },
      ],
      { type: "field-changed", changedField: "priority", card: { ...card, priority: "urgent", columnId: "c2" }, now },
      ctx
    );
    expect(out.patch.columnId).toBe("c1");
  });
});
