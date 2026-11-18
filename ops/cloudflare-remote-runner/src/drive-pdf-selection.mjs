// The triggering media and the official PDF are different resources.
export function selectDrivePackagePdf(items, archived = null, payload = {}) {
  const pdfs = items.filter(item => item.mimeType === 'application/pdf' || /\.pdf$/i.test(item.name ?? ''));
  if (pdfs.length > 1) return { item: null, archive: null, issues: ['multiple_pi_pdfs_require_revision_review'], candidates: pdfs.map(item => item.driveFileId) };
  if (pdfs.length === 1) {
    const item = pdfs[0];
    const isSame = archived?.sourceDriveFileId === item.driveFileId
      || (!archived?.sourceDriveFileId && payload.driveFileId === item.driveFileId);
    const isPdfArchive = /\.pdf$/i.test(archived?.filePath ?? '');
    return { item, archive: isSame && isPdfArchive ? archived : null, issues: [], candidates: [item.driveFileId] };
  }
  // A successfully listed folder without its PDF must not reuse an unrelated archive.
  return { item: null, archive: null, issues: ['missing_pi_pdf'], candidates: [] };
}
