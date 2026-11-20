# Hand (open + closed) and die for the UI. Run: python3 build_hand_die.py
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rr_lib; from rr_lib import *
reset()
glove = mat("HandGlove", "#f5c86a", 0.45, 0.05)
cuff  = mat("HandCuff", "#fff6e6", 0.55)
line  = mat("HandLine", "#d99a3a", 0.5)

def capsule(p1, p2, r, m, v=12):
    p1 = Vector(p1); p2 = Vector(p2); d = p2 - p1
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d.length, location=(p1 + p2) / 2)
    o = bpy.context.active_object; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); rr_lib._fin(o, m)
    sphere(r, *p2, m, seg=12, ring=8)
    return p2

def dirv(yaw, pitch):
    # forward = -Y, yaw spreads toward +X, pitch < 0 bends down (-Z)
    return Vector((math.sin(R(yaw)) * math.cos(R(pitch)), -math.cos(R(yaw)) * math.cos(R(pitch)), math.sin(R(pitch))))

def hand(closed):
    # cuff (wrist at origin), palm, fingers forward along -Y; palm faces down (-Z); thumb on +X
    cyl(0.25, 0.16, 0, -0.08, 0, cuff, v=20, rx=R(90))
    cyl(0.262, 0.035, 0, -0.03, 0, cuff, v=20, rx=R(90))
    cyl(0.21, 0.08, 0, -0.18, 0, glove, v=20, rx=R(90))
    pts = []
    for cx, cy, a0 in ((0.14, 0.09, 0), (-0.14, 0.09, 90), (-0.14, -0.09, 180), (0.14, -0.09, 270)):
        for k in range(5):
            a = R(a0 + 22.5 * k); pts.append((cx + 0.15 * math.cos(a), cy + 0.15 * math.sin(a)))
    extrude_xy(pts, -0.1, 0.08, glove, y=-0.42)
    sphere(0.3, 0, -0.42, 0.06, glove, seg=16, ring=8, sx=0.97, sy=0.8, sz=0.24)
    for i, x in enumerate((0.205, 0.07, -0.07, -0.205)):
        L1, L2 = (0.22, 0.25, 0.23, 0.18)[i], (0.2, 0.22, 0.21, 0.17)[i]
        k = Vector((x, -0.64, 0.02)); sphere(0.075, *k, glove, seg=12, ring=8)
        if not closed:
            yaw = (-12, -4, 4, 12)[i] * -1
            p = capsule(k, k + dirv(yaw, -8) * L1, 0.072, glove)
            capsule(p, p + dirv(yaw, -22) * L2, 0.07, glove)
        else:
            p = capsule(k, k + Vector((0, -0.12, -0.17)).normalized() * 0.2, 0.074, glove)
            capsule(p, p + Vector((0, 0.9, -0.25)).normalized() * 0.17, 0.072, glove)
    t0 = Vector((0.27, -0.3, -0.03)); sphere(0.09, *t0, glove, seg=12, ring=8)
    if not closed:
        p = capsule(t0, t0 + Vector((0.55, -0.6, -0.12)).normalized() * 0.2, 0.08, glove)
        capsule(p, p + Vector((0.25, -0.9, -0.15)).normalized() * 0.17, 0.075, glove)
    else:
        p = capsule(t0, t0 + Vector((-0.1, -0.7, -0.6)).normalized() * 0.2, 0.08, glove)
        capsule(p, p + Vector((-1, -0.15, -0.1)).normalized() * 0.2, 0.075, glove)
    # cartoon glove stitch lines on the back of the hand
    for x in (-0.12, 0.0, 0.12): box(0.025, 0.2, 0.02, x, -0.38, 0.135, line)
    return finish("HandClosed" if closed else "HandOpen", bevel=0.01)

hand_open = hand(False)
hand_closed = hand(True)

# ---------- DIE: rounded white cube with dark inset pips ----------
white = mat("DieWhite", "#fbf8f2", 0.35)
pipm  = mat("DiePip", "#23283a", 0.4)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0)); die = bpy.context.active_object
die.data.materials.append(white)
b = die.modifiers.new("round", "BEVEL"); b.width = 0.14; b.segments = 5; b.limit_method = 'NONE'
bpy.ops.object.modifier_apply(modifier="round")
# Blender axes: +Z=1, -Z=6, -Y=2, +Y=5, +X=3, -X=4  (glTF: +Y=1, -Y=6, +Z=2, -Z=5, +X=3, -X=4)
FACES = {1: ((0, 0, 1), (1, 0, 0), (0, 1, 0)), 6: ((0, 0, -1), (1, 0, 0), (0, 1, 0)),
         2: ((0, -1, 0), (1, 0, 0), (0, 0, 1)), 5: ((0, 1, 0), (1, 0, 0), (0, 0, 1)),
         3: ((1, 0, 0), (0, 1, 0), (0, 0, 1)), 4: ((-1, 0, 0), (0, 1, 0), (0, 0, 1))}
o_ = 0.26
LAY = {1: [(0, 0)], 2: [(-o_, o_), (o_, -o_)], 3: [(-o_, o_), (0, 0), (o_, -o_)],
       4: [(-o_, -o_), (-o_, o_), (o_, -o_), (o_, o_)], 5: [(-o_, -o_), (-o_, o_), (o_, -o_), (o_, o_), (0, 0)],
       6: [(-o_, -o_), (-o_, 0), (-o_, o_), (o_, -o_), (o_, 0), (o_, o_)]}
cutters = []
for n, (nv, u, v) in FACES.items():
    nv, u, v = Vector(nv), Vector(u), Vector(v)
    for (a, c) in LAY[n]:
        r = 0.115 if n == 1 else 0.085
        p = nv * (0.5 + r * 0.45) + u * a + v * c
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=r, location=p)
        s = bpy.context.active_object; s.data.materials.append(pipm); cutters.append(s)
bpy.ops.object.select_all(action='DESELECT')
for s in cutters: s.select_set(True)
bpy.context.view_layer.objects.active = cutters[0]; bpy.ops.object.join(); cut = bpy.context.active_object
bo = die.modifiers.new("pips", "BOOLEAN"); bo.operation = 'DIFFERENCE'; bo.object = cut; bo.solver = 'EXACT'
try: bo.material_mode = 'TRANSFER'
except Exception as e: print('NOTRANSFER', e)
bpy.context.view_layer.objects.active = die; bpy.ops.object.modifier_apply(modifier="pips")
bpy.data.objects.remove(cut)
die.name = "Die"; die.data.name = "Die"
print("DIE mats", [m.name for m in die.data.materials])

report = {fn: export(o, fn) for o, fn in ((hand_open, "life/hand.glb"), (hand_closed, "life/hand_closed.glb"), (die, "life/die.glb"))}
# preview
hand_open.location = (-1.0, 0.1, 0.3); hand_closed.location = (0.6, 0.1, 0.3); die.location = (2.0, 0, 0.5)
hand_open.rotation_euler.z = R(-70); hand_closed.rotation_euler.z = R(-70)
die.rotation_euler = (R(-25), R(15), R(30))
ground("#d9dee8", z=-0.2)
camera((0.4, -4.6, 3.4), (0.4, 0, 0.3), lens=38)
sun(3.2, (40, 10, 30), "#fff4e0"); set_world("#cfd8e8", light_hex="#cfd8e8", light_strength=0.9)
render(os.path.join(BLD, "preview_hand_die.png"), (1400, 700), samples=64, exposure=-0.6)
print("RATRACE_DONE handdie")
