import { db, sitesTable, clientsTable, agenciesTable, campaignsTable, insertionsTable } from "@workspace/db";

const today = new Date();
const past = (daysAgo: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
};
const future = (daysAhead: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split("T")[0];
};

async function main() {
  const existing = await db.select().from(sitesTable);
  if (existing.length > 0) {
    console.log("Already seeded, skipping.");
    process.exit(0);
  }

  const sites = await db.insert(sitesTable).values([
    { nome: "OMT Online", sigla: "OMT", ativo: true },
    { nome: "ROO News", sigla: "ROO", ativo: true },
    { nome: "Perrengue", sigla: "PERRENGUE", ativo: true },
    { nome: "AFL Digital", sigla: "AFL", ativo: true },
    { nome: "Portal NMT", sigla: "PNMT", ativo: true },
    { nome: "Portal PMT", sigla: "PPMT", ativo: true },
  ]).returning();
  console.log("Sites seeded:", sites.length);

  const clients = await db.insert(clientsTable).values([
    { nome: "Prefeitura de Cuiabá", ativo: true },
    { nome: "Hospital Central", ativo: true },
    { nome: "Governo do Estado", ativo: true },
    { nome: "DETRAN-MT", ativo: true },
    { nome: "Secretaria de Saúde", ativo: true },
    { nome: "Fila Zero Tecnologia", ativo: true },
    { nome: "Radar Mídia", ativo: true },
  ]).returning();
  console.log("Clients seeded:", clients.length);

  const agencies = await db.insert(agenciesTable).values([
    { nome: "Agência Central", ativo: true },
    { nome: "Publicis MT", ativo: true },
    { nome: "DPZ&T", ativo: true },
    { nome: "WMcCann", ativo: true },
    { nome: "Direta Comunicação", ativo: true },
  ]).returning();
  console.log("Agencies seeded:", agencies.length);

  const campaigns = await db.insert(campaignsTable).values([
    { nome: "FILA ZERO - Q1 2026", clienteId: clients[5]!.id, agenciaId: agencies[0]!.id, piCodigo: "PI-001/26", valorLiquido: "28500.00", competencia: "JANEIRO/2026", origem: "email" },
    { nome: "HOSPITAL CENTRAL - INSTITUCIONAL", clienteId: clients[1]!.id, agenciaId: agencies[1]!.id, piCodigo: "PI-002/26", valorLiquido: "45000.00", competencia: "FEVEREIRO/2026", origem: "whatsapp" },
    { nome: "DENGUE - PREF CBA", clienteId: clients[0]!.id, agenciaId: agencies[2]!.id, piCodigo: "PI-003/26", valorLiquido: "62000.00", competencia: "MARÇO/2026", origem: "email" },
    { nome: "RADAR - CAMPANHA VERÃO", clienteId: clients[6]!.id, agenciaId: agencies[4]!.id, piCodigo: "PI-004/26", valorLiquido: "18000.00", competencia: "JANEIRO/2026", origem: "email" },
    { nome: "OBRAS - GOV MT", clienteId: clients[2]!.id, agenciaId: agencies[3]!.id, piCodigo: "PI-005/26", valorLiquido: "95000.00", competencia: "ABRIL/2026", origem: "whatsapp" },
    { nome: "TRANSITO - FASE 2", clienteId: clients[3]!.id, agenciaId: agencies[0]!.id, piCodigo: "PI-006/26", valorLiquido: "33000.00", competencia: "MARÇO/2026", origem: "email" },
    { nome: "IPTU 2026 - PREFEITURA", clienteId: clients[0]!.id, agenciaId: agencies[2]!.id, piCodigo: "PI-007/26", valorLiquido: "54000.00", competencia: "FEVEREIRO/2026", origem: "email" },
    { nome: "VACINAÇÃO - SAÚDE", clienteId: clients[4]!.id, agenciaId: agencies[1]!.id, piCodigo: "PI-008/26", valorLiquido: "41000.00", competencia: "ABRIL/2026", origem: "email" },
    { nome: "FILA ZERO - OUTUBRO", clienteId: clients[5]!.id, agenciaId: agencies[0]!.id, piCodigo: "PI-009/25", valorLiquido: "22000.00", competencia: "OUTUBRO/2025", origem: "email" },
    { nome: "HOSPITAL CENTRAL - NOV", clienteId: clients[1]!.id, agenciaId: agencies[1]!.id, piCodigo: "PI-010/25", valorLiquido: "38000.00", competencia: "NOVEMBRO/2025", origem: "whatsapp" },
    { nome: "DENGUE - DEZEMBRO", clienteId: clients[0]!.id, agenciaId: agencies[2]!.id, piCodigo: "PI-011/25", valorLiquido: "51000.00", competencia: "DEZEMBRO/2025", origem: "email" },
  ]).returning();
  console.log("Campaigns seeded:", campaigns.length);

  await db.insert(insertionsTable).values([
    // FILA ZERO - JAN 2026
    { campanhaId: campaigns[0]!.id, siteId: sites[0]!.id, localFormato: "MEGA BANNER TOPO", localFormatoNormalizado: "MEGABANNER TOPO", periodoInicio: past(5), periodoFim: future(25), statusNormalizado: "print_gerado", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    { campanhaId: campaigns[0]!.id, siteId: sites[1]!.id, localFormato: "HOME 1", localFormatoNormalizado: "HOME 1", periodoInicio: past(5), periodoFim: future(25), statusNormalizado: "publicado_no_site", bannerPublicadoNoSite: true, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    { campanhaId: campaigns[0]!.id, siteId: sites[4]!.id, localFormato: "INTERNO NOTICIAS", localFormatoNormalizado: "INTERNO DE NOTICIAS", periodoInicio: past(10), periodoFim: future(20), statusNormalizado: "aguardando_publicacao", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: true },
    // HOSPITAL CENTRAL - FEV
    { campanhaId: campaigns[1]!.id, siteId: sites[0]!.id, localFormato: "VIDEO", localFormatoNormalizado: "VIDEO", periodoInicio: past(15), periodoFim: future(15), statusNormalizado: "enviado_para_agencia", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: false, dataEnvioAgencia: past(3), atrasado: false },
    { campanhaId: campaigns[1]!.id, siteId: sites[2]!.id, localFormato: "PRIMEIRA DOBRA", localFormatoNormalizado: "PRIMEIRA DOBRA", periodoInicio: past(15), periodoFim: future(15), statusNormalizado: "concluido", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: true, dataEnvioAgencia: past(10), atrasado: false },
    { campanhaId: campaigns[1]!.id, siteId: sites[5]!.id, localFormato: "INSTAGRAM", localFormatoNormalizado: "INSTAGRAM", periodoInicio: past(12), periodoFim: future(18), statusNormalizado: "print_gerado", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    // DENGUE - MAR
    { campanhaId: campaigns[2]!.id, siteId: sites[0]!.id, localFormato: "MEGABANNER TPO", localFormatoNormalizado: "MEGABANNER TOPO", periodoInicio: future(2), periodoFim: future(32), statusNormalizado: "aguardando_publicacao", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    { campanhaId: campaigns[2]!.id, siteId: sites[1]!.id, localFormato: "HOME 2", localFormatoNormalizado: "HOME 2", periodoInicio: future(2), periodoFim: future(32), statusNormalizado: "rascunho", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    { campanhaId: campaigns[2]!.id, siteId: sites[2]!.id, localFormato: "SEGUNDA DOBRA", localFormatoNormalizado: "SEGUNDA DOBRA", periodoInicio: future(2), periodoFim: future(32), statusNormalizado: "rascunho", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    { campanhaId: campaigns[2]!.id, siteId: sites[3]!.id, localFormato: "HOME 1", localFormatoNormalizado: "HOME 1", periodoInicio: future(2), periodoFim: future(32), statusNormalizado: "rascunho", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    // RADAR
    { campanhaId: campaigns[3]!.id, siteId: sites[4]!.id, localFormato: "TOPO LATERAL", localFormatoNormalizado: "TOPO LATERAL", periodoInicio: past(20), periodoFim: future(10), statusNormalizado: "concluido", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: true, dataEnvioAgencia: past(15), atrasado: false },
    { campanhaId: campaigns[3]!.id, siteId: sites[5]!.id, localFormato: "INSTAGRAM", localFormatoNormalizado: "INSTAGRAM", periodoInicio: past(20), periodoFim: future(10), statusNormalizado: "concluido", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: true, dataEnvioAgencia: past(15), atrasado: false },
    // OBRAS GOV - ABR
    { campanhaId: campaigns[4]!.id, siteId: sites[0]!.id, localFormato: "MEGA BANNER TOPO", localFormatoNormalizado: "MEGABANNER TOPO", periodoInicio: future(5), periodoFim: future(35), statusNormalizado: "rascunho", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    { campanhaId: campaigns[4]!.id, siteId: sites[1]!.id, localFormato: "VIDEO", localFormatoNormalizado: "VIDEO", periodoInicio: future(5), periodoFim: future(35), statusNormalizado: "rascunho", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    { campanhaId: campaigns[4]!.id, siteId: sites[2]!.id, localFormato: "HOME 1", localFormatoNormalizado: "HOME 1", periodoInicio: future(5), periodoFim: future(35), statusNormalizado: "aguardando_publicacao", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    // TRANSITO
    { campanhaId: campaigns[5]!.id, siteId: sites[0]!.id, localFormato: "SEGUNDA DOBRA", localFormatoNormalizado: "SEGUNDA DOBRA", periodoInicio: past(8), periodoFim: future(22), statusNormalizado: "publicado_no_site", bannerPublicadoNoSite: true, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    { campanhaId: campaigns[5]!.id, siteId: sites[3]!.id, localFormato: "INTERNO NOTICIA", localFormatoNormalizado: "INTERNO DE NOTICIAS", periodoInicio: past(8), periodoFim: future(22), statusNormalizado: "aguardando_publicacao", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: true },
    // IPTU 2026
    { campanhaId: campaigns[6]!.id, siteId: sites[0]!.id, localFormato: "HOME 1", localFormatoNormalizado: "HOME 1", periodoInicio: past(30), periodoFim: past(1), statusNormalizado: "concluido", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: true, dataEnvioAgencia: past(20), atrasado: false },
    { campanhaId: campaigns[6]!.id, siteId: sites[1]!.id, localFormato: "MEGA BANNER TOPO", localFormatoNormalizado: "MEGABANNER TOPO", periodoInicio: past(30), periodoFim: past(1), statusNormalizado: "concluido", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: true, dataEnvioAgencia: past(20), atrasado: false },
    { campanhaId: campaigns[6]!.id, siteId: sites[4]!.id, localFormato: "HOME 2", localFormatoNormalizado: "HOME 2", periodoInicio: past(30), periodoFim: past(1), statusNormalizado: "enviado_para_agencia", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: false, dataEnvioAgencia: past(18), atrasado: false },
    // VACINAÇÃO
    { campanhaId: campaigns[7]!.id, siteId: sites[0]!.id, localFormato: "VIDEO", localFormatoNormalizado: "VIDEO", periodoInicio: future(3), periodoFim: future(33), statusNormalizado: "aguardando_publicacao", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    { campanhaId: campaigns[7]!.id, siteId: sites[2]!.id, localFormato: "INSTAGRAM", localFormatoNormalizado: "INSTAGRAM", periodoInicio: future(3), periodoFim: future(33), statusNormalizado: "rascunho", bannerPublicadoNoSite: false, printGerado: false, processoEnviadoAgencia: false, docsEnviados: false, atrasado: false },
    // Legacy 2025
    { campanhaId: campaigns[8]!.id, siteId: sites[0]!.id, localFormato: "HOME 1", localFormatoNormalizado: "HOME 1", periodoInicio: past(90), periodoFim: past(60), statusNormalizado: "concluido", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: true, dataEnvioAgencia: past(75), atrasado: false },
    { campanhaId: campaigns[9]!.id, siteId: sites[1]!.id, localFormato: "MEGA BANNER TOPO", localFormatoNormalizado: "MEGABANNER TOPO", periodoInicio: past(60), periodoFim: past(30), statusNormalizado: "concluido", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: true, dataEnvioAgencia: past(45), atrasado: false },
    { campanhaId: campaigns[10]!.id, siteId: sites[0]!.id, localFormato: "VIDEO", localFormatoNormalizado: "VIDEO", periodoInicio: past(35), periodoFim: past(5), statusNormalizado: "concluido", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: true, dataEnvioAgencia: past(25), atrasado: false },
    { campanhaId: campaigns[10]!.id, siteId: sites[4]!.id, localFormato: "HOME 1", localFormatoNormalizado: "HOME 1", periodoInicio: past(35), periodoFim: past(5), statusNormalizado: "enviado_para_agencia", bannerPublicadoNoSite: true, printGerado: true, processoEnviadoAgencia: true, docsEnviados: false, dataEnvioAgencia: past(20), atrasado: false },
  ]);

  console.log("Insertions seeded!");
  console.log("Seed complete!");
}

main().catch(e => { console.error(e); process.exit(1); });
