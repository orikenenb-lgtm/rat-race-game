# Rat Race - shared Blender (bpy) helpers. Container version. Same style as build_assets.py (v1).
import bpy, bmesh, math, os, json, struct, random
from mathutils import Vector, Matrix
R = math.radians
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
BLD = os.path.join(ROOT, "blender")
MATS = {}
current = []
BEVEL_ANGLE = R(50)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear(); current.clear()

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def mat(name, hexcol, rough=0.6, metal=0.0, emit=0.0, alpha=1.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    b = m.node_tree.nodes.get("Principled BSDF")
    col = lin(hexcol)
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit > 0:
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = emit
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try: setattr(m, attr, val)
            except Exception: pass
    m.diffuse_color = (*col, alpha)
    MATS[name] = m
    return m

def _fin(o, m):
    o.data.materials.append(m); current.append(o); return o

def box(sx, sy, sz, x, y, z, m, rx=0, ry=0, rz=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z), rotation=(rx, ry, rz))
    o = bpy.context.active_object; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _fin(o, m)

def cyl(r, d, x, y, z, m, v=16, rx=0, ry=0, rz=0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d, location=(x, y, z), rotation=(rx, ry, rz))
    return _fin(bpy.context.active_object, m)

def cone(r1, r2, d, x, y, z, m, v=16, rx=0, ry=0, rz=0):
    bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r1, radius2=r2, depth=d, location=(x, y, z), rotation=(rx, ry, rz))
    return _fin(bpy.context.active_object, m)

def sphere(r, x, y, z, m, seg=10, ring=6, sx=1, sy=1, sz=1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=r, location=(x, y, z))
    o = bpy.context.active_object
    if (sx, sy, sz) != (1, 1, 1):
        o.scale = (sx, sy, sz); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _fin(o, m)

def torus(R_, r, x, y, z, m, maj=16, mn=8, rx=0, ry=0, rz=0):
    bpy.ops.mesh.primitive_torus_add(major_radius=R_, minor_radius=r, major_segments=maj, minor_segments=mn,
                                     location=(x, y, z), rotation=(rx, ry, rz))
    return _fin(bpy.context.active_object, m)

def _obj(bm, loc=(0, 0, 0), rot=(0, 0, 0)):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("part"); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new("part", me); bpy.context.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    return o

def prism(w, dpt, h, x, y, z, m, rz=0):
    bm = bmesh.new(); hw, hd = w / 2, dpt / 2
    v = [bm.verts.new(p) for p in [(-hw,-hd,0),(hw,-hd,0),(0,-hd,h),(-hw,hd,0),(hw,hd,0),(0,hd,h)]]
    bm.faces.new([v[0],v[1],v[2]]); bm.faces.new([v[3],v[5],v[4]])
    bm.faces.new([v[0],v[3],v[4],v[1]]); bm.faces.new([v[1],v[4],v[5],v[2]]); bm.faces.new([v[2],v[5],v[3],v[0]])
    return _fin(_obj(bm, (x, y, z), (0, 0, rz)), m)

def extrude_xy(pts, z0, z1, m, x=0, y=0, taper=1.0, rz=0):
    bm = bmesh.new(); n = len(pts)
    a = [bm.verts.new((px * taper, py * taper, z0)) for px, py in pts]
    b = [bm.verts.new((px, py, z1)) for px, py in pts]
    bm.faces.new(a); bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new([a[i], a[j], b[j], b[i]])
    return _fin(_obj(bm, (x, y, 0), (0, 0, rz)), m)

def extrude_xz(pts, thick, m, loc=(0, 0, 0), rot=(0, 0, 0)):
    bm = bmesh.new(); n = len(pts); t = thick / 2
    a = [bm.verts.new((px, -t, pz)) for px, pz in pts]
    b = [bm.verts.new((px, t, pz)) for px, pz in pts]
    bm.faces.new(a); bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new([a[i], a[j], b[j], b[i]])
    return _fin(_obj(bm, loc, rot), m)

def frustum(bx, by, tx, ty, h, x, y, z, m, rz=0):
    bm = bmesh.new(); q = ((-1, -1), (1, -1), (1, 1), (-1, 1))
    a = [bm.verts.new((sx * bx / 2, sy * by / 2, 0)) for sx, sy in q]
    b = [bm.verts.new((sx * tx / 2, sy * ty / 2, h)) for sx, sy in q]
    bm.faces.new(a); bm.faces.new(b)
    for i in range(4):
        j = (i + 1) % 4; bm.faces.new([a[i], a[j], b[j], b[i]])
    return _fin(_obj(bm, (x, y, z), (0, 0, rz)), m)

def hemi(r, x, y, z, m, seg=16, ring=8, sz=1.0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=r)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS')
    for v in bm.verts: v.co.z *= sz
    return _fin(_obj(bm, (x, y, z)), m)

def arch(R_, r, x, y, z, m, rz=0, maj=24, mn=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=R_, minor_radius=r, major_segments=maj, minor_segments=mn,
                                     location=(x, y, z), rotation=(R(90), 0, rz))
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS')
    bm.to_mesh(o.data); bm.free()
    return _fin(o, m)

def beam(p1, p2, w, m, d=None):
    p1 = Vector(p1); p2 = Vector(p2); v = p2 - p1
    bpy.ops.mesh.primitive_cube_add(size=1, location=(p1 + p2) / 2)
    o = bpy.context.active_object; o.scale = (w, d or w, v.length)
    o.rotation_euler = v.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _fin(o, m)

