import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractPiDigits, normalizeForMatch } from "./current-sheet-campaigns";
import { listCurrentDriveInventoryItems } from "./drive-inventory";

export const DRIVE_CAMPAIGN_MEDIA_VERSION = "drive-campaign-media-v1" as const;

const DEFAULT_ROOT_FOLDER_ID = "18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6";
const DEFAULT_CACHE_FILE = "docs/harness-reports/drive-pi-scan-2026-05-13/drive-items.json";

const PORTAL_PATH_ALIASES: Record<string, string[]> = {
  AFL: ["/AFL"],
  OMT: ["/O MATOGROSSENSE", "/OMT"],
  ROO: ["/ROO NOTICIAS", "/ROO"],
  PERRENGUE: ["/PERRENGUE"],
  PNMT: ["/PNMT"],
  PPMT: ["/PMMT", "/PPMT"],
};

const IMAGE_EXTENSIONS = new Set(["gif", "png", "jpg", "jpeg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm"]);
const TEXT_EXTENSIONS = new Set(["txt", "docx"]);

type DriveRawItem = {
  id: string;
  name: string;
  mimeType: string;
  path?: string;
  parentFolderId?: string | null;
  parents?: string[];
  webViewLink?: string | null;
  modifiedTime?: string | null;
  size?: string | null;
  md5Checksum?: string | null;
};

export type DriveCampaignFile = {
  id: string;
  name: string;
  mimeType: string;
  path: string;
  webViewLink: string | null;
  modifiedTime: string | null;
  kind: "image" | "video" | "pdf" | "text" | "folder" | "other";
};

export type DriveCampaignMediaMatch = {
  version: typeof DRIVE_CAMPAIGN_MEDIA_VERSION;
  status: "matched" | "not_found" | "ambiguous" | "unavailable";
  source: "cache" | "live" | "snapshot" | "none";
  folderPath: string | null;
  folderId: string | null;
  mediaFiles: DriveCampaignFile[];
  pdfFiles: DriveCampaignFile[];
  textFiles: DriveCampaignFile[];
  otherFiles: DriveCampaignFile[];
  sourceIdentity: {
    requestedPi: string | null;
    folderPiCandidates: string[];
    pdfPiCandidates: string[];
    mediaPiCandidates: string[];
    exactPiFolder: boolean;
    piConflict: boolean;
  };
  warnings: string[];
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function extractDrivePiCandidates(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return uniqueStrings(
    [...normalized.matchAll(/\bPI\s*[-_:]?\s*(\d{3,})\b/g)].map((match) => match[1]),
  );
}

function campaignFolderPath(path: string) {
  const pieces = path.split("/").filter(Boolean);
  const piIndex = pieces.findIndex((piece) => extractDrivePiCandidates(piece).length > 0);
  if (piIndex >= 0) return `/${pieces.slice(0, piIndex + 1).join("/")}`;
  return nearestFolderPath(path);
}

function sourceIdentity(
  requestedPi: string | null,
  folderPath: string | null,
  mediaFiles: DriveCampaignFile[],
  pdfFiles: DriveCampaignFile[],
) {
  const folderPiCandidates = extractDrivePiCandidates(folderPath);
  const pdfPiCandidates = uniqueStrings(pdfFiles.flatMap((file) => extractDrivePiCandidates(file.name)));
  const mediaPiCandidates = uniqueStrings(mediaFiles.flatMap((file) => extractDrivePiCandidates(file.name)));
  const observed = uniqueStrings([...folderPiCandidates, ...pdfPiCandidates, ...mediaPiCandidates]);
  return {
    requestedPi,
    folderPiCandidates,
    pdfPiCandidates,
    mediaPiCandidates,
    exactPiFolder: Boolean(requestedPi && folderPiCandidates.includes(requestedPi)),
    piConflict: observed.length > 1 || Boolean(requestedPi && observed.length && observed.some((candidate) => candidate !== requestedPi)),
  };
}

function extension(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function classify(item: DriveRawItem): DriveCampaignFile["kind"] {
  if (item.mimeType === "application/vnd.google-apps.folder") return "folder";
  if (item.mimeType === "application/pdf" || extension(item.name) === "pdf") return "pdf";
  if (item.mimeType === "application/vnd.google-apps.document") return "text";
  const ext = extension(item.name);
  if (IMAGE_EXTENSIONS.has(ext) || item.mimeType.startsWith("image/")) return "image";
  if (VIDEO_EXTENSIONS.has(ext) || item.mimeType.startsWith("video/")) return "video";
  if (TEXT_EXTENSIONS.has(ext) || item.mimeType.startsWith("text/")) return "text";
  return "other";
}

function normalizeDriveItem(item: DriveRawItem): DriveCampaignFile {
  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    path: item.path ?? `/${item.name}`,
    webViewLink: item.webViewLink ?? null,
    modifiedTime: item.modifiedTime ?? null,
    kind: classify(item),
  };
}

function itemsFromUnknown(value: unknown): DriveRawItem[] {
  if (Array.isArray(value)) return value.filter(isDriveRawItem);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items.filter(isDriveRawItem);
  if (Array.isArray(record.files)) return record.files.filter(isDriveRawItem);
  if (record.currentItems && typeof record.currentItems === "object") {
    return Object.values(record.currentItems as Record<string, unknown>).filter(isDriveRawItem);
  }
  return [];
}

function isDriveRawItem(value: unknown): value is DriveRawItem {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.name === "string" && typeof record.mimeType === "string";
}

async function readCachedDriveItems() {
  const candidates = [
    process.env.ADOPS_DRIVE_PI_INDEX_FILE,
    process.env.DRIVE_PI_MONITOR_STATE_FILE,
    process.env.ADOPS_DRIVE_PI_MONITOR_STATE_FILE,
    resolve(process.cwd(), DEFAULT_CACHE_FILE),
  ].filter((value): value is string => Boolean(value));

  const warnings: string[] = [];
  for (const candidate of candidates) {
    try {
      const payload = JSON.parse(await readFile(candidate, "utf8"));
      const items = itemsFromUnknown(payload);
      if (items.length) return { items, sourcePath: candidate, warnings };
      warnings.push(`Arquivo de índice sem itens: ${candidate}`);
    } catch (error) {
      warnings.push(`Índice indisponível: ${candidate} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return { items: [] as DriveRawItem[], sourcePath: null, warnings };
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function loadServiceAccount() {
  const inline = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
  if (inline) return JSON.parse(inline) as { client_email: string; private_key: string };
  const file = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!file) return null;
  return JSON.parse(await readFile(file, "utf8")) as { client_email: string; private_key: string };
}

async function driveAccessToken() {
  if (process.env.GOOGLE_DRIVE_ACCESS_TOKEN) return process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const account = await loadServiceAccount();
  if (!account?.client_email || !account.private_key) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(account.private_key.replace(/\\n/g, "\n"));
  const jwt = `${unsigned}.${base64url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!response.ok) throw new Error(`Falha ao obter token Google Drive: HTTP ${response.status}`);
  const payload = await response.json() as { access_token?: string };
  return payload.access_token ?? null;
}

async function driveGet<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Google Drive HTTP ${response.status}`);
  return await response.json() as T;
}

async function listLiveDriveItems(rootFolderId: string) {
  const token = await driveAccessToken();
  if (!token) return { items: [] as DriveRawItem[], warnings: ["Credencial Google Drive ausente para refreshDrive=true."] };
  const accessToken = token;
  const items: DriveRawItem[] = [];

  async function visit(folderId: string, basePath: string) {
    let pageToken: string | null = null;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,parents,webViewLink,modifiedTime,size,md5Checksum)",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        orderBy: "folder,name",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const payload = await driveGet<{ nextPageToken?: string; files?: DriveRawItem[] }>(
        accessToken,
        `https://www.googleapis.com/drive/v3/files?${params}`,
      );
      for (const file of payload.files ?? []) {
        const itemPath = `${basePath}/${file.name}`.replace(/\/+/g, "/");
        const item = { ...file, path: itemPath, parentFolderId: folderId };
        items.push(item);
        if (file.mimeType === "application/vnd.google-apps.folder") await visit(file.id, itemPath);
      }
      pageToken = payload.nextPageToken ?? null;
    } while (pageToken);
  }

  await visit(rootFolderId, "");
  return { items, warnings: [] as string[] };
}

