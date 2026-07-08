import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pythonBin = process.env.ADOPS_CAPTURE_PYTHON || "python3";
const defaultOutDir = path.resolve(__dirname, "../assets/desktop-frame/windows11-chrome-light");

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

const source = readArg("source");
const generateSimilar = String(readArg("generateSimilar", "false")).toLowerCase() === "true";
const width = Number(readArg("width", "1280"));
const chromeTopHeight = Number(readArg("chromeTopHeight", "102"));
const taskbarHeight = Number(readArg("taskbarHeight", "42"));
const outDir = path.resolve(readArg("outDir", defaultOutDir));
const overlayIcons = String(readArg("overlayIcons", "false")).toLowerCase() === "true";
const iconsDir = path.resolve(readArg("iconsDir", path.join(defaultOutDir, "icons")));

if (!source && !generateSimilar) {
  throw new Error("Use --source <screenshot-real-windows-chrome.png> ou --generateSimilar true.");
}
if (source && !existsSync(source)) {
  throw new Error(`source_missing: ${source}`);
}
if (!Number.isFinite(width) || width < 640) {
  throw new Error("width_invalid");
}
if (!Number.isFinite(chromeTopHeight) || chromeTopHeight < 1) {
  throw new Error("chromeTopHeight_invalid");
}
if (!Number.isFinite(taskbarHeight) || taskbarHeight < 1) {
  throw new Error("taskbarHeight_invalid");
}

mkdirSync(outDir, { recursive: true });

