import bpy, math, numpy as np
exec(bpy.data.texts['lmlib.py'].as_string(), globals())
begin('Tower', 'twr')
mat('lightup_orange', 0xe2502a, .55, .2)
mat('lightup_white', 0xf2efe8, .6, .1)
mat('window', 0x3a4a58, .15, .4)
mat('deck', 0xe9e7e2, .6)
mat('steel', 0x7d8389, .5, .6)
mat('lamp_red', 0xff3020, .3, 0, emit=(0xff2010, 2.0))
A = Acc()
H0, HD, HT = 0.0, 50.0, 88.0          # 地面・大展望台・特別展望台
def half(z): return 19.0 * math.exp(-z / 24.0) + 1.6
def col(z, band=9.0): return 'lightup_orange' if int(z // band) % 2 == 0 else 'lightup_white'
LV = [0, 4, 8.5, 13.5, 19, 25, 31.5, 38.5, 46, 50, 55, 61, 67, 73.5, 80, 86, 88]
C = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
# 脚（4 本の主材）と水平材・X の筋交い
for i in range(len(LV) - 1):
    z0, z1 = LV[i], LV[i + 1]; h0, h1 = half(z0), half(z1); m = col((z0 + z1) / 2)
    r = 0.75 - 0.5 * (z0 / HT)
    for (sx, sy) in C:
        A.bar(m, (sx * h0, sy * h0, z0), (sx * h1, sy * h1, z1), r, 6)
        # 脚の内側の副材（脚を太い格子に見せる）
        if z0 < 46:
            ih0, ih1 = h0 - 1.6, h1 - 1.2
            A.bar(m, (sx * ih0, sy * h0, z0), (sx * ih1, sy * h1, z1), r * 0.5, 4)
            A.bar(m, (sx * h0, sy * ih0, z0), (sx * h1, sy * ih1, z1), r * 0.5, 4)
    for k in range(4):
        (ax, ay), (bx, by) = C[k], C[(k + 1) % 4]
        A.bar(m, (ax * h1, ay * h1, z1), (bx * h1, by * h1, z1), r * 0.6, 4)
        A.bar(m, (ax * h0, ay * h0, z0), (bx * h1, by * h1, z1), r * 0.45, 4)
        A.bar(m, (bx * h0, by * h0, z0), (ax * h1, ay * h1, z1), r * 0.45, 4)
# 足元のアーチ（各面）
for k in range(4):
    (ax, ay), (bx, by) = C[k], C[(k + 1) % 4]
    pts = []
    for j in range(13):
        t = j / 12; a = math.pi * t
        zz = 2 + math.sin(a) * 12.5
        hh = half(zz)
        x = (ax + (bx - ax) * t) * hh; y = (ay + (by - ay) * t) * hh
        # 面上の点（アーチの両端は脚に付く）
        pts.append((x, y, zz))
    for j in range(12): A.bar('lightup_orange', pts[j], pts[j + 1], 0.55, 6)
# 大展望台（2 層、八角形）
def octo(m, z0, z1, r, n=8):
    lathe(A, m, [(r, z0), (r, z1)], n=n, a0=math.pi / 8, a1=math.pi / 8 + 2 * math.pi)
    A.add(m, [(math.cos(math.pi / 8 + 2 * math.pi * i / n) * r, math.sin(math.pi / 8 + 2 * math.pi * i / n) * r, z1) for i in range(n)], [tuple(range(n))])
    A.add(m, [(math.cos(math.pi / 8 + 2 * math.pi * i / n) * r, math.sin(math.pi / 8 + 2 * math.pi * i / n) * r, z0) for i in range(n)], [tuple(range(n - 1, -1, -1))])
octo('deck', HD - 1.0, HD, 11.5)
octo('window', HD, HD + 3.0, 11.0)
octo('deck', HD + 3.0, HD + 3.6, 11.8)
octo('window', HD + 3.6, HD + 6.2, 10.6)
octo('deck', HD + 6.2, HD + 7.0, 11.2)
for i in range(16):
    a = 2 * math.pi * i / 16
    for z0, z1, r in ((HD, HD + 3.0, 11.05), (HD + 3.6, HD + 6.2, 10.65)):
        A.bar('deck', (math.cos(a) * r, math.sin(a) * r, z0), (math.cos(a) * r, math.sin(a) * r, z1), 0.12, 4)
# 特別展望台
octo('deck', HT - 0.6, HT, 5.2)
octo('window', HT, HT + 2.6, 4.8)
octo('deck', HT + 2.6, HT + 3.4, 5.3)
# アンテナ（段々に細く、紅白）
segs = [(HT + 3.4, 104, 1.5), (104, 118, 0.9), (118, 130, 0.5), (130, 136, 0.22)]
for z0, z1, r in segs:
    n = max(1, int((z1 - z0) / 3.0))
    for j in range(n):
        a, b = z0 + (z1 - z0) * j / n, z0 + (z1 - z0) * (j + 1) / n
        lathe(A, 'lightup_orange' if j % 2 == 0 else 'lightup_white', [(r, a), (r, b)], n=10)
    lathe(A, 'steel', [(r * 1.5, z1 - 0.3), (r * 1.5, z1)], n=10)
for z in (HT + 6, 104, 118):
    for k in range(4):
        a = math.pi / 2 * k
        A.box('steel', math.cos(a) * 2.2, math.sin(a) * 2.2, z, 0.5, 0.5, 2.5)
A.box('lamp_red', 0, 0, 136, 0.6, 0.6, 0.6)
for z in (HD + 7.2, HT + 3.6, 104.3, 118.3):
    for (sx, sy) in C:
        r = 11.0 if z < HT else 5.0 if z < 100 else 1.6
        A.box('lamp_red', sx * r * 0.7, sy * r * 0.7, z, 0.45, 0.45, 0.45)
# 足元の土台（脚の基礎）
for (sx, sy) in C:
    h = half(0)
    A.box('steel', sx * h, sy * h, -0.2, 4, 4, 1.4)
A.flush()
view((0, 0, 60), 230, 78, -30)
result = {'faces': sum(len(o.data.polygons) for o in S_['col'].objects)}
