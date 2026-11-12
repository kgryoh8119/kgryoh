# 名所の第 3 弾（16 種）。build('名前') で作って glb に書き出す。正面は -Y（ゲームでは +z）
import bpy, math
exec(bpy.data.texts['lmlib.py'].as_string(), globals())
PI = math.pi

# ---------- 共通の部品 ----------
def std_mats():
    mat('ground', 0xcfc8b6, .95); mat('gravel', 0xd9d4c8, .95); mat('grass', 0x6fa04f, .95); mat('paving', 0xbdb6a8, .9)
    mat('leaf', 0x4f7f3f, .9); mat('leaf2', 0x3c6a3a, .9); mat('trunk', 0x5a4232, .9)
    mat('window', 0x2e3c48, .15, .3); mat('lamp', 0xfff1c8, .3, 0, emit=(0xffe8b8, 3.0)); mat('gold', 0xc9a24a, .35, 1)
def ground(A, hx, hy, m='ground'): A.box(m, 0, 0, 0, 2 * hx, 2 * hy, 0.12)
def tree(A, x, y, s=1.0, kind='round'):
    A.bar('trunk', (x, y, 0.1), (x, y, 2.2 * s), 0.25 * s, 5)
    if kind == 'pine':
        for k in range(3):
            z = 2.0 * s + k * 1.6 * s; r = (2.6 - k * 0.7) * s
            lathe(A, 'leaf2', [(r, z), (r * 0.5, z + 1.0 * s), (0.05, z + 1.5 * s)], n=7, cx=x, cy=y)
    elif kind == 'cone':
        lathe(A, 'leaf2', [(2.2 * s, 1.8 * s), (1.2 * s, 5 * s), (0.05, 8 * s)], n=7, cx=x, cy=y)
    else:
        lathe(A, 'leaf', [(0.3 * s, 1.6 * s), (2.4 * s, 2.6 * s), (2.7 * s, 4.0 * s), (1.9 * s, 5.4 * s), (0.2 * s, 6.0 * s)], n=7, cx=x, cy=y)
def hip(A, m, cx, cy, z0, w, d, h, ins=None):
    ins = min(w, d) / 2 * 0.98 if ins is None else ins; a, b = w / 2, d / 2
    P = [(cx - a, cy - b, z0), (cx + a, cy - b, z0), (cx + a, cy + b, z0), (cx - a, cy + b, z0)]
    Q = [(cx - a + ins, cy - b + ins, z0 + h), (cx + a - ins, cy - b + ins, z0 + h), (cx + a - ins, cy + b - ins, z0 + h), (cx - a + ins, cy + b - ins, z0 + h)]
    sl = math.hypot(ins, h); s = 4.8
    for i in range(4):
        j = (i + 1) % 4; L = math.dist(P[i], P[j]); l2 = math.dist(Q[i], Q[j]); o = (L - l2) / 2
        A.add(m, [P[i], P[j], Q[j], Q[i]], [(0, 1, 2, 3)], [(0, 0), (L / s, 0), ((o + l2) / s, sl / s), (o / s, sl / s)])
    A.add(m, Q, [(0, 1, 2, 3)])
def gable(A, m, wall, cx, cy, z0, w, d, h, over=0.6):
    """切妻（棟は x 方向）"""
    a, b = w / 2 + over, d / 2 + over
    for sy in (-1, 1):
        A.add(m, [(cx - a, cy + sy * b, z0 - over * h / b), (cx + a, cy + sy * b, z0 - over * h / b), (cx + a, cy, z0 + h), (cx - a, cy, z0 + h)], [(0, 1, 2, 3) if sy < 0 else (3, 2, 1, 0)],
              [(0, 0), (2 * a / 4.8, 0), (2 * a / 4.8, b / 4.8), (0, b / 4.8)])
    for sx in (-1, 1):
        A.add(wall, [(cx + sx * w / 2, cy - d / 2, z0), (cx + sx * w / 2, cy + d / 2, z0), (cx + sx * w / 2, cy, z0 + h * (d / 2) / b)], [(0, 1, 2)])
def facade_windows(A, cx, cy, w, d, z0, floors, fh, step=3.2, m='window', faces=(0, 1, 2, 3), ww=1.6, wh=None):
    wh = wh or fh * 0.55
    for face in faces:
        L = w if face % 2 == 0 else d; half = (d if face % 2 == 0 else w) / 2; xf0 = face_xf(face, half)
        xf = lambda p, xf0=xf0: (lambda q: (q[0] + cx, q[1] + cy, q[2]))(xf0(p))
        n = max(1, int(L / step))
        for f in range(floors):
            for i in range(n):
                A.xbox(m, xf, -L / 2 + L * (i + 0.5) / n, -0.06, z0 + f * fh + (fh - wh) / 2, ww, 0.14, wh)
def lamp_post(A, x, y, h=4.0):
    A.bar('iron', (x, y, 0.1), (x, y, h), 0.08, 6); A.box('lamp', x, y, h, 0.45, 0.45, 0.55)
def sstrip(A, m, r0, r1, ulen=4.0):
    """2 つの点の輪（同じ点数）をつなぐ帯。UV 付き"""
    N = len(r0); V = []; F = []; U = []; acc = [0.0]
    for i in range(N): acc.append(acc[-1] + math.dist(r0[i], r0[(i + 1) % N]))
    for i in range(N + 1): V += [r0[i % N], r1[i % N]]; U += [(acc[i] / ulen, 0), (acc[i] / ulen, 1)]
    for i in range(N): F.append((i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1))
    A.add(m, V, F, U)
def ell(a, b, z, n=48, cx=0, cy=0, a0=0, a1=2 * PI, closed=True):
    m = n if closed else n + 1
    return [(cx + math.cos(a0 + (a1 - a0) * i / n) * a, cy + math.sin(a0 + (a1 - a0) * i / n) * b, z) for i in range(m)]
def disc(A, m, a, b, z, n=48, cx=0, cy=0):
    V = ell(a, b, z, n, cx, cy) + [(cx, cy, z)]; A.add(m, V, [(n, i, (i + 1) % n) for i in range(n)])

