import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pythonBin = process.env.ADOPS_CAPTURE_PYTHON || "python3";
const outDir = path.resolve(process.argv.includes("--outDir")
  ? process.argv[process.argv.indexOf("--outDir") + 1]
  : path.resolve(__dirname, "../assets/desktop-frame/windows11-chrome-light"));
mkdirSync(outDir, { recursive: true });

const payload = Buffer.from(JSON.stringify({
  outDir,
  fontPath: path.resolve(__dirname, "../assets/desktop-frame/fonts/selawik.ttf"),
  widths: [1280, 1660, 3320],
}), "utf8").toString("base64");

const py = `
import base64, json, os
import subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
out = payload["outDir"]
icons_dir = os.path.join(out, "icons")
font_path = payload["fontPath"]
if not os.path.isfile(font_path):
    raise RuntimeError("windows_frame_font_missing: Selawik")

BASE_W, TOP_H, BAR_H = 1280, 72, 42
def font(size): return ImageFont.truetype(font_path, max(8, int(round(size))))
def line(draw, points, fill=(83, 91, 103, 255), width=2):
    draw.line(points, fill=fill, width=max(1, width), joint="curve")
def svg_icon(name, size):
    fd, temp_png = tempfile.mkstemp(suffix=".png"); os.close(fd)
    source = os.path.join(icons_dir, name + ".svg")
    subprocess.check_call(["rsvg-convert", source, "-w", str(size), "-h", str(size), "-o", temp_png])
    icon = Image.open(temp_png).convert("RGBA"); os.remove(temp_png)
    return icon

def make_top(width):
    s = width / BASE_W
    im = Image.new("RGBA", (width, round(TOP_H*s)), (246,248,252,255))
    d = ImageDraw.Draw(im)
    px = lambda n: round(n*s)
    # Single active tab only. Dynamic title, favicon and close action are overlaid by the compositor.
    d.rectangle((0,0,width,px(35)), fill=(235,239,246,255))
    d.rounded_rectangle((px(8),px(5),px(326),px(34)), radius=px(10), fill=(255,255,255,255), outline=(218,224,232,255), width=max(1,px(1)))
    # Tab close control is a simple X, not a circular status marker.
    line(d,[(px(303),px(15)),(px(311),px(23))],width=max(1,px(1)))
    line(d,[(px(311),px(15)),(px(303),px(23))],width=max(1,px(1)))
    line(d,[(px(348),px(14)),(px(348),px(25))],fill=(83,91,103,255),width=max(1,px(1)))
    line(d,[(px(342),px(19)),(px(354),px(19))],fill=(83,91,103,255),width=max(1,px(1)))
    d.rectangle((0,px(35),width,px(72)), fill=(255,255,255,255))
    # Back, forward and reload are simple paths; no typographic pseudo-icons.
    line(d,[(px(30),px(52)),(px(18),px(52)),(px(24),px(46))])
    line(d,[(px(18),px(52)),(px(24),px(58))])
    line(d,[(px(52),px(46)),(px(60),px(52)),(px(52),px(58))], fill=(155,161,171,255))
    d.arc((px(70),px(43),px(88),px(61)), 35, 325, fill=(83,91,103,255), width=max(1,px(2)))
    line(d,[(px(84),px(44)),(px(88),px(43)),(px(88),px(48))])
    d.rounded_rectangle((px(88),px(40),px(1118),px(66)), radius=px(13), fill=(245,247,250,255), outline=(225,230,238,255), width=max(1,px(1)))
    # Site controls and extension puzzle are licensed SVGs; menu is anchored at the right edge.
    controls = svg_icon("sliders-horizontal", px(18))
    puzzle = svg_icon("puzzle", px(18))
    im.alpha_composite(controls, (px(98),px(44)))
    im.alpha_composite(puzzle, (px(1150),px(44)))
    # Geometric bookmark star and menu dots; no profile or bookmark row.
    star = [(px(1095),px(44)),(px(1098),px(50)),(px(1105),px(51)),(px(1100),px(56)),(px(1101),px(63)),(px(1095),px(60)),(px(1089),px(63)),(px(1090),px(56)),(px(1085),px(51)),(px(1092),px(50)),(px(1095),px(44))]
    line(d,star,fill=(83,91,103,255),width=max(1,px(1)))
    for yy in [px(49),px(54),px(59)]: d.ellipse((px(1243),yy,px(1246),yy+px(3)),fill=(83,91,103,255))
    # Window controls; no fake profile identity.
    d.line((px(width/ s-70),px(17),px(width/s-58),px(17)), fill=(69,77,89,255), width=max(1,px(1)))
    d.rectangle((px(width/s-48),px(12),px(width/s-38),px(22)), outline=(69,77,89,255), width=max(1,px(1)))
    d.line((px(width/s-24),px(12),px(width/s-12),px(24)), fill=(69,77,89,255), width=max(1,px(1)))
    d.line((px(width/s-12),px(12),px(width/s-24),px(24)), fill=(69,77,89,255), width=max(1,px(1)))
    d.rectangle((0,px(71),width,px(72)), fill=(214,220,229,255))
    return im

def make_taskbar(width):
    s = width / BASE_W
    im = Image.new("RGBA", (width, round(BAR_H*s)), (239,245,253,248))
    d = ImageDraw.Draw(im)
    px = lambda n: round(n*s)
    d.line((0,0,width,0), fill=(211,219,230,255), width=max(1,px(1)))
    # Centered, unmarked pinned icons; the template makes no claim about app launch state.
    base_x = (width-px(176))//2
    for index,name in enumerate(["windows","search","edge","chrome"]):
        icon_size = px(22 if name == "windows" else 20)
        icon = svg_icon(name, max(12,icon_size))
        x = base_x + px(12 + index*44)
        y = (round(BAR_H*s)-icon.size[1])//2
        im.alpha_composite(icon,(x,y))
    # Tray: network arcs and speaker. Clock box leaves the rightmost 8px margin.
    tx = width-px(184)
    d.arc((tx,px(11),tx+px(18),px(28)), 210, 330, fill=(71,83,101,255), width=max(1,px(2)))
    d.arc((tx+px(4),px(16),tx+px(14),px(26)), 210, 330, fill=(71,83,101,255), width=max(1,px(2)))
    d.ellipse((tx+px(8),px(26),tx+px(10),px(28)), fill=(71,83,101,255))
    sx = tx+px(30)
    d.polygon([(sx,px(17)),(sx+px(5),px(17)),(sx+px(11),px(12)),(sx+px(11),px(29)),(sx+px(5),px(24)),(sx,px(24))], fill=(71,83,101,255))
    d.arc((sx+px(9),px(14),sx+px(19),px(27)), 300, 60, fill=(71,83,101,255), width=max(1,px(2)))
    d.rounded_rectangle((width-px(146),px(3),width-px(5),px(39)), radius=px(4), fill=(239,245,253,255))
    return im

for width in payload["widths"]:
    suffix = "" if width == 1280 else f"-{width}"
    make_top(width).save(os.path.join(out, f"chrome-top{suffix}.png"), "PNG", optimize=True)
    make_taskbar(width).save(os.path.join(out, f"taskbar{suffix}.png"), "PNG", optimize=True)
print(json.dumps({"ok": True, "mode": "reconstructed-v5", "widths": payload["widths"], "outDir": out}))
`;

console.log(execFileSync(pythonBin, ["-c", py], { encoding: "utf8", stdio: "pipe" }).trim());