if (generateSimilar) {
  const payload = Buffer.from(JSON.stringify({
    width,
    chromeTopHeight,
    taskbarHeight,
    overlayIcons,
    iconsDir,
    chromeTopOut: path.join(outDir, "chrome-top.png"),
    taskbarOut: path.join(outDir, "taskbar.png"),
  }), "utf8").toString("base64");

  const py = `
import base64, json, os, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
w = int(payload["width"])
chrome_h = int(payload["chromeTopHeight"])
taskbar_h = int(payload["taskbarHeight"])
icons_dir = payload.get("iconsDir")
overlay_icons = bool(payload.get("overlayIcons"))

def font(size):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", size)
    except Exception:
        return ImageFont.load_default()

chrome = Image.new("RGBA", (w, chrome_h), (246, 248, 252, 255))
draw = ImageDraw.Draw(chrome)
draw.rectangle((0, 0, w, chrome_h), fill=(244, 246, 250, 255))
draw.rectangle((0, 34, w, 72), fill=(255, 255, 255, 255))
draw.rectangle((0, 72, w, chrome_h), fill=(255, 255, 255, 255))
draw.line((0, chrome_h - 1, w, chrome_h - 1), fill=(214, 220, 229, 255), width=1)

# Tab strip: neutral inactive tabs + active light tab. Dynamic identity is rendered later.
draw.rounded_rectangle((8, 7, 78, 32), radius=9, fill=(235, 239, 246, 255))
draw.text((24, 13), "<", fill=(91, 99, 112, 255), font=font(13))
draw.rounded_rectangle((82, 6, 326, 34), radius=10, fill=(255, 255, 255, 255), outline=(218, 224, 232, 255), width=1)
draw.rounded_rectangle((330, 7, 514, 32), radius=9, fill=(235, 239, 246, 255))
draw.text((354, 13), "+", fill=(80, 88, 101, 255), font=font(14))
draw.text((w - 74, 10), "_", fill=(69, 77, 89, 255), font=font(15))
draw.rectangle((w - 48, 13, w - 38, 23), outline=(69, 77, 89, 255), width=1)
draw.text((w - 24, 10), "x", fill=(69, 77, 89, 255), font=font(13))

# Toolbar and address bar.
draw.text((14, 45), "<", fill=(84, 93, 106, 255), font=font(18))
draw.text((45, 45), ">", fill=(160, 166, 176, 255), font=font(18))
draw.arc((70, 43, 88, 61), 40, 330, fill=(84, 93, 106, 255), width=2)
draw.rounded_rectangle((88, 40, w - 162, 66), radius=13, fill=(245, 247, 250, 255), outline=(225, 230, 238, 255), width=1)
draw.ellipse((101, 48, 111, 58), outline=(93, 101, 114, 255), width=1)
draw.line((109, 56, 116, 62), fill=(93, 101, 114, 255), width=1)
draw.text((w - 134, 43), "☆", fill=(84, 93, 106, 255), font=font(17))
draw.text((w - 100, 43), "⬇", fill=(84, 93, 106, 255), font=font(15))
draw.ellipse((w - 68, 43, w - 46, 65), fill=(239, 112, 37, 255))
draw.text((w - 62, 46), "M", fill=(255, 255, 255, 255), font=font(11))
draw.text((w - 26, 43), "⋮", fill=(84, 93, 106, 255), font=font(18))

# Bookmarks row.
draw.text((14, 78), "▦", fill=(92, 100, 113, 255), font=font(14))
draw.text((44, 80), "Todos os favoritos", fill=(92, 100, 113, 255), font=font(12))

chrome.save(payload["chromeTopOut"], "PNG")

taskbar = Image.new("RGBA", (w, taskbar_h), (239, 245, 253, 248))
draw = ImageDraw.Draw(taskbar)
draw.line((0, 0, w, 0), fill=(211, 219, 230, 255), width=1)

def render_svg(svg_path, out_size, fill=None):
    if not os.path.exists(svg_path):
        return None
    fd, tmp_png = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    subprocess.check_call(["rsvg-convert", svg_path, "-w", str(out_size), "-h", str(out_size), "-o", tmp_png])
    icon = Image.open(tmp_png).convert("RGBA")
    os.remove(tmp_png)
    if fill:
        tinted = Image.new("RGBA", icon.size, fill)
        alpha = icon.split()[-1]
        tinted.putalpha(alpha)
        icon = tinted
    return icon

draw.rounded_rectangle((14, 7, 126, 35), radius=14, fill=(255, 255, 255, 245), outline=(219, 225, 235, 255), width=1)
draw.ellipse((24, 12, 30, 18), fill=(255, 187, 0, 255))
draw.text((34, 11), "25C  Pred. nublado", fill=(94, 103, 116, 255), font=font(11))

if overlay_icons:
    required = {
        "windows": None,
        "search": (88, 95, 108, 255),
        "folder": (88, 95, 108, 255),
        "edge": None,
        "chrome": None,
        "settings": (88, 95, 108, 255),
        "wifi": (88, 95, 108, 255),
        "volume-2": (88, 95, 108, 255),
        "chevron-up": (88, 95, 108, 255),
    }
    icons = {}
    for name, fill in required.items():
        icon = render_svg(os.path.join(icons_dir, f"{name}.svg"), 16, fill=fill)
        if icon is None:
            raise RuntimeError(f"taskbar_icon_missing: {name}")
        icons[name] = icon
    base_x = int((w - 320) / 2)
    for i, key in enumerate(["windows", "search", "folder", "edge", "chrome", "settings"]):
        x = base_x + i * 44
        draw.rounded_rectangle((x - 4, 8, x + 28, 36), radius=8, fill=(255, 255, 255, 235), outline=(222, 229, 238, 255), width=1)
        taskbar.alpha_composite(icons[key], (x + 4, 12))
    tray_x = w - 214
    taskbar.alpha_composite(icons["chevron-up"], (tray_x, 14))
    taskbar.alpha_composite(icons["wifi"], (tray_x + 26, 12))
    taskbar.alpha_composite(icons["volume-2"], (tray_x + 52, 12))
draw.rounded_rectangle((w - 150, 7, w - 8, 35), radius=8, fill=(239, 245, 253, 255))
taskbar.save(payload["taskbarOut"], "PNG")

print(json.dumps({
  "ok": True,
  "mode": "similar",
  "sourceSize": [w, chrome_h + taskbar_h],
  "chromeTop": payload["chromeTopOut"],
  "taskbar": payload["taskbarOut"],
  "overlayIcons": overlay_icons
}))
`;

  const stdout = execFileSync(pythonBin, ["-c", py], { encoding: "utf8", stdio: "pipe" });
  console.log(stdout.trim());
  process.exit(0);
}

const payload = Buffer.from(JSON.stringify({
  source: path.resolve(source),
  chromeTopHeight,
  taskbarHeight,
  overlayIcons,
  iconsDir,
  chromeTopOut: path.join(outDir, "chrome-top.png"),
  taskbarOut: path.join(outDir, "taskbar.png"),
}), "utf8").toString("base64");

