import type { AutomationRule, Label, Tone } from "./types";

export interface TemplateColumn {
  name: string;
  tone: Tone;
  wipLimit?: number | null;
  isDone?: boolean;
}

export interface TemplateCard {
  title: string;
  column: number;
  description?: string;
  labels?: string[];
  priority?: "none" | "low" | "medium" | "high" | "urgent";
  checklist?: string[];
  dueInDays?: number;
}

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  tone: Tone;
  columns: TemplateColumn[];
  labels: Array<Pick<Label, "name" | "tone">>;
  /** Rules reference columns by index and labels by name; resolved on creation. */
  automations: Array<
    Omit<AutomationRule, "id" | "trigger" | "actions"> & {
      trigger: AutomationRule["trigger"] & { columnIndex?: number };
      actions: Array<AutomationRule["actions"][number] & { columnIndex?: number; labelName?: string }>;
    }
  >;
  cards?: TemplateCard[];
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "basic",
    name: "Basic",
    description: "To do, In progress, Done.",
    tone: "accent",
    columns: [
      { name: "To do", tone: "gray" },
      { name: "In progress", tone: "blue" },
      { name: "Done", tone: "green", isDone: true },
    ],
    labels: [
      { name: "Bug", tone: "red" },
      { name: "Feature", tone: "purple" },
      { name: "Chore", tone: "gray" },
    ],
    automations: [
      {
        name: "Complete cards moved to Done",
        enabled: true,
        trigger: { type: "card-moved", columnIndex: 2 },
        conditions: [],
        actions: [{ type: "complete" }],
      },
    ],
  },
  {
    id: "software",
    name: "Software",
    description: "Backlog → Ready → In progress → Review → Done, with WIP limits.",
    tone: "blue",
    columns: [
      { name: "Backlog", tone: "gray" },
      { name: "Ready", tone: "cyan", wipLimit: 8 },
      { name: "In progress", tone: "blue", wipLimit: 4 },
      { name: "Review", tone: "amber", wipLimit: 3 },
      { name: "Done", tone: "green", isDone: true },
    ],
    labels: [
      { name: "Bug", tone: "red" },
      { name: "Feature", tone: "purple" },
      { name: "Tech debt", tone: "amber" },
      { name: "Docs", tone: "cyan" },
      { name: "Blocked", tone: "red" },
    ],
    automations: [
      {
        name: "Complete cards moved to Done",
        enabled: true,
        trigger: { type: "card-moved", columnIndex: 4 },
        conditions: [],
        actions: [{ type: "complete" }],
      },
      {
        name: "Assign me when I start work",
        enabled: true,
        trigger: { type: "card-moved", columnIndex: 2 },
        conditions: [{ field: "assignees", op: "isEmpty" }],
        actions: [{ type: "assign", value: "me" }],
      },
      {
        name: "Flag overdue cards",
        enabled: true,
        trigger: { type: "due-passed" },
        conditions: [{ field: "completedAt", op: "isEmpty" }],
        actions: [{ type: "set-priority", value: "urgent" }],
      },
    ],
  },
  {
    id: "bugs",
    name: "Bug triage",
    description: "New → Triaged → Fixing → Verify → Closed.",
    tone: "red",
    columns: [
      { name: "New", tone: "gray" },
      { name: "Triaged", tone: "amber" },
      { name: "Fixing", tone: "blue" },
      { name: "Verify", tone: "purple" },
      { name: "Closed", tone: "green", isDone: true },
    ],
    labels: [
      { name: "Crash", tone: "red" },
      { name: "Regression", tone: "amber" },
      { name: "UI", tone: "purple" },
      { name: "Performance", tone: "cyan" },
      { name: "Needs info", tone: "gray" },
    ],
    automations: [
      {
        name: "Close verified bugs",
        enabled: true,
        trigger: { type: "card-moved", columnIndex: 4 },
        conditions: [],
        actions: [{ type: "complete" }],
      },
      {
        name: "Escalate crashes",
        enabled: true,
        trigger: { type: "card-created" },
        conditions: [{ field: "labels", op: "contains", value: "crash" }],
        actions: [{ type: "set-priority", value: "urgent" }],
      },
    ],
  },
  {
    id: "sprint",
    name: "Sprint",
    description: "Sprint backlog with a two-week due default.",
    tone: "purple",
    columns: [
      { name: "Sprint backlog", tone: "gray" },
      { name: "Doing", tone: "blue", wipLimit: 3 },
      { name: "Blocked", tone: "red" },
      { name: "Done", tone: "green", isDone: true },
    ],
    labels: [
      { name: "Story", tone: "purple" },
      { name: "Task", tone: "blue" },
      { name: "Spike", tone: "cyan" },
      { name: "Stretch", tone: "gray" },
    ],
    automations: [
      {
        name: "Complete cards moved to Done",
        enabled: true,
        trigger: { type: "card-moved", columnIndex: 3 },
        conditions: [],
        actions: [{ type: "complete" }],
      },
      {
        name: "Default sprint deadline",
        enabled: true,
        trigger: { type: "card-created" },
        conditions: [{ field: "dueAt", op: "isEmpty" }],
        actions: [{ type: "set-due", relative: "+2w" }],
      },
    ],
  },
];

export const STARTER_CARDS: TemplateCard[] = [
  {
    title: "Welcome to your board",
    column: 0,
    description:
      "Cards live in columns. Drag them between columns, press C to create one, and double-click a card to open it.\n\nEverything here is shared live with everyone in the workspace.",
    labels: ["Feature"],
    priority: "medium",
    checklist: ["Drag this card to In progress", "Open the Tasks panel", "Add a due date"],
  },
  {
    title: "Try the Tasks panel for schedules",
    column: 0,
    description: "The Tasks panel lists cards across boards with List, Schedule and Timeline views. Quick-add understands text like `Fix login tomorrow 3pm !high #bug @me`.",
    labels: ["Chore"],
    dueInDays: 2,
  },
  {
    title: "Customize columns, labels and automations",
    column: 1,
    description: "Open board settings (gear icon) to add columns with WIP limits, labels, custom fields, and automation rules.",
    priority: "low",
  },
];

export function getTemplate(id: string): BoardTemplate {
  return BOARD_TEMPLATES.find((template) => template.id === id) ?? BOARD_TEMPLATES[0];
}
