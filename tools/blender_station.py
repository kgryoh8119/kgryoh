import bpy, math, numpy as np
exec(bpy.data.texts['lmlib.py'].as_string(), globals())
begin('Station', 'stn')

# ---- テクスチャ ----
def brick_tex():
    S = 512; y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    row = (y // 32).astype(int); off = np.where(row % 2 == 1, 32, 0)
    bx = ((x + off) % 64); by = y % 32
    bid = (((x + off) // 64).astype(int) % 8) + row * 8
    tone = rng.uniform(0.78, 1.12, 8 * 16 + 8)[bid % (8 * 16 + 8)]
    mort = (bx < 3) | (by < 3)
    base = np.array([0xa2, 0x4a, 0x36]) / 255
    rgb = base * tone[..., None] * (1 + blur(rng.normal(0, 0.06, (S, S)), 1))[..., None]
    dark = rng.uniform(0, 1, 8 * 16 + 8)[bid % (8 * 16 + 8)] < 0.12
    rgb = np.where(dark[..., None], rgb * 0.7, rgb)
    rgb = np.where(mort[..., None], np.array([0.72, 0.70, 0.66]), rgb)
    h = np.where(mort, 0.0, 1.0); h = blur(h, 1)
    return to_img('brickC', rgb), to_img('brickN', nrm(h, 2.0), True)
def slate_tex():
    S = 256; y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    row = (y // 16).astype(int); off = np.where(row % 2 == 1, 8, 0)
    bx = (x + off) % 16; by = y % 16
    tone = rng.uniform(0.85, 1.1, 16 * 16)[((((x + off) // 16).astype(int) % 16) + row * 16) % 256]
    base = np.array([0x4a, 0x50, 0x58]) / 255
    rgb = base * tone[..., None]
    edge = (by > 13) | (bx < 1)
    rgb = np.where(edge[..., None], rgb * 0.6, rgb)
    h = 1 - (by / 16.0) * 0.6; h = np.where(edge, 0, h)
    return to_img('slateC', rgb), to_img('slateN', nrm(h, 1.5), True)
BC, BN = brick_tex(); SC, SN = slate_tex()
mat('brick', 0xa24a36, .85, 0, (BC, BN))
mat('stone_trim', 0xe9e4d8, .8)
mat('granite', 0x8a8a86, .7)
mat('slate', 0x4a5058, .55, .1, (SC, SN))
mat('window', 0x2c3540, .2, .3)
mat('gold', 0xc9a24a, .35, 1)
mat('bronze', 0x6f7d6a, .5, .6)
mat('canopy', 0x2f3d36, .5, .3)
mat('lamp', 0xfff2d0, .3, 0, emit=(0xffe2a8, 0.0))
mat('clock', 0xf6f2e6, .4)
A = Acc()

def hip(cx, cy, z0, w, d, h, ins=None, m='slate'):
    """寄棟屋根。ins＝棟の内側への寄り（既定は奥行の半分）"""
    ins = d / 2 * 0.98 if ins is None else ins
    a, b = w / 2, d / 2
    P = [(cx - a, cy - b, z0), (cx + a, cy - b, z0), (cx + a, cy + b, z0), (cx - a, cy + b, z0)]
    Q = [(cx - a + ins, cy - b + ins, z0 + h), (cx + a - ins, cy - b + ins, z0 + h), (cx + a - ins, cy + b - ins, z0 + h), (cx - a + ins, cy + b - ins, z0 + h)]
    sl = math.hypot(ins, h); s = 4.0
    for i in range(4):
        j = (i + 1) % 4
        L = math.dist(P[i], P[j]); l2 = math.dist(Q[i], Q[j]); o = (L - l2) / 2
        A.add(m, [P[i], P[j], Q[j], Q[i]], [(0, 1, 2, 3)], [(0, 0), (L / s, 0), ((o + l2) / s, sl / s), (o / s, sl / s)])
    A.add(m, Q, [(0, 1, 2, 3)])

def windows(cx, cy, w, d, floors, z0, fh, n_front, n_side, arch=False):
    """各階の窓（白い枠と上の飾り）"""
    for face in range(4):
        L = w if face % 2 == 0 else d; half = (d if face % 2 == 0 else w) / 2
        xf0 = face_xf(face, half)
        xf = lambda p, xf0=xf0: (lambda q: (q[0] + cx, q[1] + cy, q[2]))(xf0(p))
        n = n_front if face % 2 == 0 else n_side
        if n <= 0: continue
        for f in range(floors):
            zc = z0 + f * fh + fh * 0.5
            wh = fh * (0.55 if f else 0.6)
            for i in range(n):
                x = -L / 2 + L * (i + 0.5) / n
                A.xbox('stone_trim', xf, x, -0.08, zc - wh / 2 - 0.25, 1.6, 0.25, wh + 0.5)
                A.xbox('window', xf, x, -0.2, zc - wh / 2, 1.1, 0.12, wh)
                A.xbox('stone_trim', xf, x, -0.25, zc + wh / 2 + 0.1, 1.9, 0.35, 0.35)   # まぐさ
                A.xbox('stone_trim', xf, x, -0.25, zc - wh / 2 - 0.3, 1.7, 0.3, 0.18)    # 窓台

def bands(cx, cy, w, d, zs, t=0.35):
    for z in zs: A.box('stone_trim', cx, cy, z, w + 0.3, d + 0.3, t)

def block(cx, cy, w, d, floors, fh, nf, ns, roof_h, ridge=None):
    H = floors * fh
    A.boxt('granite', cx, cy, 0, w + 0.4, d + 0.4, 1.0, 2.0)
    A.boxt('brick', cx, cy, 1.0, w, d, H - 1.0, 3.2)
    bands(cx, cy, w, d, [fh * k for k in range(1, floors)] + [H - 0.2])
    A.box('stone_trim', cx, cy, H + 0.15, w + 0.9, d + 0.9, 0.45)          # 軒の蛇腹
    windows(cx, cy, w, d, floors, 0.6, fh, nf, ns)
    # 角の白い隅石
    for sx in (-1, 1):
        for sy in (-1, 1):
            for k in range(int(H / 0.9)):
                if k % 2: continue
                A.box('stone_trim', cx + sx * (w / 2 - 0.35), cy + sy * (d / 2 - 0.35), 1.0 + k * 0.9, 0.85, 0.85, 0.5)
    hip(cx, cy, H + 0.6, w + 0.6, d + 0.6, roof_h, ridge)
    return H

def dome(cx, cy, z0, r, h):
    """八角のドーム（ドラム・ドーム・ランタン・頂部飾り）"""
    lathe(A, 'brick', [(r * 1.05, z0), (r * 1.05, z0 + 1.8)], n=8, a0=math.pi / 8, a1=math.pi / 8 + 2 * math.pi)
    lathe(A, 'stone_trim', [(r * 1.18, z0 + 1.8), (r * 1.18, z0 + 2.2)], n=8, a0=math.pi / 8, a1=math.pi / 8 + 2 * math.pi)
    prof = [(r * 1.1, z0 + 2.2), (r * 1.08, z0 + 2.2 + h * 0.15), (r * 0.98, z0 + 2.2 + h * 0.38), (r * 0.78, z0 + 2.2 + h * 0.6), (r * 0.5, z0 + 2.2 + h * 0.8), (r * 0.22, z0 + 2.2 + h * 0.95), (r * 0.18, z0 + 2.2 + h)]
    lathe(A, 'slate', prof, n=8, a0=math.pi / 8, a1=math.pi / 8 + 2 * math.pi, uscale=2)
    for k in range(8):
        a = math.pi / 8 + k * math.pi / 4
        pts = [(cx + math.cos(a) * pr * 1.01, cy + math.sin(a) * pr * 1.01, pz) for (pr, pz) in prof]
        for i in range(len(pts) - 1): A.bar('gold', pts[i], pts[i + 1], 0.09)
    zt = z0 + 2.2 + h
    lathe(A, 'bronze', [(r * 0.2, zt), (r * 0.2, zt + 1.4), (r * 0.26, zt + 1.5), (0.05, zt + 2.3)], n=8, cx=cx, cy=cy)
    A.bar('gold', (cx, cy, zt + 2.2), (cx, cy, zt + 3.6), 0.07, 6)
    lathe(A, 'gold', [(0.01, zt + 3.5), (0.22, zt + 3.65), (0.01, zt + 3.85)], n=8, cx=cx, cy=cy)

# lathe の中心を動かせるように差し替え
_lathe = lathe
def lathe(A_, m, prof, n=32, a0=0.0, a1=2 * math.pi, sx=1.0, sy=1.0, cx=None, cy=None, uscale=None):
    _lathe(A_, m, prof, n=n, a0=a0, a1=a1, sx=sx, sy=sy, cx=DC[0] if cx is None else cx, cy=DC[1] if cy is None else cy, uscale=uscale)
DC = [0, 0]

# ---- 配置（正面は -Y） ----
FH = 4.2
# 翼（左右の 3 階建て）
for sx in (-1, 1):
    block(sx * 12.5, 0, 13, 12, 3, FH, 4, 3, 3.2)
# 両端の塔屋（ドーム）
for sx in (-1, 1):
    H = block(sx * 23.5, -0.5, 9, 14, 3, FH * 1.12, 2, 3, 2.2)
    DC[0], DC[1] = sx * 23.5, -0.5
    dome(sx * 23.5, -0.5, H + 0.6 + 1.2, 3.9, 6.0)
    A.box('slate', sx * 23.5, -0.5, H + 0.6, 7.6, 7.6, 1.4)
# 中央の玄関棟（少し前に出す、急勾配の屋根と小塔）
H = block(0, -1.2, 12, 14.4, 3, FH * 1.12, 3, 3, 5.0, ridge=3.8)
DC[0], DC[1] = 0, -1.2
lathe(A, 'bronze', [(1.3, H + 5.4), (1.3, H + 7.0), (1.5, H + 7.1), (0.05, H + 8.8)], n=8)
A.bar('gold', (0, -1.2, H + 8.6), (0, -1.2, H + 10.2), 0.07, 6)
# 時計（屋根の前に立つ石の壁に）
A.box('stone_trim', 0, -8.4 + 0.3, H + 0.5, 4.2, 0.8, 4.2)
A.box('stone_trim', 0, -8.4 + 0.3, H + 4.7, 4.6, 0.9, 0.4)
for rr, yy, m in ((1.55, -8.4 - 0.15, 'bronze'), (1.3, -8.4 - 0.22, 'clock')):
    cv = [(math.cos(2 * math.pi * i / 24) * rr, yy, H + 2.6 + math.sin(2 * math.pi * i / 24) * rr) for i in range(24)] + [(0, yy, H + 2.6)]
    A.add(m, cv, [(24, (i + 1) % 24, i) for i in range(24)])
A.box('canopy', 0.0, -8.4 - 0.3, H + 2.55, 0.14, 0.05, 1.0); A.box('canopy', 0.35, -8.4 - 0.3, H + 2.55, 0.75, 0.05, 0.12)
# 玄関のアーチ 3 つ
for x in (-3.4, 0, 3.4):
    yf = -1.2 - 7.2
    A.box('window', x, yf - 0.05, 1.0, 2.6, 0.3, 3.4)
    pts = []
    for k in range(9):
        a = math.pi * k / 8; pts.append((x + math.cos(a) * 1.5, yf - 0.3, 4.4 + math.sin(a) * 1.4))
    for k in range(8): A.bar('stone_trim', pts[k], pts[k + 1], 0.22)
    for sx in (-1.5, 1.5): A.box('stone_trim', x + sx, yf - 0.25, 1.0, 0.45, 0.4, 3.4)
# 車寄せのひさし
A.box('canopy', 0, -1.2 - 7.2 - 3.4, 5.0, 14, 6.6, 0.35)
A.box('gold', 0, -1.2 - 7.2 - 6.7, 5.0, 14.2, 0.1, 0.35)
for x in (-6.5, -2.2, 2.2, 6.5):
    A.bar('canopy', (x, -1.2 - 7.2 - 6.2, 0), (x, -1.2 - 7.2 - 6.2, 5.0), 0.16, 8)
# 外灯
for x in (-9.5, 9.5):
    A.bar('canopy', (x, -11.5, 0), (x, -11.5, 4.0), 0.1, 6)
    A.box('lamp', x, -11.5, 4.0, 0.5, 0.5, 0.7); A.box('canopy', x, -11.5, 4.7, 0.65, 0.65, 0.12)
# 屋根の窓（ドーマー）
for sx in (-1, 1):
    for k in range(3):
        x = sx * (8.5 + k * 3.5)
        for y0, s_ in ((-6.3, 1), (6.3, -1)):
            z = 3 * FH + 0.9
            A.boxt('brick', x, y0 + s_ * 0.6, z, 1.6, 1.2, 1.6, 3.2)
            A.box('window', x, y0 + s_ * 0.1, z + 0.3, 0.9, 0.1, 1.0)
            A.add('slate', [(x - 1.0, y0 - s_ * 0.1, z + 1.6), (x + 1.0, y0 - s_ * 0.1, z + 1.6), (x, y0 - s_ * 0.1, z + 2.5),
                            (x - 1.0, y0 + s_ * 1.6, z + 1.6), (x + 1.0, y0 + s_ * 1.6, z + 1.6), (x, y0 + s_ * 1.6, z + 2.5)],
                  [(0, 2, 5, 3), (2, 1, 4, 5), (0, 1, 2)])

A.flush()
view((0, -4, 10), 75, 72, -25)
nf = sum(len(o.data.polygons) for o in S_['col'].objects)
result = {'faces': nf}
