import assert from "node:assert/strict";
import test from "node:test";
import {
  requiresPerrengueHomeEditorialAudit,
  resolveChecklistFinalProofStyle,
} from "../../artifacts/api-server/src/lib/proof-style-contract";

test("metadata final replaces a legacy inset rule after capture downgrade", () => {
  assert.equal(
    resolveChecklistFinalProofStyle("viewport_with_slot_inset", {
      requestedProofStyle: "viewport_with_slot_inset",
      finalProofStyle: "viewport_only",
      auditInsetSuppressed: true,
    }),
    "viewport_only",
  );
});

test("legacy rule remains blocking when final metadata is absent", () => {
  assert.equal(
    resolveChecklistFinalProofStyle("viewport_with_slot_inset", null),
    "viewport_with_slot_inset",
  );
});

test("captured inset remains blocking regardless of rule", () => {
  assert.equal(
    resolveChecklistFinalProofStyle("viewport_only", { finalProofStyle: "viewport_with_slot_inset" }),
    "viewport_with_slot_inset",
  );
});

test("Perrengue editorial audit applies only to home sections", () => {
  assert.equal(requiresPerrengueHomeEditorialAudit("PERRENGUE", "home"), true);
  assert.equal(requiresPerrengueHomeEditorialAudit("PERRENGUE", "article"), false);
  assert.equal(requiresPerrengueHomeEditorialAudit("ROO", "home"), false);
});
