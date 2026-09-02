/**
 * Date helpers. Dates are stored as ISO strings. Date-only values use the
 * `YYYY-MM-DD` form; date-times use full ISO with offset. Day math anchors at
 * noon so DST transitions never shift a day.
 */

export const DAY_MS = 86_400_000;

export function atNoon(date: Date): Date {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(date: Date, days: number): Date {
  const next = atNoon(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function addMonthsClamped(date: Date, months: number): Date {
  const next = atNoon(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

export function addYearsClamped(date: Date, years: number): Date {
  return addMonthsClamped(date, years * 12);
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  const next = atNoon(date);
  const diff = (next.getDay() - weekStartsOn + 7) % 7;
  next.setDate(next.getDate() - diff);
  return next;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((atNoon(b).getTime() - atNoon(a).getTime()) / DAY_MS);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function isDayKey(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Parse a stored due/start value into a local Date (noon for date-only). */
export function parseStored(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (isDayKey(value)) return fromDayKey(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function hasTime(value: string | null | undefined): boolean {
  return Boolean(value) && !isDayKey(value ?? "");
}

/** Store a date: date-only if `time` false, else full ISO. */
export function toStored(date: Date, withTime: boolean): string {
  return withTime ? date.toISOString() : toDayKey(date);
}

/** Effective deadline instant for sorting/overdue: date-only values expire at end of day. */
export function deadlineMs(value: string | null | undefined): number | null {
  const date = parseStored(value);
  if (!date) return null;
  if (isDayKey(value ?? "")) {
    const end = startOfDay(date);
    end.setDate(end.getDate() + 1);
    return end.getTime() - 1;
  }
  return date.getTime();
}

export function isOverdue(value: string | null | undefined, now = new Date()): boolean {
  const ms = deadlineMs(value);
  return ms !== null && ms < now.getTime();
}

export type ScheduleBucket = "overdue" | "today" | "tomorrow" | "week" | "nextWeek" | "later" | "none";

export const SCHEDULE_BUCKETS: ScheduleBucket[] = ["overdue", "today", "tomorrow", "week", "nextWeek", "later", "none"];

export const BUCKET_LABELS: Record<ScheduleBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  nextWeek: "Next week",
  later: "Later",
  none: "No date",
};

export function bucketFor(value: string | null | undefined, now = new Date(), weekStartsOn: 0 | 1 = 1): ScheduleBucket {
  const date = parseStored(value);
  if (!date) return "none";
  if (isOverdue(value, now)) return "overdue";
  const today = atNoon(now);
  const diff = daysBetween(today, date);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  const weekEnd = addDays(startOfWeek(today, weekStartsOn), 6);
  if (atNoon(date) <= weekEnd) return "week";
  const nextWeekEnd = addDays(weekEnd, 7);
  if (atNoon(date) <= nextWeekEnd) return "nextWeek";
  return "later";
}

/** Representative date for a bucket, used when dragging a task into it. */
export function bucketDate(bucket: ScheduleBucket, now = new Date(), weekStartsOn: 0 | 1 = 1): Date | null {
  const today = atNoon(now);
  switch (bucket) {
    case "today":
      return today;
    case "tomorrow":
      return addDays(today, 1);
    case "week": {
      const end = addDays(startOfWeek(today, weekStartsOn), 6);
      return end > addDays(today, 1) ? end : addDays(today, 2);
    }
    case "nextWeek":
      return addDays(startOfWeek(today, weekStartsOn), 7);
    case "later":
      return addDays(startOfWeek(today, weekStartsOn), 14);
    case "overdue":
      return addDays(today, -1);
    default:
      return null;
  }
}

const RELATIVE_RE = /^([+-]?)(\d+)\s*([dwmyh])$/i;

/** Resolve "+3d", "1w", "-2h" style offsets from `from`. */
export function applyRelative(spec: string, from = new Date()): Date | null {
  const match = spec.trim().match(RELATIVE_RE);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const amount = Number(match[2]) * sign;
  switch (match[3].toLowerCase()) {
    case "d":
      return addDays(from, amount);
    case "w":
      return addWeeks(from, amount);
    case "m":
      return addMonthsClamped(from, amount);
    case "y":
      return addYearsClamped(from, amount);
    case "h": {
      const next = new Date(from);
      next.setHours(next.getHours() + amount);
      return next;
    }
    default:
      return null;
  }
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Compact human label: "Today", "Tomorrow", "Wed", "Sep 14", "Sep 14, 2027", with time when present. */
export function formatDue(value: string | null | undefined, now = new Date()): string {
  const date = parseStored(value);
  if (!date) return "";
  const today = atNoon(now);
  const diff = daysBetween(today, date);
  let day: string;
  if (diff === 0) day = "Today";
  else if (diff === 1) day = "Tomorrow";
  else if (diff === -1) day = "Yesterday";
  else if (diff > 1 && diff < 7) day = WEEKDAY_SHORT[date.getDay()];
  else if (date.getFullYear() === today.getFullYear()) day = `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`;
  else day = `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  return hasTime(value) ? `${day} · ${formatTime(date)}` : day;
}

export function formatDateLong(date: Date): string {
  return `${WEEKDAY_SHORT[date.getDay()]}, ${MONTH_LONG[date.getMonth()]} ${date.getDate()}`;
}

export function formatMonthYear(date: Date): string {
  return `${MONTH_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatRelative(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - then);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDue(iso, now);
}

export function formatEstimate(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return "";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1).replace(/\.0$/, "")}h`;
}

/** Combine a day and an optional "HH:MM" time into a stored value. */
export function combineDayAndTime(day: Date, time: string | null): string {
  if (!time) return toDayKey(day);
  const [h, m] = time.split(":").map(Number);
  const next = new Date(day);
  next.setHours(h || 0, m || 0, 0, 0);
  return next.toISOString();
}

export function timeInputValue(value: string | null | undefined): string {
  const date = parseStored(value);
  if (!date || !hasTime(value)) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
