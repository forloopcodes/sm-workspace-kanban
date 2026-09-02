import { useState } from "react";
import styled from "styled-components";
import { Checkbox, Dropdown, DropdownItem, DropdownSeparator, Icon, Input, Select, UserAvatar, t } from "@soft-machine/sdk";
import { priorityLabel, toneColor } from "../../state/tones";
import { PRIORITIES, TONES, type Assignee, type Label, type Priority, type Recurrence, type Tone } from "../../state/types";
import { Chip, GhostButton, PickerButton, PriorityIcon, Row, ToneDot } from "../../ui/shared";

const MenuBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  max-height: 280px;
  overflow-y: auto;
`;

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  padding: 0 6px;
  border-radius: ${t.radius};
  font-size: ${t.typography.sm};
  color: ${t.text.primary};
  cursor: pointer;
  &:hover {
    background: ${t.bg.tertiary};
  }
  & > span {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const CreateRow = styled.form`
  display: flex;
  gap: 4px;
  padding: 4px 6px 2px;
`;

const ToneRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const ToneSwatch = styled.button<{ $tone: Tone; $selected?: boolean }>`
  width: 18px;
  height: 18px;
  padding: 0;
  border: 2px solid ${({ $selected, $tone }) => ($selected ? toneColor($tone) : "transparent")};
  border-radius: 50%;
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
  &::after {
    content: "";
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${({ $tone }) => toneColor($tone)};
  }
`;

const WeekdayButton = styled.button<{ $active?: boolean }>`
  width: 24px;
  height: 24px;
  padding: 0;
  border: ${t.borderWidth} solid ${({ $active }) => ($active ? t.accent.primary : t.border)};
  border-radius: 50%;
  font: inherit;
  font-size: ${t.typography.xs};
  color: ${({ $active }) => ($active ? t.accent.text : t.text.muted)};
  background: ${({ $active }) => ($active ? t.accent.primary : "transparent")};
  cursor: pointer;
