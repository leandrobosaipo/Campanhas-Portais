function normalized(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function piDigits(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

function sourceReference(source, row) {
  return `planilha:${source.sourceSha256}:pi:${piDigits(row.piCodigo)}`;
}

export function planCommercialReconciliation(source) {
  if (source?.complete !== true || source?.inventoryComplete !== true || !/^[a-f0-9]{64}$/i.test(String(source?.sourceSha256 || ""))
    || !Array.isArray(source?.rows) || !Array.isArray(source?.insertions) || !Array.isArray(source?.agencies)) {
    return { complete: false, status: "source_unavailable", scanned: 0, actions: [], pendingReview: [{ reason: "source_or_inventory_incomplete" }] };
  }
  const actions = [];
  const pendingReview = [];
  const seenCampaigns = new Map();
  for (const item of source.insertions) {
    const insertionId = Number(item.insertionId);
    const campaignId = Number(item.campaignId);
    const sourcePi = piDigits(item.piCodigo);
    const base = { insertionId, campaignId };
    if (!Number.isInteger(insertionId) || !Number.isInteger(campaignId)) {
      pendingReview.push({ ...base, reason: "invalid_inventory_identity" });
      continue;
    }
    if (!sourcePi) {
      const candidates = source.rows.filter((row) =>
        normalized(row.siteSigla) === normalized(item.siteSigla)
        && row.inicio === item.periodoInicio && row.fim === item.periodoFim
        && normalized(row.localFormatoNormalizado) === normalized(item.localFormatoNormalizado || item.localFormato)
        && normalized(row.campanha) === normalized(item.campaignName));
      pendingReview.push({ ...base, reason: "canonical_pi_missing", candidates: candidates.map((row) => ({
        piCodigo: row.piCodigo ?? null, sourceSheet: row.sourceSheet, peca: row.peca ?? null,
      })).slice(0, 10) });
      continue;
    }
    if (!item.mediaUrl) {
      pendingReview.push({ ...base, reason: "media_missing" });
      continue;
    }
    const candidates = source.rows.filter((row) =>
      piDigits(row.piCodigo) === sourcePi
      && normalized(row.siteSigla) === normalized(item.siteSigla)
      && row.inicio === item.periodoInicio && row.fim === item.periodoFim
      && normalized(row.localFormatoNormalizado) === normalized(item.localFormatoNormalizado || item.localFormato)
      && normalized(row.campanha) === normalized(item.campaignName));
    if (candidates.length !== 1) {
      pendingReview.push({ ...base, reason: candidates.length ? "source_ambiguous" : "source_match_missing", candidateCount: candidates.length });
      continue;
    }
    const row = candidates[0];
    const agencyMatches = source.agencies.filter((agency) => normalized(agency.nome) === normalized(row.agencyNameHint));
    const agencyId = agencyMatches.length === 1 && normalized(row.agencyNameHint) !== "NAO INFORMADO" ? Number(agencyMatches[0].id) : null;
    const amount = row.valorLiquidoHint == null ? null : Number(row.valorLiquidoHint);
    const sourceRef = sourceReference(source, row);
    const commercial = {
      piCodigo: row.piCodigo,
      competencia: row.competenciaResolved,
      ...(agencyId ? { agenciaId: agencyId } : {}),
      ...(amount != null && Number.isFinite(amount) ? { valorLiquido: amount } : {}),
      planilhaRef: row.sourceSheet,
    };
    const conflicts = [];
    for (const [field, value] of Object.entries(commercial)) {
      const current = item[field];
      if (current == null || String(current).trim() === "") continue;
      if (field === "planilhaRef") continue;
      const same = field === "piCodigo" ? piDigits(current) === piDigits(value)
        : field === "valorLiquido" ? Number(current) === Number(value)
          : field === "agenciaId" ? Number(current) === Number(value)
            : normalized(current) === normalized(value);
      if (!same) conflicts.push(field);
    }
    if (conflicts.length) {
      pendingReview.push({ ...base, reason: "commercial_conflict", fields: conflicts });
      continue;
    }
    const fields = Object.fromEntries(Object.entries(commercial).filter(([field]) => item[field] == null || String(item[field]).trim() === ""));
    const proposal = { ...base, sourceRef, expectedUpdatedAt: item.updatedAt, fields, agencyUnresolved: !agencyId, clientUnresolved: item.clienteId == null };
    const previous = seenCampaigns.get(campaignId);
    if (previous && JSON.stringify(previous.fields) !== JSON.stringify(fields)) {
      pendingReview.push({ ...base, reason: "campaign_source_conflict" });
      const index = actions.findIndex((action) => action.campaignId === campaignId);
      if (index >= 0) actions.splice(index, 1);
      seenCampaigns.set(campaignId, { conflicted: true });
      continue;
    }
    if (previous?.conflicted) continue;
    if (!previous && Object.keys(fields).length) actions.push(proposal);
    seenCampaigns.set(campaignId, proposal);
    if (!agencyId && item.agenciaId == null) pendingReview.push({ ...base, reason: "agency_reference_unverified" });
    if (item.clienteId == null) pendingReview.push({ ...base, reason: "client_source_is_inferred" });
  }
  return { complete: true, status: "preflight", scanned: source.insertions.length, actions, pendingReview };
}
