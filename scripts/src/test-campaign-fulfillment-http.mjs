import assert from "node:assert/strict";

const baseUrl = String(process.env.ADOPS_TEST_API_BASE_URL || "").replace(/\/$/, "");
const token = process.env.ADOPS_TEST_API_TOKEN || "";
if (!baseUrl || !token) throw new Error("Defina ADOPS_TEST_API_BASE_URL e ADOPS_TEST_API_TOKEN.");

const payload = { piCodigo: "90729", siteSigla: "ROO", campaignDate: "2026-07-15", sendTelegram: false };
const idempotencyKey = `fulfillment:http-test:${Date.now()}`;
const create = (body, authorized = true) => fetch(`${baseUrl}/api/campaign-fulfillments/jobs`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
    ...(authorized ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

const unauthorized = await create(payload, false);
assert.equal(unauthorized.status, 401);

const concurrent = await Promise.all([create(payload), create(payload)]);
assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 202]);
const accepted = await Promise.all(concurrent.map((response) => response.json()));
assert.equal(accepted[0].jobId, accepted[1].jobId);
assert.equal(accepted.filter((item) => item.duplicate === false).length, 1);

const conflict = await create({ ...payload, campaignDate: "2026-07-16" });
assert.equal(conflict.status, 409);
assert.equal((await conflict.json()).error, "idempotency_conflict");

const status = await fetch(`${baseUrl}/api/campaign-fulfillments/jobs/${accepted[0].jobId}`);
assert.equal(status.status, 200);
const statusBody = await status.json();
assert.equal(statusBody.kind, "campaign-fulfillment");
assert.equal(statusBody.payload.campaignDate, "2026-07-15");

const report = await fetch(`${baseUrl}/api/campaign-fulfillments/jobs/${accepted[0].jobId}/report`);
assert.equal(report.status, 200);
assert.match(report.headers.get("content-type") || "", /text\/html/);
assert.match(await report.text(), /dossiê operacional/);

const reportPdf = await fetch(`${baseUrl}/api/campaign-fulfillments/jobs/${accepted[0].jobId}/report.pdf`);
assert.equal(reportPdf.status, 200);
assert.match(reportPdf.headers.get("content-type") || "", /application\/pdf/);
assert((await reportPdf.arrayBuffer()).byteLength > 10_000);

console.log(JSON.stringify({ ok: true, jobId: accepted[0].jobId, idempotency: "concurrent-safe", report: "html+pdf" }));
