import { useMemo, useState } from "react";
import styled from "styled-components";
import { Dropdown, Icon, Input, t } from "@soft-machine/sdk";
import {
  MONTH_LONG,
  WEEKDAY_LETTERS,
  addDays,
  addMonthsClamped,
  atNoon,
  combineDayAndTime,
  formatDue,
  fromDayKey,
  hasTime,
  isSameDay,
  parseStored,
  startOfWeek,
  timeInputValue,
  toDayKey,
} from "../state/dates";
import { GhostButton, PickerButton, Row } from "./shared";

const Panel = styled.div`
  width: 248px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Presets = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const MonthHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: ${t.typography.sm};
  font-weight: 500;
  color: ${t.text.primary};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
`;

const DayLabel = styled.div`
  text-align: center;
  font-size: ${t.typography.xs};
  color: ${t.text.muted};
`;

const DayCell = styled.button<{ $outside?: boolean; $today?: boolean; $selected?: boolean }>`
  height: 26px;
  border: none;
  border-radius: ${t.radius};
  font: inherit;
  font-size: ${t.typography.sm};
  font-variant-numeric: tabular-nums;
  color: ${({ $outside, $selected }) => ($selected ? t.accent.text : $outside ? t.text.muted : t.text.primary)};
  background: ${({ $selected, $today }) => ($selected ? t.accent.primary : $today ? `rgba(${t.accent.primaryRgb}, 0.12)` : "transparent")};
  cursor: pointer;
  &:hover {
    background: ${({ $selected }) => ($selected ? t.accent.primary : t.bg.tertiary)};
  }
`;

const NavButton = styled.button`
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: ${t.radius};
  color: ${t.text.muted};
  background: transparent;
  cursor: pointer;
  &:hover {
    color: ${t.text.primary};
    background: ${t.bg.tertiary};
  }
`;

const TimeInput = styled(Input)`
  width: 104px;
`;

export interface DatePickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowTime?: boolean;
  weekStartsOn?: 0 | 1;
  icon?: "Calendar" | "Clock" | "Play";
  align?: "start" | "end";
  compact?: boolean;
  ariaLabel?: string;
  /** Render a custom trigger instead of the default button. */
  trigger?: (state: { open: boolean; label: string }) => JSX.Element;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Set date",
  allowTime = true,
  weekStartsOn = 1,
  icon = "Calendar",
  align = "start",
  compact,
  ariaLabel,
  trigger,
}: DatePickerProps) {
  const selected = parseStored(value);
  const [month, setMonth] = useState(() => atNoon(selected ?? new Date()));
  const [open, setOpen] = useState(false);
  const today = atNoon(new Date());
  const label = value ? formatDue(value) : placeholder;

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const start = startOfWeek(first, weekStartsOn);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [month, weekStartsOn]);

  const pick = (day: Date) => {
    const time = allowTime && hasTime(value) ? timeInputValue(value) : null;
    onChange(combineDayAndTime(day, time || null));
  };

  const weekdayLetters = weekStartsOn === 1 ? [...WEEKDAY_LETTERS.slice(1), WEEKDAY_LETTERS[0]] : WEEKDAY_LETTERS;

  return (
    <Dropdown
      align={align}
      minWidth={248}
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (next) setMonth(atNoon(parseStored(value) ?? new Date()));
      }}
      trigger={
        trigger ? (
          trigger({ open, label })
        ) : (
          <PickerButton type="button" $filled={Boolean(value)} aria-label={ariaLabel ?? placeholder} title={label}>
            <Icon name={icon} size={12} />
            {compact && !value ? null : <span>{label}</span>}
          </PickerButton>
        )
      }
    >
      {({ close }: { close: () => void }) => (
        <Panel onMouseDown={(event) => event.stopPropagation()}>
          <Presets>
            <GhostButton type="button" onClick={() => { pick(today); close(); }}>
              Today
            </GhostButton>
            <GhostButton type="button" onClick={() => { pick(addDays(today, 1)); close(); }}>
              Tomorrow
            </GhostButton>
            <GhostButton
              type="button"
              onClick={() => {
                const monday = addDays(startOfWeek(today, 1), 7);
                pick(monday);
                close();
              }}
            >
              Next week
            </GhostButton>
            <GhostButton type="button" onClick={() => { pick(addDays(today, 7)); close(); }}>
              +1 week
            </GhostButton>
          </Presets>
          <MonthHeader>
            <NavButton type="button" aria-label="Previous month" onClick={() => setMonth((m) => addMonthsClamped(new Date(m.getFullYear(), m.getMonth(), 1, 12), -1))}>
              <Icon name="ChevronLeft" size={12} />
            </NavButton>
            <span>
              {MONTH_LONG[month.getMonth()]} {month.getFullYear()}
            </span>
            <NavButton type="button" aria-label="Next month" onClick={() => setMonth((m) => addMonthsClamped(new Date(m.getFullYear(), m.getMonth(), 1, 12), 1))}>
              <Icon name="ChevronRight" size={12} />
            </NavButton>
          </MonthHeader>
          <Grid role="grid">
            {weekdayLetters.map((letter, index) => (
              <DayLabel key={`${letter}-${index}`} aria-hidden>
                {letter}
              </DayLabel>
            ))}
            {days.map((day) => (
              <DayCell
                key={toDayKey(day)}
                type="button"
                $outside={day.getMonth() !== month.getMonth()}
                $today={isSameDay(day, today)}
                $selected={selected ? isSameDay(day, selected) : false}
                aria-label={day.toDateString()}
                aria-pressed={selected ? isSameDay(day, selected) : false}
                onClick={() => {
                  pick(day);
                  if (!allowTime) close();
                }}
              >
                {day.getDate()}
              </DayCell>
            ))}
          </Grid>
          {allowTime ? (
            <Row $justify="space-between">
              <Row>
                <Icon name="Clock" size={12} />
                <TimeInput
                  type="time"
                  aria-label="Time"
                  value={timeInputValue(value)}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    const day = selected ?? today;
                    onChange(combineDayAndTime(day, event.target.value || null));
                  }}
                />
              </Row>
              <GhostButton
                type="button"
                onClick={() => {
                  onChange(null);
                  close();
                }}
                disabled={!value}
              >
                Clear
              </GhostButton>
            </Row>
          ) : (
            <Row $justify="flex-end">
              <GhostButton
                type="button"
                onClick={() => {
                  onChange(null);
                  close();
                }}
                disabled={!value}
              >
                Clear
              </GhostButton>
            </Row>
          )}
        </Panel>
      )}
    </Dropdown>
  );
}

