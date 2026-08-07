const crypto = require("node:crypto");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const ENGINE_VERSION = "tesseract.js-6.0.1";

function normalizeOcrText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expectedDateVariants(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) throw new Error(`pixel_date_invalid_target: ${isoDate}`);
  const [, year, month, day] = match;
  return [`${day}/${month}/${year}`, `${day}-${month}-${year}`, `${day}.${month}.${year}`];
}

function extractDateTokens(text) {
  return normalizeOcrText(text).match(/\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b/g) || [];
}

function isValidDateToken(token) {
  const match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/.exec(token);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function hashImageRegion(filePath, region) {
  if (!region) return null;
  const script = [
    "from PIL import Image",
    "import hashlib, sys",
    "im=Image.open(sys.argv[1]).convert('RGBA')",
    "x,y,w,h=[int(float(v)) for v in sys.argv[2:6]]",
    "crop=im.crop((x,y,x+w,y+h))",
    "print(hashlib.sha256(crop.tobytes()).hexdigest())",
  ].join("\n");
  return execFileSync("python3", ["-c", script, filePath, String(region.left), String(region.top), String(region.width), String(region.height)], {
    encoding: "utf8",
    timeout: 30_000,
  }).trim();
}

function evaluatePixelDateText({ targetDate, topbarText, editorialText, topbarConfidence, editorialConfidence, requireEditorialDate }) {
  const expected = expectedDateVariants(targetDate);
  const normalizedTopbar = normalizeOcrText(topbarText);
  const normalizedEditorial = normalizeOcrText(editorialText);
  const topbarMatch = expected.some((item) => normalizedTopbar.includes(item));
  const editorialMatch = !requireEditorialDate || expected.some((item) => normalizedEditorial.includes(item));
  const relativeVisible = /\b(?:ha|a)\s+\d+\s+(?:dia|dias|hora|horas)\b/i.test(normalizedEditorial);
  const tokens = [...extractDateTokens(normalizedTopbar), ...extractDateTokens(normalizedEditorial)];
  const malformed = tokens.filter((token) => !isValidDateToken(token));
  const issues = [];
  if (!normalizedTopbar || Number(topbarConfidence || 0) < 35) {
    issues.push({ code: "pixel_date_unreadable", detail: "A data da moldura final não pôde ser lida com confiança." });
  } else if (!topbarMatch) {
    issues.push({ code: "pixel_date_mismatch", detail: `A moldura final não contém a data-alvo ${expected[0]}.` });
  }
  if (malformed.length > 0) {
    issues.push({ code: "pixel_date_malformed", detail: `Datas malformadas reconhecidas: ${malformed.join(", ")}.` });
  }
  if (relativeVisible) {
    issues.push({ code: "pixel_relative_date_visible", detail: "A área editorial final ainda contém data relativa." });
  }
  if (requireEditorialDate && (!normalizedEditorial || Number(editorialConfidence || 0) < 25 || !editorialMatch)) {
    issues.push({ code: "pixel_date_mismatch", detail: `A área editorial final não comprova a data-alvo ${expected[0]}.` });
  }
  return {
    ok: issues.length === 0,
    expectedDate: targetDate,
    expectedDisplay: expected[0],
    topbar: { recognizedText: normalizedTopbar, confidence: Number(topbarConfidence || 0), match: topbarMatch },
    editorial: { recognizedText: normalizedEditorial, confidence: Number(editorialConfidence || 0), match: editorialMatch, required: requireEditorialDate === true },
    relativeVisible,
    malformedTokens: malformed,
    issues,
  };
}

async function auditFinalProofPixels(finalPng, options) {
  const { createWorker, OEM, PSM } = require("tesseract.js");
  const language = require("@tesseract.js-data/eng");
  const worker = await createWorker(language.code, OEM.LSTM_ONLY, {
    langPath: language.langPath,
    gzip: language.gzip,
    cacheMethod: "readOnly",
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
      user_defined_dpi: "180",
    });
    const topbarResult = await worker.recognize(finalPng, { rectangle: options.topbarRegion });
    const editorialResult = options.requireEditorialDate
      ? await worker.recognize(finalPng, { rectangle: options.editorialRegion })
      : { data: { text: "", confidence: 100 } };
    const evaluated = evaluatePixelDateText({
      targetDate: options.targetDate,
      topbarText: topbarResult.data.text,
      editorialText: editorialResult.data.text,
      topbarConfidence: topbarResult.data.confidence,
      editorialConfidence: editorialResult.data.confidence,
      requireEditorialDate: options.requireEditorialDate,
    });
    const fileSha256 = crypto.createHash("sha256").update(fs.readFileSync(finalPng)).digest("hex");
    const topbarCropSha256 = hashImageRegion(finalPng, options.topbarRegion);
    const editorialCropSha256 = options.requireEditorialDate ? hashImageRegion(finalPng, options.editorialRegion) : null;
    return {
      ...evaluated,
      engine: ENGINE_VERSION,
      checkedAt: new Date().toISOString(),
      artifactSha256: fileSha256,
      regions: {
        topbar: { ...options.topbarRegion, cropSha256: topbarCropSha256 },
        editorial: options.requireEditorialDate ? { ...options.editorialRegion, cropSha256: editorialCropSha256 } : null,
      },
    };
  } finally {
    await worker.terminate();
  }
}

module.exports = {
  ENGINE_VERSION,
  auditFinalProofPixels,
  evaluatePixelDateText,
  expectedDateVariants,
  extractDateTokens,
  hashImageRegion,
  isValidDateToken,
  normalizeOcrText,
};
