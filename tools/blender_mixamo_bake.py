# Mixamo の動き（FBX）から、スムシティの人の関節の角度（体の前後・横）を取り出して JSON に書く
# 出力：mixamo/anim.json  { name: { n, fps, ch: [...], d: [n*12] } }
# 1 フレーム 12 個：左ももの前後, 左ひざ, 右もも, 右ひざ, 左腕の前後, 左ひじ, 左腕の開き, 右腕, 右ひじ, 右腕の開き, 背中の前傾, 腰の高さ（比）
import bpy, math, json, os
from mathutils import Vector
DIR = r"C:\Users\kgryo\OneDrive\ドキュメント\Claude\sumucity-models\mixamo"
FILES = {'walk': 'Walking.fbx', 'run': 'Running.fbx', 'idle': 'Breathing Idle.fbx', 'talk': 'Talking.fbx', 'call': 'Talking On A Cell Phone.fbx', 'text': 'Texting While Standing.fbx'}
MAXN = {'walk': 32, 'run': 24, 'idle': 48, 'talk': 64, 'call': 64, 'text': 64}

def clear_imports():
    for o in list(bpy.data.objects):
        if o.get('mx_tmp'): bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.users == 0: bpy.data.actions.remove(a)

def bake(name, fn):
    clear_imports()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(DIR, fn), automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new: o['mx_tmp'] = 1
    arm = next(o for o in new if o.type == 'ARMATURE')
    act = arm.animation_data.action
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    P = lambda b: arm.pose.bones.get('mixamorig:' + b) or arm.pose.bones.get('mixamorig1:' + b) or arm.pose.bones.get(b)
    M = arm.matrix_world
    up = Vector((0, 0, 1))
    loop = name in ('walk', 'run')
    span = (f1 - f0) if loop else (f1 - f0)
    n = min(MAXN[name], max(8, span))
    sc = bpy.context.scene
    # 立ち姿の腰の高さ（最初のフレーム）
    sc.frame_set(f0)
    hip0 = (M @ P('Hips').head).z
    rows = []
    def pitch(v, f, u): return math.atan2(v.dot(f), -v.dot(u))
    for k in range(n):
        fr = f0 + span * k / n
        sc.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
        W = lambda b, tail=False: M @ (P(b).tail if tail else P(b).head)
        hl, hr = W('LeftUpLeg'), W('RightUpLeg')
        r = (hr - hl); r.z = 0; r.normalize()        # 体の右
        f = up.cross(r); f.normalize()                 # 体の前
        def leg(s):
            hip, knee, foot = W(s + 'UpLeg'), W(s + 'Leg'), W(s + 'Foot')
            th = pitch(knee - hip, f, up); sh = pitch(foot - knee, f, up)
            return th, th - sh
        def arm_(s, side):
            sho, elb, hand = W(s + 'Arm'), W(s + 'ForeArm'), W(s + 'Hand')
            v = elb - sho; ua = pitch(v, f, up); fa = pitch(hand - elb, f, up)
            ab = math.atan2(v.dot(side), -v.dot(up))  # 外へ開く角度
            return ua, fa - ua, ab
        tL, kL = leg('Left'); tR, kR = leg('Right')
        aL, eL, bL = arm_('Left', -r); aR, eR, bR = arm_('Right', r)
        sp = W('Hips'); nk = W('Neck'); v = nk - sp
        spine = math.atan2(v.dot(f), v.dot(up))
        hip = (W('Hips').z - hip0) / max(1e-6, hip0)
        rows.append([tL, kL, tR, kR, aL, eL, bL, aR, eR, bR, spine, hip])
    # 歩き・走り：左ももが一番前に出るところを位相 π/2 に合わせる
    if loop:
        i = max(range(n), key=lambda k: rows[k][0])
        sh = (i - n // 4) % n
        rows = rows[sh:] + rows[:sh]
    clear_imports()
    fps = sc.render.fps / max(1e-6, sc.render.fps_base)
    return {'n': n, 'dur': span / fps, 'd': [round(x, 4) for row in rows for x in row]}

out = {k: bake(k, v) for k, v in FILES.items()}
json.dump(out, open(os.path.join(DIR, 'anim.json'), 'w'), separators=(',', ':'))
result = {k: (v['n'], round(v['dur'], 2), [round(x, 2) for x in v['d'][:12]]) for k, v in out.items()}
