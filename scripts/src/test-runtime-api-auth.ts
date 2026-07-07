import test from "node:test";
import assert from "node:assert/strict";

import {
  getStoredOpsOperatorToken,
  normalizeOpsOperatorToken,
  sanitizeStoredOpsOperatorToken,
} from "../../artifacts/adops/src/lib/runtime-api.ts";

function installWindow(rawValue: string | null) {
  const storage = new Map<string, string>();
  if (rawValue !== null) storage.set("adops.ops.operator-token.v1", rawValue);

  (globalThis as any).window = {
    localStorage: {
      getItem(key: string) {
        return storage.has(key) ? storage.get(key) ?? null : null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      },
    },
  };

  return storage;
}

test("normalizeOpsOperatorToken trata valor JSON vazio como ausente", () => {
  assert.equal(normalizeOpsOperatorToken('""'), "");
  assert.equal(normalizeOpsOperatorToken("''"), "");
  assert.equal(normalizeOpsOperatorToken("   "), "");
});

test("normalizeOpsOperatorToken extrai token salvo em JSON", () => {
  assert.equal(normalizeOpsOperatorToken('"abc123"'), "abc123");
  assert.equal(normalizeOpsOperatorToken(" abc123 "), "abc123");
});

test("sanitizeStoredOpsOperatorToken remove vazio serializado e canonicaliza token", () => {
  let storage = installWindow('""');
  assert.equal(sanitizeStoredOpsOperatorToken(), "");
  assert.equal(storage.has("adops.ops.operator-token.v1"), false);

  storage = installWindow("abc123");
  assert.equal(sanitizeStoredOpsOperatorToken(), "abc123");
  assert.equal(storage.get("adops.ops.operator-token.v1"), '"abc123"');
});

test("getStoredOpsOperatorToken lê token salvo pelo usePersistentState", () => {
  installWindow('"token-real"');
  assert.equal(getStoredOpsOperatorToken(), "token-real");
});
