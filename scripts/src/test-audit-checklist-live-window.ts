import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignsTable,
  captureRulesTable,
  db,
  insertionsTable,
  sitesTable,
} from "@workspace/db";
import { validateAuditChecklist } from "../../artifacts/api-server/src/lib/audit-checklist.ts";
import { attachServerCaptureProvenance } from "../../artifacts/api-server/src/lib/capture-audit.ts";
import { pageTextMatchesRequestedCaptureAt } from "../../artifacts/api-server/src/lib/capture-audit.ts";

// Exercise the production validator with a resolved database-backed contract,
// but keep every query in memory. No Postgres connection or capture runner runs.
const originalSelect = db.select;
const OriginalDate = Date;
const targetDate = "2026-10-10";
const mediaUrl = "https://cdn.example.test/perrengue-banner.gif";

function mockContractQueries(siteSigla = "PERRENGUE", insertionId = 3063, piCodigo = "FIXTURE", groupId = 1) {
  db.select = (() => ({
    from(table: unknown) {
      const rows = table === insertionsTable ? [{
        id: insertionId, campanhaId: 1, siteId: 1,
        localFormato: groupId === 11 ? "BANNER INTERNO NOTICIAS" : groupId === 2 ? "HOME 1" : "MEGABANNER TOPO",
        localFormatoNormalizado: groupId === 11 ? "BANNER INTERNO NOTICIAS" : groupId === 2 ? "HOME 1" : "MEGABANNER TOPO",
        periodoInicio: "2026-10-01", periodoFim: "2026-10-31",
        mediaUrl, statusNormalizado: "ativa",
      }] : table === campaignsTable ? [{ id: 1, nome: "Fixture", piCodigo }]
        : table === sitesTable ? [{ id: 1, sigla: siteSigla }]
          : table === captureRulesTable ? [{
            id: 1, siteSigla, groupId, enabled: true,
            statusPublished: true, page: "home", slotSelector: ".g.g-1",
            contextSelector: "#header-ads-row", scrollMode: "top",
            proofStyle: "viewport_only",
            auditConfig: { requireAbsoluteEditorialDates: true, requireEditorialDateMatchTarget: true },
            ruleVersionHash: "fixture",
          }] : [];
      const chain = {
        where() { return chain; },
        orderBy() { return chain; },
        limit() { return Promise.resolve(rows); },
      };
      return chain;
    },
  })) as unknown as typeof db.select;
}

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    siteSigla: "PERRENGUE", slotSelector: ".g.g-1",
    contextSelector: "#header-ads-row", matchedMediaUrl: mediaUrl,
    requiredGates: { requireAbsoluteEditorialDates: true, requireEditorialDateMatchTarget: true },
    contentDateSamples: ["2026-10-10T22:00:00Z"],
    retroGate: { ok: true },
    creativePlacementAudit: { ok: true },
    ...overrides,
  };
}

function issueCodes(result: Awaited<ReturnType<typeof validateAuditChecklist>>) {
  return result.blockingIssues.map(({ code }) => code);
}

test("real checklist uses server receipt only inside the 18:00–21:59 Cuiaba window", async () => {
  mockContractQueries();
  globalThis.Date = class extends OriginalDate {
    constructor(...args: unknown[]) {
      super(args.length ? args[0] as string | number : "2026-10-11T03:00:00.000Z");
    }
  } as DateConstructor;
  try {
    for (const [clock, blocked] of [
      ["17:59:59", true], ["18:00:00", false],
      ["21:59:59", false], ["22:00:00", true],
    ] as const) {
      const receivedAt = new Date(`2026-10-10T${clock}-04:00`);
      const result = await validateAuditChecklist({
        insertionId: 3063, date: targetDate, phase: "pre_upload",
        metadata: metadata({ requestedCaptureAt: null }), preUploadReceivedAt: receivedAt,
      });
      assert.equal(result.contract.ok, true);
      assert.equal(issueCodes(result).includes("capture_time_outside_window"), blocked, clock);
      assert.equal(issueCodes(result).includes("editorial_date_target_mismatch"), false, clock);
    }
  } finally {
    globalThis.Date = OriginalDate;
    db.select = originalSelect;
  }
});

