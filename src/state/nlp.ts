import { addDays, addWeeks, atNoon, startOfWeek, toDayKey } from "./dates";
import type { Assignee, Label, Priority } from "./types";

export interface QuickAddContext {
  now?: Date;
  labels?: Label[];
  members?: Assignee[];
  viewer?: Assignee | null;
  weekStartsOn?: 0 | 1;
}

export interface QuickAddResult {
  title: string;
  dueAt: string | null;
  startAt: string | null;
  priority: Priority | null;
  labelIds: string[];
  newLabels: string[];
  assignees: Assignee[];
  estimate: number | null;
  /** Human-readable chips describing what was parsed, in source order. */
  chips: Array<{ kind: "due" | "start" | "priority" | "label" | "assignee" | "estimate"; text: string }>;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const PRIORITY_WORDS: Record<string, Priority> = {
  urgent: "urgent",
  p0: "urgent",
  p1: "urgent",
  critical: "urgent",
  high: "high",
  p2: "high",
  medium: "medium",
  med: "medium",
  normal: "medium",
  p3: "medium",
  low: "low",
  p4: "low",
  none: "none",
};

interface TimeMatch {
  hours: number;
  minutes: number;
}

function parseTime(raw: string): TimeMatch | null {
  const text = raw.trim().toLowerCase();
  if (text === "noon") return { hours: 12, minutes: 0 };
  if (text === "midnight") return { hours: 0, minutes: 0 };
  if (text === "eod") return { hours: 17, minutes: 0 };
  if (text === "morning") return { hours: 9, minutes: 0 };
  if (text === "afternoon") return { hours: 14, minutes: 0 };
  if (text === "evening") return { hours: 18, minutes: 0 };
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3];
  if (hours > 23 || minutes > 59) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (!meridiem && !match[2] && hours <= 7) hours += 12; // "at 3" → 15:00
  return { hours, minutes };
}

const TIME_TOKEN = "(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|\\d{1,2}:\\d{2}|noon|midnight|eod|morning|afternoon|evening)";
const DAY_TOKEN =
  "(?:today|tod|tomorrow|tmr|tmrw|yesterday|(?:next\\s+|this\\s+)?(?:mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)|next\\s+week|next\\s+month|in\\s+\\d+\\s+(?:days?|weeks?|months?|d|w|m)|(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)(?:\\s+\\d{4})?|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)";

const DATE_RE = new RegExp(
  `(?:^|\\s)(?<prefix>(?:due|by|on|start(?:s|ing)?|from)\\s+)?(?:(?<day>${DAY_TOKEN})(?:\\s+(?:at\\s+)?(?<time>${TIME_TOKEN}))?|(?:at\\s+)?(?<time2>${TIME_TOKEN})|at\\s+(?<time3>\\d{1,2}))(?=\\s|$|[.,;])`,
  "i"
);

function resolveDay(raw: string, now: Date, weekStartsOn: 0 | 1): Date | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const today = atNoon(now);
  if (text === "today" || text === "tod") return today;
  if (text === "tomorrow" || text === "tmr" || text === "tmrw") return addDays(today, 1);
  if (text === "yesterday") return addDays(today, -1);
  if (text === "next week") return addWeeks(startOfWeek(today, weekStartsOn), 1);
  if (text === "next month") {
    const next = new Date(today);
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    return atNoon(next);
  }
  const inMatch = text.match(/^in (\d+) (days?|weeks?|months?|d|w|m)$/);
  if (inMatch) {
    const amount = Number(inMatch[1]);
    const unit = inMatch[2][0];
    if (unit === "d") return addDays(today, amount);
    if (unit === "w") return addWeeks(today, amount);
    const next = new Date(today);
    next.setMonth(next.getMonth() + amount);
    return atNoon(next);
  }
  const weekdayMatch = text.match(/^(?:(next|this) )?([a-z]+)$/);
  if (weekdayMatch && weekdayMatch[2] in WEEKDAYS) {
    const target = WEEKDAYS[weekdayMatch[2]];
    let diff = (target - today.getDay() + 7) % 7;
    if (weekdayMatch[1] === "next") {
      diff = diff === 0 ? 7 : diff + (today.getDay() < target ? 7 : 0);
      if (diff > 13) diff -= 7;
    } else if (diff === 0) {
      diff = 7;
    }
    return addDays(today, diff);
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    const date = new Date(year, month, day, 12);
    if (!slash[3] && date < today) date.setFullYear(year + 1);
    return date;
  }
  const monthFirst = text.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/);
  const dayFirst = text.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)(?: (\d{4}))?$/);
  const md = monthFirst
    ? { month: MONTHS[monthFirst[1]], day: Number(monthFirst[2]), year: monthFirst[3] }
    : dayFirst
      ? { month: MONTHS[dayFirst[2]], day: Number(dayFirst[1]), year: dayFirst[3] }
      : null;
  if (md && md.month !== undefined) {
    const year = md.year ? Number(md.year) : today.getFullYear();
    const date = new Date(year, md.month, md.day, 12);
    if (!md.year && date < today) date.setFullYear(year + 1);
    return date;
  }
  return null;
}

function stripToken(text: string, token: string): string {
  const index = text.indexOf(token);
  if (index < 0) return text;
  return `${text.slice(0, index)} ${text.slice(index + token.length)}`;
}

