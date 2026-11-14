// 遊べる地図の一覧。地図を増やすときは、ここに 1 件足して、収集ツール（tools/collect-map.html）の PRESETS にも同じ ID で足す（範囲は収集時に駅・役所の位置から合わせ、実際の範囲はデータに入る）。
// データ（public/maps/<id>.json）を同梱した地図はすぐ遊べる。同梱していない地図は、集めたデータをタイトル画面で取り込めば遊べる。

export interface MapEntry {
  id: string;
  /** 地図の名前（タイトル画面の見出し） */
  name: string;
  /** 都道府県・市区町村 */
  area: string;
  /** プレイヤーの役（ゲーム中の表記は「市」で統一） */
  role: string;
  /** 街の呼び名（GameState.cityName） */
  cityName: string;
  /** 一言の説明 */
  blurb: string;
  /** 範囲（緯度・経度） */
  bbox?: { s: number; w: number; n: number; e: number };
  /** 配り方の区分：'free' だれでも遊べる（無ければこれ）／'plus' 追加マップ（有料で配る予定の街。課金の仕組みは自前のサーバーに移してから） */
  tier?: 'free' | 'plus';
  /** 'builtin' 架空の街／'bundled' データ同梱／'collect' データを集めて取り込む */
  kind: 'builtin' | 'bundled' | 'collect';
  /** 最初にカメラを向ける駅（名前の前方一致） */
  start?: string;
  /** 地区の代表点（指定がなければ地名から自動で 4 つ作る） */
  districts?: { name: string; lon: number; lat: number }[];
  /** 取り込みのヒント：OSM に名前がない浄水場などの位置 */
  hints?: { water?: { name: string; lon: number; lat: number }; wasteName?: RegExp };
  /** 地図ごとの係数（車の分担率など。ゲーム用の仮定） */
  tune?: Record<string, number>;
}

