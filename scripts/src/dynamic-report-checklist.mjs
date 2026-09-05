const checklistFields = [
  ["piConfirmed", "Dados da PI conferidos", "Planilha + AdOps"],
  ["portalCorrect", "Portal correto", "Planilha + AdOps"],
  ["periodCorrect", "Período correto", "Planilha + AdOps"],
  ["formatCorrect", "Formato ou posição corretos", "Planilha + AdOps"],
  ["mediaReceived", "Mídia recebida", "Drive + AdOps"],
  ["driveFileCorrect", "Arquivo correto localizado no Drive", "Drive"],
  ["fixSheet", "Planilha precisa ser corrigida", "Decisão do operador"],
  ["fixAdops", "Cadastro do AdOps precisa ser corrigido", "Decisão do operador"],
  ["readyToPublish", "Pronta para publicação", "Conferência final"],
  ["confirmAgency", "Precisa confirmar com a agência", "Decisão do operador"],
];

export function isIncompleteCampaign(item) {
  return item?.status !== "ok"
    || (item?.requiredActions?.length ?? 0) > 0
    || (item?.blockingIssues?.length ?? 0) > 0
    || item?.publicationHealth?.status !== "ok"
    || ["missing", "invalid", "blocked_upstream"].includes(item?.evidenceHealth?.status);
}

export function campaignChecklistDefaults(item) {
  const actions = new Set(item?.requiredActions ?? []);
  const identityConfirmed = item?.sourceIdentity?.decision === "confirmed";
  const canonicalConfirmed = item?.canonicalSelection?.decision === "confirmed" || item?.adops?.status === "matched";
  const uniqueDriveFile = item?.drive?.status === "matched"
    && (item?.drive?.mediaFiles?.length ?? 0) === 1
    && item?.drive?.mediaMatchesFormat === true;
  const mediaReceived = Boolean(item?.adops?.mediaUrl) || uniqueDriveFile;
  const result = {
    piConfirmed: identityConfirmed,
    portalCorrect: identityConfirmed && canonicalConfirmed,
    periodCorrect: Boolean(item?.period?.start && item?.period?.end) && !actions.has("review_period_divergence"),
    formatCorrect: Boolean(item?.format?.normalized) && !actions.has("review_format_divergence"),
    mediaReceived,
    driveFileCorrect: uniqueDriveFile,
    fixSheet: false,
    fixAdops: false,
    readyToPublish: false,
    confirmAgency: false,
  };
  result.readyToPublish = result.piConfirmed && result.portalCorrect && result.periodCorrect
    && result.formatCorrect && result.mediaReceived && Boolean(item?.publicationHealth?.expectedGroupId)
    && (item?.blockingIssues?.length ?? 0) === 0;
  return result;
}

export function buildCampaignGuidance(item, selected) {
  const labels = Object.fromEntries(checklistFields.map(([key, label]) => [key, label]));
  const factualKeys = ["piConfirmed", "portalCorrect", "periodCorrect", "formatCorrect", "mediaReceived", "driveFileCorrect"];
  const confirmed = factualKeys.filter((key) => selected[key]).map((key) => labels[key]);
  const sheet = selected.fixSheet
    ? ["Revisar e corrigir na planilha os campos divergentes de PI, portal, período ou formato antes de sincronizar novamente."]
    : [];
  const adops = [];
  const actions = new Set(item?.requiredActions ?? []);
  if (selected.fixAdops || actions.has("create_campaign_or_insertion")) adops.push("Criar ou corrigir a campanha e a inserção no AdOps.");
  if (!selected.mediaReceived || actions.has("locate_or_upload_media")) adops.push("Confirmar a mídia correta e vinculá-la à inserção no AdOps.");
  if (actions.has("publish_on_site")) adops.push("Depois da conferência, publicar no grupo AdRotate indicado pelo AdOps.");
  if (actions.has("generate_evidence")) adops.push("Após a publicação confirmada, gerar e auditar as evidências pendentes.");
  const before = [...(item?.blockingIssues ?? [])];
  if (selected.confirmAgency) before.push("Confirmar os dados pendentes com a agência.");
  const minimumReady = ["piConfirmed", "portalCorrect", "periodCorrect", "formatCorrect", "mediaReceived"].every((key) => selected[key])
    && Boolean(item?.publicationHealth?.expectedGroupId) && before.length === 0;
  if (selected.readyToPublish && !minimumReady) before.unshift("A opção “Pronta para publicação” contradiz os dados ainda não confirmados; a campanha permanece bloqueada.");
  if (!selected.readyToPublish && minimumReady) before.push("Realizar a conferência final antes de autorizar a publicação.");
  const section = (title, values, empty) => `${title}:\n${values.length ? values.map((value) => `- ${value}`).join("\n") : `- ${empty}`}`;
  return [
    `${item?.campaignName || "Campanha"} · ${item?.piCodigo || "PI não informada"} · ${item?.siteSigla || "Portal não informado"}`,
    section("Confirmado", confirmed, "Nenhum item confirmado."),
    section("Corrigir na planilha", sheet, "Nenhuma correção indicada pelo operador."),
    section("Corrigir no AdOps", [...new Set(adops)], "Nenhuma correção identificada."),
    section("Antes de publicar", [...new Set(before)], selected.readyToPublish && minimumReady ? "Checklist concluído; campanha liberada para a etapa de publicação." : "Concluir a conferência do checklist."),
    "Orientação gerada sem alterar planilha, Drive, AdOps ou AdRotate.",
  ].join("\n\n");
}