test("approved late-window exception is limited to the two server-resolved insertion identities", async () => {
  globalThis.Date = class extends OriginalDate {
    constructor(...args: unknown[]) {
      super(args.length ? args[0] as string | number : "2026-10-12T03:00:00.000Z");
    }
  } as DateConstructor;
  const preUpload = async (insertionId: number, site: string, pi: string, group: number, date: string, receivedAt: string, forged: Record<string, unknown> = {}) => {
    mockContractQueries(site, insertionId, pi, group);
    return validateAuditChecklist({
      insertionId, date, phase: "pre_upload",
      metadata: metadata({ requestedCaptureAt: null, ...forged }),
      preUploadReceivedAt: new OriginalDate(receivedAt),
    });
  };
  try {
    for (const [id, site, pi, group] of [[3055, "OMT", "PI 9784 - PREF CBA", 1], [3083, "PERRENGUE", "91713", 11]] as const) {
      const result = await preUpload(id, site, pi, group, "2026-10-11", "2026-10-12T02:50:00.000Z");
      assert.equal(issueCodes(result).includes("capture_time_outside_window"), false, `${id}`);
      assert.deepEqual(result.captureWindowException, {
        approvalRef: "call_dff2ebce693b4957bf4d52ccc737ce7b:reply",
        approvedAt: "2026-10-12T02:41:31Z",
        expiresAt: "2026-10-12T03:59:59.999Z",
        actualAt: "2026-10-12T02:50:00.000Z",
        late: true,
        targetDate: "2026-10-11",
        insertionId: id,
        siteSigla: site,
        piCodigo: pi,
        groupId: group,
        limitation: "Exceção limitada à janela de captura desta aprovação; não substitui outros gates nem valida publicação externa.",
      });
    }

    const negatives = [
      [3056, "OMT", "PI 9784 - PREF CBA", 1, "2026-10-11", "2026-10-12T02:50:00.000Z"],
      [3055, "PERRENGUE", "9784", 1, "2026-10-11", "2026-10-12T02:50:00.000Z"],
      [3055, "OMT", "wrong", 1, "2026-10-11", "2026-10-12T02:50:00.000Z"],
      [3055, "OMT", "9784", 1, "2026-10-11", "2026-10-12T02:50:00.000Z"],
      [3055, "OMT", "PI 9784 - PREF CBA", 2, "2026-10-11", "2026-10-12T02:50:00.000Z"],
      [3055, "OMT", "PI 9784 - PREF CBA", 1, "2026-10-10", "2026-10-12T02:50:00.000Z"],
      [3055, "OMT", "PI 9784 - PREF CBA", 1, "2026-10-11", "2026-10-12T02:41:30.999Z"],
      [3055, "OMT", "PI 9784 - PREF CBA", 1, "2026-10-11", "2026-10-12T03:00:01.000Z"],
      [3055, "OMT", "PI 9784 - PREF CBA", 1, "2026-10-11", "2026-10-12T04:00:00.000Z"],
    ] as const;
    for (const [id, site, pi, group, date, receivedAt] of negatives) {
      const result = await preUpload(id, site, pi, group, date, receivedAt, {
        captureWindowException: { approvalRef: "call_dff2ebce693b4957bf4d52ccc737ce7b:reply", actualAt: "2026-10-12T02:50:00Z" },
        captureClass: "scheduled", capturedAt: "2026-10-12T02:50:00Z",
      });
      assert.equal(result.captureWindowException, null, `${id}/${site}/${pi}/${group}/${date}/${receivedAt}`);
      assert.equal(issueCodes(result).includes("capture_time_outside_window"), true);
    }
    const forgedRequestedAt = await preUpload(3083, "PERRENGUE", "91713", 11, "2026-10-11", "2026-10-12T02:50:00.000Z", {
      requestedCaptureAt: "2026-10-11T18:00:00-04:00",
    });
    assert.equal(forgedRequestedAt.captureWindowException, null);
    assert.equal(issueCodes(forgedRequestedAt).includes("capture_time_outside_window"), true);
  } finally {
    globalThis.Date = OriginalDate;
    db.select = originalSelect;
  }
});