# ---------- 1 大きな神社（4×4） ----------
def grand_shrine():
    begin('GrandShrine', 'gsh'); std_mats()
    mat('vermilion', 0xc2452b, .65); mat('plaster', 0xf1ece0, .85); mat('soffit', 0x9a3c24, .7); mat('ridge', 0x497a6b, .55, .2)
    mat('darkWood', 0x3a2a20, .8); mat('stone', 0xa8a194, .9); mat('iron', 0x2b2e31, .5, .5)
    cr = bpy.data.materials.get('copperRoof'); S_['M']['copperRoof'] = cr if cr else mat('copperRoof', 0x5f9483, .55, .15)
    A = Acc(); ground(A, 59, 59, 'gravel')
    A.box('paving', 0, -30, 0.12, 7, 58, 0.06)                                 # 参道
    def torii(y, s, m='vermilion'):
        for sx in (-1, 1): A.bar(m, (sx * 3.4 * s, y, 0), (sx * 3.2 * s, y, 7.4 * s), 0.38 * s, 10)
        A.box(m, 0, y, 6.2 * s, 8.6 * s, 0.5 * s, 0.5 * s)
        A.box('darkWood', 0, y, 7.4 * s, 10.6 * s, 0.7 * s, 0.55 * s); A.box(m, 0, y, 7.1 * s, 10 * s, 0.6 * s, 0.35 * s)
    torii(-55, 2.0); torii(-34, 1.3)
    for y in range(-50, -28, 4):
        for sx in (-1, 1):
            x = sx * 6.5; A.box('stone', x, y, 0.1, 0.9, 0.9, 1.6); A.box('lamp', x, y, 1.7, 0.7, 0.7, 0.7); hip(A, 'stone', x, y, 2.4, 1.3, 1.3, 0.6)
    # 回廊（四角に囲む、朱の柱と白壁）
    CW, CD, CY = 64, 52, 4
    for (x0, y0, x1, y1) in [(-CW / 2, -CD / 2, CW / 2, -CD / 2), (CW / 2, -CD / 2, CW / 2, CD / 2), (CW / 2, CD / 2, -CW / 2, CD / 2), (-CW / 2, CD / 2, -CW / 2, -CD / 2)]:
        L = math.dist((x0, y0), (x1, y1)); n = int(L / 3.2)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + CY; horiz = abs(y1 - y0) < 1e-6
        w, d = (L, 4.4) if horiz else (4.4, L)
        A.box('stone', cx, cy, 0, w + 0.8, d + 0.8, 0.5)
        for i in range(n + 1):
            t = i / n; x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + CY
            for o in (-1.8, 1.8):
                A.bar('vermilion', (x + (o if not horiz else 0), y + (o if horiz else 0), 0.5), (x + (o if not horiz else 0), y + (o if horiz else 0), 4.2), 0.18, 6)
        A.box('plaster', cx, cy, 0.5, (w if horiz else 0.4), (0.4 if horiz else d), 3.4) if (y0 > 0 and horiz) else None
        gable(A, 'copperRoof', 'vermilion', cx, cy, 4.2, w, d, 1.8, 0.8) if horiz else None
        if not horiz:
            # 縦の回廊は棟を y 方向に（x と y を入れ替えて作る）
            a, b = 2.2 + 0.8, d / 2 + 0.8
            for sx in (-1, 1):
                A.add('copperRoof', [(cx + sx * a, cy - b, 4.2 - 0.8 * 1.8 / a), (cx + sx * a, cy + b, 4.2 - 0.8 * 1.8 / a), (cx, cy + b, 6.0), (cx, cy - b, 6.0)], [(0, 1, 2, 3) if sx > 0 else (3, 2, 1, 0)],
                      [(0, 0), (2 * b / 4.8, 0), (2 * b / 4.8, a / 4.8), (0, a / 4.8)])
    # 楼門（正面の門）
    A.box('vermilion', 0, -CD / 2 + CY, 0.5, 12, 6, 7); A.box('darkWood', 0, -CD / 2 + CY - 3.05, 0.5, 4, 0.2, 5)
    jroof(A, 12, 6, 7.5, 6, 0.6, 2.2, 3.0, 0.7, m='copperRoof', soffit='soffit', ridge='ridge', R=5, N=8, cx=0, cy=-CD / 2 + CY)
    # 拝殿・本殿
    for (y, w, d, h, rise) in ((0, 22, 12, 5.5, 5.0), (16, 16, 12, 6.0, 5.5)):
        A.box('stone', 0, y + CY, 0, w + 4, d + 4, 1.2)
        A.box('plaster', 0, y + CY, 1.2, w, d, h)
        for i in range(int(w / 2.75) + 1):
            for sy in (-1, 1): A.bar('vermilion', (-w / 2 + w * i / int(w / 2.75), y + CY + sy * d / 2, 1.2), (-w / 2 + w * i / int(w / 2.75), y + CY + sy * d / 2, 1.2 + h), 0.3, 8)
        A.box('vermilion', 0, y + CY, 1.2 + h - 0.6, w + 0.4, d + 0.4, 0.4)
        rr = jroof(A, w, d, 1.2 + h + 0.4, w * 0.55, 0.6, 3.2, rise, 1.0, m='copperRoof', soffit='soffit', ridge='ridge', R=6, N=10, cx=0, cy=y + CY)
        zt = rr[-1][0][2]; A.box('ridge', 0, y + CY, zt - 0.1, w * 0.58, 1.0, 0.8)
        for sx in (-1, 1): A.box('gold', sx * w * 0.29, y + CY, zt - 0.1, 0.35, 1.05, 0.85)
    A.box('darkWood', 0, CY - 7, 1.2, 3, 1.2, 1.1)                               # 賽銭箱
    # 鎮守の森
    import random; rnd = random.Random(5)
    for i in range(70):
        x, y = rnd.uniform(-57, 57), rnd.uniform(-57, 57)
        if abs(x) < CW / 2 + 3 and -CD / 2 - 2 < y - CY < CD / 2 + 3: continue
        if abs(x) < 10 and y < -20: continue
        tree(A, x, y, rnd.uniform(1.0, 1.6), 'cone' if rnd.random() < 0.5 else 'round')
    A.flush(); return 'GrandShrine', 'grand_shrine.glb'

# ---------- 2 歌舞伎の劇場（3×2） ----------
def kabukiza():
    begin('Kabukiza', 'kbk'); std_mats()
    mat('plaster', 0xf2ede2, .85); mat('kawara', 0x5a5e63, .6, .1); mat('soffit', 0x6a2a1e, .7); mat('ridge', 0x45494d, .6)
    mat('vermilion', 0xb8432a, .65); mat('darkWood', 0x35261c, .8); mat('lantern', 0xd23a2a, .5, 0, emit=(0xff6040, 2.0)); mat('stone', 0xa49d90, .9)
    mat('banner', 0x1f3a6b, .7); mat('banner2', 0xe8d9b0, .7); mat('iron', 0x2b2e31, .5, .5)
    A = Acc(); ground(A, 44, 29, 'paving')
    # 本体（白壁の大きな箱）と左右の塔屋
    A.box('stone', 0, 4, 0, 70, 34, 1.0); A.box('plaster', 0, 4, 1.0, 66, 30, 12)
    facade_windows(A, 0, 4, 66, 30, 4.5, 2, 3.8, step=4.0, faces=(1, 2, 3))
    rr = jroof(A, 66, 30, 13.2, 40, 2.0, 3.0, 7.0, 1.2, m='kawara', soffit='soffit', ridge='ridge', R=6, N=12, cx=0, cy=4)
    zt = rr[-1][0][2]; A.box('ridge', 0, 4, zt - 0.1, 41, 1.6, 1.0)
    for sx in (-1, 1): A.box('gold', sx * 20.6, 4, zt - 0.1, 0.8, 1.7, 1.6)
    # 正面：唐破風の玄関と大きな千鳥破風
    A.box('plaster', 0, -12.5, 1.0, 26, 5, 9)
    A.box('vermilion', 0, -15.05, 1.0, 26, 0.1, 0.3); A.box('vermilion', 0, -15.05, 8.4, 26.4, 0.2, 0.6)
    for x in (-12, -6, 0, 6, 12): A.box('vermilion', x, -15.1, 1.0, 0.6, 0.6, 7.5)
    for x in (-9, -3, 3, 9): A.box('darkWood', x, -15.06, 1.0, 4.4, 0.1, 6.2)
    n = 20; prof = []
    for i in range(n + 1):
        u = -1 + 2 * i / n; prof.append((16 * u, 3.6 * (0.5 + 0.5 * math.cos(PI * u)) ** 0.75 + 1.6 * max(0, abs(u) - 0.7) ** 2 / 0.09))
    V = []; F = []; U = []; acc = 0
    for i, (x, z) in enumerate(prof):
        if i: acc += math.dist(prof[i - 1], (x, z))
        for yy in (-16.5, -9):
            for th in (0, 0.6): V.append((x, yy, 9.6 + z + th)); U.append(((yy + 16.5) / 4.8, acc / 4.8))
    for i in range(n):
        a = i * 4; b = a + 4; F += [(a + 1, b + 1, b + 3, a + 3), (a, a + 2, b + 2, b), (a, b, b + 1, a + 1)]
    A.add('kawara', V, F, U)
    fv = [(0, -15.0, 9.4), (-13, -15.0, 9.4)] + [(max(-13, min(13, x)), -15.0, 9.6 + z * 0.92) for (x, z) in prof] + [(13, -15.0, 9.4)]
    A.add('plaster', fv, [(0, i, i + 1) for i in range(1, len(fv) - 1)])
    A.add('gold', sum([[(x, -16.55, 9.7 + z), (x, -16.55, 10.3 + z)] for (x, z) in prof], []), [(i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1) for i in range(n)])
    # 提灯の列・のぼり
    for x in range(-12, 13, 2):
        lathe(A, 'lantern', [(0.05, 7.0), (0.45, 7.2), (0.5, 7.7), (0.45, 8.2), (0.05, 8.4)], n=8, cx=x, cy=-15.6)
    for x in (-30, -26, -22, 22, 26, 30):
        A.bar('iron', (x, -18, 0.1), (x, -18, 7), 0.08, 4); A.box('banner' if x % 4 else 'banner2', x + 0.6, -18, 2.5, 1.1, 0.06, 4.2)
    for x in (-36, 36): tree(A, x, -22, 0.9, 'round')
    A.flush(); return 'Kabukiza', 'kabukiza.glb'

