# アセット・外部データ・ライセンス（v90 で点検）

「確認した事実」と「未確認・推測」を分けて書きます。法的な判断ではなく、リポジトリと配布物を調べた結果です。

## 1. 素材の出どころ（確認した事実）

| 種類 | 出どころ | 根拠 |
|---|---|---|
| 建物・道路・樹木・看板・車・列車の多く | ソースコードでの生成（`src/render/models.ts`・`geo.ts`・`vehgen.ts`・`trainkit.ts`・`treegen.ts` など） | 外部の画像・音声ファイルを読む処理がない |
| 名所の 3D モデル（`src/assets/*.glb` 48 点。元は `assets-src/*.glb`） | **作者が Blender で作成**。台本は `tools/blender_*.py`（`blender_lmlib.py` の部品 ＋ 個別の台本）。`tools/lm-pack.mjs` で画像を外し meshopt で圧縮して `src/assets/` へ | 48 点すべての `asset.generator` が「Khronos glTF Blender I/O」。台本のないモデルがあるかは**未確認**（台本は約 10 本、名所は 48 点） |
| 車・列車・樹木・雲のデータ（`cars.json`・`vehicles*.json`・`train.json`・`trees.json`・`clouds.json`） | 同じく `tools/blender_cars.py`・`blender_vehicles.py`・`blender_train.py`・`blender_trees.py`・`blender_clouds.py` で作成 | 台本あり |
| 人の歩く・走る・立つ・話す・電話・スマホの動き（`src/assets/anim.json`、約 25KB） | **Adobe Mixamo の動き（FBX）から、関節の角度だけを取り出した数値**（`tools/blender_mixamo_bake.py`。歩き・走り・息づかい・話す・電話・スマホ）。FBX そのもの・Mixamo のキャラクターは配布物に入っていない。人の体はコードで作った簡素な形 | `tools/blender_mixamo_bake.py` と `src/render/people.ts` の記述 |
| 効果音・BGM・環境音・人の声 | **Web Audio で毎回その場で合成**。音源ファイルなし | `src/audio/sound.ts` 冒頭の記述。`.mp3`・`.ogg`・`.wav` の読み込みなし |
| 看板の文字 | ブラウザのフォントで描画 | |

### Mixamo について（v92 で調査。要確認）

- 調査の結果・当てはめ・選択肢（現状のまま／自作の動きに置き換え。置き換える場所は `src/render/people.ts` の `ANIM_TABLE`、工数の見立て 1〜2 日）は [配布前の確認-Mixamo-ODbL.md](配布前の確認-Mixamo-ODbL.md) §1。公式 FAQ は作業環境から読めなかったため、作者が原文で確認すること。
- ※ 台本のパス（`C:\Users\kgryo\...`）は作者の PC のものです。

## 2. ライブラリ

