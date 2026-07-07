import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ISectionOptions,
} from "docx";
import { chromium, type Browser } from "playwright";

export type OperationalDocumentKind = "declaracao-execucao" | "anexo-v";
export type OperationalDocumentFormat = "docx" | "pdf";

type InsertionLike = {
  id: number;
  campanhaName: string | null;
  piCodigo: string | null;
  clienteNome: string | null;
  clienteCnpj?: string | null;
  agenciaNome: string | null;
  siteSigla: string | null;
  siteNome: string | null;
  localFormato: string | null;
  localFormatoNormalizado: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  periodoOriginal?: string | null;
  competencia: string | null;
};

type TextChunk = {
  text: string;
  bold?: boolean;
  italics?: boolean;
  placeholder?: boolean;
};

type OperationalDocumentContext = {
  insertionId: number;
  issueDate: Date;
  issueDateIso: string;
  issueDateShort: string;
  issueDateLong: string;
  periodStart: string;
  periodEnd: string;
  periodStartCompact: string;
  periodEndCompact: string;
  piCodigo: string;
  campaignName: string;
  clientName: string;
  clientNameUpper: string;
  clientDocument: string;
  clientDocumentMissing: boolean;
  agencyName: string;
  siteSigla: string;
  siteName: string;
  localFormato: string;
  competencia: string;
  placeholders: string[];
  company: {
    legalName: string;
    tradeName: string;
    cnpj: string;
    representativeName: string;
    representativeCpf: string;
    phone: string;
    addressPrimary: string;
    addressSecondary: string;
  };
  outputFiles: Record<OperationalDocumentKind, { baseName: string }>;
};

export type OperationalDocumentDescriptor = {
  kind: OperationalDocumentKind;
  title: string;
  description: string;
  docxFileName: string;
  pdfFileName: string;
  placeholders: string[];
};

type GeneratedOperationalDocument = {
  descriptor: OperationalDocumentDescriptor;
  docx: Buffer;
  pdf: Buffer;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.ADOPS_PROJECT_ROOT
  ? resolve(process.env.ADOPS_PROJECT_ROOT)
  : resolve(__dirname, "../../..");
const SITE_LOGO_PATHS: Record<string, string> = {
  PERRENGUE: resolve(PROJECT_ROOT, "artifacts/adops/public/site-logos/perrengue.png"),
  OMT: resolve(PROJECT_ROOT, "artifacts/adops/public/site-logos/omt.webp"),
  ROO: resolve(PROJECT_ROOT, "artifacts/adops/public/site-logos/roo.png"),
  PPMT: resolve(PROJECT_ROOT, "artifacts/adops/public/site-logos/ppmt.png"),
  PNMT: resolve(PROJECT_ROOT, "artifacts/adops/public/site-logos/pnmt.png"),
  AFL: resolve(PROJECT_ROOT, "artifacts/adops/public/site-logos/afl.png"),
};

const COMPANY = {
  legalName: "PERRENGUE MATO GROSSO COMUNICAÇÃO LTDA",
  tradeName: "PERRENGUE MATO GROSSO",
  cnpj: "34.365.381/0001-24",
  representativeName: "JOSÉ CELSO DORILEO LEITE FILHO",
  representativeCpf: "039.230.761-85",
  phone: "65 99930-5555",
  addressPrimary: "AV. HISTORIADOR RUBENS DE MENDONÇA, ED. CUIABÁ OFFICE",
  addressSecondary: "TOWER, SALA 405, Nº 1856",
};

const DOCUMENT_TITLES: Record<OperationalDocumentKind, string> = {
  "declaracao-execucao": "Declaração de Execução",
  "anexo-v": "Anexo V - Simples Nacional",
};

const logoBufferPromises = new Map<string, Promise<Buffer | null>>();
let browserPromise: Promise<Browser> | null = null;

function getLogoBuffer(siteSigla: string) {
  const key = siteSigla.toUpperCase();
  const targetPath = SITE_LOGO_PATHS[key] ?? SITE_LOGO_PATHS.PERRENGUE;
  const existing = logoBufferPromises.get(key);
  if (existing) return existing;
  const created = readFile(targetPath).catch(() => null);
  logoBufferPromises.set(key, created);
  return created;
}

async function getPdfBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

function sanitizeFileNamePart(value: string) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .toUpperCase();
}

