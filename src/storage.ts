// This device's localStorage, made safe: a private window or blocked site data can make every access throw, and nothing here
// is worth failing over. Callers just lose the remembered value.

/** The device's storage, when the browser lets us have it. */
export function deviceStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** The stored value, or null when there is none or storage is unavailable. */
export function readLocal(key: string): string | null {
  try {
    return deviceStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Stores a value; null removes it. Silently does nothing when storage is unavailable. */
export function writeLocal(key: string, value: string | null): void {
  try {
    const s = deviceStorage();
    if (value === null) s?.removeItem(key);
    else s?.setItem(key, value);
  } catch {
    /* not remembered this time */
  }
}
