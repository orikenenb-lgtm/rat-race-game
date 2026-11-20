# v3 "real life" layer models. Run: python3 build_life.py
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rr_lib; from rr_lib import *
reset()
cream = mat("LifeSlab", "#efe3c8", 0.85)
grass = mat("Grass", "#8fcf6e", 0.9)
pave  = mat("Paving", "#d9d2c4", 0.85)
white = mat("White", "#f8f5ef", 0.6)
wood  = mat("Wood", "#9a6a3a", 0.7)
leaf  = mat("Leaf", "#5aa84f", 0.8)
leaf2 = mat("LeafLight", "#7cc461", 0.8)
warm  = mat("LitWindow", "#ffd27a", 0.3, 0, 1.2)
roof  = mat("RoofRed", "#e0604a", 0.65)
brick = mat("Brick", "#b5523b", 0.85)
gold  = mat("Gold", "#f2b632", 0.3, 0.6)
golddk= mat("GoldDark", "#b8740f", 0.35, 0.6)
dark  = mat("Dark", "#2d3142", 0.5, 0.2)
glass = mat("Glass", "#4f86c6", 0.15, 0.3)
stone = mat("Stone", "#b9b4aa", 0.85)
pink  = mat("FlowerPink", "#ff8fab", 0.6)
yell  = mat("FlowerYellow", "#ffd23f", 0.6)
T = 0.15

def base(top=grass):
    slab(cream); box(1.84, 1.84, 0.03, 0, 0, 0.135, top)

def tree(x, y, s=1.0):
    cyl(0.045 * s, 0.34 * s, x, y, T + 0.17 * s, wood, v=8)
    sphere(0.22 * s, x, y, T + 0.45 * s, leaf, seg=8, ring=6)
    sphere(0.14 * s, x + 0.08 * s, y - 0.06 * s, T + 0.62 * s, leaf2, seg=8, ring=6)

def bush(x, y, s=1.0, flower=None):
    sphere(0.13 * s, x, y, T + 0.08 * s, leaf, seg=8, ring=6, sz=0.8)
    if flower:
        for dx, dy in ((-0.05, -0.08), (0.06, -0.06), (0.0, -0.1)):
            sphere(0.03 * s, x + dx * s, y + dy * s, T + 0.14 * s, flower, seg=6, ring=4)

def heart_pts(sc):
    out = []
    for i in range(32):
        t = 2 * math.pi * i / 32
        out.append((16 * math.sin(t) ** 3 * sc, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) * sc))
    return out

# ---------- HOME_FAMILY: cozy house, yard, swing ----------
base()
wallY = mat("WallButter", "#f6d98b", 0.75)
hx, hy, W, D, H = -0.3, 0.3, 1.05, 0.9, 0.72
yf = hy - D / 2
box(W, D, H, hx, hy, T + H / 2, wallY)
box(W + 0.04, D + 0.04, 0.06, hx, hy, T + 0.03, stone)
prism(W + 0.16, D + 0.14, 0.52, hx, hy, T + H, roof)
cyl(0.09, 0.03, hx, yf - 0.06, T + H + 0.18, warm, v=12, rx=R(90))
cyl(0.11, 0.025, hx, yf - 0.055, T + H + 0.18, white, v=12, rx=R(90))
box(0.15, 0.15, 0.42, hx + 0.3, hy + 0.18, T + H + 0.36, brick)
box(0.19, 0.19, 0.05, hx + 0.3, hy + 0.18, T + H + 0.58, dark)
box(0.24, 0.03, 0.4, hx, yf - 0.005, T + 0.2, wood)
sphere(0.018, hx + 0.07, yf - 0.025, T + 0.2, gold, seg=6, ring=4)
box(0.36, 0.2, 0.035, hx, yf - 0.1, T + 0.45, roof, rx=R(12))
for sx in (-1, 1):
    x = hx + sx * 0.34
    box(0.27, 0.025, 0.25, x, yf - 0.004, T + 0.42, white)
    box(0.22, 0.03, 0.2, x, yf - 0.01, T + 0.42, warm)
    box(0.22, 0.035, 0.018, x, yf - 0.012, T + 0.42, white)
    box(0.28, 0.08, 0.06, x, yf - 0.05, T + 0.27, wood)
    for dx, m_ in ((-0.08, pink), (0.0, yell), (0.08, pink)):
        sphere(0.035, x + dx, yf - 0.05, T + 0.32, m_, seg=6, ring=4)