function formatDateShort(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Cuiaba",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateForFile(date: Date) {
  const short = formatDateShort(date);
  const [day, month] = short.split("/");
  return `${day}.${month}`;
}

function formatDateLong(date: Date) {
  const raw = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Cuiaba",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
  return raw.replace(/^(\d{2}) de ([a-zçãéíóú]+)/i, (_match, day, month) => `${day} de ${String(month).replace(/^./, (item) => item.toUpperCase())}`);
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00-04:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function makePlaceholder(label: string) {
  return `[PREENCHER ${label.toUpperCase()}]`;
}

function resolveIssueDate(insertion: InsertionLike) {
  const end = parseDateOnly(insertion.periodoFim);
  const today = new Date();
  if (!end) return today;
  const endPlusOne = new Date(end.getTime());
  endPlusOne.setDate(endPlusOne.getDate() + 1);
  return endPlusOne > today ? today : endPlusOne;
}

function renderChunkHtml(chunk: TextChunk) {
  const escaped = chunk.text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const classes = [
    chunk.bold ? "bold" : "",
    chunk.italics ? "italics" : "",
    chunk.placeholder ? "placeholder" : "",
  ].filter(Boolean).join(" ");
  return `<span class="${classes}">${escaped}</span>`;
}

function textRuns(chunks: TextChunk[]) {
  return chunks.map((chunk) => new TextRun({
    text: chunk.text,
    bold: chunk.bold,
    italics: chunk.italics,
    size: 28,
    highlight: chunk.placeholder ? "yellow" : undefined,
  }));
}

function operationalFooter() {
  return new Footer({
    children: [
      new Paragraph({
        spacing: { before: 280 },
        border: {
          top: {
            color: "D1D5DB",
            size: 6,
            style: BorderStyle.SINGLE,
            space: 1,
          },
        },
      }),
      new Paragraph({
        spacing: { before: 120 },
        children: [
          new TextRun({ text: COMPANY.legalName, bold: true, size: 22 }),
        ],
      }),
      new Paragraph({
        spacing: { before: 40 },
        children: [new TextRun({ text: `TEL: ${COMPANY.phone}`, size: 22, bold: true })],
      }),
      new Paragraph({
        spacing: { before: 40 },
        children: [new TextRun({ text: `CNPJ: ${COMPANY.cnpj}`, size: 22, bold: true })],
      }),
      new Paragraph({
        spacing: { before: 40 },
        children: [new TextRun({ text: `ENDEREÇO: ${COMPANY.addressPrimary}`, size: 22, bold: true })],
      }),
      new Paragraph({
        spacing: { before: 20 },
        children: [new TextRun({ text: COMPANY.addressSecondary, size: 22, bold: true })],
      }),
    ],
  });
}

function buildContext(insertion: InsertionLike): OperationalDocumentContext {
  const issueDate = resolveIssueDate(insertion);
  const periodStartDate = parseDateOnly(insertion.periodoInicio);
  const periodEndDate = parseDateOnly(insertion.periodoFim);
  const placeholders: string[] = [];
  const clientDocument = insertion.clienteCnpj?.trim() || makePlaceholder("CNPJ/CPF do órgão favorecido");
  if (!insertion.clienteCnpj?.trim()) placeholders.push("CNPJ/CPF do órgão favorecido");
  placeholders.push("Campo de assinatura manual");

  const siteSigla = insertion.siteSigla ?? "PERRENGUE";
  const clientBase = insertion.clienteNome?.trim() || makePlaceholder("órgão/cliente favorecido");
  if (!insertion.clienteNome?.trim()) placeholders.push("Nome do órgão/cliente favorecido");

  const campaignName = insertion.campanhaName?.trim() || makePlaceholder("nome completo da campanha");
  if (!insertion.campanhaName?.trim()) placeholders.push("Nome completo da campanha");

  const agencyName = insertion.agenciaNome?.trim() || makePlaceholder("agência");
  if (!insertion.agenciaNome?.trim()) placeholders.push("Agência");

  const piCodigo = insertion.piCodigo?.trim() || makePlaceholder("PI");
  if (!insertion.piCodigo?.trim()) placeholders.push("Número da PI");

  const localFormato = insertion.localFormatoNormalizado?.trim() || insertion.localFormato?.trim() || makePlaceholder("formato/local");
  if (!insertion.localFormatoNormalizado?.trim() && !insertion.localFormato?.trim()) placeholders.push("Formato/local");

  const periodStartCompact = periodStartDate ? formatDateShort(periodStartDate) : makePlaceholder("data inicial");
  const periodEndCompact = periodEndDate ? formatDateShort(periodEndDate) : makePlaceholder("data final");
  if (!periodStartDate) placeholders.push("Data inicial da veiculação");
  if (!periodEndDate) placeholders.push("Data final da veiculação");

  const clientSlug = sanitizeFileNamePart(clientBase) || "CLIENTE";
  const siteSlug = sanitizeFileNamePart(siteSigla) || "SITE";
  const campaignSlug = sanitizeFileNamePart(campaignName) || "CAMPANHA";
  const piSlug = sanitizeFileNamePart(`PI_${piCodigo}`) || "PI";
  const issueDateIso = formatIsoDate(issueDate);
  const issueDateSlug = issueDateIso.replace(/-/g, "_");
  const baseOperationalSlug = [siteSlug, campaignSlug, clientSlug, piSlug, issueDateSlug].join("_");

  return {
    insertionId: insertion.id,
    issueDate,
    issueDateIso: formatIsoDate(issueDate),
    issueDateShort: formatDateShort(issueDate),
    issueDateLong: formatDateLong(issueDate),
    periodStart: periodStartCompact,
    periodEnd: periodEndCompact,
    periodStartCompact,
    periodEndCompact,
    piCodigo,
    campaignName,
    clientName: clientBase,
    clientNameUpper: clientBase.toUpperCase(),
    clientDocument,
    clientDocumentMissing: !insertion.clienteCnpj?.trim(),
    agencyName,
    siteSigla,
    siteName: insertion.siteNome?.trim() || siteSigla,
    localFormato,
    competencia: insertion.competencia?.trim() || makePlaceholder("competência"),
    placeholders,
    company: COMPANY,
    outputFiles: {
      "declaracao-execucao": {
        baseName: `${baseOperationalSlug}_DEC_EXECUCAO`,
      },
      "anexo-v": {
        baseName: `${baseOperationalSlug}_ANEXO_V`,
      },
    },
  };
}

function descriptorFor(kind: OperationalDocumentKind, context: OperationalDocumentContext): OperationalDocumentDescriptor {
  const baseName = context.outputFiles[kind].baseName;
  return {
    kind,
    title: DOCUMENT_TITLES[kind],
    description: kind === "declaracao-execucao"
      ? "Declaração de execução preenchida com os dados da PI e espaço para completar órgão favorecido e assinatura."
      : "Anexo V em modelo Simples Nacional com base na PI e campos finais preservados para ajuste manual.",
    docxFileName: `${baseName}.docx`,
    pdfFileName: `${baseName}.pdf`,
    placeholders: context.placeholders,
  };
}

function buildDeclaracaoParagraphs(context: OperationalDocumentContext) {
  const clientDocValue = context.clientDocument;
  return {
    pdfBody: [
      `<p class="declaration centered title">DECLARAÇÃO DE<br/>EXECUÇÃO</p>`,
      `<p class="declaration body">${[
        { text: "Declaro sob as penas previstas no Artigo 299 do Código Penal Brasileiro, bem como das demais medidas legalmente cabíveis que " },
        { text: context.company.legalName, bold: true },
        { text: ", com o " },
        { text: context.company.cnpj, bold: true },
        { text: ", " },
        { text: context.company.tradeName, bold: true },
        { text: ", representado por " },
        { text: context.company.representativeName, bold: true },
        { text: ", portador do CPF " },
        { text: context.company.representativeCpf, bold: true },
        { text: ", veiculou integralmente mídia do dia " },
        { text: context.periodStartCompact, bold: true },
        { text: " ao dia " },
        { text: context.periodEndCompact, bold: true },
        { text: ", conforme o Pedido de Inserção nº " },
        { text: context.piCodigo, bold: true },
        { text: " – CAMPANHA “" },
        { text: context.campaignName, bold: true },
        { text: "” agência " },
        { text: context.agencyName.toUpperCase(), bold: true },
        { text: ", em favor de " },
        { text: context.clientNameUpper, bold: true },
        { text: " inscrito no CNPJ nº " },
        { text: clientDocValue, bold: true, placeholder: context.clientDocumentMissing },
        { text: "." },
      ].map(renderChunkHtml).join("")}</p>`,
      `<p class="city-date">Cuiabá/MT, ${context.issueDateLong}.</p>`,
    ],
    docxBody: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 420 },
        children: [new TextRun({ text: "DECLARAÇÃO DE\nEXECUÇÃO", bold: true, size: 32 })],
      }),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 220 },
        indent: { firstLine: 420 },
        children: textRuns([
          { text: "Declaro sob as penas previstas no Artigo 299 do Código Penal Brasileiro, bem como das demais medidas legalmente cabíveis que " },
          { text: context.company.legalName, bold: true },
          { text: ", com o " },
          { text: context.company.cnpj, bold: true },
          { text: ", " },
          { text: context.company.tradeName, bold: true },
          { text: ", representado por " },
          { text: context.company.representativeName, bold: true },
          { text: ", portador do CPF " },
          { text: context.company.representativeCpf, bold: true },
          { text: ", veiculou integralmente mídia do dia " },
          { text: context.periodStartCompact, bold: true },
          { text: " ao dia " },
          { text: context.periodEndCompact, bold: true },
          { text: ", conforme o Pedido de Inserção nº " },
          { text: context.piCodigo, bold: true },
          { text: " – CAMPANHA “" },
          { text: context.campaignName, bold: true },
          { text: "” agência " },
          { text: context.agencyName.toUpperCase(), bold: true },
          { text: ", em favor de " },
          { text: context.clientNameUpper, bold: true },
          { text: " inscrito no CNPJ nº " },
          { text: context.clientDocument, bold: true, placeholder: context.clientDocumentMissing },
          { text: "." },
        ]),
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 300, after: 620 },
        children: [new TextRun({ text: `Cuiabá/MT, ${context.issueDateLong}.`, size: 28 })],
      }),
    ],
  };
}