# ---------- 3 城跡（3×3） ----------
def castle_ruins():
    begin('CastleRuins', 'crn'); std_mats()
    mat('ishigaki', 0x9c968a, .95); mat('stoneCap', 0xb7b0a0, .9); mat('plaster', 0xf2efe6, .85); mat('kawara', 0x5a5e63, .6, .1); mat('soffit', 0x6a6a6a, .7)
    mat('ridge', 0x45494d, .6); mat('water', 0x3f7fa6, .2, .1); mat('darkWood', 0x3a2a20, .8)
    A = Acc(); ground(A, 44, 44, 'grass')
    # 堀（L 字に残る）
    A.box('water', -10, -38, 0.05, 66, 9, 0.12); A.box('water', -40, -10, 0.05, 9, 48, 0.12)
    # 石垣（扇の勾配、UV 付き）。一部が崩れて低い
    def wall(cx, cy, w, d, h, E=1.6):
        side_loft(A, 'ishigaki', [(w / 2 - E * (1 - (1 - j / 6) ** 2), d / 2 - E * (1 - (1 - j / 6) ** 2), h * j / 6, None) for j in range(7)], 6, 6.0, cx, cy)
        A.box('stoneCap', cx, cy, h, w - 2 * E + 0.3, d - 2 * E + 0.3, 0.3)
    wall(4, 6, 46, 40, 7.5); wall(-12, -18, 18, 12, 4.0); wall(22, -20, 10, 8, 2.2)
    A.box('grass', 4, 6, 7.8, 42, 36, 0.05)
    # 天守台の上の小さな櫓と石段
    A.box('plaster', 16, 16, 7.8, 9, 7, 4.5); facade_windows(A, 16, 16, 9, 7, 9.2, 1, 2.0, step=2.4)
    rr = jroof(A, 9, 7, 12.3, 3, 0.5, 1.8, 2.6, 0.6, m='kawara', soffit='soffit', ridge='ridge', R=5, N=8, cx=16, cy=16)
    for k in range(10): A.box('ishigaki', -6, -14.5 + k * 0.75, 0, 6, 0.75, 0.75 * (k + 1))
    # 桜と松・礎石
    import random; rnd = random.Random(3)
    for i in range(16):
        x, y = rnd.uniform(-14, 22), rnd.uniform(-8, 22)
        tree(A, x, y, 0.9, 'round') if i % 2 else None
    for (x, y) in [(-30, 20), (-25, 32), (30, -30), (36, 24), (20, 36), (-34, -32)]: tree(A, x, y, 1.2, 'pine')
    for i in range(4):
        for j in range(3): A.box('ishigaki', -2 + i * 3.2, 4 + j * 3.2, 7.8, 0.9, 0.9, 0.35)
    A.flush(); return 'CastleRuins', 'castle_ruins.glb'

# ---------- 4 日本庭園と茶室（3×3） ----------
def japanese_garden():
    begin('Garden', 'jgd'); std_mats()
    mat('water', 0x3f7fa6, .15, .1); mat('rock', 0x7d786f, .9); mat('vermilion', 0xc2452b, .65); mat('thatch', 0x8a7a52, .95)
    mat('plaster', 0xe8dcc0, .9); mat('darkWood', 0x3a2a20, .8); mat('moss', 0x5e8a46, .95); mat('stone', 0xa8a194, .9); mat('iron', 0x2b2e31, .5, .5)
    A = Acc(); ground(A, 44, 44, 'moss')
    # 池（くびれのある形）と中の島
    pts = [(math.cos(2 * PI * i / 40) * (20 + 5 * math.sin(3 * 2 * PI * i / 40)), math.sin(2 * PI * i / 40) * (13 + 3 * math.cos(2 * 2 * PI * i / 40)) - 4, 0.14) for i in range(40)]
    A.add('water', pts + [(0, -4, 0.14)], [(40, i, (i + 1) % 40) for i in range(40)])
    sstrip(A, 'rock', [(x * 1.06, (y + 4) * 1.06 - 4, 0.0) for (x, y, z) in pts], [(x, y, 0.3) for (x, y, z) in pts])
    disc(A, 'moss', 4.5, 3.2, 0.5, 16, cx=5, cy=-5); tree(A, 5, -5, 0.8, 'pine')
    # 朱の太鼓橋
    prof = [(t, 2.2 * math.sin(PI * (t + 7) / 14)) for t in [-7 + 14 * i / 16 for i in range(17)]]
    for i in range(16):
        (x0, z0), (x1, z1) = prof[i], prof[i + 1]
        A.add('vermilion', [(x0 - 12, -1.4, z0 + 0.3), (x1 - 12, -1.4, z1 + 0.3), (x1 - 12, 1.4, z1 + 0.3), (x0 - 12, 1.4, z0 + 0.3)], [(0, 1, 2, 3)])
        for sy in (-1.4, 1.4): A.bar('vermilion', (x0 - 12, sy, z0 + 1.2), (x1 - 12, sy, z1 + 1.2), 0.08, 4)
    for i in range(0, 17, 4):
        x, z = prof[i]
        for sy in (-1.4, 1.4): A.bar('vermilion', (x - 12, sy, z + 0.3), (x - 12, sy, z + 1.25), 0.1, 4)
    # 茶室（茅葺の寄棟）と縁側
    A.box('stone', 22, 22, 0, 12, 10, 0.6); A.box('plaster', 22, 22, 0.6, 9, 7, 3.2)
    for x in (-4.5, -1.5, 1.5, 4.5):
        for y in (-3.5, 3.5): A.bar('darkWood', (22 + x, 22 + y, 0.6), (22 + x, 22 + y, 3.8), 0.12, 4)
    A.box('darkWood', 22, 22 - 4.4, 0.6, 9, 1.8, 0.25)
    hip(A, 'thatch', 22, 22, 3.6, 12, 10, 4.2, ins=4.2); A.box('darkWood', 22, 22, 7.7, 4.6, 0.9, 0.5)
    # 灯籠・飛び石・岩組みの滝・松と紅葉
    for (x, y) in [(-26, -20), (14, 10), (-6, 16)]:
        A.box('stone', x, y, 0.1, 0.9, 0.9, 1.4); A.box('lamp', x, y, 1.5, 1.0, 1.0, 0.7); hip(A, 'stone', x, y, 2.2, 1.6, 1.6, 0.7); A.box('stone', x, y, 2.9, 0.3, 0.3, 0.4)
    for i in range(10): A.box('stone', 8 + i * 1.4, 12 + i * 1.0, 0.1, 1.1, 0.9, 0.18)
    for (x, y, s) in [(-22, 10, 2.6), (-19, 12, 3.4), (-24, 13, 2.0), (-20, 9, 1.6)]: lathe(A, 'rock', [(s, 0), (s * 0.9, s * 0.5), (s * 0.4, s), (0.05, s * 1.1)], n=6, cx=x, cy=y)
    A.box('water', -20.5, 8.3, 0.2, 1.4, 0.3, 3.0)
    for (x, y, k) in [(-34, -30, 'pine'), (30, -30, 'pine'), (-34, 30, 'round'), (36, 6, 'pine'), (-10, 32, 'round'), (10, -32, 'round'), (32, 36, 'cone'), (-38, 0, 'cone')]: tree(A, x, y, 1.1, k)
    for i in range(8): tree(A, -40 + i * 11, -41, 0.8, 'round')
    A.flush(); return 'Garden', 'japanese_garden.glb'

