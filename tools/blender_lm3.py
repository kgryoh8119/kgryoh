# 名所の第 4 弾（24 種）。lm2.py の部品を使う。build3('名前') で作って glb に書き出す
import bpy, math, random
exec(open(r"C:\Users\kgryo\OneDrive\ドキュメント\Claude\sumucity-models\scripts\lm2.py", encoding='utf-8').read(), globals())

def cone_roof(A, m, x, y, z, r, h, n=12): lathe(A, m, [(r, z), (0.02, z + h)], n=n, cx=x, cy=y)
def cyl(A, m, x, y, z0, r, h, n=16): lathe(A, m, [(r, z0), (r, z0 + h)], n=n, cx=x, cy=y); disc(A, m, r, r, z0 + h, n, cx=x, cy=y)
def flowers(A, x0, y0, w, d, cols, rows=8):
    for i in range(rows): A.box(cols[i % len(cols)], x0, y0 - d / 2 + d * (i + 0.5) / rows, 0.12, w, d / rows * 0.7, 0.35)

# 1 キャラクターのテーマリゾート（6×6）
def mega_park():
    begin('MegaPark', 'mgp'); std_mats()
    mat('plaster', 0xf4f1ea, .7); mat('roofblue', 0x3a6ec8, .45); mat('roofpink', 0xe87aa0, .45); mat('water', 0x3f8fc0, .15, .1); mat('rock', 0xa8624a, .9)
    mat('track', 0xe8443a, .4, .4); mat('steel', 0xd8dde2, .35, .6); mat('cup', 0x6cc36a, .5); mat('canopy', 0xf2c230, .5)
    for i, c in enumerate([0xe8556a, 0x3fb8f0, 0xf2c230, 0x6cc36a, 0xb07ad8, 0xff8a3a]): mat(f'lamp_{i}', c, .3, 0, emit=(c, 4.0)); mat(f'cab{i}', c, .5)
    A = Acc(); ground(A, 89, 89, 'paving')
    disc(A, 'water', 30, 22, 0.14, 40, cx=-40, cy=40)
    # お城（中央の高い塔と四隅の塔、円錐の青い屋根）
    A.box('plaster', 0, 20, 0, 40, 26, 14); A.box('plaster', 0, 20, 14, 26, 16, 12); A.box('plaster', 0, 20, 26, 12, 10, 12)
    cone_roof(A, 'roofblue', 0, 20, 38, 7.5, 18)
    for (x, y, r, h) in [(-20, 7, 4, 26), (20, 7, 4, 26), (-20, 33, 4, 24), (20, 33, 4, 24), (-12, 12, 3, 32), (12, 12, 3, 32), (-6, 26, 2.4, 40), (6, 26, 2.4, 40)]:
        cyl(A, 'plaster', x, y, 0, r, h, 12); cone_roof(A, 'roofblue' if r > 3 else 'roofpink', x, y, h, r * 1.3, r * 3.2)
        for k in range(12): A.box(f'lamp_{k % 6}', x + math.cos(2 * PI * k / 12) * (r + 0.1), y + math.sin(2 * PI * k / 12) * (r + 0.1), h - 0.4, 0.3, 0.3, 0.3)
    A.box('window', 0, 6.9, 0.1, 8, 0.3, 9); facade_windows(A, 0, 20, 40, 26, 3, 3, 3.6, step=4, faces=(0,))
    # 岩山のコースター
    lathe(A, 'rock', [(17, 0), (14, 8), (9, 16), (4, 22), (0.5, 25)], n=10, cx=56, cy=56)
    for i in range(60):
        t0, t1 = 2 * PI * i / 60, 2 * PI * (i + 1) / 60
        p = (56 + math.cos(t0) * (19 - i * 0.15), 56 + math.sin(t0) * (19 - i * 0.15), 2 + i * 0.32); q = (56 + math.cos(t1) * (19 - (i + 1) * 0.15), 56 + math.sin(t1) * (19 - (i + 1) * 0.15), 2 + (i + 1) * 0.32)
        A.bar('track', p, q, 0.25, 4)
    # 周りの街並み（色とりどりの店）
    cols = ['cab0', 'cab1', 'cab2', 'cab3', 'cab4', 'cab5']
    for i in range(14):
        x = -70 + i * 10.5; A.box(cols[i % 6], x, -60, 0, 9, 8, 7 + (i % 3) * 2); gable(A, 'roofpink' if i % 2 else 'roofblue', cols[i % 6], x, -60, 7 + (i % 3) * 2, 9, 8, 3)
    # 入口のアーチと並木、回るティーカップ
    for sx in (-1, 1): A.box('plaster', sx * 9, -82, 0, 4, 4, 12)
    A.box('plaster', 0, -82, 12, 22, 4, 3); A.box('lamp_2', 0, -84.1, 12.5, 16, 0.2, 2)
    for i in range(10): tree(A, -86, -80 + i * 17, 1.0, 'round'); tree(A, 86, -80 + i * 17, 1.0, 'round')
    A.flush()
    M = Acc(); disc(M, 'canopy', 12, 12, 0.3, 32)
    for k in range(8):
        a = 2 * PI * k / 8; lathe(M, f'cab{k % 6}', [(0.05, 0.4), (2.2, 0.6), (2.6, 2.2)], n=10, cx=math.cos(a) * 8, cy=math.sin(a) * 8)
    obj_at('spinY_s40_cups', M, (45, -25, 0.12))
    return 'MegaPark', 'mega_park.glb'

# 2 風車とチューリップ畑（3×2）
def windmill():
    begin('Windmill', 'wml'); std_mats()
    mat('t1', 0xe0303a, .7); mat('t2', 0xf2c230, .7); mat('t3', 0xe87aa0, .7); mat('t4', 0xe2d8f0, .7); mat('water', 0x3f8fc0, .15, .1)
    mat('brickmill', 0x7a4a36, .85); mat('thatch', 0x5a4632, .9); mat('sailwood', 0x7a5a3a, .8); mat('sailcloth', 0xeee6d6, .8); mat('plaster', 0xf2efe6, .8)
    A = Acc(); ground(A, 44, 29, 'grass')
    for i in range(16): A.box(['t1', 't2', 't3', 't4'][i % 4], -36 + i * 3.6, -8, 0.12, 2.6, 34, 0.5)
    A.box('water', 0, 18, 0.06, 88, 4, 0.12)
    lathe(A, 'brickmill', [(5.0, 0), (4.6, 4), (3.8, 14), (3.4, 18)], n=8, cx=26, cy=8)
    lathe(A, 'thatch', [(4.0, 18), (3.6, 20), (1.6, 22.5), (0.05, 23)], n=8, cx=26, cy=8)
    A.box('plaster', 26, 8 - 4.5, 0.1, 1.6, 0.4, 2.4); A.box('sailwood', 26, 8, 4.0, 11, 11, 0.4)       # 回廊
    A.box('plaster', 12, 10, 0, 8, 6, 4); gable(A, 'thatch', 'plaster', 12, 10, 4, 8, 6, 3)
    A.flush()
    S = Acc()
    for k in range(4):
        a = PI / 4 + k * PI / 2; ca, sa = math.cos(a), math.sin(a)
        S.bar('sailwood', (0, 0, 0), (ca * 11, 0, sa * 11), 0.2, 4)
        p = lambda r, o: (ca * r - sa * o, -0.15, sa * r + ca * o)
        S.add('sailcloth', [p(2.5, 0.2), p(10.5, 0.2), p(10.5, 1.9), p(2.5, 1.9)], [(0, 1, 2, 3), (3, 2, 1, 0)])
    S.box('sailwood', 0, 0.6, -0.6, 1.2, 1.6, 1.2)
    obj_at('spin_s30_sails', S, (26, 8 - 4.3, 19))
    return 'Windmill', 'windmill.glb'

