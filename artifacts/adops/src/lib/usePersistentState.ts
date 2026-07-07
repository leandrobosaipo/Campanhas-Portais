import { useEffect, useState } from "react";

const REMOVE_WHEN_EMPTY_KEYS = new Set(["adops.ops.operator-token.v1"]);

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return initialValue;
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (
        REMOVE_WHEN_EMPTY_KEYS.has(key) &&
        typeof value === "string" &&
        value.trim() === ""
      ) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage failures and keep UX functional
    }
  }, [key, value]);

  return [value, setValue] as const;
}
