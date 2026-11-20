# v3 cards: assets/life/card_life.png + assets/history/card.png (800x480). Run after build_life.py / build_history.py
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rr_lib; from rr_lib import *
A = ASSETS

def imp(path, loc, rz=0.0, s=1.0):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location = loc; o.rotation_euler.z += rz; o.scale = (s, s, s)
    return new

def rrect(w, d, r, seg=8):
    pts = []
    for cx, cy, a0 in ((w/2 - r, d/2 - r, 0), (-w/2 + r, d/2 - r, 90), (-w/2 + r, -d/2 + r, 180), (w/2 - r, -d/2 + r, 270)):
        for k in range(seg + 1):
            a = R(a0 + 90 * k / seg); pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def island(top_hex, side_hex, w=6.3, d=5.5, r=1.0):
    pts = rrect(w, d, r)
    extrude_xy(pts, -0.25, 0.0, mat("IslandTop" + top_hex, top_hex, 0.85))
    extrude_xy(pts, -1.1, -0.25, mat("IslandSide" + side_hex, side_hex, 0.9), taper=0.82)
    current.clear()

def cam_card(elev=36, dist=16.2, target=(0, 0.25, 0.85), lens=50):
    t = Vector(target)
    return camera(tuple(t + Vector((0, -dist * math.cos(R(elev)), dist * math.sin(R(elev))))), tuple(t), lens)

# ---- life card: family house, university, pension island ----
reset()
island("#a9dc8a", "#c9a27a")
imp(os.path.join(A, "life", "university.glb"), (0.0, 1.15, 0), R(0))
imp(os.path.join(A, "life", "home_family.glb"), (-1.55, -1.05, 0), R(8))
imp(os.path.join(A, "life", "pension.glb"), (1.55, -1.05, 0), R(-8))
lf = mat("Leaf", "#5aa84f", 0.8); wd = mat("Wood", "#8b5a2b", 0.7)
for (x, y, s) in ((-2.3, 1.4, 1.0), (2.3, 1.3, 0.9), (0.0, -0.9, 0.6), (-2.6, -0.1, 0.7), (2.65, 0.0, 0.7)):
    cyl(0.05 * s, 0.4 * s, x, y, 0.2 * s, wd, v=8); sphere(0.3 * s, x, y, 0.6 * s, lf, seg=8, ring=6)
current.clear()
cam_card(); sun(3.4, (55, 6, 38), "#fff1d6")
set_world("#bfe3ff", "#ffd6a5", light_hex="#eaf2ff", light_strength=0.9)
render(os.path.join(A, "life", "card_life.png"), (800, 480), samples=96, compression=100, exposure=-0.45)

# ---- history card: time machine scene, warm sepia + gold sky ----
reset()
island("#8b5e34", "#5a3a20")
imp(os.path.join(A, "history", "ticker_board.glb"), (-1.5, 1.0, 0), R(10))
imp(os.path.join(A, "history", "time_machine.glb"), (0.75, -0.55, 0), R(-8), 1.35)
gold = mat("CardGold", "#f2b632", 0.3, 0.6); golddk = mat("CardGoldDk", "#b8740f", 0.35, 0.6)
for (x, y, n) in ((-2.2, -1.5, 4), (-1.75, -1.85, 2), (2.45, 1.6, 3), (-0.5, -1.9, 1)):
    for k in range(n): cyl(0.16, 0.06, x, y, 0.03 + k * 0.06, gold if k % 2 == 0 else golddk, v=16)
# floating clocks in the sky
face = mat("CardClock", "#fbf3df", 0.5); dk = mat("CardDark", "#4a3320", 0.5)
for (x, y, z, r) in ((-2.75, 3.1, 2.55, 0.42), (2.75, 3.3, 2.75, 0.34), (-0.05, 3.5, 2.45, 0.24)):
    cyl(r, 0.06, x, y, z, face, v=24, rx=R(90)); torus(r, 0.05, x, y - 0.03, z, gold, maj=24, mn=8, rx=R(90))
    box(0.04, 0.02, r * 0.6, x, y - 0.06, z + r * 0.25, dk); box(r * 0.5, 0.02, 0.04, x + r * 0.22, y - 0.06, z, dk)
current.clear()
cam_card(); sun(3.0, (50, 6, 35), "#ffd9a0")
set_world("#ffe2a0", "#9a6334", light_hex="#ffe6c4", light_strength=0.9)
render(os.path.join(A, "history", "card.png"), (800, 480), samples=96, compression=100, exposure=-0.3)
print("RATRACE_DONE cards_v3")