/**
 * Parse quick-add syntax:
 *   "Fix login bug tomorrow 3pm !high #bug @ella ~2h start monday"
 */
export function parseQuickAdd(input: string, context: QuickAddContext = {}): QuickAddResult {
  const now = context.now ?? new Date();
  const weekStartsOn = context.weekStartsOn ?? 1;
  const labels = context.labels ?? [];
  const members = context.members ?? [];
  let text = ` ${input.trim()} `;
  const result: QuickAddResult = {
    title: "",
    dueAt: null,
    startAt: null,
    priority: null,
    labelIds: [],
    newLabels: [],
    assignees: [],
    estimate: null,
    chips: [],
  };

  // Priority: !high, !p1, !urgent
  text = text.replace(/\s!([a-z0-9]+)(?=\s)/gi, (match, word: string) => {
    const priority = PRIORITY_WORDS[word.toLowerCase()];
    if (!priority) return match;
    result.priority = priority;
    result.chips.push({ kind: "priority", text: priority });
    return " ";
  });

  // Estimate: ~2h, ~30m, ~1.5h, ~2d
  text = text.replace(/\s~(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|d|days?)(?=\s)/gi, (_m, amount: string, unit: string) => {
    const value = Number(amount);
    const u = unit.toLowerCase()[0];
    const hours = u === "m" ? value / 60 : u === "d" ? value * 8 : value;
    result.estimate = Math.round(hours * 100) / 100;
    result.chips.push({ kind: "estimate", text: `${amount}${u}` });
    return " ";
  });

  // Labels: #bug, #"needs review"
  text = text.replace(/\s#(?:"([^"]+)"|([^\s#@!~]+))(?=\s)/g, (_m, quoted: string | undefined, bare: string | undefined) => {
    const name = (quoted ?? bare ?? "").trim();
    if (!name) return " ";
    const existing = labels.find((label) => label.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!result.labelIds.includes(existing.id)) result.labelIds.push(existing.id);
    } else if (!result.newLabels.some((n) => n.toLowerCase() === name.toLowerCase())) {
      result.newLabels.push(name);
    }
    result.chips.push({ kind: "label", text: name });
    return " ";
  });

  // Assignees: @me, @ella, @"Ella Park"
  text = text.replace(/\s@(?:"([^"]+)"|([^\s#@!~]+))(?=\s)/g, (match, quoted: string | undefined, bare: string | undefined) => {
    const name = (quoted ?? bare ?? "").trim();
    if (!name) return " ";
    if (name.toLowerCase() === "me") {
      if (context.viewer && !result.assignees.some((a) => a.id === context.viewer?.id)) {
        result.assignees.push(context.viewer);
        result.chips.push({ kind: "assignee", text: context.viewer.name });
      }
      return " ";
    }
    const lower = name.toLowerCase();
    const member =
      members.find((m) => m.name.toLowerCase() === lower) ||
      members.find((m) => m.name.toLowerCase().split(/\s+/).some((part) => part === lower)) ||
      members.find((m) => m.name.toLowerCase().startsWith(lower));
    if (!member) return match; // keep unknown @mentions in the title
    if (!result.assignees.some((a) => a.id === member.id)) result.assignees.push(member);
    result.chips.push({ kind: "assignee", text: member.name });
    return " ";
  });

  // Dates & times (up to two expressions: due and start)
  for (let pass = 0; pass < 3; pass += 1) {
    const match = DATE_RE.exec(text);
    if (!match || !match.groups) break;
    const prefix = (match.groups.prefix ?? "").trim().toLowerCase();
    const dayRaw = match.groups.day;
    const timeRaw = match.groups.time ?? match.groups.time2 ?? match.groups.time3;
    if (!dayRaw && !timeRaw) break;
    const isStart = /^(start|from)/.test(prefix);
    let day = dayRaw ? resolveDay(dayRaw, now, weekStartsOn) : null;
    const time = timeRaw ? parseTime(timeRaw) : null;
    if (dayRaw && !day) {
      // Unrecognised day token — strip only the matched fragment to avoid an infinite loop.
      text = stripToken(text, match[0].trim());
      continue;
    }
    if (!day && time) {
      day = atNoon(now);
      const candidate = new Date(day);
      candidate.setHours(time.hours, time.minutes, 0, 0);
      if (candidate.getTime() < now.getTime()) day = addDays(day, 1);
    }
    if (!day) break;
    let stored: string;
    if (time) {
      const instant = new Date(day);
      instant.setHours(time.hours, time.minutes, 0, 0);
      stored = instant.toISOString();
    } else {
      stored = toDayKey(day);
    }
    const label = `${dayRaw ?? ""}${timeRaw ? ` ${timeRaw}` : ""}`.trim();
    if (isStart) {
      result.startAt = stored;
      result.chips.push({ kind: "start", text: label });
    } else if (result.dueAt === null) {
      result.dueAt = stored;
      result.chips.push({ kind: "due", text: label });
    } else if (result.startAt === null) {
      // second bare date becomes the start (earlier one) — keep due as the later one
      if (stored < result.dueAt) {
        result.startAt = stored;
        result.chips.push({ kind: "start", text: label });
      } else {
        result.startAt = result.dueAt;
        result.dueAt = stored;
        result.chips.push({ kind: "due", text: label });
      }
    }
    text = stripToken(text, match[0].trim());
  }

  result.title = text.replace(/\s+/g, " ").trim();
  return result;
}
