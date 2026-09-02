import { describe, expect, test } from "bun:test";
import { parseQuickAdd } from "./nlp";

// Wednesday 2026-09-02 10:00 local
const NOW = new Date(2026, 8, 2, 10, 0, 0);
const ctx = {
  now: NOW,
  labels: [
    { id: "l1", name: "Bug", tone: "red" as const },
    { id: "l2", name: "Needs review", tone: "amber" as const },
  ],
  members: [
    { id: "u1", name: "Ella Park" },
    { id: "u2", name: "Sam" },
  ],
  viewer: { id: "me", name: "Me" },
};

describe("parseQuickAdd", () => {
  test("full example", () => {
    const r = parseQuickAdd("Fix login bug tomorrow 3pm !high #bug @ella ~2h", ctx);
    expect(r.title).toBe("Fix login bug");
    expect(r.dueAt).toBe(new Date(2026, 8, 3, 15, 0, 0).toISOString());
    expect(r.priority).toBe("high");
    expect(r.labelIds).toEqual(["l1"]);
    expect(r.assignees.map((a) => a.id)).toEqual(["u1"]);
    expect(r.estimate).toBe(2);
  });

  test("date-only due and weekday", () => {
    expect(parseQuickAdd("Ship release friday", ctx).dueAt).toBe("2026-09-04");
    expect(parseQuickAdd("Ship release next monday", ctx).dueAt).toBe("2026-09-07");
    expect(parseQuickAdd("Ship release wed", ctx).dueAt).toBe("2026-09-09");
    expect(parseQuickAdd("Ship release today", ctx).dueAt).toBe("2026-09-02");
    expect(parseQuickAdd("Ship release", ctx).dueAt).toBeNull();
  });

  test("month day forms", () => {
    expect(parseQuickAdd("Renew certs sep 14", ctx).dueAt).toBe("2026-09-14");
    expect(parseQuickAdd("Renew certs on 14 sep", ctx).dueAt).toBe("2026-09-14");
    expect(parseQuickAdd("Renew certs 2026-10-01", ctx).dueAt).toBe("2026-10-01");
    expect(parseQuickAdd("Renew certs 1/5", ctx).dueAt).toBe("2027-01-05");
    expect(parseQuickAdd("Renew certs in 3 days", ctx).dueAt).toBe("2026-09-05");
    expect(parseQuickAdd("Renew certs next week", ctx).dueAt).toBe("2026-09-07");
  });

  test("time only rolls to tomorrow when past", () => {
    const r = parseQuickAdd("Standup at 9am", ctx);
    expect(r.dueAt).toBe(new Date(2026, 8, 3, 9, 0, 0).toISOString());
    expect(r.title).toBe("Standup");
    const later = parseQuickAdd("Standup 11:30", ctx);
    expect(later.dueAt).toBe(new Date(2026, 8, 2, 11, 30, 0).toISOString());
  });

  test("start and due", () => {
    const r = parseQuickAdd("Write docs start monday due friday", ctx);
    expect(r.startAt).toBe("2026-09-07");
    expect(r.dueAt).toBe("2026-09-04");
    expect(r.title).toBe("Write docs");
  });

  test("new labels, quoted labels, @me", () => {
    const r = parseQuickAdd('Investigate #"needs review" #perf @me !urgent', ctx);
    expect(r.labelIds).toEqual(["l2"]);
    expect(r.newLabels).toEqual(["perf"]);
    expect(r.assignees.map((a) => a.id)).toEqual(["me"]);
    expect(r.priority).toBe("urgent");
    expect(r.title).toBe("Investigate");
  });

  test("unknown mention stays in title", () => {
    const r = parseQuickAdd("Email @vendor about invoice", ctx);
    expect(r.title).toBe("Email @vendor about invoice");
    expect(r.assignees).toEqual([]);
  });

  test("estimate minutes and days", () => {
    expect(parseQuickAdd("Quick fix ~30m", ctx).estimate).toBe(0.5);
    expect(parseQuickAdd("Big fix ~2d", ctx).estimate).toBe(16);
  });

  test("keeps plain text that resembles tokens", () => {
    const r = parseQuickAdd("Discuss May budget", ctx);
    expect(r.title).toBe("Discuss May budget");
    expect(r.dueAt).toBeNull();
  });
});