# 3 競艇場（5×3）
def boat_race():
    begin('BoatRace', 'btr'); std_mats()
    mat('water', 0x2f7fb0, .12, .1); mat('concrete', 0xc8c4bb, .85); mat('seat', 0x2a5fb0, .6); mat('glass_window', 0x3c5468, .1, .4); mat('steel', 0xc6ccd2, .35, .7)
    mat('buoy', 0xff8a20, .5); mat('screen', 0x10161c, .3); mat('boat1', 0xe8443a, .4); mat('boat2', 0x3fb8f0, .4); mat('boat3', 0xf2c230, .4); mat('boat4', 0xf4f2ee, .4)
    A = Acc(); ground(A, 74, 44, 'paving')
    A.box('water', 0, 8, 0.05, 140, 56, 0.12)
    for sx in (-1, 1): lathe(A, 'buoy', [(0.05, 0.2), (1.0, 0.8), (0.05, 2.0)], n=8, cx=sx * 40, cy=10)
    for i in range(6):
        x = -30 + i * 8; A.add(f'boat{i % 4 + 1}', [(x, 2, 0.3), (x + 3.6, 2.6, 0.3), (x + 3.6, 1.4, 0.3)], [(0, 1, 2)]); A.box(f'boat{i % 4 + 1}', x + 2.3, 2, 0.2, 2.6, 1.0, 0.5)
    # 大きなスタンド（正面側）
    A.box('concrete', 0, -32, 0, 110, 14, 6)
    for k in range(8): A.box('concrete', 0, -26 + k * -1.2, 6 + k * 0.7, 106, 1.2, 0.7); A.box('seat', 0, -26.4 + k * -1.2, 6.7 + k * 0.7, 104, 0.6, 0.12)
    A.box('glass_window', 0, -38, 6, 110, 2, 12); A.box('steel', 0, -32, 18, 114, 18, 0.6)
    for x in range(-50, 51, 10): A.bar('steel', (x, -40, 0), (x, -40, 18), 0.25, 6)
    A.box('steel', 50, 30, 0, 20, 2, 12); A.box('screen', 50, 28.95, 2, 18, 0.1, 9)
    A.flush(); return 'BoatRace', 'boat_race.glb'

# 4 競輪場（4×4、傾いたバンク）
def keirin():
    begin('Keirin', 'krn'); std_mats()
    mat('bank', 0xd8d2c0, .6); mat('line', 0xe8443a, .6); mat('concrete', 0xc8c4bb, .85); mat('seat', 0x2a5fb0, .6); mat('steel', 0xc6ccd2, .35, .7); mat('glass_window', 0x3c5468, .1, .4)
    A = Acc(); ground(A, 59, 59, 'paving')
    a, b = 40, 24
    sstrip(A, 'grass', ell(a - 8, b - 8, 0.14, 48), ell(a - 8, b - 8, 0.15, 48)); disc(A, 'grass', a - 8, b - 8, 0.15, 48)
    sstrip(A, 'bank', ell(a - 8, b - 8, 0.2, 48), ell(a, b, 4.0, 48), 8)
    sstrip(A, 'line', ell(a - 4.6, b - 4.6, 2.05, 48), ell(a - 4.3, b - 4.3, 2.3, 48))
    sstrip(A, 'concrete', ell(a, b, 4.0, 48), ell(a + 1, b + 1, 5.0, 48)); sstrip(A, 'concrete', ell(a + 1, b + 1, 5.0, 48), ell(a + 1, b + 1, 0.12, 48))
    for k in range(10): A.box('concrete', 0, -30 - k * 1.3, 0, 70, 1.3, 1 + k * 0.8); A.box('seat', 0, -30.3 - k * 1.3, 1 + k * 0.8, 68, 0.6, 0.12)
    A.box('glass_window', 0, -45, 0, 76, 4, 14); A.box('steel', 0, -37, 14, 78, 18, 0.5)
    for i in range(6): tree(A, -50 + i * 20, 50, 1.0, 'round')
    A.flush(); return 'Keirin', 'keirin.glb'

# 5 競馬場（5×5）
def racecourse():
    begin('Racecourse', 'rcc'); std_mats()
    mat('dirt', 0xb08a5a, .95); mat('turf', 0x5f9e48, .9); mat('rail', 0xf4f2ee, .6); mat('concrete', 0xc8c4bb, .85); mat('seat', 0x2f8a52, .6)
    mat('glass_window', 0x3c5468, .1, .4); mat('steel', 0xc6ccd2, .35, .7); mat('water', 0x3f8fc0, .15, .1); mat('horse', 0x5a3a22, .6); mat('screen', 0x10161c, .3)
    A = Acc(); ground(A, 74, 74, 'grass')
    cy = 8; a, b = 66, 46
    sstrip(A, 'dirt', ell(a - 10, b - 10, 0.16, 64, cy=cy), ell(a, b, 0.16, 64, cy=cy)); A.add('dirt', ell(a, b, 0.16, 64, cy=cy), [])
    V = ell(a, b, 0.16, 64, cy=cy); Vi = ell(a - 10, b - 10, 0.16, 64, cy=cy)
    for i in range(64): j = (i + 1) % 64; A.add('dirt', [Vi[i], Vi[j], V[j], V[i]], [(0, 1, 2, 3)])
    T0 = ell(a - 10, b - 10, 0.17, 64, cy=cy); T1 = ell(a - 18, b - 18, 0.17, 64, cy=cy)
    for i in range(64): j = (i + 1) % 64; A.add('turf', [T1[i], T1[j], T0[j], T0[i]], [(0, 1, 2, 3)])
    for r in (a, a - 10, a - 18):
        R = ell(r, r - (a - b), 0.2, 64, cy=cy); R2 = [(x, y, 1.2) for (x, y, _) in R]
        for i in range(64): j = (i + 1) % 64; A.bar('rail', R2[i], R2[j], 0.07, 4)
    disc(A, 'water', 18, 8, 0.2, 24, cy=cy)
    for k in range(6):
        t = 1.3 + k * 0.06; x, y = math.cos(t) * (a - 5), cy + math.sin(t) * (b - 5)
        A.box('horse', x, y, 0.2, 0.7, 2.2, 1.4); A.box('horse', x, y + 1.2, 1.2, 0.5, 0.8, 0.8)
    for k in range(10): A.box('concrete', 0, -44 - k * 1.3, 0, 110, 1.3, 1 + k * 0.8); A.box('seat', 0, -44.3 - k * 1.3, 1 + k * 0.8, 108, 0.6, 0.12)
    A.box('glass_window', 0, -60, 0, 116, 6, 18); A.box('concrete', 0, -60, 18, 118, 8, 2); A.box('steel', 0, -52, 20, 120, 22, 0.6)
    A.box('steel', 40, cy, 0, 2, 22, 12); A.box('screen', 38.95, cy, 2, 0.1, 20, 9)
    A.flush(); return 'Racecourse', 'racecourse.glb'

