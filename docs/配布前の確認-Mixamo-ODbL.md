# 配布前の確認：Mixamo と ODbL（v92）

法律の助言ではありません。公式の一次資料に基づく事実の整理を目指しましたが、**今回の作業環境からは公式サイトの多くに接続できませんでした**（下の「調査の限界」）。どの記述が何に基づくかを、各項に印で示します。

- 【一次】公式の一次資料を今回読んで確かめたもの
- 【二次】検索結果・フォーラム（Adobe コミュニティを含む）・OSM のメーリングリストや wiki など、一次資料ではないもの
- 【記憶】担当者が既に知っている条文・規約の内容で、今回原文を取得して照合していないもの（**作者が原文で照合すること**）
- 【推測】当てはめ・解釈

## 0. 調査の限界（事実）

2026-11-18、この作業環境から次のホストを読もうとして、名前解決できず（環境のネットワーク制限）読めませんでした。

| URL | 結果 |
|---|---|
| https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html （Mixamo FAQ） | 接続できず |
| https://osmfoundation.org/wiki/Licence/Attribution_Guidelines | 接続できず |

ホストへの接続が禁じられていたため、ほかの公式ページ（Adobe General Terms of Use、opendatacommons.org の ODbL 本文、OSMF の Community Guidelines、国土地理院の利用規約）も読んでいません。読めたのは Web 検索の結果（題名・抜粋）だけです。したがって**この文書には【一次】の印の付いた記述がありません**。配布の前に、作者が §5 の URL を開いて原文と照らしてください。

## 0+. 一次資料で確かめた事実（2026-11-19 追記）

v92 の最初の調査では一次資料に接続できなかった。その後、このセッションのネットワークに公式サイトを許可し、次の 4 件の原文を直接読んだ（取得日 2026-11-19）。下の 1・2 章の【記憶】【二次】の記述のうち、ここで確かめたものはこちらが優先する。

### Mixamo FAQ（https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html 、ページの最終更新 2021-09-14）
- 「Mixamo is available free for anyone with an Adobe ID and does not require a subscription to Creative Cloud.」
- 「You can use both characters and animations royalty free for personal, commercial, and non-profit projects including: … Create video games.」
- 利用できない場合として「Enterprise and Federated IDs」と「country code from China」の利用者が挙がっている。
- **このページ（公式 FAQ の現行版）には、「生のアニメーションファイルの再配布の禁止」や「DLC・アセットストア」に関する文言は見当たらなかった**（ページ全体の本文と HTML を検索して確認）。その種の制限は、二次情報（Adobe コミュニティのスレッド等）で FAQ の旧版や別の条項として紹介されているもので、現行の FAQ では確かめられなかった。Adobe の一般利用条件（General Terms of Use）や Mixamo の個別条項に同様の制限があるかは、今回は読んでいない（未確認）。
- **当てはめ【推測】**：この作品は、Mixamo の動きから取り出した関節角度の数値をゲームの中で人物を動かすためだけに使っている。公式 FAQ の「video games に royalty free で使える」に当たると読める。素材としての再配布ではない、という v92 の表記はそのまま妥当と考える。ただし Adobe の一般利用条件は未確認なので、配布の前に作者が https://www.adobe.com/legal/terms.html を確認することを勧める。