box(0.03, 0.25, 0.22, hx + W / 2 + 0.008, hy, T + 0.42, warm)
for k, py in enumerate((-0.32, -0.55, -0.78)):
    cyl(0.085, 0.016, hx + (0.03 if k % 2 else -0.03), py, T + 0.008, stone, v=10)
# picket fence (front), gap at the path
for x in [-0.86, -0.7, -0.54, -0.1, 0.06, 0.22, 0.38, 0.54, 0.7, 0.86]:
    box(0.045, 0.035, 0.24, x, -0.86, T + 0.12, white)
    cone(0.032, 0.0, 0.04, x, -0.86, T + 0.26, white, v=4, rz=R(45))
box(0.36, 0.025, 0.035, -0.7, -0.875, T + 0.17, white)
box(0.98, 0.025, 0.035, 0.38, -0.875, T + 0.17, white)
# swing
sx_, sy_ = 0.6, -0.22
for lx in (sx_ - 0.3, sx_ + 0.3):
    for dy in (-0.2, 0.2):
        beam((lx, sy_ + dy, T), (lx, sy_, T + 0.8), 0.045, wood)
box(0.68, 0.06, 0.06, sx_, sy_, T + 0.8, wood)
for dx in (-0.1, 0.1): box(0.015, 0.015, 0.48, sx_ + dx, sy_, T + 0.54, stone)
box(0.28, 0.13, 0.035, sx_, sy_, T + 0.29, roof)
tree(0.62, 0.55, 1.0); bush(-0.85, 0.75, 0.9); bush(0.15, -0.28, 0.8, pink); bush(-0.78, -0.25, 0.8, yell)
home = finish("HomeFamily")

# ---------- UNIVERSITY: brick hall + tower with a graduation cap ----------
base()
bx_, by_ = 0.0, 0.42
box(1.76, 0.8, 0.82, bx_, by_, T + 0.41, brick)
box(1.82, 0.86, 0.06, bx_, by_, T + 0.82, white)
box(1.78, 0.82, 0.05, bx_, by_, T + 0.875, dark)
yh = by_ - 0.4
for row_z in (0.28, 0.6):
    for x in (-0.72, -0.48, 0.48, 0.72):
        box(0.15, 0.03, 0.2, x, yh - 0.005, T + row_z, warm)
        box(0.2, 0.06, 0.03, x, yh - 0.02, T + row_z - 0.115, white)
tx_, ty_, TH = 0.0, 0.14, 1.42
box(0.62, 0.52, TH, tx_, ty_, T + TH / 2, mat("Sandstone", "#efe0c0", 0.8))
yt = ty_ - 0.26
box(0.68, 0.58, 0.06, tx_, ty_, T + TH, white)
box(0.24, 0.03, 0.36, tx_, yt - 0.005, T + 0.18, wood)
cyl(0.12, 0.03, tx_, yt - 0.006, T + 0.36, wood, v=12, rx=R(90))
for sx in (-1, 1):
    cyl(0.045, 0.62, tx_ + sx * 0.22, yt - 0.06, T + 0.31, white, v=10)
    box(0.12, 0.12, 0.04, tx_ + sx * 0.22, yt - 0.06, T + 0.64, white)
box(0.62, 0.16, 0.06, tx_, yt - 0.06, T + 0.68, white)
cyl(0.15, 0.03, tx_, yt - 0.01, T + 1.08, warm, v=16, rx=R(90))
torus(0.15, 0.022, tx_, yt - 0.025, T + 1.08, gold, maj=20, mn=8, rx=R(90))
for k in range(2):
    box(0.9 - k * 0.14, 0.2, 0.05, tx_, yt - 0.22 + k * 0.07, T + 0.025 + k * 0.05, stone)