def text(s, size, x, y, z, m, depth=0.03, rx=R(90), rz=0):
    cu = bpy.data.curves.new("txt", 'FONT'); cu.body = s; cu.size = size; cu.extrude = depth / 2
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.resolution_u = 2
    ob = bpy.data.objects.new("txt", cu); bpy.context.collection.objects.link(ob)
    ob.location = (x, y, z); ob.rotation_euler = (rx, 0, rz)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(o.data); bm.free()
    nobevel(o)
    return _fin(o, m)

def nobevel(o):
    vg = o.vertex_groups.new(name="nobevel"); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE'); return o

def slab(m, size=2.0, h=0.12):
    return box(size, size, h, 0, 0, h / 2, m)

def finish(name, bevel=0.012):
    """join parts, bevel (ANGLE limit); parts tagged with nobevel() (text, gears) are joined after the bevel is applied"""
    nob = [o for o in current if "nobevel" in o.vertex_groups]
    bev = [o for o in current if o not in nob]
    bpy.ops.object.select_all(action='DESELECT')
    for o in bev: o.select_set(True)
    bpy.context.view_layer.objects.active = bev[0]
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name; o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        b = o.modifiers.new("bev", "BEVEL"); b.width = bevel; b.segments = 2
        b.limit_method = 'ANGLE'; b.angle_limit = BEVEL_ANGLE
        if nob: bpy.ops.object.modifier_apply(modifier="bev")
    if nob:
        bpy.ops.object.select_all(action='DESELECT')
        for p in nob: p.select_set(True)
        o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.join()
        o = bpy.context.active_object
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        for vg in list(o.vertex_groups): o.vertex_groups.remove(vg)
    current.clear()
    return o

def glb_info(p):
    with open(p, 'rb') as f: data = f.read()
    jl = struct.unpack('<I', data[12:16])[0]
    j = json.loads(data[20:20 + jl])
    acc = j['accessors']; prims = [pr for me in j['meshes'] for pr in me['primitives']]
    return dict(bytes=len(data), verts=sum(acc[p['attributes']['POSITION']]['count'] for p in prims),
                tris=sum(acc[p['indices']]['count'] // 3 for p in prims), mats=[mm['name'] for mm in j.get('materials', [])])

def export(o, rel):
    p = os.path.join(ASSETS, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o
    kw = dict(filepath=p, export_format='GLB', use_selection=True, export_apply=True)
    try: bpy.ops.export_scene.gltf(export_texcoords=False, **kw)
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    info = glb_info(p); info['dims'] = [round(d, 2) for d in o.dimensions]
    print("ASSET", rel, json.dumps(info)); return info

def set_world(top_hex, bottom_hex=None, light_hex=None, light_strength=0.9, sky_strength=1.0):
    w = bpy.data.worlds.new("W"); bpy.context.scene.world = w
    try: w.use_nodes = True
    except Exception: pass
    nt = w.node_tree; N = nt.nodes; L = nt.links
    bg = N["Background"]; out = N["World Output"]
    bg.inputs[0].default_value = (*lin(light_hex or top_hex), 1); bg.inputs[1].default_value = light_strength
    if bottom_hex is None and light_hex is None: return
    tc = N.new("ShaderNodeTexCoord"); sep = N.new("ShaderNodeSeparateXYZ"); ramp = N.new("ShaderNodeValToRGB")
    L.new(tc.outputs["Window"], sep.inputs[0]); L.new(sep.outputs["Y"], ramp.inputs[0])
    ramp.color_ramp.elements[0].color = (*lin(bottom_hex or top_hex), 1)
    ramp.color_ramp.elements[1].color = (*lin(top_hex), 1)
    sky = N.new("ShaderNodeBackground"); L.new(ramp.outputs[0], sky.inputs[0]); sky.inputs[1].default_value = sky_strength
    lp = N.new("ShaderNodeLightPath"); mix = N.new("ShaderNodeMixShader")
    L.new(lp.outputs["Is Camera Ray"], mix.inputs[0]); L.new(bg.outputs[0], mix.inputs[1]); L.new(sky.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs[0])

def camera(loc, target, lens=40):
    cd = bpy.data.cameras.new("Cam"); cd.lens = lens
    cam = bpy.data.objects.new("Cam", cd); bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam; return cam

def sun(energy=3.5, rot=(50, 10, 35), color="#ffffff", angle=8):
    ld = bpy.data.lights.new("Sun", 'SUN'); ld.energy = energy; ld.angle = R(angle); ld.color = lin(color)
    s = bpy.data.objects.new("Sun", ld); bpy.context.scene.collection.objects.link(s)
    s.rotation_euler = tuple(R(a) for a in rot); return s

def ground(hexcol, size=80, z=-0.002, rough=0.9):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    g = bpy.context.active_object; g.data.materials.append(mat("Ground_" + hexcol, hexcol, rough)); return g

def row(objs, spacing, y=0.0):
    n = len(objs)
    for i, o in enumerate(objs): o.location = ((i - (n - 1) / 2) * spacing, y, 0)

ENGINE = os.environ.get("RR_ENGINE", "CYCLES")
def render(path, res=(1800, 760), samples=48, fmt='PNG', compression=90, transparent=False, exposure=0.0):
    sc = bpy.context.scene
    if ENGINE == "EEVEE":
        sc.render.engine = "BLENDER_EEVEE"; sc.eevee.taa_render_samples = samples
    else:
        sc.render.engine = "CYCLES"; sc.cycles.device = 'CPU'
        sc.cycles.samples = max(8, samples // 2); sc.cycles.use_denoising = True
        sc.cycles.max_bounces = 4
        try: sc.render.threads_mode = 'AUTO'
        except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = fmt
    sc.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    if fmt == 'PNG': sc.render.image_settings.compression = compression
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path, os.path.getsize(path))
