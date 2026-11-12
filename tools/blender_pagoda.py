import bpy, math, numpy as np
exec(bpy.data.texts['lmlib.py'].as_string(), globals())
begin('Pagoda', 'pgd')
# Blender で見る用の瓦の模様（ゲームでは lmtex.ts が同じ模様を作る）
def kawara():
    S, P = 256, 32; y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    cx = (x % P) / P; cy = (y % P) / P; d = np.abs(cx - 0.5) / 0.2
    maru = np.sqrt(np.clip(1 - d * d, 0, 1)); lip = (1 - cy) ** 2 * 0.35
    h = np.maximum(maru * 0.9 + lip * 0.6, 0.12 * (1 - np.cos(2 * np.pi * cx)) + lip)
    edge = np.where(cy < 0.05, 0.7, 1.0)
    rgb = np.array([0x5a, 0x5e, 0x63]) / 255 * ((0.62 + 0.45 * h) * edge)[..., None]
    return to_img('kawaraC', rgb), to_img('kawaraN', nrm(h * edge, 3.0), True)
KC, KN = kawara()
mat('kawara', 0x5a5e63, .6, .1, (KC, KN))
mat('soffit', 0x8a3a26, .7)
mat('ridge', 0x4a4e52, .6, .1)
mat('vermilion', 0xb8432a, .7)
mat('plaster', 0xefe9dc, .85)
mat('darkWood', 0x3a2a20, .8)
mat('stone', 0xa49d90, .9)
mat('gold', 0xc9a24a, .35, 1)
A = Acc()
A.box('stone', 0, 0, 0, 10, 10, 1.0); A.box('stone', 0, 0, 1.0, 9, 9, 0.3)
z = 1.3
SIZES = [6.6, 6.0, 5.4, 4.8, 4.2]
for k, s in enumerate(SIZES):
    h = 3.4 if k == 0 else 2.6
    # 縁と高欄（2 層目から）
    if k > 0:
        A.box('vermilion', 0, 0, z - 0.1, s + 1.6, s + 1.6, 0.18)
        for face in range(4):
            xf = face_xf(face, s / 2 + 0.75)
            A.xbox('vermilion', xf, 0, 0, z + 0.65, s + 1.5, 0.12, 0.12)
            for i in range(7):
                A.xbox('vermilion', xf, -s / 2 - 0.7 + (s + 1.4) * i / 6, 0, z, 0.12, 0.12, 0.75)
    # 軸部：白壁＋朱の柱、中央に扉
    A.box('plaster', 0, 0, z, s, s, h)
    for face in range(4):
        xf = face_xf(face, s / 2)
        for i in range(4):
            A.xbox('vermilion', xf, -s / 2 + s * i / 3, -0.02, z, 0.42, 0.42, h)
        A.xbox('darkWood', xf, 0, -0.05, z + 0.2, s / 3 - 0.5, 0.1, h - 0.6)
        A.xbox('vermilion', xf, 0, -0.08, z + h - 0.45, s + 0.3, 0.2, 0.3)          # 頭貫
        # 組物（ますぐみ）：外へ張り出す 2 段の腕木
        for i in range(7):
            x = -s / 2 + s * i / 6
            A.xbox('vermilion', xf, x, -0.35, z + h - 0.2, 0.35, 0.9, 0.3)
            A.xbox('vermilion', xf, x, -0.8, z + h + 0.1, 0.35, 1.4, 0.3)
    zr = z + h + 0.5
    if k < 4:
        ns = SIZES[k + 1]
        jroof(A, s, s, zr, ns - 0.2, ns - 0.2, 2.7 - 0.12 * k, 1.5, 0.9, m='kawara', ridge='ridge', R=5, N=10, thick=0.55)
        z = zr + 1.35
    else:
        rr = jroof(A, s, s, zr, 0.5, 0.5, 2.5, 3.0, 0.9, m='kawara', ridge='ridge', R=7, N=10, thick=0.55)
        zt = rr[-1][0][2]
# 相輪：露盤・伏鉢・九輪・水煙・宝珠
lathe(A, 'ridge', [(0.9, zt - 0.2), (0.9, zt + 0.5), (0.55, zt + 0.6)], n=8)
lathe(A, 'gold', [(0.55, zt + 0.6), (0.75, zt + 1.0), (0.6, zt + 1.5), (0.2, zt + 1.7)], n=12)
A.bar('gold', (0, 0, zt + 1.5), (0, 0, zt + 9.0), 0.16, 8)
for i in range(9):
    zz = zt + 2.0 + i * 0.55
    lathe(A, 'gold', [(0.18, zz), (0.62 - i * 0.02, zz + 0.05), (0.62 - i * 0.02, zz + 0.18), (0.18, zz + 0.23)], n=12)
for a in range(4):
    an = a * math.pi / 2 + math.pi / 4
    A.add('gold', [(0, 0, zt + 7.3), (math.cos(an) * 0.9, math.sin(an) * 0.9, zt + 7.8), (math.cos(an) * 0.5, math.sin(an) * 0.5, zt + 8.6)], [(0, 1, 2)])
lathe(A, 'gold', [(0.01, zt + 8.8), (0.35, zt + 9.1), (0.01, zt + 9.6)], n=10)
# 風鐸（屋根の四隅の鈴）
A.flush()
view((0, 0, 16), 70, 78, -30)
result = {'faces': sum(len(o.data.polygons) for o in S_['col'].objects), 'top': round(zt + 9.6, 1)}
