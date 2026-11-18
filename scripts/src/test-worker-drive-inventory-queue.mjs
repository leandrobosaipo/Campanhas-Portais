import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("refresh do Drive entra na mesma fila D1 consumida pelos runners", async () => {
  const source = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
  const route = source.match(/if \(path === "\/api\/ops\/jobs\/drive-inventory-refresh"\) \{([\s\S]*?)\n      \}/)?.[1] || "";

  assert.match(route, /createOpsJob\(env, "drive-inventory-refresh"/);
  assert.doesNotMatch(route, /proxyToPrivateApi/);
});