# ---------- 5 時計塔（ロンドン風、2×2） ----------
def clock_tower():
    begin('ClockTower', 'ctw'); std_mats()
    mat('stone', 0xcdb890, .85); mat('stone_dark', 0xa8936c, .85); mat('slate', 0x3c4652, .5, .2); mat('clockface', 0xf4ecd6, .4, 0, emit=(0xfff2c8, 0.0)); mat('iron', 0x2b2e31, .5, .5)
    A = Acc(); ground(A, 29, 29, 'paving')
    W = 12.0
    A.box('stone_dark', 0, 0, 0, W + 2, W + 2, 3)
    A.box('stone', 0, 0, 3, W, W, 52)
    for z in range(8, 52, 6): A.box('stone_dark', 0, 0, 3 + z, W + 0.4, W + 0.4, 0.5)
    for face in range(4):                                   # 縦の飾り溝（ゴシックの縦線）と細長い窓
        xf = face_xf(face, W / 2)
        for i in range(5):
            A.xbox('stone_dark', xf, -W / 2 + W * (i + 0.5) / 5, -0.15, 4, 0.35, 0.3, 50)
            for z in range(10, 48, 6): A.xbox('window', xf, -W / 2 + W * (i + 1) / 5.0 - W / 10, -0.08, z, 0.8, 0.12, 3.2) if i < 4 else None
    # 時計の部屋（少し張り出す）と文字盤
    A.box('stone', 0, 0, 55, W + 1.2, W + 1.2, 9)
    for face in range(4):
        xf = face_xf(face, (W + 1.2) / 2)
        A.xbox('gold', xf, 0, -0.1, 55.4, 9.2, 0.2, 8.2)
        cv = [xf((math.cos(2 * PI * i / 32) * 3.6, -0.32, 59.5 + math.sin(2 * PI * i / 32) * 3.6)) for i in range(32)] + [xf((0, -0.32, 59.5))]
        A.add('clockface', cv, [(32, i, (i + 1) % 32) for i in range(32)])
        A.add('iron', [xf((-0.12, -0.38, 59.5)), xf((0.12, -0.38, 59.5)), xf((0.12, -0.38, 62.3)), xf((-0.12, -0.38, 62.3))], [(0, 1, 2, 3)])
        A.add('iron', [xf((0, -0.38, 59.4)), xf((2.0, -0.38, 58.4)), xf((2.1, -0.38, 58.6)), xf((0, -0.38, 59.7))], [(0, 1, 2, 3)])
    # 鐘楼（アーチの開口）と、急な尖り屋根・四隅の小尖塔
    A.box('stone', 0, 0, 64, W - 0.6, W - 0.6, 7); A.box('stone_dark', 0, 0, 71, W + 0.8, W + 0.8, 0.8)
    for face in range(4):
        xf = face_xf(face, (W - 0.6) / 2)
        for x in (-3.3, 0, 3.3): A.xbox('window', xf, x, -0.06, 65, 2.2, 0.12, 5.2)
    hip(A, 'slate', 0, 0, 71.8, W - 0.4, W - 0.4, 14, ins=(W - 0.4) / 2 - 0.4)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (W / 2 - 0.2), sy * (W / 2 - 0.2)
            A.box('stone', x, y, 71.8, 1.2, 1.2, 3); hip(A, 'slate', x, y, 74.8, 1.3, 1.3, 3.5, ins=0.62); A.bar('gold', (x, y, 78.3), (x, y, 79.6), 0.06, 4)
    A.box('slate', 0, 0, 85.8, 1.6, 1.6, 3.0); hip(A, 'slate', 0, 0, 88.8, 1.7, 1.7, 4, ins=0.82)
    A.bar('gold', (0, 0, 92.8), (0, 0, 96.0), 0.1, 6); lathe(A, 'gold', [(0.01, 95.5), (0.35, 95.8), (0.01, 96.2)], n=8)
    # 足元：議事堂の一部（低い棟）と街灯
    A.box('stone', -16, 10, 0, 24, 14, 14); hip(A, 'slate', -16, 10, 14, 24, 14, 3.5)
    facade_windows(A, -16, 10, 24, 14, 1.5, 3, 4.0, step=2.6, faces=(0, 3))
    for x in (-8, 8): lamp_post(A, x, -16)
    A.flush(); return 'ClockTower', 'clock_tower.glb'

# ---------- 6 鉄の塔（パリ風、3×3） ----------
def iron_tower():
    begin('IronTower', 'irn'); std_mats()
    mat('lightup_iron', 0x6e5a44, .5, .5); mat('deck', 0x7a6650, .6, .3); mat('iron', 0x2b2e31, .5, .5)
    A = Acc(); ground(A, 44, 44, 'grass'); A.box('paving', 0, 0, 0.12, 54, 54, 0.05)
    def half(z): return 22.0 * math.exp(-z / 30.0) + 1.2 if z < 120 else 1.2
    LV = [0, 6, 13, 20, 28, 36, 44, 52, 60, 70, 80, 90, 100, 110, 118, 124]
    C = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for i in range(len(LV) - 1):
        z0, z1 = LV[i], LV[i + 1]; h0, h1 = half(z0), half(z1); r = 0.9 - 0.6 * z0 / 124
        for (sx, sy) in C:
            if z0 < 56:                          # 下部は 4 本脚が別々（脚ごとに格子）
                for (ox, oy) in ((0, 0), (-2.4, 0), (0, -2.4)):
                    p0 = (sx * (h0 + ox * (1 - z0 / 56)), sy * (h0 + oy * (1 - z0 / 56)), z0); p1 = (sx * (h1 + ox * (1 - z1 / 56)), sy * (h1 + oy * (1 - z1 / 56)), z1)
                    A.bar('lightup_iron', p0, p1, r * 0.7, 6)
            else: A.bar('lightup_iron', (sx * h0, sy * h0, z0), (sx * h1, sy * h1, z1), r, 6)
        for k in range(4):
            (ax, ay), (bx, by) = C[k], C[(k + 1) % 4]
            if z0 >= 56 or i % 2 == 0:
                A.bar('lightup_iron', (ax * h0, ay * h0, z0), (bx * h1, by * h1, z1), r * 0.4, 4); A.bar('lightup_iron', (bx * h0, by * h0, z0), (ax * h1, ay * h1, z1), r * 0.4, 4)
    for k in range(4):                                           # 下部の大アーチ
        (ax, ay), (bx, by) = C[k], C[(k + 1) % 4]; pts = []
        for j in range(17):
            t = j / 16; zz = 3 + math.sin(PI * t) * 18; hh = half(zz)
            pts.append(((ax + (bx - ax) * t) * hh * 0.98, (ay + (by - ay) * t) * hh * 0.98, zz))
        for j in range(16): A.bar('lightup_iron', pts[j], pts[j + 1], 0.6, 6)
    for (z, s) in ((56, 1.0), (100, 0.6)):                       # 展望台
        h = half(z) + 1.5
        A.box('deck', 0, 0, z, 2 * h, 2 * h, 1.2); A.box('window', 0, 0, z + 1.2, 2 * h - 2, 2 * h - 2, 2.6); A.box('deck', 0, 0, z + 3.8, 2 * h + 0.4, 2 * h + 0.4, 0.4)
    A.box('deck', 0, 0, 124, 3.4, 3.4, 4); A.box('window', 0, 0, 128, 3.0, 3.0, 2); A.bar('iron', (0, 0, 130), (0, 0, 138), 0.25, 6)
    A.box('lamp', 0, 0, 138, 0.8, 0.8, 0.8)
    for (sx, sy) in C: A.box('stone' if 'stone' in S_['M'] else 'paving', sx * half(0), sy * half(0), 0, 6, 6, 1.2)
    for i in range(10): tree(A, -40 + i * 9, -40, 0.9, 'round'); tree(A, -40 + i * 9, 40, 0.9, 'round')
    A.flush(); return 'IronTower', 'iron_tower.glb'

# ---------- 7 教会（2×1） ----------
def church():
    begin('Church', 'chr'); std_mats()
    mat('stone', 0xd8d0c0, .85); mat('stone_dark', 0xb0a690, .85); mat('slate', 0x3c4652, .5, .2); mat('glass', 0x3a4a8a, .2, .2, emit=(0x6a7ad8, 0.0)); mat('iron', 0x2b2e31, .5, .5)
    A = Acc(); ground(A, 29, 14, 'paving')
    A.box('stone', 4, 0, 0, 34, 13, 11); A.box('stone_dark', 4, 0, 0, 34.6, 13.6, 1.0)
    gable(A, 'slate', 'stone', 4, 0, 11, 34, 13, 8, 0.4)
    for i in range(7):                                            # 控え壁と尖頭窓（ステンドグラス）
        x = -11 + i * 5
        for sy in (-1, 1):
            A.box('stone_dark', x, sy * 7.0, 0, 1.0, 1.4, 9)
            A.box('glass', x + 2.5, sy * 6.56, 3, 1.6, 0.12, 6) if i < 6 else None
    # 正面の塔（尖塔）とバラ窓
    A.box('stone', -16, 0, 0, 8, 9, 22); A.box('stone_dark', -16, 0, 22, 8.6, 9.6, 0.8)
    hip(A, 'slate', -16, 0, 22.8, 8, 8, 16, ins=3.8); A.bar('gold', (-16, 0, 38.6), (-16, 0, 42), 0.12, 6); A.box('gold', -16, 0, 40.4, 1.6, 0.18, 0.18)
    for sy in (-1, 1): A.box('glass', -16, sy * 4.56, 14, 2.0, 0.12, 4.0)
    disc(A, 'glass', 2.2, 2.2, 0, 24) if False else None
    rv = [(-20.06, math.cos(2 * PI * i / 24) * 2.4, 15 + math.sin(2 * PI * i / 24) * 2.4) for i in range(24)] + [(-20.06, 0, 15)]
    A.add('glass', rv, [(24, (i + 1) % 24, i) for i in range(24)])
    A.box('iron', -20.1, 0, 1.0, 0.2, 3.0, 5.0)                # 扉
    for (x, y) in [(22, -10), (26, 8)]: tree(A, x, y, 0.8, 'cone')
    lamp_post(A, -24, -9); lamp_post(A, -24, 9)
    A.flush(); return 'Church', 'church.glb'

