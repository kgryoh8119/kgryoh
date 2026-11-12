import bpy, math, numpy as np
exec(bpy.data.texts['lmlib.py'].as_string(), globals())
begin('Stadium', 'std')
N = 72
FA, FB = 38.0, 25.0                        # 芝の半分の大きさ（x が長い）
def se(t, a, b, n=4.0):
    c, s = math.cos(t), math.sin(t)
    return (a * math.copysign(abs(c) ** (2 / n), c), b * math.copysign(abs(s) ** (2 / n), s))
def ringpts(a, b, z): return [(*se(2 * math.pi * i / N, a, b), z) for i in range(N)]
def perim(a, b):
    p = ringpts(a, b, 0); return sum(math.dist(p[i], p[(i + 1) % N]) for i in range(N))

# ---- テクスチャ ----
def pitch_tex():
    S = 1024; y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    X = x / S * 2 * FA - FA; Y = y / S * 2 * FB - FB
    stripe = (np.floor((X + FA) / (2 * FA / 14)) % 2).astype(np.float32)
    base = np.array([0x4f, 0x9a, 0x45]) / 255
    rgb = base * (0.9 + 0.12 * stripe)[..., None] * (1 + blur(rng.normal(0, 0.05, (S, S)), 2))[..., None]
    L = np.zeros((S, S), bool); w = 0.18
    hx, hy = 35.0, 22.0
    L |= (np.abs(np.abs(X) - hx) < w) & (np.abs(Y) <= hy + w)
    L |= (np.abs(np.abs(Y) - hy) < w) & (np.abs(X) <= hx + w)
    L |= (np.abs(X) < w) & (np.abs(Y) <= hy)
    r = np.hypot(X, Y); L |= np.abs(r - 6.5) < w; L |= r < 0.35
    for sx in (-1, 1):
        px = sx * hx
        for (dx, dy) in ((11.5, 13.0), (4.0, 6.0)):
            inx = (X * sx >= hx - dx - w) & (X * sx <= hx)
            L |= (np.abs(X * sx - (hx - dx)) < w) & (np.abs(Y) <= dy)
            L |= (np.abs(np.abs(Y) - dy) < w) & inx
        d = np.hypot(X - sx * (hx - 7.7), Y); L |= (np.abs(d - 6.5) < w) & (X * sx < hx - 11.5)
        L |= np.hypot(X - sx * (hx - 7.7), Y) < 0.25
    rgb = np.where(L[..., None], np.array([0.93, 0.95, 0.92]), rgb)
    out = (np.abs(X) > hx + 1.2) | (np.abs(Y) > hy + 1.2)
    rgb = np.where(out[..., None], rgb * 0.85, rgb)
    return to_img('pitchC', rgb)
def seat_tex():
    S = 256; y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    cx = (x % 32) / 32; cy = y / S
    seat = (cx > 0.12) & (cx < 0.88) & (cy > 0.35) & (cy < 0.9)
    base = np.array([0x2a, 0x5f, 0xb0]) / 255
    rgb = np.where(seat[..., None], base * (0.95 + 0.1 * (cy > 0.6))[..., None], np.array([0.45, 0.46, 0.47]))
    h = np.where(seat, 1.0, 0.0); h = blur(h, 1)
    return to_img('seatC', rgb), to_img('seatN', nrm(h, 2.0), True)
def fin_tex():
    S = 256; y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    cx = (x % 64) / 64
    rgb = np.where((cx < 0.18)[..., None], np.array([0.92, 0.93, 0.94]), np.array([0.55, 0.62, 0.68]))
    h = np.where(cx < 0.18, 1.0, 0.0)
    return to_img('facadeC', rgb), to_img('facadeN', nrm(blur(h, 1), 3.0), True)
PC = pitch_tex(); SC, SN = seat_tex(); FC, FN = fin_tex()
mat('pitch', 0x4f9a45, .9, 0, (PC,))
mat('seat', 0x2a5fb0, .6, 0, (SC, SN))
mat('concrete', 0xb9b6ae, .9)
mat('facade', 0x8c9aa4, .4, .3, (FC, FN))
mat('roof_membrane', 0xf4f4f2, .5)
mat('steel', 0xd0d4d8, .4, .7)
mat('window', 0x2a3a48, .15, .4)
mat('lamp', 0xfffbe8, .3, 0, emit=(0xfff8e0, 0.0))
mat('screen', 0x101418, .3, 0)
mat('track', 0xa8563c, .9)
A = Acc()

# 芝（UV で全面）
v = [(-FA, -FB, 0.1), (FA, -FB, 0.1), (FA, FB, 0.1), (-FA, FB, 0.1)]
A.add('pitch', v, [(0, 1, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)])
# ゴール
for sx in (-1, 1):
    x = sx * 35.0
    for yy in (-3.66, 3.66): A.bar('steel', (x, yy, 0.1), (x, yy, 2.44), 0.08, 6)
    A.bar('steel', (x, -3.66, 2.44), (x, 3.66, 2.44), 0.08, 6)
    A.add('roof_membrane', [(x, -3.66, 0.1), (x + sx * 1.8, -3.66, 0.1), (x + sx * 1.8, 3.66, 0.1), (x, 3.66, 0.1), (x + sx * 1.0, -3.66, 2.44), (x + sx * 1.0, 3.66, 2.44)],
          [(1, 2, 5, 4), (4, 5, 3, 0)])