export function installCampaignChecklist({ apiBase, escapeHtml, todayInCuiaba }) {
  const routine = document.querySelector('[data-operation-content="routine"]');
  if (!routine || document.getElementById("campaignChecklistList")) return;
  const style = document.createElement("style");
  style.textContent = ".review-section{margin-top:20px}.review-head{display:flex;justify-content:space-between;gap:12px;align-items:end}.review-list{display:grid;gap:8px;margin-top:10px}.review-card{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(150px,.8fr) auto;gap:12px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:6px;background:var(--paper)}.review-card p{margin:3px 0}.review-state{font-size:11px;color:var(--warn)}.checklist-dialog{width:min(720px,calc(100% - 24px))}.checklist-source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}.checklist-source{padding:8px;border:1px solid var(--line);border-radius:5px}.checklist-source span{display:block;color:var(--muted);font-size:10px}.checklist-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.checklist-option{display:flex;gap:9px;align-items:flex-start;min-height:52px;padding:9px;border:1px solid var(--line);border-radius:5px;cursor:pointer}.checklist-option input{width:19px;height:19px}.checklist-option span{display:grid;font-weight:750}.checklist-option small{color:var(--muted);font-weight:500}.checklist-output{white-space:pre-wrap;padding:10px;border:1px solid var(--line);border-radius:5px;background:var(--paper);font:12px/1.45 ui-monospace,SFMono-Regular,monospace}.checklist-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}@media(max-width:760px){.review-head{display:block}.review-card{grid-template-columns:1fr}.review-card .button{width:100%;min-height:44px}.checklist-source-grid,.checklist-options{grid-template-columns:1fr}.checklist-dialog{width:calc(100% - 12px);max-height:96dvh}.checklist-actions .button{flex:1;min-width:140px}}";
  document.head.append(style);
  const section = document.createElement("section");
  section.className = "review-section";
  section.innerHTML = '<div class="review-head"><div><h3>Pendências para conferência</h3><p class="count">Respostas temporárias: atualizar a página ou os dados pode descartá-las.</p></div><span class="tag warn" id="campaignChecklistCount">Carregando</span></div><div class="review-list" id="campaignChecklistList" aria-live="polite">Consultando campanhas…</div>';
  routine.insertBefore(section, routine.querySelector(".campaign-refresh"));
  const dialog = document.createElement("dialog");
  dialog.id = "campaignChecklistDialog";
  dialog.className = "checklist-dialog";
  dialog.innerHTML = '<div class="dialog-head"><h2 id="campaignChecklistTitle">Conferir pendências</h2><button class="button" id="campaignChecklistClose" type="button">Fechar</button></div><div class="dialog-body"><p id="campaignChecklistMeta" class="count"></p><div id="campaignChecklistSources" class="checklist-source-grid"></div><form id="campaignChecklistForm"><fieldset><legend>Confirme o que está correto e o que precisa ser feito</legend><div id="campaignChecklistOptions" class="checklist-options"></div></fieldset><div class="checklist-actions"><button class="button primary" type="submit">Gerar orientação</button><button class="button" id="campaignChecklistCopy" type="button" hidden>Copiar orientação</button></div></form><div id="campaignChecklistOutput" class="checklist-output" role="status" aria-live="polite" hidden></div></div>';
  document.body.append(dialog);
  const answers = new Map();
  let campaigns = [];
  let currentKey = null;
  const keyFor = (item) => [item.piCodigo, item.siteSigla, item.period?.start, item.period?.end, item.format?.normalized, item.sheetSource?.rowNumber, item.adops?.insertionId].join("|");
  const describeState = (item) => item.blockingIssues?.[0] || String(item.status || item.publicationHealth?.reason || "pendente").replaceAll("_", " ");
  const rank = (item) => item.period?.start > todayInCuiaba() ? 2 : item.blockingIssues?.length ? 0 : 1;
  const renderList = () => {
    const list = document.getElementById("campaignChecklistList");
    const incomplete = campaigns.filter(isIncompleteCampaign).sort((left, right) => rank(left) - rank(right) || String(left.period?.start).localeCompare(String(right.period?.start)));
    document.getElementById("campaignChecklistCount").textContent = `${incomplete.length} ${incomplete.length === 1 ? "campanha" : "campanhas"}`;
    list.innerHTML = incomplete.length ? incomplete.map((item) => `<article class="review-card"><div><strong>${escapeHtml(item.campaignName || "Campanha")}</strong><p class="count">${escapeHtml(item.piCodigo || "PI não informada")} · ${escapeHtml(item.siteSigla || "Portal não informado")} · ${escapeHtml(item.period?.start || "—")} a ${escapeHtml(item.period?.end || "—")}</p></div><div><strong>${escapeHtml(item.format?.normalized || item.format?.sheet || "Formato não informado")}</strong><p class="review-state">${escapeHtml(describeState(item))}</p></div><button class="button checklist-open" type="button" data-key="${escapeHtml(keyFor(item))}">Conferir pendências</button></article>`).join("") : '<div class="empty">Nenhuma campanha incompleta foi identificada.</div>';
    list.querySelectorAll(".checklist-open").forEach((button) => button.addEventListener("click", () => openChecklist(button.dataset.key)));
  };
  const sourceValue = (label, value) => `<div class="checklist-source"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Não informado")}</strong></div>`;
  const openChecklist = (key) => {
    const item = campaigns.find((candidate) => keyFor(candidate) === key);
    if (!item) return;
    currentKey = key;
    const selected = answers.get(key) || campaignChecklistDefaults(item);
    answers.set(key, selected);
    document.getElementById("campaignChecklistTitle").textContent = item.campaignName || "Campanha";
    document.getElementById("campaignChecklistMeta").textContent = `${item.piCodigo || "PI não informada"} · ${item.siteSigla || "Portal não informado"} · ${item.period?.start || "—"} a ${item.period?.end || "—"}`;
    document.getElementById("campaignChecklistSources").innerHTML = [sourceValue("Planilha", `${item.sheetSource?.sheetName || "Não informada"} · linha ${item.sheetSource?.rowNumber || "—"}`), sourceValue("Drive", item.drive?.status === "unavailable" ? "Não foi possível consultar" : item.drive?.status), sourceValue("AdOps", item.adops?.status), sourceValue("Verificação pública", item.adops?.publicConfirmation)].join("");
    document.getElementById("campaignChecklistOptions").innerHTML = checklistFields.map(([field, label, source]) => `<label class="checklist-option"><input type="checkbox" name="${field}" ${selected[field] ? "checked" : ""}><span>${escapeHtml(label)}<small>${escapeHtml(source)}</small></span></label>`).join("");
    document.getElementById("campaignChecklistOutput").hidden = true;
    document.getElementById("campaignChecklistCopy").hidden = true;
    dialog.showModal();
  };
  const loadChecklist = async () => {
    const list = document.getElementById("campaignChecklistList");
    try {
      const response = await fetch(`${apiBase}/api/campaign-operations/active?date=${todayInCuiaba()}&includeEvidence=false&refreshDrive=false`);
      if (!response.ok) throw new Error(`API respondeu HTTP ${response.status}`);
      const payload = await response.json();
      campaigns = [...(payload.items || []), ...(payload.upcomingItems || [])];
      renderList();
    } catch (error) {
      list.innerHTML = `<div class="notice bad">Não foi possível consultar as campanhas: ${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
      document.getElementById("campaignChecklistCount").textContent = "Indisponível";
    }
  };
  document.getElementById("campaignChecklistClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  document.getElementById("campaignChecklistForm").addEventListener("change", (event) => {
    if (!currentKey || !(event.target instanceof HTMLInputElement)) return;
    answers.get(currentKey)[event.target.name] = event.target.checked;
  });
  document.getElementById("campaignChecklistForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const item = campaigns.find((candidate) => keyFor(candidate) === currentKey);
    if (!item) return;
    const output = document.getElementById("campaignChecklistOutput");
    output.textContent = buildCampaignGuidance(item, answers.get(currentKey));
    output.hidden = false;
    document.getElementById("campaignChecklistCopy").hidden = false;
  });
  document.getElementById("campaignChecklistCopy").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const text = document.getElementById("campaignChecklistOutput").textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    button.textContent = "Orientação copiada";
  });
  const refreshButton = document.getElementById("campaignRefreshButton");
  const refreshStatus = document.getElementById("campaignRefreshStatus");
  if (refreshButton && refreshStatus) new MutationObserver(() => {
    if (!refreshButton.disabled && /^(Atualizado agora:|Não foi possível)/.test(refreshStatus.textContent)) loadChecklist();
  }).observe(refreshStatus, { childList: true, characterData: true, subtree: true });
  loadChecklist();
}

export const campaignChecklistRuntime = [
  `const checklistFields=${JSON.stringify(checklistFields)};`,
  isIncompleteCampaign.toString(),
  campaignChecklistDefaults.toString(),
  buildCampaignGuidance.toString(),
  installCampaignChecklist.toString(),
].join("\n").replace(/\n\s*/g, "");