### ODbL 1.0 本文（https://opendatacommons.org/licenses/odbl/1-0/）
- 定義：「“Derivative Database” – Means a database based upon the Database, and includes any translation, adaptation, arrangement, modification, or any other alteration of the Database …」「“Produced Work” – a work (such as an image, audiovisual material, text, or sounds) resulting from using the whole or a Substantial part of the Contents …」
- 4.3（制作物の表示）：Produced Work を公に使う場合、それを使う人・見る人が「Content was obtained from the Database … and that it is available under this License」と分かる表示が要る。例文「Contains information from DATABASE NAME, which is made available here under the Open Database License (ODbL).」（名前と ODbL 本文へのリンクつき）。
- 4.4（Share alike）：公に使う派生データベースは ODbL（または後継・互換ライセンス）でなければならない。4.4c：派生データベースから作った Produced Work を公に使うと、その派生データベースも公に使ったことになる。
- 4.6（派生データベースへのアクセス）：派生データベース、またはその Produced Work を公に使う場合、受け取った人に、機械で読める形で「a. The entire Derivative Database; or b. A file containing all of the alterations … or the method of making the alterations … (such as an algorithm)」を提供しなければならない。インターネットで配る場合は無料。
- 4.7（技術的手段）：ODbL の権利を制限する条件や技術的手段を課してはならない（並行して制限のない版を無料で提供する場合を除く）。
- **当てはめ【推測】**：地図 JSON（OSM から抽出・整形・デフォルメしたもの）は派生データベース。ゲームの画面は Produced Work。単一 HTML に JSON のまま埋め込んで配る場合も、分割版の maps/*.json も、派生データベースそのものを機械で読める形で無料で渡しているので 4.6a を満たす方向。v92 で入れた `LICENSE-map-data.md`（ODbL で提供する旨・本文へのリンク・作成方法・入手方法・技術的制限なし）は 4.3・4.4・4.6・4.7 の要求に沿っている。

### OSMF 帰属表示の指針（https://osmfoundation.org/wiki/Licence/Attribution_Guidelines）
- 「Computer games and simulations：For video or computer games, attribution can be provided either by a splash screen on application startup, in the game view, during gameplay, on the credits page, in the menu, or in another suitable location. Detailed information must be provided in a suitable location if the initial attribution does not provide detailed information.」
- 「Attribution must also make it clear that the data is available under the Open Database License. This may be done by making the text “OpenStreetMap” a link to openstreetmap.org/copyright …」「The historical forms of attribution “© OpenStreetMap contributors” or “© OpenStreetMap” are acceptable.」
- **当てはめ【推測】**：プレイ中の画面下の「地図 © OpenStreetMap contributors（ODbL）」（openstreetmap.org/copyright へのリンクつき）と、タイトルの「この作品について」の詳細で、ゲームの帰属表示の指針を満たすと読める。

### OSMF Produced Work の指針（https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline 、2014-06-06 理事会承認）
- 「If the published result of your project is intended for the extraction of the original data, then it is a database and not a Produced Work. Otherwise it is a Produced Work. However, if you publish a produced work, the underlying database has to be published as well (or alternations to the original database …), according to section 4.6 of ODbL」
- **当てはめ【推測】**：ゲーム自体（画面）は Produced Work だが、元になった派生データベース（地図 JSON）の提供が要る。この作品は JSON を同梱しているので満たす方向。

### 国土地理院コンテンツ利用規約（https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html）
- **読めなかった**。サイトが古い TLS の再ネゴシエーションを要求し、この環境の通信の制限で接続できなかった。標高タイルの出典の書き方（「出典：国土地理院」「〇〇を加工して作成」）と申請の要否は、作者が原文で確認すること。v92 の表記「国土地理院 標高タイルを加工して作成」は、一般に案内されている書き方に沿っているが、今回の原文では確かめていない。

## 1. Mixamo（Adobe）

### 1.1 調べたこと

| 出典 | 取得日 | 内容 |
|---|---|---|
| Web 検索「Mixamo FAQ royalty free characters animations commercial redistribute raw files」の結果 | 2026-11-18 | 【二次】公式 FAQ そのものは検索に出てこなかった。itch.io の投稿が FAQ を引用し、キャラクターとアニメーションは個人・商用・非営利のプロジェクト（映画・ビデオゲームを含む）でロイヤリティなしに使える、とする |
| Adobe コミュニティ「Mixamo FAQ: Licensing, Royalties, Ownership, EULA and TOS」 https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775 | 2026-11-18（検索の抜粋のみ） | 【二次】「できない唯一のことは、生の（raw）キャラクターとアニメーションのファイルを配布すること」という趣旨の回答。利用者が引用した FAQ の抜粋には、除外される用途として「DLC or Addon Content for Games」「3D ストック・アセットストア向けのパッケージで、キャラクターやアニメーションの生のファイルを販売・配布するもの」が挙がっている |
| 同コミュニティの別の回答（検索の抜粋） | 2026-11-18 | 【二次】ゲームに組み込んで（ビルドした製品に焼き込んで）配るのは可、という回答が多い。「プロジェクトからモデルを取り出せる人は、Mixamo から Adobe ID でダウンロードすべき」という言い方の回答もある |

【記憶】公式 FAQ の要旨は次のとおり（照合が要る）：
- Adobe ID でログインすれば、Mixamo のキャラクターとアニメーションは無料で、ロイヤリティなしに、商用・非商用のプロジェクト（ゲーム・映画・イラストなど）に使える。
- ただし、キャラクターやアニメーションの**生のファイル**（raw files）を、単体で（素材として）配布・販売することは許されない。
- 利用の根拠は Adobe General Terms of Use（と付随する追加条件）。

### 1.2 この作品への当てはめ【推測】

| 事実（リポジトリで確認） | |
|---|---|
| 配布物に入っているもの | `src/assets/anim.json`（約 25KB）を JS に埋め込んだもの。6 種の動き（歩き・走り・息づかい・話す・電話・スマホ）について、1 フレーム 12 個の関節角度（ラジアン、小数 4 桁）を 24〜64 フレームに間引いた数値 |
| 入っていないもの | Mixamo の FBX、キャラクター（メッシュ・テクスチャ・骨格）、Mixamo の骨の名前・回転（四元数）そのもの |
| 作り方 | `tools/blender_mixamo_bake.py` が、骨の位置から「ももの前後の角度」「ひざの曲げ」などを計算して書き出す（骨の回転をそのまま写していない）。読み込んだ側（`src/render/people.ts`）は、立ち姿の平均を 0 にそろえ、範囲を切り、GPU のテクスチャにして、コードで作った簡素な人の形を動かす |
| 取り出せるか | 単体版の HTML を開けば JSON の数値として読める（難読化はしていない） |

- **ゲームに組み込んだ利用**と読める点：ゲームの中で人を動かすためにだけ使い、素材として売り出したり、単体でダウンロードできるようにしたりしていない。元のファイル形式（FBX）ではなく、別の体の形に合わせて大きく間引き・変換した数値で、Mixamo の他のソフトにそのまま読み込めるものではない。
- **疑わしさが残る点**：単体の HTML から誰でも数値を取り出せる。Adobe が「生のアニメーションデータ」をどこまで含むと考えるか（変換・間引きした関節角度を含むか）は、今回読めた資料からは判断できない。コミュニティの回答には「取り出せる形だと良くない」と読めるものもある。
- 結論【推測】：一般的なゲームでの Mixamo の使い方（ゲームの中に組み込む）の範囲と読める可能性が高いが、**判断が分かれ得る**。断定はできない。

### 1.3 作者が選ぶこと

(a) **現状のまま配布する**：公式 FAQ を開いて「ゲームに組み込んでよい」「生のファイルの再配布は不可」の文言を確かめる。表記は条件として求められていない【記憶】が、出典の明示は害がないので、タイトルの「この作品について」に「Adobe Mixamo の動きから取り出した数値（ゲームの中だけで使用。素材としての再配布はしない）」と書いた（v92）。気になる場合は、配布物の文書（`LICENSE-map-data.md` とは別。下の §3.3）に「anim.json を取り出して素材として使わないでください」と添える。

(b) **疑わしさを無くす**：Mixamo 由来の数値を、自作の手続き的な動き（サイン波の関節角度）に置き換える。
- 置き換える場所：`src/render/people.ts` の `ANIM_TABLE`（130〜151 行目付近）。`AS`（anim.json）を読む代わりに、同じ形（動きごとに `n` フレーム × 12 個の角度、`dur` 秒）の配列をコードで作れば、シェーダー（`AGLSL`）と呼び出し側は**変更不要**。
- 現状、手続き的な歩きの仕組みは **people.ts に無い**（動きはすべて anim.json から）。したがって「定数で切り替え」は数行では済まず、今回は実装していない（作者の判断が要るため）。
- 工数の見立て【推測】：歩き・走りのサイン波（もも・ひざ・腕・腰の上下の位相をそろえる）は半日程度。息づかい・話す・電話・スマホの身ぶりは見た目の調整が要り、合わせて 1〜2 日。見た目は今より単純になる。置き換えたら `tools/blender_mixamo_bake.py` と `src/assets/anim.json` を削除し、出典の欄から Mixamo を消す。

## 2. OpenStreetMap（ODbL 1.0）

### 2.1 調べたこと

| 出典 | 取得日 | 内容 |
|---|---|---|
| Web 検索「ODbL 1.0 Derivative Database Produced Work 4.6 …」 | 2026-11-18 | 【二次】OSM wiki「Open Data License/Alteration Files - Guideline」 https://wiki.openstreetmap.org/wiki/Open_Data_License/Alteration_Files_-_Guideline が 4.6 を「a file containing all of the alterations made to the Database or the method of making the alterations」と引く。legal-talk（2011-07）https://lists.openstreetmap.org/pipermail/legal-talk/2011-July/006448.html で、4.6(b) の「or」は「変更点のファイル」か「変更の方法」かの選択と読む回答 |
| 同検索の結果 | 2026-11-18 | 【二次】OSMF「Community Guidelines/Trivial Transformations - Guideline」https://osmfoundation.org/wiki/Community_Guidelines/Trivial_Transformations_-_Guideline の存在（本文は読めていない） |

【記憶】ODbL 1.0 本文（https://opendatacommons.org/licenses/odbl/1-0/）の該当条項の要旨（照合が要る）：
- 定義：**Derivative Database**＝元のデータベースに基づき、内容の変更・追加・抽出などをしたデータベース。**Produced Work**＝データベースまたはその実質的な部分を使った結果として作られた作品（画像・地図・映像・ゲームの画面など）。**Collective Database**＝元のデータベースを変更せず、独立したデータベースと並べて集めたもの。
- 4.2〜4.3（Notices）：データベースの再配布・公開利用では、このライセンスの表示（ライセンスへの参照）、著作権表示を保つこと。
- 4.3（Produced Work）：Produced Work を公に使う場合、「Contains information from DATABASE NAME, which is made available here under the Open Database License (ODbL).」のような、データベースの出典とライセンスを知らせる表示をする。
- 4.4（Share alike）：Derivative Database を公に使う（配布する）場合、その Derivative Database を **ODbL**（または互換のライセンス）で提供する。Produced Work そのものは ODbL で提供しなくてよい。
- 4.6（Access to Derivative Databases）：Derivative Database、または Derivative Database から作った Produced Work を公に使う場合、受け取った人に、機械可読の形で **(a) Derivative Database の全体**、または **(b) 変更点のすべてを含むファイル、もしくは変更の方法（アルゴリズムなど）** を提供する申し出をする。
- 4.7（Technical measures）：Derivative Database を配布するとき、DRM などの技術的手段で制限する場合は、制限のない版も併せて提供する。

【記憶】OSMF の Attribution Guidelines（https://osmfoundation.org/wiki/Licence/Attribution_Guidelines）と Copyright and License（https://www.openstreetmap.org/copyright）の要旨：
- 表示は「© OpenStreetMap contributors」（または「© OpenStreetMap」）。画面ではリンク先を https://www.openstreetmap.org/copyright にする。
- 地図を見せる場所（ゲームの画面を含む）の、見える位置（多くは隅）に、ふつうに読める大きさで出す。対話的な地図では、地図のそばに常に、または「i」ボタンなどから一度の操作で見られる形でよい。
- OSMF は Produced Work・Collective Database・Substantial（実質的な部分）・Horizontal Layers・Geocoding について解釈の指針（Community Guidelines）を出している。

【記憶】国土地理院コンテンツ利用規約（https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html）の要旨：出典を記載すれば、複製・加工・再配布・商用利用ができる。加工した場合は、出典に加えて加工したことを示す（例「国土地理院の標高タイルを加工して作成」）。標高タイルは https://maps.gsi.go.jp/development/ichiran.html に一覧。

### 2.2 この作品への当てはめ【推測】

- **地図 JSON（`public/maps/*.json`、分割版の `maps/*.json`、単体版・アーティファクト版に埋め込まれた JSON）は Derivative Database と読むのが自然**。OSM のデータから道路・鉄道・川・建物・施設の名前と位置を抽出し、格子に並べ直して保存した、機械で読めるデータベースだから。単体版の HTML の中に埋め込んでも、JSON として取り出せるので、データベースの配布にあたると考えるのが安全。
- **ゲームの画面（3D の描画）は Produced Work**。まちづくり版（`deform.ts`）で、細い道や建物を省いて碁盤の目に置き換えた街は、画面としては Produced Work だが、元の地図 JSON は配布物に入っているので、上の扱いは変わらない。
- 地図 JSON 以外（ゲームのコード、3D モデル、音、効果、UI）は、地図データと組み合わさって 1 つの配布物になっていても、それ自体は OSM のデータではなく、**ODbL の対象ではない**と読める（ODbL は データベースとその内容に関するライセンスで、Produced Work や同梱の別の作品にまで ODbL を求めない【記憶】）。
- 必要な対応（4.3・4.4・4.6・4.7 から）：
  1. 帰属表示：© OpenStreetMap contributors、ライセンス（ODbL）への言及とリンク。→ 既に画面にある（§3.2）。
  2. Share-Alike：地図 JSON を ODbL 1.0 で提供すると明示する。→ v92 で `LICENSE-map-data.md` を添付（§3.1）。
  3. 4.6：派生データベースの全体を機械可読の形で入手できるようにする。→ 分割版の `maps/*.json` がそれ自体。単体版でも HTML の中の `<script type="application/json" id="sumu-map-…">` がそれ自体。さらに作成方法（`tools/collect-map.html`・`src/mapgen/importer.ts`・`deform.ts`）を文書に書いた。
  4. 4.7：DRM・暗号化はしていない（JSON のまま）。
- 判断が分かれ得る点：単体版を配るとき、地図 JSON を「HTML に埋め込んだまま」でも 4.6 の「機械可読の形で提供」を満たすか。取り出せるが、手順の案内が要るので、文書に取り出し方を書いた。より確実にするなら、単体版と一緒に `maps/*.json`（分割版の地図）をそのまま同じ場所で配る。

## 3. 実装した対応（v92）

### 3.1 地図データのライセンス文書を配布物に添える

- `scripts/make-page.mjs` が、ビルドのたびに `dist/LICENSE-map-data.md` を作る（`dist/maps/*.json` を読んで、地図ごとの名前・範囲（緯度経度）・取得日を自動で書く。地図が増えても追従する）。
- 同じ本文を、単体版・アーティファクト版・分割版の HTML に `<script type="text/plain" id="sumu-license-map">` として埋め込み、タイトル画面の「この作品について」の中の「地図データのライセンス（全文）」で読めるようにした（`src/ui/title.ts`）。1 ファイルだけを配っても、文書が一緒に届く。
- 中身：地図データは OSM からの派生データベースで ODbL 1.0 で提供されること、ODbL 本文へのリンク、© OpenStreetMap contributors、各地図の取得日と範囲、作成方法、派生データベースの入手方法、標高データの出典（加工の表記つき）、地図データ以外は ODbL の対象でないこと、作品全体のライセンスは作者が決める（空欄）。

### 3.2 画面の帰属表示（確認の結果）

| 場所 | 内容 | 判断 |
|---|---|---|
| タイトルの下 | © OpenStreetMap contributors（ODbL）、リンク先 openstreetmap.org/copyright・国土地理院 | 足りている【推測】 |
| タイトル「この作品について」 | 同上＋ v92 で ODbL 本文へのリンク、地図データの入手先（`maps/*.json`・埋め込み）、ライセンス全文、標高の「加工して作成」、Mixamo の書き方を補った | v92 で補った |
| 実在の街のプレイ中の画面下（`src/ui/ui.ts` の `#credit`） | 地図 © OpenStreetMap contributors（ODbL）、リンク先 openstreetmap.org/copyright・標高 国土地理院・取得日 | 指針（隅に読める大きさ、リンク）を満たすと読める【推測】ので変更なし（`ui.ts` は今回の範囲外でもある） |

### 3.3 文書

- この文書、`docs/ASSETS.md` の Mixamo・ODbL の節を更新、`README.md` にライセンスの節を追加。

## 4. 作者が決めること

1. **作品全体（コード・3D モデル・音など、地図データ以外）のライセンス**：`LICENSE-map-data.md` と README では空欄（「作者が決める」）にしてある。決めたら `scripts/make-page.mjs` の `WORK_LICENSE` に書く。
2. **Mixamo**：§1.3 の (a) 現状のまま（公式 FAQ を確認のうえ）か、(b) 自作の動きに置き換えるか。
3. **単体版を配る形**：単体版だけを配るか、地図 JSON（`maps/*.json`）を同じ場所に並べて配るか（4.6 をより確実に満たすのは後者）。
4. **地図データの名前**：文書では「スムシティ地図データ」と呼んでいる。変える場合は `make-page.mjs`。

## 5. 作者が原文で確認する URL（配布の前に）

| 確認 | URL |
|---|---|
| Mixamo FAQ（ゲームでの利用・生のファイルの再配布） | https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html |
| Adobe General Terms of Use | https://www.adobe.com/legal/terms.html |
| OSM Copyright and License | https://www.openstreetmap.org/copyright |
| ODbL 1.0 本文 | https://opendatacommons.org/licenses/odbl/1-0/ |
| OSMF Attribution Guidelines | https://osmfoundation.org/wiki/Licence/Attribution_Guidelines |
| OSMF Community Guidelines（Produced Work・Collective Database・Substantial・Horizontal Layers・Geocoding） | https://osmfoundation.org/wiki/Licence/Community_Guidelines |
| 国土地理院コンテンツ利用規約 | https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html |

## 6. 法律の専門家に確認を勧める点

- 変換・間引きした関節角度の数値を、取り出せる形でゲームに同梱することが、Mixamo の条件の「生のアニメーションデータの再配布」にあたるか。
- 地図 JSON を HTML に埋め込んだ単体版の配布で、ODbL 4.6 の「機械可読の形での提供」を満たすか。
- 作品全体のライセンスを決めるとき、ODbL の地図データと同じ配布物にすることで、作品全体に影響が出ないか（ODbL の Collective Database・Produced Work の扱い）。
- 有償で配布する場合の扱い（ODbL は有償配布を禁じていない【記憶】が、Share-Alike と 4.6 の義務は残る）。
