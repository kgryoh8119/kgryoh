// dist/index.html（単一ファイル）から、公開ページ用の断片（<title>・<style>・本文・<script> だけ）を作る
import fs from 'fs';
const dir = process.env.MAP ? `dist-${process.env.MAP}` : 'dist', out = `${dir}/sumucity${process.env.MAP ? '-' + process.env.MAP : ''}-page.html`;
const orig = fs.readFileSync(`${dir}/index.html`, 'utf8').replace(/<script type="text\/plain" id="sumu-license-map">[\s\S]*?<\/script>\n?/, '');
let html = orig;

// v92：地図データ（OSM からの派生データベース）のライセンス文書。dist/LICENSE-map-data.md に書き、同じ本文を HTML にも埋め込む
// （1 ファイルだけ配っても文書が届くように。タイトルの「この作品について」で読める）。詳しくは docs/配布前の確認-Mixamo-ODbL.md
/** 作品全体（地図データ以外）のライセンス（v92：作者の決定＝権利をすべて保持する） */
const WORK_LICENSE = '© 2026 スムシティの作者. All rights reserved.（地図データ以外のプログラム・3D モデル・音・画面のデザイン。無断での複製・改変・再配布・転載を禁じます。地図データは ODbL 1.0、three.js は MIT License、人物の動きの元データは Adobe Mixamo の利用条件に従います）';
const mapFiles = fs.existsSync(`${dir}/maps`) ? fs.readdirSync(`${dir}/maps`).filter(f => f.endsWith('.json') && f !== 'manifest.json').sort() : [];
const mapRows = mapFiles.map(f => {
  let m = {}; try { m = JSON.parse(fs.readFileSync(`${dir}/maps/${f}`, 'utf8')); } catch { }
  const b = m.bbox, bb = b ? `北緯 ${b.s}〜${b.n}・東経 ${b.w}〜${b.e}` : '—';
  return `| ${f} | ${m.name ?? '—'} | ${bb} | ${(m.collectedAt ?? '').slice(0, 10) || '—'} |`;
});
const license = `# 地図データのライセンス（スムシティ地図データ）

この配布物に同梱している実在の街の地図データ（以下「スムシティ地図データ」）は、OpenStreetMap のデータから作った派生データベース（Derivative Database）です。

- 地図データ © OpenStreetMap contributors
- スムシティ地図データは Open Database License (ODbL) 1.0 で提供します：https://opendatacommons.org/licenses/odbl/1-0/
- OpenStreetMap の著作権とライセンス：https://www.openstreetmap.org/copyright
- 標高：国土地理院 標高タイル（5m メッシュ dem5a、欠けた点は 10m メッシュ dem）を加工して作成。https://maps.gsi.go.jp/development/ichiran.html （国土地理院コンテンツ利用規約 https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html ）

Contains information from OpenStreetMap, which is made available here under the Open Database License (ODbL).

## 対象のデータと入手方法

スムシティ地図データは、次のとおり機械で読める形（JSON、format: sumucity-realmap）のまま同梱しています。暗号化などの技術的な制限はありません。

- 分割版：\`maps/<地図の ID>.json\` がスムシティ地図データそのものです。
- 単体版（sumucity-standalone.html）・公開ページ版（sumucity-artifact.html）：HTML の中の \`<script type="application/json" id="sumu-map-<地図の ID>">\` の中身が、分割版の \`maps/<地図の ID>.json\` と同じデータです（文字 \`<\` だけ \`\\u003c\` に置き換えて埋め込んでいます。JSON として読めば元に戻ります）。

| ファイル | 地図 | 範囲 | OSM・標高の取得日（UTC） |
|---|---|---|---|
${mapRows.join('\n') || '| — | （地図の同梱なし） | | |'}

## 作成方法（元の OSM データからの変更点）

1. 収集：\`tools/collect-map.html\`（ブラウザで開く）が、指定した範囲の OSM のデータを Overpass API で、標高を国土地理院の標高タイルで取得する。
2. 変換：\`src/mapgen/importer.ts\` が、道路・鉄道・川・水域・建物・施設の名前と位置を取り出し、ゲームの格子（地図ごとの W×H のマス）に並べ直し、種類をゲームの分類にまとめ、標高を格子ごとに標本化して、上の JSON に保存する。範囲の中に無い浄水場・ごみ処理施設などをゲームのために補った場合は、JSON の \`assumed\` に書いてある。
3. 遊ぶとき：「まちづくり版」は \`src/mapgen/deform.ts\` が、上の JSON から、駅・線路・川・幹線道路・地形・地名の位置関係を縮めて残し、細い道や建物を省いて碁盤の目の道路・ゲームの建物に置き換えた街をその場で作る（この結果は保存した JSON を変えず、画面に描くだけ）。

ODbL 4.6 の「派生データベースの提供」は、上のとおり派生データベースの全体を機械で読める形で同梱することで行っています。作成方法は参考として記します（ソースコードを公開するかは作者が決めます）。

## 地図データ以外について

ゲームのプログラム（コード）・3D モデル・効果音・画面のデザインなど、スムシティ地図データ以外の部分は OpenStreetMap のデータではなく、ODbL の対象ではありません。
世帯数・人口・施設の定員・予算・価格などは、ゲームの推計・仮定で、OpenStreetMap や自治体のデータではありません。

- 作品全体（地図データ以外）のライセンス：${WORK_LICENSE}
- 3D 描画ライブラリ three.js（MIT License, © three.js authors）
- 人の歩く・立つ動きの関節角度は、Adobe Mixamo のアニメーションから取り出した数値を、ゲームの中で人を動かすためだけに使っています。素材として取り出して使うことはできません。
`;
fs.writeFileSync(`${dir}/LICENSE-map-data.md`, license);
console.log(`${dir}/LICENSE-map-data.md`, mapFiles.length + ' 件の地図');
const licTag = `<script type="text/plain" id="sumu-license-map">${license.replace(/</g, '&lt;')}</script>`;
html = orig.replace('</body>', licTag + '\n</body>');
fs.writeFileSync(`${dir}/index.html`, html); // 分割版にも
const pick = (re) => { const m = orig.match(re); if (!m) throw new Error('not found: ' + re); return m[0]; };
const title = pick(/<title>[\s\S]*?<\/title>/);
const font = pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/);
const style = pick(/<style[^>]*>[\s\S]*?<\/style>/).replace(/<style[^>]*>/, '<style>');
const app = pick(/<!--APP-->[\s\S]*?<!--\/APP-->/).replace(/<!--\/?APP-->/g, '');
const script = pick(/<script type="module"[^>]*>[\s\S]*<\/script>/).replace(/<script type="module"[^>]*>/, '<script type="module">');
fs.writeFileSync(out, [title, font, style, app.trim(), licTag, script].join('\n'));
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + ' kB');

