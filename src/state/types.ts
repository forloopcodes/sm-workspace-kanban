export type Tone =
  | "accent"
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "purple"
  | "cyan"
  | "gray";

export const TONES: Tone[] = ["accent", "green", "amber", "red", "blue", "purple", "cyan", "gray"];

export type Priority = "none" | "low" | "medium" | "high" | "urgent";
export const PRIORITIES: Priority[] = ["none", "low", "medium", "high", "urgent"];

export type Density = "comfortable" | "compact";
export type Swimlane = "none" | "assignee" | "priority" | "label" | "field";

export interface Label {
  id: string;
  name: string;
  tone: Tone;
}

export type CustomFieldKind = "text" | "number" | "select" | "date" | "checkbox" | "url" | "person";

export interface CustomFieldDefinition {
  id: string;
  name: string;
  kind: CustomFieldKind;
  options?: string[];
  showOnCard?: boolean;
}

export type CustomFieldValue = string | number | boolean | null;

export interface BoardDisplay {
  showLabels: boolean;
  showAssignees: boolean;
  showDue: boolean;
  showPriority: boolean;
  showEstimate: boolean;
  showChecklist: boolean;
  showComments: boolean;
  showCover: boolean;
  showCardIds: boolean;
  showCompleted: boolean;
  density: Density;
  swimlane: Swimlane;
  swimlaneFieldId?: string;
  columnWidth: number;
}

export const DEFAULT_DISPLAY: BoardDisplay = {
  showLabels: true,
  showAssignees: true,
  showDue: true,
  showPriority: true,
  showEstimate: false,
  showChecklist: true,
  showComments: true,
  showCover: true,
  showCardIds: false,
  showCompleted: true,
  density: "comfortable",
  swimlane: "none",
  columnWidth: 272,
};

export type TriggerType =
  | "card-created"
  | "card-moved"
  | "field-changed"
  | "checklist-complete"
  | "due-passed"
  | "start-reached";

export interface AutomationTrigger {
  type: TriggerType;
  columnId?: string;
  field?: string;
  value?: string;
}

export type ConditionOp = "is" | "isNot" | "contains" | "isEmpty" | "isNotEmpty" | "before" | "after";

export interface AutomationCondition {
  field: string;
  op: ConditionOp;
  value?: string;
}

export type ActionType =
  | "set-field"
  | "move-to-column"
  | "assign"
  | "unassign"
  | "add-label"
  | "remove-label"
  | "set-due"
  | "set-priority"
  | "complete"
  | "reopen"
  | "archive"
  | "notify";

export interface AutomationAction {
  type: ActionType;
  field?: string;
  value?: string;
  columnId?: string;
  labelId?: string;
  relative?: string;
  message?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export interface Board {
  id: string;
  name: string;
  tone: Tone;
  order: string;
  createdAt: string;
  createdBy: string;
  labels: Label[];
  fields: CustomFieldDefinition[];
  automations: AutomationRule[];
  display: BoardDisplay;
  archived: boolean;
  cardCounter: number;
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  order: string;
  tone: Tone;
  wipLimit: number | null;
  isDone: boolean;
}

export interface Assignee {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays?: number[];
  until?: string | null;
}

export interface Card {
  id: string;
  number: number;
  boardId: string;
  columnId: string;
  order: string;
  title: string;
  description: string;
  labels: string[];
  assignees: Assignee[];
  priority: Priority;
  dueAt: string | null;
  startAt: string | null;
  estimate: number | null;
  checklist: ChecklistItem[];
  recurrence: Recurrence | null;
  reminderMinutes: number | null;
  completedAt: string | null;
  archived: boolean;
  cover: Tone | null;
  fields: Record<string, CustomFieldValue>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  cardId: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  editedAt: string | null;
}

export interface ActivityEntry {
  id: string;
  cardId: string;
  boardId: string;
  kind: string;
  summary: string;
  actor: string;
  at: string;
}

export interface CardDraft {
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  labels?: string[];
  assignees?: Assignee[];
  priority?: Priority;
  dueAt?: string | null;
  startAt?: string | null;
  estimate?: number | null;
  checklist?: ChecklistItem[];
  recurrence?: Recurrence | null;
  reminderMinutes?: number | null;
  cover?: Tone | null;
  fields?: Record<string, CustomFieldValue>;
  position?: "top" | "bottom";
}

export type CardPatch = Partial<Omit<Card, "id" | "number" | "boardId" | "createdAt" | "createdBy" | "updatedAt" | "description">>;

export interface Viewer {
  id: string | null;
  name: string;
  avatarUrl: string | null;
}

export interface KanbanPresence {
  boardId: string | null;
  viewingCardId: string | null;
  editingCardId: string | null;
  editingField: string | null;
}

export interface DragPresence {
  draggingCardId: string | null;
  overColumnId: string | null;
}

export interface Peer<T> {
  clientId: number;
  user: { name: string; color: string; colorLight: string } | null;
  value: T;
}