test("final checklist records only trusted original captures within the approved interval, including next-day review", async () => {
  const target = "2026-10-11";
  const capturedAt = "2026-10-12T02:50:00.000Z";
  const finalResult = async (now: string, insertionId: number, site: string, pi: string, group: number, overrides: Record<string, unknown> = {}, actualAt = capturedAt, omitPhase = false) => {
    mockContractQueries(site, insertionId, pi, group);
    globalThis.Date = class extends OriginalDate {
      constructor(...args: unknown[]) { super(args.length ? args[0] as string | number : now); }
    } as DateConstructor;
    const finalMetadata = metadata({
      siteSigla: site, requestedCaptureAt: null, captureClass: "scheduled", targetDate: target,
      sourceJobId: "server-correlated-job", auditPolicyVersion: "audit-policy-v1",
      capturedAt: actualAt, contentDateSamples: ["2026-10-11T22:00:00Z"],
      systemDateTime: "11/10/2026 às 22:50",
      pageDateObserved: "domingo, 11 de outubro de 2026 às 22:50",
      ...overrides,
    });
    attachServerCaptureProvenance(finalMetadata, {
      targetDate: target, sourceJobId: "server-correlated-job", capturedAt: actualAt,
      uploadedUrl: "https://cdn.example.test/approved-late-proof.png",
    });
    return validateAuditChecklist({ insertionId, date: target, ...(omitPhase ? {} : { phase: "final" as const }), metadata: finalMetadata });
  };
  try {
    const nextDay = await finalResult("2026-10-12T10:00:00.000Z", 3083, "PERRENGUE", "91713", 11);
    assert.ok(nextDay.captureWindowException, JSON.stringify({ audit: nextDay.audit, contract: nextDay.contract, blockingIssues: nextDay.blockingIssues }));
    assert.equal(nextDay.captureWindowException?.actualAt, capturedAt);
    assert.equal(nextDay.captureWindowException?.late, true);
    assert.equal(issueCodes(nextDay).includes("capture_time_outside_window"), false);

    const callerDefaultPhase = await finalResult("2026-10-12T10:00:00.000Z", 3083, "PERRENGUE", "91713", 11, {}, capturedAt, true);
    assert.equal(callerDefaultPhase.captureWindowException?.actualAt, capturedAt);
    assert.equal(issueCodes(callerDefaultPhase).includes("capture_time_outside_window"), false);

    const afterExpiryReview = await finalResult("2026-10-13T10:00:00.000Z", 3083, "PERRENGUE", "91713", 11);
    assert.equal(afterExpiryReview.captureWindowException?.actualAt, capturedAt);
    assert.equal(issueCodes(afterExpiryReview).includes("capture_time_outside_window"), false);

    const omtLate = await finalResult("2026-10-12T10:00:00.000Z", 3055, "OMT", "PI 9784 - PREF CBA", 1, {
      systemDateTime: "11/10/2026 às 22:50",
      pageDateObserved: "domingo, 11 de outubro de 2026 às 13:58:49",
    });
    assert.equal(omtLate.captureWindowException?.actualAt, capturedAt);
    assert.equal(issueCodes(omtLate).includes("page_time_mismatch"), true);

    const historical = await finalResult("2026-10-12T10:00:00.000Z", 3083, "PERRENGUE", "91713", 11, {
      captureClass: "historical_recovery", requestedCaptureAt: "2026-10-11T18:00:00-04:00",
      reconstruction: { reconstructed: true, reason: "historical_recovery", sourceMode: "audited_reconstruction" },
    });
    assert.equal(historical.captureWindowException, null);

    for (const rejectedAt of ["2026-10-12T02:41:30.999Z", "2026-10-12T04:00:00.000Z"]) {
      const outsideApproval = await finalResult("2026-10-12T10:00:00.000Z", 3083, "PERRENGUE", "91713", 11, {}, rejectedAt);
      assert.equal(outsideApproval.captureWindowException, null, rejectedAt);
      assert.equal(issueCodes(outsideApproval).includes("capture_time_outside_window"), true, rejectedAt);
    }

    const capturedInFuture = await finalResult("2026-10-12T02:49:00.000Z", 3083, "PERRENGUE", "91713", 11, {}, "2026-10-12T02:50:00.000Z");
    assert.equal(capturedInFuture.captureWindowException, null);
    assert.equal(issueCodes(capturedInFuture).includes("capture_time_outside_window"), true);

    const wrongId = await finalResult("2026-10-12T10:00:00.000Z", 3082, "PERRENGUE", "91713", 11);
    assert.equal(wrongId.captureWindowException, null);
    assert.equal(issueCodes(wrongId).includes("capture_time_outside_window"), true);

    const forgedIdentity = await finalResult("2026-10-12T10:00:00.000Z", 3083, "PERRENGUE", "91713", 11, {
      captureWindowException: { approvalRef: "call_dff2ebce693b4957bf4d52ccc737ce7b:reply" },
      reconstruction: { reconstructed: true, sourceMode: "audited_reconstruction" },
    });
    assert.equal(forgedIdentity.captureWindowException, null);
    assert.equal(issueCodes(forgedIdentity).includes("capture_time_outside_window"), true);
  } finally {
    globalThis.Date = OriginalDate;
    db.select = originalSelect;
  }
});

