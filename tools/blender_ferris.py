import bpy, math
exec(bpy.data.texts['lmlib.py'].as_string(), globals())
begin('Ferris', 'frs')
mat('steel', 0xf2f3f5, .4, .5)
mat('steel_dark', 0x8d949b, .45, .6)
mat('cable', 0xc9ced3, .4, .6)
mat('window', 0x2f4656, .15, .3)
COLS = [0xe8556a, 0x3fb8f0, 0xf2c230, 0x6cc36a, 0xb07ad8, 0xff8a3a]
for i, c in enumerate(COLS):
    mat(f'cab{i}', c, .45, .1)
    mat(f'lamp_{i}', c, .3, 0, emit=(c, 4.0))
R, HUB, N, G = 27.0, 31.0, 48, 32
# ---- 回る輪（原点＝ハブ） ----
W = Acc()
for dy in (-1.6, 1.6):
    pts = [(math.cos(2 * math.pi * k / N) * R, dy, math.sin(2 * math.pi * k / N) * R) for k in range(N)]
    pin = [(math.cos(2 * math.pi * k / N) * (R - 2.2), dy, math.sin(2 * math.pi * k / N) * (R - 2.2)) for k in range(N)]
    for k in range(N):
        W.bar('steel', pts[k], pts[(k + 1) % N], 0.32, 6)
        W.bar('steel', pin[k], pin[(k + 1) % N], 0.22, 6)
        W.bar('steel', pts[k], pin[(k + 1) % N], 0.12, 4)            # 輪のトラス
        W.bar('steel', pts[k], pin[k], 0.12, 4)
        # LED（外側にぐるりと）
        a0, a1 = 2 * math.pi * k / N, 2 * math.pi * (k + 1) / N
        W.bar(f'lamp_{(k // 4) % 6}', (math.cos(a0) * (R + 0.35), dy, math.sin(a0) * (R + 0.35)), (math.cos(a1) * (R + 0.35), dy, math.sin(a1) * (R + 0.35)), 0.12, 4)
    for k in range(0, N, 2):
        W.bar('cable', (0, dy * 0.6, 0), pin[k], 0.07, 4)              # スポーク（ケーブル）
for k in range(N):
    a = 2 * math.pi * k / N
    W.bar('steel', (math.cos(a) * R, -1.6, math.sin(a) * R), (math.cos(a) * R, 1.6, math.sin(a) * R), 0.14, 4)
lathe(W, 'steel_dark', [(1.6, -2.4), (1.6, 2.4)], n=16)
wheel = obj_at('spin_wheel', W, (0, 0, HUB))
wheel.rotation_mode = 'XYZ'
# ゴンドラ（輪の子。原点は吊り下げ点、ゲームでは常に下向きに保つ）
for k in range(G):
    a = 2 * math.pi * k / G
    Gd = Acc(); col = k % 6
    Gd.bar('steel_dark', (0, 0, 0), (0, 0, -0.9), 0.08, 4)
    Gd.box(f'cab{col}', 0, 0, -3.4, 2.2, 2.0, 0.9)
    Gd.box('window', 0, 0, -2.5, 2.1, 1.9, 1.1)
    Gd.box(f'cab{col}', 0, 0, -1.4, 2.25, 2.05, 0.5)
    for sx in (-1, 1):
        for sy in (-1, 1): Gd.box(f'cab{col}', sx * 0.98, sy * 0.88, -2.5, 0.16, 0.16, 1.1)
    Gd.box('steel_dark', 0, 0, -0.95, 0.9, 0.5, 0.12)
    o = obj_at(f'gond_{k:02d}', Gd, (math.cos(a) * (R + 0.2), 0, math.sin(a) * (R + 0.2)), parent=wheel)
# ---- 支柱（A 字）と土台 ----
A = Acc()
for dy in (-4.2, 4.2):
    for sx in (-1, 1):
        A.bar('steel', (sx * 15, dy, 0), (0, dy * 0.62, HUB), 0.75, 8)
        A.bar('steel', (sx * 7.5, dy * 0.85, HUB / 2), (0, dy * 0.85, HUB / 2 - 4), 0.35, 6)
    A.bar('steel', (-11, dy * 0.9, 8), (11, dy * 0.9, 8), 0.4, 6)
    A.box('steel_dark', -15, dy, -0.2, 3, 3, 1.0); A.box('steel_dark', 15, dy, -0.2, 3, 3, 1.0)
A.bar('steel_dark', (0, -3.6, HUB), (0, 3.6, HUB), 0.7, 12)
A.box('steel_dark', 0, 0, 0, 10, 6, 0.6)
A.flush()
view((0, 0, 30), 140, 85, -18)
result = {'faces': sum(len(o.data.polygons) for o in S_['col'].objects)}
