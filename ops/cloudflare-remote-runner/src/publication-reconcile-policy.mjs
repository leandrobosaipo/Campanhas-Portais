function cod5_string(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function planCampaignPublicationReconciliation(items, checkedAt) {
  const cod5_actions = [];
  const cod5_blockers = [];
  for (const cod5_item of Array.isArray(items) ? items : []) {
    const cod5_insertionId = Number(cod5_item?.adops?.insertionId || 0);
    const cod5_status = cod5_string(cod5_item?.resolutionStatus);
    if (!Number.isInteger(cod5_insertionId) || cod5_insertionId <= 0) {
      cod5_blockers.push({ insertionId: null, code: "missing_canonical_insertion", reason: "A campanha não possui inserção canônica para retomar." });
      continue;
    }
    if (cod5_status === "published") continue;
    if (cod5_status === "ready_for_publication" && ["operational_identity", "sheet_drive_composite"].includes(cod5_item?.identityMode)) {
      const cod5_campaignId = Number(cod5_item?.adops?.campaignId || 0);
      const cod5_source = cod5_item?.operationalIdentity?.source;
      const cod5_fingerprint = cod5_string(cod5_item?.operationalIdentity?.fingerprint);
      const cod5_media = Array.isArray(cod5_source?.media) ? cod5_source.media : [];
      const cod5_documents = Array.isArray(cod5_source?.destinationDocuments) ? cod5_source.destinationDocuments : [];
      const cod5_pdfs = Array.isArray(cod5_source?.pdfDocuments) ? cod5_source.pdfDocuments : [];
      const cod5_mediaProfile = cod5_source?.operationalMediaProfile;
      const cod5_composite = cod5_item?.identityMode === "sheet_drive_composite";
      const cod5_expectedPi = cod5_string(cod5_source?.expectedPiCodigo || cod5_item?.sourceIdentity?.canonicalPi);
      if (!Number.isInteger(cod5_campaignId) || cod5_campaignId <= 0 || !cod5_fingerprint || !cod5_mediaProfile || cod5_media.length !== 1 || cod5_documents.length !== 1 || (cod5_composite && (cod5_pdfs.length !== 1 || !cod5_expectedPi))) {
        cod5_blockers.push({ insertionId: cod5_insertionId, code: "operational_preflight_source_incomplete", reason: "Identidade operacional não contém uma única mídia, destino e fingerprint." });
        continue;
      }
      cod5_actions.push({
        type: "operational_media_publish",
        insertionId: cod5_insertionId,
        payload: {
          identityMode: cod5_item.identityMode,
          expectedPiCodigo: cod5_composite ? cod5_expectedPi : undefined,
          expectedCampaignId: cod5_campaignId,
          expectedInsertionId: cod5_insertionId,
          expectedSiteSigla: cod5_string(cod5_item?.siteSigla),
          expectedFormat: cod5_string(cod5_item?.format?.normalized || cod5_item?.format?.sheet),
          expectedPeriodStart: cod5_string(cod5_item?.period?.start),
          expectedPeriodEnd: cod5_string(cod5_item?.period?.end),
          sheetSource: cod5_item?.sheetSource ?? null,
          folderId: cod5_string(cod5_source?.folderId),
          folderPath: cod5_string(cod5_source?.folderPath),
          media: cod5_media[0],
          pdfDocument: cod5_composite ? cod5_pdfs[0] : undefined,
          destinationDocument: cod5_documents[0],
          mediaProfile: cod5_mediaProfile,
          fingerprint: cod5_fingerprint,
        },
      });
      continue;
    }
    if (cod5_status === "awaiting_authoritative_pi") {
      cod5_blockers.push({
        insertionId: cod5_insertionId,
        campaignId: Number(cod5_item?.adops?.campaignId || 0) || null,
        code: "awaiting_authoritative_pi",
        reason: cod5_string(cod5_item?.resolutionReason) || "Aguardando PI/PDF autoritativa.",
        folderId: cod5_string(cod5_item?.drive?.folderId) || null,
      });
      continue;
    }
    if (cod5_status === "ready_for_preflight") {
      const cod5_folderId = cod5_string(cod5_item?.drive?.folderId);
      const cod5_folderPath = cod5_string(cod5_item?.drive?.folderPath);
      const cod5_canonicalPi = cod5_string(cod5_item?.sourceIdentity?.canonicalPi);
      if (!cod5_folderId || !cod5_folderPath || !cod5_canonicalPi || cod5_item?.drive?.documentStatus !== "candidate_found") {
        cod5_blockers.push({ insertionId: cod5_insertionId, code: "preflight_source_incomplete", reason: "Pasta, PI canônica ou PDF ainda não estão confirmados." });
        continue;
      }
      cod5_actions.push({
        type: "drive_pi_publish",
        insertionId: cod5_insertionId,
        event: {
          eventId: `campaign-reconcile:${cod5_insertionId}:${cod5_string(cod5_item?.drive?.inventoryScanId) || cod5_canonicalPi}`,
          driveFileId: cod5_folderId,
          name: cod5_folderPath.split("/").filter(Boolean).at(-1) || `PI ${cod5_canonicalPi}`,
          mimeType: "application/vnd.google-apps.folder",
          path: cod5_folderPath,
          parentFolderId: null,
          modifiedTime: checkedAt,
          webViewLink: null,
          eventType: "folder_updated",
          explicitFolder: true,
          strictInsertionScope: true,
          expectedCampaignId: Number(cod5_item?.adops?.campaignId || 0),
          expectedInsertionId: cod5_insertionId,
          expectedPiCodigo: cod5_canonicalPi,
          publish: true,
          generateEvidence: true,
          purgeCache: true,
          source: "campaign-publication-reconcile-api-publish",
        },
      });
      continue;
    }
    if (cod5_status === "ready_for_publication") {
      cod5_actions.push({
        type: "adrotate_publish",
        insertionId: cod5_insertionId,
        payload: {
          insertionId: cod5_insertionId,
          apply: true,
          replaceExisting: true,
          purgeCache: true,
          generateEvidence: true,
        },
      });
      continue;
    }
    cod5_blockers.push({
      insertionId: cod5_insertionId,
      code: "failed_retryable",
      reason: cod5_string(cod5_item?.resolutionReason) || "A pendência requer nova leitura das fontes.",
    });
  }
  return { actions: cod5_actions, blockers: cod5_blockers };
}
