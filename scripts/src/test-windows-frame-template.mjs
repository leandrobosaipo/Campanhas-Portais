import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultKitDir = path.resolve(__dirname, "../assets/desktop-frame/windows11-chrome-light");
const defaultFontPath = path.resolve(__dirname, "../assets/desktop-frame/fonts/selawik.ttf");

function validateFrameKit({ kitDir, fontPath }) {
  const required = [
    ["windows_frame_chrome_top_missing", "chrome-top.png"],
    ["windows_frame_taskbar_missing", "taskbar.png"],
    ["windows_frame_layout_missing", "layout.json"],
  ];
  const requiredIcons = [
    "icons/windows.svg",
    "icons/search.svg",
    "icons/folder.svg",
    "icons/edge.svg",
    "icons/chrome.svg",
    "icons/settings.svg",
    "icons/wifi.svg",
    "icons/volume-2.svg",
    "icons/chevron-up.svg",
    "icons/LICENSE-ICONS.md",
  ];

  for (const [code, filename] of required) {
    const filePath = path.join(kitDir, filename);
    try {
      writeFileSync(filePath, Buffer.from([]), { flag: "r+" });
    } catch {
      throw new Error(`${code}: ${filePath}`);
    }
  }
  for (const filename of requiredIcons) {
    const filePath = path.join(kitDir, filename);
    try {
      writeFileSync(filePath, Buffer.from([]), { flag: "r+" });
    } catch {
      throw new Error(`windows_frame_icon_missing: ${filePath}`);
    }
  }

  if (!fontPath) {
    throw new Error("windows_frame_font_missing: defina ADOPS_WINDOWS_FRAME_FONT com Segoe UI/Segoe UI Variable");
  }

  try {
    writeFileSync(fontPath, Buffer.from([]), { flag: "r+" });
  } catch {
    throw new Error(`windows_frame_font_missing: ${fontPath}`);
  }

  return true;
}

function touch(filePath, body = "") {
  writeFileSync(filePath, body);
}

function touchRequiredIcons(baseDir) {
  const iconFiles = [
    "icons/windows.svg",
    "icons/search.svg",
    "icons/folder.svg",
    "icons/edge.svg",
    "icons/chrome.svg",
    "icons/settings.svg",
    "icons/wifi.svg",
    "icons/volume-2.svg",
    "icons/chevron-up.svg",
    "icons/LICENSE-ICONS.md",
  ];
  for (const rel of iconFiles) {
    const target = path.join(baseDir, rel);
    const parent = path.dirname(target);
    mkdirSync(parent, { recursive: true });
    touch(target, rel.endsWith(".md") ? "# test\n" : "<svg/>");
  }
}

const tempDir = mkdtempSync(path.join(tmpdir(), "adops-frame-template-test-"));
try {
  assert.throws(
    () => validateFrameKit({ kitDir: tempDir, fontPath: "" }),
    /windows_frame_chrome_top_missing/,
  );

  touch(path.join(tempDir, "chrome-top.png"));
  assert.throws(
    () => validateFrameKit({ kitDir: tempDir, fontPath: "" }),
    /windows_frame_taskbar_missing/,
  );

  touch(path.join(tempDir, "taskbar.png"));
  assert.throws(
    () => validateFrameKit({ kitDir: tempDir, fontPath: "" }),
    /windows_frame_layout_missing/,
  );

  touch(path.join(tempDir, "layout.json"), "{}");
  touchRequiredIcons(tempDir);
  assert.throws(
    () => validateFrameKit({ kitDir: tempDir, fontPath: "" }),
    /windows_frame_font_missing/,
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

if (process.env.ADOPS_VALIDATE_REAL_WINDOWS_FRAME_KIT === "true") {
  validateFrameKit({
    kitDir: process.env.ADOPS_WINDOWS_FRAME_TEMPLATE_DIR
      ? path.resolve(process.env.ADOPS_WINDOWS_FRAME_TEMPLATE_DIR)
      : defaultKitDir,
    fontPath: process.env.ADOPS_WINDOWS_FRAME_FONT ? path.resolve(process.env.ADOPS_WINDOWS_FRAME_FONT) : defaultFontPath,
  });
}

console.log(JSON.stringify({
  ok: true,
  contract: "windows11_chrome_real_template",
  strictAssetValidation: process.env.ADOPS_VALIDATE_REAL_WINDOWS_FRAME_KIT === "true" ? "enabled" : "negative-contract-only",
}));
