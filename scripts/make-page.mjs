// dist/index.html（単一ファイル）から、公開ページ用の断片（<title>・<style>・本文・<script> だけ）を作る
import fs from 'fs';
const dir = process.env.MAP ? `dist-${process.env.MAP}` : 'dist', out = `${dir}/sumucity${process.env.MAP ? '-' + process.env.MAP : ''}-page.html`;
const html = fs.readFileSync(`${dir}/index.html`, 'utf8');
const pick = (re) => { const m = html.match(re); if (!m) throw new Error('not found: ' + re); return m[0]; };
const title = pick(/<title>[\s\S]*?<\/title>/);
const font = pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/);
const style = pick(/<style[^>]*>[\s\S]*?<\/style>/).replace(/<style[^>]*>/, '<style>');
const app = pick(/<!--APP-->[\s\S]*?<!--\/APP-->/).replace(/<!--\/?APP-->/g, '');
const script = pick(/<script type="module"[^>]*>[\s\S]*<\/script>/).replace(/<script type="module"[^>]*>/, '<script type="module">');
fs.writeFileSync(out, [title, font, style, app.trim(), script].join('\n'));
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + ' kB');

// 単体で開ける版（ダブルクリックで遊べる）：同梱の地図をページに埋め込む
const maps = fs.existsSync(`${dir}/maps`) ? fs.readdirSync(`${dir}/maps`).filter(f => f.endsWith('.json') && f !== 'manifest.json') : [];
// 分割版（dist/index.html ＋ dist/maps/）：サーバーに置いた地図の一覧。タイトル画面が、地図そのものを読まずに「遊べる地図」を知るために使う
if (maps.length) fs.writeFileSync(`${dir}/maps/manifest.json`, JSON.stringify({ maps: maps.map(f => ({ id: f.replace(/\.json$/, ''), bytes: fs.statSync(`${dir}/maps/${f}`).size })) }));
const emb = maps.map(f => `<script type="application/json" id="sumu-map-${f.replace(/\.json$/, '')}">${fs.readFileSync(`${dir}/maps/${f}`, 'utf8').replace(/</g, '\\u003c')}</script>`).join('\n');
const full = html.replace('</body>', emb + '\n</body>');
fs.writeFileSync(`${dir}/sumucity-standalone.html`, full);
console.log(`${dir}/sumucity-standalone.html`, (fs.statSync(`${dir}/sumucity-standalone.html`).size / 1e6).toFixed(1) + ' MB（地図 ' + maps.length + ' 件を埋め込み）');

// 公開版（Claude の artifact）：ページは 16MB までなので、埋め込む地図を絞る（v81）。残りの街は、単体ファイル版か、自前のサーバーに置いた版で遊べる
const PUB = (process.env.PUB_MAPS ?? 'hodogaya,shibuya,yokohama,umeda').split(',');
const embP = maps.filter(f => PUB.includes(f.replace(/\.json$/, ''))).map(f => `<script type="application/json" id="sumu-map-${f.replace(/\.json$/, '')}">${fs.readFileSync(`${dir}/maps/${f}`, 'utf8').replace(/</g, '\\u003c')}</script>`).join('\n');
fs.writeFileSync(`${dir}/sumucity-artifact.html`, html.replace('</body>', embP + '\n</body>'));
console.log(`${dir}/sumucity-artifact.html`, (fs.statSync(`${dir}/sumucity-artifact.html`).size / 1e6).toFixed(1) + ' MB（地図 ' + PUB.join('・') + '）');
