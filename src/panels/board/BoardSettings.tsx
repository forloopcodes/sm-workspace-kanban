import { useRef, useState } from "react";
import styled from "styled-components";
import { Button, Checkbox, Icon, IconButton, Input, Select, Toggle, t, toast } from "@soft-machine/sdk";
import { CONDITION_FIELDS, TRIGGER_LABELS, describeAction, describeTrigger } from "../../state/automations";
import { makeId } from "../../state/ids";
import { useKanban } from "../../state/KanbanContext";
import { cardsToCsv, cardsToIcs, downloadText } from "../../state/io";
import type { ExportedBoard } from "../../state/store";
import { priorityLabel } from "../../state/tones";
import {
  PRIORITIES,
  type ActionType,
  type AutomationAction,
  type AutomationCondition,
  type AutomationRule,
  type Board,
  type BoardDisplay,
  type Column,
  type ConditionOp,
  type CustomFieldDefinition,
  type CustomFieldKind,
  type TriggerType,
} from "../../state/types";
import { Modal } from "../../ui/Modal";
import { FieldRow, GhostButton, InlineInput, Muted, Row, SectionTitle, Segment, SegmentGroup, Stack, ToneDot } from "../../ui/shared";
import { ToneSwatches } from "./pickers";

type Tab = "general" | "columns" | "labels" | "fields" | "automations" | "display" | "data";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "general", label: "General" },
  { id: "columns", label: "Columns" },
  { id: "labels", label: "Labels" },
  { id: "fields", label: "Fields" },
  { id: "automations", label: "Automations" },
  { id: "display", label: "Display" },
  { id: "data", label: "Data" },
];

const Tabs = styled(SegmentGroup)`
  flex-wrap: wrap;
  align-self: flex-start;
`;

const ItemRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  min-width: 0;
  padding: 2px 4px;
  border-radius: ${t.radius};
  &:hover {
    background: ${t.bg.tertiary};
  }
  & > .grow {
    flex: 1;
    min-width: 0;
  }
`;

const RuleCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.25);
  background: ${t.bg.secondary};
`;

const RuleHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  & > .grow {
    flex: 1;
    min-width: 0;
  }
`;

const Clause = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  & > span.kw {
    font-size: ${t.typography.xs};
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: ${t.text.muted};
    min-width: 40px;
  }
  & select,
  & input {
    max-width: 180px;
  }
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 26px;
  font-size: ${t.typography.sm};
  color: ${t.text.primary};
  cursor: pointer;
`;

export interface BoardSettingsProps {
  board: Board;
  columns: Column[];
  onClose: () => void;
  onDeleteBoard: () => void;
}