`;

export function ToneSwatches({ value, onChange, allowNone }: { value: Tone | null; onChange: (tone: Tone | null) => void; allowNone?: boolean }) {
  return (
    <ToneRow role="radiogroup">
      {allowNone ? (
        <GhostButton type="button" $active={value === null} onClick={() => onChange(null)} style={{ height: 18, padding: "0 6px" }}>
          None
        </GhostButton>
      ) : null}
      {TONES.map((tone) => (
        <ToneSwatch key={tone} type="button" role="radio" aria-checked={value === tone} aria-label={tone} title={tone} $tone={tone} $selected={value === tone} onClick={() => onChange(tone)} />
      ))}
    </ToneRow>
  );
}

export function LabelPicker({
  labels,
  selected,
  onToggle,
  onCreate,
  compact,
}: {
  labels: Label[];
  selected: string[];
  onToggle: (labelId: string) => void;
  onCreate?: (name: string) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const chosen = labels.filter((label) => selected.includes(label.id));
  return (
    <Dropdown
      minWidth={220}
      trigger={
        <PickerButton type="button" $filled={chosen.length > 0} aria-label="Labels">
          <Icon name="Hash" size={12} />
          <span>{chosen.length === 0 ? "Add labels" : compact ? `${chosen.length} labels` : chosen.map((l) => l.name).join(", ")}</span>
        </PickerButton>
      }
    >
      <MenuBody>
        {labels.length === 0 ? <div style={{ padding: "6px 8px", color: t.text.muted, fontSize: t.typography.sm }}>No labels on this board yet.</div> : null}
        {labels.map((label) => (
          <CheckRow key={label.id}>
            <Checkbox checked={selected.includes(label.id)} onChange={() => onToggle(label.id)} aria-label={label.name} />
            <ToneDot $tone={label.tone} />
            <span>{label.name}</span>
          </CheckRow>
        ))}
        {onCreate ? (
          <>
            <DropdownSeparator />
            <CreateRow
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim()) onCreate(draft.trim());
                setDraft("");
              }}
            >
              <Input value={draft} placeholder="New label" aria-label="New label name" onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)} $fullWidth />
              <GhostButton type="submit" disabled={!draft.trim()}>
                Add
              </GhostButton>
            </CreateRow>
          </>
        ) : null}
      </MenuBody>
    </Dropdown>
  );
}

export function AssigneePicker({
  members,
  selected,
  onToggle,
  viewer,
  compact,
}: {
  members: Assignee[];
  selected: Assignee[];
  onToggle: (member: Assignee) => void;
  viewer: Assignee | null;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const list = [...(viewer && !members.some((m) => m.id === viewer.id) ? [viewer] : []), ...members].filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <Dropdown
      minWidth={220}
      trigger={
        <PickerButton type="button" $filled={selected.length > 0} aria-label="Assignees">
          <Icon name="User" size={12} />
          <span>{selected.length === 0 ? "Assign" : compact ? `${selected.length} assigned` : selected.map((a) => a.name).join(", ")}</span>
        </PickerButton>
      }
    >
      <MenuBody>
        <div style={{ padding: "2px 4px 4px" }}>
          <Input value={query} placeholder="Search people" aria-label="Search people" onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} $fullWidth />
        </div>
        {list.length === 0 ? <div style={{ padding: "6px 8px", color: t.text.muted, fontSize: t.typography.sm }}>Nobody matches.</div> : null}
        {list.map((member) => {
          const checked = selected.some((a) => a.id === member.id);
          return (
            <CheckRow key={member.id}>
              <Checkbox checked={checked} onChange={() => onToggle(member)} aria-label={member.name} />
              <UserAvatar name={member.name} avatarUrl={member.avatarUrl ?? null} size={16} />
              <span>
                {member.name}
                {viewer && member.id === viewer.id ? " (you)" : ""}
              </span>
            </CheckRow>
          );
        })}
        {query.trim() && !list.some((m) => m.name.toLowerCase() === query.trim().toLowerCase()) ? (
          <>
            <DropdownSeparator />
            <DropdownItem
              icon={<Icon name="Plus" size={12} />}
              onClick={() => {
                onToggle({ id: `name:${query.trim()}`, name: query.trim() });
                setQuery("");
              }}
            >
              Add “{query.trim()}”
            </DropdownItem>
          </>
        ) : null}
      </MenuBody>
    </Dropdown>
  );
}

export function PrioritySelect({ value, onChange }: { value: Priority; onChange: (value: Priority) => void }) {
  return (
    <Row $gap={6}>
      <PriorityIcon priority={value} size={12} />
      <Select aria-label="Priority" value={value} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as Priority)} style={{ flex: 1 }}>
        {PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {priorityLabel(priority)}
          </option>
        ))}
      </Select>
    </Row>
  );
}

const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

export function RecurrenceEditor({ value, onChange }: { value: Recurrence | null; onChange: (value: Recurrence | null) => void }) {
  const frequency = value?.frequency ?? "none";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Row $gap={6}>
        <Select
          aria-label="Repeat"
          value={frequency}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
            const next = event.target.value;
            if (next === "none") onChange(null);
            else onChange({ frequency: next as Recurrence["frequency"], interval: value?.interval ?? 1, weekdays: next === "weekly" ? value?.weekdays ?? [] : undefined, until: value?.until ?? null });
          }}
          style={{ flex: 1 }}
        >
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </Select>
        {value ? (
          <Row $gap={4} style={{ flex: "0 0 auto" }}>
            <span style={{ color: t.text.muted, fontSize: t.typography.sm }}>every</span>
            <Input
              type="number"
              min={1}
              max={365}
              aria-label="Interval"
              value={value.interval}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, interval: Math.max(1, Number(event.target.value) || 1) })}
              style={{ width: 56 }}
            />
          </Row>
        ) : null}
      </Row>
      {value?.frequency === "weekly" ? (
        <Row $gap={4}>
          {WEEKDAY_SHORT.map((letter, day) => {
            const active = (value.weekdays ?? []).includes(day);
            return (
              <WeekdayButton
                key={day}
                type="button"
                $active={active}
                aria-pressed={active}
                aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]}
                onClick={() => onChange({ ...value, weekdays: active ? (value.weekdays ?? []).filter((d) => d !== day) : [...(value.weekdays ?? []), day].sort() })}
              >
                {letter}
              </WeekdayButton>
            );
          })}
        </Row>
      ) : null}
      {value ? (
        <Row $gap={6}>
          <span style={{ color: t.text.muted, fontSize: t.typography.sm, flex: "0 0 auto" }}>until</span>
          <Input type="date" aria-label="Repeat until" value={value.until ?? ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, until: event.target.value || null })} style={{ flex: 1 }} />
        </Row>
      ) : null}
    </div>
  );
}

const REMINDER_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "No reminder" },
  { value: 0, label: "At due time" },
  { value: 10, label: "10 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 180, label: "3 hours before" },
  { value: 1440, label: "1 day before" },
  { value: 2880, label: "2 days before" },
];

export function ReminderSelect({ value, onChange, disabled }: { value: number | null; onChange: (value: number | null) => void; disabled?: boolean }) {
  return (
    <Select aria-label="Reminder" value={value === null ? "" : String(value)} disabled={disabled} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value === "" ? null : Number(event.target.value))}>
      {REMINDER_OPTIONS.map((option) => (
        <option key={String(option.value)} value={option.value === null ? "" : String(option.value)}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export function LabelChips({ labels, ids }: { labels: Label[]; ids: string[] }) {
  const chosen = labels.filter((label) => ids.includes(label.id));
  if (chosen.length === 0) return null;
  return (
    <Row $gap={4} $wrap>
      {chosen.map((label) => (
        <Chip key={label.id} $tone={label.tone}>
          {label.name}
        </Chip>
      ))}
    </Row>
  );
}
