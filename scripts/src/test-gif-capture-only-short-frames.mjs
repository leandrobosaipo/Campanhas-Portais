#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const tmpDir = path.join(repoRoot, "scripts/tmp/gif-capture-only-short-frames");
const fixturePath = path.join(tmpDir, "short-frames.gif");
const captureScriptPath = path.join(repoRoot, "scripts/src/capture-insertion-proof.cjs");

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const makeFixture = `
from PIL import Image, ImageDraw
import os
out = "${fixturePath}"
os.makedirs(os.path.dirname(out), exist_ok=True)
frames = []
colors = ["#0b1d33", "#f36b21", "#15803d", "#7c3aed", "#b91c1c", "#0f766e"]
for index, color in enumerate(colors):
    img = Image.new("RGB", (300, 250), color)
    draw = ImageDraw.Draw(img)
    draw.rectangle((18, 18, 282, 232), outline="#ffffff", width=5)
    draw.rectangle((42 + index * 7, 72, 258, 118), fill="#ffffff")
    draw.rectangle((62, 148, 238 - index * 5, 194), fill="#111827")
    draw.text((54, 84), f"ENERGISA {index}", fill="#111827")
    draw.text((82, 160), "SAIBA MAIS", fill="#ffffff")
    frames.append(img)
frames[0].save(out, save_all=True, append_images=frames[1:], duration=[30] * len(frames), loop=0)
`;
execFileSync(process.env.ADOPS_CAPTURE_PYTHON || "python3", ["-c", makeFixture], { stdio: "pipe" });

const analyzeFixture = `
from PIL import Image, ImageChops, ImageStat
import json
gif_path = "${fixturePath}"
image = Image.open(gif_path)
frame_count = getattr(image, "n_frames", 1)
min_hold_ms = 1200
min_non_bg_ratio = 0.02
min_contrast = 20
capture_only_min_non_bg_ratio = 0.02
capture_only_min_contrast = 12
def calc_non_bg_ratio(rgb, threshold=12):
    bg_color = rgb.getpixel((0, 0))
    bg = Image.new("RGB", rgb.size, bg_color)
    diff = ImageChops.difference(rgb, bg).convert("L")
    mask = diff.point(lambda px: 255 if px > threshold else 0)
    return mask.histogram()[255] / (rgb.size[0] * rgb.size[1])
def avg_hash(rgb, size=8):
    tiny = rgb.convert("L").resize((size, size))
    pixels = list(tiny.getdata())
    avg = sum(pixels) / len(pixels)
    return "".join("1" if px >= avg else "0" for px in pixels)
def hamming(left, right):
    return sum(1 for a, b in zip(left, right) if a != b)
rows = []
for index in range(frame_count):
    image.seek(index)
    rgb = image.convert("RGBA").convert("RGB")
    duration_ms = int(image.info.get("duration", 0) or 0)
    contrast = ImageStat.Stat(rgb.convert("L")).stddev[0]
    non_bg_ratio = calc_non_bg_ratio(rgb)
    rows.append({
        "frameIndex": index,
        "durationMs": duration_ms,
        "contrast": round(contrast, 3),
        "nonBgRatio": round(non_bg_ratio, 5),
        "strongCandidate": duration_ms >= min_hold_ms and non_bg_ratio >= min_non_bg_ratio and contrast >= min_contrast,
        "captureOnlyCandidate": non_bg_ratio >= capture_only_min_non_bg_ratio and contrast >= capture_only_min_contrast,
        "sceneHash": avg_hash(rgb),
    })
capture_only_rows = [row for row in rows if row["captureOnlyCandidate"]]
ranked = sorted(capture_only_rows, key=lambda row: (row["contrast"] + row["nonBgRatio"] * 1000 + min(row["durationMs"], min_hold_ms) / 100, row["frameIndex"]), reverse=True)
deduped = []
for row in ranked:
    if all(hamming(row["sceneHash"], existing["sceneHash"]) >= 8 for existing in deduped):
        deduped.append(row)
if not deduped and ranked:
    deduped = [ranked[0]]
deduped = sorted(deduped, key=lambda row: row["frameIndex"])
def stable_number(seed, modulo):
    value = 0
    for char in str(seed):
        value = (value * 33 + ord(char)) % 2147483647
    return value % modulo if modulo > 0 else value
selections = {}
for date in ["2026-05-12", "2026-05-13", "2026-05-14", "2026-05-15", "2026-05-16", "2026-05-17", "2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21"]:
    seed = f"490711:{date}:fixture-sha"
    selections[date] = deduped[stable_number(seed, len(deduped))]["frameIndex"]
print(json.dumps({"frameCount": frame_count, "rows": rows, "deduped": deduped, "selections": selections}, indent=2))
`;

const analysis = JSON.parse(execFileSync(process.env.ADOPS_CAPTURE_PYTHON || "python3", ["-c", analyzeFixture], { encoding: "utf8" }));
const source = readFileSync(captureScriptPath, "utf8");
const failures = [];

if (analysis.frameCount < 6) failures.push(`fixture deveria ter >=6 frames, recebeu ${analysis.frameCount}.`);
if (analysis.rows.some((row) => row.durationMs > 40)) failures.push("fixture deveria simular GIF de frames curtos de 30ms.");
if (analysis.rows.some((row) => row.strongCandidate)) failures.push("nenhum frame curto deveria passar como strongCandidate.");
if (analysis.deduped.length < 2) failures.push("capture-only deveria manter pelo menos duas cenas distintas.");
if (new Set(Object.values(analysis.selections)).size < 2) failures.push("datas diferentes deveriam selecionar frames diferentes.");
for (const marker of ["captureOnlyFallbackAllowed", "captureOnly", "originalGifUrl", "frameSelectionReason", "syntheticHoldMs"]) {
  if (!source.includes(marker)) failures.push(`capturador nao contem marcador obrigatorio: ${marker}.`);
}
if (/setAttribute\\(["']src["'],\\s*gifUrl\\)/.test(source)) {
  failures.push("capturador parece trocar o DOM para o GIF original, nao para frame capture-only.");
}

const summary = {
  ok: failures.length === 0,
  fixturePath,
  frameCount: analysis.frameCount,
  usefulFrames: analysis.deduped.map((row) => row.frameIndex),
  selections: analysis.selections,
  captureOnly: true,
  syntheticHoldMs: 1200,
  publishedMediaMutation: false,
  failures,
};
writeFileSync(path.join(tmpDir, "result.json"), JSON.stringify(summary, null, 2));

if (failures.length > 0) {
  throw new Error(failures.join(" "));
}

console.log(JSON.stringify(summary, null, 2));