# ---------- 8 歌劇場（3×3、白い帆の屋根） ----------
def opera_house():
    begin('Opera', 'opr'); std_mats()
    mat('roof_membrane', 0xf2f0ea, .45); mat('podium', 0xc9a98a, .85); mat('glass', 0x9db8c8, .12, .5); mat('water', 0x3f7fa6, .15, .1)
    A = Acc(); ground(A, 44, 44, 'paving')
    A.box('water', 0, 0, 0.05, 88, 88, 0.1); A.box('podium', 0, 0, 0, 70, 60, 6)
    for k in range(10): A.box('podium', 0, -30 - k * 1.2, 0, 34, 1.2, 6 - k * 0.6)     # 大階段
    def sail(cx, cy, w, L, h, back, flip=1):
        """帆（貝殻）1 枚：正面の弧（開口、ガラス）から、後ろの地面の一点へ膨らみながら下りる"""
        n, rows = 14, 9; y0 = cy - flip * L / 2
        arch = []
        for i in range(n + 1):
            u = -1 + 2 * i / n; arch.append((cx + u * w / 2, y0 + flip * L * 0.35 * (1 - u * u), 6 + h * (1 - u * u) ** 0.8))
        B = (cx, cy + flip * L / 2, 6.0); V = []; F = []
        for j in range(rows + 1):
            t = j / rows; e = t ** 1.15
            for i, (x, y, z) in enumerate(arch):
                u = -1 + 2 * i / n
                V.append((x + (B[0] - x) * e, y + (B[1] - y) * e, z + (B[2] - z) * e + h * 0.18 * math.sin(PI * t) * (1 - u * u)))
        for j in range(rows):
            for i in range(n): a_ = j * (n + 1) + i; F.append((a_, a_ + 1, a_ + n + 2, a_ + n + 1) if flip > 0 else (a_ + n + 1, a_ + n + 2, a_ + 1, a_))
        A.add('roof_membrane', V, F)
        A.add('glass', arch + [(cx, y0, 6)], [(n + 1, i, i + 1) for i in range(n)])
    for (cx, s) in ((-14, 1.0), (14, 0.85)):
        for k, (L, h) in enumerate(((26, 30), (20, 24), (14, 17))):
            sail(cx, -6 + k * 9 * s, 20 * s, L * s, h * s, 0, flip=1 if k % 2 == 0 else -1)
    sail(0, 22, 12, 12, 12, 0, 1)
    for i in range(8): tree(A, -40 + i * 11, 40, 0.8, 'round')
    A.flush(); return 'Opera', 'opera_house.glb'

# ---------- 9 県庁（4×3、中央に段々の塔） ----------
def kencho():
    begin('Kencho', 'knc'); std_mats()
    mat('stone', 0xd6cfbf, .8); mat('stone_dark', 0xa9a08c, .85); mat('copperRoof2', 0x5f9483, .55, .15); mat('iron', 0x2b2e31, .5, .5)
    A = Acc(); ground(A, 59, 44, 'paving'); A.box('grass', 0, -30, 0.12, 60, 20, 0.05)
    A.box('stone_dark', 0, 4, 0, 100, 34, 1.6)
    A.box('stone', 0, 4, 1.6, 96, 30, 18); A.box('stone_dark', 0, 4, 19.6, 97, 31, 0.8)
    facade_windows(A, 0, 4, 96, 30, 2.8, 4, 4.2, step=3.0)
    for sx in (-1, 1): A.box('stone', sx * 42, -11.6, 1.6, 12, 1.4, 19)          # 両翼の張り出し
    # 中央の塔：段々のピラミッド
    A.box('stone', 0, 2, 20.4, 22, 22, 18); facade_windows(A, 0, 2, 22, 22, 22, 3, 5.0, step=3.2)
    for k in range(6):
        s = 20 - k * 3.0; A.box('stone', 0, 2, 38.4 + k * 3.0, s, s, 3.0); A.box('stone_dark', 0, 2, 41.0 + k * 3.0, s + 0.4, s + 0.4, 0.4)
    hip(A, 'copperRoof2', 0, 2, 56.4, 4.6, 4.6, 4.0, ins=2.2); A.bar('gold', (0, 2, 60.4), (0, 2, 64), 0.1, 6)
    # 正面の列柱
    for x in range(-9, 10, 3): A.bar('stone', (x, -11.8, 1.6), (x, -11.8, 14), 0.55, 10)
    A.box('stone', 0, -11.8, 14, 22, 2.2, 2.2); gable(A, 'stone_dark', 'stone', 0, -11.8, 16.2, 22, 2.2, 3.0, 0.3)
    for x in (-24, -16, 16, 24): lamp_post(A, x, -24)
    for i in range(8): tree(A, -52 + i * 15, -40, 0.9, 'round')
    A.bar('iron', (36, -30, 0.1), (36, -30, 14), 0.12, 6); A.box('gold', 37.4, -30, 11.5, 2.8, 0.05, 1.8)
    A.flush(); return 'Kencho', 'kencho.glb'

# ---------- 10 市役所 新庁舎（3×2、ガラスの現代建築） ----------
def city_hall():
    begin('CityHall', 'cth'); std_mats()
    mat('concrete', 0xd9d7d2, .7); mat('glass_window', 0x4c6a7e, .1, .5); mat('steel', 0xc6ccd2, .35, .7); mat('screen', 0x10161c, .3)
    A = Acc(); ground(A, 44, 29, 'paving'); A.box('grass', -28, -20, 0.12, 24, 12, 0.05)
    # 高層棟と低層棟、ガラスのアトリウム
    A.box('concrete', 18, 6, 0, 22, 18, 46); A.box('glass_window', 18, 6, 0, 21.6, 18.4, 44)
    for z in range(0, 46, 4): A.box('concrete', 18, 6, z, 22.2, 18.6, 0.5)
    for x in range(8, 30, 3): A.box('concrete', x, -3.25, 0, 0.35, 0.3, 46)
    A.box('concrete', -14, 4, 0, 38, 24, 14); A.box('glass_window', -14, 4, 1, 38.4, 24.4, 3.5)
    for z in (5.5, 9.5): A.box('glass_window', -14, 4, z, 38.4, 24.4, 2.8)
    A.box('glass_window', 2.5, -2.6, 0, 9, 12.4, 16); A.box('steel', 2.5, -2.6, 16, 9.6, 13.0, 0.4)
    A.box('grass', -14, 4, 14, 34, 20, 0.3)                                       # 屋上緑化
    for i in range(5): tree(A, -26 + i * 6, 4, 0.5, 'round') if False else None
    A.box('steel', 18, 6, 46, 12, 8, 3); A.box('steel', 0, -16, 3.6, 16, 6, 0.3)      # ひさし
    for x in (-6, 6): A.bar('steel', (x, -18.5, 0.1), (x, -18.5, 3.6), 0.15, 6)
    A.bar('steel', (-36, -24, 0.1), (-36, -24, 12), 0.1, 6); A.box('screen', -34.7, -24, 9.5, 2.6, 0.05, 1.6)
    for i in range(6): tree(A, -40 + i * 6, -26, 0.7, 'round')
    A.flush(); return 'CityHall', 'city_hall.glb'

