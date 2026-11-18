// Pure cell reader shared by spreadsheet importers. Never writes business data.
const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const sites = new Set(['OMT', 'ROO', 'PERRENGUE', 'AFL', 'PNMT', 'PPMT', 'PMMT']);
const siteOf = value => sites.has(normalized(value)) ? normalized(value).replace(/^PMMT$/, 'PPMT') : null;
const meaningful = value => !['', '-', '—'].includes(String(value ?? '').trim());

export function readCampaignSheetBlocks(input, { strict = true } = {}) {
  const cells = input.map(row => row.map(value => String(value ?? '').replace(/\u00a0/g, ' ').trim()));
  const starts = [...new Set(cells.flatMap(row => row.flatMap((value, col) => normalized(value).startsWith('PECA') ? [col] : [])))].sort((a, b) => a - b);
  const pending = new Map(), blocks = new Map(), titles = new Set(), headersSeen = new Set();
  const rows = [], issues = [];
  for (let r = 0; r < cells.length; r++) {
    const row = cells[r];
    const titleStarts = new Set(), headerStarts = new Set();
    row.forEach((value, col) => {
      const site = siteOf(value);
      if (!site) return;
      titles.add(site);
      // Titles may be stored in the centre of a merged block. Use its column range.
      const start = starts.filter(start => start <= col).at(-1) ?? starts[0];
      if (start == null) { issues.push({ code: 'site_without_header', row: r + 1, site }); return; }
      pending.set(start, site);
      titleStarts.add(start);
      // A new title ends the previous portal's block immediately.
      blocks.delete(start);
    });
    starts.forEach((start, index) => {
      if (!normalized(row[start]).startsWith('PECA')) return;
      headerStarts.add(start);
      const site = pending.get(start);
      const headers = row.slice(start, starts[index + 1] ?? row.length).map(normalized);
      const offsets = Object.fromEntries(Object.entries({ peca: 'PECA', agenciaValor: 'AGENCIA', campanha: 'CAMPANHA', periodo: 'PERIODO', local: 'LOCAL', status: 'STATUS', processoRealizado: 'PROCESSO REALIZADO', processoEnviado: 'PROCESSO ENVIADO', extra: 'DATA DE ENVIO' }).map(([key, match]) => [key, headers.findIndex(h => h.includes(match))]));
      if (!site || ['peca', 'campanha', 'periodo', 'local'].some(k => offsets[k] < 0)) {
        issues.push({ code: 'unresolved_block', row: r + 1, column: start + 1, site: site ?? null });
        blocks.delete(start); return;
      }
      headersSeen.add(site);
      blocks.set(start, { site, offsets });
    });
    starts.forEach((start, index) => {
      if (titleStarts.has(start) || headerStarts.has(start)) return;
      const block = blocks.get(start);
      if (!block) return;
      const slice = row.slice(start, starts[index + 1] ?? row.length);
      const fields = Object.fromEntries(Object.entries(block.offsets).map(([key, offset]) => [key, offset < 0 ? '' : slice[offset] ?? '']));
      if (![fields.peca, fields.campanha, fields.periodo, fields.local].some(meaningful)) return;
      rows.push({ ...fields, siteSigla: block.site, sourceRow: r + 1, sourceColumn: start + 1 });
    });
  }
  for (const site of titles) if (!headersSeen.has(site)) issues.push({ code: 'site_without_resolved_block', site });
  if (!starts.length || !headersSeen.size) issues.push({ code: 'no_campaign_blocks' });
  const coverage = Object.fromEntries([...titles].sort().map(site => [site, { header: headersSeen.has(site), rows: rows.filter(row => row.siteSigla === site).length }]));
  if (strict && issues.length) throw new Error('sheet_coverage_incomplete: ' + JSON.stringify(issues));
  return { rows, coverage, complete: issues.length === 0, issues };
}