function buildAnexoParagraphs(context: OperationalDocumentContext) {
  return {
    pdfBody: [
      `<p class="recipient">Ilmo. Sr.<br/>${context.clientNameUpper}</p>`,
      `<p class="body">${[
        { text: `${context.company.legalName}, com sede em Cuiabá-MT, ${context.company.addressPrimary}, ${context.company.addressSecondary}, inscrita no CNPJ sob o nº ${context.company.cnpj}, DECLARA à `, bold: true },
        { text: context.clientNameUpper, bold: true },
        { text: " para fins de não incidência na fonte do IRPJ, da Contribuição Social sobre o Lucro Líquido (CSLL), da Contribuição para o Financiamento da Seguridade Social (Cofins), e da Contribuição para o PIS/Pasep, a que se refere o art. 64 da Lei nº 9.430, de 27 de dezembro de 1996, que é regularmente inscrita no Regime Especial Unificado de Arrecadação de Tributos e Contribuições devidos pelas Microempresas e Empresas de Pequeno Porte - Simples Nacional, de que trata o art. 12 da Lei Complementar nº 123, de 14 de dezembro de 2006." },
      ].map(renderChunkHtml).join("")}</p>`,
      `<p class="body intro">Para esse efeito, a declarante informa que:</p>`,
      `<p class="body bullet">- Preenche os seguintes requisitos:</p>`,
      `<p class="body bullet-detail">conserva em boa ordem, pelo prazo de 5 (cinco) anos, contado da data da emissão, os documentos que comprovam a origem de suas receitas e a efetivação de suas despesas, bem como a realização de quaisquer outros atos ou operações que venham modificar sua situação patrimonial;</p>`,
      `<p class="body bullet-detail">e cumpre as obrigações acessórias a que está sujeita, em conformidade com a legislação pertinente;</p>`,
      `<p class="body bullet">- o signatário é representante legal desta empresa, assumindo o compromisso de informar à Secretaria da Receita Federal do Brasil e à pessoa jurídica pagadora, imediatamente, eventual desenquadramento da presente situação e está ciente de que a falsidade na prestação dessas informações, sem prejuízo do disposto no art. 32 da Lei nº 9.430, de 1996, o sujeitará, com as demais pessoas que para ela concorrem, às penalidades previstas na legislação criminal e tributária, relativas à falsidade ideológica (art. 299 do Decreto-Lei nº 2.848, de 7 de dezembro de 1940 - Código Penal) e ao crime contra a ordem tributária (art. 1º da Lei nº 8.137, de 27 de dezembro de 1990).</p>`,
      `<p class="city-date">Cuiabá, ${context.issueDateShort}</p>`,
    ],
    docxBody: [
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: "Ilmo. Sr.", size: 28 })],
      }),
      new Paragraph({
        spacing: { after: 220 },
        children: [new TextRun({ text: context.clientNameUpper, size: 28, bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 180 },
        indent: { firstLine: 420 },
        children: textRuns([
          { text: `${context.company.legalName}, com sede em Cuiabá-MT, ${context.company.addressPrimary}, ${context.company.addressSecondary}, inscrita no CNPJ sob o nº ${context.company.cnpj}, DECLARA à `, bold: true },
          { text: context.clientNameUpper, bold: true },
          { text: " para fins de não incidência na fonte do IRPJ, da Contribuição Social sobre o Lucro Líquido (CSLL), da Contribuição para o Financiamento da Seguridade Social (Cofins), e da Contribuição para o PIS/Pasep, a que se refere o art. 64 da Lei nº 9.430, de 27 de dezembro de 1996, que é regularmente inscrita no Regime Especial Unificado de Arrecadação de Tributos e Contribuições devidos pelas Microempresas e Empresas de Pequeno Porte - Simples Nacional, de que trata o art. 12 da Lei Complementar nº 123, de 14 de dezembro de 2006." },
        ]),
      }),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 140 },
        children: [new TextRun({ text: "Para esse efeito, a declarante informa que:", size: 28 })],
      }),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 100 },
        children: [new TextRun({ text: "- Preenche os seguintes requisitos:", size: 28 })],
      }),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120 },
        indent: { left: 420 },
        children: [new TextRun({ text: "conserva em boa ordem, pelo prazo de 5 (cinco) anos, contado da data da emissão, os documentos que comprovam a origem de suas receitas e a efetivação de suas despesas, bem como a realização de quaisquer outros atos ou operações que venham modificar sua situação patrimonial;" })],
      }),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120 },
        indent: { left: 420 },
        children: [new TextRun({ text: "e cumpre as obrigações acessórias a que está sujeita, em conformidade com a legislação pertinente;" })],
      }),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 240 },
        indent: { left: 420 },
        children: [new TextRun({ text: "o signatário é representante legal desta empresa, assumindo o compromisso de informar à Secretaria da Receita Federal do Brasil e à pessoa jurídica pagadora, imediatamente, eventual desenquadramento da presente situação e está ciente de que a falsidade na prestação dessas informações, sem prejuízo do disposto no art. 32 da Lei nº 9.430, de 1996, o sujeitará, com as demais pessoas que para ela concorrem, às penalidades previstas na legislação criminal e tributária, relativas à falsidade ideológica (art. 299 do Decreto-Lei nº 2.848, de 7 de dezembro de 1940 - Código Penal) e ao crime contra a ordem tributária (art. 1º da Lei nº 8.137, de 27 de dezembro de 1990)." })],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 180, after: 540 },
        children: [new TextRun({ text: `Cuiabá, ${context.issueDateShort}`, size: 28 })],
      }),
    ],
  };
}

