import { hasTime, parseStored, toDayKey, addDays } from "./dates";
import type { Board, Card, Column } from "./types";

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function icsDate(date: Date): string {
  return toDayKey(date).replace(/-/g, "");
}

/** Export cards with due dates as VTODO/VEVENT items so calendars can subscribe. */
export function cardsToIcs(cards: Card[], boards: Record<string, Board>, columns: Record<string, Column>): string {
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kanban//Workspace Tasks//EN", "CALSCALE:GREGORIAN"];
  const now = icsStamp(new Date());
  for (const card of cards) {
    if (!card.dueAt) continue;
    const due = parseStored(card.dueAt);
    if (!due) continue;
    const board = boards[card.boardId];
    const column = columns[card.columnId];
    const summary = `${card.title}${board ? ` [${board.name}]` : ""}`;
    const descriptionParts = [card.description, column ? `Column: ${column.name}` : "", card.priority !== "none" ? `Priority: ${card.priority}` : ""].filter(Boolean);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:kanban-${card.id}@soft-machine`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`SUMMARY:${icsEscape(summary)}`);
    if (descriptionParts.length) lines.push(`DESCRIPTION:${icsEscape(descriptionParts.join("\n"))}`);
    if (hasTime(card.dueAt)) {
      const start = card.startAt && hasTime(card.startAt) ? parseStored(card.startAt) ?? due : new Date(due.getTime() - 30 * 60_000);
      lines.push(`DTSTART:${icsStamp(start < due ? start : new Date(due.getTime() - 30 * 60_000))}`);
      lines.push(`DTEND:${icsStamp(due)}`);
    } else {
      const start = card.startAt ? parseStored(card.startAt) ?? due : due;
      lines.push(`DTSTART;VALUE=DATE:${icsDate(start <= due ? start : due)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(due, 1))}`);
    }
    lines.push(`STATUS:${card.completedAt ? "COMPLETED" : "CONFIRMED"}`);
    if (card.labels.length && board) {
      const names = card.labels.map((id) => board.labels.find((l) => l.id === id)?.name).filter(Boolean) as string[];
      if (names.length) lines.push(`CATEGORIES:${names.map(icsEscape).join(",")}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function cardsToCsv(cards: Card[], boards: Record<string, Board>, columns: Record<string, Column>): string {
  const header = ["number", "title", "board", "column", "priority", "labels", "assignees", "start", "due", "estimate_h", "completed_at", "created_at", "description"];
  const rows = cards.map((card) => {
    const board = boards[card.boardId];
    return [
      card.number,
      card.title,
      board?.name ?? "",
      columns[card.columnId]?.name ?? "",
      card.priority,
      card.labels.map((id) => board?.labels.find((l) => l.id === id)?.name ?? "").filter(Boolean).join("; "),
      card.assignees.map((a) => a.name).join("; "),
      card.startAt ?? "",
      card.dueAt ?? "",
      card.estimate ?? "",
      card.completedAt ?? "",
      card.createdAt,
      card.description,
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