# ---------- 11 ドーム球場（5×5） ----------
def dome():
    begin('Dome', 'dme'); std_mats()
    mat('roof_membrane', 0xeeeeea, .5); mat('facade', 0x9aa6b0, .5, .2); mat('concrete', 0xc8c4bb, .85); mat('glass_window', 0x3c5468, .1, .4); mat('steel', 0xc6ccd2, .35, .7)
    A = Acc(); ground(A, 74, 74, 'paving')
    a, b = 62, 58
    sstrip(A, 'concrete', ell(a + 4, b + 4, 0.12, 64), ell(a + 4, b + 4, 2.0, 64))
    sstrip(A, 'facade', ell(a, b, 2.0, 64), ell(a, b, 14, 64), 8)
    sstrip(A, 'glass_window', ell(a + 0.25, b + 0.25, 4, 64), ell(a + 0.25, b + 0.25, 7.5, 64), 8)
    sstrip(A, 'steel', ell(a + 0.6, b + 0.6, 14, 64), ell(a + 0.6, b + 0.6, 15, 64))
    rings = [ell(a * math.cos(PI / 2 * t), b * math.cos(PI / 2 * t), 15 + 24 * math.sin(PI / 2 * t), 64) for t in [k / 10 * 0.96 for k in range(11)]]
    for k in range(10): sstrip(A, 'roof_membrane', rings[k], rings[k + 1], 10)
    disc(A, 'roof_membrane', a * math.cos(PI / 2 * 0.96), b * math.cos(PI / 2 * 0.96), rings[-1][0][2], 64)
    for i in range(0, 64, 4):                                    # 屋根のケーブル
        for k in range(10): A.bar('steel', rings[k][i], rings[k + 1][i], 0.12, 4)
    for k in (3, 6):
        r = rings[k]
        for i in range(64): A.bar('steel', r[i], r[(i + 1) % 64], 0.1, 4)
    for ang in (PI * 1.5, PI * 0.25, PI * 0.75):                 # ゲート
        x, y = math.cos(ang) * (a + 3), math.sin(ang) * (b + 3)
        A.box('steel', x, y, 0, 14, 6, 8) if abs(math.sin(ang)) > 0.9 else A.box('steel', x, y, 0, 8, 8, 8)
        A.box('lamp', x, y, 8, 6, 2, 0.4)
    for i in range(12): tree(A, -66 + i * 12, -70, 0.9, 'round')
    A.flush(); return 'Dome', 'dome.glb'

# ---------- 12 野球場（4×4） ----------
def ballpark():
    begin('Ballpark', 'bpk'); std_mats()
    mat('field_grass', 0x5e9e48, .9); mat('dirt', 0xb4825a, .95); mat('concrete', 0xc8c4bb, .85); mat('seat', 0x2a5fb0, .6); mat('seat2', 0x2f8a52, .6)
    mat('steel', 0xc6ccd2, .35, .7); mat('screen', 0x10161c, .3); mat('line', 0xf2f2ee, .8); mat('fence', 0x2f6a3e, .7)
    A = Acc(); ground(A, 59, 59, 'paving')
    H = (0.0, -26.0); R = 58.0
    # 球場の外形（フェンスの弧＋両翼のファウルライン沿い＋本塁裏の弧）を一続きの輪にして、スタンドをその外側に積む
    raw = []
    for i in range(13): a_ = PI / 2 + PI / 4 * i / 12; raw.append((H[0] + math.cos(a_) * R, H[1] + math.sin(a_) * R))          # 中堅→左翼
    for i in range(1, 9): t = i / 9; raw.append((H[0] + math.cos(3 * PI / 4) * R * (1 - t) - 9 * 0.707 * t, H[1] + math.sin(3 * PI / 4) * R * (1 - t) - 9 * 0.707 * t))  # 三塁線
    for i in range(13): a_ = 5 * PI / 4 + PI / 2 * i / 12; raw.append((H[0] + math.cos(a_) * 12.7, H[1] + math.sin(a_) * 12.7))        # 本塁裏
    for i in range(1, 9): t = i / 9; raw.append((H[0] + 9 * 0.707 * (1 - t) + math.cos(PI / 4) * R * t, H[1] - 9 * 0.707 * (1 - t) + math.sin(PI / 4) * R * t))  # 一塁線
    for i in range(12): a_ = PI / 4 + PI / 4 * i / 12; raw.append((H[0] + math.cos(a_) * R, H[1] + math.sin(a_) * R))          # 右翼→中堅
    n = len(raw)
    def nrm_at(i):
        (x0, y0), (x1, y1), (x2, y2) = raw[i - 1], raw[i], raw[(i + 1) % n]
        e1 = (y1 - y0, -(x1 - x0)); e2 = (y2 - y1, -(x2 - x1))
        l1 = math.hypot(*e1) or 1; l2 = math.hypot(*e2) or 1; e1 = (e1[0] / l1, e1[1] / l1); e2 = (e2[0] / l2, e2[1] / l2)
        v = (e1[0] + e2[0], e1[1] + e2[1]); lv = math.hypot(*v) or 1; v = (v[0] / lv, v[1] / lv)
        k = max(0.5, v[0] * e1[0] + v[1] * e1[1]); return (v[0] / k, v[1] / k)
    # 向きを外向きにそろえる（反時計回りなら右手側が外）
    area = sum(raw[i][0] * raw[(i + 1) % n][1] - raw[(i + 1) % n][0] * raw[i][1] for i in range(n))
    NR = [nrm_at(i) for i in range(n)]
    if area < 0: NR = [(-a_, -b_) for (a_, b_) in NR]
    def off(o, z, idx=None): return [(raw[i][0] + NR[i][0] * o, raw[i][1] + NR[i][1] * o, z) for i in (idx if idx is not None else range(n))]
    # 芝（外形の内側を全部）、内野の土・塁・線
    cx = sum(p[0] for p in raw) / n; cy = sum(p[1] for p in raw) / n
    A.add('field_grass', [(x, y, 0.14) for (x, y) in raw] + [(cx, cy, 0.14)], [(n, i, (i + 1) % n) for i in range(n)])
    inf = [(H[0] + math.cos(PI / 4 + PI / 2 * i / 16) * 27, H[1] + math.sin(PI / 4 + PI / 2 * i / 16) * 27, 0.16) for i in range(17)]
    A.add('dirt', [(H[0], H[1], 0.16)] + inf, [(0, i, i + 1) for i in range(1, len(inf))])
    d = 19.4 * 0.707
    A.add('field_grass', [(H[0], H[1] + 1.8, 0.18), (H[0] + d - 1.5, H[1] + d, 0.18), (H[0], H[1] + 2 * d - 1.8, 0.18), (H[0] - d + 1.5, H[1] + d, 0.18)], [(0, 1, 2, 3)])
    for (x, y) in [(H[0], H[1]), (H[0] + d, H[1] + d), (H[0], H[1] + 2 * d), (H[0] - d, H[1] + d)]: A.box('line', x, y, 0.18, 0.5, 0.5, 0.06)
    disc(A, 'dirt', 2.8, 2.8, 0.19, 16, cx=H[0], cy=H[1] + d); disc(A, 'dirt', 4.0, 4.0, 0.17, 16, cx=H[0], cy=H[1])
    for sg in (-1, 1): A.bar('line', (H[0], H[1], 0.2), (H[0] + sg * R * 0.707, H[1] + R * 0.707, 0.2), 0.08, 4)
    # 下段スタンド（一周つながる）
    def ring_q(m, r0, r1, closed=True):
        L = len(r0); top = L if closed else L - 1
        for i in range(top):
            j = (i + 1) % L; A.add(m, [r0[i], r0[j], r1[j], r1[i]], [(0, 1, 2, 3)])
    ring_q('fence', off(0, 0.14), off(0, 3.2))
    z = 3.2; o = 0.0
    for k in range(12):
        ring_q('concrete', off(o, z), off(o, z + 0.45)); ring_q('seat' if k % 6 else 'seat2', off(o, z + 0.45), off(o + 0.8, z + 0.45)); o += 0.8; z += 0.45
    ring_q('concrete', off(o, z), off(o + 1.5, z)); ring_q('concrete', off(o + 1.5, z), off(o + 1.5, 0.14))
    # 上段スタンドと屋根（内野側だけ）
    # 内野側の連続した区間（三塁側の端から本塁裏を通って一塁側の端まで）
    seg = [i for i in range(n) if raw[i][1] < H[1] + 26]
    z2 = z + 3.0; o2 = o + 1.5
    ring_q('concrete', off(o2, z + 0.1, seg), off(o2, z2, seg), closed=False)
    for k in range(10):
        ring_q('concrete', off(o2, z2, seg), off(o2, z2 + 0.6, seg), closed=False); ring_q('seat', off(o2, z2 + 0.6, seg), off(o2 + 0.8, z2 + 0.6, seg), closed=False); o2 += 0.8; z2 += 0.6
    ring_q('concrete', off(o2, z2, seg), off(o2, 0.14, seg), closed=False)
    ring_q('steel', off(o2 - 9, z2 + 5.5, seg), off(o2 + 1, z2 + 4.5, seg), closed=False)
    for i in seg[::3]:
        p = off(o2 + 0.8, 0, [i])[0]; A.bar('steel', (p[0], p[1], 0.14), (p[0], p[1], z2 + 4.6), 0.35, 6)
    # 照明塔・スコアボード
    for i in (3, 10, 18, n - 19, n - 11, n - 4):
        p = off(o + 6, 0, [i % n])[0]; nx, ny = NR[i % n]
        A.bar('steel', (p[0], p[1], 0.14), (p[0], p[1], 38), 0.6, 8); A.box('steel', p[0], p[1], 38, 7, 1.0, 4)
        A.box('lamp', p[0] - nx * 0.6, p[1] - ny * 0.6, 38.4, 6.4, 0.1, 3.2)
    sb = off(o + 3, 0, [0])[0]
    A.box('steel', sb[0], sb[1], 6, 22, 2, 12); A.box('screen', sb[0], sb[1] - 1.05, 8, 20, 0.1, 9)
    A.flush(); return 'Ballpark', 'ballpark.glb'