test("pre-upload anchors same-day editorial samples to the server receipt, not supplied provenance", async () => {
  mockContractQueries();
  globalThis.Date = class extends OriginalDate {
    constructor(...args: unknown[]) {
      super(args.length ? args[0] as string | number : "2026-10-11T03:00:00.000Z");
    }
  } as DateConstructor;
  try {
    const receivedAt = new Date("2026-10-10T22:08:57.439Z");
    const valid = await validateAuditChecklist({
      insertionId: 3063, date: targetDate, phase: "pre_upload",
      metadata: metadata({
        requestedCaptureAt: null,
        contentDateSamples: ["2026-10-10T22:00:00Z"],
        captureClass: "scheduled",
        capturedAt: "2026-10-10T22:08:57.439Z",
        sourceJobId: "untrusted-client-job",
      }),
      preUploadReceivedAt: receivedAt,
    });
    assert.equal(valid.contract.ok, true);
    assert.equal(issueCodes(valid).includes("editorial_date_target_mismatch"), false);
    assert.equal(issueCodes(valid).includes("retro_content_unverified"), false);
    assert.equal(valid.audit?.contentTimeline?.targetDate, targetDate);

    const wrongDate = await validateAuditChecklist({
      insertionId: 3063, date: targetDate, phase: "pre_upload",
      metadata: metadata({ requestedCaptureAt: null, contentDateSamples: ["2026-10-09T22:00:00Z"] }),
      preUploadReceivedAt: receivedAt,
    });
    assert.equal(issueCodes(wrongDate).includes("editorial_date_target_mismatch"), true);

    const futureSample = await validateAuditChecklist({
      insertionId: 3063, date: targetDate, phase: "pre_upload",
      metadata: metadata({ requestedCaptureAt: null, contentDateSamples: ["2026-10-10T23:30:00-04:00"] }),
      preUploadReceivedAt: receivedAt,
    });
    assert.equal(issueCodes(futureSample).includes("metadata_content_time_mismatch"), true);

    const missingDate = await validateAuditChecklist({
      insertionId: 3063, date: targetDate, phase: "pre_upload",
      metadata: metadata({ requestedCaptureAt: null, contentDateSamples: [] }),
      preUploadReceivedAt: receivedAt,
    });
    assert.equal(issueCodes(missingDate).includes("editorial_date_target_mismatch"), true);
  } finally {
    globalThis.Date = OriginalDate;
    db.select = originalSelect;
  }
});