| 名前 | 版 | 用途 | ライセンス |
|---|---|---|---|
| three | 0.186.x | 3D 描画（配布物に同梱） | MIT |
| vite / vite-plugin-singlefile | 8.x / 2.x | ビルド（開発時のみ） | MIT |
| typescript | 7.x | 型検査（開発時のみ） | Apache-2.0 |
| vitest | 5.x | テスト（開発時のみ） | MIT |
| @gltf-transform/* | 4.x | GLB の圧縮（`tools/lm-pack.mjs`、開発時のみ） | MIT |
| Playwright | — | 検証スクリプト（開発時のみ。リポジトリには入れていない） | Apache-2.0 |

配布物（`dist/*.html`）にライセンス文（three.js の著作権表示）をそのまま載せているかは**未確認**です（MIT は著作権表示とライセンス文の同梱を求める。ミニファイでコメントが落ちている可能性があるので、配布前に確認するとよい。画面の「この作品について」には three.js（MIT）と書いてあります）。

## 3. フォント

| 名前 | 用途 | ライセンス | 読み込み |
|---|---|---|---|
| Zen Kaku Gothic New | 画面の文字、看板 | SIL Open Font License 1.1 | Google Fonts（`fonts.googleapis.com`） |
| Barlow Semi Condensed | 数字 | SIL Open Font License 1.1 | 同上 |

- フォントはファイルとして同梱せず、`index.html` の `<link>` で Google Fonts から読み込みます。**オフラインの単体版でも、この外部の読み込みは行われます**（確認済み：`dist/sumucity-standalone.html` に `fonts.googleapis.com` の `<link>` がある）。
- 読み込めないとき（オフライン・ブロック）は CSS の指定どおり、端末の日本語フォント（ゴシック体）で表示されます。文字が欠けることはありませんが、字形と看板の幅が少し変わります。
- 完全にオフラインで同じ見た目にするには、OFL のフォントファイルを同梱（base64 で埋め込み）する方法があります（OFL は同梱・再配布を許す）。現状は**未対応**で、サイズ（日本語フォントは数 MB）と引き換えです。
- Google Fonts への接続時に、利用者の IP などが Google に送られます（外部通信がある点は、配布先によっては説明が要ります）。

## 4. 地図データ（実在の街）

| 項目 | 内容 |
|---|---|
| 道路・鉄道・川・建物・施設の名前と位置 | © OpenStreetMap contributors。**Open Database License（ODbL）1.0**。https://www.openstreetmap.org/copyright |
| 標高 | 国土地理院 標高タイル（収集ツールは `dem5a`（5m）を先に、欠けた点は `dem`（10m）。どちらも無い点は海とみなす）。出典を明示して利用（国土地理院コンテンツ利用規約） |
| 収集の方法 | `tools/collect-map.html` を作者のブラウザで開き、OSM（Overpass API）と国土地理院のタイルを直接取得。収集したデータは `public/maps/*.json` に同梱 |
| 形式 | `format: 'sumucity-realmap'`、`version: 2`（全 12 件共通） |
| ゲームの推計 | 世帯数・人口・施設の能力・予算・価格・税率は、自治体の統計ではなく**ゲームの推計**。タイトルのカードにも書いている |

### 地図ごとの一覧（各 JSON の `credits`・`collectedAt`・`assumed` を読んだ結果）

全 12 件の `credits` は同一：「地図データ © OpenStreetMap contributors（ODbL）／標高 国土地理院 標高タイル」。

| ID | 地図 | 取得日（UTC） | 補った項目（`assumed`） |
|---|---|---|---|
| hodogaya | 保土ケ谷 | 2026-10-14 | なし（浄水場・ごみ処理施設は範囲内の実データ） |
| shibuya | 渋谷 | 2026-11-11 | 配水池（市外の浄水場から受水）・ごみ処理施設（近隣の施設を利用） |
| yokohama | 横浜 | 2026-11-11 | 同上 |
| umeda | 梅田 | 2026-11-11 | ごみ処理施設（近隣の施設を利用） |
| tenjin | 天神・博多 | 2026-11-11 | ごみ処理施設（近隣の施設を利用） |
| kyoto | 京都 | 2026-11-11 | 配水池・ごみ処理施設 |
| kichijoji | 吉祥寺 | 2026-11-11 | ごみ処理施設 |
| kosugi | 武蔵小杉 | 2026-11-11 | ごみ処理施設 |
| kamata | 蒲田 | 2026-11-11 | ごみ処理施設 |
| ube | 宇部 | 2026-11-11 | 配水池・ごみ処理施設 |
| jonan | 城南区 | 2026-11-11 | ごみ処理施設 |
| togitsu | 時津 | 2026-11-11 | ごみ処理施設 |

### ODbL の再配布の手続き（v92 で整備）

- 地図 JSON は OSM からの派生データベースとして ODbL 1.0 で提供する。`npm run build` が `dist/LICENSE-map-data.md` を作り、同じ本文を各 HTML に埋め込む（タイトル「この作品について」→「地図データのライセンス（全文）」）。派生データベースそのものは分割版の `maps/*.json`（単体版では埋め込みの JSON）。
- 地図データ以外（コード・モデル・音）は ODbL の対象ではない。作品全体（地図データ以外）は「© 2026 dr.matree. All rights reserved.」（v92 で作者が決定。`scripts/make-page.mjs` の `WORK_LICENSE`）。
- 根拠・判断が分かれる点：[配布前の確認-Mixamo-ODbL.md](配布前の確認-Mixamo-ODbL.md) §2。
- OSM の利用規約・Overpass API の利用の許容量は、収集時のものを確認していません（**未確認**）。

## 5. 画面での出典の表示

| 場所 | 内容 |
|---|---|
| タイトル画面の下 | 実在の地図の出典（OSM・ODbL・国土地理院） |
| タイトル画面「この作品について（出典とライセンス）」（v90 で追加、v92 で補足） | OSM・ODbL 本文へのリンク・地図データの入手先・国土地理院（加工して作成）・ODbL の対象外の部分・three.js・フォント・自作モデル・合成音・Mixamo 由来の動き・推計の注意・地図データのライセンス全文 |
| 実在の街のゲーム画面の下 | 地図の出典（`src/ui/ui.ts` の `#credit`） |
| 街の中の「保存・設定」 | 出典の欄は**ない**（足す場合は `src/ui/ui.ts` を変更。v90 の配布担当の範囲外のため未対応） |

## 6. 外部への通信

- 起動時：Google Fonts（フォントの CSS とファイル）。
- 分割版：`maps/manifest.json`（起動時）と、選んだ地図の `maps/<id>.json`。
- 地図の収集（`tools/collect-map.html`、遊ぶときは不要）：OSM（Overpass）と国土地理院。
- セーブ・取り込んだ地図・経歴はブラウザ内（localStorage・IndexedDB）に保存し、どこにも送りません。

## 7. 参考

- 実在都市データ（国土交通省 PLATEAU など）は使っていません。使う場合はデータごとのライセンス、出典表示、加工・再配布条件を確認します。https://www.mlit.go.jp/plateau/faq/
