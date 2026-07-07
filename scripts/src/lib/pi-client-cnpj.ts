import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(process.env.ADOPS_PROJECT_ROOT ?? process.cwd());
const PI_REFERENCE_DIR = path.resolve(PROJECT_ROOT, "docs", "pi-9042026-texto");

export type InferredClientProfile = {
  razaoSocial?: string | null;
  cnpj?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
};

let referenceIndexPromise: Promise<Array<{ fileName: string; content: string; normalized: string }>> | null = null;

function normalizeSpaces(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeForMatch(value: string) {
  return normalizeSpaces(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function formatCnpj(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return raw;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatCep(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return raw;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function extractPiDigits(piCodigo: string | null | undefined) {
  const match = String(piCodigo ?? "").match(/\b(\d{4,8})\b/);
  return match?.[1] ?? null;
}

function splitColumns(line: string) {
  return normalizeSpaces(line)
    .split(/\s{3,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanLabeledValue(value: string, label: string) {
  return normalizeSpaces(value.replace(new RegExp(`^${label}\\s*:?\\s*`, "i"), ""));
}

async function loadReferenceIndex() {
  if (!referenceIndexPromise) {
    referenceIndexPromise = (async () => {
      if (!existsSync(PI_REFERENCE_DIR)) {
        return [];
      }
      const entries = await readdir(PI_REFERENCE_DIR);
      const txtFiles = entries.filter((fileName) => fileName.toLowerCase().endsWith(".txt")).sort();
      return Promise.all(
        txtFiles.map(async (fileName) => {
          const content = await readFile(path.join(PI_REFERENCE_DIR, fileName), "utf8");
          return {
            fileName,
            content,
            normalized: normalizeForMatch(content),
          };
        }),
      );
    })();
  }
  return referenceIndexPromise;
}

function extractFirstColumnByLabel(lines: string[], label: string) {
  for (const line of lines.slice(0, 50)) {
    if (!new RegExp(label, "i").test(line)) continue;
    const firstColumn = splitColumns(line)[0];
    if (!firstColumn) continue;
    const cleaned = cleanLabeledValue(firstColumn, label);
    if (cleaned) return cleaned;
  }
  return null;
}

function extractClientPhoneFromReference(lines: string[]) {
  for (const line of lines.slice(0, 50)) {
    if (!/Tel\.?/i.test(line)) continue;
    const firstColumn = splitColumns(line)[0];
    if (!firstColumn) continue;
    const match = firstColumn.match(/Tel\.?:?\s*([0-9()\-\s]{8,})/i);
    if (match?.[1]) return normalizeSpaces(match[1]);
  }
  return null;
}

function extractClientCnpjFromReference(lines: string[]) {
  for (const line of lines.slice(0, 50)) {
    if (!/CNPJ/i.test(line)) continue;
    const firstColumn = splitColumns(line)[0];
    if (!firstColumn) continue;
    const match = firstColumn.match(/(\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}-?\d{2}|\d{14})/);
    if (match?.[1]) return formatCnpj(match[1]);
  }
  return null;
}

function extractClientEmailFromReference(lines: string[]) {
  const direct = extractFirstColumnByLabel(lines, "E-mail");
  if (direct) return direct;

  for (const line of lines.slice(0, 60)) {
    if (!/@/.test(line)) continue;
    const firstColumn = splitColumns(line)[0];
    const match = firstColumn?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (match?.[0]) return match[0];
  }
  return null;
}

function extractClientAddressBlock(lines: string[]) {
  const direct = extractFirstColumnByLabel(lines, "Endere[cç]o");
  if (!direct) return null;

  const normalized = normalizeSpaces(direct);
  const cepMatch = normalized.match(/\b(\d{5}-?\d{3})\b/);
  const ufMatch = normalized.match(/\b([A-Z]{2})\b(?=.*CEP)/i);
  const cidadeMatch = normalized.match(/Cidade\s*:?\s*([^,]+?)(?:\s+UF|\s+CEP|$)/i);

  return {
    endereco: normalized,
    cidade: cidadeMatch?.[1] ? normalizeSpaces(cidadeMatch[1]) : null,
    uf: ufMatch?.[1] ? ufMatch[1].toUpperCase() : null,
    cep: cepMatch?.[1] ? formatCep(cepMatch[1]) : null,
  };
}

function extractCityUfCepFromReference(lines: string[]) {
  for (const line of lines.slice(0, 50)) {
    if (!/Cidade/i.test(line) && !/CEP/i.test(line)) continue;
    const firstColumn = splitColumns(line)[0];
    if (!firstColumn) continue;
    const cidadeMatch = firstColumn.match(/Cidade\s*:?\s*([^,]+?)(?:\s+UF|\s+CEP|$)/i);
    const ufMatch = firstColumn.match(/\bUF\s*:?\s*([A-Z]{2})\b/i);
    const cepMatch = firstColumn.match(/\bCEP\s*:?\s*([0-9.\-]{8,10})\b/i);
    if (cidadeMatch || ufMatch || cepMatch) {
      return {
        cidade: cidadeMatch?.[1] ? normalizeSpaces(cidadeMatch[1]) : null,
        uf: ufMatch?.[1] ? ufMatch[1].toUpperCase() : null,
        cep: cepMatch?.[1] ? formatCep(cepMatch[1]) : null,
      };
    }
  }
  return null;
}

function extractClientProfileFromReference(content: string): InferredClientProfile {
  const lines = content.split(/\r?\n/).map((line) => normalizeSpaces(line)).filter(Boolean);
  const addressBlock = extractClientAddressBlock(lines);
  const cityBlock = extractCityUfCepFromReference(lines);

  return {
    razaoSocial: extractFirstColumnByLabel(lines, "Raz[aã]o Social"),
    cnpj: extractClientCnpjFromReference(lines),
    telefone: extractClientPhoneFromReference(lines),
    email: extractClientEmailFromReference(lines),
    endereco: addressBlock?.endereco ?? null,
    cidade: cityBlock?.cidade ?? addressBlock?.cidade ?? null,
    uf: cityBlock?.uf ?? addressBlock?.uf ?? null,
    cep: cityBlock?.cep ?? addressBlock?.cep ?? null,
  };
}

export async function inferClientProfileFromPiReference(
  piCodigo: string | null | undefined,
  clientName: string | null | undefined,
): Promise<InferredClientProfile | null> {
  const piDigits = extractPiDigits(piCodigo);
  const normalizedClient = normalizeForMatch(clientName ?? "");
  const references = await loadReferenceIndex();

  const ranked = references
    .map((entry) => {
      let score = 0;
      if (piDigits && (entry.fileName.includes(piDigits) || entry.normalized.includes(piDigits))) score += 3;
      if (normalizedClient && entry.normalized.includes(normalizedClient)) score += 2;
      return { ...entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const entry of ranked) {
    const profile = extractClientProfileFromReference(entry.content);
    if (Object.values(profile).some(Boolean)) return profile;
  }

  return null;
}

export async function inferClientCnpjFromPiReference(piCodigo: string | null | undefined, clientName: string | null | undefined) {
  const profile = await inferClientProfileFromPiReference(piCodigo, clientName);
  return profile?.cnpj ?? null;
}