test("real checklist preserves historical editorial gate before upload", async () => {
  mockContractQueries();
  try {
    for (const [retroGate, blocked] of [
      [{ ok: true }, true],
      [{ ok: true, editorialContentMatches: true, editorialMemeLeaks: [] }, false],
    ] as const) {
      const result = await validateAuditChecklist({
        insertionId: 3063, date: "2026-10-09", phase: "pre_upload",
        metadata: metadata({
          requestedCaptureAt: "2026-10-09T18:30:00-04:00",
          contentDateSamples: ["2026-10-09T22:00:00Z"],
          retroGate,
        }),
        preUploadReceivedAt: new OriginalDate("2026-10-10T22:30:00.000Z"),
      });
      assert.equal(result.contract.ok, true);
      assert.equal(issueCodes(result).includes("retro_editorial_audit_missing"), blocked);
      assert.equal(issueCodes(result).includes("editorial_date_target_mismatch"), false);
    }

    const missingRequestedTime = await validateAuditChecklist({
      insertionId: 3063, date: "2026-10-09", phase: "pre_upload",
      metadata: metadata({ requestedCaptureAt: null, contentDateSamples: ["2026-10-09T22:00:00Z"] }),
      preUploadReceivedAt: new OriginalDate("2026-10-10T22:30:00.000Z"),
    });
    assert.equal(issueCodes(missingRequestedTime).includes("capture_time_outside_window"), true);
    assert.equal(issueCodes(missingRequestedTime).includes("retro_editorial_audit_missing"), true);
    assert.equal(issueCodes(missingRequestedTime).includes("editorial_date_target_mismatch"), true);
  } finally {
    db.select = originalSelect;
  }
});

test("final checklist cannot turn a forged requested clock into approved provenance", async () => {
  mockContractQueries();
  try {
    const result = await validateAuditChecklist({
      insertionId: 3063, date: targetDate, phase: "final",
      metadata: metadata({ requestedCaptureAt: null, contentDateSamples: ["2026-10-10T22:00:00Z"] }),
      preUploadReceivedAt: new OriginalDate("2026-10-10T22:30:00.000Z"),
    });
    assert.equal(result.contract.ok, true);
    assert.equal(result.approved, false);
    assert.equal(result.preliminary, false);
    assert.equal(result.audit?.contentTimeline?.reason, "invalid_capture_at");
  } finally {
    db.select = originalSelect;
  }
});

