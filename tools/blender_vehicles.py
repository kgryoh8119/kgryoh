# バス・トラック・新幹線（先頭車と中間車）・街の小物（電柱・自販機・ポスト）を作り、ゲームが読む形で書き出す
# 長さは Y、前は +Y。面の種類は物ごとに決め、ゲーム側の色表で塗る
import bpy, bmesh, math, json, os
OUT = r"C:\Users\kgryo\OneDrive\ドキュメント\Claude\sumucity-models"
colname = 'Vehicles'
col = bpy.data.collections.get(colname)
if col:
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
else:
    col = bpy.data.collections.new(colname); bpy.context.scene.collection.children.link(col)

class B:
    def __init__(s): s.bm = bmesh.new(); s.tag = {}; s.both = set()
    def box(s, cx, cy, z0, sx, sy, sz, t, both=False):
        r = bmesh.ops.create_cube(s.bm, size=1.0)
        for v in r['verts']: v.co.x = cx + v.co.x * sx; v.co.y = cy + v.co.y * sy; v.co.z = z0 + sz / 2 + v.co.z * sz
        for f in set(f for v in r['verts'] for f in v.link_faces): s.tag[f] = t
    def plate(s, pts, t):
        vs = [s.bm.verts.new(p) for p in pts]; f = s.bm.faces.new(vs); s.tag[f] = t; s.both.add(f)
    def cyl(s, cx, cy, z0, r, h, t, n=10, axis='z'):
        A = []; Bv = []
        for k in range(n):
            a = 2 * math.pi * k / n; c, sn = math.cos(a) * r, math.sin(a) * r
            if axis == 'z': A.append((cx + c, cy + sn, z0)); Bv.append((cx + c, cy + sn, z0 + h))
            else: A.append((cx, cy + c, z0 + sn)); Bv.append((cx + h, cy + c, z0 + sn))
        A = [s.bm.verts.new(p) for p in A]; Bv = [s.bm.verts.new(p) for p in Bv]
        for k in range(n): s.tag[s.bm.faces.new((A[k], A[(k + 1) % n], Bv[(k + 1) % n], Bv[k]))] = t
        s.tag[s.bm.faces.new(list(reversed(A)))] = t; s.tag[s.bm.faces.new(Bv)] = t
    def loft(s, rings, tagf, cap=True):
        V = [[s.bm.verts.new(p) for p in r] for r in rings]; n = len(rings[0])
        for j in range(len(V) - 1):
            for i in range(n): s.tag[s.bm.faces.new((V[j + 1][i], V[j + 1][(i + 1) % n], V[j][(i + 1) % n], V[j][i]))] = tagf(j, i)
        if cap: s.tag[s.bm.faces.new(list(reversed(V[0])))] = tagf(0, -1); s.tag[s.bm.faces.new(V[-1])] = tagf(len(V) - 1, -1)
    def done(s, name, x):
        for f in s.bm.faces: f.material_index = s.tag.get(f, 0)
        bmesh.ops.recalc_face_normals(s.bm, faces=[f for f in s.bm.faces if f not in s.both])
        both_idx = set(f.index for f in s.bm.faces if f in s.both)
        me = bpy.data.meshes.new(name); s.bm.to_mesh(me); s.bm.free()
        o = bpy.data.objects.new(name, me); col.objects.link(o); o.location.x = x
        V = [[round(v.co.x, 3), round(v.co.y, 3), round(v.co.z, 3)] for v in me.vertices]; F = []
        for p in me.polygons:
            vs = list(p.vertices)
            for k in range(1, len(vs) - 1):
                F.append([vs[0], vs[k], vs[k + 1], p.material_index])
                if p.index in both_idx: F.append([vs[0], vs[k + 1], vs[k], p.material_index])
        return {'V': V, 'F': F}