function portalItems(items: DriveRawItem[], siteSigla: string) {
  const aliases = PORTAL_PATH_ALIASES[siteSigla] ?? [`/${siteSigla}`];
  return items.filter((item) => {
    const path = item.path ?? "";
    return aliases.some((alias) => path === alias || path.startsWith(`${alias}/`));
  });
}

function nearestFolderPath(path: string) {
  const pieces = path.split("/").filter(Boolean);
  if (pieces.length <= 1) return path || null;
  return `/${pieces.slice(0, pieces.length - 1).join("/")}`;
}

function scoreCampaignItem(item: DriveRawItem, input: { piCodigo: string; campaignName: string; siteSigla: string }) {
  const piDigits = extractPiDigits(input.piCodigo);
  const haystack = normalizeForMatch(`${item.path ?? ""} ${item.name}`);
  if (piDigits && haystack.includes(piDigits)) return 100;
  const campaignTokens = normalizeForMatch(input.campaignName).split(/\s+/).filter((token) => token.length >= 4);
  const tokenMatches = campaignTokens.filter((token) => haystack.includes(token)).length;
  if (tokenMatches && haystack.includes(input.siteSigla)) return 30 + tokenMatches;
  if (tokenMatches >= Math.min(2, campaignTokens.length)) return 20 + tokenMatches;
  return 0;
}

function scoreCampaignFolder(folderPath: string, files: DriveRawItem[], input: { piCodigo: string; campaignName: string; siteSigla: string }) {
  const requestedPi = extractPiDigits(input.piCodigo);
  const folderPis = extractDrivePiCandidates(folderPath);
  if (requestedPi && folderPis.includes(requestedPi)) return 1_000;
  const filePis = uniqueStrings(files.flatMap((item) => extractDrivePiCandidates(`${item.path ?? ""} ${item.name}`)));
  if (requestedPi && filePis.includes(requestedPi)) return 800;
  return Math.max(0, ...files.map((item) => scoreCampaignItem(item, input)));
}

