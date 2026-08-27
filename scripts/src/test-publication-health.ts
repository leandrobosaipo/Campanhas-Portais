import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://localhost/adops_publication_health_test";

const { classifyPublicationHealth } = await import("../../artifacts/api-server/src/lib/campaign-operations");

test("evidencia antiga nao oculta midia atual ausente", () => {
  const result = classifyPublicationHealth({
    inPeriod: true,
    mediaUrl: "https://cdn.example/vira-saude.gif",
    bannerPublicadoNoSite: true,
    expectedGroupId: 14,
    expectedMediaObserved: false,
    publicConfirmation: "reported_only",
    duplicateInsertionIds: [2714, 2779],
  });
  assert.equal(result.status, "blocked_upstream");
  assert.equal(result.reason, "expected_media_not_observed");
});

test("video no Drive sem mediaUrl bloqueia antes do periodo", () => {
  const result = classifyPublicationHealth({
    inPeriod: false,
    mediaUrl: null,
    bannerPublicadoNoSite: false,
    expectedGroupId: 6,
    expectedMediaObserved: false,
    publicConfirmation: "not_published",
    driveMediaAvailable: true,
    duplicateInsertionIds: [],
  });
  assert.equal(result.status, "prepublication_pending");
  assert.equal(result.reason, "drive_media_not_linked");
});
