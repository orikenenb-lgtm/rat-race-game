# Rat Race - asset builder. Run: blender -b --factory-startup --python build_assets.py
import bpy, bmesh, math, os, json
from mathutils import Vector

OUT = r"C:\rat-race-game\assets"
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
R = math.radians

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

MATS = {}
def mat(name, hexcol, rough=0.6, metal=0.0, emit=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    col = lin(hexcol)
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit > 0:
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = (*col, 1)
    MATS[name] = m
    return m

concrete = mat("Concrete", "#cfc8b8", 0.9)
grass    = mat("Grass", "#7fb069", 0.9)
leaf     = mat("Leaf", "#4f9d4a", 0.8)
wood     = mat("Wood", "#8b5a2b", 0.7)
cream    = mat("Cream", "#f2e3c6", 0.7)
terra    = mat("Terracotta", "#d9734e", 0.7)
glass    = mat("Glass", "#2b4a6f", 0.15, 0.3)
litwin   = mat("LitWindow", "#ffd27a", 0.3, 0, 1.2)
brick    = mat("Brick", "#b5523b", 0.85)
red      = mat("AwningRed", "#e63946", 0.6)
white    = mat("White", "#fbf8f2", 0.6)
dark     = mat("Dark", "#2d3142", 0.5, 0.2)
gold     = mat("Gold", "#f2b632", 0.3, 0.9)
golddk   = mat("GoldDark", "#b8740f", 0.35, 0.9)
marble   = mat("Marble", "#f4f1ea", 0.4)
marble2  = mat("MarbleShade", "#ddd5c4", 0.5)
green    = mat("BullGreen", "#2ecc71", 0.4, 0, 1.5)
night    = mat("NightSlab", "#1f2433", 0.8)
steel    = mat("Steel", "#3a3f55", 0.4, 0.6)
neon     = mat("Neon", "#39ff88", 0.3, 0, 3.0)
pawnm    = mat("PawnColor", "#ffffff", 0.35, 0.1)

current = []
def _fin(o, m):
    o.data.materials.append(m); current.append(o); return o

def box(sx, sy, sz, x, y, z, m, rx=0, ry=0, rz=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z), rotation=(rx, ry, rz))
    o = bpy.context.active_object; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _fin(o, m)

def cyl(r, d, x, y, z, m, v=24, rx=0, ry=0, rz=0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d, location=(x, y, z), rotation=(rx, ry, rz))
    return _fin(bpy.context.active_object, m)

def cone(r1, r2, d, x, y, z, m, v=24, rz=0):
    bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r1, radius2=r2, depth=d, location=(x, y, z), rotation=(0, 0, rz))
    return _fin(bpy.context.active_object, m)

def sphere(r, x, y, z, m, seg=14, ring=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=r, location=(x, y, z))
    return _fin(bpy.context.active_object, m)

