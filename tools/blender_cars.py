# 車（セダン・ミニバン・軽自動車）を Blender で作り、ゲームが読む形で書き出す。前は +Y
# 面の種類: 0 車体（色を付ける所） 1 タイヤ 2 樹脂（バンパー・下回り） 3 前照灯 4 尾灯 5 窓ガラス 6 ホイール
import bpy, bmesh, math, json, os
OUT = r"C:\Users\kgryo\OneDrive\ドキュメント\Claude\sumucity-models"
colname = 'Cars'
col = bpy.data.collections.get(colname)
if col:
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
else:
    col = bpy.data.collections.new(colname); bpy.context.scene.collection.children.link(col)
CC = [(0.9, 0.9, 0.92), (0.06, 0.06, 0.06), (0.2, 0.2, 0.22), (1, 0.97, 0.85), (0.8, 0.08, 0.06), (0.1, 0.14, 0.18), (0.6, 0.62, 0.65)]

def car(bm, tag, L, W, prof, glass, wb, wr, wheelw=0.24):
    """prof: [(y, z_bottom, z_belt, z_roof, half_w_scale_roof)] 前から後ろへ。glass: (y0, y1) 窓のある範囲"""
    rings = []
    for (y, zb, zbelt, zr, rs) in prof:
        hw = W / 2; hr = hw * rs
        rings.append([(-hw * 0.96, y, zb), (hw * 0.96, y, zb), (hw, y, zb + 0.12), (hw, y, zbelt), (hr, y, zr), (-hr, y, zr), (-hw, y, zbelt), (-hw, y, zb + 0.12)])
    V = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    for j in range(len(V) - 1):
        ya, yb = prof[j][0], prof[j + 1][0]; ym = (ya + yb) / 2
        for i in range(n):
            f = bm.faces.new((V[j][i], V[j][(i + 1) % n], V[j + 1][(i + 1) % n], V[j + 1][i]))
            # 窓（ベルトより上の側面と、前後の傾いた面）
            upper = i in (3, 4, 5) and min(V[j][i].co.z, V[j][(i + 1) % n].co.z) >= prof[j][2] - 0.01 and i != 4
            roofband = i == 4
            if (upper and glass[0] <= ym <= glass[1]) or (roofband and prof[j][3] > prof[j][2] + 0.05 and abs(prof[j][3] - prof[j + 1][3]) > 0.12): tag[f] = 5
            elif i == 0: tag[f] = 2
            else: tag[f] = 0
    tag[bm.faces.new(list(reversed(V[0])))] = 0; tag[bm.faces.new(V[-1])] = 0
    # 前面の窓ガラス帯（フロント・リア）は傾いた屋根面で判定済み。ライトとバンパー
    yf, yr = prof[0][0], prof[-1][0]
    def plate(y, z0, z1, x0, x1, t, out):
        e = 0.01 * out
        vs = [bm.verts.new((x0, y + e, z0)), bm.verts.new((x1, y + e, z0)), bm.verts.new((x1, y + e, z1)), bm.verts.new((x0, y + e, z1))]
        tag[bm.faces.new(vs if out > 0 else list(reversed(vs)))] = t
    for sx in (-1, 1):
        plate(yf, prof[0][1] + 0.38, prof[0][1] + 0.52, sx * W * 0.28, sx * W * 0.44, 3, 1) if sx > 0 else plate(yf, prof[0][1] + 0.38, prof[0][1] + 0.52, sx * W * 0.44, sx * W * 0.28, 3, 1)
        plate(yr, prof[-1][1] + 0.40, prof[-1][1] + 0.55, sx * W * 0.44, sx * W * 0.26, 4, -1) if sx > 0 else plate(yr, prof[-1][1] + 0.40, prof[-1][1] + 0.55, sx * W * 0.26, sx * W * 0.44, 4, -1)
    plate(yf, prof[0][1] + 0.05, prof[0][1] + 0.25, -W * 0.47, W * 0.47, 2, 1); plate(yr, prof[-1][1] + 0.05, prof[-1][1] + 0.25, W * 0.47, -W * 0.47, 2, -1)
    # タイヤ
    for wy in wb:
        for sx in (-1, 1):
            x0 = sx * (W / 2 - wheelw * 0.6); x1 = x0 + sx * wheelw; segs = 12
            A = [bm.verts.new((x0, wy + math.cos(2 * math.pi * k / segs) * wr, wr + math.sin(2 * math.pi * k / segs) * wr)) for k in range(segs)]
            B = [bm.verts.new((x1, wy + math.cos(2 * math.pi * k / segs) * wr, wr + math.sin(2 * math.pi * k / segs) * wr)) for k in range(segs)]
            for k in range(segs):
                f = bm.faces.new((A[k], A[(k + 1) % segs], B[(k + 1) % segs], B[k])) if sx > 0 else bm.faces.new((B[k], B[(k + 1) % segs], A[(k + 1) % segs], A[k])); tag[f] = 1
            C = [bm.verts.new((x1 + sx * 0.005, wy + math.cos(2 * math.pi * k / segs) * wr * 0.6, wr + math.sin(2 * math.pi * k / segs) * wr * 0.6)) for k in range(segs)]
            f = bm.faces.new(C if sx > 0 else list(reversed(C))); tag[f] = 6