export async function findDriveCampaignMedia(input: {
  siteSigla: string;
  piCodigo: string;
  campaignName: string;
  refreshDrive?: boolean;
}): Promise<DriveCampaignMediaMatch> {
  const rootFolderId = process.env.DRIVE_PI_MONITOR_ROOT_FOLDER_ID ?? DEFAULT_ROOT_FOLDER_ID;
  const warnings: string[] = [];
  let items: DriveRawItem[] = [];
  let source: "cache" | "live" | "snapshot" | "none" = "none";

  if (process.env.DRIVE_INTEGRATION_MODE === "monitor") {
    try {
      items = await listCurrentDriveInventoryItems();
      if (items.length) source = "snapshot";
      else warnings.push("Snapshot do Drive ainda não possui itens.");
    } catch (error) {
      warnings.push(`Snapshot do Drive indisponível: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!items.length && input.refreshDrive && process.env.DRIVE_INTEGRATION_MODE !== "monitor") {
    try {
      const live = await listLiveDriveItems(rootFolderId);
      items = live.items;
      warnings.push(...live.warnings);
      if (items.length) source = "live";
    } catch (error) {
      warnings.push(`Refresh ao vivo do Drive falhou: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!items.length) {
    const cached = await readCachedDriveItems();
    items = cached.items;
    warnings.push(...cached.warnings);
    if (items.length) source = "cache";
  }

  if (!items.length) {
    return {
      version: DRIVE_CAMPAIGN_MEDIA_VERSION,
      status: "unavailable",
      source,
      folderPath: null,
      folderId: null,
      mediaFiles: [],
      pdfFiles: [],
      textFiles: [],
      otherFiles: [],
      sourceIdentity: sourceIdentity(extractPiDigits(input.piCodigo), null, [], []),
      warnings,
    };
  }

  const scoped = portalItems(items, input.siteSigla);
  const grouped = new Map<string, DriveRawItem[]>();
  for (const item of scoped) {
    const normalized = normalizeDriveItem(item);
    const folderPath = normalized.kind === "folder" ? normalized.path : campaignFolderPath(normalized.path);
    if (!folderPath) continue;
    const current = grouped.get(folderPath) ?? [];
    current.push(item);
    grouped.set(folderPath, current);
  }
  const scored = Array.from(grouped.entries())
    .map(([folderPath, files]) => ({ folderPath, files, score: scoreCampaignFolder(folderPath, files, input) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.folderPath.localeCompare(b.folderPath));

  if (!scored.length) {
    return {
      version: DRIVE_CAMPAIGN_MEDIA_VERSION,
      status: "not_found",
      source,
      folderPath: null,
      folderId: null,
      mediaFiles: [],
      pdfFiles: [],
      textFiles: [],
      otherFiles: [],
      sourceIdentity: sourceIdentity(extractPiDigits(input.piCodigo), null, [], []),
      warnings,
    };
  }

  const bestScore = scored[0]!.score;
  const best = scored.filter((entry) => entry.score === bestScore);
  const folderPaths = best.map((entry) => entry.folderPath);
  const folderPath = folderPaths[0] ?? null;
  const folderId = scoped.find((item) => item.mimeType === "application/vnd.google-apps.folder" && item.path === folderPath)?.id ?? null;
  const folderPrefix = folderPath ? `${folderPath}/` : "";
  const files = scoped
    .filter((item) => item.path === folderPath || item.path?.startsWith(folderPrefix))
    .map(normalizeDriveItem)
    .filter((item) => item.kind !== "folder");

  const mediaFiles = files.filter((item) => item.kind === "image" || item.kind === "video");
  const pdfFiles = files.filter((item) => item.kind === "pdf");
  const textFiles = files.filter((item) => item.kind === "text");
  const otherFiles = files.filter((item) => item.kind === "other");
  const identity = sourceIdentity(extractPiDigits(input.piCodigo), folderPath, mediaFiles, pdfFiles);
  if (identity.piConflict) {
    warnings.push(`Divergência de PI detectada entre planilha/pedido e nomes da pasta ou arquivos: solicitado ${identity.requestedPi ?? "sem PI"}; pasta ${identity.folderPiCandidates.join(", ") || "sem PI"}; PDF ${identity.pdfPiCandidates.join(", ") || "sem PI"}.`);
  }

  return {
    version: DRIVE_CAMPAIGN_MEDIA_VERSION,
    status: folderPaths.length > 1 ? "ambiguous" : "matched",
    source,
    folderPath,
    folderId,
    mediaFiles,
    pdfFiles,
    textFiles,
    otherFiles,
    sourceIdentity: identity,
    warnings,
  };
}

export function driveMediaMatchesFormat(mediaFiles: DriveCampaignFile[], normalizedFormat: string) {
  if (normalizeForMatch(normalizedFormat).includes("VIDEO")) {
    return mediaFiles.some((file) => file.kind === "video");
  }
  return mediaFiles.some((file) => file.kind === "image");
}
