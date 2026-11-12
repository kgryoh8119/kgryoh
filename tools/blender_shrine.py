import bpy, math, numpy as np
exec(bpy.data.texts['lmlib.py'].as_string(), globals())
begin('Shrine', 'shr')
def tile():
    S, P = 256, 32; y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    cx = (x % P) / P; cy = (y % P) / P; d = np.abs(cx - 0.5) / 0.2
    maru = np.sqrt(np.clip(1 - d * d, 0, 1)); lip = (1 - cy) ** 2 * 0.35
    h = np.maximum(maru * 0.9 + lip * 0.6, 0.12 * (1 - np.cos(2 * np.pi * cx)) + lip); edge = np.where(cy < 0.05, 0.7, 1.0)
    rgb = np.array([0x5f, 0x94, 0x83]) / 255 * ((0.62 + 0.45 * h) * edge)[..., None]
    return to_img('tileC', rgb), to_img('tileN', nrm(h * edge, 3.0), True)
# 天守と同じ材質「copperRoof」を使う（ゲーム側で同じ瓦の模様が貼られる）
if bpy.data.materials.get('copperRoof'): S_['M']['copperRoof'] = bpy.data.materials['copperRoof']
else:
    TC, TN = tile(); M_ = mat('copperRoof', 0x5f9483, .55, .15, (TC, TN)); M_.name = 'copperRoof'; S_['M']['copperRoof'] = M_
mat('soffit', 0x9a3c24, .7)
mat('ridge', 0x497a6b, .55, .2)
mat('vermilion', 0xc2452b, .65)
mat('plaster', 0xf1ece0, .85)
mat('darkWood', 0x3a2a20, .8)
mat('stone', 0xa8a194, .9)
mat('wood', 0x9a7a55, .8)
mat('gold', 0xd2a843, .35, 1)
mat('straw', 0xc9b27a, .9)
mat('shide', 0xfafaf6, .8)
A = Acc()
# 基壇・床・縁
A.box('stone', 0, 0, 0, 19, 16, 0.8)
for k in range(4): A.box('stone', 0, -8 - 0.7 * k - 0.35, 0, 7, 0.7, 0.8 - 0.2 * k)
A.box('darkWood', 0, 0, 0.8, 12.6, 8.6, 1.0)
A.box('wood', 0, 0, 1.8, 15, 11, 0.22)
for face in range(4):
    L = 15 if face % 2 == 0 else 11; half = (11 if face % 2 == 0 else 15) / 2
    xf = face_xf(face, half - 0.1)
    for seg in ((-L / 2, -2.2), (2.2, L / 2)) if face == 0 else ((-L / 2, L / 2),):
        a, b = seg; A.xbox('vermilion', xf, (a + b) / 2, 0, 2.75, b - a, 0.14, 0.14); A.xbox('vermilion', xf, (a + b) / 2, 0, 2.35, b - a, 0.1, 0.1)
        n = max(1, int((b - a) / 1.4))
        for i in range(n + 1): A.xbox('vermilion', xf, a + (b - a) * i / n, 0, 2.0, 0.14, 0.14, 0.9)
        A.xbox('gold', xf, a, 0, 2.86, 0.22, 0.22, 0.14); A.xbox('gold', xf, b, 0, 2.86, 0.22, 0.22, 0.14)
# 本体：白壁と朱の柱、正面は格子戸
W, D, Z0, H = 11, 7, 2.02, 4.2
A.box('plaster', 0, 0, Z0, W - 0.2, D - 0.2, H)
for i in range(5):
    for j in range(3):
        x = -W / 2 + W * i / 4; y = -D / 2 + D * j / 2
        if 0 < i < 4 and j == 1: continue
        A.bar('vermilion', (x, y, Z0), (x, y, Z0 + H + 0.4), 0.26, 8)
for i in range(4):
    x0 = -W / 2 + W * i / 4; x1 = x0 + W / 4; xc = (x0 + x1) / 2
    A.box('darkWood', xc, -D / 2 - 0.02, Z0 + 0.15, W / 4 - 0.6, 0.08, H - 0.8)
    for k in range(7): A.box('vermilion', x0 + 0.4 + (W / 4 - 0.8) * k / 6, -D / 2 - 0.08, Z0 + 0.15, 0.08, 0.08, H - 0.8)
    for k in range(4): A.box('vermilion', xc, -D / 2 - 0.09, Z0 + 0.4 + k * (H - 1.2) / 3, W / 4 - 0.6, 0.08, 0.08)
for zz in (Z0 + H - 0.55, Z0 + 0.9):
    A.box('vermilion', 0, 0, zz, W + 0.25, D + 0.25, 0.3)
for i in range(5):
    for sy in (-1, 1): A.box('gold', -W / 2 + W * i / 4, sy * (D / 2 + 0.14), Z0 + H - 0.55, 0.32, 0.06, 0.3)
# 組物
for face in range(4):
    L = W if face % 2 == 0 else D; xf = face_xf(face, (D if face % 2 == 0 else W) / 2)
    for i in range(int(L / 1.2) + 1):
        A.xbox('vermilion', xf, -L / 2 + L * i / int(L / 1.2), -0.4, Z0 + H, 0.3, 1.0, 0.3)
