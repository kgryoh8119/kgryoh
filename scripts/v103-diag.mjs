// v103：いつも描いている物（視錐台カリングなし）を、view の持ち物の名前つきで三角形の多い順に並べる（v102 で「MeshBasic 44.6 万」と出た物の正体を確かめる）。
// node scripts/v103-diag.mjs（先に npx vite build）。Q=low|mid|high
import { open } from './shot.mjs';
const { browser, page } = await open(1280, 800, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
const r = await page.evaluate(q => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; g.speed = 0; S.fixedQuality = true; const v = S.view; v.clockRun = false; v.__frame = v.frame; v.frame = () => {}; v.setQuality(q);
  // view の持ち物（Mesh・Mesh の配列・groups）に名前をつける
  const names = new Map(); for (const k of Object.keys(v)) { const o = v[k]; if (o && o.isObject3D) names.set(o, k); else if (Array.isArray(o)) o.forEach((m, j) => m && m.isObject3D && names.set(m, k + '[' + j + ']')); else if (o instanceof Map) for (const [kk, m] of o) if (m && m.isObject3D) names.set(m, k + '.' + kk); }
  for (const [gk, arr] of Object.entries(v.groups ?? {})) arr.forEach((m, j) => names.set(m, 'groups.' + gk + '[' + j + ']'));
  const nameOf = o => { let p = o, path = []; while (p && !names.has(p)) { path.push(p.type); p = p.parent; } return (p ? names.get(p) : '?') + (path.length ? '>' + path.length : ''); };
  const W = S.W; let x = 0, y = 0, n = 0; for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  const c = Math.round(y / n) * W + Math.round(x / n), out = { unlocked: s.unlocked?.length, blocks: null };
  for (const [nm, d, p] of [['near', 420, 0.62], ['far', 2600, 0.95]]) {
    v.focus(c, d); v.pitch = p; v.yaw = 0.7; v.target.x = v.want.x; v.target.z = v.want.z; v.dist = d; for (let k = 0; k < 4; k++) v.__frame.call(v, 0.1);
    const rows = []; v.scene.traverseVisible(o => { if (!o.isMesh) return; const g = o.geometry; if (!g) return; let t = (g.index ? g.index.count : g.attributes.position.count) / 3; if (o.isInstancedMesh) t *= o.count; if (o.frustumCulled && !o.isInstancedMesh) return;
      rows.push([nameOf(o), (o.material?.type ?? '').replace('Material', ''), o.castShadow ? 'cast' : '', Math.round(t), o.material?.opacity]); });
    // 区域の暗幕（v103：塊ごと）：全部の三角形と、視錐台の中の塊の三角形
    { const lm = v.lockMeshes ?? (v.lockMesh ? [v.lockMesh] : []), cam = v.camera; cam.updateMatrixWorld(); const fr = new (v.frus.constructor)(); const M = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse); fr.setFromProjectionMatrix(M);
      let all = 0, inF = 0, nIn = 0; for (const o of lm) { const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3; all += t; if (!o.frustumCulled || fr.intersectsObject(o)) { inF += t; nIn++; } }
      out[nm + 'Veil'] = { meshes: lm.length, tris: all, drawnTris: inF, drawnMeshes: nIn }; }
    rows.sort((a, b) => b[3] - a[3]); out[nm] = rows.slice(0, 12).map(r => r.join(' ')); out[nm + 'Info'] = { tris: v.renderer.info.render.triangles, calls: v.renderer.info.render.calls };
  }
  return out; }, process.env.Q ?? 'mid');
console.log(JSON.stringify(r, null, 1)); await browser.close();
