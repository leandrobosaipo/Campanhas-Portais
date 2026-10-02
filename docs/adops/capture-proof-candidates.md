# Candidate capture audit

Candidate captures use a separate, append-only registry. Registering or evaluating one never writes to `evidences`, `capture_proof_logs`, the canonical metadata file, or the public evidence status.

These endpoints are on the private API and require the existing `x-adops-api-token` internal credential:

```text
POST /api/internal/insertions/{insertionId}/capture-proof/candidates
GET  /api/internal/insertions/{insertionId}/capture-proof/candidates?date=YYYY-MM-DD
GET  /api/internal/capture-proof-candidates/{candidateId}
POST /api/internal/capture-proof-candidates/{candidateId}/audit
```

Registration body:

```json
{"date":"YYYY-MM-DD","sourceJobId":"persisted-print-job-id"}
```

The server reads the candidate metadata from its candidate-only print directory and checks the persisted `print_jobs` row, its target and runner job, capture and upload stages, candidate object path, and object readback. It records SHA-256, byte count, the server-correlated capture time, capture stage start/end bounds, and a separate server `receivedAt`. Caller-supplied capture metadata or timestamps are not accepted.

`POST .../{candidateId}/audit` reruns the complete audit checklist against the immutable candidate and stores a separate `candidate_approved` or `candidate_blocked` review. Repeated reviews append records. This result is not canonical `audited` status or permission to publish. `historicalDisplayConfirmed` stays `false`.

The deployed migration is `ops/portainer/adops-stack/migrations/2026-10-02-capture-proof-candidates.sql`.

Candidate registration, audit, and promotion writes are disabled by default. To enable them, set `ADOPS_CAPTURE_PROOF_CANDIDATES_ENABLED=true` in the deployment environment; the production deploy script validates and passes that explicit value into the API container. Set it to `false` to disable writes again. Disabling the feature preserves candidate, review, and promotion records; existing authenticated internal `GET` routes remain available for readback.