# graduation cap on top of the tower
zc = T + TH + 0.03
cyl(0.2, 0.16, tx_, ty_, zc + 0.08, dark, v=16)
box(0.74, 0.74, 0.05, tx_, ty_, zc + 0.18, dark, rz=R(45))
cyl(0.035, 0.03, tx_, ty_, zc + 0.215, gold, v=10)
beam((tx_, ty_, zc + 0.22), (tx_ + 0.34, ty_ - 0.34 + 0.12, zc + 0.215), 0.018, gold)
beam((tx_ + 0.34, ty_ - 0.22, zc + 0.215), (tx_ + 0.36, ty_ - 0.24, zc + 0.02), 0.018, gold)
cone(0.035, 0.012, 0.1, tx_ + 0.36, ty_ - 0.24, zc - 0.02, gold, v=8)
tree(-0.72, -0.55, 0.9); tree(0.72, -0.55, 0.9)
for x in (-0.38, 0.38):
    cyl(0.02, 0.45, x, -0.62, T + 0.225, dark, v=6); sphere(0.05, x, -0.62, T + 0.47, warm, seg=8, ring=6)
uni = finish("University")

# ---------- INDEX_FUND: calm building + gently rising golden chart + slow-and-steady turtle ----------
base(pave)
sage = mat("Sage", "#a7cfc0", 0.7); navy = mat("Navy", "#22305a", 0.5, 0.1)
gline = mat("GoldLine", "#ffcf4a", 0.3, 0.3, 0.9)
fx, fy, FW, FD, FH = 0.0, 0.38, 1.56, 0.9, 0.74
yf = fy - FD / 2
box(FW, FD, FH, fx, fy, T + FH / 2, sage)
box(FW + 0.04, FD + 0.04, 0.05, fx, fy, T + FH + 0.025, white)
for z in (0.22, 0.48):
    box(FW - 0.16, 0.03, 0.14, fx, yf - 0.005, T + z, warm if z < 0.3 else glass)
box(0.3, 0.03, 0.3, fx, yf - 0.012, T + 0.15, glass)
box(0.82, 0.03, 0.12, fx, yf - 0.012, T + 0.64, navy)
text("INDEX", 0.11, fx, yf - 0.03, T + 0.64, white, depth=0.02)
zr = T + FH + 0.05
for x in (-0.5, 0.5): box(0.05, 0.05, 0.22, x, fy + 0.05, zr + 0.11, dark)
bz = zr + 0.2
box(1.34, 0.06, 0.66, fx, fy + 0.05, bz + 0.33, navy)
box(1.26, 0.065, 0.58, fx, fy + 0.05, bz + 0.33, mat("BoardBlue", "#2c3e70", 0.6))
for gz in (0.15, 0.3, 0.45):
    box(1.2, 0.07, 0.008, fx, fy + 0.05, bz + 0.04 + gz, mat("GridLine", "#4a5f98", 0.6))
pts = [(-0.55, 0.1), (-0.38, 0.15), (-0.24, 0.13), (-0.08, 0.23), (0.08, 0.21), (0.24, 0.32), (0.4, 0.38), (0.52, 0.47)]
yl = fy + 0.05 - 0.05
for (x1, z1), (x2, z2) in zip(pts, pts[1:]):
    beam((x1, yl, bz + z1), (x2, yl, bz + z2), 0.035, gline)
for (x, z) in pts[:-1]: sphere(0.03, x, yl, bz + z, gline, seg=8, ring=6)
cone(0.06, 0.0, 0.12, 0.56, yl, bz + 0.5, gline, v=8, ry=R(50))
# turtle on a pedestal
px, py = 0.58, -0.58
cyl(0.22, 0.1, px, py, T + 0.05, white, v=16)
shell = mat("Shell", "#4f9d4a", 0.6); skin = mat("TurtleSkin", "#a8d68a", 0.7)
hemi(0.16, px, py, T + 0.12, shell, seg=10, ring=6, sz=0.7)
cyl(0.165, 0.025, px, py, T + 0.125, gold, v=10)
sphere(0.06, px - 0.04, py - 0.19, T + 0.17, skin, seg=8, ring=6)
for dx, dy in ((-0.11, -0.09), (0.11, -0.09), (-0.11, 0.09), (0.11, 0.09)):
    sphere(0.045, px + dx, py + dy, T + 0.13, skin, seg=8, ring=6, sz=0.7)