def make(name, fn, x):
    bm = bmesh.new(); tag = {}
    fn(bm, tag)
    for f in bm.faces: f.material_index = tag.get(f, 0)
    body = [f for f in bm.faces if f.material_index in (0, 5)]
    bmesh.ops.recalc_face_normals(bm, faces=body)
    me = bpy.data.meshes.new('car_' + name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('car_' + name, me); col.objects.link(o); o.location.x = x
    ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for p in me.polygons:
        c = CC[p.material_index] if p.material_index else (0.75, 0.15, 0.12)
        for li in p.loop_indices: ca.data[li].color = (*c, 1)
    V = [[round(v.co.x, 3), round(v.co.y, 3), round(v.co.z, 3)] for v in me.vertices]
    F = []
    for p in me.polygons:
        vs = list(p.vertices)
        for k in range(1, len(vs) - 1):
            F.append([vs[0], vs[k], vs[k + 1], p.material_index])
            if p.material_index not in (0, 5): F.append([vs[0], vs[k + 1], vs[k], p.material_index])  # 板や部品は両面
    return {'V': V, 'F': F}

def sedan(bm, tag):
    L = 4.3; h = L / 2
    prof = [(h, 0.18, 0.62, 0.66, 0.92), (h - 0.25, 0.14, 0.74, 0.78, 0.94), (h - 1.0, 0.14, 0.84, 0.88, 0.96), (h - 1.45, 0.14, 0.86, 1.38, 0.8), (0.05, 0.14, 0.86, 1.44, 0.8),
            (-0.75, 0.14, 0.86, 1.42, 0.8), (-1.3, 0.14, 0.86, 0.98, 0.92), (-h + 0.2, 0.16, 0.8, 0.86, 0.94), (-h, 0.22, 0.7, 0.74, 0.9)]
    car(bm, tag, L, 1.74, prof, (-1.2, 0.85), (1.35, -1.35), 0.33)
def minivan(bm, tag):
    L = 4.7; h = L / 2
    prof = [(h, 0.2, 0.66, 0.7, 0.92), (h - 0.3, 0.16, 0.8, 0.86, 0.95), (h - 0.85, 0.16, 0.92, 1.25, 0.9), (h - 1.3, 0.16, 0.95, 1.78, 0.88), (0.0, 0.16, 0.95, 1.84, 0.9),
            (-h + 0.35, 0.16, 0.95, 1.82, 0.9), (-h + 0.08, 0.2, 0.92, 1.74, 0.9), (-h, 0.26, 0.85, 1.6, 0.88)]
    car(bm, tag, L, 1.8, prof, (-h + 0.2, 1.1), (1.5, -1.45), 0.34)
def kei(bm, tag):
    L = 3.4; h = L / 2
    prof = [(h, 0.18, 0.62, 0.66, 0.92), (h - 0.2, 0.15, 0.76, 0.82, 0.95), (h - 0.55, 0.15, 0.86, 1.2, 0.92), (h - 0.95, 0.15, 0.9, 1.68, 0.9), (-0.2, 0.15, 0.9, 1.72, 0.92),
            (-h + 0.12, 0.17, 0.9, 1.7, 0.92), (-h, 0.22, 0.85, 1.6, 0.9)]
    car(bm, tag, L, 1.48, prof, (-h + 0.15, 0.85), (1.15, -1.1), 0.3, 0.2)

out = {'sedan': make('sedan', sedan, -6), 'minivan': make('minivan', minivan, 0), 'kei': make('kei', kei, 6)}
json.dump(out, open(os.path.join(OUT, 'cars.json'), 'w'), separators=(',', ':'))
result = {k: (len(v['V']), len(v['F'])) for k, v in out.items()}
