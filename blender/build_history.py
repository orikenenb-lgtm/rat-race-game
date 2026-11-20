# v3 "מכונת הזמן" history-mode models. Run: python3 build_history.py
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rr_lib; from rr_lib import *
reset()
parq  = mat("Parquet", "#8b5e34", 0.75); parq2 = mat("ParquetDark", "#6e4826", 0.75)
frame = mat("OldWood", "#5a3a20", 0.7)
gold  = mat("Gold", "#f2b632", 0.3, 0.6); golddk = mat("GoldDark", "#b8740f", 0.35, 0.6)
brass = mat("Brass", "#c8923c", 0.35, 0.6); copper = mat("Copper", "#c46a3a", 0.4, 0.5)
green = mat("BoardGreen", "#1f3a2e", 0.7)
amber = mat("AmberText", "#ffb341", 0.3, 0, 1.6)
upg = mat("UpGreen", "#3ddc84", 0.3, 0, 1.8); dnr = mat("DownRed", "#ff4a4a", 0.3, 0, 1.8)
paper = mat("TapePaper", "#f6ecd2", 0.8); dark = mat("Dark", "#2d3142", 0.5, 0.2)
cream = mat("ClockFace", "#fbf3df", 0.5); glassd = mat("DomeGlass", "#cfefff", 0.05, 0.1, 0.1, alpha=0.35)
warm = mat("LitWindow", "#ffd27a", 0.3, 0, 1.2); portal = mat("Portal", "#7cf3ff", 0.3, 0, 2.5)
violet = mat("PortalViolet", "#c58bff", 0.3, 0, 2.5); smoke = mat("Steam", "#f4efe6", 0.9)
red = mat("LeverRed", "#e5483b", 0.5)
T = 0.15

def base():
    slab(parq2); box(1.84, 1.84, 0.03, 0, 0, 0.135, parq)
    for k in (-2, 0, 2): box(0.012, 1.84, 0.032, k * 0.3, 0, 0.136, parq2)

def gear(r_in, r_out, teeth, thick, m, loc, rot=(0, 0, 0)):
    pts = []
    da = 360 / teeth
    for i in range(teeth):
        a = i * da
        for rr, d in ((r_in, -da * 0.3), (r_out, -da * 0.18), (r_out, da * 0.18), (r_in, da * 0.3)):
            pts.append((rr * math.cos(R(a + d)), rr * math.sin(R(a + d))))
    return nobevel(extrude_xz(pts, thick, m, loc=loc, rot=rot))

# ---------- TICKER_BOARD: vintage stock-ticker board + ticker-tape machine ----------
base()
by_ = 0.42; BZ = T + 0.32; BW, BH = 1.66, 1.14
for sx in (-1, 1):
    box(0.08, 0.1, BZ - T + 0.1, sx * 0.72, by_, (T + BZ + 0.1) / 2, frame)
    box(0.22, 0.24, 0.05, sx * 0.72, by_, T + 0.025, frame)
box(BW, 0.12, BH, 0, by_, BZ + BH / 2, frame)
box(BW - 0.1, 0.13, BH - 0.24, 0, by_, BZ + (BH - 0.14) / 2, green)
box(BW + 0.06, 0.15, 0.05, 0, by_, BZ + BH + 0.02, golddk)
box(0.9, 0.04, 0.16, 0, by_ - 0.065, BZ + BH - 0.1, gold)
text("MARKET", 0.11, 0, by_ - 0.09, BZ + BH - 0.1, frame, depth=0.02)
rows = (("DOTCOM", dnr), ("2008", dnr), ("COVID", upg), ("2022", dnr))
for k, (s, m_) in enumerate(rows):
    z = BZ + BH - 0.32 - k * 0.2
    text(s, 0.13, -0.22, by_ - 0.075, z, amber, depth=0.02)
    if m_ is upg: cone(0.06, 0.0, 0.11, 0.55, by_ - 0.08, z, m_, v=3, rz=R(90))
    else: cone(0.06, 0.0, 0.11, 0.55, by_ - 0.08, z, m_, v=3, rx=R(180), rz=R(90))
    box(1.4, 0.135, 0.008, 0, by_, z - 0.1, mat("RowLine", "#2f5443", 0.7))
for sx in (-1, 1):
    cyl(0.02, 0.18, sx * 0.62, by_ - 0.12, BZ + BH + 0.05, brass, v=6, rx=R(-35))
    cone(0.07, 0.03, 0.08, sx * 0.62, by_ - 0.2, BZ + BH + 0.12, brass, v=10, rx=R(180 - 35))
    sphere(0.035, sx * 0.62, by_ - 0.21, BZ + BH + 0.09, warm, seg=8, ring=6)
# ticker-tape machine on a little table
tx_, ty_ = 0.35, -0.42
cyl(0.24, 0.04, tx_, ty_, T + 0.42, frame, v=16); cyl(0.04, 0.4, tx_, ty_, T + 0.2, frame, v=8)
cyl(0.14, 0.03, tx_, ty_, T + 0.015, frame, v=12)
cyl(0.13, 0.1, tx_, ty_, T + 0.49, brass, v=16)
hemi(0.12, tx_, ty_, T + 0.54, glassd, seg=12, ring=6, sz=1.2)
gear(0.04, 0.055, 8, 0.02, golddk, (tx_, ty_, T + 0.62))
cyl(0.015, 0.1, tx_, ty_, T + 0.59, dark, v=6)
p = Vector((tx_ - 0.13, ty_ - 0.02, T + 0.5))
for k, d in enumerate(((-0.12, -0.04, -0.08), (-0.1, -0.06, -0.1), (-0.08, 0.02, -0.12), (-0.06, -0.08, -0.12), (-0.02, -0.06, -0.06))):
    q = p + Vector(d); beam(p, q, 0.045, paper, d=0.006); p = q
