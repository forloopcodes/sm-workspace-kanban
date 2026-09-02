import { describe, expect, test } from "bun:test";
import { orderAtIndex, orderBetween, spreadOrders, sortByOrder, needsRebalance } from "./order";

describe("orderBetween", () => {
  test("open both ends", () => {
    expect(orderBetween(null, null)).toBe("V");
  });

  test("always strictly between", () => {
    const pairs: Array<[string | null, string | null]> = [
      [null, "V"],
      ["V", null],
      ["A", "B"],
      ["A", "A1"],
      ["Az", "B"],
      ["zz", null],
      [null, "0001"],
      ["V", "VV"],
      ["VU", "VV"],
    ];
    for (const [a, b] of pairs) {
      const mid = orderBetween(a, b);
      if (a !== null) expect(mid > a).toBe(true);
      if (b !== null) expect(mid < b).toBe(true);
    }
  });

  test("repeated inserts at the same spot keep ordering", () => {
    let low: string | null = null;
    let high: string | null = "V";
    const keys: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const mid = orderBetween(low, high);
      keys.push(mid);
      low = mid;
    }
    for (let i = 1; i < keys.length; i += 1) expect(keys[i] > keys[i - 1]).toBe(true);
    expect(keys.every((k) => k < "V")).toBe(true);
  });

  test("insert at front repeatedly", () => {
    let high: string | null = "V";
    const keys: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const mid = orderBetween(null, high);
      keys.push(mid);
      high = mid;
    }
    for (let i = 1; i < keys.length; i += 1) expect(keys[i] < keys[i - 1]).toBe(true);
  });

  test("throws on inverted bounds", () => {
    expect(() => orderBetween("B", "A")).toThrow();
  });

  test("never produces keys ending in 0", () => {
    for (let i = 0; i < 50; i += 1) {
      const a = orderBetween(null, "1");
      expect(a.endsWith("0")).toBe(false);
    }
  });
});

describe("spreadOrders", () => {
  test("monotone and unique", () => {
    for (const count of [1, 3, 10, 200, 1000, 5000]) {
      const keys = spreadOrders(count);
      expect(keys.length).toBe(count);
      for (let i = 1; i < keys.length; i += 1) expect(keys[i] > keys[i - 1]).toBe(true);
      expect(new Set(keys).size).toBe(count);
    }
  });
});

describe("orderAtIndex", () => {
  test("insert at ends and middle", () => {
    const sorted = sortByOrder([{ order: "A" }, { order: "M" }, { order: "Z" }]);
    expect(orderAtIndex(sorted, 0) < "A").toBe(true);
    const mid = orderAtIndex(sorted, 1);
    expect(mid > "A" && mid < "M").toBe(true);
    expect(orderAtIndex(sorted, 3) > "Z").toBe(true);
    expect(orderAtIndex([], 0)).toBe("V");
  });

  test("survives duplicate neighbours", () => {
    const key = orderAtIndex([{ order: "A" }, { order: "A" }], 1);
    expect(key > "A").toBe(true);
  });
});

describe("needsRebalance", () => {
  test("flags long keys", () => {
    expect(needsRebalance(["A", "B"])).toBe(false);
    expect(needsRebalance(["A".repeat(30)])).toBe(true);
  });
});
