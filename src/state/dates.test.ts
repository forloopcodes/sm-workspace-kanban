import { describe, expect, test } from "bun:test";
import { applyRelative, bucketFor, deadlineMs, formatDue, isOverdue, toDayKey, addMonthsClamped } from "./dates";

const now = new Date(2026, 8, 2, 10, 0); // Wed

describe("dates", () => {
  test("buckets", () => {
    expect(bucketFor(null, now)).toBe("none");
    expect(bucketFor("2026-09-01", now)).toBe("overdue");
    expect(bucketFor("2026-09-02", now)).toBe("today");
    expect(bucketFor("2026-09-03", now)).toBe("tomorrow");
    expect(bucketFor("2026-09-06", now)).toBe("week");
    expect(bucketFor("2026-09-08", now)).toBe("nextWeek");
    expect(bucketFor("2026-09-20", now)).toBe("later");
    expect(bucketFor(new Date(2026, 8, 2, 9, 0).toISOString(), now)).toBe("overdue");
    expect(bucketFor(new Date(2026, 8, 2, 18, 0).toISOString(), now)).toBe("today");
  });

  test("date-only deadlines expire at end of day", () => {
    expect(isOverdue("2026-09-02", now)).toBe(false);
    expect(deadlineMs("2026-09-02")! > now.getTime()).toBe(true);
  });

  test("relative offsets", () => {
    expect(toDayKey(applyRelative("+3d", now)!)).toBe("2026-09-05");
    expect(toDayKey(applyRelative("2w", now)!)).toBe("2026-09-16");
    expect(toDayKey(applyRelative("-1m", now)!)).toBe("2026-08-02");
    expect(applyRelative("nonsense", now)).toBeNull();
  });

  test("format", () => {
    expect(formatDue("2026-09-02", now)).toBe("Today");
    expect(formatDue("2026-09-03", now)).toBe("Tomorrow");
    expect(formatDue("2026-09-05", now)).toBe("Sat");
    expect(formatDue("2026-10-05", now)).toBe("Oct 5");
    expect(formatDue("2027-10-05", now)).toBe("Oct 5, 2027");
  });

  test("month clamp", () => {
    expect(toDayKey(addMonthsClamped(new Date(2026, 0, 31, 12), 1))).toBe("2026-02-28");
  });
});