tree(-0.72, -0.6, 0.85)
box(0.38, 0.12, 0.04, -0.2, -0.7, T + 0.15, wood); box(0.38, 0.03, 0.12, -0.2, -0.64, T + 0.22, wood)
for dx in (-0.15, 0.15): box(0.03, 0.1, 0.13, -0.2 + dx, -0.7, T + 0.065, dark)
index_fund = finish("IndexFund")

# ---------- PENSION: palm tree + deck chair on a coin-stack island ----------
water = mat("Water", "#2fa4d9", 0.15); foam = mat("Foam", "#ffffff", 0.5)
sand = mat("Sand", "#f0d9a0", 0.9); bark = mat("Bark", "#8b6a3e", 0.85)
box(2, 2, 0.1, 0, 0, 0.05, water)
z = 0.1
for k, (r, dx, dy) in enumerate(((0.8, 0.0, 0.0), (0.76, 0.03, -0.02), (0.73, -0.02, 0.02), (0.7, 0.02, 0.0))):
    cyl(r, 0.11, dx, dy, z + 0.055, gold if k % 2 == 0 else golddk, v=24)
    cyl(r + 0.012, 0.025, dx, dy, z + 0.055, golddk if k % 2 == 0 else gold, v=24)
    z += 0.11
cyl(0.66, 0.06, 0.02, 0.0, z + 0.03, sand, v=24)
ZT = z + 0.06
for (fx_, fy_, s) in ((0.86, -0.3, 0.1), (-0.8, 0.45, 0.09), (0.3, -0.84, 0.08), (-0.5, -0.7, 0.07)):
    sphere(s, fx_, fy_, 0.1, foam, seg=8, ring=4, sz=0.3)
# palm tree: curved trunk
p = Vector((-0.28, 0.22, ZT)); d = Vector((0.0, 0.0, 1.0)); r = 0.075
for k in range(6):
    d = (d + Vector((0.07, -0.04, 0.0))).normalized()
    q = p + d * 0.22
    cone(r, r * 0.88, 0.24, *((p + q) / 2), bark, v=8, rx=0, ry=0, rz=0)
    o = current[-1]; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    p = q; r *= 0.88
crown = p
for k in range(8):
    a = R(k * 45 + 10); droop = R(28 if k % 2 else 18); L = 0.55 if k % 2 else 0.48
    c = crown + Vector((math.cos(a) * math.cos(droop), math.sin(a) * math.cos(droop), -math.sin(droop))) * (L / 2)
    box(L, 0.15, 0.025, *c, leaf if k % 2 else leaf2, ry=droop, rz=a)
for k in range(3):
    a = R(k * 120)
    sphere(0.05, crown.x + 0.07 * math.cos(a), crown.y + 0.07 * math.sin(a), crown.z - 0.07, bark, seg=8, ring=6)
# deck chair facing -Y
cx_, cy_ = 0.28, -0.18
blue = mat("Canvas", "#2f7bff", 0.7)
for dx in (-0.14, 0.14):
    beam((cx_ + dx, cy_ - 0.22, ZT), (cx_ + dx, cy_ + 0.18, ZT + 0.12), 0.025, wood)
    beam((cx_ + dx, cy_ + 0.12, ZT), (cx_ + dx, cy_ + 0.2, ZT + 0.42), 0.025, wood)
box(0.26, 0.34, 0.015, cx_, cy_ - 0.04, ZT + 0.1, blue, rx=R(13))
box(0.26, 0.26, 0.015, cx_, cy_ + 0.17, ZT + 0.28, blue, rx=R(-70))
for dx in (-0.08, 0.08):
    box(0.035, 0.34, 0.018, cx_ + dx, cy_ - 0.04, ZT + 0.104, white, rx=R(13))
    box(0.035, 0.26, 0.018, cx_ + dx, cy_ + 0.165, ZT + 0.283, white, rx=R(-70))
cyl(0.012, 0.6, 0.55, 0.12, ZT + 0.3, wood, v=6)
cone(0.3, 0.0, 0.14, 0.55, 0.12, ZT + 0.64, mat("Parasol", "#ff7f5c", 0.6), v=8)
cyl(0.04, 0.08, 0.02, -0.4, ZT + 0.04, mat("DrinkGlass", "#ffb36b", 0.2, 0, 0.3), v=8)
sphere(0.025, 0.04, -0.4, ZT + 0.1, yell, seg=6, ring=4)
pension = finish("Pension")