# 6 スキー場（3×3、雪山とリフト）
def ski_resort():
    begin('Ski', 'ski'); std_mats()
    mat('snow', 0xf2f4f6, .6); mat('slope', 0xffffff, .5); mat('rock', 0x8a8478, .9); mat('steel', 0x9aa0a6, .4, .6); mat('chair', 0x2a5fb0, .5); mat('wood', 0x7a5a3a, .8); mat('plaster', 0xeee6d6, .8)
    A = Acc(); ground(A, 44, 44, 'snow')
    lathe(A, 'snow', [(40, 0.1), (32, 10), (20, 24), (10, 34), (2, 40), (0.1, 41)], n=16, cx=6, cy=14)
    for k in range(3):                                           # ゲレンデ（明るい帯）
        a = -PI / 2 + (k - 1) * 0.5; pts0 = [(6 + math.cos(a) * r, 14 + math.sin(a) * r, z + 0.3) for (r, z) in [(40, 0.1), (32, 10), (20, 24), (10, 34), (3, 39.5)]]
        for i in range(4):
            p, q = pts0[i], pts0[i + 1]; w = 5 - i
            A.add('slope', [(p[0] - w, p[1], p[2]), (p[0] + w, p[1], p[2]), (q[0] + w * 0.8, q[1], q[2]), (q[0] - w * 0.8, q[1], q[2])], [(0, 1, 2, 3)])
    for i in range(12):
        a = 2 * PI * i / 12; tree(A, 6 + math.cos(a) * 34, 14 + math.sin(a) * 30, 0.9, 'cone') if math.sin(a) > -0.6 else None
    for i in range(6):                                          # リフト
        t = i / 5; x, y = -20 + 20 * t, -30 + 38 * t; z = 0.1 + 35 * t ** 0.9
        A.bar('steel', (x, y, z), (x, y, z + 7), 0.3, 6); A.box('steel', x, y, z + 7, 4, 0.4, 0.4)
        if i < 5: A.box('chair', x + 4, y + 3.8, z + 4.5, 1.4, 0.8, 0.6)
    A.bar('steel', (-18, -30, 7), (2, 8, 42), 0.06, 4); A.bar('steel', (-22, -30, 7), (-2, 8, 42), 0.06, 4)
    A.box('wood', -26, -34, 0, 14, 8, 5); gable(A, 'snow', 'wood', -26, -34, 5, 14, 8, 4)
    A.flush(); return 'Ski', 'ski_resort.glb'

# 7 超高層ビル（3×3）
def skyscraper():
    begin('Skyscraper', 'sky'); std_mats()
    mat('glass_window', 0x5a7a90, .08, .6); mat('steel', 0xd0d4d8, .3, .7); mat('lamp_crown', 0xfff4d8, .3, 0, emit=(0xfff0d0, 3.0)); mat('concrete', 0xd8d6d0, .7)
    A = Acc(); ground(A, 44, 44, 'paving')
    A.box('concrete', 0, 0, 0, 60, 50, 18); A.box('glass_window', 0, 0, 3, 60.4, 50.4, 12)
    z = 18
    for (w, h) in [(30, 70), (26, 50), (22, 40), (16, 22)]:
        A.box('glass_window', 0, 0, z, w, w, h)
        for zz in range(int(z), int(z + h), 4): A.box('steel', 0, 0, zz, w + 0.2, w + 0.2, 0.35)
        for sx in (-1, 1):
            for sy in (-1, 1): A.box('steel', sx * w / 2, sy * w / 2, z, 0.8, 0.8, h)
        A.box('steel', 0, 0, z + h, w + 1, w + 1, 1.2); A.box('lamp_crown', 0, 0, z + h + 1.2, w + 0.6, w + 0.6, 0.4)
        z += h + 1.6
    A.bar('steel', (0, 0, z), (0, 0, z + 22), 0.5, 8); A.box('lamp', 0, 0, z + 22, 0.8, 0.8, 0.8)
    for i in range(8): tree(A, -38 + i * 11, -40, 0.8, 'round')
    A.flush(); return 'Skyscraper', 'skyscraper.glb'

# 8 空中庭園のツインタワー（2×2）
def sky_garden():
    begin('SkyGarden', 'skg'); std_mats()
    mat('glass_window', 0x8aa4b4, .08, .6); mat('steel', 0xd0d4d8, .3, .7); mat('lamp_ring', 0xbfe0ff, .3, 0, emit=(0xbfe0ff, 3.0))
    A = Acc(); ground(A, 29, 29, 'paving')
    H = 110
    for sx in (-1, 1):
        A.box('glass_window', sx * 10, 0, 0, 12, 22, H)
        for z in range(0, H, 4): A.box('steel', sx * 10, 0, z, 12.3, 22.3, 0.3)
    A.box('steel', 0, 0, H, 40, 24, 3); A.box('glass_window', 0, 0, H + 3, 36, 20, 4); A.box('steel', 0, 0, H + 7, 40, 24, 0.6)
    sstrip(A, 'lamp_ring', ell(11, 11, H - 0.2, 32), ell(11, 11, H + 0.6, 32))
    lathe(A, 'glass_window', [(9, H + 7.6), (9, H + 9.6)], n=24); A.box('grass', 0, 0, H + 7.6, 30, 18, 0.2)
    for z in (35, 70):
        A.box('steel', 0, 0, z, 9, 4, 3); A.box('glass_window', 0, 0, z + 0.3, 8.4, 4.2, 2.4)
    for i in range(6): tree(A, -24 + i * 9.6, -24, 0.7, 'round')
    A.flush(); return 'SkyGarden', 'sky_garden.glb'