# 路線バス（10.5m） 0 車体（色を掛ける） 1 タイヤ 2 窓 3 前照灯 4 尾灯 5 行先表示 6 帯（濃い色）
def bus():
    b = B(); L, W = 10.5, 2.48; h = L / 2
    def sec(y, k):
        hw = W / 2
        return [(-hw, y, 0.35), (hw, y, 0.35), (hw, y, 2.7), (hw * 0.92, y, 2.95 * k + 0.0), (-hw * 0.92, y, 2.95 * k), (-hw, y, 2.7)]
    rings = [sec(h, 0.97), sec(h - 0.15, 1.0), sec(-h + 0.15, 1.0), sec(-h, 0.97)]
    b.loft(rings, lambda j, i: 0)
    for sx in (-1, 1):
        x = sx * (W / 2 + 0.01)
        b.plate([(x, -h + 0.9, 1.35), (x, h - 1.1, 1.35), (x, h - 1.1, 2.45), (x, -h + 0.9, 2.45)] if sx > 0 else [(x, h - 1.1, 1.35), (x, -h + 0.9, 1.35), (x, -h + 0.9, 2.45), (x, h - 1.1, 2.45)], 2)
        b.plate([(x, -h + 0.2, 0.8), (x, h - 0.2, 0.8), (x, h - 0.2, 1.05), (x, -h + 0.2, 1.05)] if sx > 0 else [(x, h - 0.2, 0.8), (x, -h + 0.2, 0.8), (x, -h + 0.2, 1.05), (x, h - 0.2, 1.05)], 6)
    b.plate([(1.15, h + 0.01, 1.0), (-1.15, h + 0.01, 1.0), (-1.1, h + 0.01, 2.45), (1.1, h + 0.01, 2.45)], 2)
    b.plate([(0.8, h + 0.02, 2.5), (-0.8, h + 0.02, 2.5), (-0.8, h + 0.02, 2.8), (0.8, h + 0.02, 2.8)], 5)
    b.plate([(-1.0, -h - 0.01, 1.6), (1.0, -h - 0.01, 1.6), (1.0, -h - 0.01, 2.4), (-1.0, -h - 0.01, 2.4)], 2)
    for sx in (-1, 1):
        b.plate([(sx * 0.7, h + 0.02, 0.5), (sx * 1.0, h + 0.02, 0.5), (sx * 1.0, h + 0.02, 0.68), (sx * 0.7, h + 0.02, 0.68)], 3)
        b.plate([(sx * 0.7, -h - 0.02, 0.6), (sx * 1.0, -h - 0.02, 0.6), (sx * 1.0, -h - 0.02, 0.85), (sx * 0.7, -h - 0.02, 0.85)], 4)
        for y in (h - 2.0, -h + 2.6): b.cyl(W / 2 - 0.28 if sx > 0 else -W / 2 - 0.02, y, 0.48, 0.48, 0.3, 1, 12, 'x')
    return b.done('bus', 0)

# 箱型トラック（7m） 0 運転台（色） 1 タイヤ 2 窓 3 前照灯 4 尾灯 5 荷箱（白） 6 下回り
def truck():
    b = B(); W = 2.3
    b.loft([[(-1.15, 3.5, 0.45), (1.15, 3.5, 0.45), (1.15, 3.5, 1.4), (1.05, 3.35, 2.45), (-1.05, 3.35, 2.45), (-1.15, 3.5, 1.4)],
            [(-1.15, 1.6, 0.45), (1.15, 1.6, 0.45), (1.15, 1.6, 1.4), (1.15, 1.6, 2.5), (-1.15, 1.6, 2.5), (-1.15, 1.6, 1.4)]], lambda j, i: 0)
    b.plate([(1.0, 3.48, 1.55), (-1.0, 3.48, 1.55), (-0.95, 3.38, 2.35), (0.95, 3.38, 2.35)], 2)
    for sx in (-1, 1):
        x = sx * 1.16; b.plate([(x, 1.8, 1.5), (x, 3.2, 1.5), (x, 3.0, 2.3), (x, 1.8, 2.3)] if sx > 0 else [(x, 3.2, 1.5), (x, 1.8, 1.5), (x, 1.8, 2.3), (x, 3.0, 2.3)], 2)
        b.plate([(sx * 0.65, 3.52, 0.6), (sx * 0.95, 3.52, 0.6), (sx * 0.95, 3.52, 0.78), (sx * 0.65, 3.52, 0.78)], 3)
        b.plate([(sx * 0.7, -3.52, 0.65), (sx * 1.0, -3.52, 0.65), (sx * 1.0, -3.52, 0.9), (sx * 0.7, -3.52, 0.9)], 4)
    b.box(0, -1.0, 0.55, 2.45, 5.0, 2.65, 5)
    b.box(0, 0.2, 0.35, 1.6, 6.4, 0.3, 6)
    for y in (2.6, -0.6, -2.5):
        for sx in (-1, 1): b.cyl(0.92 if sx > 0 else -1.2, y, 0.45, 0.45, 0.28, 1, 12, 'x')
    return b.done('truck', 6)

# 新幹線 中間車（25m）と先頭車 0 車体（白） 1 窓の帯 2 青い帯 3 屋根の灰 4 台車 5 前照灯
def shin_section(y, k=1.0, zlow=0.0):
    hw = 1.68 * k
    pts = [(-hw * 0.9, y, 0.3 + zlow), (hw * 0.9, y, 0.3 + zlow), (hw, y, 0.9 + zlow * 0.5), (hw, y, 2.2), (hw * 0.96, y, 2.9)]
    for a in range(1, 6): t = a / 6; pts.append((hw * 0.96 * math.cos(t * math.pi), y, 2.9 + 0.7 * k * math.sin(t * math.pi)))
    pts += [(-hw * 0.96, y, 2.9), (-hw, y, 2.2), (-hw, y, 0.9 + zlow * 0.5)]
    return pts
def shin_tag(n):
    def f(j, i):
        if i < 0: return 0
        if i in (3, n - 2): return 1
        if i in (2, n - 1): return 2
        if 5 <= i <= n - 5: return 3
        return 0
    return f
