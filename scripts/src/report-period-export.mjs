// Shared by the inline report and its contract tests; no browser dependencies.
export function reportPeriodExport(items, month, cutoff, from = '', to = '') {
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  const invalidRange = Boolean((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to));
  const inRange = day => day.date.startsWith(month + '-') && day.date <= cutoff && (!from || day.date >= from) && (!to || day.date <= to);
  const rows = [...items].sort((a, b) => Number(a.id) - Number(b.id));
  const requiredDatesByInsertion = {};
  const evidenceManifest = [];
  let ready = rows.length > 0 && !invalidRange;
  let captureCount = 0;
  for (const item of rows) {
    if (item.evidenceApplicable === false) continue;
    const periodEnd = to && to < cutoff ? to : cutoff;
    if (item.periodoInicio > periodEnd || (from && item.periodoFim < from)) continue;
    const scopedDays = [...(item.evidenceDays || [])].filter(inRange);
    const days = scopedDays.filter(day => day.status !== 'scheduled').sort((a, b) => a.date.localeCompare(b.date));
    if (!days.length && scopedDays.length && scopedDays.every(day => day.status === 'scheduled')) continue;
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
  return { ready: ready && count > 0, count, captureCount, label, requiredDatesByInsertion, evidenceManifest, lastDueDate: dates.at(-1) || null, invalidRange };
}