test("OMT live clock compares visible time to trusted server time, while historical and other portals keep existing behavior", async () => {
  mockContractQueries("OMT", 501);
  globalThis.Date = class extends OriginalDate {
    constructor(...args: unknown[]) {
      super(args.length ? args[0] as string | number : "2026-10-11T01:20:00.000Z");
    }
  } as DateConstructor;
  const receivedAt = new OriginalDate("2026-10-11T01:15:00.000Z");
  const visibleTime = "10/10/2026 às 21:15";
  const wrongFourHours = "10/10/2026 às 17:15";
  const pageVisibleTime = "sábado, 10 de outubro de 2026 às 21:15";
  const wrongPageTime = "sábado, 10 de outubro de 2026 às 17:15";
  try {
    const preUploadGood = await validateAuditChecklist({
      insertionId: 501, date: targetDate, phase: "pre_upload",
      metadata: metadata({ siteSigla: "OMT", requestedCaptureAt: null, systemDateTime: visibleTime, pageDateObserved: pageVisibleTime }),
      preUploadReceivedAt: receivedAt,
    });
    const preUploadWrong = await validateAuditChecklist({
      insertionId: 501, date: targetDate, phase: "pre_upload",
      metadata: metadata({ siteSigla: "OMT", requestedCaptureAt: null, systemDateTime: wrongFourHours, pageDateObserved: wrongPageTime }),
      preUploadReceivedAt: receivedAt,
    });
    assert.equal(issueCodes(preUploadGood).includes("metadata_desktop_time_mismatch"), false);
    assert.equal(issueCodes(preUploadWrong).includes("metadata_desktop_time_mismatch"), true);

    const finalMetadata = metadata({
      siteSigla: "PERRENGUE", // The canonical OMT contract, not caller metadata, must scope the guard.
      requestedCaptureAt: null,
      captureClass: "scheduled",
      targetDate,
      sourceJobId: "omt-live-job-1",
      auditPolicyVersion: "audit-policy-v1",
      systemDateTime: visibleTime,
      pageDateObserved: pageVisibleTime,
    });
    attachServerCaptureProvenance(finalMetadata, {
      targetDate,
      sourceJobId: "omt-live-job-1",
      capturedAt: receivedAt.toISOString(),
      uploadedUrl: "https://cdn.example.test/omt-proof.png",
    });
    const finalGood = await validateAuditChecklist({ insertionId: 501, date: targetDate, phase: "final", metadata: finalMetadata });
    const finalWrongMetadata = { ...finalMetadata, systemDateTime: wrongFourHours, pageDateObserved: wrongPageTime };
    attachServerCaptureProvenance(finalWrongMetadata, {
      targetDate,
      sourceJobId: "omt-live-job-1",
      capturedAt: receivedAt.toISOString(),
      uploadedUrl: "https://cdn.example.test/omt-proof.png",
    });
    const finalWrong = await validateAuditChecklist({ insertionId: 501, date: targetDate, phase: "final", metadata: finalWrongMetadata });
    assert.equal(issueCodes(finalGood).includes("metadata_desktop_time_mismatch"), false);
    assert.equal(issueCodes(finalWrong).includes("metadata_desktop_time_mismatch"), true);

    const wrongSiteClock = metadata({
      siteSigla: "OMT", requestedCaptureAt: null,
      systemDateTime: "10/10/2026 às 18:02",
      pageDateObserved: "sábado, 10 de outubro de 2026 às 13:58:49",
    });
    const pageClockPreUpload = await validateAuditChecklist({
      insertionId: 501, date: targetDate, phase: "pre_upload", metadata: wrongSiteClock,
      preUploadReceivedAt: new OriginalDate("2026-10-10T22:02:52.000Z"),
    });
    assert.equal(issueCodes(pageClockPreUpload).includes("metadata_desktop_time_mismatch"), false);
    assert.equal(issueCodes(pageClockPreUpload).includes("page_time_mismatch"), true);

    const wrongSiteClockFinal = metadata({
      siteSigla: "OMT", requestedCaptureAt: null, captureClass: "scheduled", targetDate,
      sourceJobId: "omt-live-job-page-clock", auditPolicyVersion: "audit-policy-v1",
      systemDateTime: "10/10/2026 às 18:02",
      pageDateObserved: "sábado, 10 de outubro de 2026 às 13:58:49",
    });
    attachServerCaptureProvenance(wrongSiteClockFinal, {
      targetDate, sourceJobId: "omt-live-job-page-clock", capturedAt: "2026-10-10T22:02:52.000Z",
      uploadedUrl: "https://cdn.example.test/omt-proof.png",
    });
    const pageClockFinal = await validateAuditChecklist({ insertionId: 501, date: targetDate, phase: "final", metadata: wrongSiteClockFinal });
    assert.equal(issueCodes(pageClockFinal).includes("metadata_desktop_time_mismatch"), false);
    assert.equal(issueCodes(pageClockFinal).includes("page_time_mismatch"), true);

    const historical = await validateAuditChecklist({
      insertionId: 501, date: targetDate, phase: "final",
      metadata: metadata({ siteSigla: "OMT", requestedCaptureAt: "2026-10-10T18:00:00-04:00", systemDateTime: wrongFourHours }),
    });
    assert.equal(issueCodes(historical).includes("metadata_desktop_time_mismatch"), true);

    mockContractQueries("PERRENGUE", 3063);
    const otherPortal = await validateAuditChecklist({
      insertionId: 3063, date: targetDate, phase: "pre_upload",
      metadata: metadata({ requestedCaptureAt: null, systemDateTime: "sábado, 10 de outubro de 2026 às 21:14" }),
      preUploadReceivedAt: receivedAt,
    });
    assert.equal(issueCodes(otherPortal).includes("page_time_mismatch"), false);

    mockContractQueries("OMT", 502);
    const crossMinute = await validateAuditChecklist({
      insertionId: 502, date: targetDate, phase: "pre_upload",
      metadata: metadata({ siteSigla: "OMT", requestedCaptureAt: null, systemDateTime: "10/10/2026 às 18:04", pageDateObserved: "sábado, 10 de outubro de 2026 às 18:04" }),
      preUploadReceivedAt: new OriginalDate("2026-10-10T22:05:00.000Z"),
    });
    assert.equal(issueCodes(crossMinute).includes("metadata_desktop_time_mismatch"), false, JSON.stringify(crossMinute.blockingIssues));

    const wrongDate = await validateAuditChecklist({
      insertionId: 502, date: targetDate, phase: "pre_upload",
      metadata: metadata({ siteSigla: "OMT", requestedCaptureAt: null, systemDateTime: "09/10/2026 às 21:15", pageDateObserved: "sexta-feira, 09 de outubro de 2026 às 21:15" }),
      preUploadReceivedAt: receivedAt,
    });
    assert.equal(issueCodes(wrongDate).includes("metadata_desktop_time_mismatch"), true);

    const historicalMatchingItsRequestedTime = await validateAuditChecklist({
      insertionId: 502, date: "2026-10-09", phase: "final",
      metadata: metadata({
        siteSigla: "OMT",
        requestedCaptureAt: "2026-10-09T17:15:00-04:00",
        systemDateTime: "sexta-feira, 09 de outubro de 2026 às 17:15",
      }),
    });
    assert.equal(issueCodes(historicalMatchingItsRequestedTime).includes("metadata_desktop_time_mismatch"), false);

    const explicitCurrentRequestedTime = await validateAuditChecklist({
      insertionId: 502, date: targetDate, phase: "pre_upload",
      metadata: metadata({
        siteSigla: "OMT",
        requestedCaptureAt: "2026-10-10T18:00:00-04:00",
        systemDateTime: "10/10/2026 às 18:02",
        pageDateObserved: "sábado, 10 de outubro de 2026 às 18:02",
      }),
      preUploadReceivedAt: new OriginalDate("2026-10-10T22:02:52.000Z"),
    });
    assert.equal(issueCodes(explicitCurrentRequestedTime).includes("metadata_desktop_time_mismatch"), true);
    assert.equal(issueCodes(explicitCurrentRequestedTime).includes("metadata_page_time_mismatch"), true);

    const pastDateWithoutLiveFallback = await validateAuditChecklist({
      insertionId: 502, date: "2026-10-09", phase: "pre_upload",
      metadata: metadata({
        siteSigla: "OMT", requestedCaptureAt: null,
        systemDateTime: "09/10/2026 13:58",
        pageDateObserved: "sexta-feira, 09 de outubro de 2026 às 13:58",
      }),
      preUploadReceivedAt: new OriginalDate("2026-10-10T22:02:52.000Z"),
    });
    assert.equal(issueCodes(pastDateWithoutLiveFallback).includes("page_time_mismatch"), false);

    assert.equal(pageTextMatchesRequestedCaptureAt("sábado, 10 de outubro de 2026 às 18:04:00", "2026-10-10T18:02:59"), true);
    assert.equal(pageTextMatchesRequestedCaptureAt("sábado, 10 de outubro de 2026 às 18:04:29", "2026-10-10T18:02:59"), true);
    assert.equal(pageTextMatchesRequestedCaptureAt("sábado, 10 de outubro de 2026 às 18:04:30", "2026-10-10T18:02:59"), false);
    assert.equal(pageTextMatchesRequestedCaptureAt("sábado, 10 de outubro de 2026 às 18:04", "2026-10-10T18:05:03"), true);
    assert.equal(pageTextMatchesRequestedCaptureAt("sábado, 10/10/2026, 18:04", "2026-10-10T18:05:03"), true);
    assert.equal(pageTextMatchesRequestedCaptureAt("sábado, 10/10/2026, 18:04:30", "2026-10-10T18:02:59"), false);
    assert.equal(pageTextMatchesRequestedCaptureAt("domingo, 11/10/2026, 18:04", "2026-10-10T18:05:03"), false);
  } finally {
    globalThis.Date = OriginalDate;
    db.select = originalSelect;
  }
});

