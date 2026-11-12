import bpy, math, numpy as np
for o in list(bpy.data.objects):
    if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
for im in list(bpy.data.images):
    if im.name.startswith('tx_'): bpy.data.images.remove(im)
col = bpy.data.collections.get("OsakaTenshu") or bpy.data.collections.new("OsakaTenshu")
if col.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(col)
rng = np.random.default_rng(7)

def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

# ---------- テクスチャ生成 ----------
def blur(a, n=2):
    for _ in range(n):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a
def to_img(name, rgb, nonc=False):
    H, W = rgb.shape[:2]
    im = bpy.data.images.new(name, W, H, alpha=False)
    if nonc: im.colorspace_settings.name = 'Non-Color'
    px = np.ones((H, W, 4), np.float32); px[..., :3] = np.clip(rgb, 0, 1)
    im.pixels.foreach_set(px.ravel()); im.update(); im.pack(); return im
def nrm(h, s):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * s
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * s
    n = np.stack([-dx, -dy, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5

def tile_tex():
    S, P = 512, 64                                   # 8×8 枚で 1 周期（1 枚 0.6m）
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    cx = (x % P) / P; cy = (y % P) / P
    d = np.abs(cx - 0.5) / 0.2
    maru = np.sqrt(np.clip(1 - d * d, 0, 1))         # 丸瓦の盛り上がり
    hira = 0.25 * (1 - np.cos(2 * np.pi * cx)) * 0.5   # 平瓦のくぼみ
    lip = (1 - cy) ** 2 * 0.35                        # 一枚ごとの重なりの段
    h = np.maximum(maru * 0.9 + lip * 0.6, hira + lip)
    cols = (x // P).astype(int) % 8; rows = (y // P).astype(int) % 8
    var = rng.uniform(0.9, 1.08, (8, 8))[rows, cols]
    base = np.array([0x5f, 0x94, 0x83]) / 255
    shade = (0.62 + 0.45 * h) * var
    edge = np.where(cy < 0.05, 0.7, 1.0)              # 段の影
    groove = np.where(maru > 0, 1.0, 0.85 + 0.15 * (hira / 0.25))
    noise = blur(rng.normal(0, 0.05, (S, S)), 2) + 1
    rgb = base[None, None, :] * (shade * edge * groove * noise)[..., None]
    # 緑青のむら（少し白っぽい筋）
    streak = blur(rng.normal(0, 1, (S, S)), 6); streak = np.clip(streak * 6, 0, 1)[..., None]
    rgb = rgb * (1 - 0.15 * streak) + np.array([0.62, 0.76, 0.70]) * 0.15 * streak
    return to_img('tx_tileC', rgb), to_img('tx_tileN', nrm(h * edge, 3.0), True)

def stone_tex():
    S = 512                                          # 1 周期 6m
    lab = np.zeros((S, S), np.int32); dist = np.zeros((S, S), np.float32)
    hs = []
    while sum(hs) < S: hs.append(int(rng.integers(38, 70)))
    hs[-1] -= sum(hs) - S
    if hs[-1] < 20: hs[-2] += hs[-1]; hs.pop()
    sid = 0; y0 = 0
    for rh in hs:
        ws = []
        while sum(ws) < S: ws.append(int(rng.integers(46, 118)))
        ws[-1] -= sum(ws) - S
        if ws[-1] < 24: ws[-2] += ws[-1]; ws.pop()
        off = int(rng.integers(0, S)); x0 = 0
        for w in ws:
            yy, xx = np.mgrid[0:rh, 0:w]
            dd = np.minimum(np.minimum(yy, rh - 1 - yy), np.minimum(xx, w - 1 - xx)).astype(np.float32)
            cols = (np.arange(w) + x0 + off) % S
            lab[y0:y0 + rh][:, cols] = sid; dist[y0:y0 + rh][:, cols] = dd
            sid += 1; x0 += w
        y0 += rh
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    wx = 6 * np.sin(2 * np.pi * (y * 3 / S + x * 1 / S)) + 4 * np.sin(2 * np.pi * (y * 7 / S - x * 2 / S) + 1.3)
    wy = 5 * np.sin(2 * np.pi * (x * 4 / S + y * 1 / S) + 0.7) + 3 * np.sin(2 * np.pi * (x * 9 / S + y * 3 / S))
    Xs = ((x + wx) % S).astype(int); Ys = ((y + wy) % S).astype(int)
    lab = lab[Ys, Xs]; dist = dist[Ys, Xs]
    tone = rng.uniform(0.78, 1.15, sid + 1); hue = rng.uniform(-0.04, 0.04, sid + 1)
    bev = np.clip(dist / 7, 0, 1) ** 0.6
    bump = blur(rng.normal(0, 1, (S, S)), 3) * 0.12
    h = np.where(dist < 2, 0, bev + bump)
    base = np.array([0x9c, 0x96, 0x8a]) / 255
    t = tone[lab][..., None]; hu = hue[lab][..., None]
    rgb = base * t + np.concatenate([hu, hu * 0.3, -hu], -1)
    rgb = rgb * (0.75 + 0.3 * bev[..., None]) * (1 + blur(rng.normal(0, 0.06, (S, S)), 1))[..., None]
    rgb = np.where((dist < 2)[..., None], np.array([0.30, 0.29, 0.27]), rgb)
    return to_img('tx_stoneC', rgb), to_img('tx_stoneN', nrm(h, 2.5), True)

TC, TN = tile_tex(); SC, SN = stone_tex()

def mat(name, hexc, rough=0.8, metal=0.0, tex=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    rgb = srgb(hexc)
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    m.diffuse_color = (*rgb, 1)
    if tex:
        c = nt.nodes.new('ShaderNodeTexImage'); c.image = tex[0]; c.location = (-500, 300)
        nt.links.new(c.outputs['Color'], b.inputs['Base Color'])
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = tex[1]; n.location = (-500, -100)
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-200, -100)
        nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m
M = {'stone': mat('stone', 0x9c968a, .95, 0, (SC, SN)), 'cap': mat('stoneCap', 0xb7b0a0, .9), 'white': mat('plaster', 0xf3f1ea, .85),
     'roof': mat('copperRoof', 0x5f9483, .55, .15, (TC, TN)), 'soffit': mat('soffit', 0x4f7c6e, .7),
     'ridge': mat('copperRidge', 0x4a7b6c, .55, .2), 'gold': mat('gold', 0xd8b043, .3, 1),
     'black': mat('blackLacquer', 0x1c1c1e, .4), 'win': mat('window', 0x34403c, .6), 'wood': mat('darkWood', 0x3a2c22, .8)}

def mk(name, verts, faces, m, uvs=None):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces)
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        for lp in me.loops: uvl.data[lp.index].uv = uvs[lp.vertex_index]
    me.validate(); me.update()
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.data.materials.append(M[m]); return o
def boxv(cx, cy, z0, w, d, h):
    x0, x1, y0, y1, z1 = cx-w/2, cx+w/2, cy-d/2, cy+d/2, z0+h
    v = [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
    return v, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
class Acc:
    def __init__(s): s.d = {}
    def add(s, m, v, f, uv=None):
        V, F, U = s.d.setdefault(m, ([], [], []))
        o = len(V); V += v; F += [tuple(i+o for i in q) for q in f]; U += (uv or [(0, 0)] * len(v))
    def box(s, m, cx, cy, z0, w, d, h): v, f = boxv(cx, cy, z0, w, d, h); s.add(m, v, f)
    def flush(s, prefix):
        for m, (V, F, U) in s.d.items(): mk(f'{prefix}_{m}', V, F, m, U)
A = Acc()
def box(name, cx, cy, z0, w, d, h, m):
    v, f = boxv(cx, cy, z0, w, d, h); return mk(name, v, f, m)
def ring(a, b, z, N, lf=None):
    cs = [(-a,-b),(a,-b),(a,b),(-a,b)]; p = []
    for i in range(4):
        (x0,y0),(x1,y1) = cs[i], cs[(i+1)%4]
        for k in range(N):
            u = k/N; p.append((x0+(x1-x0)*u, y0+(y1-y0)*u, z+(lf(2*u-1) if lf else 0)))
    return p
def loft(name, rings, m, cap_top=True):
    v = []; f = []; n = len(rings[0])
    for r in rings: v += r
    for j in range(len(rings)-1):
        for i in range(n):
            a = j*n+i; b = j*n+(i+1)%n; f.append((a, b, b+n, a+n))
    if cap_top: f.append(tuple(range((len(rings)-1)*n, len(rings)*n)))
    return mk(name, v, f, m)
def side_loft(m, defs, N, scale, acc=None, name=None):
    """4 面を別々の帯にして UV を付ける。defs = [(a, b, z, lf), ...]（下→上）"""
    V = []; F = []; U = []
    for side in range(4):
        rows = []
        for (a, b, z, lf) in defs:
            cs = [(-a,-b),(a,-b),(a,b),(-a,b)]
            (x0,y0),(x1,y1) = cs[side], cs[(side+1)%4]
            rows.append([(x0+(x1-x0)*k/N, y0+(y1-y0)*k/N, z+(lf(2*k/N-1) if lf else 0)) for k in range(N+1)])
        o = len(V); vacc = 0.0
        for j, r in enumerate(rows):
            if j:
                p, q = rows[j-1][N//2], r[N//2]; vacc += math.dist(p, q)
            for pt in r:
                u = [pt[0], pt[1], -pt[0], -pt[1]][side]
                V.append(pt); U.append((u/scale, vacc/scale))
        for j in range(len(rows)-1):
            for k in range(N):
                a = o + j*(N+1) + k; F.append((a, a+1, a+N+2, a+N+1))
    if acc: acc.add(m, V, F, U)
    else: return mk(name, V, F, m, U)
def face_xf(face, half):
    ang = [0, math.pi/2, math.pi, -math.pi/2][face]
    ca, sa = math.cos(ang), math.sin(ang)
    def f(p):
        x, y, z = p[0], p[1] - half, p[2]
        return (x*ca - y*sa, x*sa + y*ca, z)
    return f

# ---------- 石垣 ----------
SW, SD, SH, E = 56, 51, 12.5, 3.6
side_loft('stone', [(SW/2 - E*(1-(1-j/8)**2), SD/2 - E*(1-(1-j/8)**2), SH*j/8, None) for j in range(9)], 6, 6.0, name='ishigaki')
box('ishigaki_cap', 0, 0, SH, SW-2*E+0.3, SD-2*E+0.3, 0.4, 'cap')

# ---------- 屋根 ----------
def roof(name, w, d, z0, iw, id_, over, rise, lift, R=6, N=12, thick=0.85, pw=1.7):
    a0, b0 = w/2+over, d/2+over; defs = []
    for j in range(R+1):
        t = j/R; e = t ** 0.8
        defs.append((a0+(iw/2-a0)*e, b0+(id_/2-b0)*e, z0+rise*(t**pw), lambda s, t=t: lift*(1-t)**1.3*s**6))
    side_loft('roof', defs, N, 4.8, acc=A)
    under = ring(a0, b0, z0-thick, N, lambda s: lift*s**6)
    wall = ring(w/2, d/2, z0-thick-0.5, N)
    top0 = ring(a0, b0, z0, N, lambda s: lift*s**6)
    loft(name + '_soffit', [wall, under, top0], 'soffit', cap_top=False)
    rr = [ring(a, b, z, N, lf) for (a, b, z, lf) in defs]
    for c in range(4):
        pts = [r[c*N] for r in rr]
        V = []; F = []
        dx, dy = (pts[-1][0]-pts[0][0]), (pts[-1][1]-pts[0][1]); L = math.hypot(dx, dy) or 1
        nx, ny = -dy/L*0.4, dx/L*0.4
        for p in pts:
            V += [(p[0]+nx, p[1]+ny, p[2]+0.05), (p[0], p[1], p[2]+0.5), (p[0]-nx, p[1]-ny, p[2]+0.05)]
        for i in range(len(pts)-1):
            a = i*3; F += [(a, a+3, a+4, a+1), (a+1, a+4, a+5, a+2)]
        A.add('ridge', V, F)
        # 隅の鬼瓦（小さな金の飾り）
        p = pts[0]; A.box('gold', p[0], p[1], p[2] + 0.1, 0.5, 0.5, 0.6)
    return rr

def slab_uv(V4, th, ulen, vlen):
    """屋根板 1 枚（厚みつき）。V4 = 棟前, 棟奥, 軒奥, 軒前"""
    V = list(V4) + [(p[0], p[1], p[2] + th) for p in V4]
    s = 4.8; uv = [(0, vlen/s), (ulen/s, vlen/s), (ulen/s, 0), (0, 0)] * 2
    F = [(4, 5, 6, 7), (0, 3, 2, 1), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3)]
    A.add('roof', V, F, uv)

def chidori(face, half, cx, zb, W, H, D, over=0.8):
    xf = face_xf(face, half)
    tri = lambda s, dy, zoff=0: [xf((cx - W/2*s, dy, zb+zoff)), xf((cx + W/2*s, dy, zb+zoff)), xf((cx, dy, zb + H*s + zoff))]
    A.add('gold', tri(1.0, 0.0), [(0, 1, 2)])
    A.add('white', tri(0.84, -0.06, 0.2), [(0, 1, 2)])
    A.add('white', [xf((cx-W/2, 0, zb)), xf((cx+W/2, 0, zb)), xf((cx+W/2, D*0.6, zb-2.2)), xf((cx-W/2, D*0.6, zb-2.2))], [(0, 1, 2, 3)])
    ex = W/2 + over; dz = H * over / (W/2); sl = math.hypot(ex, H + 0.25 + dz)
    for sgn in (-1, 1):
        slab_uv([xf((cx, -over, zb + H + 0.25)), xf((cx, D, zb + H + 0.25)), xf((cx + sgn*ex, D, zb - dz)), xf((cx + sgn*ex, -over, zb - dz))], 0.4, D + over, sl)
    v, f = boxv(0, 0, 0, 1.0, 0.2, 1.2)
    A.add('gold', [xf((cx + p[0], -0.12 + p[1], zb + H - 1.4 + p[2])) for p in v], f)

def karahafu(face, half, cx, zb, W, H, D, over=0.7, n=18):
    xf = face_xf(face, half)
    prof = []
    for i in range(n+1):
        u = -1 + 2*i/n
        z = H * (0.5 + 0.5*math.cos(math.pi*u)) ** 0.75 + 0.45*H*max(0, abs(u)-0.7)**2/0.09
        prof.append(((W/2+over)*u, z))
    # 屋根（曲面の板）
    V = []; F = []; U = []; acc = 0
    for i, (x, z) in enumerate(prof):
        if i: acc += math.dist(prof[i-1], (x, z))
        for yy in (-over, D):
            for th in (0.25, 0.65):
                V.append(xf((cx+x, yy, zb+z+th))); U.append(((yy + over)/4.8, acc/4.8))
    for i in range(n):
        a = i*4; b = a+4
        F += [(a+1, b+1, b+3, a+3), (a, a+2, b+2, b), (a, b, b+1, a+1)]
    A.add('roof', V, F, U)
    # 妻面（白）: 曲線の下を、下の壁ごと前に出す
    fv = [xf((cx, -0.15, zb - 1.6))]
    fv += [xf((cx - W/2, -0.15, zb - 1.6))]
    for (x, z) in prof:
        xx = max(-W/2, min(W/2, x))
        fv.append(xf((cx+xx, -0.15, zb + z*0.95)))
    fv += [xf((cx + W/2, -0.15, zb - 1.6))]
    A.add('white', fv, [(0, i, i+1) for i in range(1, len(fv)-1)])
    # 側面の壁
    for sx in (-W/2, W/2):
        A.add('white', [xf((cx+sx, -0.15, zb-1.6)), xf((cx+sx, D, zb-1.6)), xf((cx+sx, D, zb+0.4)), xf((cx+sx, -0.15, zb+0.4))], [(0, 1, 2, 3)])
    # 金の破風板
    gv = []
    for (x, z) in prof:
        gv += [xf((cx+x, -over-0.03, zb+z+0.1)), xf((cx+x, -over-0.03, zb+z+0.7))]
    A.add('gold', gv, [(i*2, i*2+2, i*2+3, i*2+1) for i in range(n)])
    # 中央の飾り（兎毛通し）
    v, f = boxv(0, 0, 0, 1.2, 0.2, 0.9)
    A.add('gold', [xf((cx + p[0], -0.3 + p[1], zb + H*0.95 - 0.9 + p[2])) for p in v], f)
    # 下の長押（金の帯）
    v, f = boxv(0, 0, 0, W, 0.15, 0.25)
    A.add('gold', [xf((cx + p[0], -0.25 + p[1], zb - 0.1 + p[2])) for p in v], f)

def windows(w, d, z0, h, rows, top=False):
    for face in range(4):
        L = w if face % 2 == 0 else d
        half = (d if face % 2 == 0 else w) / 2
        xf = face_xf(face, half)
        n = max(2, int(L / 3.2))
        for r in range(rows):
            zc = z0 + h * (r + 0.55) / rows
            for i in range(n):
                x = -L/2 + L*(i+0.5)/n
                if top:
                    v, f = boxv(0, 0, 0, 2.0, 0.12, 2.2); A.add('gold', [xf((x+p[0], -0.05+p[1], zc-1.1+p[2])) for p in v], f)
                v, f = boxv(0, 0, 0, 1.4, 0.14, 1.5); A.add('win', [xf((x+p[0], -0.08+p[1], zc-0.75+p[2])) for p in v], f)
                for j in (-0.35, 0, 0.35):
                    v, f = boxv(0, 0, 0, 0.1, 0.16, 1.5); A.add('gold' if top else 'white', [xf((x+j+p[0], -0.1+p[1], zc-0.75+p[2])) for p in v], f)
            if top:
                for i in range(n-1):
                    x = -L/2 + L*(i+1)/n
                    v, f = boxv(0, 0, 0, 1.1, 0.1, 0.9); A.add('gold', [xf((x+p[0], -0.05+p[1], z0+h*0.8+p[2])) for p in v], f)
        # 壁の下の長押（細い帯）
        v, f = boxv(0, 0, 0, L + 0.1, 0.12, 0.25); A.add('black' if top else 'white', [xf((p[0], -0.06+p[1], z0 + 0.6 + p[2])) for p in v], f)

# ---------- 天守（外観 5 重・どっしり） ----------
TIERS = [(41, 35, 7.0), (35.5, 30, 4.6), (30, 25, 4.3), (25, 20.5, 4.1), (18, 15, 4.5)]
RISE = [3.4, 3.2, 3.0, 2.8]
OVER = 3.1
z = SH + 0.4; info = []
for k, (w, d, h) in enumerate(TIERS):
    top = k == len(TIERS)-1
    box(f'wall{k}', 0, 0, z, w, d, h, 'black' if top else 'white')
    windows(w, d, z, h, 2 if k == 0 else 1, top)
    zr = z + h
    if top:
        rr = roof(f'roof{k}', w, d, zr, w*0.42, 0.8, OVER + 0.3, 6.0, 1.6, R=8)
        ztop = rr[-1][0][2]
    else:
        nw, nd = TIERS[k+1][0], TIERS[k+1][1]
        roof(f'roof{k}', w, d, zr, nw-0.4, nd-0.4, OVER, RISE[k], 1.2)
    info.append((k, round(z, 2), round(zr, 2)))
    if not top: z = zr + RISE[k] - 0.2

for k, (w, d, h) in enumerate(TIERS[:-1]):
    zr = info[k][2]
    for face in range(4):
        half = (d if face % 2 == 0 else w)/2 + 0.7
        front = face % 2 == 0
        if k == 0:
            chidori(face, half, 0, zr + 1.0, 15 if front else 13, 5.0, 5.5)
        elif k == 1:
            karahafu(face, half, 0, zr + 1.3, 9.5, 2.6, 4.5)
        elif k == 2:
            if front:
                for cx in (-6.2, 6.2): chidori(face, half, cx, zr + 0.9, 8, 3.5, 4.5)
            else:
                chidori(face, half, 0, zr + 0.9, 9, 3.7, 4.5)
        elif k == 3:
            if front: chidori(face, half, 0, zr + 0.9, 10, 3.7, 4.5)
            else: karahafu(face, half, 0, zr + 1.2, 7.5, 2.2, 4)

# 最上階: 入母屋の妻、廻縁と高欄
w4, d4, h4 = TIERS[4]; zb4 = info[4][1]; zr4 = info[4][2]
rx = w4*0.21
for face in (1, 3):
    xf = face_xf(face, rx + 0.1)
    zg = zr4 + 3.4
    A.add('gold', [xf((-d4*0.38, 0.0, zg)), xf((d4*0.38, 0.0, zg)), xf((0, 0.0, ztop + 0.2))], [(0, 1, 2)])
    A.add('black', [xf((-d4*0.32, -0.06, zg + 0.35)), xf((d4*0.32, -0.06, zg + 0.35)), xf((0, -0.06, ztop - 0.4))], [(0, 1, 2)])
A.box('wood', 0, 0, zb4 - 0.4, w4 + 2.8, d4 + 2.8, 0.4)
for face in range(4):
    L = (w4 if face % 2 == 0 else d4) + 2.8; half = (d4 if face % 2 == 0 else w4)/2 + 1.3
    xf = face_xf(face, half)
    v, f = boxv(0, 0, 0, L, 0.16, 0.16); A.add('black', [xf((p[0], p[1], zb4 + 1.0 + p[2])) for p in v], f)
    v, f = boxv(0, 0, 0, L, 0.1, 0.1); A.add('black', [xf((p[0], p[1], zb4 + 0.45 + p[2])) for p in v], f)
    n = int(L / 1.6)
    for i in range(n + 1):
        x = -L/2 + L*i/n
        v, f = boxv(0, 0, 0, 0.18, 0.18, 1.2); A.add('black', [xf((x+p[0], p[1], zb4 + p[2])) for p in v], f)
        v, f = boxv(0, 0, 0, 0.24, 0.24, 0.12); A.add('gold', [xf((x+p[0], p[1], zb4 + 1.14 + p[2])) for p in v], f)

# 大棟
A.box('ridge', 0, 0, ztop - 0.15, rx*2 + 0.8, 0.9, 0.75)

# ---------- 鯱（太い胴が弧を描き、尾が反り上がる） ----------
def shachi(xr, s, sc=1.35):
    zb = ztop + 0.55
    # 背骨（ローカル: x は内向きが負、z 上）
    spine = [(-1.05, 0.55), (-0.55, 0.55), (0.05, 0.75), (0.5, 1.3), (0.62, 2.0), (0.42, 2.6), (0.0, 3.0), (-0.45, 3.2)]
    rad = [0.42, 0.62, 0.72, 0.66, 0.52, 0.36, 0.22, 0.12]
    K = 10; V = []; F = []
    for i, ((px, pz), r) in enumerate(zip(spine, rad)):
        a = spine[min(i+1, len(spine)-1)]; b = spine[max(i-1, 0)]
        tx, tz = a[0]-b[0], a[1]-b[1]; L = math.hypot(tx, tz) or 1; tx, tz = tx/L, tz/L
        nx, nz = -tz, tx
        for k in range(K):
            ang = 2*math.pi*k/K
            ox, oy = math.cos(ang)*r, math.sin(ang)*r*0.75
            X = px + nx*ox; Z = pz + nz*ox
            V.append((xr + s*X*sc, oy*sc, zb + Z*sc))
    for i in range(len(spine)-1):
        for k in range(K):
            a = i*K + k; b = i*K + (k+1) % K; F.append((a, b, b+K, a+K))
    F.append(tuple(range(K-1, -1, -1))); F.append(tuple(range((len(spine)-1)*K, len(spine)*K)))
    A.add('gold', V, F)
    # 尾びれ（二股に開く）
    tx0, tz0 = spine[-1]
    for dz, dx in ((0.9, -0.2), (0.25, -1.0)):
        p0 = (xr + s*tx0*sc, zb + tz0*sc); p1 = (xr + s*(tx0 + dx)*sc, zb + (tz0 + dz)*sc); p2 = (xr + s*(tx0 + 0.35)*sc, zb + (tz0 + dz*0.6 + 0.2)*sc)
        Vt = [(p0[0], -0.06, p0[1]), (p1[0], -0.06, p1[1]), (p2[0], -0.06, p2[1]), (p0[0], 0.06, p0[1]), (p1[0], 0.06, p1[1]), (p2[0], 0.06, p2[1])]
        A.add('gold', Vt, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)])
    # 胸びれ・背びれ
    for sy in (-1, 1):
        q = (xr + s*(-0.2)*sc, zb + 0.6*sc)
        A.add('gold', [(q[0], sy*0.45*sc, q[1]), (q[0] + s*0.7*sc, sy*0.95*sc, q[1] + 0.2*sc), (q[0] + s*0.5*sc, sy*0.45*sc, q[1] + 0.45*sc)], [(0, 1, 2) if sy > 0 else (2, 1, 0)])
    q = spine[3]
    A.add('gold', [(xr + s*(q[0]+0.45)*sc, -0.05, zb + (q[1]-0.3)*sc), (xr + s*(q[0]+0.95)*sc, 0, zb + (q[1]+0.1)*sc), (xr + s*(q[0]+0.45)*sc, 0.05, zb + (q[1]+0.4)*sc)], [(0, 1, 2)])
for s in (-1, 1):
    shachi(s * (rx + 0.35), s)

A.flush('detail')
nf = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
result = {'tiers': info, 'ztop': round(ztop, 2), 'faces': nf}