export function MiniMonth({
  value,
  onSelect,
  weekStartsOn = 1,
  markers,
}: {
  value: Date;
  onSelect: (day: Date) => void;
  weekStartsOn?: 0 | 1;
  markers?: Set<string>;
}) {
  const [month, setMonth] = useState(() => atNoon(value));
  const today = atNoon(new Date());
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const start = startOfWeek(first, weekStartsOn);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [month, weekStartsOn]);
  const weekdayLetters = weekStartsOn === 1 ? [...WEEKDAY_LETTERS.slice(1), WEEKDAY_LETTERS[0]] : WEEKDAY_LETTERS;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <MonthHeader>
        <span>
          {MONTH_LONG[month.getMonth()]} {month.getFullYear()}
        </span>
        <Row $gap={2}>
          <NavButton type="button" aria-label="Previous month" onClick={() => setMonth((m) => addMonthsClamped(new Date(m.getFullYear(), m.getMonth(), 1, 12), -1))}>
            <Icon name="ChevronLeft" size={12} />
          </NavButton>
          <NavButton type="button" aria-label="Next month" onClick={() => setMonth((m) => addMonthsClamped(new Date(m.getFullYear(), m.getMonth(), 1, 12), 1))}>
            <Icon name="ChevronRight" size={12} />
          </NavButton>
        </Row>
      </MonthHeader>
      <Grid>
        {weekdayLetters.map((letter, index) => (
          <DayLabel key={`${letter}-${index}`} aria-hidden>
            {letter}
          </DayLabel>
        ))}
        {days.map((day) => {
          const key = toDayKey(day);
          return (
            <DayCell
              key={key}
              type="button"
              $outside={day.getMonth() !== month.getMonth()}
              $today={isSameDay(day, today)}
              $selected={isSameDay(day, value)}
              aria-label={day.toDateString()}
              onClick={() => onSelect(day)}
              style={markers?.has(key) ? { textDecoration: "underline", textDecorationColor: t.accent.primary } : undefined}
            >
              {day.getDate()}
            </DayCell>
          );
        })}
      </Grid>
    </div>
  );
}

export { fromDayKey };