export const MAPS: MapEntry[] = [
  {
    id: 'sumino', name: '住野市', area: '架空の街', role: '市長', cityName: '住野市', kind: 'builtin',
    blurb: '人口およそ 5,000 人。駅前の開発で子育て世帯が増える郊外の街。田畑に道路を引いて、一から街を広げられます。',
  },
  {
    id: 'hodogaya', name: '保土ケ谷', area: '神奈川県 横浜市 保土ケ谷区', role: '横浜市長', cityName: '横浜市（保土ケ谷区）', kind: 'bundled',
    blurb: '西谷・上星川・星川・天王町・保土ケ谷駅。坂と谷戸の住宅地、約 12 万人。ゲームで扱う課題は保育の不足・朝の混雑・浄水場の老朽（いずれもゲームの推計）。',
    bbox: { s: 35.4400, w: 139.5560, n: 35.4860, e: 139.6080 }, start: '星川',
    districts: [
      { name: '西谷・上星川', lon: 139.570, lat: 35.472 },
      { name: '和田町・星川', lon: 139.590, lat: 35.462 },
      { name: '天王町・保土ケ谷', lon: 139.598, lat: 35.448 },
      { name: '羽沢・常盤台', lon: 139.588, lat: 35.479 },
    ],
    hints: { water: { name: '西谷浄水場', lon: 139.5724, lat: 35.4721 }, wasteName: /保土ヶ谷工場|保土ケ谷工場/ },
  },
  // v81：主要都市・人気の街（各 約 5km 四方。データは 2026-11 に OpenStreetMap と国土地理院の標高から収集）
  {
    id: 'shibuya', tier: 'plus', name: '渋谷', area: '東京都 渋谷区', role: '渋谷区長', cityName: '渋谷区（渋谷）', kind: 'collect',
    blurb: '谷底のターミナルと、坂の上の住宅地。駅の再開発と混雑、代々木公園、表参道・恵比寿・代官山まで。',
    bbox: { s: 35.6362, w: 139.6740, n: 35.6812, e: 139.7293 }, start: '渋谷',
    tune: { carShare: 0.1, railCarShare: 0.06 },
  },
  {
    id: 'yokohama', tier: 'plus', name: '横浜', area: '神奈川県 横浜市 西区・中区', role: '横浜市長', cityName: '横浜市（みなとみらい・関内）', kind: 'collect',
    blurb: '横浜駅からみなとみらい・関内へ。港と埋立地の業務地区、観光客、丘の上の住宅地。',
    bbox: { s: 35.4278, w: 139.6033, n: 35.4728, e: 139.6585 }, start: '桜木町',
    tune: { carShare: 0.15, railCarShare: 0.1 },
  },
  {
    id: 'umeda', tier: 'plus', name: '梅田', area: '大阪府 大阪市 北区', role: '大阪市長', cityName: '大阪市（梅田）', kind: 'collect',
    blurb: '大阪駅・梅田の巨大ターミナルと、川に囲まれた中之島・天満。再開発の続く西日本の中心。',
    bbox: { s: 34.6797, w: 135.4683, n: 34.7247, e: 135.5229 }, start: '大阪',
    tune: { carShare: 0.12, railCarShare: 0.08 },
  },
  {
    id: 'tenjin', tier: 'plus', name: '天神・博多', area: '福岡県 福岡市 中央区・博多区', role: '福岡市長', cityName: '福岡市（天神・博多）', kind: 'collect',
    blurb: '天神と博多駅、あいだの中洲。人口の増え続ける街の再開発と、空港に近い都心。',
    bbox: { s: 33.5681, w: 130.3826, n: 33.6132, e: 130.4365 }, start: '天神',
    tune: { carShare: 0.22, railCarShare: 0.14 },
  },
  {
    id: 'kyoto', tier: 'plus', name: '京都', area: '京都府 京都市 下京区・中京区', role: '京都市長', cityName: '京都市（京都駅・四条）', kind: 'collect',
    blurb: '京都駅から四条河原町・祇園へ。碁盤の目の町家と寺社、鴨川。観光の混雑と景観の両立。',
    bbox: { s: 34.9713, w: 135.7318, n: 35.0164, e: 135.7866 }, start: '京都',
    tune: { carShare: 0.2, railCarShare: 0.12 },
  },
  {
    id: 'kichijoji', tier: 'plus', name: '吉祥寺', area: '東京都 武蔵野市・三鷹市', role: '武蔵野市長', cityName: '武蔵野市（吉祥寺）', kind: 'collect',
    blurb: '井の頭公園と駅前の商店街。住みたい街の常連の、住宅地の保育と駅前の混雑。三鷹・西荻窪まで。',
    bbox: { s: 35.6801, w: 139.5526, n: 35.7252, e: 139.6080 }, start: '吉祥寺',
    tune: { carShare: 0.14, railCarShare: 0.09 },
  },
  {
    id: 'kosugi', tier: 'plus', name: '武蔵小杉', area: '神奈川県 川崎市 中原区', role: '川崎市長', cityName: '川崎市（中原区）', kind: 'collect',
    blurb: '武蔵中原〜武蔵小杉〜元住吉。タワーマンションの急増と、駅の混雑・保育需要。多摩川沿いの平らな街。',
    bbox: { s: 35.5583, w: 139.6244, n: 35.5997, e: 139.6796 }, start: '武蔵小杉',
    tune: { carShare: 0.18, railCarShare: 0.12 },
  },
  {
    id: 'kamata', tier: 'plus', name: '蒲田', area: '東京都 大田区', role: '大田区長', cityName: '大田区（蒲田）', kind: 'collect',
    blurb: 'JR・京急の蒲田駅前の商店街と町工場、住宅が混ざる平地の街。人の多い駅前と幹線道路の混雑。',
    bbox: { s: 35.5395, w: 139.6884, n: 35.5845, e: 139.7436 }, start: '蒲田',
    tune: { carShare: 0.15, railCarShare: 0.1 },
  },
  {
    id: 'ube', tier: 'plus', name: '宇部', area: '山口県 宇部市', role: '宇部市長', cityName: '宇部市', kind: 'collect',
    blurb: '宇部新川駅の周りの中心市街地と、海沿いの工場地帯。車で暮らす地方都市の、人口減少と施設の老朽化。',
    bbox: { s: 33.9365, w: 131.2199, n: 33.9815, e: 131.2741 }, start: '宇部新川',
    tune: { carShare: 0.5, railCarShare: 0.3, shopTrip: 0.05 },
  },
  {
    id: 'jonan', tier: 'plus', name: '城南区', area: '福岡県 福岡市 城南区', role: '福岡市長', cityName: '福岡市（城南区）', kind: 'collect',
    blurb: '七隈線沿いの学生街と、油山のふもとの住宅地。若い世帯の多い街の保育と通勤。',
    bbox: { s: 33.5515, w: 130.3430, n: 33.5965, e: 130.3970 }, start: '七隈',
    tune: { carShare: 0.3, railCarShare: 0.2 },
  },
  {
    id: 'togitsu', tier: 'plus', name: '時津', area: '長崎県 西彼杵郡 時津町・長崎市北部', role: '時津町長', cityName: '時津町・長崎市北部', kind: 'collect',
    blurb: '大村湾の奥の港町と、長崎市北部の坂の住宅地。限られた幹線道路と、斜面に広がる住宅地。',
    bbox: { s: 32.8001, w: 129.8244, n: 32.8451, e: 129.8779 }, start: '時津',
    tune: { carShare: 0.45, railCarShare: 0.3, shopTrip: 0.05 },
  },
];

export const mapEntry = (id: string): MapEntry | undefined => MAPS.find(m => m.id === id);
/** まちづくり版（ID の末尾が -d）も、もとの地図の情報を返す */
export const baseEntry = (id: string): MapEntry | undefined => mapEntry(id.replace(/-d$/, ''));
export const isDeformedId = (id: string) => /-d$/.test(id);