def ring_strip(m, r0, r1, uv_rows=None, ulen=4.0):
    """2 つの輪（点のリスト）をつなぐ帯。UV は u=周の長さ/ulen, v=0→1"""
    V = []; F = []; U = []
    acc = [0.0]
    for i in range(N): acc.append(acc[-1] + math.dist(r0[i], r0[(i + 1) % N]))
    for i in range(N + 1):
        V += [r0[i % N], r1[i % N]]; U += [(acc[i] / ulen, 0), (acc[i] / ulen, 1)]
    for i in range(N): F.append((i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1))
    A.add(m, V, F, U)

# 下段スタンド
a, b, z = FA + 1.5, FB + 1.5, 0.0
ring_strip('concrete', ringpts(FA, FB, 0.1), ringpts(a, b, 0.1))
ring_strip('concrete', ringpts(a, b, 0.1), ringpts(a, b, 1.3))
z = 1.3
for k in range(11):
    r0 = ringpts(a, b, z); r1 = ringpts(a, b, z + 0.45); a2, b2 = a + 0.8, b + 0.8; r2 = ringpts(a2, b2, z + 0.45)
    ring_strip('concrete', r0, r1); ring_strip('seat', r1, r2)
    a, b, z = a2, b2, z + 0.45
# 通路（コンコース）と上段
ring_strip('concrete', ringpts(a, b, z), ringpts(a + 2.0, b + 2.0, z)); a += 2.0; b += 2.0
ring_strip('concrete', ringpts(a, b, z), ringpts(a, b, z + 2.6)); z += 2.6
A2 = (a, b, z)
for k in range(11):
    r0 = ringpts(a, b, z); r1 = ringpts(a, b, z + 0.6); a2, b2 = a + 0.8, b + 0.8; r2 = ringpts(a2, b2, z + 0.6)
    ring_strip('concrete', r0, r1); ring_strip('seat', r1, r2)
    a, b, z = a2, b2, z + 0.6
ring_strip('concrete', ringpts(a, b, z), ringpts(a + 0.6, b + 0.6, z + 1.1))
OA, OB, OZ = a + 0.6, b + 0.6, z + 1.1
# 外壁（縦のフィン）と、下段の裏（地面から上段の裏まで）
ring_strip('facade', ringpts(OA + 1.0, OB + 1.0, 0), ringpts(OA + 1.0, OB + 1.0, OZ + 0.5), ulen=8.0)
ring_strip('concrete', ringpts(OA + 1.0, OB + 1.0, OZ + 0.5), ringpts(OA, OB, OZ))
ring_strip('window', ringpts(OA + 1.25, OB + 1.25, 3.0), ringpts(OA + 1.25, OB + 1.25, 6.0), ulen=8.0)
ring_strip('steel', ringpts(OA + 1.3, OB + 1.3, 6.0), ringpts(OA + 1.3, OB + 1.3, 6.6), ulen=8.0)
# 屋根（外から内へ少し上がる膜屋根）とトラス
RZ0, RZ1 = OZ + 4.0, OZ + 6.5
ro = ringpts(OA + 1.6, OB + 1.6, RZ0); ri = ringpts(FA + 6.0, FB + 6.0, RZ1)
ring_strip('roof_membrane', ro, ri, ulen=10.0)
ring_strip('roof_membrane', ringpts(FA + 6.0, FB + 6.0, RZ1 - 0.6), ringpts(OA + 1.6, OB + 1.6, RZ0 - 0.6), ulen=10.0)
ring_strip('steel', ri, ringpts(FA + 6.0, FB + 6.0, RZ1 - 0.6))
ring_strip('steel', ringpts(OA + 1.6, OB + 1.6, RZ0 - 0.6), ro)
ring_strip('lamp', ringpts(FA + 6.1, FB + 6.1, RZ1 - 0.65), ringpts(FA + 7.2, FB + 7.2, RZ1 - 0.66))
for i in range(0, N, 2):
    p, q = ro[i], ri[i]
    mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2 + 2.2)
    A.bar('steel', (p[0], p[1], p[2] + 0.05), mid, 0.18, 4); A.bar('steel', mid, (q[0], q[1], q[2] + 0.05), 0.18, 4)
    A.bar('steel', (p[0], p[1], p[2] + 0.05), (q[0], q[1], q[2] + 0.05), 0.12, 4)
    # 外壁から屋根を支える柱
    po = se(2 * math.pi * i / N, OA + 1.6, OB + 1.6)
    A.bar('steel', (po[0], po[1], OZ + 0.5), (po[0], po[1], RZ0 - 0.6), 0.25, 6)
# 大型ビジョン（片側のゴール裏の上）
A.box('steel', -(FA + 13.0), 0, A2[2] + 6.5, 1.2, 20.0, 9.0)
A.box('screen', -(FA + 12.35), 0, A2[2] + 7.0, 0.1, 18.4, 8.0)
# 入口の階段（正面 -Y 側）
for x in (-24, 0, 24):
    for k in range(8):
        A.box('concrete', x, -(OB + 1.0) - 6 + k * 0.75, 0, 8, 0.75, 0.5 + k * 0.45)
A.flush()
view((0, 0, 10), 190, 62, -30)
result = {'faces': sum(len(o.data.polygons) for o in S_['col'].objects), 'outer': [round(OA + 1.6, 1), round(OB + 1.6, 1), round(RZ1, 1)]}
