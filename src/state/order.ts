/**
 * Fractional ordering keys. Keys are base-62 strings compared lexicographically
 * and read as fractions in [0, 1). `orderBetween(a, b)` returns a key strictly
 * between `a` and `b` (`null` = open end), so concurrent inserts never need to
 * renumber neighbours. Keys grow only when inserting repeatedly at the same
 * spot; `needsRebalance` flags a list whose keys have grown past a threshold so
 * the caller can renumber it in one transaction.
 */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = ALPHABET.length;

function digit(ch: string | undefined): number {
  if (ch === undefined) return 0;
  const index = ALPHABET.indexOf(ch);
  return index < 0 ? 0 : index;
}

export function compareOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function midpoint(a: string, b: string | null): string {
  let i = 0;
  while (b !== null && i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const prefix = a.slice(0, i);
  const lo = digit(a[i]);
  const hi = b === null ? BASE : i < b.length ? digit(b[i]) : BASE;
  if (hi - lo >= 2) {
    return prefix + ALPHABET[Math.floor((lo + hi) / 2)];
  }
  if (hi === lo) {
    // Only possible when `a` is exhausted and b's digit is 0: descend into b.
    return prefix + ALPHABET[lo] + midpoint("", b === null ? null : b.slice(i + 1));
  }
  // Adjacent digits: keep the lower digit and find room in the lower key's tail.
  return prefix + ALPHABET[lo] + midpoint(a.slice(i + 1), null);
}

/** Key strictly between `a` (exclusive) and `b` (exclusive). */
export function orderBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`orderBetween: lower bound "${a}" must be < upper bound "${b}"`);
  }
  if (a === null && b === null) return ALPHABET[Math.floor(BASE / 2)];
  if (a === null) {
    // Something below b: midpoint between 0 and b.
    return midpoint("", b);
  }
  return midpoint(a, b);
}

export function firstOrder(): string {
  return orderBetween(null, null);
}

export function orderAfter(last: string | null): string {
  return orderBetween(last, null);
}

export function orderBefore(first: string | null): string {
  return orderBetween(null, first);
}

/** Evenly spaced keys for `count` items — used for seeding and rebalancing. */
export function spreadOrders(count: number): string[] {
  const keys: string[] = [];
  if (count <= 0) return keys;
  // Two-digit spread gives 62*62 evenly spaced slots; fall back to chaining for huge lists.
  const slots = BASE * BASE;
  if (count < slots / 2) {
    const step = Math.floor(slots / (count + 1));
    for (let i = 1; i <= count; i += 1) {
      const value = i * step;
      const first = ALPHABET[Math.floor(value / BASE)];
      const second = ALPHABET[value % BASE];
      keys.push(second === "0" ? first : first + second);
    }
    return keys;
  }
  let prev: string | null = null;
  for (let i = 0; i < count; i += 1) {
    const next = orderBetween(prev, null);
    keys.push(next);
    prev = next;
  }
  return keys;
}

export function needsRebalance(keys: string[], maxLength = 24): boolean {
  return keys.some((key) => key.length > maxLength);
}

export function sortByOrder<T extends { order: string }>(items: T[]): T[] {
  return [...items].sort((x, y) => compareOrder(x.order, y.order));
}

/**
 * Compute the order key for inserting at `index` into `sorted` (already
 * sorted by order, excluding the moving item).
 */
export function orderAtIndex(sorted: Array<{ order: string }>, index: number): string {
  const clamped = Math.max(0, Math.min(index, sorted.length));
  const before = clamped > 0 ? sorted[clamped - 1].order : null;
  const after = clamped < sorted.length ? sorted[clamped].order : null;
  if (before !== null && after !== null && before >= after) {
    // Corrupt neighbours (duplicate keys): fall back to appending after `before`.
    return orderBetween(before, null);
  }
  return orderBetween(before, after);
}