# ---------- 13 空港の管制塔（1×1、レーダーが回る） ----------
def control_tower():
    begin('Control', 'ctl'); std_mats()
    mat('concrete', 0xdedbd4, .7); mat('glass_window', 0x3c5a6e, .1, .5); mat('steel', 0xc6ccd2, .35, .7); mat('lamp_red', 0xff3020, .3, 0, emit=(0xff2010, 2.0))
    A = Acc(); ground(A, 14, 14, 'paving')
    A.box('concrete', 0, 4, 0, 18, 10, 6); facade_windows(A, 0, 4, 18, 10, 1.5, 1, 4.0, step=2.6, m='window')
    lathe(A, 'concrete', [(3.2, 0), (3.0, 20), (2.6, 34), (2.8, 36), (5.2, 37)], n=12)
    for k in range(10): A.box('window', math.cos(2 * PI * k / 10) * 3.0, math.sin(2 * PI * k / 10) * 3.0, 6 + k * 2.6, 0.6, 0.6, 1.0) if False else None
    lathe(A, 'concrete', [(5.2, 37), (5.4, 37.6)], n=10)
    lathe(A, 'glass_window', [(5.2, 37.6), (6.0, 41.4)], n=10)                 # 外へ傾いた管制室の窓
    for k in range(10):
        a = 2 * PI * k / 10; A.bar('steel', (math.cos(a) * 5.2, math.sin(a) * 5.2, 37.6), (math.cos(a) * 6.0, math.sin(a) * 6.0, 41.4), 0.08, 4)
    lathe(A, 'concrete', [(6.2, 41.4), (6.2, 42.2), (0.01, 42.4)], n=10)
    A.bar('steel', (0, 0, 42.4), (0, 0, 45.4), 0.25, 6); A.box('lamp_red', 0, 0, 47.2, 0.5, 0.5, 0.5)
    A.flush()
    R = Acc()
    R.box('steel', 0, 0, 0, 0.6, 0.6, 0.8); R.add('steel', [(-2.6, -0.2, 0.9), (2.6, -0.2, 0.9), (2.2, 0.3, 2.0), (-2.2, 0.3, 2.0)], [(0, 1, 2, 3), (3, 2, 1, 0)])
    obj_at('spinY_s120_radar', R, (0, 0, 45.4))
    return 'Control', 'control_tower.glb'

# ---------- 14 水族館（3×3） ----------
def aquarium():
    begin('Aquarium', 'aqu'); std_mats()
    mat('concrete', 0xe6e4de, .7); mat('glass_window', 0x3d7fa8, .1, .4); mat('water', 0x3f8fc0, .15, .1); mat('steel', 0xc6ccd2, .35, .7); mat('whale', 0x5a7a96, .5)
    A = Acc(); ground(A, 44, 44, 'paving')
    A.box('concrete', 4, 10, 0, 60, 34, 12)
    # 波の屋根
    rows = []
    for j in range(9):
        y = -7 + 34 * j / 8
        rows.append([(x, y, 12 + 2.2 * math.sin(x / 8 + j * 0.6)) for x in [-26 + 60 * i / 24 for i in range(25)]])
    for j in range(8):
        for i in range(24): A.add('glass_window', [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]], [(0, 1, 2, 3)])
    # ガラスのドーム（大水槽）
    prof = [(16 * math.cos(PI / 2 * t), 14 * math.sin(PI / 2 * t)) for t in [k / 8 for k in range(9)]]
    lathe(A, 'glass_window', [(max(0.05, r), z) for (r, z) in prof], n=24, cx=-20, cy=-18)
    for k in range(0, 24, 3):
        a = 2 * PI * k / 24
        for i in range(8): A.bar('steel', (-20 + math.cos(a) * prof[i][0], -18 + math.sin(a) * prof[i][0], prof[i][1]), (-20 + math.cos(a) * prof[i + 1][0], -18 + math.sin(a) * prof[i + 1][0], prof[i + 1][1]), 0.12, 4)
    # 噴水の池とクジラの像
    disc(A, 'water', 9, 6, 0.2, 24, cx=16, cy=-26); sstrip(A, 'concrete', ell(9.6, 6.6, 0.0, 24, 16, -26), ell(9.6, 6.6, 0.6, 24, 16, -26))
    lathe(A, 'whale', [(0.05, 0), (1.2, 1.0), (1.6, 3.0), (1.3, 5.2), (0.6, 6.6), (0.05, 7.2)], n=10, cx=16, cy=-26, sx=1.0, sy=0.7)
    A.add('whale', [(16, -26, 7.0), (14, -26, 8.4), (18, -26, 8.4)], [(0, 1, 2), (0, 2, 1)])
    A.box('steel', 4, -7.5, 0, 20, 1.0, 5); A.box('glass_window', 4, -7.0, 0.2, 18, 0.2, 4.6)
    for i in range(7): tree(A, -40 + i * 13, 40, 0.8, 'round')
    A.flush(); return 'Aquarium', 'aquarium.glb'