function signatureTable(context: OperationalDocumentContext) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 280, after: 980 },
                children: [new TextRun({ text: "" })],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            shading: {
              type: ShadingType.CLEAR,
              fill: "FFFDE7",
              color: "auto",
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "Assinatura do responsável", bold: true })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

async function renderDocumentHtml(kind: OperationalDocumentKind, context: OperationalDocumentContext) {
  const logo = await getLogoBuffer(context.siteSigla);
  const logoDataUri = logo ? `data:image/png;base64,${logo.toString("base64")}` : "";
  const documentPieces = kind === "declaracao-execucao"
    ? buildDeclaracaoParagraphs(context)
    : buildAnexoParagraphs(context);

  return `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 18mm 14mm 14mm 14mm; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          color: #101828;
          margin: 0;
          font-size: 13.5px;
          line-height: 1.5;
        }
        .page { min-height: 100%; display: flex; flex-direction: column; }
        .header {
          display: flex;
          justify-content: flex-start;
          align-items: center;
          margin-bottom: ${kind === "declaracao-execucao" ? "24px" : "14px"};
        }
        .header img { width: ${kind === "declaracao-execucao" ? "180px" : "128px"}; height: auto; }
        .content { flex: 1; }
        .title {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 28px;
          line-height: 1.08;
        }
        .centered { text-align: center; }
        .recipient {
          margin: 0 0 10px;
          font-size: 14px;
          line-height: 1.35;
          text-align: justify;
        }
        .body {
          margin: 0 0 8px;
          text-align: justify;
          text-indent: ${kind === "declaracao-execucao" ? "32px" : "22px"};
          font-size: ${kind === "declaracao-execucao" ? "15px" : "13.6px"};
          line-height: ${kind === "declaracao-execucao" ? "1.58" : "1.48"};
        }
        .body.intro, .body.bullet { text-indent: 0; }
        .bullet { margin-top: 4px; }
        .bullet-detail { text-indent: 22px; }
        .declaration.body { font-size: 15px; }
        .city-date {
          margin-top: 22px;
          margin-bottom: 22px;
          text-align: right;
          font-size: ${kind === "declaracao-execucao" ? "14px" : "13px"};
        }
        .bold { font-weight: 700; }
        .italics { font-style: italic; }
        .placeholder {
          background: #fff59d;
          padding: 0 3px;
          border-radius: 2px;
        }
        .signature-block {
          margin-top: auto;
          text-align: center;
        }
        .signature-line {
          margin: 10px auto 6px;
          border-top: 1px solid #98a2b3;
          width: 44%;
        }
        .signature-gap {
          height: ${kind === "declaracao-execucao" ? "96px" : "88px"};
        }
        .signature-title {
          margin-top: 4px;
          font-size: 12.5px;
          font-weight: 700;
        }
        .footer {
          border-top: 1px solid #d0d5dd;
          margin-top: 12px;
          padding-top: 7px;
          font-size: 10.5px;
          line-height: 1.26;
          text-align: left;
          font-weight: 700;
        }
        .footer strong { display: block; margin-bottom: 4px; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          ${logoDataUri ? `<img src="${logoDataUri}" alt="Perrengue" />` : ""}
        </div>
        <div class="content">
          ${documentPieces.pdfBody.join("\n")}
          <div class="signature-block">
            <div class="signature-gap"></div>
            <div class="signature-line"></div>
            <div class="signature-title">Assinatura do responsável</div>
          </div>
        </div>
        <div class="footer">
          <strong>${context.company.legalName}</strong>
          <div>TEL: ${context.company.phone}</div>
          <div>CNPJ: ${context.company.cnpj}</div>
          <div>ENDEREÇO: ${context.company.addressPrimary}</div>
          <div>${context.company.addressSecondary}</div>
        </div>
      </div>
    </body>
  </html>`;
}

