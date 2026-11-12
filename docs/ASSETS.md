# アセットと外部データ

## アセット

外部の 3D モデル、画像、音声、建物データは **使っていません**。建物・道路・樹木・車・看板は全てソースコード
（`src/render/models.ts`、`src/render/scene.ts`）で生成しています。看板の文字はブラウザのフォントで描いています。
既存の街づくりゲームの UI、ロゴ、音楽、モデルは流用していません。

## ライブラリ

| 名前 | 版 | 用途 | ライセンス |
|---|---|---|---|
| three | 0.186.1 | 3D 描画（配布物に同梱） | MIT |
| vite | 8.x | 開発サーバー・ビルド（開発時のみ） | MIT |
| vite-plugin-singlefile | 2.x | 単一 HTML 化（開発時のみ） | MIT |
| typescript | 7.x | 型検査（開発時のみ） | Apache-2.0 |
| vitest | 5.x | テスト（開発時のみ） | MIT |

## フォント

Google Fonts から読み込みます（読み込めない場合は端末の日本語フォントで表示します）。

| 名前 | 用途 | ライセンス |
|---|---|---|
| Zen Kaku Gothic New | 画面の文字、看板 | SIL Open Font License 1.1 |
| Barlow Semi Condensed | 数字 | SIL Open Font License 1.1 |

## 外部データ

なし。人口・価格・税率などは全てゲーム用の仮定です（`src/sim/config.ts`）。
実在都市データ（国土交通省 PLATEAU など）は Phase 4 の候補で、Phase 1 は依存していません。
使う場合はデータごとのライセンス、出典表示、加工・再配布条件を確認します。

- https://www.mlit.go.jp/plateau/faq/
- https://www.mlit.go.jp/plateau/start-guide/

## 実在都市版（保土ケ谷）の地図

- 道路・鉄道・川・建物・施設の名前と位置：© OpenStreetMap contributors。Open Database License（ODbL 1.0）。https://www.openstreetmap.org/copyright
  `data/hodogaya-map.json` は OSM から作った派生データベースで、ODbL に従います。
- 標高：国土地理院 標高タイル（DEM10B）。出典を明示して利用（国土地理院コンテンツ利用規約）。
- 画面に出典を常に表示しています。
