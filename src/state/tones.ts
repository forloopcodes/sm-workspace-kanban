import { t } from "@soft-machine/sdk";
import type { Priority, Tone } from "./types";

/** Every visible color routes through theme tokens so boards recolor with the theme. */
export function toneColor(tone: Tone | null | undefined): string {
  switch (tone) {
    case "green":
      return t.status.connected;
    case "amber":
      return t.status.warning;
    case "red":
      return t.status.error;
    case "blue":
      return t.ansi.blue;
    case "purple":
      return t.ansi.magenta;
    case "cyan":
      return t.ansi.cyan;
    case "gray":
      return t.text.muted;
    case "accent":
    default:
      return t.accent.primary;
  }
}

export function toneLabel(tone: Tone): string {
  return tone.charAt(0).toUpperCase() + tone.slice(1);
}

export function priorityColor(priority: Priority): string {
  switch (priority) {
    case "urgent":
      return t.status.error;
    case "high":
      return t.status.warning;
    case "medium":
      return t.ansi.blue;
    case "low":
      return t.text.muted;
    default:
      return t.text.muted;
  }
}

export function priorityLabel(priority: Priority): string {
  return priority === "none" ? "No priority" : priority.charAt(0).toUpperCase() + priority.slice(1);
}

export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};