const py = `
import base64, json, os, subprocess, tempfile
from PIL import Image, ImageDraw

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
img = Image.open(payload["source"]).convert("RGBA")
w, h = img.size
chrome_h = int(payload["chromeTopHeight"])
taskbar_h = int(payload["taskbarHeight"])
overlay_icons = bool(payload.get("overlayIcons"))
icons_dir = payload.get("iconsDir")
if chrome_h + taskbar_h >= h:
    raise RuntimeError("frame_crop_invalid: chromeTopHeight + taskbarHeight excede altura da imagem")
img.crop((0, 0, w, chrome_h)).save(payload["chromeTopOut"], "PNG")
taskbar = img.crop((0, h - taskbar_h, w, h)).convert("RGBA")

def render_svg(svg_path, out_size, fill=None):
    if not os.path.exists(svg_path):
        return None
    fd, tmp_png = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    cmd = ["rsvg-convert", svg_path, "-w", str(out_size), "-h", str(out_size), "-o", tmp_png]
    subprocess.check_call(cmd)
    icon = Image.open(tmp_png).convert("RGBA")
    os.remove(tmp_png)
    if fill:
        tinted = Image.new("RGBA", icon.size, fill)
        alpha = icon.split()[-1]
        tinted.putalpha(alpha)
        icon = tinted
    return icon

if overlay_icons:
    required_icons = {
        "windows": None,
        "search": (88, 95, 108, 255),
        "folder": (88, 95, 108, 255),
        "edge": None,
        "chrome": None,
        "settings": (88, 95, 108, 255),
        "wifi": (88, 95, 108, 255),
        "volume-2": (88, 95, 108, 255),
        "chevron-up": (88, 95, 108, 255),
    }

    icon_imgs = {}
    for name, fill in required_icons.items():
        path_svg = os.path.join(icons_dir, f"{name}.svg")
        icon = render_svg(path_svg, 16, fill=fill)
        if icon is None:
            raise RuntimeError(f"taskbar_icon_missing: {path_svg}")
        icon_imgs[name] = icon

    draw = ImageDraw.Draw(taskbar)
    draw.rectangle((0, 0, w, taskbar_h), fill=(239, 245, 253, 248))
    draw.line((0, 0, w, 0), fill=(211, 219, 230, 255), width=1)

    # Weather widget (left)
    draw.rounded_rectangle((14, 7, 126, 35), radius=14, fill=(255, 255, 255, 245), outline=(219, 225, 235, 255), width=1)
    draw.ellipse((24, 12, 30, 18), fill=(255, 187, 0, 255))
    draw.text((34, 11), "25C  Pred. nublado", fill=(94, 103, 116, 255))

    # Center launch area with real icons
    base_x = int((w - 320) / 2)
    y = 12
    slots = ["windows", "search", "folder", "edge", "chrome", "settings"]
    for i, key in enumerate(slots):
        x = base_x + i * 44
        draw.rounded_rectangle((x - 4, 8, x + 28, 36), radius=8, fill=(255, 255, 255, 235), outline=(222, 229, 238, 255), width=1)
        taskbar.alpha_composite(icon_imgs[key], (x + 4, y))

    # Right tray icons + single-line datetime area
    tray_x = w - 185
    taskbar.alpha_composite(icon_imgs["chevron-up"], (tray_x, y + 2))
    taskbar.alpha_composite(icon_imgs["wifi"], (tray_x + 26, y))
    taskbar.alpha_composite(icon_imgs["volume-2"], (tray_x + 52, y))
    draw.rounded_rectangle((w - 156, 7, w - 8, 35), radius=8, fill=(239, 245, 253, 255))

taskbar.save(payload["taskbarOut"], "PNG")
print(json.dumps({
  "ok": True,
  "sourceSize": [w, h],
  "chromeTop": payload["chromeTopOut"],
  "taskbar": payload["taskbarOut"],
  "overlayIcons": overlay_icons
}))
`;

const stdout = execFileSync(pythonBin, ["-c", py], { encoding: "utf8", stdio: "pipe" });
console.log(stdout.trim());
