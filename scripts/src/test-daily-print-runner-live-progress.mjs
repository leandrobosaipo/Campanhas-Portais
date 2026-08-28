import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
assert.match(source, /buildDailyPrintLiveProgress/);
assert.match(source, /candidateInsertionIds/);
assert.match(source, /liveProgress/);
assert.match(source, /itemsDone:\s*captured\.length \+ skipped\.length \+ failed\.length/);
assert.match(source, /percentTotal/);
assert.match(source, /const publishLiveProgress = async[\s\S]*?try \{[\s\S]*?await progressJob[\s\S]*?\} catch \(error\) \{[\s\S]*?console\.warn\(`\[runner\] progresso diário não publicado/);
assert.match(source, /catch \(error\) \{[\s\S]*?failed\.push\([\s\S]*?\n    \}\n    await publishLiveProgress\(null, \{ insertionId \}\);/);
console.log("daily print runner live progress: passed");