export function BoardSettings({ board, columns, onClose, onDeleteBoard }: BoardSettingsProps) {
  const { store } = useKanban();
  const [tab, setTab] = useState<Tab>("general");
  if (!store) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${board.name} · settings`}
      width={640}
      footer={
        <>
          <GhostButton type="button" $danger onClick={onDeleteBoard}>
            <Icon name="Trash2" size={12} />
            Delete board
          </GhostButton>
          <span style={{ flex: 1 }} />
          <Button $variant="secondary" $compact onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <Tabs role="tablist">
        {TABS.map((item) => (
          <Segment key={item.id} type="button" role="tab" aria-selected={tab === item.id} $active={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </Segment>
        ))}
      </Tabs>
      {tab === "general" ? <GeneralTab board={board} columns={columns} /> : null}
      {tab === "columns" ? <ColumnsTab board={board} columns={columns} /> : null}
      {tab === "labels" ? <LabelsTab board={board} /> : null}
      {tab === "fields" ? <FieldsTab board={board} /> : null}
      {tab === "automations" ? <AutomationsTab board={board} columns={columns} /> : null}
      {tab === "display" ? <DisplayTab board={board} /> : null}
      {tab === "data" ? <DataTab board={board} /> : null}
    </Modal>
  );
}

function GeneralTab({ board, columns }: { board: Board; columns: Column[] }) {
  const { store } = useKanban();
  const [name, setName] = useState(board.name);
  if (!store) return null;
  const done = columns.find((c) => c.isDone);
  return (
    <Stack $gap={10}>
      <FieldRow>
        <label>Name</label>
        <Input
          $fullWidth
          value={name}
          aria-label="Board name"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
          onBlur={() => name.trim() && name.trim() !== board.name && store.updateBoard(board.id, { name: name.trim() })}
        />
      </FieldRow>
      <FieldRow>
        <label>Color</label>
        <ToneSwatches value={board.tone} onChange={(tone) => tone && store.updateBoard(board.id, { tone })} />
      </FieldRow>
      <FieldRow>
        <label>Done column</label>
        <Select aria-label="Done column" value={done?.id ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => store.setDoneColumn(board.id, event.target.value || null)}>
          <option value="">None</option>
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </Select>
      </FieldRow>
      <Muted style={{ paddingLeft: 104 }}>Cards moved into the done column are marked complete; completing a card moves it there. Recurring cards spawn their next occurrence when completed.</Muted>
      <Muted style={{ paddingLeft: 104 }}>
        {board.cardCounter} cards created · {columns.length} columns · {board.labels.length} labels · {board.automations.length} automations
      </Muted>
    </Stack>
  );
}

function ColumnsTab({ board, columns }: { board: Board; columns: Column[] }) {
  const { store } = useKanban();
  const [newName, setNewName] = useState("");
  if (!store) return null;
  return (
    <Stack $gap={6}>
      <SectionTitle>Columns · drag on the board to reorder</SectionTitle>
      {columns.map((column, index) => (
        <ItemRow key={column.id}>
          <IconButton title="Move up" aria-label="Move column up" disabled={index === 0} onClick={() => store.moveColumn(column.id, index - 1)}>
            <Icon name="ChevronUp" size={12} />
          </IconButton>
          <IconButton title="Move down" aria-label="Move column down" disabled={index === columns.length - 1} onClick={() => store.moveColumn(column.id, index + 1)}>
            <Icon name="ChevronDown" size={12} />
          </IconButton>
          <ToneDot $tone={column.tone} />
          <InlineInput
            className="grow"
            defaultValue={column.name}
            aria-label="Column name"
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== column.name) store.updateColumn(column.id, { name: value });
            }}
            onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
          />
          <Input
            type="number"
            min={0}
            aria-label="WIP limit"
            placeholder="WIP"
            title="Work-in-progress limit (blank = none)"
            value={column.wipLimit ?? ""}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => store.updateColumn(column.id, { wipLimit: event.target.value === "" ? null : Math.max(0, Number(event.target.value)) })}
            style={{ width: 64 }}
          />
          <ToneSwatches value={column.tone} onChange={(tone) => tone && store.updateColumn(column.id, { tone })} />
          <Checkbox checked={column.isDone} onChange={(checked: boolean) => store.setDoneColumn(board.id, checked ? column.id : null)} aria-label={`${column.name} is the done column`} />
          <IconButton
            title="Delete column"
            aria-label={`Delete ${column.name}`}
            onClick={() => {
              const count = (store.getDerived().cardsByColumn[column.id] ?? []).length;
              const target = columns.find((c) => c.id !== column.id);
              store.deleteColumn(column.id, count > 0 ? target?.id ?? null : null);
              if (count > 0 && target) toast(`Moved ${count} card(s) to ${target.name}`);
            }}
          >
            <Icon name="Trash2" size={12} />
          </IconButton>
        </ItemRow>
      ))}
      <Row $gap={6}>
        <Input
          $fullWidth
          value={newName}
          placeholder="New column"
          aria-label="New column name"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNewName(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" && newName.trim()) {
              store.createColumn(board.id, newName);
              setNewName("");
            }
          }}
        />
        <Button
          $variant="secondary"
          $compact
          disabled={!newName.trim()}
          onClick={() => {
            store.createColumn(board.id, newName);
            setNewName("");
          }}
        >
          Add
        </Button>
      </Row>
      <Muted>The checkbox marks the done column. WIP limits warn when exceeded; they never block.</Muted>
    </Stack>
  );
}

function LabelsTab({ board }: { board: Board }) {
  const { store } = useKanban();
  const [newName, setNewName] = useState("");
  if (!store) return null;
  return (
    <Stack $gap={6}>
      <SectionTitle>Labels</SectionTitle>
      {board.labels.length === 0 ? <Muted>No labels yet.</Muted> : null}
      {board.labels.map((label) => (
        <ItemRow key={label.id}>
          <ToneDot $tone={label.tone} />
          <InlineInput
            className="grow"
            defaultValue={label.name}
            aria-label="Label name"
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== label.name) store.updateLabel(board.id, label.id, { name: value });
            }}
            onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
          />
          <ToneSwatches value={label.tone} onChange={(tone) => tone && store.updateLabel(board.id, label.id, { tone })} />
          <IconButton title="Delete label" aria-label={`Delete ${label.name}`} onClick={() => store.deleteLabel(board.id, label.id)}>
            <Icon name="Trash2" size={12} />
          </IconButton>
        </ItemRow>
      ))}
      <Row $gap={6}>
        <Input
          $fullWidth
          value={newName}
          placeholder="New label"
          aria-label="New label name"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNewName(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" && newName.trim()) {
              store.addLabel(board.id, newName);
              setNewName("");
            }
          }}
        />
        <Button
          $variant="secondary"
          $compact
          disabled={!newName.trim()}
          onClick={() => {
            store.addLabel(board.id, newName);
            setNewName("");
          }}
        >
          Add
        </Button>
      </Row>
    </Stack>
  );
}

const FIELD_KINDS: Array<{ id: CustomFieldKind; label: string }> = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "select", label: "Select" },
  { id: "date", label: "Date" },
  { id: "checkbox", label: "Checkbox" },
  { id: "url", label: "URL" },
  { id: "person", label: "Person" },
];

function FieldsTab({ board }: { board: Board }) {
  const { store } = useKanban();
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CustomFieldKind>("text");
  if (!store) return null;
  const add = () => {
    if (!newName.trim()) return;
    store.addField(board.id, { name: newName, kind: newKind, options: newKind === "select" ? ["Option A", "Option B"] : undefined, showOnCard: false });
    setNewName("");
  };
  return (
    <Stack $gap={6}>
      <SectionTitle>Custom fields</SectionTitle>
      {board.fields.length === 0 ? <Muted>Fields add structured data to every card on this board: text, numbers, selects, dates, checkboxes, URLs or people.</Muted> : null}
      {board.fields.map((field) => (
        <FieldEditor key={field.id} board={board} field={field} />
      ))}
      <Row $gap={6}>
        <Input $fullWidth value={newName} placeholder="New field name" aria-label="New field name" onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNewName(event.target.value)} onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => event.key === "Enter" && add()} />
        <Select aria-label="Field kind" value={newKind} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setNewKind(event.target.value as CustomFieldKind)}>
          {FIELD_KINDS.map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.label}
            </option>
          ))}
        </Select>
        <Button $variant="secondary" $compact disabled={!newName.trim()} onClick={add}>
          Add
        </Button>
      </Row>
    </Stack>
  );
}

function FieldEditor({ board, field }: { board: Board; field: CustomFieldDefinition }) {
  const { store } = useKanban();
  if (!store) return null;
  return (
    <RuleCard>
      <RuleHeader>
        <InlineInput
          className="grow"
          defaultValue={field.name}
          aria-label="Field name"
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value && value !== field.name) store.updateField(board.id, field.id, { name: value });
          }}
        />
        <Select aria-label="Field kind" value={field.kind} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => store.updateField(board.id, field.id, { kind: event.target.value as CustomFieldKind })}>
          {FIELD_KINDS.map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.label}
            </option>
          ))}
        </Select>
        <ToggleRow title="Show on cards">
          <Muted>On card</Muted>
          <Toggle checked={Boolean(field.showOnCard)} onChange={(checked: boolean) => store.updateField(board.id, field.id, { showOnCard: checked })} />
        </ToggleRow>
        <IconButton title="Delete field" aria-label={`Delete ${field.name}`} onClick={() => store.deleteField(board.id, field.id)}>
          <Icon name="Trash2" size={12} />
        </IconButton>
      </RuleHeader>
      {field.kind === "select" ? (
        <FieldRow>
          <label>Options</label>
          <Input
            $fullWidth
            defaultValue={(field.options ?? []).join(", ")}
            placeholder="Comma-separated options"
            aria-label="Select options"
            onBlur={(event: React.FocusEvent<HTMLInputElement>) =>
              store.updateField(board.id, field.id, {
                options: event.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </FieldRow>
      ) : null}
    </RuleCard>
  );
}

const ACTION_TYPES: Array<{ id: ActionType; label: string }> = [
  { id: "move-to-column", label: "Move to column" },
  { id: "set-priority", label: "Set priority" },
  { id: "add-label", label: "Add label" },
  { id: "remove-label", label: "Remove label" },
  { id: "assign", label: "Assign" },
  { id: "unassign", label: "Clear assignees" },
  { id: "set-due", label: "Set due (relative)" },
  { id: "set-field", label: "Set field" },
  { id: "complete", label: "Mark complete" },
  { id: "reopen", label: "Reopen" },
  { id: "archive", label: "Archive" },
  { id: "notify", label: "Notify (toast)" },
];

const OPS: Array<{ id: ConditionOp; label: string }> = [
  { id: "is", label: "is" },
  { id: "isNot", label: "is not" },
  { id: "contains", label: "contains" },
  { id: "isEmpty", label: "is empty" },
  { id: "isNotEmpty", label: "is not empty" },
  { id: "before", label: "is before" },
  { id: "after", label: "is after" },
];

const PRESETS: Array<{ label: string; build: (columns: Column[], board: Board) => Omit<AutomationRule, "id"> | null }> = [
  {
    label: "Complete cards moved to the done column",
    build: (columns) => {
      const done = columns.find((c) => c.isDone);
      return done ? { name: "Complete on done", enabled: true, trigger: { type: "card-moved", columnId: done.id }, conditions: [], actions: [{ type: "complete" }] } : null;
    },
  },
  {
    label: "Assign me when I move a card to the second column",
    build: (columns) => (columns[1] ? { name: "Assign on start", enabled: true, trigger: { type: "card-moved", columnId: columns[1].id }, conditions: [{ field: "assignees", op: "isEmpty" }], actions: [{ type: "assign", value: "me" }] } : null),
  },
  {
    label: "Mark overdue cards urgent",
    build: () => ({ name: "Escalate overdue", enabled: true, trigger: { type: "due-passed" }, conditions: [{ field: "completedAt", op: "isEmpty" }], actions: [{ type: "set-priority", value: "urgent" }, { type: "notify", message: "Overdue: {title}" }] }),
  },
  {
    label: "New cards get a due date in one week",
    build: () => ({ name: "Default deadline", enabled: true, trigger: { type: "card-created" }, conditions: [{ field: "dueAt", op: "isEmpty" }], actions: [{ type: "set-due", relative: "+1w" }] }),
  },
];

function AutomationsTab({ board, columns }: { board: Board; columns: Column[] }) {
  const { store } = useKanban();
  if (!store) return null;
  const rules = board.automations;
  const save = (next: AutomationRule[]) => store.setAutomations(board.id, next);
  const update = (ruleId: string, patch: Partial<AutomationRule>) => save(rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));

  return (
    <Stack $gap={10}>
      <Row $justify="space-between">
        <SectionTitle>Automations · run when cards change</SectionTitle>
        <Select
          aria-label="Add a preset rule"
          value=""
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
            const preset = PRESETS[Number(event.target.value)];
            const built = preset?.build(columns, board);
            if (!built) {
              toast.error("This preset needs a done column or a second column");
              return;
            }
            save([...rules, { ...built, id: makeId("rule") }]);
          }}
        >
          <option value="">Add preset…</option>
          {PRESETS.map((preset, index) => (
            <option key={preset.label} value={index}>
              {preset.label}
            </option>
          ))}
        </Select>
      </Row>
      {rules.length === 0 ? <Muted>No rules yet. Rules run on the client that makes the change; timed rules (due passed, start reached) run once per card on any open client.</Muted> : null}
      {rules.map((rule) => (
        <RuleCard key={rule.id}>
          <RuleHeader>
            <Toggle checked={rule.enabled} onChange={(checked: boolean) => update(rule.id, { enabled: checked })} title={rule.enabled ? "Disable" : "Enable"} />
            <InlineInput
              className="grow"
              defaultValue={rule.name}
              aria-label="Rule name"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value && value !== rule.name) update(rule.id, { name: value });
              }}
            />
            <IconButton title="Delete rule" aria-label={`Delete ${rule.name}`} onClick={() => save(rules.filter((r) => r.id !== rule.id))}>
              <Icon name="Trash2" size={12} />
            </IconButton>
          </RuleHeader>
          <Clause>
            <span className="kw">When</span>
            <Select aria-label="Trigger" value={rule.trigger.type} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => update(rule.id, { trigger: { type: event.target.value as TriggerType } })}>
              {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((type) => (
                <option key={type} value={type}>
                  {TRIGGER_LABELS[type]}
                </option>
              ))}
            </Select>
            {rule.trigger.type === "card-moved" ? (
              <Select aria-label="Target column" value={rule.trigger.columnId ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => update(rule.id, { trigger: { ...rule.trigger, columnId: event.target.value || undefined } })}>
                <option value="">any column</option>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </Select>
            ) : null}
            {rule.trigger.type === "field-changed" ? (
              <>
                <Select aria-label="Field" value={rule.trigger.field ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => update(rule.id, { trigger: { ...rule.trigger, field: event.target.value || undefined } })}>
                  <option value="">any field</option>
                  {CONDITION_FIELDS.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.label}
                    </option>
                  ))}
                  {board.fields.map((field) => (
                    <option key={field.id} value={`f:${field.id}`}>
                      {field.name}
                    </option>
                  ))}
                </Select>
                <Input aria-label="Becomes value" placeholder="to value (optional)" value={rule.trigger.value ?? ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => update(rule.id, { trigger: { ...rule.trigger, value: event.target.value || undefined } })} />
              </>
            ) : null}
          </Clause>
          {rule.conditions.map((condition, index) => (
            <Clause key={index}>
              <span className="kw">{index === 0 ? "If" : "and"}</span>
              <Select aria-label="Condition field" value={condition.field} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => update(rule.id, { conditions: replaceAt(rule.conditions, index, { ...condition, field: event.target.value }) })}>
                {CONDITION_FIELDS.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
                {board.fields.map((field) => (
                  <option key={field.id} value={`f:${field.id}`}>
                    {field.name}
                  </option>
                ))}
              </Select>
              <Select aria-label="Operator" value={condition.op} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => update(rule.id, { conditions: replaceAt(rule.conditions, index, { ...condition, op: event.target.value as ConditionOp }) })}>
                {OPS.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.label}
                  </option>
                ))}
              </Select>
              {condition.op !== "isEmpty" && condition.op !== "isNotEmpty" ? (
                <ConditionValueInput board={board} columns={columns} condition={condition} onChange={(value) => update(rule.id, { conditions: replaceAt(rule.conditions, index, { ...condition, value }) })} />
              ) : null}
              <IconButton title="Remove condition" aria-label="Remove condition" onClick={() => update(rule.id, { conditions: rule.conditions.filter((_, i) => i !== index) })}>
                <Icon name="X" size={12} />
              </IconButton>
            </Clause>
          ))}
          {rule.actions.map((action, index) => (
            <Clause key={index}>
              <span className="kw">{index === 0 ? "Then" : "and"}</span>
              <Select aria-label="Action" value={action.type} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => update(rule.id, { actions: replaceAt(rule.actions, index, { type: event.target.value as ActionType }) })}>
                {ACTION_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </Select>
              <ActionParams board={board} columns={columns} action={action} onChange={(next) => update(rule.id, { actions: replaceAt(rule.actions, index, next) })} />
              <IconButton title="Remove action" aria-label="Remove action" disabled={rule.actions.length === 1} onClick={() => update(rule.id, { actions: rule.actions.filter((_, i) => i !== index) })}>
                <Icon name="X" size={12} />
              </IconButton>
            </Clause>
          ))}
          <Row $gap={6} $wrap>
            <GhostButton type="button" onClick={() => update(rule.id, { conditions: [...rule.conditions, { field: "priority", op: "is", value: "high" }] })}>
              <Icon name="Plus" size={11} />
              Condition
            </GhostButton>
            <GhostButton type="button" onClick={() => update(rule.id, { actions: [...rule.actions, { type: "set-priority", value: "high" }] })}>
              <Icon name="Plus" size={11} />
              Action
            </GhostButton>
            <span style={{ flex: 1 }} />
            <Muted>
              {describeTrigger(rule, columns)} → {rule.actions.map((action) => describeAction(action, board, columns)).join(", ")}
            </Muted>
          </Row>
        </RuleCard>
      ))}
      <GhostButton
        type="button"
        onClick={() => save([...rules, { id: makeId("rule"), name: "New rule", enabled: true, trigger: { type: "card-moved", columnId: columns[columns.length - 1]?.id }, conditions: [], actions: [{ type: "complete" }] }])}
      >
        <Icon name="Plus" size={12} />
        New rule
      </GhostButton>
    </Stack>
  );
}

function replaceAt<T>(list: T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

function ConditionValueInput({ board, columns, condition, onChange }: { board: Board; columns: Column[]; condition: AutomationCondition; onChange: (value: string) => void }) {
  if (condition.field === "priority") {
    return (
      <Select aria-label="Value" value={condition.value ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}>
        {PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {priorityLabel(priority)}
          </option>
        ))}
      </Select>
    );
  }
  if (condition.field === "columnId") {
    return (
      <Select aria-label="Value" value={condition.value ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}>
        <option value="">—</option>
        {columns.map((column) => (
          <option key={column.id} value={column.id}>
            {column.name}
          </option>
        ))}
      </Select>
    );
  }
  if (condition.field === "labels") {
    return (
      <Select aria-label="Value" value={condition.value ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}>
        <option value="">—</option>
        {board.labels.map((label) => (
          <option key={label.id} value={label.id}>
            {label.name}
          </option>
        ))}
      </Select>
    );
  }
  const placeholder = condition.op === "before" || condition.op === "after" ? "now, +3d, 2026-12-01" : "value";
  return <Input aria-label="Value" placeholder={placeholder} value={condition.value ?? ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} />;
}

function ActionParams({ board, columns, action, onChange }: { board: Board; columns: Column[]; action: AutomationAction; onChange: (next: AutomationAction) => void }) {
  switch (action.type) {
    case "move-to-column":
      return (
        <Select aria-label="Column" value={action.columnId ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...action, columnId: event.target.value || undefined })}>
          <option value="">choose column</option>
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </Select>
      );
    case "set-priority":
      return (
        <Select aria-label="Priority" value={action.value ?? "none"} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...action, value: event.target.value })}>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priorityLabel(priority)}
            </option>
          ))}
        </Select>
      );
    case "add-label":
    case "remove-label":
      return (
        <Select aria-label="Label" value={action.labelId ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...action, labelId: event.target.value || undefined })}>
          <option value="">choose label</option>
          {board.labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </Select>
      );
    case "assign":
      return <Input aria-label="Who" placeholder="me or a name" value={action.value ?? "me"} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...action, value: event.target.value })} />;
    case "set-due":
      return <Input aria-label="Relative due" placeholder="+3d, +1w, +2h, clear" value={action.relative ?? "+3d"} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...action, relative: event.target.value })} />;
    case "set-field":
      return (
        <>
          <Select aria-label="Field" value={action.field ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...action, field: event.target.value || undefined })}>
            <option value="">choose field</option>
            <option value="title">Title</option>
            <option value="estimate">Estimate</option>
            <option value="cover">Cover</option>
            {board.fields.map((field) => (
              <option key={field.id} value={`f:${field.id}`}>
                {field.name}
              </option>
            ))}
          </Select>
          <Input aria-label="Value" placeholder="value" value={action.value ?? ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...action, value: event.target.value })} />
        </>
      );
    case "notify":
      return <Input aria-label="Message" placeholder="Message · {title} inserts the card title" value={action.message ?? ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...action, message: event.target.value })} />;
    default:
      return null;
  }
}

function DisplayTab({ board }: { board: Board }) {
  const { store } = useKanban();
  if (!store) return null;
  const display = board.display;
  const set = (patch: Partial<BoardDisplay>) => store.updateBoard(board.id, { display: { ...display, ...patch } });
  const toggles: Array<{ key: keyof BoardDisplay; label: string }> = [
    { key: "showLabels", label: "Labels" },
    { key: "showAssignees", label: "Assignees" },
    { key: "showDue", label: "Due dates" },
    { key: "showPriority", label: "Priority" },
    { key: "showEstimate", label: "Estimates" },
    { key: "showChecklist", label: "Checklist progress" },
    { key: "showComments", label: "Comment count" },
    { key: "showCover", label: "Cover color" },
    { key: "showCardIds", label: "Card numbers" },
    { key: "showCompleted", label: "Completed cards" },
  ];
  return (
    <Stack $gap={10}>
      <SectionTitle>Cards show</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "2px 16px" }}>
        {toggles.map((item) => (
          <ToggleRow key={item.key}>
            <span>{item.label}</span>
            <Toggle checked={Boolean(display[item.key])} onChange={(checked: boolean) => set({ [item.key]: checked } as Partial<BoardDisplay>)} />
          </ToggleRow>
        ))}
      </div>
      <FieldRow>
        <label>Density</label>
        <SegmentGroup>
          <Segment type="button" $active={display.density === "comfortable"} onClick={() => set({ density: "comfortable" })}>
            Comfortable
          </Segment>
          <Segment type="button" $active={display.density === "compact"} onClick={() => set({ density: "compact" })}>
            Compact
          </Segment>
        </SegmentGroup>
      </FieldRow>
      <FieldRow>
        <label>Column width</label>
        <Row $gap={8}>
          <input type="range" min={200} max={420} step={8} value={display.columnWidth} aria-label="Column width" onChange={(event) => set({ columnWidth: Number(event.target.value) })} style={{ flex: 1 }} />
          <Muted style={{ fontFamily: t.fontMono, minWidth: 44, textAlign: "right" }}>{display.columnWidth}px</Muted>
        </Row>
      </FieldRow>
      <FieldRow>
        <label>Swimlanes</label>
        <Row $gap={6}>
          <Select aria-label="Swimlanes" value={display.swimlane} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => set({ swimlane: event.target.value as BoardDisplay["swimlane"], swimlaneFieldId: event.target.value === "field" ? display.swimlaneFieldId ?? board.fields[0]?.id : display.swimlaneFieldId })} style={{ flex: 1 }}>
            <option value="none">None</option>
            <option value="assignee">By assignee</option>
            <option value="priority">By priority</option>
            <option value="label">By label</option>
            {board.fields.length ? <option value="field">By field</option> : null}
          </Select>
          {display.swimlane === "field" ? (
            <Select aria-label="Swimlane field" value={display.swimlaneFieldId ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => set({ swimlaneFieldId: event.target.value })} style={{ flex: 1 }}>
              {board.fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </Select>
          ) : null}
        </Row>
      </FieldRow>
      <Muted>Display settings are shared by everyone viewing this board. Personal filters and collapsed columns stay private.</Muted>
    </Stack>
  );
}

function DataTab({ board }: { board: Board }) {
  const { store } = useKanban();
  const fileRef = useRef<HTMLInputElement>(null);
  if (!store) return null;
  const slug = board.name.replace(/[^\w-]+/g, "-").toLowerCase();
  const cards = [...(store.getDerived().cardsByBoard[board.id] ?? []), ...(store.getDerived().archivedByBoard[board.id] ?? [])];
  return (
    <Stack $gap={10}>
      <SectionTitle>Export</SectionTitle>
      <Row $gap={6} $wrap>
        <Button
          $variant="secondary"
          $compact
          onClick={() => {
            const exported = store.exportBoard(board.id);
            if (exported) downloadText(`${slug}.kanban.json`, JSON.stringify(exported, null, 2), "application/json");
          }}
        >
          <Icon name="Download" size={12} /> Board JSON
        </Button>
        <Button $variant="secondary" $compact onClick={() => downloadText(`${slug}.csv`, cardsToCsv(cards, store.snapshot.boards, store.snapshot.columns), "text/csv")}>
          <Icon name="Download" size={12} /> Cards CSV
        </Button>
        <Button $variant="secondary" $compact onClick={() => downloadText(`${slug}.ics`, cardsToIcs(cards, store.snapshot.boards, store.snapshot.columns), "text/calendar")}>
          <Icon name="Calendar" size={12} /> Due dates ICS
        </Button>
      </Row>
      <SectionTitle>Import</SectionTitle>
      <Row $gap={6} $wrap>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              const payload = JSON.parse(await file.text()) as ExportedBoard;
              const id = store.importBoard(payload);
              if (id) toast.success(`Imported “${payload.board?.name ?? "board"}” as a new board`);
              else toast.error("That file is not a kanban board export");
            } catch {
              toast.error("Could not read that file");
            }
          }}
        />
        <Button $variant="secondary" $compact onClick={() => fileRef.current?.click()}>
          <Icon name="Upload" size={12} /> Import board JSON
        </Button>
        <Button
          $variant="secondary"
          $compact
          onClick={() => {
            const exported = store.exportBoard(board.id);
            if (exported) {
              store.importBoard(exported, `${board.name} (copy)`);
              toast.success("Board duplicated");
            }
          }}
        >
          <Icon name="Copy" size={12} /> Duplicate board
        </Button>
      </Row>
      <Muted>Imports always create a new board so nothing existing is overwritten. Board JSON includes columns, cards, comments, labels, fields and automations.</Muted>
    </Stack>
  );
}
