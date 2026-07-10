#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) {
    console.error(`[test-perrengue-popup-capture-rule] ${message}`);
    process.exit(1);
  }
}

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const config = JSON.parse(readFileSync(resolve(repoRoot, "config/adrotate-sites.json"), "utf8"));
const perrengue = config.PERRENGUE;
const popupRule = perrengue?.formatMappings?.find((item) => item.groupId === 9);

assert(popupRule, "PERRENGUE group 9 rule should exist");
assert(popupRule.slotSelector === "#cod5-bottom-popup-ad .g.g-9", "PERRENGUE group 9 slotSelector should target the bottom fixed pop-up");
assert(popupRule.contextSelector === "#cod5-bottom-popup-ad", "PERRENGUE group 9 contextSelector should target the bottom fixed pop-up container");
assert(popupRule.scrollMode === "top", "PERRENGUE group 9 should capture from top because the pop-up is fixed in viewport");
assert(popupRule.proofStyle === "viewport_only", "PERRENGUE group 9 should use viewport_only proof for the real fixed footer slot");
assert(popupRule.auditOverrides?.requireSlotVisibleInViewport === true, "PERRENGUE group 9 should require visible slot in viewport");

console.log("ok: perrengue popup capture rule targets bottom fixed AdRotate slot");