test("OMT final audit keeps original live clock comparison after the target day", async () => {
  mockContractQueries("OMT", 501);
  globalThis.Date = class extends OriginalDate {
    constructor(...args: unknown[]) {
      super(args.length ? args[0] as string | number : "2026-10-12T16:00:00.000Z");
    }
  } as DateConstructor;
  try {
    const targetDate = "2026-10-11";
    const capturedAt = "2026-10-11T22:02:52.000Z"; // 18:02:52 in Cuiaba.
    const makeFinalMetadata = (pageDateObserved: string, overrides: Record<string, unknown> = {}) => {
      const value = metadata({
        siteSigla: "OMT",
        requestedCaptureAt: null,
        captureClass: "scheduled",
        targetDate,
        sourceJobId: "omt-next-day-live-clock",
        auditPolicyVersion: "audit-policy-v1",
        systemDateTime: "11/10/2026 às 18:02",
        pageDateObserved,
        ...overrides,
      });
      attachServerCaptureProvenance(value, {
        targetDate,
        sourceJobId: "omt-next-day-live-clock",
        capturedAt,
        uploadedUrl: "https://cdn.example.test/omt-proof.png",
      });
      return value;
    };

    const wrongPageClock = await validateAuditChecklist({
      insertionId: 501,
      date: targetDate,
      phase: "final",
      metadata: makeFinalMetadata("domingo, 11/10/2026, 13:58", {
        reconstruction: { context: "not reconstructed", reconstructed: false },
      }),
    });
    assert.equal(issueCodes(wrongPageClock).includes("page_time_mismatch"), true);

    const matchingPageClock = await validateAuditChecklist({
      insertionId: 501,
      date: targetDate,
      phase: "final",
      metadata: makeFinalMetadata("domingo, 11/10/2026, 18:02"),
    });
    assert.equal(issueCodes(matchingPageClock).includes("metadata_desktop_time_mismatch"), false);
    assert.equal(issueCodes(matchingPageClock).includes("page_time_mismatch"), false);

    const signedPreviewWithoutRequestedClock = await validateAuditChecklist({
      insertionId: 501,
      date: targetDate,
      phase: "final",
      metadata: makeFinalMetadata("domingo, 11/10/2026, 13:58", {
        retroContentProof: { sourceMode: "signed_preview", reconstructed: false, status: "approved" },
      }),
    });
    assert.equal(issueCodes(signedPreviewWithoutRequestedClock).includes("page_time_mismatch"), false);

    const explicitReconstructionWithoutLiveFallback = await validateAuditChecklist({
      insertionId: 501,
      date: targetDate,
      phase: "final",
      metadata: makeFinalMetadata("domingo, 11/10/2026, 13:58", {
        reconstruction: { reason: "late_publication_recovery", reconstructed: true },
      }),
    });
    assert.equal(issueCodes(explicitReconstructionWithoutLiveFallback).includes("page_time_mismatch"), false);

    const signedHistoricalPreview = await validateAuditChecklist({
      insertionId: 501,
      date: targetDate,
      phase: "final",
      metadata: makeFinalMetadata("domingo, 11/10/2026, 13:58", {
        captureClass: "historical_recovery",
        requestedCaptureAt: "2026-10-11T18:02:00-04:00",
        retroContentProof: { sourceMode: "signed_preview", reconstructed: false, status: "approved" },
      }),
    });
    assert.equal(issueCodes(signedHistoricalPreview).includes("metadata_page_time_mismatch"), true);
  } finally {
    db.select = originalSelect;
    globalThis.Date = OriginalDate;
  }
});