def shin_mid():
    b = B(); h = 12.4
    ys = [h - k * 2.48 for k in range(11)]
    b.loft([shin_section(y) for y in ys], shin_tag(14))
    for y in (h - 2.6, -h + 2.6): b.box(0, y, 0.0, 2.6, 2.8, 0.45, 4)
    return b.done('shin_mid', 12)
def shin_nose():
    b = B(); h = 12.4
    ys = [-h + k * 1.4 for k in range(9)]            # 後ろ（連結側）から
    ks = [1.0] * len(ys)
    nose = [(ys[-1] + 1.0 * k, 1.0 - 0.11 * k ** 1.25) for k in range(1, 8)]
    ys += [y for (y, _) in nose]; ks += [max(0.12, k) for (_, k) in nose]
    rings = []
    for y, k in zip(ys, ks):
        r = shin_section(y, 1.0)
        if k < 1.0:   # 鼻：横は細く、高さは下から絞る（くちばし形）
            t = 1 - k; r = [(x * (k * 0.75 + 0.25), yy, 0.3 + (z - 0.3) * (k ** 0.9) * (1 - 0.15 * t)) for (x, yy, z) in r]
        rings.append(r)
    b.loft(rings, shin_tag(14))
    for i in range(1, len(rings) - 1):
        pass
    # 運転台の窓（黒）と前照灯
    yw = ys[9] + 0.3
    b.plate([(0.8, yw, 2.1), (-0.8, yw, 2.1), (-0.55, yw + 1.6, 1.75), (0.55, yw + 1.6, 1.75)], 1)
    yl = ys[-2]
    for sx in (-1, 1): b.plate([(sx * 0.18, yl, 0.75), (sx * 0.42, yl - 0.4, 0.8), (sx * 0.42, yl - 0.4, 0.95), (sx * 0.18, yl, 0.9)], 5)
    b.box(0, -h + 2.6, 0.0, 2.6, 2.8, 0.45, 4); b.box(0, 2.0, 0.0, 2.6, 2.8, 0.45, 4)
    return b.done('shin_nose', 18)

# 小物 電柱（0 コンクリ 1 腕木 2 碍子 3 変圧器）・自販機（0 本体 1 見本の窓 2 取り出し口 3 ボタンの列）・郵便ポスト（0 赤 1 黒 2 白い札）
def pole():
    b = B(); b.cyl(0, 0, 0, 0.17, 9.4, 0, 8)
    b.box(0, 0, 8.3, 0.12, 2.0, 0.12, 1); b.box(0, 0, 7.5, 0.1, 1.4, 0.1, 1)
    for y in (-0.85, -0.3, 0.3, 0.85): b.cyl(0, y, 8.42, 0.06, 0.22, 2, 6)
    b.cyl(0.42, 0, 6.0, 0.3, 1.0, 3, 8); b.box(0.22, 0, 6.5, 0.2, 0.12, 0.12, 1)
    b.box(-0.2, 0, 2.8, 0.06, 0.45, 1.0, 2)
    return b.done('pole', 0)
def vending():
    b = B(); b.box(0, 0, 0, 0.92, 0.72, 1.83, 0)
    b.plate([(-0.4, -0.37, 1.05), (0.4, -0.37, 1.05), (0.4, -0.37, 1.7), (-0.4, -0.37, 1.7)], 1)
    b.plate([(-0.3, -0.37, 0.18), (0.3, -0.37, 0.18), (0.3, -0.37, 0.42), (-0.3, -0.37, 0.42)], 2)
    for z in (0.98, 1.4): b.plate([(-0.4, -0.371, z), (0.4, -0.371, z), (0.4, -0.371, z + 0.04), (-0.4, -0.371, z + 0.04)], 3)
    b.box(0.3, -0.37, 0.7, 0.18, 0.04, 0.22, 3)
    return b.done('vending', 2)
def postbox():
    b = B(); b.cyl(0, 0, 0, 0.12, 0.5, 1, 8); b.cyl(0, 0, 0.5, 0.3, 0.75, 0, 12)
    b.bm.verts.ensure_lookup_table()
    b.cyl(0, 0, 1.25, 0.33, 0.06, 0, 12); b.cyl(0, 0, 1.31, 0.24, 0.06, 0, 12)
    b.box(0, -0.29, 1.0, 0.28, 0.06, 0.05, 1); b.box(0, -0.29, 0.62, 0.22, 0.04, 0.16, 2)
    return b.done('postbox', 4)

out = {'bus': bus(), 'truck': truck(), 'shin_mid': shin_mid(), 'shin_nose': shin_nose(), 'pole': pole(), 'vending': vending(), 'postbox': postbox()}
json.dump(out, open(os.path.join(OUT, 'vehicles.json'), 'w'), separators=(',', ':'))
result = {k: (len(v['V']), len(v['F'])) for k, v in out.items()}
