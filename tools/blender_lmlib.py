import bpy, math, os, numpy as np
OUTDIR = r"C:\Users\kgryo\OneDrive\ドキュメント\Claude\sumucity-models"
rng = np.random.default_rng(11)
S_ = {'col': None, 'pre': '', 'M': {}}

def begin(colname, pre):
    """コレクションを空にして作り直す。他のコレクションは隠す"""
    col = bpy.data.collections.get(colname)
    if col:
        for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new(colname); bpy.context.scene.collection.children.link(col)
    for c in bpy.context.scene.collection.children:
        lc = bpy.context.view_layer.layer_collection.children.get(c.name)
        if lc: lc.hide_viewport = (c.name != colname)
    for m in list(bpy.data.meshes):
        if m.users == 0: bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):
        if m.name.startswith(pre + '_'): bpy.data.materials.remove(m)
    for im in list(bpy.data.images):
        if im.name.startswith('tx_' + pre + '_'): bpy.data.images.remove(im)
    S_['col'] = col; S_['pre'] = pre; S_['M'] = {}
    return col

def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)
def blur(a, n=2):
    for _ in range(n):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a
def to_img(name, rgb, nonc=False):
    H, W = rgb.shape[:2]
    im = bpy.data.images.new('tx_' + S_['pre'] + '_' + name, W, H, alpha=False)
    if nonc: im.colorspace_settings.name = 'Non-Color'
    px = np.ones((H, W, 4), np.float32); px[..., :3] = np.clip(rgb, 0, 1)
    im.pixels.foreach_set(px.ravel()); im.update(); im.pack(); return im