def prism(w, dpt, h, x, y, z, m):
    me = bpy.data.meshes.new("prism"); bm = bmesh.new()
    hw, hd = w / 2, dpt / 2
    v = [bm.verts.new(p) for p in [(-hw,-hd,0),(hw,-hd,0),(0,-hd,h),(-hw,hd,0),(hw,hd,0),(0,hd,h)]]
    bm.faces.new([v[0],v[1],v[2]]); bm.faces.new([v[3],v[5],v[4]])
    bm.faces.new([v[0],v[3],v[4],v[1]]); bm.faces.new([v[1],v[4],v[5],v[2]]); bm.faces.new([v[2],v[5],v[3],v[0]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new("prism", me); bpy.context.collection.objects.link(o); o.location = (x, y, z)
    return _fin(o, m)

def finish(name, bevel=0.012):
    global current
    bpy.ops.object.select_all(action='DESELECT')
    for o in current: o.select_set(True)
    bpy.context.view_layer.objects.active = current[0]
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name; o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        b = o.modifiers.new("bev", "BEVEL"); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'
    current = []
    return o

# ---------- 1. APARTMENT (real estate) ----------
box(2, 2, 0.12, 0, 0, 0.06, concrete)
box(0.5, 1.7, 0.04, 0.72, 0, 0.14, grass)
cyl(0.05, 0.4, 0.72, 0.45, 0.36, wood, v=8)
sphere(0.24, 0.72, 0.45, 0.68, leaf, seg=8, ring=6)
sphere(0.16, 0.72, -0.35, 0.3, leaf, seg=8, ring=6)
box(1.2, 1.2, 2.4, -0.25, 0, 1.32, cream)
for k in (1, 2, 3):
    box(1.24, 1.24, 0.05, -0.25, 0, 0.12 + k * 0.6, terra)
for f in range(4):
    z = 0.12 + 0.32 + f * 0.6
    for c in range(3):
        if f == 0 and c == 1: continue
        m = litwin if (f + c) % 3 == 0 else glass
        box(0.22, 0.04, 0.3, -0.25 + (c - 1) * 0.36, -0.615, z, m)
        box(0.04, 0.22, 0.3, 0.365, (c - 1) * 0.36, z, glass if m is litwin else litwin)
box(0.3, 0.05, 0.42, -0.25, -0.62, 0.33, wood)
box(0.42, 0.25, 0.04, -0.25, -0.72, 0.58, terra)
box(1.3, 1.3, 0.12, -0.25, 0, 2.58, terra)
cyl(0.15, 0.3, -0.5, 0.25, 2.79, steel, v=12)
box(0.22, 0.18, 0.14, -0.05, -0.2, 2.71, steel)
apartment = finish("Apartment")

# ---------- 2. BUSINESS (cafe / shop) ----------
box(2, 2, 0.12, 0, 0, 0.06, concrete)
box(1.7, 1.2, 1.3, 0, 0.15, 0.77, brick)
box(1.8, 1.3, 0.08, 0, 0.15, 1.46, dark)
box(1.1, 0.04, 0.62, -0.18, -0.46, 0.62, litwin)
box(1.16, 0.05, 0.05, -0.18, -0.465, 0.95, dark)
box(0.32, 0.05, 0.76, 0.6, -0.46, 0.5, wood)
n = 7; w = 1.7 / n
for i in range(n):
    box(w, 0.5, 0.035, -0.85 + w / 2 + i * w, -0.68, 1.1, red if i % 2 == 0 else white, rx=R(20))
box(1.2, 0.1, 0.34, 0, -0.38, 1.66, gold)
box(1.05, 0.12, 0.22, 0, -0.38, 1.66, dark)
for tx in (-0.55, 0.1):
    cyl(0.16, 0.03, tx, -0.8, 0.43, white, v=16)
    cyl(0.022, 0.3, tx, -0.8, 0.27, dark, v=8)
box(0.26, 0.26, 0.2, 0.85, -0.82, 0.22, wood)
sphere(0.17, 0.85, -0.82, 0.45, leaf, seg=8, ring=6)
business = finish("Business")

# ---------- 3. STOCK EXCHANGE ----------
box(2, 2, 0.12, 0, 0, 0.06, concrete)
box(1.8, 1.7, 0.08, 0, 0.05, 0.16, marble2)
box(1.7, 1.6, 0.08, 0, 0.1, 0.24, marble)
box(1.6, 1.5, 0.08, 0, 0.15, 0.32, marble2)
box(1.3, 0.9, 1.0, 0, 0.35, 0.86, marble2)
box(0.34, 0.05, 0.6, 0, -0.105, 0.66, golddk)
for i in range(5):
    x = -0.6 + i * 0.3
    cyl(0.075, 1.0, x, -0.42, 0.86, marble, v=12)
    box(0.2, 0.2, 0.05, x, -0.42, 1.385, marble)
    box(0.2, 0.2, 0.05, x, -0.42, 0.385, marble)
box(1.55, 1.4, 0.15, 0, 0.1, 1.485, marble)
box(1.5, 0.02, 0.05, 0, -0.61, 1.485, gold)
prism(1.55, 1.4, 0.36, 0, 0.1, 1.56, marble)
box(0.1, 0.1, 0.42, 0, 0.1, 2.16, green)
cone(0.2, 0, 0.26, 0, 0.1, 2.5, green, v=4, rz=R(45))
stock = finish("StockExchange")

# ---------- 4. CRYPTO ----------
box(2, 2, 0.12, 0, 0, 0.06, night)
for rx_ in (-0.62, -0.12):
    box(0.45, 0.6, 1.1, rx_, 0.4, 0.67, dark)
    for k in range(5):
        box(0.36, 0.02, 0.03, rx_, 0.09, 0.32 + k * 0.18, neon)
    box(0.3, 0.02, 0.3, rx_, 0.09, 1.06, steel)
cyl(0.35, 0.25, 0.55, -0.25, 0.245, steel, v=24)
cyl(0.38, 0.02, 0.55, -0.25, 0.38, neon, v=32)
cyl(0.42, 0.1, 0.55, -0.25, 0.85, gold, v=40, rx=R(90))
cyl(0.33, 0.12, 0.55, -0.25, 0.85, golddk, v=40, rx=R(90))
D = 0.15
box(0.06, D, 0.34, 0.47, -0.25, 0.85, gold)
box(0.14, D, 0.05, 0.52, -0.25, 1.0, gold)
box(0.16, D, 0.05, 0.53, -0.25, 0.85, gold)
box(0.16, D, 0.05, 0.53, -0.25, 0.70, gold)
box(0.05, D, 0.12, 0.6, -0.25, 0.925, gold)
box(0.05, D, 0.12, 0.62, -0.25, 0.775, gold)
for tx in (0.49, 0.55):
    box(0.03, D, 0.07, tx, -0.25, 1.06, gold)
    box(0.03, D, 0.07, tx, -0.25, 0.64, gold)
crypto = finish("Crypto")

# ---------- 5. PAWN ----------
cyl(0.22, 0.08, 0, 0, 0.04, pawnm, v=24)
cone(0.17, 0.07, 0.42, 0, 0, 0.29, pawnm, v=24)
sphere(0.13, 0, 0, 0.6, pawnm, seg=16, ring=10)
pawn = finish("Pawn", bevel=0.008)

# ---------- EXPORT ----------
report = {}
assets = [(apartment, "apartment.glb"), (business, "business.glb"), (stock, "stock.glb"), (crypto, "crypto.glb"), (pawn, "pawn.glb")]
for o, fn in assets:
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o
    p = os.path.join(OUT, fn)
    bpy.ops.export_scene.gltf(filepath=p, export_format='GLB', use_selection=True, export_apply=True)
    report[fn] = {"bytes": os.path.getsize(p), "verts": len(o.data.vertices)}

# ---------- PREVIEW RENDER ----------
for i, (o, fn) in enumerate(assets[:4]):
    o.location.x = (i - 1.5) * 2.6
pawn.location = (5.2, -1.2, 0)
cd = bpy.data.cameras.new("Cam"); cd.lens = 40
cam = bpy.data.objects.new("Cam", cd); scene.collection.objects.link(cam)
cam.location = (0.6, -12, 6.0)
cam.rotation_euler = (Vector((0.6, 0, 1.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
ld = bpy.data.lights.new("Sun", 'SUN'); ld.energy = 3.5; ld.angle = R(8)
sun = bpy.data.objects.new("Sun", ld); scene.collection.objects.link(sun)
sun.rotation_euler = (R(50), R(10), R(35))
w = bpy.data.worlds.new("W"); scene.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (*lin("#bcd4e6"), 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
eng_used = None
for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
    try:
        scene.render.engine = eng; eng_used = eng; break
    except Exception:
        pass
scene.render.resolution_x = 1600; scene.render.resolution_y = 640
scene.render.filepath = os.path.join(OUT, "preview.png")
try:
    bpy.ops.render.render(write_still=True)
except Exception as e:
    report["render_error"] = str(e)
    scene.render.engine = "BLENDER_WORKBENCH"; eng_used = "WORKBENCH(fallback)"
    scene.display.shading.color_type = 'MATERIAL'
    bpy.ops.render.render(write_still=True)
report["engine"] = eng_used
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "assets.blend"))
with open(os.path.join(OUT, "report.json"), "w") as f:
    json.dump(report, f, indent=1)
print("RATRACE_DONE", json.dumps(report))
