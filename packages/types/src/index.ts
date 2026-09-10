export type ActionResult<T = undefined> =
  { ok: true; message: string; data?: T } | { ok: false; message: string; fields?: Record<string, string> };
export type SelectOption = { value: string; label: string };