async function renderPdf(html: string) {
  const browser = await getPdfBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    return Buffer.from(await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
    }));
  } finally {
    await page.close();
  }
}

async function renderDocx(kind: OperationalDocumentKind, context: OperationalDocumentContext) {
  const logo = await getLogoBuffer(context.siteSigla);
  const documentPieces = kind === "declaracao-execucao"
    ? buildDeclaracaoParagraphs(context)
    : buildAnexoParagraphs(context);

  const children: (Paragraph | Table)[] = [];
  if (logo) {
    children.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: kind === "declaracao-execucao" ? 360 : 240 },
      children: [
        new ImageRun({
          data: logo,
          transformation: {
            width: kind === "declaracao-execucao" ? 214 : 156,
            height: kind === "declaracao-execucao" ? 58 : 42,
          },
        }),
      ],
    }));
  }
  children.push(...documentPieces.docxBody);
  children.push(signatureTable(context));

  const section: ISectionOptions = {
    properties: {
      page: {
        size: {
          orientation: PageOrientation.PORTRAIT,
        },
        margin: {
          top: 720,
          right: 760,
          bottom: 760,
          left: 760,
        },
      },
    },
    footers: {
      default: operationalFooter(),
    },
    children,
  };

  const doc = new Document({
    creator: "AdOps Campanhas Portais",
    title: DOCUMENT_TITLES[kind],
    description: `Documento operacional gerado para a inserção ${context.insertionId}`,
    sections: [section],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

export async function generateOperationalDocument(
  insertion: InsertionLike,
  kind: OperationalDocumentKind,
): Promise<GeneratedOperationalDocument> {
  const context = buildContext(insertion);
  const descriptor = descriptorFor(kind, context);
  const html = await renderDocumentHtml(kind, context);
  const [docx, pdf] = await Promise.all([
    renderDocx(kind, context),
    renderPdf(html),
  ]);

  return { descriptor, docx, pdf };
}

export async function listOperationalDocuments(insertion: InsertionLike): Promise<OperationalDocumentDescriptor[]> {
  const context = buildContext(insertion);
  return [
    descriptorFor("declaracao-execucao", context),
    descriptorFor("anexo-v", context),
  ];
}