// 単体で開ける版（ダブルクリックで遊べる）：同梱の地図をページに埋め込む
const maps = mapFiles;
// 分割版（dist/index.html ＋ dist/maps/）：サーバーに置いた地図の一覧。タイトル画面が、地図そのものを読まずに「遊べる地図」を知るために使う
if (maps.length) fs.writeFileSync(`${dir}/maps/manifest.json`, JSON.stringify({ maps: maps.map(f => ({ id: f.replace(/\.json$/, ''), bytes: fs.statSync(`${dir}/maps/${f}`).size })) }));
const emb = maps.map(f => `<script type="application/json" id="sumu-map-${f.replace(/\.json$/, '')}">${fs.readFileSync(`${dir}/maps/${f}`, 'utf8').replace(/</g, '\\u003c')}</script>`).join('\n');
const full = html.replace('</body>', emb + '\n</body>');
fs.writeFileSync(`${dir}/sumucity-standalone.html`, full);
console.log(`${dir}/sumucity-standalone.html`, (fs.statSync(`${dir}/sumucity-standalone.html`).size / 1e6).toFixed(1) + ' MB（地図 ' + maps.length + ' 件を埋め込み）');

// v92：単体版の配布用のまとまり（dist/sumucity-standalone/）。単体版の HTML に、地図データ（ODbL の派生データベース）を
// そのまま読める JSON として並べて置き、ライセンス文書と案内を添える。HTML に埋め込んだ JSON だけでも ODbL 4.6 の提供にはなるが、
// 受け取った人が取り出しやすいよう、同じデータをファイルとしても渡す。zip があれば 1 つのファイル（sumucity-standalone.zip）にまとめる
{
  const B = `${dir}/sumucity-standalone`;
  fs.rmSync(B, { recursive: true, force: true }); fs.mkdirSync(`${B}/maps`, { recursive: true });
  fs.copyFileSync(`${dir}/sumucity-standalone.html`, `${B}/sumucity-standalone.html`);
  for (const f of maps) fs.copyFileSync(`${dir}/maps/${f}`, `${B}/maps/${f}`);
  fs.copyFileSync(`${dir}/LICENSE-map-data.md`, `${B}/LICENSE-map-data.md`);
  fs.writeFileSync(`${B}/はじめにお読みください.txt`, [
    'スムシティ（単体版）',
    '',
    '■ 遊び方',
    'sumucity-standalone.html をブラウザ（Chrome・Edge・Safari など）で開いてください。サーバーもインターネットも要りません（文字の形はインターネットにつながっているとき、より見やすくなります）。',
    '',
    '■ 同梱の地図データについて',
    'maps フォルダの JSON は、OpenStreetMap のデータから作った地図データ（派生データベース）で、Open Database License（ODbL）1.0 で提供します。',
    'HTML に埋め込まれているものと同じ内容です。詳しくは LICENSE-map-data.md をお読みください。',
    '地図データ © OpenStreetMap contributors（https://www.openstreetmap.org/copyright）／標高 国土地理院 標高タイルを加工して作成',
    '',
    '■ 地図データ以外（プログラム・3D モデル・音・画面のデザイン）',
    'ODbL の対象ではありません。ライセンスは LICENSE-map-data.md の末尾の「作品全体のライセンス」をご覧ください。',
    '',
  ].join('\r\n'));
  try { (await import('node:child_process')).execSync(`cd "${dir}" && rm -f sumucity-standalone.zip && zip -qr sumucity-standalone.zip sumucity-standalone`, { stdio: 'ignore' }); console.log(`${dir}/sumucity-standalone.zip`, (fs.statSync(`${dir}/sumucity-standalone.zip`).size / 1e6).toFixed(1) + ' MB（単体版＋地図 JSON＋ライセンス文書）'); }
  catch { console.log(`${B}/（zip がないのでフォルダのまま）`); }
}

// 公開版（Claude の artifact）：ページは 16MB までなので、埋め込む地図を絞る（v81）。残りの街は、単体ファイル版か、自前のサーバーに置いた版で遊べる
const PUB = (process.env.PUB_MAPS ?? 'hodogaya,shibuya,yokohama,umeda').split(',');
const embP = maps.filter(f => PUB.includes(f.replace(/\.json$/, ''))).map(f => `<script type="application/json" id="sumu-map-${f.replace(/\.json$/, '')}">${fs.readFileSync(`${dir}/maps/${f}`, 'utf8').replace(/</g, '\\u003c')}</script>`).join('\n');
fs.writeFileSync(`${dir}/sumucity-artifact.html`, html.replace('</body>', embP + '\n</body>'));
console.log(`${dir}/sumucity-artifact.html`, (fs.statSync(`${dir}/sumucity-artifact.html`).size / 1e6).toFixed(1) + ' MB（地図 ' + PUB.join('・') + '）');
