// Shared by the inline report and its contract tests; no browser dependencies.
export function reportPeriodExport(items, month, cutoff) {
  const rows = [...items].sort((a, b) => Number(a.id) - Number(b.id));
  const requiredDatesByInsertion = {};
  const evidenceManifest = [];
  let ready = rows.length > 0;
  let captureCount = 0;
  for (const item of rows) {
    const days = [...(item.evidenceDays || [])].filter(day => day.date.startsWith(month + '-') && day.date <= cutoff).sort((a, b) => a.date.localeCompare(b.date));
    requiredDatesByInsertion[item.id] = days.map(day => day.date);
    if (!days.length) ready = false;
    for (const day of days) {
      const accepted = day.status === 'reconstruction' ? day.technicalAccepted === true : typeof day.technicalAccepted === 'boolean' ? day.technicalAccepted : day.status !== 'provenance_unverified' && String(day.technicalStatus || day.status).startsWith('audited');
      if (!accepted || !day.evidenceId || !day.url) ready = false;
      else captureCount++;
      evidenceManifest.push([item.id, day.date, day.evidenceId || null, day.url || '', day.status, day.technicalAccepted ?? null, day.verifiedAt || '', day.capturedAt || '']);
    }
  }
  const dates = evidenceManifest.map(row => row[1]).sort();
  const count = dates.length;
  const label = count ? dates[0].split('-').reverse().join('/') + ' a ' + dates.at(-1).split('-').reverse().join('/') + ' · ' + (ready ? count : captureCount + ' de ' + count) + ' capturas' : month + ' · sem capturas';
  return { ready, count, captureCount, label, requiredDatesByInsertion, evidenceManifest };
}
