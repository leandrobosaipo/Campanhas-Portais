import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function evidenceExportPython() {
  return process.env.ADOPS_EVIDENCE_EXPORT_PYTHON?.trim() || "python3";
}

const OPTIMIZE_PNG_SCRIPT = String.raw`
import json
import sys
from PIL import Image, ImageOps

source_path, output_path, max_width_raw = sys.argv[1:4]
max_width = int(max_width_raw)

with Image.open(source_path) as source:
    source.load()
    if source.format != "PNG":
        raise ValueError("source_is_not_png")
    image = ImageOps.exif_transpose(source)
    source_width, source_height = image.size
    if source_width <= 0 or source_height <= 0:
        raise ValueError("invalid_image_dimensions")
    if source_width > max_width:
        target_height = max(1, round(source_height * max_width / source_width))
        resampling = getattr(Image, "Resampling", Image).LANCZOS
        image = image.resize((max_width, target_height), resampling)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "transparency" in image.info else "RGB")
    image.save(output_path, "PNG", optimize=True, compress_level=9)
    width, height = image.size

print(json.dumps({
    "sourceWidth": source_width,
    "sourceHeight": source_height,
    "width": width,
    "height": height,
}))
`;

export type EvidenceExportMode = "full" | "prints-only";
export type EvidenceImageVariant = "original" | "web";

export class EvidenceExportInputError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "EvidenceExportInputError";
  }
}

export type EvidenceDeliveryInsertion = {
  siteSigla?: string | null;
  piCodigo?: string | null;
  clienteNome?: string | null;
  campanhaName?: string | null;
  localFormatoNormalizado?: string | null;
  localFormato?: string | null;
  periodoInicio?: string | null;
  periodoFim?: string | null;
};

export type PreparedEvidencePng = {
  originalBytes: number;
  outputBytes: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
  width: number | null;
  height: number | null;
};

export function parseEvidenceExportOptions(query: Record<string, unknown>) {
  const mode = String(query.mode ?? "full")
    .trim()
    .toLowerCase();
  const variant = String(query.variant ?? "original")
    .trim()
    .toLowerCase();
  if (mode !== "full" && mode !== "prints-only") {
    throw new EvidenceExportInputError("mode deve ser full ou prints-only.");
  }
  if (variant !== "original" && variant !== "web") {
    throw new EvidenceExportInputError("variant deve ser original ou web.");
  }
  if (mode === "full" && variant !== "original") {
    throw new EvidenceExportInputError("variant=web exige mode=prints-only.");
  }
  return {
    mode: mode as EvidenceExportMode,
    variant: variant as EvidenceImageVariant,
  };
}

export function deliverySegment(
  value: string | null | undefined,
  fallback: string,
) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return normalized || fallback;
}

export function resolveDeliveryPiCode(value: string | null | undefined) {
  const groups = String(value ?? "").match(/\d+/g) ?? [];
  return groups.join("") || "SEM-PI";
}

export function resolveDeliveryPosition(insertion: EvidenceDeliveryInsertion) {
  return deliverySegment(
    insertion.localFormatoNormalizado ?? insertion.localFormato,
    "POSICAO",
  );
}

export function resolveDeliveryDateRange(
  insertion: EvidenceDeliveryInsertion,
  evidenceDates: Array<string | null | undefined>,
) {
  const dates = evidenceDates
    .filter((value): value is string =>
      /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")),
    )
    .sort();
  return {
    start: dates[0] ?? insertion.periodoInicio ?? "SEM-INICIO",
    end: dates.at(-1) ?? insertion.periodoFim ?? "SEM-FIM",
  };
}

export function buildDeliveryPackageName(
  insertion: EvidenceDeliveryInsertion,
  evidenceDates: Array<string | null | undefined>,
) {
  const range = resolveDeliveryDateRange(insertion, evidenceDates);
  const site = deliverySegment(insertion.siteSigla, "SITE");
  const pi = resolveDeliveryPiCode(insertion.piCodigo);
  const advertiser = deliverySegment(
    insertion.clienteNome ?? insertion.campanhaName,
    "CAMPANHA",
  );
  const position = resolveDeliveryPosition(insertion);
  return `${site}-PI-${pi}-${advertiser}-${position}-${range.start}-A-${range.end}`;
}

export function buildDeliveryPrintFileName(
  insertion: EvidenceDeliveryInsertion,
  dateKey: string,
  collisionSuffix?: string,
) {
  const site = deliverySegment(insertion.siteSigla, "SITE");
  const pi = resolveDeliveryPiCode(insertion.piCodigo);
  const position = resolveDeliveryPosition(insertion);
  const suffix = collisionSuffix
    ? `-${deliverySegment(collisionSuffix, "DUPLICADO")}`
    : "";
  return `${site}-PI-${pi}-${position}-${dateKey}${suffix}.png`;
}

export function isPngBuffer(value: Buffer) {
  return (
    value.length >= PNG_SIGNATURE.length &&
    value.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  );
}

export async function prepareEvidencePng(options: {
  source: Buffer;
  outputPath: string;
  variant: EvidenceImageVariant;
  maxWidth?: number;
}): Promise<PreparedEvidencePng> {
  const { source, outputPath, variant } = options;
  const maxWidth = options.maxWidth ?? 1920;
  if (!Number.isInteger(maxWidth) || maxWidth <= 0) {
    throw new EvidenceExportInputError("maxWidth inválido.");
  }
  if (!isPngBuffer(source)) {
    throw new EvidenceExportInputError(
      "A evidência de origem não é um PNG válido.",
      422,
    );
  }

  await mkdir(dirname(outputPath), { recursive: true });
  if (variant === "original") {
    await writeFile(outputPath, source);
    return {
      originalBytes: source.length,
      outputBytes: source.length,
      sourceWidth: null,
      sourceHeight: null,
      width: null,
      height: null,
    };
  }

  const sourcePath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${crypto.randomUUID()}.source.png`,
  );
  await writeFile(sourcePath, source);
  try {
    const result = await execFileAsync(
      evidenceExportPython(),
      ["-c", OPTIMIZE_PNG_SCRIPT, sourcePath, outputPath, String(maxWidth)],
      { timeout: 120_000, maxBuffer: 1024 * 1024 },
    );
    const metadata = JSON.parse(result.stdout.trim()) as {
      sourceWidth: number;
      sourceHeight: number;
      width: number;
      height: number;
    };
    const output = await readFile(outputPath);
    if (!isPngBuffer(output)) {
      throw new EvidenceExportInputError(
        "A otimização não produziu um PNG válido.",
        422,
      );
    }
    const outputStats = await stat(outputPath);
    return {
      originalBytes: source.length,
      outputBytes: outputStats.size,
      sourceWidth: metadata.sourceWidth,
      sourceHeight: metadata.sourceHeight,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    await rm(outputPath, { force: true });
    if (error instanceof EvidenceExportInputError) throw error;
    throw new EvidenceExportInputError(
      `Falha ao otimizar PNG para web: ${error instanceof Error ? error.message : String(error)}`,
      422,
    );
  } finally {
    await rm(sourcePath, { force: true });
  }
}

export function calculateSavingsPercent(
  originalBytes: number,
  outputBytes: number,
) {
  if (originalBytes <= 0) return 0;
  return Math.max(
    0,
    Math.round((1 - outputBytes / originalBytes) * 10_000) / 100,
  );
}