# ---------- WEDDING: chuppah with flowers ----------
base()
fabric = mat("Fabric", "#fffaf2", 0.7); blush = mat("FlowerBlush", "#ffd1dc", 0.6)
pole = mat("Pole", "#f1e4c8", 0.5)
box(0.42, 1.05, 0.012, 0, -0.42, T + 0.006, fabric)
cy0, PH = 0.35, 1.2
for sx in (-1, 1):
    for sy in (-1, 1):
        x, y = sx * 0.5, cy0 + sy * 0.42
        cyl(0.035, PH, x, y, T + PH / 2, pole, v=10)
        cyl(0.06, 0.05, x, y, T + 0.025, gold, v=10)
        for k, m_ in enumerate((pink, white, blush)):
            a = R(k * 120)
            sphere(0.06, x + 0.05 * math.cos(a), y + 0.05 * math.sin(a), T + PH + 0.01, m_, seg=8, ring=6)
box(1.14, 0.98, 0.035, 0, cy0, T + PH + 0.02, fabric)
for sy in (-1, 1): box(1.14, 0.02, 0.14, 0, cy0 + sy * 0.49, T + PH - 0.05, fabric)
for sx in (-1, 1): box(0.02, 0.98, 0.14, sx * 0.57, cy0, T + PH - 0.05, fabric)
for k in range(7):
    x = -0.45 + k * 0.15; m_ = (pink, blush, white)[k % 3]
    sphere(0.045, x, cy0 - 0.5, T + PH - 0.13, m_, seg=8, ring=6)
    sphere(0.04, x + 0.07, cy0 - 0.5, T + PH - 0.16, leaf2, seg=6, ring=4)
for sx in (-1, 1):
    x = sx * 0.34
    cone(0.07, 0.11, 0.2, x, -0.08, T + 0.1, white, v=10)
    for k in range(4):
        a = R(k * 90 + 45)
        sphere(0.06, x + 0.05 * math.cos(a), -0.08 + 0.05 * math.sin(a), T + 0.25 + (0.05 if k % 2 else 0), (pink, blush)[k % 2], seg=8, ring=6)
    sphere(0.05, x, -0.08, T + 0.33, white, seg=8, ring=6)
    for row in (0, 1):
        cy = -0.55 - row * 0.28
        cx = sx * 0.48
        box(0.22, 0.2, 0.03, cx, cy, T + 0.2, white)
        box(0.22, 0.03, 0.24, cx, cy + 0.1, T + 0.33, white)
        box(0.16, 0.14, 0.19, cx, cy, T + 0.095, mat("ChairShade", "#ece4d6", 0.6))
        sphere(0.035, cx, cy + 0.12, T + 0.42, pink, seg=6, ring=4)
for (x, y) in ((0.05, -0.3), (-0.08, -0.55), (0.1, -0.75), (-0.04, -0.9), (0.02, -0.12)):
    sphere(0.025, x, y, T + 0.015, pink, seg=6, ring=4, sz=0.4)
cyl(0.15, 0.4, 0, cy0 + 0.1, T + 0.2, white, v=12)
cyl(0.04, 0.06, -0.05, cy0 + 0.1, T + 0.43, mat("GlassCup", "#bfe9ff", 0.1, 0, 0.3), v=8)
wedding = finish("Wedding")

# ---------- HOSPITAL: small clinic with heart+plus sign and an ambulance ----------
base(pave)
clin = mat("ClinicWhite", "#f6f7fa", 0.6); teal = mat("Teal", "#2bb3a3", 0.55)
heartm = mat("HeartRed", "#ff4f6d", 0.4, 0, 0.8); cool = mat("CoolWindow", "#d8f3ff", 0.3, 0, 0.8)
cx, cy, CW, CD, CH = -0.05, 0.36, 1.5, 0.88, 0.86
yf = cy - CD / 2
box(CW, CD, CH, cx, cy, T + CH / 2, clin)
box(CW + 0.04, CD + 0.04, 0.12, cx, cy, T + CH - 0.02, teal)
box(CW + 0.06, CD + 0.06, 0.04, cx, cy, T + CH + 0.06, clin)
for row_z in (0.55,):
    for x in (-0.55, -0.3, 0.2, 0.45):
        box(0.18, 0.03, 0.18, cx + x, yf - 0.005, T + row_z, cool)
