import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./audit-capture-rules-integrity.mjs", import.meta.url), "utf8");

test("auditoria avisa somente drafts habilitados", () => {
  assert.match(source, /statusPublished !== true && item\.enabled !== false/);
});
