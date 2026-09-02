import { describe, expect, test } from "bun:test";
import { describeRecurrence, nextOccurrence, nextStoredOccurrence } from "./recurrence";
import { toDayKey } from "./dates";

const from = new Date(2026, 0, 31, 9, 30); // Sat Jan 31 2026 09:30

describe("nextOccurrence", () => {
  test("daily with interval", () => {
    expect(toDayKey(nextOccurrence({ frequency: "daily", interval: 3 }, from)!)).toBe("2026-02-03");
  });

  test("monthly clamps to month end", () => {
    const next = nextOccurrence({ frequency: "monthly", interval: 1 }, from)!;
    expect(toDayKey(next)).toBe("2026-02-28");
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(30);
  });

  test("yearly", () => {
    expect(toDayKey(nextOccurrence({ frequency: "yearly", interval: 1 }, from)!)).toBe("2027-01-31");
  });

  test("weekly on weekdays", () => {
    // from Saturday → next Monday
    expect(toDayKey(nextOccurrence({ frequency: "weekly", interval: 1, weekdays: [1, 3] }, from)!)).toBe("2026-02-02");
    // from Monday Feb 2 → Wed Feb 4
    expect(toDayKey(nextOccurrence({ frequency: "weekly", interval: 1, weekdays: [1, 3] }, new Date(2026, 1, 2, 12))!)).toBe("2026-02-04");
    // every 2 weeks on Monday from Monday Feb 2 → Feb 16
    expect(toDayKey(nextOccurrence({ frequency: "weekly", interval: 2, weekdays: [1] }, new Date(2026, 1, 2, 12))!)).toBe("2026-02-16");
  });

  test("weekly without weekdays", () => {
    expect(toDayKey(nextOccurrence({ frequency: "weekly", interval: 1 }, from)!)).toBe("2026-02-07");
  });

  test("until ends the series", () => {
    expect(nextOccurrence({ frequency: "daily", interval: 1, until: "2026-01-31" }, from)).toBeNull();
    expect(nextOccurrence({ frequency: "daily", interval: 1, until: "2026-02-01" }, from)).not.toBeNull();
  });

  test("stored occurrence keeps form", () => {
    expect(nextStoredOccurrence({ frequency: "daily", interval: 1 }, "2026-01-31", from)).toBe("2026-02-01");
    const iso = nextStoredOccurrence({ frequency: "daily", interval: 1 }, from.toISOString(), from)!;
    expect(iso.endsWith("Z")).toBe(true);
  });

  test("describe", () => {
    expect(describeRecurrence({ frequency: "weekly", interval: 2, weekdays: [1, 5] })).toBe("Every 2 weeks on Mon, Fri");
    expect(describeRecurrence(null)).toBe("Does not repeat");
  });
});
