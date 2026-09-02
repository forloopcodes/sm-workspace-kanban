import { addDays, addMonthsClamped, addYearsClamped, atNoon, hasTime, parseStored, toDayKey } from "./dates";
import type { Recurrence } from "./types";

/** Next occurrence strictly after `from` (a local Date), or null when the series ended. */
export function nextOccurrence(recurrence: Recurrence, from: Date): Date | null {
  const interval = Math.max(1, Math.floor(recurrence.interval || 1));
  const until = recurrence.until ? parseStored(recurrence.until) : null;
  let next: Date | null = null;
  switch (recurrence.frequency) {
    case "daily":
      next = addDays(from, interval);
      break;
    case "weekly": {
      const weekdays = (recurrence.weekdays ?? []).filter((d) => d >= 0 && d <= 6).sort();
      if (weekdays.length === 0) {
        next = addDays(from, 7 * interval);
        break;
      }
      // Walk forward day by day (max ~ interval*7 + 7 steps) honouring the week interval.
      const anchorWeekStart = startOfWeekMonday(from);
      for (let step = 1; step <= 7 * interval + 7; step += 1) {
        const candidate = addDays(from, step);
        const weeksApart = Math.round((startOfWeekMonday(candidate).getTime() - anchorWeekStart.getTime()) / (7 * 86_400_000));
        if (weeksApart % interval !== 0) continue;
        if (weekdays.includes(candidate.getDay())) {
          next = candidate;
          break;
        }
      }
      break;
    }
    case "monthly":
      next = addMonthsClamped(from, interval);
      break;
    case "yearly":
      next = addYearsClamped(from, interval);
      break;
    default:
      return null;
  }
  if (!next) return null;
  if (until && atNoon(next) > atNoon(until)) return null;
  // Preserve the original time of day.
  next.setHours(from.getHours(), from.getMinutes(), 0, 0);
  return next;
}

function startOfWeekMonday(date: Date): Date {
  const next = atNoon(date);
  const diff = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - diff);
  return next;
}

/** Shift a stored due/start value to the next occurrence, keeping date-only vs date-time form. */
export function nextStoredOccurrence(recurrence: Recurrence, stored: string | null, fallback: Date): string | null {
  const base = parseStored(stored) ?? fallback;
  const next = nextOccurrence(recurrence, base);
  if (!next) return null;
  return hasTime(stored) ? next.toISOString() : toDayKey(next);
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeRecurrence(recurrence: Recurrence | null | undefined): string {
  if (!recurrence) return "Does not repeat";
  const n = Math.max(1, recurrence.interval || 1);
  let text: string;
  switch (recurrence.frequency) {
    case "daily":
      text = n === 1 ? "Daily" : `Every ${n} days`;
      break;
    case "weekly": {
      const days = (recurrence.weekdays ?? []).map((d) => WEEKDAY_NAMES[d]).join(", ");
      text = n === 1 ? "Weekly" : `Every ${n} weeks`;
      if (days) text += ` on ${days}`;
      break;
    }
    case "monthly":
      text = n === 1 ? "Monthly" : `Every ${n} months`;
      break;
    case "yearly":
      text = n === 1 ? "Yearly" : `Every ${n} years`;
      break;
    default:
      text = "Repeats";
  }
  if (recurrence.until) text += ` until ${recurrence.until}`;
  return text;
}