def nrm(h, s):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * s
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * s
    n = np.stack([-dx, -dy, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5

def mat(key, hexc, rough=0.8, metal=0.0, tex=None, emit=None):
    """材質名は「接頭辞_key」。ゲーム側は key に含まれる語（plaster/gold/stone/lamp/glow など）で夜の光り方を決める"""
    m = bpy.data.materials.new(S_['pre'] + '_' + key); m.use_nodes = True; nt = m.node_tree
    b = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    rgb = srgb(hexc)
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    m.diffuse_color = (*rgb, 1)
    if tex:
        c = nt.nodes.new('ShaderNodeTexImage'); c.image = tex[0]; c.location = (-500, 300)
        nt.links.new(c.outputs['Color'], b.inputs['Base Color'])
        if len(tex) > 1 and tex[1] is not None:
            n = nt.nodes.new('ShaderNodeTexImage'); n.image = tex[1]; n.location = (-500, -100)
            nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-200, -100)
            nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emit:
        b.inputs['Emission Color'].default_value = (*srgb(emit[0]), 1); b.inputs['Emission Strength'].default_value = emit[1]
    S_['M'][key] = m
    return m

def mk(name, verts, faces, m, uvs=None):
    me = bpy.data.meshes.new(S_['pre'] + '_' + name); me.from_pydata(verts, [], faces)
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        for lp in me.loops: uvl.data[lp.index].uv = uvs[lp.vertex_index]
    me.validate(); me.update()
    o = bpy.data.objects.new(S_['pre'] + '_' + name, me); S_['col'].objects.link(o); o.data.materials.append(S_['M'][m]); return o
def boxv(cx, cy, z0, w, d, h):
    x0, x1, y0, y1, z1 = cx-w/2, cx+w/2, cy-d/2, cy+d/2, z0+h
    v = [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
    return v, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def boxuv(cx, cy, z0, w, d, h, s=1.0):
    """箱（面ごとに頂点を分けて UV を付ける。s=1 周期の長さ m）"""
    x0, x1, y0, y1, z1 = cx-w/2, cx+w/2, cy-d/2, cy+d/2, z0+h
    V = []; F = []; U = []
    def q(a, b, c, d_, uv):
        o = len(V); V.extend([a, b, c, d_]); U.extend(uv); F.append((o, o+1, o+2, o+3))
    q((x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1), [(x0/s,z0/s),(x1/s,z0/s),(x1/s,z1/s),(x0/s,z1/s)])
    q((x1,y1,z0),(x0,y1,z0),(x0,y1,z1),(x1,y1,z1), [(-x1/s,z0/s),(-x0/s,z0/s),(-x0/s,z1/s),(-x1/s,z1/s)])
    q((x1,y0,z0),(x1,y1,z0),(x1,y1,z1),(x1,y0,z1), [(y0/s,z0/s),(y1/s,z0/s),(y1/s,z1/s),(y0/s,z1/s)])
    q((x0,y1,z0),(x0,y0,z0),(x0,y0,z1),(x0,y1,z1), [(-y1/s,z0/s),(-y0/s,z0/s),(-y0/s,z1/s),(-y1/s,z1/s)])
    q((x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1), [(x0/s,y0/s),(x1/s,y0/s),(x1/s,y1/s),(x0/s,y1/s)])
    q((x0,y1,z0),(x1,y1,z0),(x1,y0,z0),(x0,y0,z0), [(0,0)]*4)
    return V, F, U
class Acc:
    def __init__(s): s.d = {}
    def add(s, m, v, f, uv=None):
        V, F, U = s.d.setdefault(m, ([], [], []))
        o = len(V); V += v; F += [tuple(i+o for i in q) for q in f]; U += (uv or [(0, 0)] * len(v))
    def box(s, m, cx, cy, z0, w, d, h): v, f = boxv(cx, cy, z0, w, d, h); s.add(m, v, f)
    def boxt(s, m, cx, cy, z0, w, d, h, sc=1.0): v, f, u = boxuv(cx, cy, z0, w, d, h, sc); s.add(m, v, f, u)
    def xbox(s, m, xf, cx, cy, z0, w, d, h):
        v, f = boxv(cx, cy, z0, w, d, h); s.add(m, [xf(p) for p in v], f)
    def bar(s, m, p, q, r=0.3, sides=4):
        """p→q の角材（断面は正 sides 角形）"""
        px, py, pz = p; qx, qy, qz = q
        dx, dy, dz = qx-px, qy-py, qz-pz; L = math.sqrt(dx*dx+dy*dy+dz*dz) or 1
        t = (dx/L, dy/L, dz/L)
        a = (0, 0, 1) if abs(t[2]) < 0.9 else (1, 0, 0)
        u = (t[1]*a[2]-t[2]*a[1], t[2]*a[0]-t[0]*a[2], t[0]*a[1]-t[1]*a[0]); ul = math.sqrt(sum(c*c for c in u)); u = tuple(c/ul for c in u)
        w = (t[1]*u[2]-t[2]*u[1], t[2]*u[0]-t[0]*u[2], t[0]*u[1]-t[1]*u[0])
        V = []
        for (cx, cy, cz) in (p, q):
            for k in range(sides):
                an = 2*math.pi*(k+0.5)/sides; ca, sa = math.cos(an)*r, math.sin(an)*r
                V.append((cx+u[0]*ca+w[0]*sa, cy+u[1]*ca+w[1]*sa, cz+u[2]*ca+w[2]*sa))
        F = [(k, (k+1)%sides, sides+(k+1)%sides, sides+k) for k in range(sides)]
        F.append(tuple(range(sides-1, -1, -1))); F.append(tuple(range(sides, 2*sides)))
        s.add(m, V, F)
    def flush(s, prefix='d'):
        for m, (V, F, U) in s.d.items(): mk(f'{prefix}_{m}', V, F, m, U)
        s.d = {}

def face_xf(face, half):
    ang = [0, math.pi/2, math.pi, -math.pi/2][face]
    ca, sa = math.cos(ang), math.sin(ang)
    def f(p):
        x, y, z = p[0], p[1] - half, p[2]
        return (x*ca - y*sa, x*sa + y*ca, z)
    return f

def lathe(A, m, prof, n=32, a0=0.0, a1=2*math.pi, sx=1.0, sy=1.0, cx=0.0, cy=0.0, uscale=None):
    """回転体。prof=[(r, z), ...]（下→上）。sx/sy で楕円に"""
    full = abs(a1 - a0 - 2*math.pi) < 1e-6
    cols = n if full else n + 1
    V = []; F = []; U = []
    for j, (r, z) in enumerate(prof):
        for i in range(cols):
            a = a0 + (a1 - a0) * i / n
            V.append((cx + math.cos(a)*r*sx, cy + math.sin(a)*r*sy, z)); U.append((i / n * (uscale or 1), j / max(1, len(prof)-1)))
    for j in range(len(prof)-1):
        for i in range(n):
            a = j*cols + i; b = j*cols + (i+1) % cols
            F.append((a, b, b+cols, a+cols))
    A.add(m, V, F, U)


# ---- 和風の反り屋根（天守と同じ作り方） ----
def ring(a, b, z, N, lf=None, cx=0.0, cy=0.0):
    cs = [(-a,-b),(a,-b),(a,b),(-a,b)]; p = []
    for i in range(4):
        (x0,y0),(x1,y1) = cs[i], cs[(i+1)%4]
        for k in range(N):
            u = k/N; p.append((cx+x0+(x1-x0)*u, cy+y0+(y1-y0)*u, z+(lf(2*u-1) if lf else 0)))
    return p
def ring_loft(A, m, rings, cap_top=False):
    V = []; F = []; n = len(rings[0])
    for r in rings: V += r
    for j in range(len(rings)-1):
        for i in range(n):
            a = j*n+i; b = j*n+(i+1)%n; F.append((a, b, b+n, a+n))
    if cap_top: F.append(tuple(range((len(rings)-1)*n, len(rings)*n)))
    A.add(m, V, F)
def side_loft(A, m, defs, N, scale, cx=0.0, cy=0.0):
    V = []; F = []; U = []
    for side in range(4):
        rows = []
        for (a, b, z, lf) in defs:
            cs = [(-a,-b),(a,-b),(a,b),(-a,b)]
            (x0,y0),(x1,y1) = cs[side], cs[(side+1)%4]
            rows.append([(cx+x0+(x1-x0)*k/N, cy+y0+(y1-y0)*k/N, z+(lf(2*k/N-1) if lf else 0)) for k in range(N+1)])
        o = len(V); vacc = 0.0
        for j, r in enumerate(rows):
            if j: vacc += math.dist(rows[j-1][N//2], r[N//2])
            for pt in r:
                u = [pt[0]-cx, pt[1]-cy, -(pt[0]-cx), -(pt[1]-cy)][side]
                V.append(pt); U.append((u/scale, vacc/scale))
        for j in range(len(rows)-1):
            for k in range(N):
                a = o + j*(N+1) + k; F.append((a, a+1, a+N+2, a+N+1))
    A.add(m, V, F, U)
def jroof(A, w, d, z0, iw, id_, over, rise, lift, m='roof', soffit='soffit', ridge=None, R=6, N=10, thick=0.5, pw=1.7, cx=0.0, cy=0.0, ts=4.8):
    """反りのある寄棟。壁 w×d の上端 z0 から、内側 iw×id_ まで rise 上がる。lift は隅の跳ね上げ"""
    a0, b0 = w/2+over, d/2+over; defs = []
    for j in range(R+1):
        t = j/R; e = t ** 0.8
        defs.append((a0+(iw/2-a0)*e, b0+(id_/2-b0)*e, z0+rise*(t**pw), lambda s, t=t: lift*(1-t)**1.3*s**6))
    side_loft(A, m, defs, N, ts, cx, cy)
    under = ring(a0, b0, z0-thick, N, lambda s: lift*s**6, cx, cy)
    wall = ring(w/2, d/2, z0-thick-0.3, N, None, cx, cy)
    top0 = ring(a0, b0, z0, N, lambda s: lift*s**6, cx, cy)
    ring_loft(A, soffit, [wall, under, top0])
    rr = [ring(a, b, z, N, lf, cx, cy) for (a, b, z, lf) in defs]
    if ridge:
        for c in range(4):
            pts = [r[c*N] for r in rr]
            dx, dy = (pts[-1][0]-pts[0][0]), (pts[-1][1]-pts[0][1]); L = math.hypot(dx, dy) or 1
            nx, ny = -dy/L*0.22, dx/L*0.22; V = []; F = []
            for p in pts: V += [(p[0]+nx, p[1]+ny, p[2]+0.03), (p[0], p[1], p[2]+0.3), (p[0]-nx, p[1]-ny, p[2]+0.03)]
            for i in range(len(pts)-1):
                a = i*3; F += [(a, a+3, a+4, a+1), (a+1, a+4, a+5, a+2)]
            A.add(ridge, V, F)
    return rr
def obj_at(name, A_, loc, parent=None):
    """A_ の中身を 1 つの物にまとめて loc に置く（回る部品用。原点が回転の中心）"""
    objs = []
    for m, (V, F, U) in A_.d.items():
        objs.append(mk(f'{name}_{m}', V, F, m, U))
    A_.d = {}
    if not objs: return None
    bpy.ops.object.select_all(action='DESELECT') if False else None
    base = objs[0]
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=base, selected_editable_objects=objs, selected_objects=objs):
            bpy.ops.object.join()
    base.name = name; base.location = loc
    if parent: base.parent = parent
    return base

def view(loc, dist, el, az):
    from mathutils import Vector, Euler
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == 'VIEW_3D':
                sp = area.spaces.active; sp.shading.type = 'MATERIAL'; sp.overlay.show_overlays = False; sp.clip_end = 3000
                r3 = sp.region_3d; r3.view_perspective = 'PERSP'
                r3.view_location = Vector(loc); r3.view_distance = dist
                r3.view_rotation = Euler((math.radians(el), 0, math.radians(az))).to_quaternion()

def export(colname, fname, keep=('spin', 'gond', 'beam')):
    """コレクションを 1 つにまとめて glb に。名前に keep の語を含む物（回る部品）は別のまま、親子も残す"""
    col = bpy.data.collections[colname]
    objs = [o for o in col.objects if o.type == 'MESH' and not any(k in o.name for k in keep)]
    movers = [o for o in col.objects if o.type == 'MESH' and any(k in o.name for k in keep)]
    for o in bpy.context.view_layer.objects:
        try: o.select_set(False)
        except Exception: pass
    dups = []
    for o in objs:
        d = o.copy(); d.data = o.data.copy(); bpy.context.scene.collection.objects.link(d); dups.append(d)
    with bpy.context.temp_override(active_object=dups[0], selected_editable_objects=dups, selected_objects=dups):
        bpy.ops.object.join()
    J = dups[0]; J.name = colname + '_static'
    for o in bpy.context.view_layer.objects:
        try: o.select_set(o == J or o in movers)
        except Exception: pass
    p = os.path.join(OUTDIR, fname)
    bpy.ops.export_scene.gltf(filepath=p, export_format='GLB', use_selection=True, export_image_format='NONE', export_yup=True, export_apply=True)
    nf = len(J.data.polygons) + sum(len(o.data.polygons) for o in movers)
    bpy.data.objects.remove(J, do_unlink=True)
    return {'bytes': os.path.getsize(p), 'faces': nf}
