# 通勤電車の 1 両（長さ 19m）を Blender で作り、ゲームが読む形で書き出す。長さは Y、前は +Y
# 面の種類: 0 車体（路線の色を掛ける） 1 窓ガラス 2 屋根 3 台車・下回り 4 扉の線 5 前面の黒い顔 6 パンタグラフ
import bpy, bmesh, math, json, os
OUT = r"C:\Users\kgryo\OneDrive\ドキュメント\Claude\sumucity-models"
colname = 'Train'
col = bpy.data.collections.get(colname)
if col:
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
else:
    col = bpy.data.collections.new(colname); bpy.context.scene.collection.children.link(col)
bm = bmesh.new(); tag = {}
L, W = 19.0, 2.9; h = L / 2; Z0, Zw0, Zw1, Zr = 1.0, 2.2, 3.1, 3.55
def sec(y, k=1.0):
    """断面（下→側→屋根のアーチ）。k<1 で前後の端を細く"""
    hw = W / 2 * k; pts = [(-hw * 0.94, y, Z0), (hw * 0.94, y, Z0), (hw, y, Z0 + 0.25), (hw, y, Zw0), (hw, y, Zw1), (hw * 0.98, y, Zr - 0.15)]
    for a in range(1, 6): t = a / 6; pts.append((hw * 0.98 * math.cos(t * math.pi), y, Zr - 0.15 + 0.35 * math.sin(t * math.pi)))
    pts += [(-hw * 0.98, y, Zr - 0.15), (-hw, y, Zw1), (-hw, y, Zw0), (-hw, y, Z0 + 0.25)]
    return pts
ys = [h, h - 0.35, h - 0.9] + [h - 0.9 - (L - 1.8) * i / 12 for i in range(1, 12)] + [-h + 0.9, -h + 0.35, -h]
ks = [0.9, 0.97] + [1.0] * (len(ys) - 4) + [0.97, 0.9]
R = [[bm.verts.new(p) for p in sec(y, k)] for y, k in zip(ys, ks)]
n = len(R[0])
doors = [h - 3.0, h - 7.3, -h + 7.3, -h + 3.0]
for j in range(len(R) - 1):
    ym = (ys[j] + ys[j + 1]) / 2
    for i in range(n):
        f = bm.faces.new((R[j + 1][i], R[j + 1][(i + 1) % n], R[j][(i + 1) % n], R[j][i]))
        if i in (3, n - 3) and abs(ym) < h - 0.8:
            tag[f] = 4 if any(abs(ym - d) < 0.7 for d in doors) else 1      # 窓の帯（扉の所は扉）
        elif 5 <= i <= n - 5: tag[f] = 2
        elif i == 0: tag[f] = 3
        else: tag[f] = 0
f = bm.faces.new(list(reversed(R[0]))); tag[f] = 0
f = bm.faces.new(R[-1]); tag[f] = 0
# 前後の黒い顔（窓）
for s in (1, -1):
    y = s * (h + 0.02)
    vs = [bm.verts.new((x, y, z)) for (x, z) in [(-1.15, Zw0 - 0.2), (1.15, Zw0 - 0.2), (1.1, Zw1 + 0.05), (-1.1, Zw1 + 0.05)]]
    f = bm.faces.new(vs if s < 0 else list(reversed(vs))) if False else bm.faces.new(list(reversed(vs)) if s > 0 else vs); tag[f] = 5
# 台車とスカート
def box(cx, cy, z0, sx, sy, sz, t):
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r['verts']: v.co.x = cx + v.co.x * sx; v.co.y = cy + v.co.y * sy; v.co.z = z0 + sz / 2 + v.co.z * sz
    for fc in set(fc for v in r['verts'] for fc in v.link_faces): tag[fc] = t
for by in (h - 3.2, -h + 3.2):
    box(0, by, 0.25, 2.3, 2.6, 0.55, 3)
    for wy in (by - 0.95, by + 0.95):
        for sx in (-1, 1): box(sx * 0.78, wy, 0.0, 0.18, 0.86, 0.86, 3)
box(0, 0, 0.6, 2.5, L - 7.0, 0.42, 3)
box(0, h - 9.0 + 9.0 - 4.5, Zr + 0.18, 1.2, 1.2, 0.2, 6)          # パンタグラフの台
for s in (-1, 1): box(0, h - 4.5 + s * 0.35, Zr + 0.55, 1.6, 0.06, 0.06, 6)
me = bpy.data.meshes.new('train_car')
for fc in bm.faces: fc.material_index = tag.get(fc, 0)
bmesh.ops.recalc_face_normals(bm, faces=[fc for fc in bm.faces if fc.material_index in (0, 1, 2, 4)])
bm.to_mesh(me); bm.free()
o = bpy.data.objects.new('train_car', me); col.objects.link(o)
V = [[round(v.co.x, 3), round(v.co.y, 3), round(v.co.z, 3)] for v in me.vertices]
F = []
for p in me.polygons:
    vs = list(p.vertices)
    for k in range(1, len(vs) - 1):
        F.append([vs[0], vs[k], vs[k + 1], p.material_index])
        if p.material_index in (5, 6): F.append([vs[0], vs[k + 1], vs[k], p.material_index])
json.dump({'car': {'V': V, 'F': F}}, open(os.path.join(OUT, 'train.json'), 'w'), separators=(',', ':'))
result = {'v': len(V), 'f': len(F)}