# 入母屋の屋根（棟は x 方向）
ZR = Z0 + H + 0.45
rr = jroof(A, W, D, ZR, 6.5, 0.6, 2.8, 4.0, 0.9, m='copperRoof', ridge='ridge', R=7, N=12, thick=0.5)
zt = rr[-1][0][2]
# 妻（三角）を左右に
for sx in (-1, 1):
    xf = face_xf(1 if sx > 0 else 3, 3.35)
    zb = ZR + 1.9
    A.add('gold', [xf((-3.0, 0, zb)), xf((3.0, 0, zb)), xf((0, 0, zt + 0.25))], [(0, 1, 2)])
    A.add('plaster', [xf((-2.6, -0.05, zb + 0.25)), xf((2.6, -0.05, zb + 0.25)), xf((0, -0.05, zt - 0.25))], [(0, 1, 2)])
    A.xbox('vermilion', xf, 0, -0.08, zb + 0.6, 3.6, 0.1, 0.18)
    A.xbox('gold', xf, 0, -0.12, zt - 1.3, 0.7, 0.12, 0.9)
# 大棟・千木・鰹木
A.box('ridge', 0, 0, zt - 0.1, 7.4, 0.9, 0.7)
A.box('gold', -3.75, 0, zt - 0.1, 0.3, 0.95, 0.75); A.box('gold', 3.75, 0, zt - 0.1, 0.3, 0.95, 0.75)
for sx in (-1, 1):
    x = sx * 3.5
    for sy in (-1, 1): A.bar('darkWood', (x, 0, zt + 0.4), (x + sx * 1.0, sy * 1.3, zt + 2.6), 0.14, 4)
for i in range(5):
    A.bar('darkWood', (-2.4 + i * 1.2, -0.0, zt + 0.75), (-2.4 + i * 1.2, 0.0, zt + 0.76), 0.3, 8) if False else None
    A.bar('darkWood', (-2.4 + i * 1.2, -0.55, zt + 0.85), (-2.4 + i * 1.2, 0.55, zt + 0.85), 0.25, 8)
    A.bar('gold', (-2.4 + i * 1.2, -0.62, zt + 0.85), (-2.4 + i * 1.2, -0.55, zt + 0.85), 0.27, 8)
    A.bar('gold', (-2.4 + i * 1.2, 0.55, zt + 0.85), (-2.4 + i * 1.2, 0.62, zt + 0.85), 0.27, 8)
# 向拝（正面に延びる屋根）と柱
y0, y1, zA, zB = -(D / 2 + 2.2), -(D / 2 + 6.4), ZR + 0.7, ZR - 1.1
A.add('copperRoof', [(-3.6, y0, zA), (3.6, y0, zA), (3.9, y1, zB), (-3.9, y1, zB)], [(0, 1, 2, 3)], [(0, 0), (7.2 / 4.8, 0), (7.8 / 4.8, 4.5 / 4.8), (0, 4.5 / 4.8)])
A.add('soffit', [(-3.6, y0, zA - 0.35), (3.6, y0, zA - 0.35), (3.9, y1, zB - 0.35), (-3.9, y1, zB - 0.35)], [(3, 2, 1, 0)])
A.add('vermilion', [(-3.9, y1, zB), (3.9, y1, zB), (3.9, y1, zB - 0.35), (-3.9, y1, zB - 0.35)], [(0, 1, 2, 3)])
A.box('gold', 0, y1 - 0.05, zB - 0.4, 7.9, 0.1, 0.12)
for x in (-2.9, 2.9):
    A.bar('vermilion', (x, y1 + 0.6, 0.8), (x, y1 + 0.6, zB - 0.3), 0.24, 8)
    A.box('stone', x, y1 + 0.6, 0.8, 0.8, 0.8, 0.3)
A.box('vermilion', 0, y1 + 0.6, zB - 0.9, 6.4, 0.3, 0.35)
for k in range(5): A.box('wood', 0, -(D / 2 + 1.6) - k * 0.55, 0.8, 4.2, 0.55, 1.2 - k * 0.22)
# しめ縄と紙垂、賽銭箱、鈴
pts = [(-2.6 + 5.2 * t, y1 + 0.55, zB - 1.25 - 0.55 * math.sin(math.pi * t)) for t in [i / 8 for i in range(9)]]
for i in range(8): A.bar('straw', pts[i], pts[i + 1], 0.3 - 0.12 * abs(i - 3.5) / 3.5, 8)
for t in (0.25, 0.5, 0.75):
    p = pts[int(t * 8)]
    for k in range(3): A.box('shide', p[0] + (0.12 if k % 2 else -0.12), p[1] - 0.05, p[2] - 0.6 - k * 0.4, 0.3, 0.04, 0.38)
A.box('darkWood', 0, -(D / 2 + 1.2), 1.0, 2.2, 1.0, 1.0); A.box('gold', 0, -(D / 2 + 1.2), 2.0, 2.3, 1.05, 0.08)
lathe(A, 'gold', [(0.01, zB - 1.5), (0.35, zB - 1.25), (0.01, zB - 0.95)], n=10, cx=0, cy=y1 + 1.2)
A.bar('straw', (0, y1 + 1.2, zB - 1.5), (0, y1 + 1.2, 1.4), 0.07, 4)
A.flush()
view((0, -2, 5), 40, 72, -32)
result = {'faces': sum(len(o.data.polygons) for o in S_['col'].objects), 'top': round(zt + 2.6, 1)}
