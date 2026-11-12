import bpy, math
exec(bpy.data.texts['lmlib.py'].as_string(), globals())
begin('Lighthouse', 'lgh')
mat('plaster', 0xf6f5f0, .7)
mat('stone', 0x9a9488, .9)
mat('iron', 0x2b2e31, .45, .6)
mat('dome', 0x3f4a45, .4, .6)
mat('window', 0x7fa4b8, .1, .2)
mat('lamp', 0xfff3c0, .2, 0, emit=(0xfff0c0, 6.0))
mat('beam', 0xfff6d8, .2, 0, emit=(0xfff4d0, 3.0))
mat('gold', 0xc9a24a, .35, 1)
mat('door', 0x2f3f5a, .5)
A = Acc()
# 土台（八角の石の基壇と階段）
lathe(A, 'stone', [(5.2, 0), (5.2, 1.2), (4.6, 1.2)], n=8, a0=math.pi / 8, a1=math.pi / 8 + 2 * math.pi)
A.add('stone', [(math.cos(math.pi / 8 + k * math.pi / 4) * 4.6, math.sin(math.pi / 8 + k * math.pi / 4) * 4.6, 1.2) for k in range(8)], [tuple(range(8))])
# 塔（上に向かって細くなる白い円筒）
H = 21.0
prof = [(3.4, 1.2), (3.25, 3), (3.0, 8), (2.75, 14), (2.5, 19), (2.45, H)]
lathe(A, 'plaster', prof, n=20)
lathe(A, 'plaster', [(2.45, H), (3.3, H + 0.3), (3.6, H + 0.6)], n=20)
A.box('door', 0, -3.38, 1.2, 1.4, 0.3, 2.4); lathe(A, 'plaster', [(0.9, 3.6), (0.9, 3.8)], n=12, cx=0, cy=-3.45) if False else None
for z in (6, 10.5, 15):
    r = 3.4 - (z - 1.2) * 0.048
    A.box('window', 0, -r + 0.05, z, 0.7, 0.2, 1.1); A.box('window', 0, r - 0.05, z + 2, 0.7, 0.2, 1.1)
# 展望デッキ（ギャラリー）と手すり
lathe(A, 'iron', [(3.9, H + 0.6), (3.9, H + 0.85)], n=20)
A.add('iron', [(math.cos(2 * math.pi * k / 20) * 3.9, math.sin(2 * math.pi * k / 20) * 3.9, H + 0.85) for k in range(20)], [tuple(range(20))])
for k in range(20):
    a = 2 * math.pi * k / 20
    A.bar('iron', (math.cos(a) * 3.8, math.sin(a) * 3.8, H + 0.85), (math.cos(a) * 3.8, math.sin(a) * 3.8, H + 2.0), 0.05, 4)
lathe(A, 'iron', [(3.8, H + 1.95), (3.85, H + 2.05)], n=20)
# 灯室：鉄の枠＋ガラス、中にレンズの灯り
lathe(A, 'iron', [(2.3, H + 0.85), (2.3, H + 1.6)], n=10)
lathe(A, 'window', [(2.2, H + 1.6), (2.2, H + 4.4)], n=10)
for k in range(10):
    a = 2 * math.pi * k / 10
    A.bar('iron', (math.cos(a) * 2.25, math.sin(a) * 2.25, H + 1.6), (math.cos(a) * 2.25, math.sin(a) * 2.25, H + 4.4), 0.07, 4)
lathe(A, 'lamp', [(0.01, H + 2.0), (0.9, H + 2.4), (1.0, H + 3.0), (0.9, H + 3.6), (0.01, H + 4.0)], n=12)
# 屋根（ドーム）、換気の玉、避雷針
lathe(A, 'dome', [(2.6, H + 4.4), (2.4, H + 4.9), (1.8, H + 5.6), (0.9, H + 6.1), (0.4, H + 6.3)], n=16)
lathe(A, 'dome', [(0.01, H + 6.2), (0.55, H + 6.5), (0.6, H + 6.9), (0.01, H + 7.3)], n=10)
A.bar('iron', (0, 0, H + 7.2), (0, 0, H + 9.0), 0.05, 4)
A.flush()
# 回る光の帯（夜だけ見える。原点＝灯の中心）
B = Acc()
for sgn in (-1, 1):
    L = 70.0; n = 8; V = []; F = []
    for i in range(n):
        a = 2 * math.pi * i / n
        V.append((sgn * 0.8, math.cos(a) * 0.6, math.sin(a) * 0.6))
        V.append((sgn * L, math.cos(a) * 7.0, math.sin(a) * 4.0))
    for i in range(n):
        j = (i + 1) % n; F.append((i * 2, j * 2, j * 2 + 1, i * 2 + 1))
    B.add('beam', V, F)
obj_at('spin_beam', B, (0, 0, H + 3.0))
view((0, 0, 14), 60, 80, -25)
result = {'faces': sum(len(o.data.polygons) for o in S_['col'].objects), 'top': H + 9}
