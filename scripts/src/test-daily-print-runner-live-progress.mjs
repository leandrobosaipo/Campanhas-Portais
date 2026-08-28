import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
assert.match(source, /buildDailyPrintLiveProgress/);
assert.match(source, /candidateInsertionIds/);
assert.match(source, /liveProgress/);
assert.match(source, /itemsDone:\s*captured\.length \+ skipped\.length \+ failed\.length/);
assert.match(source, /percentTotal/);
console.log("daily print runner live progress: passed");
