export function makeId(prefix = ""): string {
  const core =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${core}` : core;
}

export function shortId(id: string): string {
  return id.replace(/^[a-z]+_/, "").slice(0, 6);
}
