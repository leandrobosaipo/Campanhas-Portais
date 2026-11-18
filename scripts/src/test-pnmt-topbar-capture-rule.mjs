#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) {
    console.error(`[test-pnmt-topbar-capture-rule] ${message}`);
    process.exit(1);
  }
}

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const config = JSON.parse(readFileSync(resolve(repoRoot, "config/adrotate-sites.json"), "utf8"));
const captureSource = readFileSync(resolve(repoRoot, "scripts/src/capture-insertion-proof.cjs"), "utf8");
const pnmtTop = config.PNMT?.formatMappings?.find((item) => item.groupId === 1);

assert(pnmtTop, "PNMT group 1 rule should exist");
assert(pnmtTop.scrollMode === "top", "PNMT group 1 must keep the site at the top");
assert(pnmtTop.auditOverrides?.requireStickyHeaderInViewport === true, "PNMT group 1 must require the full sticky header");
assert(pnmtTop.auditOverrides?.stickyHeaderExpected === "logo_menu_datetime", "PNMT group 1 must require logo, menu and date/time");
assert(pnmtTop.auditOverrides?.requireVisiblePageDate === true, "PNMT group 1 must require a visible matching date/time");
assert(
  captureSource.includes('adGroup.style.setProperty("position", "relative", "important")'),
  "GIF reference-frame overlay must be positioned relative to its AdRotate group",
);

console.log("ok: PNMT top proof requires the site header and keeps GIF overlays inside the slot");
