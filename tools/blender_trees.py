# 街の木（6 種）を Blender で作り、ゲームが読む軽い形（頂点＋三角形＋面ごとの明るさ）で書き出す
import bpy, bmesh, math, random, json, os
from mathutils import Vector, noise
OUT = r"C:\Users\kgryo\OneDrive\ドキュメント\Claude\sumucity-models"
colname = 'Trees'
col = bpy.data.collections.get(colname)
if col:
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
else:
    col = bpy.data.collections.new(colname); bpy.context.scene.collection.children.link(col)
for c in bpy.context.scene.collection.children:
    lc = bpy.context.view_layer.layer_collection.children.get(c.name)
    if lc: lc.hide_viewport = (c.name != colname)
def M(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.diffuse_color = (*rgb, 1); return m
MT = M('tree_trunk', (0.12, 0.08, 0.05)); ML = M('tree_leaf', (0.12, 0.3, 0.08))

def add_clump(bm, c, r, sq=(1, 1, 1), sub=1, rough=0.22, seed=0):
    """葉の塊：凸凹にした小さな球。面に 'leaf' の印"""
    res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    vs = res['verts']
    for v in vs:
        p = v.co.copy()
        n = noise.noise(p * 1.7 + Vector((seed * 3.1, seed * 1.7, seed * 0.9)))
        k = 1 + rough * n
        v.co = Vector((c[0] + p.x * r * sq[0] * k, c[1] + p.y * r * sq[1] * k, c[2] + p.z * r * sq[2] * k))
    return set(f for v in vs for f in v.link_faces)
def add_branch(bm, a, b, r0, r1, sides=5):
    a, b = Vector(a), Vector(b); d = (b - a).normalized()
    up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = d.cross(up).normalized(); w = d.cross(u)
    ring = lambda c, r: [bm.verts.new(c + (u * math.cos(2 * math.pi * k / sides) + w * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)]
    A, B = ring(a, r0), ring(b, r1); fs = []
    for k in range(sides):
        fs.append(bm.faces.new((A[k], A[(k + 1) % sides], B[(k + 1) % sides], B[k])))
    fs.append(bm.faces.new(list(reversed(B)))) if r1 > 0.02 else None
    return set(fs)
def add_cone(bm, c, r, h, sides=8, jag=0.25, seed=0, z0=0):
    """針葉樹の段：ギザギザの縁をもつ円錐"""
    rnd = random.Random(seed); base = []
    for k in range(sides * 2):
        a = 2 * math.pi * k / (sides * 2); rr = r * (1.0 if k % 2 == 0 else 1 - jag) * (0.9 + 0.2 * rnd.random())
        base.append(bm.verts.new((c[0] + math.cos(a) * rr, c[1] + math.sin(a) * rr, c[2] - (0.25 * h if k % 2 == 0 else 0))))
    top = bm.verts.new((c[0], c[1], c[2] + h)); bot = bm.verts.new((c[0], c[1], c[2] + h * 0.12))
    fs = set()
    for k in range(len(base)):
        fs.add(bm.faces.new((base[k], base[(k + 1) % len(base)], top)))
        fs.add(bm.faces.new((base[(k + 1) % len(base)], base[k], bot)))
    return fs

def build(name, fn):
    bm = bmesh.new(); leaf = set(); trunk = set()
    fn(bm, leaf, trunk)
    for f in bm.faces: f.material_index = 1 if f in leaf else 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new('tree_' + name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('tree_' + name, me); col.objects.link(o)
    return o

def broad(bm, leaf, trunk, seed=1, H=6.4, crown=((0, 0, 4.3, 2.3), (0.9, 0.5, 3.6, 1.6), (-0.8, -0.7, 3.5, 1.5), (0.2, -0.2, 5.6, 1.5), (-0.6, 0.8, 4.6, 1.4)), sq=(1, 1, 0.9)):
    rnd = random.Random(seed)
    trunk |= add_branch(bm, (0, 0, 0), (0, 0, 2.6), 0.28, 0.2)
    for (x, y, z, r) in crown[1:]:
        trunk |= add_branch(bm, (0, 0, 2.2), (x * 0.7, y * 0.7, z - r * 0.6), 0.12, 0.06, 4)
    for i, (x, y, z, r) in enumerate(crown):
        leaf |= add_clump(bm, (x, y, z), r, sq, 1, 0.24, seed * 10 + i)

def t_round(bm, leaf, trunk): broad(bm, leaf, trunk, 1)
def t_vase(bm, leaf, trunk):    # ケヤキ風：枝が上に開いて、上が広い
    trunk.update(add_branch(bm, (0, 0, 0), (0, 0, 2.0), 0.3, 0.22))
    pts = [(1.6, 0.4, 4.6), (-1.4, 1.0, 4.8), (0.3, -1.6, 4.7), (-0.4, -0.2, 5.6)]
    for p in pts: trunk.update(add_branch(bm, (0, 0, 1.8), p, 0.13, 0.07, 4))
    for i, (x, y, z, r) in enumerate([(1.6, 0.4, 5.0, 1.6), (-1.4, 1.0, 5.2, 1.6), (0.3, -1.6, 5.0, 1.5), (-0.3, -0.1, 6.0, 1.7), (0.5, 0.9, 4.3, 1.2)]):
        leaf.update(add_clump(bm, (x, y, z), r, (1, 1, 0.75), 1, 0.25, 20 + i))
def t_oval(bm, leaf, trunk):    # イチョウ風：縦長
    trunk.update(add_branch(bm, (0, 0, 0), (0, 0, 3.0), 0.26, 0.16))
    for i, (x, y, z, r) in enumerate([(0, 0, 3.4, 1.5), (0.2, 0.1, 4.8, 1.45), (-0.1, -0.2, 6.0, 1.15), (0, 0, 7.0, 0.7)]):
        leaf.update(add_clump(bm, (x, y, z), r, (1, 1, 1.05), 1, 0.2, 30 + i))
def t_sakura(bm, leaf, trunk):  # 桜：横に広く低い
    trunk.update(add_branch(bm, (0, 0, 0), (0, 0, 1.6), 0.32, 0.24))
    for p in [(2.0, 0.6, 3.4), (-1.9, 0.9, 3.5), (0.4, -2.0, 3.3), (-0.6, -1.2, 3.8), (1.0, 1.8, 3.6)]:
        trunk.update(add_branch(bm, (0, 0, 1.4), p, 0.14, 0.07, 4))
    for i, (x, y, z, r) in enumerate([(2.0, 0.6, 3.7, 1.6), (-1.9, 0.9, 3.8, 1.6), (0.4, -2.0, 3.6, 1.5), (0, 0, 4.4, 1.9), (1.0, 1.8, 3.9, 1.3), (-1.1, -1.3, 4.0, 1.3)]):
        leaf.update(add_clump(bm, (x, y, z), r, (1, 1, 0.7), 1, 0.28, 40 + i))
def t_conifer(bm, leaf, trunk): # 杉・ヒノキ：段々の円錐
    trunk.update(add_branch(bm, (0, 0, 0), (0, 0, 1.8), 0.22, 0.16))
    for i, (z, r, h) in enumerate([(1.4, 2.0, 2.6), (2.7, 1.65, 2.4), (3.9, 1.3, 2.2), (5.0, 0.9, 1.9)]):
        leaf.update(add_cone(bm, (0, 0, z), r, h, 8, 0.28, 50 + i))
def t_pine(bm, leaf, trunk):    # 松：曲がった幹と平たい葉の塊
    pts = [(0, 0, 0), (0.4, 0.1, 1.6), (0.2, 0.5, 3.0), (-0.3, 0.3, 4.2), (0.1, -0.2, 5.0)]
    for a, b in zip(pts, pts[1:]): trunk.update(add_branch(bm, a, b, 0.24, 0.2))
    for i, (x, y, z, r) in enumerate([(1.4, 0.4, 3.2, 1.3), (-1.2, 0.8, 4.0, 1.2), (0.3, -0.9, 4.6, 1.1), (0.1, -0.1, 5.4, 1.0), (1.0, -1.0, 3.9, 0.9)]):
        trunk.update(add_branch(bm, pts[min(3, 2 + i % 2)], (x * 0.8, y * 0.8, z), 0.1, 0.05, 4))
        leaf.update(add_clump(bm, (x, y, z), r, (1.25, 1.25, 0.42), 1, 0.2, 60 + i))

KINDS = [('round', t_round), ('vase', t_vase), ('oval', t_oval), ('sakura', t_sakura), ('conifer', t_conifer), ('pine', t_pine)]
out = {}
for i, (n, fn) in enumerate(KINDS):
    o = build(n, fn); o.location.x = (i - 2.5) * 9
    me = o.data; me.materials.append(MT); me.materials.append(ML)
    lz = [p.center.z for p in me.polygons if p.material_index == 1]
    z0, z1 = min(lz), max(lz)
    lc = [p.center for p in me.polygons if p.material_index == 1]
    cx = sum(c.x for c in lc) / len(lc); cy = sum(c.y for c in lc) / len(lc)
    rmax = max(math.hypot(c.x - cx, c.y - cy) for c in lc) or 1
    V = [[round(v.co.x, 2), round(v.co.y, 2), round(v.co.z, 2)] for v in me.vertices]
    F = []
    for p in me.polygons:
        vs = list(p.vertices)
        if p.material_index == 0: sh = 1.0; t = 0
        else:
            c = p.center; h = (c.z - z0) / max(0.1, z1 - z0); rr = math.hypot(c.x - cx, c.y - cy) / rmax
            sh = 0.68 + 0.36 * h + 0.14 * max(0, p.normal.z) + 0.12 * rr - 0.06 * max(0, -p.normal.z); t = 1
        for k in range(1, len(vs) - 1):
            F.append([vs[0], vs[k], vs[k + 1], t, round(min(1.25, sh), 2)])
    out[n] = {'V': V, 'F': F}
    # Blender 上でも明るさを頂点色で見せる
    ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for p in me.polygons:
        if p.material_index == 0: rgb = (0.36, 0.27, 0.2)
        else:
            c = p.center; h = (c.z - z0) / max(0.1, z1 - z0); rr = math.hypot(c.x - cx, c.y - cy) / rmax
            sh = 0.68 + 0.36 * h + 0.14 * max(0, p.normal.z) + 0.12 * rr; rgb = (0.31 * sh, 0.54 * sh, 0.24 * sh) if n != 'sakura' else (0.94 * sh, 0.73 * sh, 0.78 * sh)
        for li in p.loop_indices: ca.data[li].color = (*rgb, 1)
json.dump(out, open(os.path.join(OUT, 'trees.json'), 'w'), separators=(',', ':'))
for win in bpy.context.window_manager.windows:
    for area in win.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces.active; sp.shading.type = 'SOLID'; sp.shading.color_type = 'VERTEX'
from mathutils import Euler
for win in bpy.context.window_manager.windows:
    for area in win.screen.areas:
        if area.type == 'VIEW_3D':
            r3 = area.spaces.active.region_3d; r3.view_location = Vector((0, 0, 3.5)); r3.view_distance = 46
            r3.view_rotation = Euler((math.radians(78), 0, math.radians(-8))).to_quaternion()
result = {k: (len(v['V']), len(v['F'])) for k, v in out.items()}