torus(0.08, 0.025, p.x - 0.03, p.y - 0.02, T + 0.02, paper, maj=12, mn=8)
ticker = finish("TickerBoard")

# ---------- TIME_MACHINE: cute retro booth with a big clock ----------
base()
cyl(0.8, 0.08, 0, 0, T + 0.04, brass, v=24)
torus(0.78, 0.03, 0, 0, T + 0.08, portal, maj=24, mn=8)
torus(0.66, 0.022, 0, 0, T + 0.085, violet, maj=24, mn=8)
z0 = T + 0.08; BHt = 1.15; RB = 0.48
cyl(RB, BHt, 0, 0, z0 + BHt / 2, copper, v=20)
for zz in (0.06, 0.62, BHt - 0.04):
    cyl(RB + 0.025, 0.06, 0, 0, z0 + zz, brass, v=20)
box(0.46, 0.06, 0.52, 0, -RB + 0.02, z0 + 0.34, cream)
cyl(0.12, 0.05, 0, -RB - 0.02, z0 + 0.42, warm, v=16, rx=R(90))
torus(0.12, 0.025, 0, -RB - 0.04, z0 + 0.42, brass, maj=16, mn=8, rx=R(90))
sphere(0.025, 0.16, -RB - 0.03, z0 + 0.3, brass, seg=6, ring=4)
hemi(RB + 0.01, 0, 0, z0 + BHt, brass, seg=20, ring=8, sz=0.6)
cyl(0.03, 0.3, 0, 0, z0 + BHt + 0.4, brass, v=8)
sphere(0.07, 0, 0, z0 + BHt + 0.6, warm, seg=10, ring=6)
torus(0.1, 0.012, 0, 0, z0 + BHt + 0.5, brass, maj=12, mn=8)
# big clock on the front
cz = z0 + 0.9; cyf = -RB - 0.03
cyl(0.27, 0.05, 0, cyf, cz, cream, v=24, rx=R(90))
torus(0.27, 0.035, 0, cyf - 0.02, cz, gold, maj=24, mn=8, rx=R(90))
for k in range(12):
    a = R(k * 30)
    if k % 3 == 0: box(0.02, 0.012, 0.06, 0.21 * math.sin(a), cyf - 0.03, cz + 0.21 * math.cos(a), dark, ry=a)
    else: sphere(0.014, 0.21 * math.sin(a), cyf - 0.03, cz + 0.21 * math.cos(a), dark, seg=8, ring=6)
box(0.022, 0.015, 0.15, 0.03, cyf - 0.04, cz + 0.06, dark, ry=R(20))
box(0.02, 0.015, 0.2, -0.07, cyf - 0.045, cz + 0.05, dark, ry=R(-55))
cyl(0.03, 0.03, 0, cyf - 0.05, cz, gold, v=10, rx=R(90))
# side gears + pipe + lever
gear(0.13, 0.17, 10, 0.04, gold, (-RB - 0.01, 0.05, z0 + 0.72), rot=(0, 0, R(90)))
gear(0.07, 0.1, 8, 0.04, golddk, (-RB - 0.02, -0.12, z0 + 0.5), rot=(0, 0, R(90)))
cyl(0.035, 0.08, -RB - 0.03, 0.05, z0 + 0.72, dark, v=8, ry=R(90))
torus(0.16, 0.035, RB + 0.02, 0.08, z0 + 0.95, copper, maj=16, mn=8, rx=R(90))
cyl(0.045, 0.3, RB + 0.18, 0.08, z0 + 1.08, copper, v=10)
for k, s in enumerate((0.07, 0.09, 0.11)):
    sphere(s, RB + 0.2 + k * 0.05, 0.08, z0 + 1.3 + k * 0.13, smoke, seg=8, ring=6)
cyl(0.06, 0.1, RB + 0.02, -0.28, z0 + 0.4, brass, v=10, ry=R(90))
beam((RB + 0.06, -0.28, z0 + 0.4), (RB + 0.2, -0.36, z0 + 0.62), 0.03, dark)
sphere(0.045, RB + 0.2, -0.36, z0 + 0.64, red, seg=8, ring=6)
for (x, y, n) in ((-0.72, -0.72, 3), (0.74, 0.7, 2)):
    for k in range(n): cyl(0.08, 0.03, x, y, T + 0.015 + k * 0.03, gold if k % 2 == 0 else golddk, v=14)
timemachine = finish("TimeMachine")

items = [(ticker, "history/ticker_board.glb"), (timemachine, "history/time_machine.glb")]
report = {fn: export(o, fn) for o, fn in items}
with open(os.path.join(BLD, "report_history.json"), "w") as f: json.dump(report, f, indent=1)
row([o for o, _ in items], 2.7)
ground("#e8dcc4")
camera((0, -7.5, 5.2), (0, 0, 0.9), lens=40)
sun(3.2, (52, 8, 30), "#fff0d8")
set_world("#ffe2a0", light_hex="#f2e2c8", light_strength=0.9)
if not os.environ.get("NORENDER"): render(os.path.join(BLD, "preview_history.png"), (1400, 800), samples=64, exposure=-0.5)
print("RATRACE_DONE history")
