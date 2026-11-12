# 積雲（3 種）を Blender で作り、面ごとの明るさ（上は白く、底は青みがかった灰）と一緒に書き出す。大きさは 1 = 約 100m
import bpy, bmesh, math, random, json, os
from mathutils import Vector, noise
OUT = r"C:\Users\kgryo\OneDrive\ドキュメント\Claude\sumucity-models"
colname = 'Clouds'
col = bpy.data.collections.get(colname)
if col:
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
else:
    col = bpy.data.collections.new(colname); bpy.context.scene.collection.children.link(col)
def cloud(seed, n, spread, height):
    rnd = random.Random(seed); bm = bmesh.new()
    puffs = []
    for i in range(n):
        x = rnd.uniform(-spread, spread); y = rnd.uniform(-spread * 0.55, spread * 0.55)
        d = 1 - min(1, math.hypot(x / spread, y / (spread * 0.55)))
        r = 0.55 + 0.75 * d * rnd.uniform(0.7, 1.1); z = r * 0.35 + height * d * rnd.uniform(0.3, 1.0)
        puffs.append((x, y, z, r))
    for (x, y, z, r) in puffs:
        res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        for v in res['verts']:
            p = v.co.copy(); k = 1 + 0.18 * noise.noise(p * 2.3 + Vector((x, y, seed)))
            zz = p.z * r * k
            if z + zz < 0: zz = -z + (z + zz) * 0.15          # 底は平らに
            v.co = Vector((x + p.x * r * k, y + p.y * r * k, z + zz))
    me = bpy.data.meshes.new('cloud%d' % seed); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('cloud%d' % seed, me); col.objects.link(o)
    zs = [v.co.z for v in me.vertices]; z1 = max(zs)
    V = [[round(v.co.x, 2), round(v.co.y, 2), round(v.co.z, 2)] for v in me.vertices]; F = []
    for p in me.polygons:
        c = p.center; h = max(0, c.z) / z1; nz = p.normal.z
        sh = 0.62 + 0.3 * h + 0.18 * max(0, nz) - 0.12 * max(0, -nz)
        vs = list(p.vertices)
        for k in range(1, len(vs) - 1): F.append([vs[0], vs[k], vs[k + 1], round(min(1.1, sh), 2)])
    return {'V': V, 'F': F}
out = {'a': cloud(1, 9, 2.6, 1.3), 'b': cloud(2, 6, 1.8, 1.0), 'c': cloud(3, 12, 3.4, 1.6)}
json.dump(out, open(os.path.join(OUT, 'clouds.json'), 'w'), separators=(',', ':'))
result = {k: (len(v['V']), len(v['F'])) for k, v in out.items()}