# 9 未来都市タワー（3×3、ねじれた塔）
def future_tower():
    begin('Future', 'fut'); std_mats()
    mat('glass_window', 0x6a8aa8, .06, .7); mat('steel', 0xe2e6ea, .25, .8); mat('lamp_led', 0x7ad8ff, .3, 0, emit=(0x7ad8ff, 4.0))
    A = Acc(); ground(A, 44, 44, 'paving'); disc(A, 'grass', 30, 30, 0.14, 32)
    N = 46
    for k in range(N):
        z = 4 + k * 4; a = k * 0.06; s = 22 - 8 * (k / N) ** 1.4
        c, sn = math.cos(a), math.sin(a)
        P = [(c * x - sn * y, sn * x + c * y) for (x, y) in [(-s / 2, -s / 2), (s / 2, -s / 2), (s / 2, s / 2), (-s / 2, s / 2)]]
        A.add('glass_window', [(p[0], p[1], z) for p in P] + [(p[0], p[1], z + 3.6) for p in P], [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
        A.add('steel' if k % 6 else 'lamp_led', [(p[0] * 1.04, p[1] * 1.04, z + 3.6) for p in P] + [(p[0] * 1.04, p[1] * 1.04, z + 4.0) for p in P], [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)])
    zt = 4 + N * 4
    A.bar('steel', (0, 0, zt), (0, 0, zt + 30), 0.6, 8); A.box('lamp', 0, 0, zt + 30, 1, 1, 1)
    lathe(A, 'steel', [(14, 0), (14, 4), (11, 4.2)], n=24)
    A.flush(); return 'Future', 'future_tower.glb'

# 10 万博会場（6×5、木の大屋根リング）
def expo_site():
    begin('Expo', 'exp'); std_mats()
    mat('wood', 0xa8784a, .8); mat('wood_dark', 0x7a5232, .8); mat('pav1', 0xe8556a, .5); mat('pav2', 0x3fb8f0, .45); mat('pav3', 0xf2c230, .5); mat('pav4', 0xf4f2ee, .4)
    mat('glass_window', 0x6a8aa8, .06, .6); mat('water', 0x3f8fc0, .15, .1); mat('steel', 0xd0d4d8, .3, .7)
    A = Acc(); ground(A, 89, 74, 'paving'); disc(A, 'grass', 34, 30, 0.14, 40)
    R0, R1, Hh = 60, 70, 16
    sstrip(A, 'wood', ell(R0, R0 * 0.85, Hh, 72), ell(R1, R1 * 0.85, Hh + 2.0, 72), 6)            # 大屋根（上を歩ける）
    sstrip(A, 'grass', ell(R0 + 1, R0 * 0.85 + 1, Hh + 1.1, 72), ell(R1 - 1, R1 * 0.85 - 1, Hh + 2.1, 72), 6)
    sstrip(A, 'wood_dark', ell(R1, R1 * 0.85, Hh + 2.0, 72), ell(R1, R1 * 0.85, Hh - 0.6, 72))
    for i in range(72):
        a = 2 * PI * i / 72
        for r in (R0 + 1, R1 - 1):
            x, y = math.cos(a) * r, math.sin(a) * r * 0.85
            A.box('wood', x, y, 0, 1.0, 1.0, Hh)
        if i % 2 == 0:
            x0, y0 = math.cos(a) * (R0 + 1), math.sin(a) * (R0 + 1) * 0.85; x1, y1 = math.cos(a) * (R1 - 1), math.sin(a) * (R1 - 1) * 0.85
            for z in (6, 11): A.box('wood_dark', (x0 + x1) / 2, (y0 + y1) / 2, z, abs(x1 - x0) + 0.8, abs(y1 - y0) + 0.8, 0.6)
    # パビリオン（形さまざま）
    for i, (x, y, kind) in enumerate([(-30, -18, 'dome'), (28, -20, 'box'), (-34, 20, 'cone'), (30, 18, 'twist'), (0, 34, 'box'), (0, -36, 'dome'), (-46, 0, 'box'), (46, 0, 'cone')]):
        m = ['pav1', 'pav2', 'pav3', 'pav4'][i % 4]
        if kind == 'dome': lathe(A, m, [(9 * math.cos(PI / 2 * t), 9 * math.sin(PI / 2 * t)) for t in [k / 6 for k in range(7)]], n=16, cx=x, cy=y)
        elif kind == 'cone': lathe(A, m, [(8, 0), (6, 8), (0.3, 16)], n=12, cx=x, cy=y)
        elif kind == 'twist':
            for k in range(8): A.box(m, x + math.cos(k * 0.3) * 1.5, y + math.sin(k * 0.3) * 1.5, k * 2, 12 - k * 0.6, 12 - k * 0.6, 2)
        else: A.box(m, x, y, 0, 14, 10, 10); A.box('glass_window', x, y - 5.1, 1, 12, 0.2, 7)
    disc(A, 'water', 14, 10, 0.2, 24)
    A.bar('steel', (0, 0, 0), (0, 0, 40), 0.8, 8); lathe(A, 'pav1', [(0.01, 34), (4, 37), (0.01, 42)], n=12)      # シンボル
    A.flush(); return 'Expo', 'expo_site.glb'

# 11 凱旋門風の門（2×1）
def triumph_gate():
    begin('Gate', 'gat'); std_mats(); mat('stone', 0xd8ccb0, .85); mat('stone_dark', 0xb4a688, .85); mat('iron', 0x2b2e31, .5, .5)
    A = Acc(); ground(A, 29, 14, 'paving')
    W, D, H = 24, 11, 26
    for sx in (-1, 1): A.box('stone', sx * 8, 0, 0, 8, D, 18)
    A.box('stone', 0, 0, 18, W, D, 8); A.box('stone_dark', 0, 0, 23, W + 0.6, D + 0.6, 1.0); A.box('stone', 0, 0, 24, W - 0.4, D - 0.4, 2.4)
    pts = [(math.cos(PI * k / 16) * 4, 0, 12 + math.sin(PI * k / 16) * 5) for k in range(17)]
    for sy in (-D / 2 - 0.05, D / 2 + 0.05):
        A.add('stone_dark', [(x, sy, z) for (x, _, z) in pts] + [(-4, sy, 18), (4, sy, 18)], [tuple([17] + list(range(16, -1, -1)) + [18])] if False else [])
        for k in range(16): A.bar('stone_dark', (pts[k][0], sy, pts[k][2]), (pts[k + 1][0], sy, pts[k + 1][2]), 0.35, 4)
        for sx in (-1, 1):
            A.box('gold', sx * 8, sy, 4, 5, 0.2, 7); A.box('stone_dark', sx * 8, sy, 13, 6.5, 0.3, 0.6)
    for sx in (-1, 1): A.box('stone', sx * 8, 0, 18, 8, D, 0.1)
    A.box('stone', 0, 0, 0, 0.1, 0.1, 0.1)
    for x in (-20, 20): lamp_post(A, x, -10)
    A.flush(); return 'Gate', 'triumph_gate.glb'

# 12 ピラミッド形の展示館（3×3）
def pyramid_hall():
    begin('Pyramid', 'pyr'); std_mats(); mat('glass_window', 0x7a9ab0, .06, .6); mat('steel', 0xd0d4d8, .3, .7); mat('water', 0x3f8fc0, .12, .1); mat('stone', 0xd8d0c0, .8)
    A = Acc(); ground(A, 44, 44, 'stone')
    def pyr(x, y, s, h):
        a = s / 2; base = [(x - a, y - a, 0.2), (x + a, y - a, 0.2), (x + a, y + a, 0.2), (x - a, y + a, 0.2)]
        for i in range(4):
            A.add('glass_window', [base[i], base[(i + 1) % 4], (x, y, h)], [(0, 1, 2)])
            for k in range(1, 6):
                t = k / 6; p = [(bx + (x - bx) * t, by + (y - by) * t, 0.2 + (h - 0.2) * t) for (bx, by, _) in base]
                A.bar('steel', p[i], p[(i + 1) % 4], 0.06, 4)
            A.bar('steel', base[i], (x, y, h), 0.1, 4)
    pyr(0, 4, 34, 22)
    for (x, y) in [(-26, -24), (26, -24)]: pyr(x, y, 8, 5)
    for (x, y) in [(-14, -24), (14, -24), (-30, 10), (30, 10)]: A.box('water', x, y, 0.15, 12, 8, 0.15); A.box('stone', x, y, 0, 12.6, 8.6, 0.1)
    A.flush(); return 'Pyramid', 'pyramid_hall.glb'

# 13 実物大ロボット像（2×2、オリジナルの意匠）
def giant_robot():
    begin('Robot', 'rbt'); std_mats()
    mat('armor', 0xeef0f2, .4, .3); mat('armor2', 0x2a5fb0, .4, .3); mat('armor3', 0xd8402e, .4, .3); mat('joint', 0x5a6068, .4, .6); mat('lamp_eye', 0x7affc8, .3, 0, emit=(0x7affc8, 4.0)); mat('concrete', 0xc8c4bb, .85)
    A = Acc(); ground(A, 29, 29, 'paving'); A.box('concrete', 0, 0, 0, 16, 12, 1.2)
    z0 = 1.2
    for sx in (-1, 1):                                          # 脚
        A.box('armor2', sx * 2.4, 0, z0, 2.6, 4.2, 1.4); A.box('armor', sx * 2.4, 0, z0 + 1.4, 2.2, 2.8, 5.0); A.box('joint', sx * 2.4, 0, z0 + 6.4, 1.6, 1.6, 0.8)
        A.box('armor', sx * 2.4, 0, z0 + 7.2, 2.4, 2.6, 4.6); A.box('armor3', sx * 2.4, -1.35, z0 + 2.6, 1.4, 0.2, 1.6)
    A.box('joint', 0, 0, z0 + 11.8, 4.6, 2.2, 1.2); A.box('armor2', 0, 0, z0 + 13, 7.2, 4.0, 4.2)          # 腰・胴
    A.box('armor', 0, 0, z0 + 17.2, 8.4, 4.6, 3.6); A.box('armor3', 0, -2.35, z0 + 17.8, 3.0, 0.2, 2.0)
    for sx in (-1, 1):                                          # 肩と腕
        A.box('armor', sx * 5.6, 0, z0 + 18.4, 3.0, 3.4, 2.8); A.box('joint', sx * 5.6, 0, z0 + 15.4, 1.4, 1.4, 3.0)
        A.box('armor', sx * 5.6, -0.6, z0 + 11.6, 2.0, 2.4, 3.8); A.box('joint', sx * 5.6, -0.8, z0 + 10.6, 1.6, 1.8, 1.0)
    A.box('joint', 0, 0, z0 + 20.8, 1.6, 1.6, 0.8); A.box('armor', 0, 0, z0 + 21.6, 2.8, 3.0, 2.6)          # 頭（丸い一つ目）
    A.box('lamp_eye', 0, -1.55, z0 + 22.6, 1.8, 0.2, 0.6); A.box('armor2', 0, 0, z0 + 24.2, 0.6, 2.4, 0.9)
    for (x, y) in [(-12, -12), (12, -12)]: A.bar('joint', (x, y, 0.1), (x, y, 3), 0.15, 6); A.box('lamp', x, y, 3, 1, 1, 0.6)
    A.flush(); return 'Robot', 'giant_robot.glb'

# 14 赤レンガ倉庫（4×1）
def red_brick():
    begin('RedBrick', 'rbk'); std_mats()
    bc = bpy.data.materials.get('stn_brick'); S_['M']['brick'] = bc if bc else mat('brick', 0xa24a36, .85)
    mat('roofgrey', 0x5a6068, .5, .2); mat('stone', 0xd8d0c0, .8); mat('iron', 0x2b2e31, .5, .5)
    A = Acc(); ground(A, 59, 14, 'paving')
    for cx in (-15, 15):
        A.boxt('brick', cx, 1, 0, 26, 10, 9, 3.2); gable(A, 'roofgrey', 'brick', cx, 1, 9, 26, 10, 2.6, 0.4)
        for i in range(8):
            x = cx - 11 + i * 3.1
            for sy in (-1, 1):
                A.box('window', x, 1 + sy * 5.05, 1.2, 1.4, 0.12, 2.6); A.box('window', x, 1 + sy * 5.05, 5.4, 1.2, 0.12, 2.0)
                A.box('stone', x, 1 + sy * 5.1, 3.9, 1.8, 0.12, 0.3); A.box('iron', x, 1 + sy * 5.6, 4.3, 2.2, 1.0, 0.12) if i % 2 == 0 else None
        A.box('stone', cx, 1, 9, 26.4, 10.4, 0.25)
    for x in range(-52, 53, 8): lamp_post(A, x, -10)
    A.flush(); return 'RedBrick', 'red_brick.glb'

# 15 洋館（異人館、2×2）
def western_house():
    begin('Western', 'wst'); std_mats()
    mat('siding', 0xcfe0cc, .7); mat('trim', 0xf6f4ee, .6); mat('roofslate', 0x6a3a32, .6); mat('brickchim', 0x8a4a36, .8); mat('fence', 0xf6f4ee, .6); mat('iron', 0x2b2e31, .5, .5)
    A = Acc(); ground(A, 29, 29, 'grass'); A.box('paving', 0, -18, 0.13, 4, 22, 0.05)
    A.box('trim', 0, 4, 0, 18, 12, 0.8); A.box('siding', 0, 4, 0.8, 16, 10, 9)
    for z in (0.8, 5.2): A.box('trim', 0, 4, z, 16.3, 10.3, 0.3)
    facade_windows(A, 0, 4, 16, 10, 1.4, 2, 4.4, step=3.2, ww=1.2)
    A.box('siding', -5, -2, 0.8, 5, 3, 7); hip(A, 'roofslate', -5, -2, 7.8, 5.4, 3.4, 2.2)          # 張り出し窓
    A.box('trim', 3, -2.5, 0.8, 8, 3, 0.3); A.box('trim', 3, -2.5, 4.6, 8.4, 3.4, 0.3)
    for x in (-0.6, 3, 6.6): A.bar('trim', (x, -3.8, 0.8), (x, -3.8, 4.6), 0.12, 6)
    hip(A, 'roofslate', 0, 4, 9.8, 17, 11, 4.5, ins=4.4); A.box('brickchim', 4, 6, 11, 1.2, 1.2, 5)
    A.box('roofslate', -2, 4, 14.3, 1.6, 1.6, 2.4); hip(A, 'roofslate', -2, 4, 16.7, 1.8, 1.8, 1.4, ins=0.88)
    A.bar('iron', (-2, 4, 18.1), (-2, 4, 19.5), 0.05, 4)
    for x in range(-26, 27, 2): A.box('fence', x, -27, 0.1, 0.15, 0.15, 1.2)
    A.box('fence', 0, -27, 1.0, 54, 0.12, 0.12)
    for (x, y) in [(-20, -10), (20, -10), (-22, 18), (22, 18)]: tree(A, x, y, 0.9, 'round')
    A.flush()
    W = Acc(); W.add('iron', [(-0.6, 0, 0.2), (0.6, 0, 0.2), (0.4, 0, 0.9), (-0.2, 0, 1.0)], [(0, 1, 2, 3), (3, 2, 1, 0)]); W.bar('iron', (0, -0.6, 0), (0, 0.6, 0), 0.03, 4)
    obj_at('spinY_s15_rooster', W, (-2, 4, 19.5))
    return 'Western', 'western_house.glb'

# 16 町家の街並み（4×2）
def machiya():
    begin('Machiya', 'mch'); std_mats()
    mat('kawara', 0x5a5e63, .6, .1); mat('soffit', 0x3a2a20, .8); mat('ridge', 0x45494d, .6); mat('lattice', 0x5a3a22, .8); mat('plaster', 0xe8dcc0, .85); mat('noren', 0x1f3a6b, .7)
    mat('lantern', 0xf4e8c8, .5, 0, emit=(0xffd890, 0.0)); mat('stonepath', 0xa49d90, .9)
    A = Acc(); ground(A, 59, 29, 'stonepath')
    for i in range(8):
        x = -52 + i * 14.8; h = 7 if i % 3 else 8
        A.box('plaster', x, 8, 0, 14, 14, h)
        for k in range(16): A.box('lattice', x - 6.4 + k * 0.85, 1.0 - 0.05, 0.3, 0.12, 0.12, 3.4)              # 格子
        A.box('lattice', x, 0.95, 3.7, 14, 0.2, 0.3); A.box('noren', x - 3, 0.85, 1.6, 2.4, 0.06, 1.6)
        A.add('kawara', [(x - 7.1, -0.6, 3.6), (x + 7.1, -0.6, 3.6), (x + 7.1, 1.2, 4.6), (x - 7.1, 1.2, 4.6)], [(0, 1, 2, 3)], [(0, 0), (14.2 / 4.8, 0), (14.2 / 4.8, 2 / 4.8), (0, 2 / 4.8)])  # 一階のひさし
        for k in range(10): A.box('lattice', x - 5 + k * 1.1, 1.0, 4.9, 0.1, 0.1, h - 5.4)                     # 虫籠窓
        gable(A, 'kawara', 'plaster', x, 8, h, 14, 14, 3.0, 0.5)
        lathe(A, 'lantern', [(0.05, 2.4), (0.35, 2.6), (0.35, 3.2), (0.05, 3.4)], n=8, cx=x + 4.5, cy=0.4)
    A.flush(); return 'Machiya', 'machiya.glb'

# 17 天文台（2×2、ドームが回る）
def observatory():
    begin('Observatory', 'obs'); std_mats(); mat('plaster', 0xeef0f2, .6); mat('dome', 0xd8dde2, .3, .6); mat('slit', 0x1a1e24, .5); mat('steel', 0x9aa0a6, .4, .6)
    A = Acc(); ground(A, 29, 29, 'grass')
    A.box('plaster', 0, 8, 0, 22, 10, 6); facade_windows(A, 0, 8, 22, 10, 1.5, 1, 4, step=3, faces=(0,))
    cyl(A, 'plaster', 0, -4, 0, 7, 9, 24)
    cyl(A, 'plaster', -12, -14, 0, 3, 4, 12); lathe(A, 'dome', [(3.1 * math.cos(PI / 2 * t), 4 + 3.1 * math.sin(PI / 2 * t)) for t in [k / 5 for k in range(6)]], n=12, cx=-12, cy=-14)
    A.flush()
    D = Acc()
    prof = [(7.2 * math.cos(PI / 2 * t), 7.2 * math.sin(PI / 2 * t)) for t in [k / 8 for k in range(9)]]
    lathe(D, 'dome', prof, n=24, a0=0.35, a1=2 * PI - 0.35)
    for i in range(8):
        (r0, z0), (r1, z1) = prof[i], prof[i + 1]
        D.add('slit', [(r0, -1.2, z0), (r1, -1.2 * (r1 / 7.2) - 0.2, z1), (r1, 1.2 * (r1 / 7.2) + 0.2, z1), (r0, 1.2, z0)], [(0, 1, 2, 3), (3, 2, 1, 0)])
    D.bar('steel', (0, 0, 2), (4.5, 0, 6), 0.7, 10)
    obj_at('spinY_s05_dome', D, (0, -4, 9))
    return 'Observatory', 'observatory.glb'

# 18 植物園（4×4、ガラスの大温室）
def botanical():
    begin('Botanical', 'bot'); std_mats(); mat('glass_window', 0xa8c8d0, .05, .5); mat('steel', 0xf0f2f4, .3, .6); mat('water', 0x3f8fc0, .12, .1)
    mat('f1', 0xe0303a, .7); mat('f2', 0xf2c230, .7); mat('f3', 0xb07ad8, .7); mat('f4', 0xf4f2ee, .7)
    A = Acc(); ground(A, 59, 59, 'grass'); A.box('paving', 0, -30, 0.13, 6, 58, 0.05); A.box('paving', 0, -10, 0.13, 100, 5, 0.05)
    prof = [(22 * math.cos(PI / 2 * t), 18 * math.sin(PI / 2 * t)) for t in [k / 10 for k in range(11)]]
    lathe(A, 'glass_window', [(max(0.1, r), z) for (r, z) in prof], n=32, cx=0, cy=20, sx=1.3, sy=1.0)
    for k in range(0, 32, 2):
        a = 2 * PI * k / 32
        for i in range(10): A.bar('steel', (math.cos(a) * prof[i][0] * 1.3, 20 + math.sin(a) * prof[i][0], prof[i][1]), (math.cos(a) * prof[i + 1][0] * 1.3, 20 + math.sin(a) * prof[i + 1][0], prof[i + 1][1]), 0.12, 4)
    for i in (3, 6): sstrip(A, 'steel', ell(prof[i][0] * 1.3, prof[i][0], prof[i][1], 32, cy=20), ell(prof[i][0] * 1.3 + 0.1, prof[i][0] + 0.1, prof[i][1] + 0.3, 32, cy=20))
    for i in range(6): tree(A, -10 + (i % 3) * 10, 14 + (i // 3) * 10, 1.2, 'round')
    for (x, y) in [(-34, -30), (34, -30), (-34, 10), (34, 10)]: flowers(A, x, y, 16, 14, ['f1', 'f2', 'f3', 'f4'])
    disc(A, 'water', 10, 6, 0.2, 24, cx=0, cy=-30)
    for i in range(10): tree(A, -54 + i * 12, 54, 1.0, 'cone')
    A.flush(); return 'Botanical', 'botanical.glb'

# 19 動物園（4×4）
def zoo():
    begin('Zoo', 'zoo'); std_mats()
    mat('fence', 0x8a7a5a, .8); mat('water', 0x3f8fc0, .12, .1); mat('giraffe', 0xd8a84a, .7); mat('elephant', 0x8a8c90, .8); mat('zebra', 0xf0f0f0, .7); mat('lion', 0xc8903a, .7)
    mat('sand', 0xd8c49a, .95); mat('plaster', 0xeee6d6, .8); mat('roofg', 0x4f7f3f, .7)
    A = Acc(); ground(A, 59, 59, 'grass'); A.box('paving', 0, 0, 0.13, 8, 116, 0.05); A.box('paving', 0, 0, 0.13, 116, 8, 0.05)
    def pen(cx, cy, w, d, floor):
        A.box(floor, cx, cy, 0.12, w, d, 0.05)
        for (x0, y0, x1, y1) in [(-w / 2, -d / 2, w / 2, -d / 2), (w / 2, -d / 2, w / 2, d / 2), (w / 2, d / 2, -w / 2, d / 2), (-w / 2, d / 2, -w / 2, -d / 2)]:
            A.bar('fence', (cx + x0, cy + y0, 1.4), (cx + x1, cy + y1, 1.4), 0.08, 4)
            L = math.dist((x0, y0), (x1, y1))
            for k in range(int(L / 3) + 1): t = k / max(1, int(L / 3)); A.bar('fence', (cx + x0 + (x1 - x0) * t, cy + y0 + (y1 - y0) * t, 0.1), (cx + x0 + (x1 - x0) * t, cy + y0 + (y1 - y0) * t, 1.5), 0.08, 4)
    def quad(m, x, y, s, neck=0.0, h=1.0):
        A.box(m, x, y, 1.0 * s * h, 1.2 * s, 2.6 * s, 1.2 * s)
        for sx in (-0.4, 0.4):
            for sy in (-0.9, 0.9): A.box(m, x + sx * s, y + sy * s, 0.12, 0.3 * s, 0.3 * s, 1.0 * s * h)
        if neck: A.bar(m, (x, y - 1.2 * s, 1.8 * s * h), (x, y - 1.6 * s, (1.8 + neck) * s * h), 0.18 * s, 4); A.box(m, x, y - 1.9 * s, (1.6 + neck) * s * h, 0.4 * s, 0.9 * s, 0.4 * s)
        else: A.box(m, x, y - 1.6 * s, 1.4 * s * h, 0.9 * s, 0.9 * s, 0.9 * s)
    pen(-30, -30, 40, 36, 'sand'); [quad('giraffe', -36 + i * 7, -30 + (i % 2) * 6, 1.4, neck=3.5, h=1.6) for i in range(3)]
    pen(30, -30, 40, 36, 'sand'); [quad('elephant', 26 + i * 9, -32 + (i % 2) * 8, 2.2) for i in range(2)]; disc(A, 'water', 6, 4, 0.2, 16, cx=40, cy=-20)
    pen(-30, 30, 40, 36, 'grass'); [quad('zebra', -40 + i * 6, 28 + (i % 2) * 5, 1.1) for i in range(4)]
    pen(30, 30, 40, 36, 'sand'); [quad('lion', 26 + i * 7, 30, 1.0) for i in range(2)]; lathe(A, 'fence', [(5, 0.1), (3, 3), (0.5, 4)], n=6, cx=38, cy=38)
    A.box('plaster', 0, -52, 0, 20, 6, 4); gable(A, 'roofg', 'plaster', 0, -52, 4, 20, 6, 2)
    for i in range(14): tree(A, -56 + i * 8.6, 56, 0.9, 'round')
    A.flush(); return 'Zoo', 'zoo.glb'

# 20 古代遺跡（前方後円墳と堀、4×3）
def ancient_ruins():
    begin('Kofun', 'kfn'); std_mats(); mat('water', 0x3f7fa6, .12, .1); mat('mound', 0x4f7f3f, .9); mat('haniwa', 0xc8784a, .8); mat('gravel', 0xd9d4c8, .95)
    A = Acc(); ground(A, 59, 44, 'grass')
    # 鍵穴形：後ろの円（後円部）＋前の台形（前方部）。堀もその形で外へ広げる
    def keyhole(o, z):
        pts = []
        for i in range(25): a = -PI * 0.2 + PI * 1.4 * i / 24; pts.append((math.cos(a) * (16 + o), 8 + math.sin(a) * (16 + o) * 0 + math.sin(a) * (16 + o), z))
        pts = [(x, y, z) for (x, y, z) in pts]
        front = [(-(14 + o), -26 - o, z), ((14 + o), -26 - o, z)]
        return [pts[i] for i in range(25)] + [front[0], front[1]]
    def kh(o, z):
        P = []
        for i in range(33):
            a = -PI * 0.15 + (PI * 1.3) * i / 32; P.append((math.cos(a) * (16 + o), 10 + math.sin(a) * (16 + o), z))
        P += [(-(15 + o), -24 - o, z), ((15 + o), -24 - o, z)]
        return P
    for (o, z, m) in [(10, 0.14, 'water')]:
        P = kh(o, z); n = len(P); A.add(m, P + [(0, 0, z)], [(n, (i + 1) % n, i) for i in range(n)])
    levels = [(1, 0.2), (-1, 3), (-3.5, 6), (-6, 9)]
    for k in range(len(levels) - 1):
        (o0, z0), (o1, z1) = levels[k], levels[k + 1]
        P0, P1 = kh(o0, z0), kh(o1, z1); n = len(P0)
        for i in range(n): j = (i + 1) % n; A.add('mound', [P0[i], P0[j], P1[j], P1[i]], [(0, 1, 2, 3)])
    P = kh(-6, 9); n = len(P); A.add('mound', P + [(0, 0, 9)], [(n, (i + 1) % n, i) for i in range(n)])
    import random as _r; rr = _r.Random(2)
    for i in range(40):
        a = 2 * PI * i / 40; x, y = math.cos(a) * 15, 10 + math.sin(a) * 15
        if y > -6: lathe(A, 'haniwa', [(0.35, 0.2), (0.4, 1.0), (0.25, 1.4)], n=6, cx=x, cy=y)
    for i in range(30):
        x, y = rr.uniform(-56, 56), rr.uniform(-40, 40)
        if abs(x) < 30 and -40 < y < 32: continue
        tree(A, x, y, rr.uniform(0.9, 1.3), 'round')
    A.box('gravel', 0, -38, 0.14, 8, 10, 0.05)
    A.flush(); return 'Kofun', 'ancient_ruins.glb'

# 21 大学のキャンパス（4×4、時計台の本館）
def university():
    begin('University', 'uni'); std_mats()
    bc = bpy.data.materials.get('stn_brick'); S_['M']['brick'] = bc if bc else mat('brick', 0xa24a36, .85)
    mat('stone', 0xd8d0c0, .8); mat('roofgreen', 0x4f7f6a, .5, .2); mat('ginkgo', 0xd8b02a, .8); mat('clockface', 0xf4ecd6, .4, 0, emit=(0xfff2c8, 0.0))
    A = Acc(); ground(A, 59, 59, 'grass'); A.box('paving', 0, -30, 0.13, 8, 58, 0.05)
    A.boxt('brick', 0, 26, 0, 70, 16, 14, 3.2); facade_windows(A, 0, 26, 70, 16, 1.5, 3, 4.2, step=3.2, faces=(0,))
    hip(A, 'roofgreen', 0, 26, 14, 71, 17, 4)
    A.boxt('brick', 0, 16, 0, 14, 12, 30, 3.2); A.box('stone', 0, 16, 30, 15, 13, 1)                     # 時計台
    for sy in (-1,):
        cv = [(math.cos(2 * PI * i / 24) * 2.6, 16 + sy * 6.07, 24 + math.sin(2 * PI * i / 24) * 2.6) for i in range(24)] + [(0, 16 + sy * 6.07, 24)]
        A.add('clockface', cv, [(24, (i + 1) % 24, i) for i in range(24)])
    hip(A, 'roofgreen', 0, 16, 31, 14, 12, 7, ins=5.6); A.bar('gold', (0, 16, 38), (0, 16, 41), 0.08, 4)
    A.box('stone', 0, 9.6, 0, 8, 1, 8); A.box('window', 0, 9.5, 0.2, 4, 0.2, 6)
    for sx in (-1, 1):
        A.boxt('brick', sx * 40, -8, 0, 16, 40, 12, 3.2); facade_windows(A, sx * 40, -8, 16, 40, 1.5, 3, 3.6, step=3.2, faces=(1, 3)); hip(A, 'roofgreen', sx * 40, -8, 12, 17, 41, 3.5)
    for i in range(8):
        for sx in (-1, 1):
            y = -50 + i * 6; A.bar('trunk', (sx * 7, y, 0.1), (sx * 7, y, 2), 0.2, 5); lathe(A, 'ginkgo', [(0.2, 1.8), (2.0, 3), (1.5, 6), (0.1, 7)], n=7, cx=sx * 7, cy=y)
    A.flush(); return 'University', 'university.glb'

# 22 宇宙ホテルの受付センター（2×2、発射台のロケット）
def orbital_hotel():
    begin('Orbital', 'orb'); std_mats(); mat('rocket', 0xf2f4f6, .35, .3); mat('rocket2', 0x1a1e24, .4); mat('steel', 0xd8402e, .5, .5); mat('glass_window', 0x6a8aa8, .06, .6); mat('concrete', 0xc8c4bb, .85)
    mat('lamp_red', 0xff3020, .3, 0, emit=(0xff2010, 2.0))
    A = Acc(); ground(A, 29, 29, 'paving')
    lathe(A, 'concrete', [(14, 0), (14, 2), (12, 2.2)], n=24, cx=-8, cy=6) if False else None
    cyl(A, 'glass_window', 10, -14, 0, 9, 6, 24); lathe(A, 'rocket', [(9.4, 6), (6, 9), (0.1, 10)], n=24, cx=10, cy=-14)
    A.box('concrete', -6, 8, 0, 14, 14, 3)
    lathe(A, 'rocket', [(1.8, 3), (1.8, 34), (1.4, 38), (0.6, 41), (0.05, 42.5)], n=16, cx=-6, cy=8)
    lathe(A, 'rocket2', [(1.82, 18), (1.82, 20)], n=16, cx=-6, cy=8); lathe(A, 'rocket2', [(1.42, 37.6), (1.0, 39.5)], n=16, cx=-6, cy=8)
    for k in range(4):
        a = PI / 4 + k * PI / 2; A.add('rocket2', [(-6 + math.cos(a) * 1.8, 8 + math.sin(a) * 1.8, 3), (-6 + math.cos(a) * 4, 8 + math.sin(a) * 4, 3), (-6 + math.cos(a) * 1.8, 8 + math.sin(a) * 1.8, 9)], [(0, 1, 2), (2, 1, 0)])
    for z in range(3, 44, 4): A.box('steel', -1.6, 8, z, 2.4, 2.4, 0.3)
    for (dx, dy) in [(-0.4, -0.4), (0.4, -0.4), (0.4, 0.4), (-0.4, 0.4)]: A.bar('steel', (-1.6 + dx * 2.4, 8 + dy * 2.4, 3), (-1.6 + dx * 2.4, 8 + dy * 2.4, 44), 0.12, 4)
    A.box('steel', -3.2, 8, 30, 1.8, 0.8, 0.6); A.box('lamp_red', -1.6, 8, 44.2, 0.5, 0.5, 0.5)
    A.flush(); return 'Orbital', 'orbital_hotel.glb'

# 23 月面基地の管制所（3×2）
def moon_base():
    begin('MoonBase', 'mnb'); std_mats(); mat('regolith', 0x9a9894, .95); mat('crater', 0x7a7874, .95); mat('module', 0xeef0f2, .4, .3); mat('panel', 0x2a3a6a, .2, .5); mat('steel', 0xb0b4b8, .4, .6); mat('glass_window', 0x6a8aa8, .06, .6)
    A = Acc(); ground(A, 44, 29, 'regolith')
    for (x, y, r) in [(-30, -14, 6), (28, 16, 4), (-10, 18, 3), (34, -18, 5)]: sstrip(A, 'crater', ell(r, r, 0.12, 16, x, y), ell(r + 1, r + 1, 0.6, 16, x, y)); disc(A, 'crater', r, r, 0.1, 16, cx=x, cy=y)
    for (x, y, r) in [(-12, 0, 8), (6, 4, 6), (20, -6, 5)]:
        lathe(A, 'module', [(r * math.cos(PI / 2 * t), r * math.sin(PI / 2 * t) * 0.8) for t in [k / 6 for k in range(7)]], n=16, cx=x, cy=y)
        sstrip(A, 'glass_window', ell(r * 0.98, r * 0.98, 1.0, 16, x, y), ell(r * 0.97, r * 0.97, 1.8, 16, x, y))
    A.box('module', -3, 2, 0, 6, 2.4, 2.4); A.box('module', 13, -1, 0, 6, 2.4, 2.4)
    for i in range(4): A.box('panel', -36 + i * 5, 10, 1.5, 4, 2.4, 0.1); A.bar('steel', (-36 + i * 5, 10, 0.1), (-36 + i * 5, 10, 1.5), 0.08, 4)
    A.box('module', 30, 4, 0.6, 3.6, 2.4, 1.4);
    for (dx, dy) in [(-1.4, -1.2), (1.4, -1.2), (-1.4, 1.2), (1.4, 1.2)]: cyl(A, 'steel', 30 + dx, 4 + dy, 0.1, 0.5, 0.2, 8)
    A.bar('steel', (36, -6, 0.1), (36, -6, 6), 0.2, 6)
    A.flush()
    D = Acc(); lathe(D, 'module', [(0.05, 0), (2.8, 0.6), (3.6, 1.6)], n=16); D.bar('steel', (0, 0, 0.6), (0, 0, 2.6), 0.08, 4)
    obj_at('spinY_s20_dish', D, (36, -6, 6))
    return 'MoonBase', 'moon_base.glb'

# 24 海上都市（メガフロート、5×5、風車が回る）
def mega_float():
    begin('MegaFloat', 'mfl'); std_mats(); mat('water', 0x2f7fb0, .12, .1); mat('deck', 0xb8b4ac, .8); mat('glass_window', 0x6a8aa8, .06, .6); mat('steel', 0xe8eaec, .3, .5); mat('heli', 0x2b2e31, .6); mat('line', 0xf2f2ee, .7)
    A = Acc(); A.box('water', 0, 0, 0, 148, 148, 0.12)
    for (x, y) in [(0, 0), (34, 0), (-34, 0), (17, 30), (-17, 30), (17, -30), (-17, -30)]:
        lathe(A, 'deck', [(20, -1), (20, 1.4)], n=6, a0=0, a1=2 * PI, cx=x, cy=y); A.add('deck', [(x + math.cos(PI / 3 * k) * 20, y + math.sin(PI / 3 * k) * 20, 1.4) for k in range(6)], [tuple(range(6))])
    for (x, y, w, h) in [(0, 0, 14, 48), (-30, 2, 12, 26), (32, -4, 16, 18), (-16, 30, 10, 34), (16, -30, 12, 22)]:
        A.box('glass_window', x, y, 1.4, w, w, h); A.box('steel', x, y, 1.4 + h, w + 0.6, w + 0.6, 0.8)
    disc(A, 'heli', 9, 9, 1.5, 24, cx=20, cy=30); A.box('line', 20, 30, 1.6, 1.0, 6, 0.05); A.box('line', 17.5, 30, 1.6, 0.8, 1, 0.05); A.box('line', 22.5, 30, 1.6, 0.8, 1, 0.05)
    for i in range(4): tree(A, -30 + i * 4, -28, 0.7, 'round')
    A.flush()
    for k, (x, y) in enumerate([(-52, -40), (-52, 40), (52, 40), (52, -40)]):
        T = Acc(); T.bar('steel', (x, y, 0), (x, y, 34), 0.8, 8); T.box('steel', x, y + 0.6, 33, 1.6, 4, 2)
        T.flush('t%d' % k)
        B = Acc()
        for j in range(3):
            a = PI / 2 + j * 2 * PI / 3; B.add('steel', [(math.cos(a) * 0.5 - math.sin(a) * 0.6, -0.1, math.sin(a) * 0.5 + math.cos(a) * 0.6), (math.cos(a) * 14, -0.1, math.sin(a) * 14), (math.cos(a) * 0.5 + math.sin(a) * 0.6, -0.1, math.sin(a) * 0.5 - math.cos(a) * 0.6)], [(0, 1, 2), (2, 1, 0)])
        obj_at('spin_s70_turbine%d' % k, B, (x, y - 1.6, 34))
    return 'MegaFloat', 'mega_float.glb'

B3 = {'mega_park': mega_park, 'windmill': windmill, 'boat_race': boat_race, 'keirin': keirin, 'racecourse': racecourse, 'ski_resort': ski_resort, 'skyscraper': skyscraper,
      'sky_garden': sky_garden, 'future_tower': future_tower, 'expo_site': expo_site, 'triumph_gate': triumph_gate, 'pyramid_hall': pyramid_hall, 'giant_robot': giant_robot,
      'red_brick': red_brick, 'western_house': western_house, 'machiya': machiya, 'observatory': observatory, 'botanical': botanical, 'zoo': zoo, 'ancient_ruins': ancient_ruins,
      'university': university, 'orbital_hotel': orbital_hotel, 'moon_base': moon_base, 'mega_float': mega_float}
def build3(name, do_export=True):
    colname, fname = B3[name]()
    nf = sum(len(o.data.polygons) for o in S_['col'].objects)
    r = export(colname, fname) if do_export else {}
    return {'name': name, 'faces': nf, **r}