# ---------- 15 遊園地（4×4、メリーゴーラウンドと観覧車が回る） ----------
def amusement_park():
    begin('Amuse', 'amz'); std_mats()
    mat('steel', 0xd8dde2, .35, .6); mat('track', 0xe8443a, .4, .4); mat('track2', 0x3a7ae8, .4, .4); mat('canopy', 0xf2c230, .5); mat('canopy2', 0xe86a7a, .5)
    mat('horse', 0xf6f2ea, .4); mat('cup', 0x6cc36a, .5); mat('concrete', 0xc8c4bb, .85)
    for i, c in enumerate([0xe8556a, 0x3fb8f0, 0xf2c230, 0x6cc36a, 0xb07ad8, 0xff8a3a]): mat(f'lamp_{i}', c, .3, 0, emit=(c, 4.0)); mat(f'cab{i}', c, .45)
    A = Acc(); ground(A, 59, 59, 'paving')
    # ジェットコースター（周回する起伏のある線路＋ループ）
    pts = []
    for i in range(80):
        t = 2 * PI * i / 80
        x = math.cos(t) * 34 + 8; y = math.sin(t) * 20 + 14; z = 4 + 10 * (0.5 + 0.5 * math.sin(3 * t)) + (14 if 0.2 < t < 1.0 else 0) * math.sin((t - 0.2) / 0.8 * PI)
        pts.append((x, y, z))
    for i in range(80):
        p, q = pts[i], pts[(i + 1) % 80]
        for o in (-0.6, 0.6):
            dx, dy = q[0] - p[0], q[1] - p[1]; L = math.hypot(dx, dy) or 1; nx, ny = -dy / L * o, dx / L * o
            A.bar('track', (p[0] + nx, p[1] + ny, p[2]), (q[0] + nx, q[1] + ny, q[2]), 0.18, 4)
        if i % 3 == 0: A.bar('steel', (p[0], p[1], 0), (p[0], p[1], p[2] - 0.2), 0.22, 4)
    lc = (30, -20)
    for k in range(24):                                            # 縦ループ
        a0, a1 = 2 * PI * k / 24, 2 * PI * (k + 1) / 24
        for o in (-0.6, 0.6): A.bar('track2', (lc[0] + o + k * 0.05, lc[1] + math.cos(a0) * 8, 9 + math.sin(a0) * 8), (lc[0] + o + (k + 1) * 0.05, lc[1] + math.cos(a1) * 8, 9 + math.sin(a1) * 8), 0.2, 4)
    for sy in (-6, 6): A.bar('steel', (lc[0], lc[1] + sy, 0), (lc[0], lc[1] + sy * 0.5, 9), 0.3, 6)
    # 落下塔
    A.bar('steel', (-38, -36, 0), (-38, -36, 48), 0.9, 8); A.box('canopy2', -38, -36, 20, 3.6, 3.6, 1.6); A.box('lamp_2', -38, -36, 48, 1.8, 1.8, 0.6)
    # コーヒーカップ
    disc(A, 'canopy', 10, 10, 0.2, 24, cx=-14, cy=-30)
    for k in range(6):
        a = 2 * PI * k / 6; lathe(A, f'cab{k}', [(0.05, 0.3), (1.6, 0.5), (1.9, 1.6)], n=10, cx=-14 + math.cos(a) * 6, cy=-30 + math.sin(a) * 6)
    A.flush()
    # メリーゴーラウンド（回る）
    M = Acc(); lathe(M, 'concrete', [(8, 0), (8, 0.8)], n=24); disc(M, 'canopy', 8, 8, 0.8, 24)
    for k in range(12):
        a = 2 * PI * k / 12; x, y = math.cos(a) * 6, math.sin(a) * 6
        M.bar('gold', (x, y, 0.8), (x, y, 5.2), 0.06, 4); M.box('horse', x, y, 1.8 + 0.5 * (k % 2), 0.5, 1.6, 1.0)
    lathe(M, 'canopy2', [(8.6, 5.2), (8.6, 5.6), (0.3, 8.6)], n=24); lathe(M, 'gold', [(0.01, 8.5), (0.5, 8.9), (0.01, 9.6)], n=8)
    for k in range(24): M.box(f'lamp_{k % 6}', math.cos(2 * PI * k / 24) * 8.7, math.sin(2 * PI * k / 24) * 8.7, 5.25, 0.35, 0.35, 0.35)
    obj_at('spinY_s50_carousel', M, (16, -32, 0.12))
    # 小さな観覧車（回る）
    W = Acc(); Rr = 15
    for dy in (-0.9, 0.9):
        for k in range(32):
            a0, a1 = 2 * PI * k / 32, 2 * PI * (k + 1) / 32
            W.bar('steel', (math.cos(a0) * Rr, dy, math.sin(a0) * Rr), (math.cos(a1) * Rr, dy, math.sin(a1) * Rr), 0.2, 4)
            W.bar(f'lamp_{(k // 4) % 6}', (math.cos(a0) * (Rr + 0.3), dy, math.sin(a0) * (Rr + 0.3)), (math.cos(a1) * (Rr + 0.3), dy, math.sin(a1) * (Rr + 0.3)), 0.1, 4)
        for k in range(0, 32, 2): W.bar('steel', (0, dy, 0), (math.cos(2 * PI * k / 32) * Rr, dy, math.sin(2 * PI * k / 32) * Rr), 0.06, 4)
    for k in range(16):
        a = 2 * PI * k / 16; x, z = math.cos(a) * Rr, math.sin(a) * Rr
        W.box(f'cab{k % 6}', x, 0, z - 2.4, 1.6, 1.6, 1.8)
    obj_at('spin_s40_wheel', W, (-38, 40, 17.5))
    B = Acc()
    for dy in (-2.4, 2.4):
        for sx in (-1, 1): B.bar('steel', (-38 + sx * 8, 40 + dy, 0), (-38, 40 + dy * 0.4, 17.5), 0.5, 6)
    for (x, y) in [(50, 50), (50, -50), (-50, -50), (10, 52), (52, 0)]: tree(B, x, y, 1.0, 'round')
    for x in (-10, 0, 10): B.box('canopy2', x, -54, 0, 6, 4, 3.2); B.box('canopy', x, -54, 3.2, 6.6, 4.6, 0.4)
    B.flush('b')
    return 'Amuse', 'amusement_park.glb'

# ---------- 16 飛行船の係留塔（3×2、飛行船が風で回る） ----------
def airship_mast():
    begin('Airship', 'air'); std_mats()
    mat('steel', 0xc6ccd2, .35, .6); mat('envelope', 0xe8e8ea, .45, .1); mat('accent', 0x2a5fb0, .5); mat('concrete', 0xc8c4bb, .85); mat('glass_window', 0x3c5468, .1, .4)
    mat('lamp_red', 0xff3020, .3, 0, emit=(0xff2010, 2.0))
    A = Acc(); ground(A, 44, 29, 'grass'); disc(A, 'concrete', 26, 26, 0.14, 32)
    for k in range(4):                                   # 格子の塔
        a = PI / 4 + PI / 2 * k; b2 = a + PI / 2
        for j in range(6):
            z0, z1 = j * 4.5, (j + 1) * 4.5; r0, r1 = 3.2 - j * 0.35, 3.2 - (j + 1) * 0.35
            A.bar('steel', (math.cos(a) * r0, math.sin(a) * r0, z0), (math.cos(a) * r1, math.sin(a) * r1, z1), 0.18, 4)
            A.bar('steel', (math.cos(a) * r0, math.sin(a) * r0, z0), (math.cos(b2) * r1, math.sin(b2) * r1, z1), 0.08, 4)
    A.box('steel', 0, 0, 27, 2.6, 2.6, 1.2); A.box('lamp_red', 0, 0, 29.5, 0.5, 0.5, 0.5); A.bar('steel', (0, 0, 28.2), (0, 0, 29.5), 0.1, 4)
    A.box('concrete', 26, 14, 0, 14, 10, 5); facade_windows(A, 26, 14, 14, 10, 1.2, 1, 3.6, step=2.6, faces=(0,))
    A.flush()
    S = Acc(); L = 52.0                                    # 飛行船：機首が塔、原点＝塔の頂
    prof = [(0.05, 0), (2.4, 1.5), (4.4, 5), (5.6, 11), (6.0, 20), (5.6, 32), (4.2, 42), (2.2, 49), (0.1, L)]
    V = []; F = []; n = 16
    for j, (r, x) in enumerate(prof):
        for i in range(n):
            a = 2 * PI * i / n; V.append((x, math.cos(a) * r, math.sin(a) * r * 0.95))
    for j in range(len(prof) - 1):
        for i in range(n): a = j * n + i; b = j * n + (i + 1) % n; F.append((a, b, b + n, a + n))
    S.add('envelope', [(p[0], p[1], p[2] - 6.2) for p in V], F)
    for (sy, sz) in ((0, 1), (0, -1), (1, 0), (-1, 0)):     # 尾翼
        S.add('accent', [(42, sy * 3.6, sz * 3.6 - 6.2), (51, sy * 1.2, sz * 1.2 - 6.2), (52, sy * 7.5, sz * 7.5 - 6.2), (46, sy * 7.5, sz * 7.5 - 6.2)], [(0, 1, 2, 3), (3, 2, 1, 0)])
    S.box('accent', 20, 0, -12.6, 8, 2.4, 1.6); S.box('glass_window', 20, 0, -12.2, 7.6, 2.5, 0.8)    # ゴンドラ
    S.add('accent', [(10, -6.05, -7.5), (34, -6.05, -7.5), (34, -6.05, -4.5), (10, -6.05, -4.5)], [(0, 1, 2, 3)])
    S.add('accent', [(10, 6.05, -7.5), (34, 6.05, -7.5), (34, 6.05, -4.5), (10, 6.05, -4.5)], [(3, 2, 1, 0)])
    obj_at('spinY_s04_airship', S, (0, 0, 28.6))
    return 'Airship', 'airship_mast.glb'

BUILDERS = {'grand_shrine': grand_shrine, 'kabukiza': kabukiza, 'castle_ruins': castle_ruins, 'japanese_garden': japanese_garden, 'clock_tower': clock_tower,
            'iron_tower': iron_tower, 'church': church, 'opera_house': opera_house, 'kencho': kencho, 'city_hall': city_hall, 'dome': dome, 'ballpark': ballpark,
            'control_tower': control_tower, 'aquarium': aquarium, 'amusement_park': amusement_park, 'airship_mast': airship_mast}
def build(name, do_export=True):
    colname, fname = BUILDERS[name]()
    nf = sum(len(o.data.polygons) for o in S_['col'].objects)
    r = export(colname, fname) if do_export else {}
    return {'name': name, 'faces': nf, **r}