box(0.42, 0.03, 0.36, cx - 0.05, yf - 0.006, T + 0.18, glass)
box(0.02, 0.035, 0.36, cx - 0.05, yf - 0.012, T + 0.18, clin)
box(0.6, 0.3, 0.04, cx - 0.05, yf - 0.15, T + 0.4, teal)
for x in (-0.55, 0.45): box(0.18, 0.03, 0.18, cx + x, yf - 0.005, T + 0.22, cool)
for sy in (-0.2, 0.2): box(0.03, 0.18, 0.18, cx + CW / 2 + 0.005, cy + sy, T + 0.45, cool)
# side plus (teal)
box(0.03, 0.08, 0.22, cx + CW / 2 + 0.012, cy, T + 0.68 - 0.02, teal) if False else None
# rooftop sign: heart with a white plus
zr = T + CH + 0.08
box(0.08, 0.08, 0.2, cx, cy - 0.1, zr + 0.1, dark)
extrude_xz([(x * 1.1, z * 1.1) for x, z in heart_pts(0.022)], 0.06, clin, loc=(cx, cy - 0.12, zr + 0.55))
extrude_xz(heart_pts(0.022), 0.1, heartm, loc=(cx, cy - 0.13, zr + 0.55))
box(0.3, 0.03, 0.09, cx, cy - 0.195, zr + 0.6, clin)
box(0.09, 0.04, 0.3, cx, cy - 0.2, zr + 0.6, clin)
# ambulance
ax, ay = 0.52, -0.58
red_l = mat("SirenRed", "#ff3b30", 0.3, 0, 2.0); blue_l = mat("SirenBlue", "#3b8bff", 0.3, 0, 2.0)
box(0.5, 0.28, 0.24, ax - 0.04, ay, T + 0.19, clin)
box(0.16, 0.28, 0.18, ax + 0.28, ay, T + 0.16, clin)
box(0.03, 0.24, 0.1, ax + 0.36, ay, T + 0.2, glass)
box(0.66, 0.285, 0.04, ax + 0.04, ay, T + 0.15, teal)
box(0.1, 0.06, 0.04, ax - 0.04, ay - 0.08, T + 0.33, red_l)
box(0.1, 0.06, 0.04, ax - 0.04, ay + 0.08, T + 0.33, blue_l)
box(0.03, 0.29, 0.1, ax - 0.04, ay, T + 0.25, heartm) if False else None
for dx in (-0.18, 0.24):
    for dy in (-0.14, 0.14):
        cyl(0.055, 0.04, ax + dx, ay + dy, T + 0.055, dark, v=10, rx=R(90))
bush(-0.72, -0.6, 0.9, pink); bush(-0.4, -0.7, 0.7, yell)
box(0.36, 0.12, 0.04, -0.55, -0.28, T + 0.15, wood); box(0.36, 0.03, 0.12, -0.55, -0.22, T + 0.22, wood)
hospital = finish("Hospital")

# ---------- SIDE_HUSTLE: garage workshop with laptop desk ----------
base(pave)
siding = mat("Siding", "#6fb3d2", 0.7); interior = mat("GarageInside", "#3a3346", 0.8)
screen = mat("Screen", "#5ff2ff", 0.2, 0, 2.0); card = mat("Cardboard", "#d6a467", 0.8)
tape = mat("Tape", "#eed9b0", 0.7); neon = mat("NeonPink", "#ff4fa0", 0.3, 0, 2.5)
gx, gy, GW, GD, GH = -0.12, 0.42, 1.25, 0.95, 0.78
yf = gy - GD / 2
box(GW, GD, GH, gx, gy, T + GH / 2, siding)
prism(GW + 0.12, GD + 0.12, 0.38, gx, gy, T + GH, mat("RoofSlate", "#4a5068", 0.7))
box(0.86, 0.03, 0.58, gx, yf - 0.005, T + 0.29, interior)
box(0.92, 0.04, 0.04, gx, yf - 0.012, T + 0.6, white)
for sx in (-1, 1): box(0.04, 0.04, 0.6, gx + sx * 0.45, yf - 0.012, T + 0.3, white)
box(0.86, 0.05, 0.1, gx, yf - 0.02, T + 0.53, mat("DoorGray", "#d7dbe3", 0.6))
box(0.7, 0.02, 0.22, gx, yf - 0.02, T + 0.3, warm)
for k in range(6):
    sphere(0.025, gx - 0.5 + k * 0.2, yf - 0.06, T + GH + 0.02, warm, seg=6, ring=4)
text("OPEN", 0.13, gx, yf - 0.1, T + GH + 0.16, neon, depth=0.02)
# desk with laptop, lamp, chair
dx_, dy_ = gx + 0.05, yf - 0.32
box(0.62, 0.3, 0.04, dx_, dy_, T + 0.36, wood)
for sx in (-1, 1):
    for sy in (-1, 1): box(0.035, 0.035, 0.34, dx_ + sx * 0.27, dy_ + sy * 0.12, T + 0.17, dark)
box(0.24, 0.17, 0.015, dx_ - 0.04, dy_ - 0.02, T + 0.39, mat("LaptopBody", "#c9ced8", 0.4, 0.4))
box(0.24, 0.015, 0.16, dx_ - 0.04, dy_ + 0.07, T + 0.47, mat("LaptopBody", "#c9ced8", 0.4, 0.4), rx=R(-12))
box(0.21, 0.012, 0.13, dx_ - 0.04, dy_ + 0.06, T + 0.47, screen, rx=R(-12))
cyl(0.04, 0.015, dx_ + 0.22, dy_ + 0.06, T + 0.39, dark, v=10)
beam((dx_ + 0.22, dy_ + 0.06, T + 0.39), (dx_ + 0.2, dy_ + 0.0, T + 0.58), 0.015, dark)
cone(0.06, 0.02, 0.07, dx_ + 0.18, dy_ - 0.04, T + 0.57, yell, v=10)
cyl(0.025, 0.06, dx_ + 0.12, dy_ - 0.05, T + 0.41, white, v=8)
box(0.2, 0.2, 0.03, dx_ - 0.05, dy_ - 0.3, T + 0.24, roof)
box(0.2, 0.03, 0.22, dx_ - 0.05, dy_ - 0.39, T + 0.36, roof)
cyl(0.02, 0.22, dx_ - 0.05, dy_ - 0.3, T + 0.11, dark, v=6)
# parcels ready to ship
for (ox, oy, oz, s) in ((0.62, -0.1, 0, 0.2), (0.78, 0.12, 0, 0.18), (0.66, 0.02, 1, 0.16)):
    z = T + s / 2 + oz * 0.2
    box(s, s, s, ox, oy, z, card)
    box(s + 0.004, 0.04, 0.004, ox, oy, z + s / 2, tape)
cyl(0.02, 0.5, 0.62, -0.6, T + 0.25, dark, v=6)
box(0.3, 0.03, 0.2, 0.62, -0.6, T + 0.45, white)
text("SHOP", 0.09, 0.62, -0.625, T + 0.45, mat("SignBlue", "#2f7bff", 0.5), depth=0.015)
tree(0.75, 0.68, 0.8)
side_hustle = finish("SideHustle")

# ---------- EXPORT + PREVIEW ----------
items = [(home, "life/home_family.glb"), (uni, "life/university.glb"), (index_fund, "life/index_fund.glb"),
         (pension, "life/pension.glb"), (wedding, "life/wedding.glb"), (hospital, "life/hospital.glb"),
         (side_hustle, "life/side_hustle.glb")]
report = {fn: export(o, fn) for o, fn in items}
with open(os.path.join(BLD, "report_life.json"), "w") as f: json.dump(report, f, indent=1)
for i, (o, _) in enumerate(items):
    o.location = ((i % 4 - 1.5) * 2.6 + (1.3 if i >= 4 else 0), 0 if i < 4 else 2.9, 0)
ground("#e8e2d4")
camera((0, -12.5, 9.0), (0, 1.2, 0.8), lens=40)
sun(3.2, (52, 8, 30), "#fff4e0")
set_world("#cfe4f5", light_hex="#dfe8f2", light_strength=0.9)
if not os.environ.get("NORENDER"): render(os.path.join(BLD, "preview_life.png"), (1800, 1000), samples=64, exposure=-0.5)
print("RATRACE_DONE life")
