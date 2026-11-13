// 建物モデル。全てコードで組む（外部アセットなし）。ローカル座標は区画の中心が原点、+z が道路側（正面）。
import { Geo } from './geo';
import type { Kind } from '../sim/types';
import TREES from '../assets/trees.json';
import { growTrees } from './treegen';
import { makeCars, CAR_KINDS, type CarKind } from './cargen';
import { CAR_PART, carColor } from './vehgen';
export { CAR_KINDS, CAR_PART };
import CARS from '../assets/cars.json';

export interface Ctx {
  g: Geo;      // 本体（頂点色）
  wa: Geo;     // 夜に灯る窓
  wb: Geo;     // 夜も暗い窓
  sign: Geo;   // 看板（テクスチャ）
  rnd: () => number;
  old: boolean; // 老朽化した市の施設（外壁がくすむ）
  /** 細かい部品（屋上の設備・雨どい・車のタイヤなど）を付けるか。スマホの軽量表示では付けない */
  fine?: boolean;
  /** 名所の glb（render/landmarks.ts）を別に置くか。置くときは天守などをコードで組まない */
  lm?: { has(k: string): boolean };
}
/** 細部用の決まった乱数（本体の乱数の並びを変えないため、位置から作る） */
const dh = (a: number, b: number, k = 0) => { const v = Math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };

export function rng(seed: number): () => number {
  let a = (seed * 4294967296) >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(c: Ctx, arr: T[]): T => arr[Math.floor(c.rnd() * arr.length) % arr.length];

// ---- 看板アトラス ----
export const SIGNS = ['パン', 'スーパー', '商店', '食堂', 'くすり', '理容', '生花', '保育園', '小学校', '消防署', '住野駅', '交番', '診療所', '水道', '清掃', '公園', '工事中', 'P', '売地', 'バス',
  '中学校', '高校', '図書館', '病院', '体育館', 'ホール', '美術館', '警察署', '福祉', '下水', '発電', 'ガス', '防災', 'ホテル', '工場', '物流', 'オフィス', 'データ', 'スタジアム', 'タワー', 'パーク',
  '空港', '港', 'IC', 'バスのりば', '市役所', '行政センター', '合同庁舎', '裁判所', '大学病院', '急病センター', '大学', 'コンベンション', 'アリーナ', 'モール', 'シネマ', '湯', '水族館', '動物園', 'ゴルフ', 'キャンプ', '道の駅', '農園', '森林公園',
  '海水浴場', '源泉', '花の名所', 'LRT', '工業団地', '研究所', '漁港', 'ワイナリー', 'リサイクル', '野球場', '本社', '5G', '光回線', 'EV', '信号', '自動運転', 'ポート', 'スマートシティ', '核融合', '町工場',
  'コンビニ', 'カフェ', 'ドラッグ', 'IT', 'スタジオ', '食品', '製薬', 'センター', '銀行', '百貨店', '電池', '半導体', '自衛隊', '商事', '設計', '保険', '精密', '金属', '印刷', '電機', 'ソフト', '建設', '不動産', '部品', '塗装', '原子力', '火力', '石炭', '風力', '水力', '地熱', 'バイオマス', 'ロープウェイ', 'ドーム', 'LIVE', 'ジム', '新幹線', '斎場', '葬儀', '霊園', '天文台', '競馬場', '植物園', '歌劇場', '市場', '造船', '刑務所', 'ダム', 'ビール', '製鉄', '防衛', '幼稚園', '美容室', '産院', '周産期', '郵便', 'ヘリ', '多文化', 'こども', 'エコ', '観光案内', '起業支援', 'DX', 'ウェディング', '児童館', 'キッズ', '遊園地', 'プール', 'パチンコ', 'ボート', '競輪', '庭園', 'ロボット', 'カジノ', 'アウトレット', 'スキー', 'eスポーツ', '米軍', '石油', 'ガソリン', '製油所', '史跡', '避難', 'テレビ', '横丁', 'カラオケ', 'BAR', '案内所', '自動車', '重工', '取引所', '宇宙', '旅館', 'クラブ', '商店街', '水素', 'MaaS', 'SL', '水上バス', '遊覧船', '屋形船', 'JA', '酒蔵', '醤油', '製茶', '製材', '冷蔵', '牧場', '鶏卵', '木材市場', '水産加工', '植物工場', 'はちみつ', 'わさび', '塩', '果樹', '化学', '製紙', 'セメント', 'ガラス', 'タイヤ', '繊維', 'アルミ', '窯元', '刃物', '家具', '鋳物', '乳業', '飲料', '医療機器', '航空', 'オークション', '化粧品', 'おもちゃ', 'ディーラー', '整備', '車検', 'ファミレス', '信用金庫', '証券', '法律事務所', '質', '学習塾', '英会話', 'ボウリング', 'ゲーム', 'ネットカフェ', '麻雀', 'バッティング', 'サウナ', 'カプセル', 'HOTEL', 'コワーキング', '洗車', '屋台村', '釣り堀', '民泊', '八百屋', '魚屋', '肉屋', '豆腐', '和菓子', '酒屋', '家電', 'ホームセンター', '書店', 'リユース', '100円', '激安', '倉庫店', 'カー用品', 'レンタカー', 'ランドリー', 'チェーン', 'バーガー', '居酒屋', 'クリーニング', '写真館', 'ペット', 'トリミング', '動物病院', '社宅', '学生寮', 'シェアハウス', 'サ高住', '老人ホーム', 'グループホーム', '仮設住宅', '自立支援', 'International', '特別支援学校', '高専', '専門学校', '短期大学', '職業訓練校', '教習所', '研究機構', '気象台', '観測所', '博物館', '科学館', '文学館', '公民館', '生涯学習センター', '青少年の家', 'プラネタリウム', '学園', '外国人学校', '定時制', '歯科', 'クリニック', 'こころの病院', 'リハビリ病院', '療養病院', 'ホスピス', '透析', '保健所', '献血ルーム', '調剤薬局', 'デイサービス', 'パン工房', '児童相談所', '包括支援', '納骨堂', 'ペット霊園', '県庁', '税務署', 'ハローワーク', '年金事務所', '免許センター', '出入国在留管理局', '検察庁', '家庭裁判所', '警察学校', '機動隊', '海上保安部', '検疫所', '海上自衛隊', '航空自衛隊', '市議会', '清掃事務所', '道路維持事務所', '水防倉庫', 'サービスエリア', 'ETC', 'P&R', 'トラックステーション', '貨物ターミナル', 'バス営業所', 'トロッコ', 'フェリー', 'マリーナ', '閘門', 'ヘリ遊覧', '配送ロボ', '地域冷暖房', '共同溝', '取水堰', '遊水地', '地下放水路', '排水機場', '海底ケーブル', '鍾乳洞', 'サーキット', 'スケート', '武道館', '相撲部屋', '歌舞伎座', '寄席', '劇場', 'JAZZ', '鉄道博物館', '漫画館', 'お化け屋敷', '山車会館', '門前町', '温泉街', '町内会館', '消防団', '地下都市', '宇宙ホテル', '月面管制', 'メタバース'] as const;
const SIGN_STYLE: Record<string, [string, string]> = {
  地下都市: ['#1e1e3a', '#8affe8'], 宇宙ホテル: ['#1e1e3a', '#8affe8'], 月面管制: ['#1e1e3a', '#8affe8'], メタバース: ['#1e1e3a', '#8affe8'],
  町内会館: ['#5a4a3a', '#ffffff'], 消防団: ['#5a4a3a', '#ffffff'],
  鍾乳洞: ['#6b2a2a', '#f6e7c8'], サーキット: ['#6b2a2a', '#f6e7c8'], スケート: ['#6b2a2a', '#f6e7c8'], 武道館: ['#6b2a2a', '#f6e7c8'], 相撲部屋: ['#6b2a2a', '#f6e7c8'], 歌舞伎座: ['#6b2a2a', '#f6e7c8'], 寄席: ['#6b2a2a', '#f6e7c8'], 劇場: ['#6b2a2a', '#f6e7c8'], JAZZ: ['#6b2a2a', '#f6e7c8'], 鉄道博物館: ['#6b2a2a', '#f6e7c8'], 漫画館: ['#6b2a2a', '#f6e7c8'], お化け屋敷: ['#6b2a2a', '#f6e7c8'], 山車会館: ['#6b2a2a', '#f6e7c8'], 門前町: ['#6b2a2a', '#f6e7c8'], 温泉街: ['#6b2a2a', '#f6e7c8'],
  地域冷暖房: ['#2a5aa0', '#ffffff'], 共同溝: ['#2a5aa0', '#ffffff'], 取水堰: ['#2a5aa0', '#ffffff'], 遊水地: ['#2a5aa0', '#ffffff'], 地下放水路: ['#2a5aa0', '#ffffff'], 排水機場: ['#2a5aa0', '#ffffff'], 海底ケーブル: ['#2a5aa0', '#ffffff'],
  サービスエリア: ['#2a6a3a', '#ffffff'], ETC: ['#2a6a3a', '#ffffff'], 'P&R': ['#2a6a3a', '#ffffff'], トラックステーション: ['#2a6a3a', '#ffffff'], 貨物ターミナル: ['#2a6a3a', '#ffffff'], バス営業所: ['#2a6a3a', '#ffffff'], トロッコ: ['#2a6a3a', '#ffffff'], フェリー: ['#2a6a3a', '#ffffff'], マリーナ: ['#2a6a3a', '#ffffff'], 閘門: ['#2a6a3a', '#ffffff'], ヘリ遊覧: ['#2a6a3a', '#ffffff'], 配送ロボ: ['#2a6a3a', '#ffffff'],
  県庁: ['#1f3f6a', '#ffffff'], 税務署: ['#1f3f6a', '#ffffff'], ハローワーク: ['#1f3f6a', '#ffffff'], 年金事務所: ['#1f3f6a', '#ffffff'], 免許センター: ['#1f3f6a', '#ffffff'], 出入国在留管理局: ['#1f3f6a', '#ffffff'], 検察庁: ['#1f3f6a', '#ffffff'], 家庭裁判所: ['#1f3f6a', '#ffffff'], 警察学校: ['#1f3f6a', '#ffffff'], 機動隊: ['#1f3f6a', '#ffffff'], 海上保安部: ['#1f3f6a', '#ffffff'], 検疫所: ['#1f3f6a', '#ffffff'], 海上自衛隊: ['#1f3f6a', '#ffffff'], 航空自衛隊: ['#1f3f6a', '#ffffff'], 市議会: ['#1f3f6a', '#ffffff'], 清掃事務所: ['#1f3f6a', '#ffffff'], 道路維持事務所: ['#1f3f6a', '#ffffff'], 水防倉庫: ['#1f3f6a', '#ffffff'],
  歯科: ['#2aa05a', '#ffffff'], クリニック: ['#2aa05a', '#ffffff'], こころの病院: ['#2aa05a', '#ffffff'], リハビリ病院: ['#2aa05a', '#ffffff'], 療養病院: ['#2aa05a', '#ffffff'], ホスピス: ['#2aa05a', '#ffffff'], 透析: ['#2aa05a', '#ffffff'], 保健所: ['#2aa05a', '#ffffff'], 献血ルーム: ['#2aa05a', '#ffffff'], 調剤薬局: ['#2aa05a', '#ffffff'], デイサービス: ['#2aa05a', '#ffffff'], パン工房: ['#2aa05a', '#ffffff'], 児童相談所: ['#2aa05a', '#ffffff'], 包括支援: ['#2aa05a', '#ffffff'], 納骨堂: ['#2aa05a', '#ffffff'], ペット霊園: ['#2aa05a', '#ffffff'],
  International: ['#2a4a7a', '#ffffff'], 特別支援学校: ['#2a4a7a', '#ffffff'], 高専: ['#2a4a7a', '#ffffff'], 専門学校: ['#2a4a7a', '#ffffff'], 短期大学: ['#2a4a7a', '#ffffff'], 職業訓練校: ['#2a4a7a', '#ffffff'], 教習所: ['#2a4a7a', '#ffffff'], 研究機構: ['#2a4a7a', '#ffffff'], 気象台: ['#2a4a7a', '#ffffff'], 観測所: ['#2a4a7a', '#ffffff'], 博物館: ['#2a4a7a', '#ffffff'], 科学館: ['#2a4a7a', '#ffffff'], 文学館: ['#2a4a7a', '#ffffff'], 公民館: ['#2a4a7a', '#ffffff'], 生涯学習センター: ['#2a4a7a', '#ffffff'], 青少年の家: ['#2a4a7a', '#ffffff'], プラネタリウム: ['#2a4a7a', '#ffffff'], 学園: ['#2a4a7a', '#ffffff'], 外国人学校: ['#2a4a7a', '#ffffff'], 定時制: ['#2a4a7a', '#ffffff'],
  社宅: ['#3a6a8a', '#ffffff'], 学生寮: ['#3a6a8a', '#ffffff'], シェアハウス: ['#3a6a8a', '#ffffff'], サ高住: ['#3a6a8a', '#ffffff'], 老人ホーム: ['#3a6a8a', '#ffffff'], グループホーム: ['#3a6a8a', '#ffffff'], 仮設住宅: ['#3a6a8a', '#ffffff'], 自立支援: ['#3a6a8a', '#ffffff'],
  家電: ['#d8342a', '#ffffff'], ホームセンター: ['#2a5aa0', '#ffffff'], 書店: ['#2a8a4a', '#ffffff'], リユース: ['#f08a1a', '#ffffff'], '100円': ['#6a4a8a', '#ffffff'], 激安: ['#1e1e1e', '#ffffff'], 倉庫店: ['#d8342a', '#ffffff'], カー用品: ['#2a5aa0', '#ffffff'], レンタカー: ['#2a8a4a', '#ffffff'], ランドリー: ['#f08a1a', '#ffffff'], チェーン: ['#6a4a8a', '#ffffff'], バーガー: ['#1e1e1e', '#ffffff'], 居酒屋: ['#d8342a', '#ffffff'], クリーニング: ['#2a5aa0', '#ffffff'], 写真館: ['#2a8a4a', '#ffffff'], ペット: ['#f08a1a', '#ffffff'], トリミング: ['#6a4a8a', '#ffffff'], 動物病院: ['#1e1e1e', '#ffffff'],
  ディーラー: ['#d8342a', '#ffffff'], 整備: ['#2a5aa0', '#ffffff'], 車検: ['#2a8a4a', '#ffffff'], ファミレス: ['#f08a1a', '#ffffff'], 信用金庫: ['#6a4a8a', '#ffffff'], 証券: ['#1e1e1e', '#ffffff'], 法律事務所: ['#d8342a', '#ffffff'], 質: ['#2a5aa0', '#ffffff'], 学習塾: ['#2a8a4a', '#ffffff'], 英会話: ['#f08a1a', '#ffffff'], ボウリング: ['#6a4a8a', '#ffffff'], ゲーム: ['#1e1e1e', '#ffffff'], ネットカフェ: ['#d8342a', '#ffffff'], 麻雀: ['#2a5aa0', '#ffffff'], バッティング: ['#2a8a4a', '#ffffff'], サウナ: ['#f08a1a', '#ffffff'], カプセル: ['#6a4a8a', '#ffffff'], HOTEL: ['#1e1e1e', '#ffffff'], コワーキング: ['#d8342a', '#ffffff'], 洗車: ['#2a5aa0', '#ffffff'], 屋台村: ['#2a8a4a', '#ffffff'], 釣り堀: ['#f08a1a', '#ffffff'], 民泊: ['#6a4a8a', '#ffffff'], 八百屋: ['#1e1e1e', '#ffffff'], 魚屋: ['#d8342a', '#ffffff'], 肉屋: ['#2a5aa0', '#ffffff'], 豆腐: ['#2a8a4a', '#ffffff'], 和菓子: ['#f08a1a', '#ffffff'], 酒屋: ['#6a4a8a', '#ffffff'],
  化学: ['#2a5aa0', '#ffffff'], 製紙: ['#ffffff', '#2a5aa0'], セメント: ['#8a8f96', '#ffffff'], ガラス: ['#3aa0c8', '#ffffff'], タイヤ: ['#1e1e1e', '#f6c23a'], 繊維: ['#9a4a32', '#ffffff'], アルミ: ['#c8ccd2', '#1e1e1e'], 窯元: ['#6b4a32', '#f6e7c8'], 刃物: ['#3a3e44', '#ffffff'], 家具: ['#8a5a2a', '#ffffff'], 鋳物: ['#3a3a3a', '#ff8a3a'], 乳業: ['#2a7ad8', '#ffffff'], 飲料: ['#d8342a', '#ffffff'], 医療機器: ['#2ab0a0', '#ffffff'], 航空: ['#1f3f8a', '#ffffff'], オークション: ['#d8342a', '#ffffff'], 化粧品: ['#d88aa8', '#ffffff'], おもちゃ: ['#f6c23a', '#e84a3a'],
  JA: ['#2a7a3a', '#ffffff'], 酒蔵: ['#2a2a2a', '#f6e7c8'], 醤油: ['#5a2a1a', '#f6e7c8'], 製茶: ['#3f7a36', '#ffffff'], 製材: ['#8a5a2a', '#ffffff'], 冷蔵: ['#1f6fb2', '#ffffff'], 牧場: ['#ffffff', '#3a6a2a'], 鶏卵: ['#f6d23a', '#5a3a1a'], 木材市場: ['#6b4a32', '#ffffff'], 水産加工: ['#1f6fb2', '#ffffff'], 植物工場: ['#ffffff', '#2a8a4a'], はちみつ: ['#f0b030', '#4a2a10'], わさび: ['#3a7a3a', '#ffffff'], 塩: ['#ffffff', '#1f4f8a'], 果樹: ['#d8342a', '#ffffff'],
  水素: ['#2b8ab8', '#ffffff'], MaaS: ['#2bb673', '#ffffff'], SL: ['#1a1a1a', '#e8c87a'], 水上バス: ['#1f6fb2', '#ffffff'], 遊覧船: ['#ffffff', '#1f6fb2'], 屋形船: ['#7a1f2b', '#f6e7c8'],
  横丁: ['#7a1f1f', '#fff1d0'], カラオケ: ['#ff3f8a', '#ffffff'], BAR: ['#14141a', '#4fe0ff'], 案内所: ['#ffd34f', '#c3312b'], 自動車: ['#ffffff', '#c3312b'], 重工: ['#1d3557', '#ffffff'], 取引所: ['#1d3557', '#e8c87a'], 宇宙: ['#0b1a33', '#ffffff'], 旅館: ['#5a3a28', '#fff1d0'], クラブ: ['#2b5ea8', '#ffffff'], 商店街: ['#c3312b', '#ffffff'],
  避難: ['#1f6fb2', '#ffffff'], テレビ: ['#d0392e', '#ffffff'], 米軍: ['#2b3a24', '#ffffff'], 石油: ['#1a1a1a', '#f2c230'], ガソリン: ['#c3312b', '#ffffff'], 製油所: ['#ffffff', '#1d3557'], 史跡: ['#6b4a32', '#f4e7d0'],
  斎場: ['#ffffff', '#3a3a3a'], 葬儀: ['#1a1a1a', '#ffffff'], 霊園: ['#5a5a58', '#ffffff'], 天文台: ['#1d3557', '#ffffff'], 競馬場: ['#2e7d32', '#ffffff'], 植物園: ['#3c7a4c', '#ffffff'], 歌劇場: ['#6b1f3a', '#e8c87a'], 市場: ['#1f5fb0', '#ffffff'], 造船: ['#2b5ea8', '#ffffff'], 刑務所: ['#3b4a5a', '#ffffff'], ダム: ['#1f6fb2', '#ffffff'],
  ビール: ['#c8901a', '#ffffff'], 製鉄: ['#3a3f46', '#ff8a3a'], 防衛: ['#4b5a32', '#ffffff'], 幼稚園: ['#f7d154', '#c3312b'], 美容室: ['#ffffff', '#2a2a2e'], 産院: ['#f8d8e0', '#8a2f4a'], 周産期: ['#e8a0b0', '#ffffff'], 郵便: ['#c3312b', '#ffffff'], ヘリ: ['#c3312b', '#ffffff'], 多文化: ['#2e7d5b', '#ffffff'], こども: ['#f2c230', '#c3312b'], エコ: ['#2e7d5b', '#ffffff'], 観光案内: ['#c3312b', '#ffffff'], 起業支援: ['#1f2f4a', '#7fd0ff'], DX: ['#1f2f4a', '#7fd0ff'], ウェディング: ['#ffffff', '#b08a3a'], 児童館: ['#5ab0e0', '#ffffff'], キッズ: ['#f26a5a', '#ffffff'], 遊園地: ['#c3312b', '#f2c230'], プール: ['#5ab0e0', '#ffffff'], パチンコ: ['#c3312b', '#ffe14a'], ボート: ['#1f4fa8', '#ffffff'], 競輪: ['#2e7d32', '#ffffff'], 庭園: ['#2f5f3a', '#f4efe6'], ロボット: ['#2b4ca8', '#ffffff'], カジノ: ['#14141a', '#e8c87a'], アウトレット: ['#8a5a3a', '#ffffff'], スキー: ['#1f6fb2', '#ffffff'], eスポーツ: ['#14141a', '#00e0ff'],
  原子力: ['#ffffff', '#1d3557'], 火力: ['#ffffff', '#c3312b'], 石炭: ['#2b2b2b', '#ffffff'], 風力: ['#ffffff', '#2e7d5b'], 水力: ['#1f6fb2', '#ffffff'], 地熱: ['#7a2f2a', '#ffffff'], バイオマス: ['#5a4632', '#ffffff'], ロープウェイ: ['#c3312b', '#ffffff'], ドーム: ['#ffffff', '#1d3557'], LIVE: ['#14141a', '#ff4fa8'], ジム: ['#1f1f1f', '#f2c230'], 新幹線: ['#ffffff', '#1f4fa8'],
  コンビニ: ['#2f8a4f', '#ffffff'], カフェ: ['#4a3426', '#f4e7d0'], ドラッグ: ['#f2c230', '#1d3557'], IT: ['#1f2f4a', '#7fd0ff'], スタジオ: ['#6b2fa0', '#ffffff'], 食品: ['#ffffff', '#c3312b'],
  製薬: ['#ffffff', '#1f6fb2'], センター: ['#27405e', '#ffffff'], 銀行: ['#1d3557', '#e8c87a'], 百貨店: ['#7a1f2b', '#f4e2b8'], 電池: ['#2e7d32', '#ffffff'], 半導体: ['#14202e', '#9fe0ff'], 自衛隊: ['#4b5a32', '#ffffff'],
  商事: ['#ffffff', '#27405e'], 設計: ['#f4f1e8', '#2b2b2b'], 保険: ['#1f5fb0', '#ffffff'], 精密: ['#ffffff', '#2b5ea8'], 金属: ['#5a6066', '#ffffff'], 印刷: ['#ffffff', '#8a2f2a'],
  電機: ['#1f5fb0', '#ffffff'], ソフト: ['#2b2b2b', '#7fffb0'], 建設: ['#f2c230', '#1a1a1a'], 不動産: ['#ffffff', '#2e7d5b'], 部品: ['#ffffff', '#5a6066'], 塗装: ['#d9622b', '#ffffff'],
  パン: ['#6b4226', '#f6e7c8'], スーパー: ['#c3312b', '#ffffff'], 商店: ['#27405e', '#ffffff'], 食堂: ['#1f3b57', '#f4efe6'], くすり: ['#2e7d5b', '#ffffff'],
  理容: ['#ffffff', '#2b4c8c'], 生花: ['#f3d9e2', '#7a2f4a'], 保育園: ['#f7d154', '#5a3b1c'], 小学校: ['#f4f1e8', '#222222'], 消防署: ['#b3261e', '#ffffff'],
  住野駅: ['#1d3557', '#ffffff'], 交番: ['#f4f4f0', '#1d3557'], 診療所: ['#ffffff', '#2e7d5b'], 水道: ['#1f6fb2', '#ffffff'], 清掃: ['#2f6b4f', '#ffffff'],
  公園: ['#3c7a4c', '#ffffff'], 工事中: ['#f2c230', '#1a1a1a'], P: ['#1f5fb0', '#ffffff'], 売地: ['#ffffff', '#c3312b'], バス: ['#2f6b4f', '#ffffff'],
  中学校: ['#f4f1e8', '#222222'], 高校: ['#f4f1e8', '#1d3557'], 図書館: ['#3b5b7a', '#ffffff'], 病院: ['#ffffff', '#c3312b'], 体育館: ['#2f6b4f', '#ffffff'], ホール: ['#4a3a6b', '#ffffff'], 美術館: ['#1a1a1a', '#f4efe6'],
  警察署: ['#1d3557', '#ffffff'], 福祉: ['#f3d9b2', '#6b3f1d'], 下水: ['#2b6a8c', '#ffffff'], 発電: ['#f2c230', '#1a1a1a'], ガス: ['#1f5fb0', '#ffffff'], 防災: ['#e06a1f', '#ffffff'], ホテル: ['#2a2a2e', '#e8c87a'],
  工場: ['#5a6066', '#ffffff'], 物流: ['#2b5ea8', '#ffffff'], オフィス: ['#ffffff', '#27405e'], データ: ['#14202e', '#7fd0ff'], スタジアム: ['#1f6b3a', '#ffffff'], タワー: ['#c3312b', '#ffffff'], パーク: ['#e86a7a', '#ffffff'],
  空港: ['#1d3557', '#ffffff'], 港: ['#1f5fb0', '#ffffff'], IC: ['#2e7d32', '#ffffff'], バスのりば: ['#2f6b4f', '#ffffff'], 市役所: ['#f4f1e8', '#1d3557'], 行政センター: ['#f4f1e8', '#1d3557'], 合同庁舎: ['#3b4a5a', '#ffffff'], 裁判所: ['#3b2f2a', '#f4efe6'],
  大学病院: ['#ffffff', '#c3312b'], 急病センター: ['#c3312b', '#ffffff'], 大学: ['#4a2a6b', '#ffffff'], コンベンション: ['#14202e', '#e8c87a'], アリーナ: ['#2b5ea8', '#ffffff'], モール: ['#e86a2a', '#ffffff'], シネマ: ['#1a1a1a', '#f2c94c'],
  湯: ['#7a2f2a', '#ffffff'], 水族館: ['#1f6fb2', '#ffffff'], 動物園: ['#3c7a4c', '#f2e4b8'], ゴルフ: ['#2f6b3a', '#ffffff'], キャンプ: ['#6b4a32', '#ffffff'], 道の駅: ['#1f5fb0', '#ffffff'], 農園: ['#6b8a2a', '#ffffff'], 森林公園: ['#2f5f3a', '#ffffff'],
  海水浴場: ['#1f8fc8', '#ffffff'], 源泉: ['#7a2f2a', '#ffffff'], 花の名所: ['#f3b9c8', '#7a2f4a'], LRT: ['#c3312b', '#ffffff'], 工業団地: ['#5a6066', '#ffffff'], 研究所: ['#ffffff', '#1d3557'], 漁港: ['#1f5fb0', '#ffffff'], ワイナリー: ['#6b1f3a', '#f4efe6'], リサイクル: ['#2e7d32', '#ffffff'], 野球場: ['#1f6b3a', '#ffffff'], 本社: ['#14202e', '#e8c87a'], '5G': ['#5a2a8a', '#ffffff'], 光回線: ['#1f8fc8', '#ffffff'], EV: ['#2e7d32', '#ffffff'], 信号: ['#2a2a2e', '#7fd0ff'], 自動運転: ['#1f6fb2', '#ffffff'], ポート: ['#5a2a8a', '#f2c94c'], スマートシティ: ['#0f3a5a', '#7fd0ff'], 核融合: ['#2a1a4a', '#c8a8ff'], 町工場: ['#5a6066', '#ffffff'],
};
/** 店・病院の看板は「種類の名前」ではなく、実在しそうな屋号とマークで描く（v65）。[屋号, 添え書き, マーク, 地の色, 文字の色, 差し色] */
type Mark = 'cross' | 'gcross' | 'leaf' | 'flower' | 'cup' | 'pole' | 'book' | 'lantern' | 'pill' | 'maru' | 'tooth' | 'paw' | 'wave' | 'bread' | 'fish' | 'star' | 'yen' | 'bubble' | 'none';
type Art = [string, string, Mark, string, string, string, string?];
const SIGN_ART: Record<string, Art> = {
  病院: ['住野中央病院', 'SUMINO CENTRAL HOSPITAL', 'gcross', '#ffffff', '#1f4f8a', '#2aa05a'],
  大学病院: ['住野医科大学病院', 'UNIVERSITY HOSPITAL', 'gcross', '#ffffff', '#1d3557', '#2a7ac8'],
  診療所: ['あおば内科', '内科・小児科 クリニック', 'gcross', '#ffffff', '#2e6b4b', '#2aa05a'],
  クリニック: ['さくら通り医院', '内科・皮膚科', 'gcross', '#ffffff', '#7a2f4a', '#e07a9a'],
  歯科: ['ひまわり歯科', 'DENTAL CLINIC', 'tooth', '#ffffff', '#2a6aa0', '#f2c230'],
  急病センター: ['休日急病診療所', '住野市 24h 救急外来', 'cross', '#c3312b', '#ffffff', '#ffffff'],
  動物病院: ['もみじ動物病院', 'ANIMAL HOSPITAL', 'paw', '#ffffff', '#6b4226', '#e0802a'],
  調剤薬局: ['すみれ調剤薬局', '処方せん受付', 'pill', '#ffffff', '#2e7d5b', '#2aa05a'],
  くすり: ['くすりのミドリヤ', '薬・化粧品・日用品', 'pill', '#2e7d5b', '#ffffff', '#f2d24a'],
  ドラッグ: ['ドラッグ ハピネス', 'DRUG & COSME', 'pill', '#f2c230', '#1d3557', '#d8342a'],
  八百屋: ['八百辰', '青果・くだもの', 'leaf', '#f4efe0', '#2e5a2a', '#e0802a'],
  生花: ['花音', 'flower shop KANON', 'flower', '#f8e4ea', '#7a2f4a', '#e07a9a'],
  商店: ['丸十商店', 'たばこ・酒・食品', 'maru', '#27405e', '#ffffff', '#f2d24a'],
  食堂: ['お食事処 ふじ', '定食・丼・めん類', 'lantern', '#1f3b57', '#f4efe6', '#d8402e'],
  居酒屋: ['酒処 とり吉', '焼鳥・おでん', 'lantern', '#2a1e18', '#f6e7c8', '#d8402e'],
  和菓子: ['御菓子司 松風庵', '創業 明治二十年', 'maru', '#4a2a3a', '#f6e7c8', '#c89a4a'],
  理容: ['BARBER 山田', 'ヘアカット 理容', 'pole', '#ffffff', '#1d2a4a', '#d8322a'],
  美容室: ['hair salon Lien', 'HAIR & MAKE', 'star', '#f6f3ee', '#2a2a2e', '#c89a7a'],
  カフェ: ['Café こもれび', 'COFFEE & BAKE', 'cup', '#3a2a20', '#f4e7d0', '#c89a4a'],
  書店: ['住野ブックス', 'BOOKS & STATIONERY', 'book', '#2a6a4a', '#ffffff', '#f2d24a'],
  クリーニング: ['ホワイト急便', 'クリーニング 即日仕上げ', 'bubble', '#2a6fb0', '#ffffff', '#9fd8f6'],
  パン: ['ベーカリー こむぎ', 'BAKERY since 1979', 'bread', '#6b4226', '#f6e7c8', '#e8b04a'],
  スーパー: ['スーパー まるとく', '毎日がお買い得', 'maru', '#c3312b', '#ffffff', '#f2d24a'],
  コンビニ: ['ファミマルシェ', 'OPEN 24 HOURS', 'star', '#ffffff', '#2f8a4f', '#2a6fb0'],
  魚屋: ['魚辰', '鮮魚・刺身', 'fish', '#1f4f8a', '#ffffff', '#9fd8f6'],
  肉屋: ['精肉の肉の大和', 'コロッケ揚げたて', 'maru', '#8a2a1f', '#ffffff', '#f2d24a'],
  豆腐: ['豆腐の三河屋', '手づくり とうふ', 'maru', '#f4efe0', '#2a2a2a', '#4a7a9a'],
  酒屋: ['酒のいしかわ', '地酒・ワイン', 'maru', '#2a2a2a', '#f6e7c8', '#c89a4a'],
  ランドリー: ['ふわり', 'COIN LAUNDRY 24h', 'bubble', '#ffffff', '#2a6fb0', '#9fd8f6'],
  銀行: ['すみの銀行', 'SUMINO BANK', 'yen', '#1d3557', '#ffffff', '#e8c87a'],
  信用金庫: ['すみの信用金庫', '地域とともに', 'yen', '#6a4a8a', '#ffffff', '#f2d24a'],
  ファミレス: ['ダイナーひなた', 'FAMILY RESTAURANT', 'star', '#f08a1a', '#ffffff', '#ffffff'],
  バーガー: ['SUMI BURGER', 'BURGER & FRIES', 'star', '#d8342a', '#ffffff', '#f2c230'],
  学習塾: ['個別指導 明光ゼミ', '小・中・高', 'book', '#1f3f8a', '#ffffff', '#f2c230'],
};
/** 看板のマーク（cx, cy を中心、r は半径） */
function drawMark(x: CanvasRenderingContext2D, m: Mark, cx: number, cy: number, r: number, fg: string, ac: string): void {
  x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
  const circ = (col: string, rr = r) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill(); };
  switch (m) {
    case 'cross': case 'gcross': { const t = r * 0.36; if (m === 'gcross') circ('#ffffff', r); x.fillStyle = ac; x.fillRect(cx - t, cy - r * 0.86, t * 2, r * 1.72); x.fillRect(cx - r * 0.86, cy - t, r * 1.72, t * 2); break; }
    case 'leaf': circ(ac); x.fillStyle = '#3f8a3a'; x.beginPath(); x.ellipse(cx + r * 0.1, cy - r * 0.55, r * 0.22, r * 0.5, 0.5, 0, Math.PI * 2); x.fill(); break; // みかん
    case 'flower': x.fillStyle = ac; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; x.beginPath(); x.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.42, 0, Math.PI * 2); x.fill(); } x.fillStyle = '#f2d24a'; x.beginPath(); x.arc(cx, cy, r * 0.3, 0, Math.PI * 2); x.fill(); break;
    case 'cup': x.fillStyle = ac; x.fillRect(cx - r * 0.6, cy - r * 0.2, r * 1.0, r * 0.85); x.lineWidth = r * 0.16; x.strokeStyle = ac; x.beginPath(); x.arc(cx + r * 0.45, cy + r * 0.2, r * 0.25, -1.4, 1.4); x.stroke();
      x.strokeStyle = fg; x.lineWidth = r * 0.1; for (const dx of [-0.3, 0.05]) { x.beginPath(); x.moveTo(cx + dx * r, cy - r * 0.35); x.quadraticCurveTo(cx + (dx + 0.15) * r, cy - r * 0.6, cx + dx * r, cy - r * 0.85); x.stroke(); } break;
    case 'pole': { const w = r * 0.55; x.save(); x.beginPath(); x.rect(cx - w / 2, cy - r, w, r * 2); x.clip(); x.fillStyle = '#ffffff'; x.fillRect(cx - w / 2, cy - r, w, r * 2);
      for (let k = -4; k < 6; k++) { x.fillStyle = k % 2 ? ac : '#2a4fa0'; x.beginPath(); x.moveTo(cx - w / 2, cy - r + k * r * 0.5); x.lineTo(cx + w / 2, cy - r + k * r * 0.5 - r * 0.4); x.lineTo(cx + w / 2, cy - r + k * r * 0.5 - r * 0.2); x.lineTo(cx - w / 2, cy - r + k * r * 0.5 + r * 0.2); x.fill(); }
      x.restore(); x.strokeStyle = fg; x.lineWidth = 3; x.strokeRect(cx - w / 2, cy - r, w, r * 2); break; }
    case 'book': x.fillStyle = ac; x.beginPath(); x.moveTo(cx, cy - r * 0.45); x.lineTo(cx - r * 0.9, cy - r * 0.65); x.lineTo(cx - r * 0.9, cy + r * 0.55); x.lineTo(cx, cy + r * 0.75); x.lineTo(cx + r * 0.9, cy + r * 0.55); x.lineTo(cx + r * 0.9, cy - r * 0.65); x.closePath(); x.fill(); x.strokeStyle = fg; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, cy - r * 0.45); x.lineTo(cx, cy + r * 0.75); x.stroke(); break;
    case 'lantern': x.fillStyle = ac; x.beginPath(); x.ellipse(cx, cy, r * 0.62, r * 0.85, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#1a1a1a'; x.fillRect(cx - r * 0.35, cy - r * 0.98, r * 0.7, r * 0.18); x.fillRect(cx - r * 0.35, cy + r * 0.8, r * 0.7, r * 0.18);
      x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2; for (const k of [-0.4, 0, 0.4]) { x.beginPath(); x.ellipse(cx, cy + k * r, r * 0.6 * Math.sqrt(1 - k * k * 0.8), r * 0.06, 0, 0, Math.PI * 2); x.stroke(); } break;
    case 'pill': x.save(); x.translate(cx, cy); x.rotate(-0.7); x.fillStyle = ac; x.beginPath(); x.arc(-r * 0.35, 0, r * 0.38, Math.PI / 2, Math.PI * 1.5); x.lineTo(0, -r * 0.38); x.lineTo(0, r * 0.38); x.fill(); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(r * 0.35, 0, r * 0.38, -Math.PI / 2, Math.PI / 2); x.lineTo(0, r * 0.38); x.lineTo(0, -r * 0.38); x.fill(); x.strokeStyle = fg; x.lineWidth = 2; x.beginPath(); x.arc(-r * 0.35, 0, r * 0.38, Math.PI / 2, Math.PI * 1.5); x.lineTo(r * 0.35, -r * 0.38); x.arc(r * 0.35, 0, r * 0.38, -Math.PI / 2, Math.PI / 2); x.closePath(); x.stroke(); x.restore(); break;
    case 'maru': x.strokeStyle = ac; x.lineWidth = r * 0.16; x.beginPath(); x.arc(cx, cy, r * 0.82, 0, Math.PI * 2); x.stroke(); break; // 屋号の丸（中に一文字）
    case 'tooth': x.fillStyle = '#ffffff'; x.strokeStyle = fg; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - r * 0.7, cy - r * 0.4); x.quadraticCurveTo(cx - r * 0.7, cy - r * 0.9, cx - r * 0.25, cy - r * 0.8); x.quadraticCurveTo(cx, cy - r * 0.65, cx + r * 0.25, cy - r * 0.8); x.quadraticCurveTo(cx + r * 0.7, cy - r * 0.9, cx + r * 0.7, cy - r * 0.4);
      x.quadraticCurveTo(cx + r * 0.6, cy + r * 0.2, cx + r * 0.45, cy + r * 0.85); x.quadraticCurveTo(cx + r * 0.2, cy + r * 0.9, cx + r * 0.1, cy + r * 0.2); x.quadraticCurveTo(cx, cy, cx - r * 0.1, cy + r * 0.2); x.quadraticCurveTo(cx - r * 0.2, cy + r * 0.9, cx - r * 0.45, cy + r * 0.85); x.quadraticCurveTo(cx - r * 0.6, cy + r * 0.2, cx - r * 0.7, cy - r * 0.4); x.fill(); x.stroke(); break;
    case 'paw': x.fillStyle = ac; x.beginPath(); x.ellipse(cx, cy + r * 0.3, r * 0.45, r * 0.38, 0, 0, Math.PI * 2); x.fill(); for (const [dx, dy] of [[-0.55, -0.15], [-0.2, -0.55], [0.2, -0.55], [0.55, -0.15]]) { x.beginPath(); x.arc(cx + dx * r, cy + dy * r, r * 0.2, 0, Math.PI * 2); x.fill(); } break;
    case 'bread': x.fillStyle = ac; x.beginPath(); x.ellipse(cx, cy, r * 0.85, r * 0.55, -0.2, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgba(80,40,20,0.6)'; x.lineWidth = 3; for (const k of [-0.4, 0, 0.4]) { x.beginPath(); x.moveTo(cx + k * r - r * 0.15, cy - r * 0.3); x.lineTo(cx + k * r + r * 0.15, cy + r * 0.3); x.stroke(); } break;
    case 'fish': x.fillStyle = ac; x.beginPath(); x.ellipse(cx - r * 0.1, cy, r * 0.65, r * 0.38, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(cx + r * 0.45, cy); x.lineTo(cx + r * 0.95, cy - r * 0.4); x.lineTo(cx + r * 0.95, cy + r * 0.4); x.fill(); x.fillStyle = fg; x.beginPath(); x.arc(cx - r * 0.45, cy - r * 0.08, r * 0.08, 0, Math.PI * 2); x.fill(); break;
    case 'star': x.fillStyle = ac; x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.42 : r * 0.95; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill(); break;
    case 'yen': circ(ac, r * 0.9); x.fillStyle = fg === '#ffffff' ? '#1d3557' : '#ffffff'; x.font = `900 ${Math.round(r * 1.2)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('S', cx, cy + r * 0.05); break;
    case 'bubble': x.strokeStyle = ac; x.lineWidth = 3; for (const [dx, dy, rr] of [[-0.3, 0.2, 0.5], [0.4, -0.2, 0.38], [0.15, 0.6, 0.25], [-0.45, -0.55, 0.22]]) { x.beginPath(); x.arc(cx + dx * r, cy + dy * r, rr * r, 0, Math.PI * 2); x.stroke(); } break;
    default: break;
  }
  x.restore();
}
/** 屋号つきの看板を 1 枚描く */
function drawArtSign(x: CanvasRenderingContext2D, cx: number, cy: number, cw: number, ch: number, a: Art): void {
  const [name, sub, mark, bg, fg, ac, ch1] = a, F = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
  x.fillStyle = bg; x.fillRect(cx, cy, cw, ch);
  x.fillStyle = ac; x.fillRect(cx, cy + ch - 10, cw, 10);                                   // 下の差し色の帯
  const mr = ch * (name.length > 8 ? 0.22 : 0.3), mx = cx + 12 + mr, my = cy + ch * 0.45;
  drawMark(x, mark, mx, my, mr, fg, ac);
  if (mark === 'maru') { x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 ${Math.round(mr * 1.05)}px ${F}`; x.fillText(ch1 ?? name.replace(/^(お食事処|御菓子司|酒処|精肉の|豆腐の|酒の|スーパー)\s*/, '').slice(0, 1), mx, my + 2); }
  const tx = cx + 22 + mr * 2, tw = cx + cw - 10 - tx;
  x.fillStyle = fg; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  let size = 50; x.font = `800 ${size}px ${F}`; while (size > 18 && x.measureText(name).width > tw) { size -= 2; x.font = `800 ${size}px ${F}`; }
  x.fillText(name, tx, cy + ch * 0.55, tw);
  x.globalAlpha = 0.85; let ss = 19; x.font = `600 ${ss}px ${F}`; while (ss > 11 && x.measureText(sub).width > tw) { ss -= 1; x.font = `600 ${ss}px ${F}`; }
  x.fillText(sub, tx, cy + ch * 0.55 + ss + 8, tw); x.globalAlpha = 1;
}

// 公共施設は正式名っぽい表記（市章＝丸に「住」）
const CITY = (name: string, sub: string, bg = '#ffffff', fg = '#1d2a3a', ac = '#2a5aa0'): Art => [name, sub, 'maru', bg, fg, ac, '住'];
Object.assign(SIGN_ART, {
  保育園: ['住野市立 すみれ保育園', 'SUMIRE NURSERY', 'flower', '#fff6d8', '#5a3b1c', '#f2a63a'],
  幼稚園: ['住野ひかり幼稚園', 'HIKARI KINDERGARTEN', 'star', '#fff6d8', '#5a3b1c', '#f2c230'],
  小学校: CITY('住野市立第一小学校', 'SUMINO DAIICHI ELEMENTARY SCHOOL'),
  中学校: CITY('住野市立住野中学校', 'SUMINO JUNIOR HIGH SCHOOL'),
  高校: CITY('県立住野高等学校', 'SUMINO HIGH SCHOOL', '#ffffff', '#1d2a3a', '#2a4a7a'),
  消防署: CITY('住野市消防本部 中央消防署', 'SUMINO FIRE DEPARTMENT', '#b3261e', '#ffffff', '#ffffff'),
  交番: CITY('住野駅前交番', 'KOBAN · POLICE BOX', '#f4f4f0', '#1d3557', '#c3312b'),
  警察署: CITY('県警 住野警察署', 'SUMINO POLICE STATION', '#ffffff', '#1d3557', '#1d3557'),
  市役所: CITY('住野市役所', 'SUMINO CITY HALL', '#ffffff', '#1d2a3a', '#2a5aa0'),
  図書館: CITY('住野市立中央図書館', 'SUMINO CITY LIBRARY', '#3b5b7a', '#ffffff', '#e8c87a'),
  体育館: CITY('住野市総合体育館', 'SUMINO CITY GYMNASIUM', '#ffffff', '#1f4f3a', '#2f6b4f'),
  公民館: CITY('住野市中央公民館', 'COMMUNITY CENTER'),
  保健所: CITY('住野保健所', 'PUBLIC HEALTH CENTER', '#ffffff', '#1f4f3a', '#2aa05a'),
  郵便: ['住野郵便局', 'POST OFFICE', 'maru', '#ffffff', '#c3312b', '#c3312b', '〒'],
  水道: CITY('住野市上下水道局', 'WATERWORKS BUREAU', '#1f6fb2', '#ffffff', '#9fd8f6'),
  清掃: CITY('住野市クリーンセンター', 'CLEAN CENTER', '#2f6b4f', '#ffffff', '#9fd86a'),
  市議会: CITY('住野市議会', 'CITY COUNCIL'),
  美術館: CITY('住野市立美術館', 'SUMINO CITY MUSEUM OF ART', '#f6f3ee', '#1a1a1a', '#1a1a1a'),
  博物館: CITY('住野市立郷土博物館', 'SUMINO CITY MUSEUM', '#f6f3ee', '#3a2a1a', '#8a5a2a'),
});
/** 同じ種類の店でも場所ごとに違う屋号（基本の 1 つ＋ここの候補から、建物の位置で選ぶ） */
const SIGN_ALT: Record<string, Art[]> = {
  病院: [['住野総合病院', 'SUMINO GENERAL HOSPITAL', 'gcross', '#ffffff', '#2a3a5a', '#2a7ac8'], ['南住野記念病院', '内科・外科・整形外科', 'gcross', '#ffffff', '#3a2a5a', '#7a5ac8']],
  診療所: [['たなか医院', '内科・胃腸科', 'gcross', '#ffffff', '#2a4a3a', '#2aa05a'], ['すみの台ファミリークリニック', '小児科・内科', 'gcross', '#fff6e8', '#5a3b1c', '#f2a63a']],
  クリニック: [['駅前メディカルクリニック', '内科・耳鼻科', 'gcross', '#ffffff', '#1d3557', '#2a7ac8']],
  歯科: [['すずき歯科医院', '一般歯科・小児歯科', 'tooth', '#ffffff', '#2a4a6a', '#9fd8f6'], ['スマイル デンタル', 'SMILE DENTAL', 'tooth', '#e8f6f4', '#1f5a5a', '#2ab0a0']],
  八百屋: [['青果の八百松', '野菜・果物・漬物', 'leaf', '#2e5a2a', '#ffffff', '#f2a63a'], ['やおや みのり', '朝どれ野菜', 'leaf', '#fff6d8', '#5a3b1c', '#6aa352']],
  商店: [['山本商店', '米・たばこ・日用品', 'maru', '#5a2a1a', '#f6e7c8', '#f2d24a', '山'], ['よろず屋 かね吉', '食品・雑貨', 'maru', '#1f3b2a', '#ffffff', '#f2d24a', '吉']],
  食堂: [['大衆食堂 まんぷく', 'ラーメン・定食', 'lantern', '#c3312b', '#ffffff', '#f2d24a'], ['そば処 更科庵', '手打ちそば・うどん', 'lantern', '#2a2a2a', '#f6e7c8', '#c89a4a']],
  居酒屋: [['炉端 漁火', '海鮮・炉端焼き', 'lantern', '#1f2a3a', '#f6e7c8', '#d8402e'], ['大衆酒場 よっちゃん', 'もつ煮・串カツ', 'lantern', '#7a1f1f', '#fff1d0', '#f2d24a']],
  和菓子: [['菓匠 千鳥屋', '大福・どら焼き', 'maru', '#f4efe0', '#3a2a1a', '#8a2a4a', '千']],
  理容: [['ヘアーサロン タナベ', 'カット・顔そり', 'pole', '#1d2a4a', '#ffffff', '#d8322a'], ['理容 ニューヨーク', 'BARBER SHOP', 'pole', '#f4efe0', '#2a2a2a', '#d8322a']],
  美容室: [['ATELIER mint', 'HAIR SALON', 'star', '#e8f6ee', '#1f4a3a', '#6ac89a']],
  カフェ: [['喫茶 ロマン', '珈琲・ナポリタン', 'cup', '#5a2a1a', '#f6e7c8', '#d8a03a'], ['BLUE LEAF COFFEE', 'ROASTERY & CAFÉ', 'cup', '#ffffff', '#1d3557', '#2a7ac8']],
  書店: [['文林堂書店', '書籍・雑誌・文具', 'book', '#f4efe0', '#3a2a1a', '#8a2a2a'], ['ブックス すみか', 'BOOKS & CAFE', 'book', '#1d3557', '#ffffff', '#f2c230']],
  くすり: [['ヤマト薬局', '漢方・調剤', 'pill', '#ffffff', '#1d3557', '#d8342a']],
  生花: [['花のいろは', '生花・鉢物・ギフト', 'flower', '#ffffff', '#3a5a2a', '#f29a4a']],
  クリーニング: [['スワン クリーニング', 'ワイシャツ 150円', 'bubble', '#ffffff', '#2a6fb0', '#2a6fb0']],
  パン: [['パン工房 ルブラン', 'BOULANGERIE LE BLANC', 'bread', '#f4efe0', '#3a2a1a', '#c89a4a']],
  スーパー: [['フレッシュ ヤマナカ', 'FRESH MARKET', 'leaf', '#2a7a3a', '#ffffff', '#f2a63a']],
  コンビニ: [['サンマート', 'SUN MART 24h', 'star', '#ffffff', '#d8342a', '#f2a63a']],
  魚屋: [['鮮魚 丸八', '活魚・刺身・干物', 'fish', '#ffffff', '#1f4f8a', '#2a7ac8']],
  酒屋: [['酒舗 さかい', '日本酒・焼酎', 'maru', '#1f3b57', '#f6e7c8', '#c89a4a', '酒']],
};
/** 袖看板（縦長、店の角から道へ突き出す）：[文字, 地の色, 文字の色] 文字は縦書き */
const VSIGN: Record<string, [string, string, string]> = {
  食堂: ['定食', '#f6f0e0', '#1f3b57'], 居酒屋: ['やきとり', '#d8402e', '#ffffff'], 和菓子: ['甘味処', '#4a2a3a', '#f6e7c8'], カフェ: ['珈琲', '#3a2a20', '#f4e7d0'],
  理容: ['理容', '#ffffff', '#1d2a4a'], くすり: ['くすり', '#2e7d5b', '#ffffff'], 生花: ['生花', '#f8e4ea', '#7a2f4a'], 書店: ['本', '#2a6a4a', '#ffffff'],
  八百屋: ['青果', '#f4efe0', '#2e5a2a'], 商店: ['たばこ', '#c3312b', '#ffffff'], クリーニング: ['クリーニング', '#2a6fb0', '#ffffff'],
};
const SIGN_KEYS: string[] = [...SIGNS, ...Object.entries(SIGN_ALT).flatMap(([k, a]) => a.map((_, i) => `${k}#${i + 1}`)), ...Object.keys(VSIGN).map(k => `|${k}`), '__lantern'];
/** 縦書きの袖看板を 1 枚描く。セルは横長なので、文字を 90° 回して並べる（貼るときに戻す） */
function drawVSign(x: CanvasRenderingContext2D, cx: number, cy: number, cw: number, ch: number, v: [string, string, string]): void {
  const [t, bg, fg] = v, F = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
  x.fillStyle = bg; x.fillRect(cx, cy, cw, ch); x.strokeStyle = fg; x.globalAlpha = 0.5; x.lineWidth = 5; x.strokeRect(cx + 7, cy + 7, cw - 14, ch - 14); x.globalAlpha = 1;
  const n = [...t].length, step = Math.min(ch * 0.82, (cw - 24) / n), size = Math.min(ch * 0.72, step * 0.92);
  x.fillStyle = fg; x.font = `900 ${Math.round(size)}px ${F}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  [...t].forEach((chr, i) => { x.save(); x.translate(cx + cw / 2 + (i - (n - 1) / 2) * step, cy + ch / 2); x.rotate(-Math.PI / 2); x.fillText(chr, 0, 2); x.restore(); });
}
/** ちょうちんの面（赤い和紙、横の骨、上下の黒い枠） */
function drawLantern(x: CanvasRenderingContext2D, cx: number, cy: number, cw: number, ch: number): void {
  const gr = x.createLinearGradient(cx, 0, cx + cw, 0); gr.addColorStop(0, '#a8261c'); gr.addColorStop(0.5, '#f0583e'); gr.addColorStop(1, '#a8261c');
  x.fillStyle = gr; x.fillRect(cx, cy, cw, ch); x.fillStyle = '#1a1a1a'; x.fillRect(cx, cy, cw, ch * 0.12); x.fillRect(cx, cy + ch * 0.88, cw, ch * 0.12);
  x.strokeStyle = 'rgba(80,10,5,0.45)'; x.lineWidth = 3; for (let k = 1; k < 7; k++) { const y = cy + ch * (0.12 + 0.76 * k / 7); x.beginPath(); x.moveTo(cx, y); x.lineTo(cx + cw, y); x.stroke(); }
  x.fillStyle = '#1a1a1a'; x.font = `900 ${Math.round(ch * 0.42)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('酒', cx + cw / 2, cy + ch / 2 + 2);
}
const ART_OF = (key: string): Art | undefined => { const h = key.indexOf('#'); return h < 0 ? SIGN_ART[key] : SIGN_ALT[key.slice(0, h)]?.[+key.slice(h + 1) - 1]; };
const COLS = 8, ROWS = Math.ceil(SIGN_KEYS.length / COLS); // 8 列：縦を 8192px 未満に収める（超えると縮められて文字がぼやける）
export function makeSignCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 256 * COLS; cv.height = 128 * ROWS;
  const x = cv.getContext('2d')!;
  const cw = cv.width / COLS, ch = cv.height / ROWS;
  SIGN_KEYS.forEach((label, i) => {
    const cx = (i % COLS) * cw, cy = Math.floor(i / COLS) * ch;
    if (label[0] === '|') { drawVSign(x, cx, cy, cw, ch, VSIGN[label.slice(1)]); return; }
    if (label === '__lantern') { drawLantern(x, cx, cy, cw, ch); return; }
    const art = ART_OF(label); if (art) { drawArtSign(x, cx, cy, cw, ch, art); return; }
    const [bg, fg] = SIGN_STYLE[label];
    x.fillStyle = bg; x.fillRect(cx, cy, cw, ch);
    if (label === '工事中') { x.fillStyle = '#1a1a1a'; for (let k = -2; k < 12; k++) { x.beginPath(); x.moveTo(cx + k * 30, cy + ch); x.lineTo(cx + k * 30 + 14, cy + ch); x.lineTo(cx + k * 30 + 34, cy + ch - 20); x.lineTo(cx + k * 30 + 20, cy + ch - 20); x.fill(); } x.save(); x.beginPath(); x.rect(cx, cy, cw, ch); x.clip(); x.restore(); }
    x.strokeStyle = fg; x.globalAlpha = 0.35; x.lineWidth = 4; x.strokeRect(cx + 6, cy + 6, cw - 12, ch - 12); x.globalAlpha = 1;
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    const size = label.length <= 1 ? 96 : label.length === 2 ? 78 : label.length === 3 ? 64 : label.length === 4 ? 52 : label.length <= 6 ? 40 : 34;
    x.font = `700 ${size}px "Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif`;
    x.fillText(label, cx + cw / 2, cy + ch / 2 + (label === '工事中' ? -8 : 4), cw - 24);
  });
  return cv;
}
function signUv(label: string): number[] {
  const i = Math.max(0, SIGN_KEYS.indexOf(label));
  const u0 = (i % COLS) / COLS, u1 = u0 + 1 / COLS, vt = 1 - Math.floor(i / COLS) / ROWS, vb = vt - 1 / ROWS;
  const e = 0.002;
  return [u0 + e, vb + e, u1 - e, vb + e, u1 - e, vt - e, u0 + e, vt - e];
}
/** 看板。face: 0 +z / 1 -z / 2 +x / 3 -x。a は壁面に沿った中心、p は壁面の位置 */
export function sign(c: Ctx, label: string, face: number, a: number, y: number, p: number, w: number, h = w / 2): void {
  const alt = SIGN_ALT[label]; // 場所ごとに屋号を選ぶ（同じ建物の看板はすべて同じ屋号）
  if (alt) { const k = Math.floor(dh(Math.round(c.g.ox), Math.round(c.g.oz), 77) * (alt.length + 1)); if (k > 0) label = `${label}#${k}`; }
  const uv = signUv(label), o = 0.09, s = c.sign;
  s.ox = c.g.ox; s.oy = c.g.oy; s.oz = c.g.oz; s.cos = c.g.cos; s.sin = c.g.sin;
  if (face === 0) s.quad([a - w / 2, y, p + o], [a + w / 2, y, p + o], [a + w / 2, y + h, p + o], [a - w / 2, y + h, p + o], 0xffffff, 1, uv);
  else if (face === 1) s.quad([a + w / 2, y, p - o], [a - w / 2, y, p - o], [a - w / 2, y + h, p - o], [a + w / 2, y + h, p - o], 0xffffff, 1, uv);
  else if (face === 2) s.quad([p + o, y, a + w / 2], [p + o, y, a - w / 2], [p + o, y + h, a - w / 2], [p + o, y + h, a + w / 2], 0xffffff, 1, uv);
  else s.quad([p - o, y, a - w / 2], [p - o, y, a + w / 2], [p - o, y + h, a + w / 2], [p - o, y + h, a - w / 2], 0xffffff, 1, uv);
}
/** 縦長の看板（袖看板）。uv を 90° 回して、縦書きの文字が立つように貼る */
function vsign(c: Ctx, key: string, face: number, a: number, y: number, p: number, w: number, h: number): void {
  const [u0, vb, u1, , , vt] = signUv(key), s = c.sign, o = 0.06;
  s.ox = c.g.ox; s.oy = c.g.oy; s.oz = c.g.oz; s.cos = c.g.cos; s.sin = c.g.sin;
  const uv = [u1, vb, u1, vt, u0, vt, u0, vb]; // 左下・右下・右上・左上 → セルの右下・右上・左上・左下
  if (face === 0) s.quad([a - w / 2, y, p + o], [a + w / 2, y, p + o], [a + w / 2, y + h, p + o], [a - w / 2, y + h, p + o], 0xffffff, 1, uv);
  else if (face === 1) s.quad([a + w / 2, y, p - o], [a - w / 2, y, p - o], [a - w / 2, y + h, p - o], [a + w / 2, y + h, p - o], 0xffffff, 1, uv);
  else if (face === 2) s.quad([p + o, y, a + w / 2], [p + o, y, a - w / 2], [p + o, y + h, a - w / 2], [p + o, y + h, a + w / 2], 0xffffff, 1, uv);
  else s.quad([p - o, y, a - w / 2], [p - o, y, a + w / 2], [p - o, y + h, a + w / 2], [p - o, y + h, a - w / 2], 0xffffff, 1, uv);
}
/** 道へ突き出す袖看板（両面）。x は壁の位置、z は壁から出る向きの中心 */
function sodeSign(c: Ctx, label: string, x: number, z: number, y: number): void {
  if (!VSIGN[label]) return;
  const g = c.g, w = 0.9, h = 2.8, t = 0.14;
  g.box(x, y, z, t, h + 0.16, w + 0.16, 0x4a4e54); g.box(x, y + h * 0.75, z - w / 2 - 0.3, 0.06, 0.06, 0.6, 0x4a4e54);
  vsign(c, `|${label}`, 2, z, y + 0.08, x + t / 2 - 0.05, w, h); vsign(c, `|${label}`, 3, z, y + 0.08, x - t / 2 + 0.05, w, h);
}
/** ちょうちん（夜は光る）。四面に和紙の模様を貼る */
function chochin(c: Ctx, x: number, y: number, z: number, r = 0.27, h = 0.62): void {
  const o = r - 0.06; c.g.box(x, y + h, z, 0.1, 0.12, 0.1, 0x1a1a1a);
  sign(c, '__lantern', 0, x, y, z + o - 0.09, r * 2, h); sign(c, '__lantern', 1, x, y, z - o + 0.09, r * 2, h);
  sign(c, '__lantern', 2, z, y, x + o - 0.09, r * 2, h); sign(c, '__lantern', 3, z, y, x - o + 0.09, r * 2, h);
}
/** 両面の立て看板 */
function standSign(c: Ctx, label: string, x: number, z: number, y: number, w: number, alongX = true): void {
  c.g.cyl(x, 0, z, 0.09, y + w / 2, 0x6b7076, 5);
  if (alongX) { c.g.box(x, y, z, w + 0.2, w / 2 + 0.2, 0.12, 0xe9e9e4); sign(c, label, 0, x, y + 0.1, z + 0.02, w); sign(c, label, 1, x, y + 0.1, z - 0.02, w); }
  else { c.g.box(x, y, z, 0.12, w / 2 + 0.2, w + 0.2, 0xe9e9e4); sign(c, label, 2, z, y + 0.1, x + 0.02, w); sign(c, label, 3, z, y + 0.1, x - 0.02, w); }
}

const GLASS = 0x8fa9b8;
/** 窓。face と座標の取り方は sign と同じ */
/** 窓枠を描く（架空の街の町並みで有効。実在都市版は軽さを優先して描かない） */
export const DETAIL = { frames: false, hi: false };
export function win(c: Ctx, face: number, a: number, y: number, p: number, w: number, h: number, lit = 0.45, color = GLASS): void {
  if (DETAIL.frames && w >= 0.7 && h >= 0.7) {
    // 窓枠と水切り：壁から少しだけ浮かせた細い帯（枠の色は位置から決め、乱数の並びは変えない）
    const g = c.g, fo = 0.075, bw = 0.11, fc = ((Math.floor(a * 7.1) ^ Math.floor(p * 3.3)) & 3) === 0 ? 0x4f5459 : 0xe9e7e1;
    const Q = (u0: number, u1: number, v0: number, v1: number, col: number) => {
      if (face === 0) g.quad([u0, v0, p + fo], [u1, v0, p + fo], [u1, v1, p + fo], [u0, v1, p + fo], col);
      else if (face === 1) g.quad([u1, v0, p - fo], [u0, v0, p - fo], [u0, v1, p - fo], [u1, v1, p - fo], col);
      else if (face === 2) g.quad([p + fo, v0, u1], [p + fo, v0, u0], [p + fo, v1, u0], [p + fo, v1, u1], col);
      else g.quad([p - fo, v0, u0], [p - fo, v0, u1], [p - fo, v1, u1], [p - fo, v1, u0], col);
    };
    const l = a - w / 2, r = a + w / 2;
    Q(l - bw, r + bw, y + h, y + h + bw, fc); Q(l - bw, l, y, y + h, fc); Q(r, r + bw, y, y + h, fc); Q(l - bw * 1.6, r + bw * 1.6, y - bw * 1.3, y, 0xd6d3cb); // 上・左右・水切り
    if (w > 1.5) Q(a - bw / 2, a + bw / 2, y, y + h, fc); // 縦の桟
  }
  const t = c.rnd() < lit ? c.wa : c.wb, o = 0.05;
  if (c.fine && color === GLASS && h > 0.7) { // 窓ごとに、空の映り方・カーテン・ブラインドの違い
    const q = dh(a * 3.1 + c.g.ox, y * 1.7 + p + c.g.oz, face);
    color = q < 0.3 ? 0x9db7c6 : q < 0.5 ? 0x6f8796 : q < 0.65 ? 0xb9c4c8 : q < 0.8 ? 0x8fa9b8 : q < 0.9 ? 0xc8b9a0 : 0xa8b0a8;
  }
  t.ox = c.g.ox; t.oy = c.g.oy; t.oz = c.g.oz; t.cos = c.g.cos; t.sin = c.g.sin;
  { const wx = t.ox + a * t.cos, wz = t.oz + p * t.cos, q = Math.sin(wx * 12.9898 + wz * 78.233 + (t.oy + y) * 37.719 + face * 4.1) * 43758.5453; t.widv = [1 + (q - Math.floor(q)) * 0.998, t.oy + y + h / 2]; }
  if (face === 0) t.quad([a - w / 2, y, p + o], [a + w / 2, y, p + o], [a + w / 2, y + h, p + o], [a - w / 2, y + h, p + o], color);
  else if (face === 1) t.quad([a + w / 2, y, p - o], [a - w / 2, y, p - o], [a - w / 2, y + h, p - o], [a + w / 2, y + h, p - o], color);
  else if (face === 2) t.quad([p + o, y, a + w / 2], [p + o, y, a - w / 2], [p + o, y + h, a - w / 2], [p + o, y + h, a + w / 2], color);
  else t.quad([p - o, y, a - w / 2], [p - o, y, a + w / 2], [p - o, y + h, a + w / 2], [p - o, y + h, a - w / 2], color);
  t.widv = [0, 0];
}
/** 窓（v86）：点灯の乱数を位置から作る版。細部表示のときだけ付ける窓に使い、本体の乱数の並びを品質で変えない */
function winD(c: Ctx, face: number, a: number, y: number, p: number, w: number, h: number, lit = 0.45, color = GLASS): void {
  const r = c.rnd, q = dh(a * 1.3 + c.g.ox, y * 2.1 + p + c.g.oz, face + 9); c.rnd = () => q; try { win(c, face, a, y, p, w, h, lit, color); } finally { c.rnd = r; }
}
/** 壁面に窓を等間隔で並べる */
function winRow(c: Ctx, face: number, a0: number, a1: number, y: number, p: number, n: number, w: number, h: number, lit = 0.45, color?: number): void {
  for (let i = 0; i < n; i++) win(c, face, a0 + (a1 - a0) * (i + 0.5) / n, y, p, w, h, lit, color);
}

/** 色を明るく・暗くする */
const shadeC = (col: number, k: number) => { const r = Math.min(255, ((col >> 16) & 255) * k), g = Math.min(255, ((col >> 8) & 255) * k), b = Math.min(255, (col & 255) * k); return (r << 16) | (g << 8) | b; };
const GREENS = [0x4f8a3c, 0x3f7a3a, 0x5c9a48, 0x356b35, 0x6aa352];
/** Blender で作った木（tools/blender_trees.py → src/assets/trees.json）。V=頂点（Blender の Z 上向き）、F=[a,b,c,葉なら1,明るさ] */
type TreeMesh = { V: number[][]; F: number[][] };
// v79：広葉樹・桜・針葉樹は treegen.ts で作った細かい形に差し替える（松は Blender の形）
const TM: Record<string, TreeMesh> = { ...(TREES as unknown as Record<string, TreeMesh>), ...growTrees() };
const TRUNK = 0x5b4632;
/** 面の角ごとのなめらかな法線：同じ頂点を使う面のうち、向きが近い面（cos が lim 以上）の法線を足し合わせる。
 *  低ポリの面がカクカク見えないようにする（木の葉・車体）。折れ目（屋根と窓の境など）は残る */
const ADJ = new WeakMap<object, number[][]>();
function cornerNormals(m: { V: number[][]; F: number[][] }, P: [number, number, number][], lim: number): [number, number, number][][] {
  let adj = ADJ.get(m); if (!adj) { adj = m.V.map(() => []); m.F.forEach((f, i) => { for (let k = 0; k < 3; k++) adj![f[k]].push(i); }); ADJ.set(m, adj); }
  const fn = m.F.map(f => { const a = P[f[0]], b = P[f[1]], c = P[f[2]], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l, l] as number[]; }); // 4 番目は面積の重み
  return m.F.map((f, i) => [0, 1, 2].map(k => { const n = fn[i]; let x = 0, y = 0, z = 0;
    for (const j of adj![f[k]]) { const q = fn[j]; if (m.F[j][3] === f[3] && n[0] * q[0] + n[1] * q[1] + n[2] * q[2] >= lim) { x += q[0] * q[3]; y += q[1] * q[3]; z += q[2] * q[3]; } }
    const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l] as [number, number, number]; }));
}
function treeMesh(c: Ctx, m: TreeMesh, x: number, z: number, s: number, leaf: number, rot: number): void {
  const g = c.g, ca = Math.cos(rot) * s, sa = Math.sin(rot) * s, P = m.V.map(([bx, by, bz]) => [x + bx * ca - by * sa, bz * s, z - (bx * sa + by * ca)] as [number, number, number]);
  const N = cornerNormals(m, P, -0.2); // 葉のかたまりは丸く（裏返るほど向きが違う面どうしは混ぜない）
  m.F.forEach(([a, b, d, t, sh], i) => { if (t) g.triN(P[a], P[b], P[d], N[i][0], N[i][1], N[i][2], leaf, sh); else g.tri(P[a], P[b], P[d], TRUNK, sh); });
}
export function tree(c: Ctx, x: number, z: number, s = 1, kind = -1): void {
  const k = kind >= 0 ? kind : (c.rnd() < 0.72 ? 0 : c.rnd() < 0.6 ? 1 : 2);
  const g = c.g;
  if (c.fine) { // 細かい表示では Blender の木を使う（乱数の消費は従来どおり）
    const q = dh(x + g.ox, z + g.oz, 7), rot = q * Math.PI * 2;
    if (k === 1) { const sv = g.surfv; g.surfv = -2; treeMesh(c, q < 0.22 ? TM.pine : TM.conifer, x, z, s, 0x316540, rot); g.surfv = sv; return; } // 常緑樹は春の桜色・秋の紅葉にしない
    const col = k === 2 ? 0xf0b9c8 : k === 3 ? 0xc8553a : pick(c, GREENS); c.rnd();
    const m = k === 2 ? TM.sakura : q < 0.45 ? TM.round : q < 0.75 ? TM.vase : TM.oval;
    treeMesh(c, m, x, z, s, col, rot); return;
  }
  if (k === 1) { // 針葉樹
    g.cyl(x, 0, z, 0.22 * s, 1.6 * s, 0x5b4632, 5);
    g.cyl(x, 1.2 * s, z, 2.0 * s, 3.2 * s, 0x2f5f3a, 6, undefined, 0.01);
    g.cyl(x, 3.2 * s, z, 1.4 * s, 2.8 * s, 0x356b40, 6, undefined, 0.01);
  } else {
    const col = k === 2 ? 0xf0b9c8 : k === 3 ? 0xc8553a : pick(c, GREENS);
    g.cyl(x, 0, z, 0.25 * s, 2.4 * s, 0x5b4632, 5);
    g.blob(x, 4.2 * s, z, 2.3 * s, 2.2 * s, 2.3 * s, col);
    if (c.rnd() < 0.5) g.blob(x + 0.9 * s, 3.5 * s, z + 0.5 * s, 1.5 * s, 1.4 * s, 1.5 * s, col);
  }
}
function bush(c: Ctx, x: number, z: number, s = 1, col?: number): void { c.g.blob(x, 0.5 * s, z, 0.8 * s, 0.6 * s, 0.8 * s, col ?? pick(c, GREENS), 5); }
function hedge(c: Ctx, x: number, z: number, sx: number, sz: number, h = 1.0): void { c.g.box(x, 0, z, sx, h, sz, 0x4b7f3f, 0x5a914a); }
export function car(c: Ctx, x: number, z: number, alongX: boolean, col?: number): void {
  const r0 = col === undefined ? c.rnd() : 0, L = 4.1, Wd = 1.7, g = c.g; let k = col ?? carColor(r0); // v86：色は日本の実際の分布（白・黒・銀・灰が 7 割強）
  if (!c.fine) {
    if (alongX) { g.box(x, 0.05, z, L * 0.94, 0.3, Wd * 1.02, 0x1c1d1f); g.box(x, 0.3, z, L, 0.65, Wd, k); g.box(x - 0.2, 0.95, z, L * 0.55, 0.55, Wd * 0.9, 0x2a3138); }
    else { g.box(x, 0.05, z, Wd * 1.02, 0.3, L * 0.94, 0x1c1d1f); g.box(x, 0.3, z, Wd, 0.65, L, k); g.box(x, 0.95, z - 0.2, Wd * 0.9, 0.55, L * 0.55, 0x2a3138); }
    return;
  }
  // 細かい車：Blender の車（セダン・ミニバン・軽自動車）
  const q = dh(x + g.ox, z + g.oz, 11), kd = carKindOf(q), m = CM[kd]; if (col === undefined && (kd === 'kei' || kd === 'keitruck')) k = carColor(r0, true);
  carMesh(g, m, x, z, (alongX ? Math.PI / 2 : 0) + (dh(x + g.ox, z + g.oz, 12) < 0.5 ? Math.PI : 0), (t) => t === 0 ? k : CAR_PART[t]);
}
/** Blender の車（tools/blender_cars.py → src/assets/cars.json）。面の種類 0 車体 1 タイヤ 2 樹脂 3 前照灯 4 尾灯 5 窓 6 ホイール。前は +z */
export type CarMesh = { V: number[][]; F: number[][] };
// v80：車の形は cargen.ts で作る（cars.json の Blender の形は使わなくなった）
export const CM: Record<CarKind, CarMesh> = makeCars();
/** 車の種類の割合（0〜1 の乱数から）：セダン 19%・軽 20%・ミニバン 15%・コンパクト 15%・SUV 11%・ワゴン 6%・スポーツ 3%・軽トラ 5%・商用バン 6% */
export function carKindOf(q: number): CarKind { const W = [0.19, 0.2, 0.15, 0.15, 0.11, 0.06, 0.03, 0.05, 0.06]; let a = 0; for (let i = 0; i < W.length; i++) { a += W[i]; if (q < a) return CAR_KINDS[i]; } return 'sedan'; }
export function carMesh(g: Geo, m: CarMesh, x: number, z: number, rot: number, color: (t: number) => number, only?: (t: number) => boolean): void {
  const c = Math.cos(rot), s = Math.sin(rot), P = m.V.map(([bx, by, bz]) => { const gx = -bx, gz = by; return [x + gx * c + gz * s, bz, z - gx * s + gz * c] as [number, number, number]; });
  const N = cornerNormals(m, P, 0.75); // 車体の曲面はなめらかに、折れ目（約 40° 以上）は残す
  m.F.forEach(([a, b, d, t], i) => { if (!only || only(t)) g.triN(P[a], P[b], P[d], N[i][0], N[i][1], N[i][2], color(t)); });
}
function vending(c: Ctx, x: number, z: number, face = 0): void {
  const col = pick(c, [0xf4f4f4, 0xc3312b, 0x2b5ea8, 0xf4f4f4]);
  c.g.box(x, 0, z, 1.0, 1.85, 0.7, col);
  win(c, face, face < 2 ? x : z, 0.75, face === 0 ? z + 0.35 : face === 1 ? z - 0.35 : face === 2 ? x + 0.5 : x - 0.5, 0.8, 0.9, 1, 0xdfe9ee);
}
/** 敷地の土台（斜面では擁壁として見える） */
function pad(c: Ctx, sx: number, sz: number, color: number, y = 0.06): void { c.g.box(0, -5, 0, sx, 5 + y, sz, 0xa9a59c, color); }
/** glb で区画まるごと作る名所の下地（render/landmarks.ts） */
export function lmPad(c: Ctx, w: number, h: number): void { pad(c, w * 30 - 1.6, h * 30 - 1.6, 0xcfc9bc); }
function slab(c: Ctx, x: number, z: number, sx: number, sz: number, color: number, y = 0.1): void { c.g.box(x, 0.02, z, sx, y, sz, color); }
function parkingLines(c: Ctx, x0: number, x1: number, z: number, depth: number, n: number): void {
  for (let i = 0; i <= n; i++) c.g.box(x0 + (x1 - x0) * i / n, 0.12, z, 0.12, 0.02, depth, 0xeeeeea);
}
function fenceRect(c: Ctx, sx: number, sz: number, h: number, color: number, gap = 6): void {
  const g = c.g, t = 0.12;
  g.box(0, 0, -sz / 2, sx, h, t, color); g.box(-sx / 2, 0, 0, t, h, sz, color); g.box(sx / 2, 0, 0, t, h, sz, color);
  g.box(-(sx + gap) / 4, 0, sz / 2, (sx - gap) / 2, h, t, color); g.box((sx + gap) / 4, 0, sz / 2, (sx - gap) / 2, h, t, color);
}
const dull = (c: Ctx, fresh: number, aged: number) => (c.old ? aged : fresh);

// ---- 住宅（v86：戸建ては 10 の型。外壁の素材・屋根・ベランダ・玄関・窓まわり・屋上の設備・塀を、建物の乱数で家ごとに選ぶ） ----
/** 外壁の素材と色の系統：横張りサイディング・窯業サイディング・塗り壁・ガルバリウム・板張り（数字は geo.ts の wallMat） */
const H_MAT: [number, number[]][] = [
  [9, [0xf2efe6, 0xe9e2d0, 0xd9cfc0, 0xcfd6da, 0xe8ded2, 0xbfa98a, 0xdcd4c4, 0x9aa3a8, 0xc8d0c4]],
  [4, [0xc9b8a0, 0xb79f86, 0xe2d8c6, 0x9c8a78, 0xd8d0c2, 0x8a7d70, 0xe9e4da, 0xa8a49c]],
  [8, [0xf5f3ee, 0xefe8da, 0xe8dcc8, 0xd8cdb8, 0xf0ece4, 0xe6e2da]],
  [5, [0x3c4046, 0x5a5e62, 0x8a8f93, 0x2f3438, 0x6b5f52, 0xdedcd6, 0x46505a]],
  [10, [0x8a6448, 0x6b4a32, 0xa07a58, 0x3a3430]],
];
const SLATE = [0x3b3f46, 0x2f3a4a, 0x4a4a4a, 0x39424e, 0x5a3a2e, 0x2f4a3f, 0x6b4a3a, 0x7a3b2e];
const KAWARA = [0x4a4e54, 0x5a5f66, 0x3e4248, 0x6a5a4e, 0x8a4a34];
const GALV = [0x3c4046, 0x5a5e62, 0x2f3a3a, 0x6b6f72, 0x4a3a32];
const DOORS = [0x4a3426, 0x2e3a44, 0x6b4a32, 0x8a6a4a, 0x3a3e42, 0xb8b2a6, 0x5a2e2a];
/** 素材を重みで選ぶ（w は H_MAT の順の重み） */
function hmat(c: Ctx, w: number[]): { mat: number; wall: number } {
  let r = c.rnd() * w.reduce((a, b) => a + b, 0), i = 0; while (i < w.length - 1 && (r -= w[i]) > 0) i++;
  const [mat, cols] = H_MAT[i]; return { mat, wall: pick(c, cols) };
}
/** 寄棟屋根（4 面）。cy は軒の高さ、over は軒の出、ins は棟の寄り（既定は短い辺の半分＝正方形ならピラミッド）。v86：瓦の模様・軒先の厚み・棟の押さえ */
function hipRoof(g: Geo, cx: number, cy: number, cz: number, w: number, d: number, h: number, color: number, over = 0.5, ins?: number): void {
  const a = w / 2 + over, b = d / 2 + over, k = Math.min(ins ?? Math.min(a, b), Math.min(a, b) * 0.999), sv = g.surfv;
  const P: [number, number, number][] = [[cx - a, cy, cz + b], [cx + a, cy, cz + b], [cx + a, cy, cz - b], [cx - a, cy, cz - b]];
  const Q: [number, number, number][] = [[cx - a + k, cy + h, cz + b - k], [cx + a - k, cy + h, cz + b - k], [cx + a - k, cy + h, cz - b + k], [cx - a + k, cy + h, cz - b + k]];
  g.surfv = 3; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; g.quad(P[i], P[j], Q[j], Q[i], color); }
  g.surfv = 0; g.quad(P[3], P[2], P[1], P[0], 0x6f6a62, 0.8); // 軒裏
  if (Geo.fineRoof && h > 0.3) { const t = 0.14; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; g.quad([P[i][0], cy - t, P[i][2]], [P[j][0], cy - t, P[j][2]], P[j], P[i], color, 0.55); } // 軒先の厚み
    const rl = Q[1][0] - Q[0][0], rz = Q[0][2] - Q[3][2]; if (rl > 0.3) g.box(cx, cy + h - 0.04, cz, rl + 0.2, 0.14, 0.24, color); else if (rz > 0.3) g.box(cx, cy + h - 0.04, cz, 0.24, 0.14, rz + 0.2, color); } // 棟
  g.surfv = sv;
}
/** 片流れ屋根：奥行き d の箱の上に、高さ h だけ傾いた屋根。s = 1 は手前（+z）が低く、-1 は奥が低い。高い側の壁と左右の三角の壁も塞ぐ。galv はガルバの縦はぜ */
/** いま描いている家の外壁の色（shedRoof の妻壁用。house1 が入れる） */
let H_WALL = 0xf2efe6;
function shedRoof(g: Geo, cx: number, cy: number, cz: number, w: number, d: number, h: number, color: number, s = 1, over = 0.45, galv = true, walls = true): void {
  const a = w / 2, b = d / 2, o = over, sv = g.surfv, Z = (z: number) => cz + s * z, P = (x: number, y: number, z: number): V => [x, y, Z(z)];
  const Qd = (p: V, q: V, r: V, u: V, col: number, sh = 1) => (s > 0 ? g.quad(p, q, r, u, col, sh) : g.quad(u, r, q, p, col, sh));
  const Tr = (p: V, q: V, r: V, col: number) => (s > 0 ? g.tri(p, q, r, col) : g.tri(r, q, p, col));
  if (walls) { // 三角の妻壁と高い側の壁
    g.surfv = g.wallMat;
    Tr(P(cx + a, cy, b), P(cx + a, cy, -b), P(cx + a, cy + h, -b), H_WALL); Tr(P(cx - a, cy, -b), P(cx - a, cy, b), P(cx - a, cy + h, -b), H_WALL);
    Qd(P(cx + a, cy, -b), P(cx - a, cy, -b), P(cx - a, cy + h, -b), P(cx + a, cy + h, -b), H_WALL, 0.85);
  }
  const yF = cy + 0.12 - h * o / d, yB = cy + 0.12 + h + h * o / d, t = 0.16;
  g.surfv = galv ? 5 : 3; Qd(P(cx - a - o, yF, b + o), P(cx + a + o, yF, b + o), P(cx + a + o, yB, -b - o), P(cx - a - o, yB, -b - o), color);
  g.surfv = 0; Qd(P(cx - a - o, yB - t, -b - o), P(cx + a + o, yB - t, -b - o), P(cx + a + o, yF - t, b + o), P(cx - a - o, yF - t, b + o), 0xd8d4cc, 0.7); // 軒裏
  if (Geo.fineRoof) { Qd(P(cx - a - o, yF - t, b + o), P(cx + a + o, yF - t, b + o), P(cx + a + o, yF, b + o), P(cx - a - o, yF, b + o), color, 0.55); Qd(P(cx + a + o, yB - t, -b - o), P(cx - a - o, yB - t, -b - o), P(cx - a - o, yB, -b - o), P(cx + a + o, yB, -b - o), color, 0.5);
    Qd(P(cx + a + o, yF - t, b + o), P(cx + a + o, yB - t, -b - o), P(cx + a + o, yB, -b - o), P(cx + a + o, yF, b + o), color, 0.5); Qd(P(cx - a - o, yB - t, -b - o), P(cx - a - o, yF - t, b + o), P(cx - a - o, yF, b + o), P(cx - a - o, yB, -b - o), color, 0.5); } // 鼻隠しとけらば
  g.surfv = sv;
}
/** 家の窓（正面）。sb：シャッターボックス、tb：雨戸の戸袋、grille：面格子 */
function hwin(c: Ctx, a: number, y: number, fz: number, w: number, h: number, o: { sb?: boolean; tb?: number; grille?: boolean; lit?: number } = {}): void {
  winD(c, 0, a, y, fz, w, h, o.lit ?? 0.45);
  if (!c.fine) return; const g = c.g;
  if (o.sb) g.box(a, y + h + 0.12, fz + 0.13, w + 0.3, 0.3, 0.26, 0xd9d8d2);
  if (o.tb) g.box(a + o.tb * (w / 2 + 0.35), y - 0.05, fz + 0.12, 0.5, h + 0.2, 0.22, 0xd2d0c8);
  if (o.grille && DETAIL.hi) { for (let i = 1; i < 4; i++) g.box(a - w / 2 + i * w / 4, y, fz + 0.13, 0.04, h, 0.04, 0x9aa0a4); }
}
/** ベランダ（2 階）。kind 0 手すり壁・1 アルミの縦格子・2 ガラス・3 鉄の手すり（古い家） */
function hBalcony(c: Ctx, x: number, y: number, fz: number, bw: number, bd: number, kind: number, col: number): void {
  const g = c.g, rail = kind === 3 ? 0x5a5e5a : 0xa4aaae, zf = fz + bd - 0.05;
  g.box(x, y - 0.16, fz + bd / 2, bw, 0.16, bd, 0xd9d6cf);
  if (kind === 0) { g.box(x, y, zf, bw, 1.05, 0.1, col); g.box(x - bw / 2 + 0.05, y, fz + bd / 2, 0.1, 1.05, bd, col); g.box(x + bw / 2 - 0.05, y, fz + bd / 2, 0.1, 1.05, bd, col); g.box(x, y + 1.05, zf, bw + 0.04, 0.05, 0.16, 0xc8c6c0); return; }
  g.box(x, y + 0.95, zf, bw, 0.07, 0.09, rail); g.box(x, y + 0.05, zf, bw, 0.05, 0.06, rail);
  for (const sx of [-1, 1]) g.box(x + sx * (bw / 2 - 0.04), y, fz + bd / 2, 0.06, 1.0, bd, rail);
  if (kind === 2) { g.box(x, y + 0.1, zf, bw - 0.1, 0.82, 0.03, 0xb4c4ca); return; }
  if (c.fine && DETAIL.hi) { const n = Math.round(bw / (kind === 3 ? 0.42 : 0.7)); for (let i = 1; i < n; i++) g.box(x - bw / 2 + i * bw / n, y + 0.1, zf, 0.035, 0.85, 0.035, rail); }
  else g.box(x, y + 0.1, zf, bw - 0.1, 0.85, 0.02, shadeC(rail, 0.85));
}
/** 玄関：扉・ポーチの段・庇（3 通り）・表札と郵便受け・門柱（細部表示のとき） */
function hEntry(c: Ctx, x: number, fz: number, door: number, roof: number, kind: number): void {
  const g = c.g;
  g.box(x, 0, fz + 0.05, 0.95, 2.1, 0.1, door); g.box(x, 0, fz + 0.5, 1.7, 0.2, 0.9, 0xbab5aa);
  if (kind === 0) g.box(x, 2.3, fz + 0.5, 1.9, 0.12, 1.0, roof);                                          // 板の庇
  else if (kind === 1) { g.box(x, 2.35, fz + 0.65, 2.2, 0.1, 1.3, 0xe9e7e1); g.box(x + 0.95, 0, fz + 1.2, 0.12, 2.35, 0.12, 0xe9e7e1); } // 柱つきのポーチ
  else g.box(x, 2.3, fz + 0.45, 1.6, 0.06, 0.9, 0x9fb8c4);                                               // ガラスの庇
  if (!c.fine) return;
  g.box(x + 0.9, 1.2, fz + 0.07, 0.3, 0.42, 0.06, 0x3a3a3a); g.box(x - 0.85, 0.95, fz + 0.1, 0.32, 0.4, 0.18, 0x4a5056); // 表札と郵便受け
  if (DETAIL.hi) g.box(x - 0.62, 1.95, fz + 0.12, 0.12, 0.16, 0.14, 0xf2eedc); // ポーチの灯り
}
/** 家の細部：基礎・雨どい・給湯器（エコキュート）・室外機・アンテナ・BS アンテナ・屋根の太陽光パネル */
function hDetail(c: Ctx, hx: number, hz: number, w: number, d: number, wh: number, roofY: number, solar: ((k: number) => void) | null): void {
  const g = c.g, k = (n: number) => dh(hx + g.ox, hz + g.oz, n), fz = hz + d / 2;
  g.box(hx, 0, hz, w + 0.08, 0.42, d + 0.08, 0x8f8d86);                                                      // 基礎
  g.box(hx + w / 2 + 0.35, 0, hz - d / 4, 0.4, 0.7, 0.8, 0xe6e6e2);                                          // 室外機
  if (!c.fine) return;
  for (const sx of [-1, 1]) g.box(hx + sx * (w / 2 + 0.06), 0, fz + 0.06, 0.1, wh, 0.1, 0x8a8478);          // 縦の雨どい
  if (k(3) < 0.45) { g.box(hx + w / 2 + 0.45, 0, hz + d / 4 - 0.2, 0.75, 1.8, 0.75, 0xeeeeea); } // エコキュート
  else g.box(hx + w / 2 + 0.2, 0.6, hz + d / 4, 0.25, 0.7, 0.5, 0xeeeeea);                                  // 給湯器
  if (k(2) < 0.3) { g.cyl(hx + w / 4, roofY - 0.4, hz - d / 4, 0.04, 2.4, 0x9aa0a6, 4); g.box(hx + w / 4, roofY + 1.7, hz - d / 4, 0.06, 0.06, 1.6, 0x9aa0a6); g.box(hx + w / 4, roofY + 1.3, hz - d / 4, 0.06, 0.06, 1.1, 0x9aa0a6); } // テレビのアンテナ
  else if (k(2) < 0.55) { g.box(hx + w / 2 + 0.05, wh - 1.2, hz - d / 4, 0.1, 0.1, 0.3, 0x9aa0a6); g.cyl(hx + w / 2 + 0.25, wh - 1.3, hz - d / 4 - 0.1, 0.32, 0.05, 0xe9e9e4, 6); } // BS アンテナ
  if (solar && k(1) < 0.32) solar(k(4));
}
/** 戸建て 1 棟（v86）。戻り値は「車庫が家の中にある」（都市型 3 階建て） */
function house1(c: Ctx, hx: number, hz: number): boolean {
  const g = c.g, t = c.rnd(), w = 7.2 + c.rnd() * 1.4, d = 6.0 + c.rnd() * 1.0, fz = hz + d / 2, door = pick(c, DOORS), sv0 = g.wallMat;
  const type = t < 0.2 ? 0 : t < 0.33 ? 1 : t < 0.43 ? 2 : t < 0.52 ? 3 : t < 0.61 ? 4 : t < 0.68 ? 5 : t < 0.76 ? 6 : t < 0.86 ? 7 : t < 0.93 ? 8 : 9;
  const W8 = [[45, 40, 0, 15, 0], [20, 50, 30, 0, 0], [0, 0, 50, 50, 0], [0, 20, 50, 30, 0], [0, 40, 25, 35, 0], [0, 0, 1, 0, 0], [40, 30, 30, 0, 0], [50, 50, 0, 0, 0], [30, 0, 0, 30, 40], [0, 10, 45, 45, 0]][type];
  const m = hmat(c, W8), wall = type === 8 && m.mat === 5 ? pick(c, [0x8a9a9a, 0xa8a090, 0x7a8a7a, 0x9a8a7a]) : m.wall, wood = pick(c, [0x8a6448, 0x6b4a32, 0xa07a58]);
  const bal = Math.floor(c.rnd() * 3), ent = Math.floor(c.rnd() * 3), sbox = c.rnd() < 0.5, roofA = pick(c, SLATE), roofG = pick(c, GALV), roofK = pick(c, KAWARA);
  H_WALL = wall; g.wallMat = m.mat;
  let wh = 5.6, roofY = 7.2, solar: ((k: number) => void) | null = null, garage = false;
  // 正面（2 階建ての共通）：玄関・1 階の掃き出し窓・2 階の窓とベランダ
  const front2 = (x0: number, ww: number, H1: number, roof: number, balKind: number) => {
    const dx = x0 - ww / 4; hEntry(c, dx, fz, door, roof, ent);
    hwin(c, x0 + ww / 5, 0.5, fz, 2.0, 1.85, { sb: sbox, tb: sbox ? 0 : 1 });
    if (balKind >= 0) { hBalcony(c, x0 + ww / 5, H1, fz, 3.2, 1.0, balKind, wall); hwin(c, x0 + ww / 5, H1 + 0.05, fz, 1.7, 1.9, { lit: 0.4 }); hwin(c, dx, H1 + 0.6, fz, 1.2, 1.1, { sb: sbox }); }
    else { hwin(c, x0 + ww / 5, H1 + 0.6, fz, 1.6, 1.2, { sb: sbox }); hwin(c, dx, H1 + 0.6, fz, 1.2, 1.1, { sb: sbox }); }
    if (DETAIL.hi) hwin(c, dx + 1.25, 1.0, fz, 0.5, 0.9, { grille: true });                              // 玄関わきの細い窓（面格子）
  };
  const sides = (ww: number, floors: number, H1: number) => { for (let f = 0; f < floors; f++) { const y = f * H1 + 0.9; winRow(c, 2, hz - d / 2, hz + d / 2, y, hx + ww / 2, 1, 1.1, 1.0); winRow(c, 3, hz - d / 2, hz + d / 2, y, hx - ww / 2, f ? 1 : 2, 0.8, 1.0); winRow(c, 1, hx - ww / 2, hx + ww / 2, y, hz - d / 2, 2, 1.2, 1.0); } };
  if (type === 0 || type === 1 || type === 7) { // 総二階の切妻・寄棟、L 字（1 階の張り出しに片流れの下屋）
    const L = type === 7, bw = L ? w - 2.2 : w, bx = L ? hx + 1.1 : hx, H = 5.6, ax: 'x' | 'z' = type === 0 && c.rnd() < 0.3 ? 'z' : 'x', rh = 1.7 + c.rnd() * 0.6;
    g.box(bx, 0, hz, bw, H, d, wall);
    const roof = type === 1 ? (c.rnd() < 0.45 ? roofK : roofA) : (c.rnd() < 0.3 ? roofG : roofA);
    if (type === 1) hipRoof(g, bx, H, hz, bw, d, 2.0, roof, 0.55, 2.4); else g.gable(bx, H, hz, bw, d, rh, roof, ax, wall, 0.5);
    if (L) { g.box(hx - w / 2 + 1.5, 0, hz + 0.6, 3.0, 2.9, d + 1.2, wall); shedRoof(g, hx - w / 2 + 1.5, 2.9, hz + 0.6, 3.0, d + 1.2, 0.7, roofG, 1, 0.35);
      hEntry(c, bx - bw / 4 + 0.6, fz, door, roof, ent); hwin(c, hx - w / 2 + 1.5, 0.9, fz + 1.2, 1.8, 1.1, { sb: sbox }); hwin(c, bx + bw / 5, 0.5, fz, 2.0, 1.85, { sb: sbox, tb: sbox ? 0 : 1 });
      if (bal < 2) hBalcony(c, bx + bw / 5, 2.8, fz, 3.0, 1.0, bal, wall); hwin(c, bx + bw / 5, 2.85, fz, 1.6, 1.9); hwin(c, bx - bw / 4 + 0.4, 3.4, fz, 1.0, 1.1, { sb: sbox });
    } else front2(hx, w, 2.8, roof, type === 1 ? (bal === 2 ? -1 : bal) : bal);
    sides(bw, 2, 2.8); wh = H; roofY = H + 2;
    if (ax === 'x' && type !== 1) solar = (q) => { const over = 0.5, half = d / 2 + over, P = (z: number) => H + 0.1 + rh * (1 - Math.abs(z - hz) / half) + 0.1, z0 = hz + 0.4, z1 = hz + d / 2 - 0.2, x0 = bx - bw / 2 + 0.6, x1 = bx + bw / 2 - 0.6 - q * 1.5;
      c.wb.quad([x0, P(z1), z1], [x1, P(z1), z1], [x1, P(z0), z0], [x0, P(z0), z0], 0x1f2b3c); };
    if (type === 1) solar = () => { const y0 = H + 0.25, y1 = H + 1.5, z0 = hz + d / 2 + 0.2, z1 = hz + d / 2 - 1.9; c.wb.quad([hx - 1.6, y0, z0], [hx + 1.6, y0, z0], [hx + 1.2, y1, z1], [hx - 1.2, y1, z1], 0x1f2b3c); };
  } else if (type === 2) { // 片流れ屋根のモダンな家（木の板張りを組み合わせる）
    const H0 = 4.8, rh = 1.9;
    g.box(hx, 0, hz, w, H0, d, wall, 0x8b8f92); shedRoof(g, hx, H0, hz, w, d, rh, roofG, 1, 0.5);
    g.surfv = 10; g.box(hx + w / 4, 0, fz + 0.04, w / 2, H0, 0.1, wood); g.surfv = 0;                    // 板張りの面
    hwin(c, hx - w / 4, 0.5, fz, 2.4, 2.0); hwin(c, hx - w / 4, 3.1, fz, 3.0, 0.7); hwin(c, hx + w / 4 + 0.9, 2.7, fz + 0.1, 0.55, 1.6);
    hEntry(c, hx + w / 4 - 0.6, fz + 0.06, door, roofG, 2);
    winRow(c, 2, hz - d / 2, hz + d / 2, 3.0, hx + w / 2, 1, 1.4, 0.6); winRow(c, 3, hz - d / 2, hz + d / 2, 0.9, hx - w / 2, 2, 0.8, 1.0); winRow(c, 1, hx - w / 2, hx + w / 2, 3.6, hz - d / 2, 3, 1.0, 1.0, 0.4);
    wh = H0; roofY = H0 + rh; solar = () => { const yF = H0 + 0.28 - rh * 0.5 / d, z0 = hz + d / 2 - 0.3, z1 = hz - d / 2 + 0.6, yr = (z: number) => yF + rh * (z0 + 0.3 + 0.5 - z) / (d + 1) + 0.08; c.wb.quad([hx - w / 2 + 0.4, yr(z0), z0], [hx + w / 2 - 0.4, yr(z0), z0], [hx + w / 2 - 0.4, yr(z1), z1], [hx - w / 2 + 0.4, yr(z1), z1], 0x1f2b3c); };
  } else if (type === 3) { // 陸屋根の箱の家（高さの違う 2 つの箱、片方は色を変える）
    const H = 6.0, acc = pick(c, [0x3c4046, 0xf3f3ef, 0x7a6a58, 0x5a5e62]), aw = w * 0.45;
    g.box(hx - w * 0.12, 0, hz, w * 0.76, H, d, wall, 0x8b8f92); g.box(hx - w * 0.12, H, hz, w * 0.76 + 0.1, 0.35, d + 0.1, shadeC(wall, 0.92), 0x8b8f92);
    g.wallMat = acc === 0xf3f3ef ? 8 : 5; g.box(hx + w / 2 - aw / 2, 0, hz + 0.4, aw, H + 0.6, d - 0.4, acc, 0x8b8f92); g.wallMat = m.mat;
    hwin(c, hx - w / 4, 0.4, fz, 2.6, 2.0); hwin(c, hx - w / 4, 3.6, fz, 3.0, 0.6); if (c.fine) g.box(hx - w / 4, 2.6, fz + 0.4, 3.2, 0.1, 0.8, acc);
    hwin(c, hx + w / 2 - aw / 2, 3.2, fz + 0.4, 0.6, 2.0);
    g.surfv = 10; g.box(hx + w / 2 - aw / 2, 0, fz + 0.42, 1.6, 2.6, 0.1, wood); g.surfv = 0; g.box(hx + w / 2 - aw / 2, 0, fz + 0.48, 0.95, 2.15, 0.06, door); g.box(hx + w / 2 - aw / 2, 0, fz + 0.9, 1.8, 0.18, 0.9, 0xbab5aa);
    winRow(c, 2, hz - d / 2, hz + d / 2, 3.6, hx + w / 2, 2, 0.9, 1.0); winRow(c, 1, hx - w / 2, hx + w / 2, 3.6, hz - d / 2, 2, 1.2, 1.0); winRow(c, 1, hx - w / 2, hx + w / 2, 0.9, hz - d / 2, 2, 1.2, 1.0);
    wh = H; roofY = H + 0.6;
  } else if (type === 4) { // 都市型の 3 階建て（間口が狭く、1 階は車庫）
    const ww = w * 0.78, H = 8.8; garage = true;
    g.box(hx, 0, hz, ww, H, d, wall, 0x8b8f92); g.box(hx, H, hz, ww + 0.2, 0.45, d + 0.2, pick(c, [0x5a5e62, wall, 0xf3f3ef]), 0x8b8f92);
    g.box(hx + ww / 4 - 0.1, 0, fz + 0.04, ww / 2 - 0.2, 2.3, 0.1, pick(c, [0x3a3e42, 0x9aa0a4, 0x6b5a4a])); // 車庫のシャッター
    if (c.fine) for (let i = 1; i < 6; i++) g.box(hx + ww / 4 - 0.1, i * 0.38, fz + 0.1, ww / 2 - 0.3, 0.03, 0.03, 0x2a2c2e);
    g.box(hx - ww / 4 - 0.3, 0, fz + 0.06, 0.9, 2.1, 0.1, door); g.box(hx - ww / 4 - 0.3, 2.25, fz + 0.4, 1.4, 0.08, 0.8, 0x9fb8c4);
    for (const y of [3.1, 6.0]) { hwin(c, hx + ww / 6, y, fz, 2.2, 1.5, { sb: sbox }); hwin(c, hx - ww / 3, y + 0.3, fz, 0.7, 1.2); }
    hBalcony(c, hx + ww / 6, 5.6, fz, 2.8, 0.9, 2, wall);
    winRow(c, 2, hz - d / 2, hz + d / 2, 3.2, hx + ww / 2, 2, 1.0, 1.0); winRow(c, 2, hz - d / 2, hz + d / 2, 6.0, hx + ww / 2, 2, 1.0, 1.0); winRow(c, 1, hx - ww / 2, hx + ww / 2, 3.2, hz - d / 2, 2, 1.0, 1.0);
    if (c.fine) { g.box(hx - ww / 4, H + 0.45, hz - d / 4, 1.6, 2.2, 1.6, wall, 0x8b8f92); g.box(hx + ww / 4, H + 0.45, hz, 0.9, 0.6, 0.6, 0xe6e6e2); } // 屋上の階段室と室外機
    hDetail(c, hx, hz, ww, d, H, H + 0.5, null); g.wallMat = sv0; return garage;
  } else if (type === 5) { // 和風の家（瓦の寄棟、下屋のひさし、格子、腰の板張り、縁側）
    const wd = 0x5a4030, shikkui = pick(c, [0xf1ece0, 0xe8e0d0, 0xf4f1ea]); H_WALL = shikkui;
    g.box(hx, 0, hz, w, 5.6, d, shikkui); g.surfv = 10; g.box(hx, 0, hz, w + 0.06, 1.0, d + 0.06, wd); g.surfv = 0; // 腰の板張り
    hipRoof(g, hx, 2.9, hz, w, d, 0.6, roofK, 0.9, 0.9);
    g.box(hx, 2.9, hz, w - 0.6, 2.7, d - 0.6, shikkui); hipRoof(g, hx, 5.6, hz, w - 0.6, d - 0.6, 2.2, roofK, 0.8, 2.6);
    for (let i = 0; i <= 5; i++) g.box(hx - w / 2 + 0.1 + i * (w - 0.2) / 5, 0, fz + 0.04, 0.16, 2.8, 0.08, wd); // 柱
    if (c.fine) for (let i = 0; i < 9; i++) g.box(hx - w / 2 + 0.6 + i * 0.32, 1.0, fz + 0.1, 0.06, 1.6, 0.05, wd); // 格子
    win(c, 0, hx - w / 2 + 2.0, 1.0, fz, 2.8, 1.6, 0.5, 0xd8cfb8);
    g.box(hx + w / 6, 0, fz + 0.06, 1.8, 2.1, 0.1, 0x3a2a20); g.box(hx + w / 6, 0, fz + 0.7, 2.4, 0.3, 1.0, 0x9a9488); // 引き戸の玄関と踏み石
    winRow(c, 0, hx - w / 2 + 0.6, hx + w / 2 - 0.6, 3.6, fz - 0.28, 3, 1.2, 1.0, 0.45, 0xd8cfb8);
    winRow(c, 2, hz - d / 2, hz + d / 2, 1.0, hx + w / 2, 1, 1.4, 1.2, 0.45, 0xd8cfb8); winRow(c, 1, hx - w / 2 + 0.3, hx + w / 2 - 0.3, 3.6, hz - d / 2 + 0.3, 2, 1.2, 1.0, 0.45, 0xd8cfb8);
    g.box(hx, 0, hz - d / 2 - 0.6, w - 1, 0.45, 1.2, wood); wh = 2.9; roofY = 7.8; // 縁側（裏）
  } else if (type === 6) { // 平屋（切妻か寄棟。縁側のウッドデッキ）
    const ww = w + 1.6, H = 3.1, hip = c.rnd() < 0.45, roof = hip ? roofK : roofA;
    g.box(hx, 0, hz, ww, H, d, wall); if (hip) hipRoof(g, hx, H, hz, ww, d, 1.9, roof, 0.7, 2.6); else g.gable(hx, H, hz, ww, d, 2.1, roof, 'x', wall, 0.6);
    hwin(c, hx + 0.3, 0.45, fz, 2.2, 1.8, { tb: 1 }); hwin(c, hx + ww / 2 - 1.3, 0.9, fz, 1.2, 1.1, { sb: sbox });
    hEntry(c, hx - ww / 2 + 1.3, fz, door, roof, ent);
    if (c.fine) { g.box(hx + 0.3, 0, fz + 0.9, 3.4, 0.45, 1.6, wood); g.box(hx + 0.3, 0.45, fz + 1.7, 3.4, 0.05, 0.06, shadeC(wood, 0.8)); } // ウッドデッキ
    winRow(c, 1, hx - ww / 2, hx + ww / 2, 0.9, hz - d / 2, 3, 1.4, 1.1); winRow(c, 2, hz - d / 2, hz + d / 2, 0.9, hx + ww / 2, 1, 1.1, 1.0); winRow(c, 3, hz - d / 2, hz + d / 2, 0.9, hx - ww / 2, 1, 0.8, 1.0);
    if (c.fine && !hip) solar = () => { const over = 0.6, half = d / 2 + over, P = (z: number) => H + 0.1 + 2.1 * (1 - Math.abs(z - hz) / half) + 0.1, z0 = hz + 0.4, z1 = hz + d / 2 - 0.2; c.wb.quad([hx - ww / 2 + 0.8, P(z1), z1], [hx + ww / 2 - 0.8, P(z1), z1], [hx + ww / 2 - 0.8, P(z0), z0], [hx - ww / 2 + 0.8, P(z0), z0], 0x1f2b3c); };
    hDetail(c, hx, hz, ww, d, H, H + 2.1, solar); g.wallMat = sv0; return false;
  } else if (type === 8) { // 昭和の木造 2 階建て（瓦の切妻、1 階の前に下屋、鉄の手すりと物干し、小さめのアルミ窓）
    const H = 5.4, H2 = 2.7;
    g.box(hx, 0, hz, w, H2 + 0.2, d, wall); g.box(hx + 0.4, H2, hz - 0.4, w - 0.8, H - H2, d - 0.8, wall);
    g.gable(hx + 0.4, H, hz - 0.4, w - 0.8, d - 0.8, 1.8, roofK, 'x', wall, 0.55);
    hipRoof(g, hx, H2 + 0.1, hz, w, d, 0.55, roofK, 0.6, 0.6);                                           // 1 階の下屋（まわりのひさし）
    g.box(hx - w / 4, 0, fz + 0.05, 1.6, 2.0, 0.1, 0x8a8a84); if (c.fine) g.box(hx - w / 4, 0.1, fz + 0.1, 0.05, 1.8, 0.04, 0x5a5e5a); // アルミの引き戸
    hwin(c, hx + w / 5, 0.7, fz, 2.4, 1.5, { tb: 1 }); hwin(c, hx + w / 5, H2 + 0.6, fz - 0.4, 2.2, 1.4, { tb: -1 });
    hwin(c, hx - w / 4, H2 + 0.8, fz - 0.4, 1.4, 1.0, { grille: true });
    if (c.fine) { hBalcony(c, hx + w / 5, H2 + 0.25, fz - 0.4, 2.8, 0.5, 3, wall); g.box(hx + w / 5, H2 + 1.9, fz + 0.35, 3.2, 0.04, 0.04, 0xb8bcc0); // 物干し竿
      const cols = [0xf6f6f2, 0x6a8ac8, 0xe8a0a8, 0xf2d27a]; for (let j = 0; j < 3; j++) if (dh(hx + g.ox, hz + j, 31) < 0.6) g.box(hx + w / 5 - 1 + j * 0.9, H2 + 1.15, fz + 0.35, 0.6, 0.7, 0.03, cols[j]); }
    winRow(c, 2, hz - d / 2, hz + d / 2, 0.9, hx + w / 2, 1, 1.0, 1.0); winRow(c, 2, hz - d / 2 + 0.4, hz + d / 2 - 1.2, 3.4, hx + w / 2 - 0.4, 1, 1.0, 1.0); winRow(c, 1, hx - w / 2, hx + w / 2, 0.9, hz - d / 2, 2, 1.2, 1.0);
    if (c.fine) g.box(hx - w / 2 + 0.2, H2 + 0.5, hz, 0.3, 0.15, 0.3, 0x5a5e62); wh = H2; roofY = H + 1.8;    // 外の配管
  } else { // 招き屋根（高さの違う片流れを 2 枚。段の所に高窓）
    const H = 5.6, dF = d * 0.6, dB = d - dF, zF = hz + d / 2 - dF / 2, zB = hz - d / 2 + dB / 2;
    g.box(hx, 0, hz, w, H, d, wall, 0x8b8f92);
    shedRoof(g, hx, H, zF, w, dF, 1.7, roofG, 1, 0.45); shedRoof(g, hx, H, zB, w, dB, 0.8, roofG, -1, 0.4);
    if (c.fine) winD(c, 1, hx, H + 0.9, zB + dB / 2, w - 1.4, 0.6, 0.4);                               // 高窓
    front2(hx, w, 2.8, roofG, bal === 2 ? 2 : -1); sides(w, 2, 2.8); wh = H; roofY = H + 1.7;
  }
  hDetail(c, hx, hz, w, d, wh, roofY, solar); g.wallMat = sv0;
  return garage;
}

/** 戸建ての区画（4 戸）。v86：塀は 4 通り（ブロック塀・生け垣・アルミのフェンス・塀なし）、カーポート、自転車、門柱 */
export function modelHouseLot(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b2a4);
  const g = c.g;
  for (const [qx, qz] of [[-7.1, 7.1], [7.1, 7.1], [-7.1, -7.1], [7.1, -7.1]]) {
    const hx = qx + (c.rnd() - 0.5) * 0.8, hz = qz - 1.2;
    const garage = house1(c, hx, hz); // 都市型 3 階建ては車庫が家の中にあるので、外の駐車場は作らない
    const fz = qz + 6.3, fence = c.rnd(), k = (n: number) => dh(qx + g.ox, qz + g.oz, n);
    // 塀・生け垣・フェンス
    if (fence < 0.32) { const bc = pick(c, [0xcfcac0, 0xb8b2a6, 0xd8d2c4, 0x9a968c]); g.box(qx - 3.6, 0, fz, 6.4, 0.95, 0.16, bc); g.box(qx + 5.6, 0, fz, 2.2, 0.95, 0.16, bc);
      if (DETAIL.hi) { g.box(qx - 3.6, 0.95, fz, 6.5, 0.06, 0.22, shadeC(bc, 0.85)); g.box(qx + 5.6, 0.95, fz, 2.3, 0.06, 0.22, shadeC(bc, 0.85)); } } // ブロック塀と笠木
    else if (fence < 0.62) { hedge(c, qx - 3.6, fz, 6.4, 0.6, 1.1); hedge(c, qx + 5.6, fz, 2.2, 0.6, 1.1); }
    else if (fence < 0.86) { const fc = pick(c, [0x4a4e52, 0x8a7a6a, 0xb8bcc0]); for (const [x, wd] of [[qx - 3.6, 6.4], [qx + 5.6, 2.2]]) { g.box(x, 0, fz, wd, 0.5, 0.18, 0xcfcac0); g.box(x, 0.5, fz, wd, 0.75, 0.04, fc); if (c.fine) g.box(x, 1.22, fz, wd, 0.05, 0.08, fc); } } // 低いブロックにアルミのフェンス
    else g.box(qx, 0, fz, 13.6, 0.15, 0.2, 0xbab5aa);                                                       // 塀なし（縁石だけ）
    if (DETAIL.hi && fence < 0.86) { g.box(qx - 0.25, 0, fz, 0.45, 1.3, 0.45, [0xd8d2c4, 0x8a7d70, 0x5a5e62][Math.floor(k(8) * 3)]); g.box(qx - 0.25, 1.3, fz, 0.55, 0.06, 0.55, 0x6a6e72); } // 門柱
    // 駐車スペース
    const pc = c.rnd() < 0.62, cp = c.rnd() < 0.3;
    slab(c, qx + 3.1, qz + 4.2, 2.9, 4.6, 0xa8a7a2, 0.06); // 駐車スペース（3 階建てでは車庫の前の通路）
    if (pc && !garage) car(c, qx + 3.1, qz + 4.2, false);
    if (cp && !garage) { g.box(qx + 3.1, 2.25, qz + 4.2, 3.1, 0.1, 5.0, k(5) < 0.5 ? 0xd0d4d6 : 0x9fb0b8); g.cyl(qx + 1.7, 0, qz + 2.0, 0.06, 2.25, 0x9a9da0, 4); g.cyl(qx + 1.7, 0, qz + 6.4, 0.06, 2.25, 0x9a9da0, 4); }
    if (DETAIL.hi && k(6) < 0.5) { const bc = [0x2b2f33, 0x9a3a32, 0x356b8c, 0xdadad6][Math.floor(k(7) * 4)]; for (const z of [2.5, 3.5]) g.box(qx - 0.9, 0, qz + z, 0.05, 0.62, 0.62, 0x1a1a1a); g.box(qx - 0.9, 0.45, qz + 3.0, 0.07, 0.5, 1.0, bc); } // 自転車
    // 庭
    slab(c, qx - 3.3, qz + 4.4, 5.6, 3.4, 0x7fae62, 0.07);
    const r = c.rnd();
    if (r < 0.45) tree(c, qx - 5.0, qz + 4.6, 0.62, r < 0.05 ? 2 : r < 0.09 ? 3 : 0);
    if (c.rnd() < 0.7) bush(c, qx - 2.2, qz + 5.2, 0.8, c.rnd() < 0.25 ? 0xd98fa6 : undefined);
    if (c.rnd() < 0.5) bush(c, qx - 3.6, qz + 3.3, 0.7);
  }
  g.box(0, 0, -0.2, 0.14, 1.3, 27, 0xc9c4ba); // 隣地境界のブロック塀
  g.box(0, 0, 0, 27, 1.3, 0.14, 0xc9c4ba);
}

/** ベランダの暮らし（v50・細部表示のとき）：各戸にエアコンの室外機、ときどき洗濯物の竿と服、鉢植え */
function balconyLife(c: Ctx, x0: number, x1: number, y: number, fz: number, units: number, depth: number): void {
  if (!c.fine) return; const g = c.g, bw = (x1 - x0) / units;
  for (let u = 0; u < units; u++) { const cx = x0 + bw * (u + 0.5), k = (n: number) => dh(cx + g.ox, y + fz + g.oz, n);
    g.box(cx - bw * 0.3, y + 0.02, fz + depth * 0.45, 0.8, 0.6, 0.3, 0xe4e6e4); g.box(cx - bw * 0.3, y + 0.32, fz + depth * 0.45 + 0.16, 0.42, 0.42, 0.02, 0x50565c); // 室外機と羽根
    if (k(1) < 0.45) { g.box(cx + 0.2, y + 1.85, fz + depth * 0.55, bw * 0.75, 0.04, 0.04, 0xc8ccd0); const cols = [0xf6f6f2, 0x6a8ac8, 0xe8a0a8, 0x3a3e44, 0xf2d27a, 0x8ac8a0];
      for (let j = 0; j < 3; j++) g.box(cx - bw * 0.2 + j * bw * 0.22, y + 1.15, fz + depth * 0.55, bw * 0.16, 0.65, 0.03, cols[Math.floor(k(2 + j) * 6)]); } // 洗濯物
    if (k(6) < 0.3) { g.cyl(cx + bw * 0.35, y + 0.02, fz + depth * 0.8, 0.18, 0.3, 0x9a6a4a, 6); g.blob(cx + bw * 0.35, y + 0.55, fz + depth * 0.8, 0.3, 0.3, 0.3, 0x4f8a3c, 5); } } // 鉢植え
}
/** 鉄骨の外階段（v86）：x0 から +x へ（dir = -1 なら -x へ）長さ len で y0 から y1 へ上がる。高品質では段を 1 段ずつ */
function steelStair(c: Ctx, x0: number, z: number, y0: number, y1: number, len: number, w: number, dir: number, col = 0x6b7076): void {
  const g = c.g, x1 = x0 + dir * len, h = y1 - y0, Q = (a: V, b: V, cc: V, d: V, k: number, sh = 1) => (dir > 0 ? g.quad(a, b, cc, d, k, sh) : g.quad(d, cc, b, a, k, sh));
  for (const sz of [-1, 1]) { const zz = z + sz * w / 2; Q([x0, y0 - 0.25, zz], [x1, y1 - 0.25, zz], [x1, y1 + 0.05, zz], [x0, y0 + 0.05, zz], col, sz > 0 ? 1 : 0.8); } // ささら桁
  if (c.fine && DETAIL.hi) { const n = Math.max(3, Math.round(h / 0.2)); for (let i = 0; i < n; i++) g.box(x0 + dir * len * (i + 0.5) / n, y0 + h * i / n, z, len / n + 0.02, 0.05, w - 0.1, 0x8a8f94); }
  else { Q([x0, y0, z + w / 2], [x1, y1, z + w / 2], [x1, y1, z - w / 2], [x0, y0, z - w / 2], 0x8a8f94); Q([x0, y0 - 0.2, z - w / 2], [x1, y1 - 0.2, z - w / 2], [x1, y1 - 0.2, z + w / 2], [x0, y0 - 0.2, z + w / 2], col, 0.6); }
  if (c.fine) { const zz = z + w / 2; g.quad(dir > 0 ? [x0, y0 + 0.95, zz] : [x1, y1 + 0.95, zz], dir > 0 ? [x1, y1 + 0.95, zz] : [x0, y0 + 0.95, zz], dir > 0 ? [x1, y1 + 1.0, zz] : [x0, y0 + 1.0, zz], dir > 0 ? [x0, y0 + 1.0, zz] : [x1, y1 + 1.0, zz], col); } // 手すり
}
/** 集合住宅（アパート）。v86：4 つの型（RC の 3〜4 階・木造 2 階のハイツと外階段・軽量鉄骨 3 階の片流れ・メゾネットの長屋）。外壁の素材も選ぶ */
export function modelApartment(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xaaa8a2);
  const g = c.g, type = Math.floor(c.rnd() * 4), w = 23, bz = -7.2, sv0 = g.wallMat;
  if (type === 0) { // RC の 3〜4 階（南にベランダ、北に外廊下、端に階段室）
    const floors = c.rnd() < 0.55 ? 3 : 4, fh = 2.9, H = floors * fh, d = 9.2, fz = bz + d / 2, units = 5;
    const m = hmat(c, [30, 30, 40, 0, 0]), wall = pick(c, [0xe6e1d6, 0xd8d2c4, 0xcdd3d6, 0xe9e4da, 0xc9b9a6, 0xdfd7c8]);
    const panel = pick(c, [0xf4f1ea, 0x9aa7ad, 0x6f7f8a, 0xb08a6a, 0xe7e2d8, 0x8a6f5a]);
    g.wallMat = m.mat === 9 ? 6 : m.mat; g.box(0, 0, bz, w, H, d, wall, 0x9a9c9c); g.wallMat = sv0;
    g.box(0, H, bz, w + 0.4, 0.45, d + 0.4, 0xcfcfca, 0x8f9192);                     // パラペット
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      g.box(0, y + (f ? -0.16 : 0), fz + 0.75, w, 0.16, 1.5, 0xd8d6d0);              // ベランダ床
      g.box(0, y + 0.05, fz + 1.48, w, 1.05, 0.08, panel);                           // 手すり壁
      if (c.fine) g.box(0, y + 1.1, fz + 1.48, w + 0.04, 0.06, 0.14, 0xb8bcc0);     // 笠木
      for (let u = 0; u <= units; u++) g.box(-w / 2 + w * u / units, y, fz + 0.75, 0.1, fh - 0.2, 1.5, 0xe9e7e1);
      winRow(c, 0, -w / 2, w / 2, y + 0.15, fz, units, 2.3, 2.0, 0.5); balconyLife(c, -w / 2, w / 2, y + (f ? 0 : 0.16), fz, units, 1.5);
      g.box(0, y + (f ? -0.16 : 0), bz - d / 2 - 0.65, w, 0.16, 1.3, 0xd8d6d0);       // 北側の外廊下
      g.box(0, y + 0.05, bz - d / 2 - 1.28, w, 1.1, 0.08, 0xe1dfd8);
      for (let u = 0; u < units; u++) { const x = -w / 2 + w * (u + 0.3) / units; g.box(x, y + 0.05, bz - d / 2 - 0.06, 0.9, 2.0, 0.08, 0x5a646b); win(c, 1, x + 1.6, y + 1.0, bz - d / 2, 0.9, 0.9, 0.3); }
    }
    g.box(w / 2 + 1.5, 0, bz - 2.2, 3.0, H + 1.2, 5.0, 0xd0cec8, 0x9a9c9c);          // 階段室
    winRow(c, 2, bz - 4.2, bz - 0.2, 1.5, w / 2 + 3.0, 1, 0.9, H - 2.5, 0.8);
    g.cyl(-6, H + 0.45, bz, 1.1, 1.6, 0xe9eef0, 8); g.box(4, H + 0.45, bz + 1, 1.4, 0.8, 0.9, 0xe2e2de); g.box(6, H + 0.45, bz - 1, 1.4, 0.8, 0.9, 0xe2e2de);
    if (c.fine) for (const sx of [-1, 1]) g.box(sx * (w / 2 + 0.08), 0, fz + 0.1, 0.14, H, 0.14, 0x8a8e92); // 竪どい
  } else if (type === 1) { // 木造 2 階のハイツ（切妻屋根、北に外廊下と鉄骨の外階段）
    const fh = 2.8, H = 5.6, d = 8.4, w2 = 20, fz = bz + d / 2, units = 4, m = hmat(c, [55, 45, 0, 0, 0]), roof = pick(c, SLATE);
    H_WALL = m.wall; g.wallMat = m.mat; g.box(-1.5, 0, bz, w2, H, d, m.wall); g.gable(-1.5, H, bz, w2, d, 1.6, roof, 'x', m.wall, 0.5); g.wallMat = sv0;
    g.box(-1.5, 0, bz, w2 + 0.08, 0.42, d + 0.08, 0x8f8d86);                      // 基礎
    for (let f = 0; f < 2; f++) { const y = f * fh;
      for (let u = 0; u < units; u++) { const x = -1.5 - w2 / 2 + w2 * (u + 0.5) / units;
        hwin(c, x + 0.6, y + 0.3, fz, 1.8, 1.8, { sb: f === 1 }); win(c, 0, x - 1.5, y + 1.0, fz, 0.8, 1.0, 0.4);
        if (f === 1) hBalcony(c, x + 0.3, y, fz, 4.2, 0.9, 1, m.wall); else if (c.fine) g.box(x + 0.6, 0, fz + 0.8, 4.0, 0.06, 1.4, 0x7fae62); // 2 階のベランダ、1 階は専用庭
        g.box(x - 0.6, y + 0.05, bz - d / 2 - 0.06, 0.85, 2.0, 0.08, pick(c, [0x5a646b, 0x8a6448, 0xe9e7e1])); win(c, 1, x + 1.0, y + 1.1, bz - d / 2, 0.8, 0.8, 0.3); } }
    if (c.fine) for (let u = 1; u < units; u++) g.box(-1.5 - w2 / 2 + w2 * u / units, fh, fz + 0.45, 0.06, 1.6, 0.9, 0xe9e7e1); // ベランダの隔て板
    g.box(-1.5, fh - 0.16, bz - d / 2 - 0.65, w2, 0.16, 1.3, 0x9a9ea2); g.box(-1.5, fh + 1.0, bz - d / 2 - 1.28, w2, 0.06, 0.06, 0x6b7076); // 2 階の外廊下と手すり
    if (c.fine) g.box(-1.5, fh, bz - d / 2 - 1.28, w2, 0.95, 0.02, 0x7a7f84);
    for (let i = 0; i < 5; i++) g.box(-1.5 - w2 / 2 + w2 * i / 4, 0, bz - d / 2 - 1.25, 0.12, fh, 0.12, 0x6b7076); // 廊下の柱
    steelStair(c, -1.5 + w2 / 2 + 2.6, bz - d / 2 - 0.65, 0, fh, 2.6, 1.0, -1);
    if (c.fine) { g.box(-1.5 + w2 / 2 + 0.6, 0.9, bz - 1, 0.5, 1.4, 1.6, 0x8a8f94); g.box(-1.5 - w2 / 2 - 0.4, 0, bz + 2, 0.5, 1.2, 2.4, 0xb8bcc0); } // 郵便受けと物置
  } else if (type === 2) { // 軽量鉄骨の 3 階（片流れ屋根、端に外階段、アルミの手すりのベランダ）
    const floors = 3, fh = 2.85, H = floors * fh, d = 8.8, w2 = 21, x0 = -1, fz = bz + d / 2, units = 4, m = hmat(c, [0, 60, 0, 40, 0]);
    H_WALL = m.wall; g.wallMat = m.mat; g.box(x0, 0, bz, w2, H, d, m.wall, 0x8b8f92); shedRoof(g, x0, H, bz, w2, d, 1.0, pick(c, GALV), -1, 0.4); g.wallMat = sv0;
    for (let f = 0; f < floors; f++) { const y = f * fh;
      if (f) for (let u = 0; u < units; u++) hBalcony(c, x0 - w2 / 2 + w2 * (u + 0.5) / units, y, fz, w2 / units - 0.15, 1.1, 1 + ((u + f) & 1) * 0, m.wall);
      winRow(c, 0, x0 - w2 / 2, x0 + w2 / 2, y + 0.2, fz, units, 1.8, 1.9, 0.5);
      if (f) balconyLife(c, x0 - w2 / 2, x0 + w2 / 2, y, fz, units, 1.1);
      for (let u = 0; u < units; u++) { const x = x0 - w2 / 2 + w2 * (u + 0.35) / units; g.box(x, y + 0.05, bz - d / 2 - 0.06, 0.85, 2.0, 0.08, 0x4f565c); win(c, 1, x + 1.6, y + 1.1, bz - d / 2, 0.8, 0.8, 0.3); }
      if (f) { g.box(x0, y - 0.16, bz - d / 2 - 0.6, w2, 0.16, 1.2, 0x9a9ea2); g.box(x0, y, bz - d / 2 - 1.17, w2, 1.05, 0.06, pick(c, [0xd8d6d0, 0x8a9094])); } }
    steelStair(c, x0 + w2 / 2 + 0.7, bz - d / 2 + 0.5, 0, fh, 3.4, 1.1, 1); steelStair(c, x0 + w2 / 2 + 4.1, bz - d / 2 - 1.0, fh, fh * 2, 3.4, 1.1, -1);
    g.box(x0 + w2 / 2 + 2.4, fh - 0.16, bz - d / 2 - 0.25, 4.2, 0.16, 2.6, 0x9a9ea2); g.box(x0 + w2 / 2 + 2.4, fh * 2 - 0.16, bz - d / 2 - 0.25, 4.2, 0.16, 2.6, 0x9a9ea2); // 踊り場
    for (const [sx, sz] of [[0.4, 1.0], [4.4, 1.0], [0.4, -1.5], [4.4, -1.5]]) g.box(x0 + w2 / 2 + sx, 0, bz - d / 2 + sz, 0.14, fh * 2, 0.14, 0x6b7076);
  } else { // メゾネットの長屋（2 階建てが 4 戸つながり、戸ごとに妻入りの屋根と玄関と小さな庭）
    const d = 9.0, H = 5.4, units = 4, uw = w / units, fz = bz + d / 2, m = hmat(c, [40, 40, 20, 0, 0]), roof = pick(c, SLATE);
    for (let u = 0; u < units; u++) { const x = -w / 2 + uw * (u + 0.5), wall = u & 1 ? shadeC(m.wall, 0.92) : m.wall; H_WALL = wall; g.wallMat = m.mat;
      g.box(x, 0, bz, uw, H, d, wall); g.gable(x, H, bz, uw, d, 1.9, roof, 'z', wall, 0.3); g.wallMat = sv0;
      hEntry(c, x - uw / 4, fz, pick(c, DOORS), roof, u & 1 ? 2 : 0); hwin(c, x + uw / 5, 0.5, fz, 2.0, 1.8, { sb: true }); hwin(c, x, 3.1, fz, 2.4, 1.3, { sb: true });
      win(c, 1, x, 1.0, bz - d / 2, 1.6, 1.0, 0.4); win(c, 1, x, 3.5, bz - d / 2, 1.6, 1.0, 0.4);
      if (c.fine) { g.box(x + uw / 5, 0, fz + 1.6, uw - 1.6, 0.9, 0.12, 0xcfcac0); g.box(x + uw / 5, 0.04, fz + 0.8, uw - 1.6, 0.06, 1.5, 0x7fae62); } } // 小さな庭と塀
    g.box(0, 0, bz, w + 0.08, 0.42, d + 0.08, 0x8f8d86);
  }
  // 駐車場
  slab(c, -1.5, 7.4, 22, 9.8, 0x4c4f53, 0.08);
  parkingLines(c, -12, 6.2, 5.2, 5.0, 7);
  for (let i = 0; i < 7; i++) if (c.rnd() < 0.6) car(c, -12 + 18.2 * (i + 0.5) / 7, 5.2, false);
  // 自転車置き場とごみ集積所
  g.box(11.2, 2.0, 6.2, 3.4, 0.1, 5.6, 0xb9c2c6); for (const z of [3.6, 8.8]) g.cyl(12.7, 0, z, 0.06, 2.0, 0x8b9094, 4);
  for (let i = 0; i < 5; i++) g.box(10.4 + (i % 2) * 0.5, 0, 4.2 + i * 0.9, 1.5, 0.95, 0.12, pick(c, [0x2b2f33, 0x9a3a32, 0x356b8c, 0xdadad6]));
  g.box(12.6, 0, 12.4, 2.0, 1.0, 1.6, 0x3d7fa6);                                   // ごみ集積所の青いネット
  hedge(c, -13.6, -6, 0.7, 14); tree(c, -12.6, 12.4, 0.75); if (c.rnd() < 0.6) tree(c, 12.4, -12.6, 0.7);
}

/** マンション。v86：3 つの型（タイルと縦のフィン・白い吹付けで横の帯を強調し上の階を段々に下げる・打放しとタイルの 2 棟つなぎ） */
export function modelMansion(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb4b1aa);
  const g = c.g, floors = 8 + Math.floor(c.rnd() * 4), fh = 3.0, H = floors * fh, type = Math.floor(c.rnd() * 3), sv0 = g.wallMat;
  const tile = type === 1 ? pick(c, [0xf2f0ea, 0xe8e4da, 0xdcdad4, 0xece6da]) : pick(c, [0xb7a999, 0x8f7f72, 0xd9d6cf, 0x6f7478, 0xc4b6a2, 0x9c5a44]);
  const fin = pick(c, [0x4a4d52, 0xf0eee8, 0x6b5a4c]);
  const rail = pick(c, [0xa9c3cf, 0xf2f2ee, 0x8fa3ad]);
  const w = 20, d = 13, bz = -4.5, fz = bz + d / 2, units = 4;
  const sb = type === 1 ? Math.min(3, floors - 7) : 0; // 上の何階を下げるか
  g.wallMat = type === 1 ? 8 : 6;
  if (type === 2) { g.box(-w / 4, 0, bz, w / 2, H, d, tile, 0x8e9092); g.wallMat = 7; g.box(w / 4, 0, bz, w / 2, H - fh, d, 0xb8b6b0, 0x8e9092); }
  else { g.box(0, 0, bz, w, H - sb * fh, d, tile, 0x8e9092); if (sb) g.box(0, H - sb * fh, bz - 1.5, w, sb * fh, d - 3, tile, 0x8e9092); }
  g.wallMat = sv0;
  const top = (x: number) => (type === 2 && x > 0 ? H - fh : H);
  if (type === 2) { g.box(-w / 4, H, bz, w / 2 + 0.5, 0.6, d + 0.5, fin, 0x8e9092); g.box(w / 4, H - fh, bz, w / 2 + 0.3, 0.6, d + 0.3, 0xd8d6d0, 0x8e9092); }
  else { g.box(0, H, bz - (sb ? 1.5 : 0), w + 0.5, 0.6, d + 0.5 - (sb ? 3 : 0), fin, 0x8e9092); }
  if (type === 0) for (const x of [-w / 2 - 0.2, 0, w / 2 + 0.2]) g.box(x, 0, fz + 0.9, 0.5, H + 0.6, 1.9, fin);  // 縦のフィン
  for (let f = 1; f < floors; f++) {
    const y = f * fh, back = type === 1 && f >= floors - sb ? 3 : 0, fzz = fz - back;
    if (type === 2 && f >= floors - 1) { g.box(-w / 4, y - 0.18, fzz + 0.9, w / 2, 0.18, 1.8, 0xdedcd6); g.box(-w / 4, y, fzz + 1.76, w / 2 - 0.6, 1.1, 0.07, rail); winRow(c, 0, -w / 2, 0, y + 0.1, fzz, 2, 2.9, 2.2, 0.5); continue; }
    if (type === 1) { g.box(0, y - 0.22, fzz + 0.95, w + 0.6, 0.22, 1.9, 0xf4f2ec); g.box(0, y, fzz + 1.85, w + 0.6, 0.62, 0.12, 0xf4f2ec); g.box(0, y + 0.62, fzz + 1.85, w + 0.5, 0.5, 0.04, 0xb8c8cc); } // 白い帯（スラブと腰壁）とガラスの手すり
    else { g.box(0, y - 0.18, fzz + 0.9, w, 0.18, 1.8, 0xdedcd6); g.box(-w / 4, y, fzz + 1.76, w / 2 - 0.6, 1.1, 0.07, rail); g.box(w / 4, y, fzz + 1.76, w / 2 - 0.6, 1.1, 0.07, rail); }
    if (c.fine) for (let u = 1; u < units; u++) if (u !== 2 || type !== 0) g.box(-w / 2 + w * u / units, y, fzz + 0.9, 0.06, 2.2, 1.7, 0xe9e7e1); // 隔て板
    winRow(c, 0, -w / 2, w / 2, y + 0.1, fzz, units, 2.9, 2.2, 0.5); balconyLife(c, -w / 2 + 0.3, w / 2 - 0.3, y, fzz, units, 1.8);
    if (!back && !(type === 2 && f >= floors - 1)) { winRow(c, 2, bz - d / 2, bz + d / 2, y + 0.9, w / 2, 2, 1.3, 1.3, 0.4); winRow(c, 3, bz - d / 2, bz + d / 2, y + 0.9, -w / 2, 2, 1.3, 1.3, 0.4); }
    g.box(0, y - 0.18, bz - d / 2 - 0.8, w, 0.18, 1.6, 0xdedcd6); g.box(0, y, bz - d / 2 - 1.56, w, 1.15, 0.08, 0xe6e3dc);   // 開放廊下
    winRow(c, 1, -w / 2, w / 2, y + 1.1, bz - d / 2, units, 0.9, 0.9, 0.3);
  }
  g.wallMat = type === 2 ? 7 : 1; g.box(0, 0, bz - d / 2 - 2.6, 5.2, H + 3.2, 3.6, 0xcfcdc7, 0x8e9092); g.wallMat = sv0; // エレベーター・階段コア
  winRow(c, 1, -2, 2, 3, bz - d / 2 - 4.4, 1, 1.0, H - 4, 0.9);
  const ty = top(-1);
  g.box(-5, ty + 0.6, bz, 4.5, 2.6, 4.5, 0xcfcdc7, 0x8e9092); g.cyl(-5, ty + 3.2, bz, 0.07, 4.5, 0x8b8f93, 4);
  if (type === 1) { for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) g.box(4 + dx, ty + 0.6, bz - 3 + dz, 0.15, 1.6, 0.15, 0x7a7e82); g.box(4, ty + 2.2, bz - 3, 2.8, 1.8, 2.8, 0xc9ced2); } // 高架水槽
  else g.cyl(type === 2 ? -6 : 4, ty + 0.6, type === 2 ? bz + 3.5 : bz - 2, 1.3, 2.0, 0xe9eef0, 8);
  if (c.fine) { const nAC = 6; for (let i = 0; i < nAC; i++) g.box(-8 + i * 1.6, ty + 0.6, bz + 4.5, 1.0, 0.7, 0.7, 0xd9dcdc, 0xb8bcbe); // 屋上の室外機
    for (const sx of [-1, 1]) g.box(sx * (w / 2 + 0.1), 0, fz + 0.1, 0.16, H, 0.16, 0x8a8e92); } // 竪どい
  // エントランス
  g.box(0, 0, fz + 2.6, 9, 3.6, 3.4, type === 1 ? 0x8a7a6a : 0x4f4a45, 0x3f3b37);
  win(c, 0, 0, 0.2, fz + 4.3, 5.0, 2.9, 1, 0xd9e6ea);
  g.box(0, 3.6, fz + 4.9, 11, 0.25, 2.4, fin);
  if (c.fine) { g.box(-3.6, 2.3, fz + 4.32, 1.8, 0.5, 0.06, 0x2a2c2e); g.box(-3.6, 2.4, fz + 4.36, 1.4, 0.08, 0.02, 0xd8c890); for (const x of [-1.6, 1.6]) g.box(x, 3.3, fz + 5.6, 0.3, 0.1, 0.3, 0xf2eedc); } // 館名板とダウンライト
  g.box(-7.4, 0, fz + 3.4, 4.6, 0.7, 2.6, 0x8d8780); bush(c, -8.2, fz + 3.4, 1.0); bush(c, -6.6, fz + 3.5, 0.9);
  g.box(7.4, 0, fz + 3.4, 4.6, 0.7, 2.6, 0x8d8780); bush(c, 8.2, fz + 3.4, 1.0); bush(c, 6.6, fz + 3.5, 0.9);
  tree(c, -11.5, 11.5, 1.0); tree(c, 11.5, 11.5, 0.95); tree(c, -12.2, -12, 0.9);
  slab(c, 11.3, -2, 4.6, 14, 0x4c4f53, 0.08); for (let i = 0; i < 3; i++) if (c.rnd() < 0.7) car(c, 11.3, -6.5 + i * 4.6, true);
  slab(c, 0, 10.2, 10, 6.4, 0xc8c2b6, 0.07);
}

// ---- 店舗 ----
/** 店の種類ごとの店先（v64）：のれん・ちょうちん・サインポール・花や野菜の台・テラス席など */
function storefront(c: Ctx, lab: string, x: number, fz: number, w: number): void {
  const g = c.g;
  if (lab === '食堂' || lab === '居酒屋' || lab === '和菓子') {
    const col = lab === '和菓子' ? 0x6b3a5a : lab === '居酒屋' ? 0x2a2e3a : 0x27405e;
    for (let i = 0; i < 4; i++) g.box(x + 2.9 + (i - 1.5) * 0.42, 1.75, fz + 0.2, 0.38, 0.8, 0.04, col); // のれん
    if (lab !== '和菓子') for (const sx of [-1, 1]) chochin(c, x + 4.0 + sx * 1.0, 1.95, fz + 0.45); // 赤ちょうちん（夜は灯る）
    if (lab === '居酒屋') g.box(x - 3.6, 0, fz + 0.6, 0.6, 1.2, 0.5, 0x8a6448); // 立て看板
  } else if (lab === '理容') { // 赤・白・青のサインポール
    const px = x + 5.0; g.box(px, 1.0, fz + 0.3, 0.42, 0.12, 0.42, 0xd9d9d4);
    for (let i = 0; i < 6; i++) g.cyl(px, 1.12 + i * 0.22, fz + 0.3, 0.17, 0.22, [0xd8322a, 0xf6f6f2, 0x2a4fa0][i % 3], 8);
    g.cyl(px, 2.44, fz + 0.3, 0.2, 0.2, 0xf0f0ec, 8);
  } else if (lab === '生花' || lab === '八百屋') { // 店先の台（ひな壇）
    for (let r = 0; r < 2; r++) {
      g.box(x - 1.2, 0, fz + 1.1 + r * 0.6, 6.0, 0.9 - r * 0.4, 0.55, 0x8a6448);
      for (let i = 0; i < 7; i++) {
        const col = lab === '生花' ? [0xe07a8c, 0xf2d24a, 0xf6f6f2, 0xd8402e, 0xb07ad0, 0xf29a4a, 0xe07a8c][(i + r * 3) % 7] : [0xd8402e, 0x4f8a3c, 0xf29a4a, 0xe8c84a, 0x6aa352, 0x7a2f4a, 0xd8402e][(i + r * 2) % 7];
        g.box(x - 4.0 + i * 0.8, 0.9 - r * 0.4, fz + 1.1 + r * 0.6, 0.6, 0.28, 0.42, col);
      }
    }
  } else if (lab === 'カフェ') { // テラス席とパラソル
    for (const tx of [x - 3.4, x + 0.8]) { g.cyl(tx, 0, fz + 2.6, 0.4, 0.72, 0xf2ead8, 6); g.cyl(tx, 0.72, fz + 2.6, 0.04, 1.4, 0x8b8f93, 4); g.cyl(tx, 2.0, fz + 2.6, 1.3, 0.45, 0x3f7a5a, 8, undefined, 0.05); }
    g.box(x - 1.3, 0, fz + 0.5, 0.5, 1.0, 0.5, 0x3a2a20);
  } else if (lab === '書店') { // 雑誌の棚
    g.box(x - 3.0, 0, fz + 0.45, 2.6, 1.3, 0.6, 0x8a6448);
    for (let i = 0; i < 6; i++) g.box(x - 4.0 + i * 0.4, 0.75, fz + 0.78, 0.34, 0.5, 0.04, [0xd8402e, 0x2a4fa0, 0xf2d24a, 0x3f7a5a, 0xf6f6f2, 0xe07a8c][i]);
  } else if (lab === 'クリーニング') { // 青い帯と「受付」の小窓
    g.box(x, 2.45, fz + 0.04, w - 0.2, 0.3, 0.06, 0x2a6fb0);
  } else if (lab === 'くすり') { // 店先の幟とかご
    g.box(x - 4.6, 0, fz + 0.8, 1.6, 0.8, 0.8, 0xf2d24a); g.cyl(x + 5.2, 0, fz + 0.6, 0.04, 3.0, 0x8b8f93, 4); g.box(x + 5.45, 1.0, fz + 0.6, 0.5, 1.9, 0.03, 0x2a8a5a);
  }
}
export function modelShop(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb3b0a8);
  const g = c.g;
  const labels = ['商店', '食堂', 'くすり', '理容', '生花', 'カフェ', '書店', '居酒屋', 'クリーニング', '八百屋', '和菓子'];
  const i0 = Math.floor(c.rnd() * labels.length);
  for (let k = 0; k < 2; k++) {
    const x = -6.6 + k * 13.2, w = 11.6, d = 10.5, bz = 1.2, fz = bz + d / 2, h = 6.4 + c.rnd() * 1.4;
    const wall = pick(c, [0xd7cbb5, 0xb9c4c9, 0xe4dccb, 0x8a9a8f, 0xc9a27c, 0xe8e3d8, 0x9f8f80]);
    const aw = pick(c, [0xb5372c, 0x2f6b4f, 0x27405e, 0xd98a2b, 0x7a2f4a]);
    // v86：店の建物は 4 つの型（RC の店舗併用住宅・看板建築・木造 2 階に下屋・平屋にテントのひさし）
    const ty = Math.floor(c.rnd() * 4), sv0 = g.wallMat, lab = labels[(i0 + k * 2) % labels.length];
    if (ty === 0) { g.wallMat = pick(c, [6, 8, 4]); g.box(x, 0, bz, w, h, d, wall, 0x8f9192); g.wallMat = sv0; g.box(x, h, bz, w + 0.2, 0.5, d + 0.2, 0xc9c6bf, 0x8f9192);
      g.box(x, 2.85, fz + 0.75, w - 0.4, 0.14, 1.5, aw); g.box(x, 2.6, fz + 1.5, w - 0.4, 0.3, 0.06, aw);
      winRow(c, 0, x - w / 2, x + w / 2, h - 2.6, fz, 2, 1.8, 1.3, 0.6); if (c.fine) for (const sx of [-1, 1]) hBalcony(c, x + sx * w / 4, h - 3.0, fz, 2.6, 0.5, 3, wall);
      g.box(x - 2, h + 0.5, bz - 1, 1.3, 0.8, 0.9, 0xe2e2de); if (c.rnd() < 0.5) g.cyl(x + 2.5, h + 0.5, bz + 1, 0.8, 1.3, 0xe9eef0, 7);
    } else if (ty === 1) { // 看板建築：正面だけ高い平らな壁（銅板やモルタル）、奥は切妻
      const fc = pick(c, [0x5f8a7a, 0xd8d0c0, 0x8a9aa0, 0xc9b49a]); H_WALL = wall; g.box(x, 0, bz - 0.3, w - 0.4, h - 0.8, d - 0.6, wall); g.gable(x, h - 0.8, bz - 0.3, w - 0.4, d - 0.6, 1.8, pick(c, KAWARA), 'z', wall, 0.3);
      g.wallMat = fc === 0x5f8a7a ? 5 : 8; g.box(x, 0, fz - 0.3, w, h + 1.1, 0.6, fc); g.wallMat = sv0; g.box(x, h + 1.1, fz - 0.3, w + 0.3, 0.3, 0.8, shadeC(fc, 0.8)); // 正面の壁と軒蛇腹
      if (c.fine) g.box(x, h - 0.2, fz + 0.02, w - 0.6, 0.12, 0.06, shadeC(fc, 0.85));
      g.box(x, 2.85, fz + 0.75, w - 0.4, 0.14, 1.5, aw); g.box(x, 2.6, fz + 1.5, w - 0.4, 0.3, 0.06, aw);
      winRow(c, 0, x - w / 2, x + w / 2, h - 2.6, fz, 3, 1.2, 1.4, 0.6);
    } else if (ty === 2) { // 木造 2 階：店先に瓦の下屋、2 階は窓に手すり
      const hh = 5.8, kw = pick(c, KAWARA); H_WALL = wall; g.wallMat = pick(c, [8, 10, 9]); g.box(x, 0, bz, w, hh, d, wall); g.gable(x, hh, bz, w, d, 1.9, kw, 'x', wall, 0.5); g.wallMat = sv0;
      shedRoof(g, x, 2.7, fz + 0.7, w, 1.4, 0.45, kw, 1, 0.25, false, false);
      winRow(c, 0, x - w / 2, x + w / 2, 3.5, fz, 2, 2.2, 1.3, 0.6); if (c.fine) for (const sx of [-1, 1]) g.box(x + sx * w / 4, 3.5, fz + 0.12, 2.4, 0.7, 0.05, 0x5a5e5a);
    } else { // 平屋：陸屋根にテントのひさし
      const hh = 4.4; g.wallMat = pick(c, [8, 4]); g.box(x, 0, bz, w, hh, d, wall, 0x8f9192); g.wallMat = sv0; g.box(x, hh, bz, w + 0.2, 0.4, d + 0.2, shadeC(wall, 0.85), 0x8f9192);
      g.quad([x - w / 2 + 0.2, 2.5, fz + 1.6], [x + w / 2 - 0.2, 2.5, fz + 1.6], [x + w / 2 - 0.2, 3.4, fz + 0.05], [x - w / 2 + 0.2, 3.4, fz + 0.05], aw); g.quad([x + w / 2 - 0.2, 2.5, fz + 1.6], [x - w / 2 + 0.2, 2.5, fz + 1.6], [x - w / 2 + 0.2, 3.4, fz + 0.05], [x + w / 2 - 0.2, 3.4, fz + 0.05], shadeC(aw, 0.6));
      g.box(x, 2.25, fz + 1.6, w - 0.4, 0.28, 0.04, aw);
      g.box(x - 2, hh + 0.4, bz - 1, 1.3, 0.8, 0.9, 0xe2e2de);
    }
    win(c, 0, x - 1.2, 0.35, fz, 6.4, 2.35, 0.95, 0xcfdde2);
    if (c.fine) for (let i = 1; i < 4; i++) g.box(x - 1.2 - 3.2 + i * 1.6, 0.35, fz + 0.1, 0.07, 2.35, 0.06, 0x8a9094); // ショーウィンドウの方立て
    g.box(x + 4.0, 0, fz + 0.06, 1.1, 2.2, 0.1, 0x3a3f44);
    sign(c, lab, 0, x, ty === 3 ? 3.5 : 3.25, fz, 4.4); storefront(c, lab, x, fz, w);
    sodeSign(c, lab, x - w / 2 + 0.25, fz + 0.75, 3.4); // 袖看板（道から見える縦の看板。夜は灯る）
    winRow(c, 1, x - w / 2, x + w / 2, 3.6, bz - d / 2, 2, 1.2, 1.1, 0.4);
    if (c.rnd() < 0.8) vending(c, x - w / 2 + 0.8, fz + 0.5);
    if (c.rnd() < 0.5) vending(c, x - w / 2 + 1.9, fz + 0.5);
    for (let b = 0; b < 3; b++) if (c.rnd() < 0.6) g.box(x + 1 + b * 0.7, 0, fz + 2.4, 0.12, 0.95, 1.6, pick(c, [0x2b2f33, 0x9a3a32, 0x356b8c, 0xdadad6])); // 自転車
    g.cyl(x - 3.4, 0, fz + 2.2, 0.35, 0.5, 0x9a6a4a, 6); bush(c, x - 3.4, fz + 2.2, 0.55, c.rnd() < 0.5 ? 0xe07a8c : 0xe8c84a);
  }
  slab(c, 0, 11.2, 27, 5.2, 0xc4bfb4, 0.07);
  slab(c, 0, -9.4, 26, 8.4, 0x4c4f53, 0.08); parkingLines(c, -11, 11, -9.4, 5, 8); for (let i = 0; i < 8; i++) if (c.rnd() < 0.35) car(c, -11 + 22 * (i + 0.5) / 8, -9.4, false);
}

export function modelBakery(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b3a6);
  const g = c.g, x = -4.5, bz = 0.5, w = 11, d = 9, fz = bz + d / 2, sv0 = g.wallMat;
  // v86：壁（塗り壁・板張り・サイディング）と屋根と腰壁の色を店ごとに
  const [wc, wm] = pick(c, [[0xf0e6d2, 8], [0xf4efe4, 8], [0xe8d8bc, 4], [0x8a6448, 10], [0xdfe6e2, 9]] as [number, number][]), rf = pick(c, [0x8a4a34, 0x3c4046, 0x2f4a3f, 0x6b3a2a]), kz = pick(c, [0x9a5a3c, 0x6b4a32, 0x8a8f94, 0xb08060]);
  g.wallMat = wm;
  g.box(x, 0, bz, w, 3.5, d, wc); g.wallMat = sv0; g.box(x, 0, bz, w + 0.12, 0.9, d + 0.12, kz);        // 腰壁はれんが色
  g.wallMat = wm; g.box(x - 1.2, 3.5, bz - 0.6, w - 3.2, 2.6, d - 2.2, wc);
  g.gable(x - 1.2, 6.1, bz - 0.6, w - 3.2, d - 2.2, 2.0, rf, 'x', wc); g.wallMat = sv0;
  g.box(x + 4.3, 3.5, bz + 0.6, 2.2, 0.25, d - 1, rf);
  win(c, 0, x - 1.6, 1.0, fz, 5.2, 1.9, 1, 0xe6dcc0); g.box(x + 3.4, 0, fz + 0.06, 1.2, 2.3, 0.1, 0x6b4226); win(c, 0, x + 3.4, 1.0, fz + 0.07, 0.8, 1.1, 1, 0xe6dcc0);
  for (let i = 0; i < 6; i++) g.box(x - w / 2 + 0.9 + i * 1.84, 2.75 - 0.0, fz + 0.8, 1.84, 0.14, 1.6, i % 2 ? 0xf4efe6 : 0xc94f3a);  // しま模様のひさし
  sign(c, 'パン', 0, x - 1.4, 3.7, fz - 1.4, 3.6);
  g.box(x - 1.4, 3.6, fz - 1.5, 4.0, 2.0, 0.2, 0x6b4226);
  winRow(c, 0, x - 4, x + 1.6, 4.3, bz - 0.6 + (d - 2.2) / 2, 2, 1.2, 1.1, 0.6);
  g.box(x + 3.6, 3.5, bz - 2.5, 0.9, 3.4, 0.9, 0x9a5a3c, 0x4a4a4a);                                   // 煙突
  // テラス席
  slab(c, x - 1, fz + 3.4, 9, 4.6, 0xcbb898, 0.08);
  for (const tx of [x - 3.4, x + 1.0]) { g.cyl(tx, 0, fz + 3.6, 0.45, 0.72, 0xe9e2d2, 6); g.cyl(tx, 0.72, fz + 3.6, 0.04, 1.5, 0x8b8f93, 4); g.cyl(tx, 2.0, fz + 3.6, 1.5, 0.55, pick(c, [0xd9624a, 0xf2ead8, 0x3f7a5a]), 8, undefined, 0.05); }
  g.box(x - 5.6, 0, fz + 1.2, 0.5, 0.45, 1.6, 0x7a5a3c); bush(c, x - 5.4, fz + 2.9, 0.6, 0xe07a8c); bush(c, x + 4.6, fz + 1.6, 0.6, 0xe8c84a);
  slab(c, 8.6, 4, 8.6, 17, 0x4c4f53, 0.08); parkingLines(c, 4.6, 12.6, 8.5, 5, 3); if (c.rnd() < 0.7) car(c, 6, 8.5, false); if (c.rnd() < 0.4) car(c, 11.3, 8.5, false);
  tree(c, 10.5, -10.5, 0.9); tree(c, -11.5, -10.5, 0.8); hedge(c, 0, -13.4, 26, 0.7);
  standSign(c, 'パン', 12.4, 12.8, 2.3, 1.6, true);
}

export function modelSupermarket(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x4c4f53);
  const g = c.g, w = 46, d = 26, bz = -14, fz = bz + d / 2, h = 8.5, sv0 = g.wallMat, bc = pick(c, [0xc3312b, 0x2a7a3a, 0xe0782a, 0x1f5fb0, 0xc3312b]); // v86：帯の色は店ごと、壁はガルバ
  g.wallMat = 5; g.box(-3, 0, bz, w, h, d, pick(c, [0xeeece6, 0xe4e2dc, 0xf2efe6]), 0x9b9d9e); g.wallMat = sv0;
  g.box(-3, h - 2.6, bz, w + 0.2, 1.6, d + 0.2, bc); g.box(-3, h, bz, w + 0.4, 0.5, d + 0.4, 0xd9d6cf, 0x9b9d9e);
  g.box(-3, 0, fz + 1.6, 14, 4.6, 3.2, 0xdfe4e6); win(c, 0, -3, 0.2, fz + 3.2, 12, 3.9, 1, 0xd3e4ea);
  g.box(-3, 4.6, fz + 2.8, 18, 0.3, 5.6, bc);
  sign(c, 'スーパー', 0, -3, 5.2, fz + 0.12, 9);
  winRow(c, 0, -24, -11, 0.6, fz, 3, 3.2, 2.6, 1); winRow(c, 0, 5, 18, 0.6, fz, 3, 3.2, 2.6, 1);
  for (let i = 0; i < 6; i++) g.box(-20 + i * 6.5, h + 0.5, bz - 5, 2.6, 1.3, 1.8, 0xdfe0dc);
  g.box(23.5, 0, bz - 4, 7, 4.2, 12, 0xd4d1ca, 0x9b9d9e); g.box(25.5, 0.2, bz + 5.5, 2.6, 3.2, 7.5, 0xf0f0ec); g.box(25.5, 0.2, bz + 10.6, 2.4, 2.2, 2.4, 0x2f6b8c);   // 搬入口とトラック
  // 駐車場
  for (const z of [7.5, 20.5]) {
    parkingLines(c, -26, 22, z - 2.6, 5, 16); parkingLines(c, -26, 22, z + 2.6, 5, 16); g.box(-2, 0.12, z, 48, 0.02, 0.12, 0xeeeeea);
    for (let i = 0; i < 16; i++) { if (c.rnd() < 0.5) car(c, -26 + 48 * (i + 0.5) / 16, z - 2.6, false); if (c.rnd() < 0.38) car(c, -26 + 48 * (i + 0.5) / 16, z + 2.6, false); }
  }
  g.box(-14, 2.1, 1.4, 5, 0.1, 2.4, 0xbfc7ca); for (const x of [-16.3, -11.7]) g.cyl(x, 0, 1.4, 0.06, 2.1, 0x8b9094, 4);   // カート置き場
  for (const x of [-26.5, 0, 24.5]) { g.cyl(x, 0, 14, 0.12, 8, 0x8b9094, 5); g.box(x, 8, 14, 1.8, 0.2, 0.5, 0xd9d9d6); win(c, 0, x, 7.9, 14.0, 1.2, 0.12, 1, 0xfff2cc); }
  for (const x of [-27, -13, 1, 15]) tree(c, x, 27.6, 0.85);
  for (const z of [-22, -8, 6, 20]) tree(c, -27.6, z, 0.85);
  g.cyl(26.4, 0, 26.4, 0.25, 9, 0x7d8286, 6); g.box(26.4, 6.2, 26.4, 5.4, 3.0, 0.4, bc); sign(c, 'スーパー', 0, 26.4, 6.4, 26.6, 5.2); sign(c, 'スーパー', 1, 26.4, 6.4, 26.2, 5.2);
}

// ---- 市の施設 ----
export function modelNursery(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xd9c79c);
  const g = c.g, wall = dull(c, 0xf6e7b8, 0xd8cda6), roof = dull(c, 0xe08a3c, 0xb97f52);
  g.box(-2, 0, -8, 21, 3.7, 9, wall); g.gable(-2, 3.7, -8, 21, 9, 1.5, roof, 'x', wall, 0.7);
  g.box(8.5, 0, 0.5, 8, 3.7, 9, wall); g.gable(8.5, 3.7, 0.5, 8, 9, 1.3, roof, 'z', wall, 0.5);
  winRow(c, 0, -12, 4, 0.5, -3.5, 4, 2.6, 2.0, 0.9, 0xd7e6ea); winRow(c, 3, -3.5, 4.5, 0.5, 4.5, 2, 2.4, 2.0, 0.9, 0xd7e6ea);
  for (let i = 0; i < 4; i++) g.box(-10.9 + i * 4, 2.75, -3.44, 2.6, 0.45, 0.1, [0xe86a7a, 0x5aa9d6, 0x7cc36a, 0xf2c94c][i]);
  g.box(8.5, 0, 5.06, 1.8, 2.2, 0.1, 0x7a5a3c); g.box(8.5, 2.5, 5.9, 5, 0.18, 1.8, roof); sign(c, '保育園', 0, 8.5, 2.75, 5.02, 3.2);
  winRow(c, 1, -12, 8, 1.0, -12.5, 5, 1.6, 1.2, 0.5);
  // 園庭
  g.box(-9.5, 0.1, 8.3, 4.2, 0.25, 3.6, 0xbfb09a, 0xe8d9a8);                         // 砂場
  g.box(-2.5, 0, 9.5, 1.0, 2.2, 1.0, 0x5aa9d6); g.box(-2.5, 0.9, 7.6, 0.9, 0.12, 3.2, 0xf2c94c); g.box(-2.5, 2.2, 9.5, 1.3, 0.1, 1.3, 0xe86a7a);   // すべり台
  for (const x of [-6.8, -5.2]) for (const z of [3.2, 4.6]) g.cyl(x, 0, z, 0.05, 1.6, 0x4f9a5a, 4);
  g.box(-6, 1.6, 3.9, 1.8, 0.06, 1.6, 0x4f9a5a);                                     // ジャングルジム
  g.box(2.0, 0, 9.8, 2.2, 0.6, 1.2, 0xf2c94c); g.box(3.4, 0, 8.2, 1.0, 0.5, 0.6, 0xe86a7a);
  fenceRect(c, 27.6, 27.6, 1.25, 0x8fbf8a, 5);
  tree(c, -12, -1, 0.9); tree(c, 12.2, 11.6, 0.8, 2); tree(c, -12, 12, 0.8);
  bush(c, 4.2, 5.6, 0.6, 0xe07a8c); bush(c, 12.6, 5.6, 0.6, 0xe8c84a);
}

export function modelSchool(c: Ctx, fx0 = -38, fx1 = 14, label = '小学校'): void {
  const g = c.g, wall = dull(c, 0xf1ede2, 0xcfc9ba);
  pad(c, 88.4, 58.4, 0xcdb892);
  const bz = -21, w = 58, d = 10.5, h = 11.2, bx = -10, fz = bz + d / 2;
  g.box(bx, 0, bz, w, h, d, wall, 0x9b9d9e); g.box(bx, h, bz, w + 0.4, 0.6, d + 0.4, 0xd6d3cb, 0x9b9d9e);
  for (let f = 0; f < 3; f++) { winRow(c, 0, bx - w / 2 + 1, bx - 4, f * 3.6 + 1.1, fz, 9, 2.2, 1.9, 0.2, 0xb9d0da); winRow(c, 0, bx + 4, bx + w / 2 - 1, f * 3.6 + 1.1, fz, 9, 2.2, 1.9, 0.2, 0xb9d0da); winRow(c, 1, bx - w / 2 + 1, bx + w / 2 - 1, f * 3.6 + 1.4, bz - d / 2, 14, 1.6, 1.4, 0.15); }
  g.box(bx, 0, fz + 1.0, 8, h + 2.6, 2.4, dull(c, 0xe6e0d0, 0xc4bca8), 0x9b9d9e);     // 昇降口の塔屋
  g.box(bx, h + 0.2, fz + 2.25, 2.2, 2.2, 0.15, 0xfafaf7); g.box(bx, h + 1.2, fz + 2.34, 0.12, 0.9, 0.05, 0x222222); g.box(bx + 0.3, h + 1.25, fz + 2.34, 0.7, 0.12, 0.05, 0x222222);   // 時計
  win(c, 0, bx, 0.2, fz + 2.2, 5.6, 2.8, 0.4, 0xb9d0da); g.box(bx, 3.2, fz + 3.4, 9, 0.25, 2.6, 0xd6d3cb);
  g.box(bx, 4.6, fz + 2.24, 7.4, 3.9, 0.1, 0xfafaf7); sign(c, label, 0, bx, 4.8, fz + 2.22, 7.0); // 昇降口の上の校名板
  // 体育館
  g.box(31, 0, -15, 22, 9, 20, dull(c, 0xe9e4d6, 0xc9c2b0)); g.gable(31, 9, -15, 22, 20, 3.4, dull(c, 0x5f8f8a, 0x6f8580), 'z', dull(c, 0xe9e4d6, 0xc9c2b0), 0.6);
  winRow(c, 3, -23, -7, 5.5, 20, 5, 2.0, 1.6, 0.3); winRow(c, 0, 22, 40, 5.5, -5, 4, 2.4, 1.6, 0.3);
  g.box(19.2, 0, -19, 2.2, 3.0, 4, 0xd6d3cb);
  // 校庭
  { const fc = (fx0 + fx1) / 2, fw = fx1 - fx0; for (const [x, z, sx, sz] of [[fc, 0, fw, 0.25], [fc, 22, fw, 0.25], [fx0, 11, 0.25, 22], [fx1, 11, 0.25, 22]]) g.box(x, 0.07, z, sx, 0.02, sz, 0xf4f1e6); }
  for (const x of [fx0 + 4, fx1 - 4]) { g.box(x, 0, 11, 0.12, 2.3, 6.5, 0xf2f2ee); g.box(x + (x < 0 ? 0.9 : -0.9), 2.2, 11, 1.8, 0.1, 6.5, 0xf2f2ee); }                           // サッカーゴール
  for (let i = 0; i < 4; i++) { g.cyl(-40 + i * 1.8, 0, 26.5, 0.05, 1.2 + i * 0.25, 0x5a8fc4, 4); } g.box(-37.3, 1.5, 26.5, 5.6, 0.06, 0.06, 0x5a8fc4);                    // 鉄棒
  // プール
  g.box(29.5, 0, 14, 26, 1.3, 15, 0xc9cdd0); g.box(29.5, 1.2, 14, 23, 0.12, 12, 0x4fa3d1); for (let i = 1; i < 6; i++) g.box(29.5, 1.33, 8 + i * 2, 23, 0.02, 0.1, 0xf2f2ee); // 敷地（±44）の内側に収める
  // 桜並木と門
  for (let i = 0; i < 9; i++) tree(c, -40 + i * 7.4, 27.4, 0.95, i % 4 === 3 ? 0 : 2);
  fenceRect(c, 87.6, 57.6, 1.5, 0x5f9a78, 8);
  g.box(-5.2, 0, 28.8, 0.9, 2.2, 0.9, 0xd0cbc0); g.box(5.2, 0, 28.8, 0.9, 2.2, 0.9, 0xd0cbc0); g.box(-5.2, 0.55, 29.27, 1.9, 1.15, 0.06, 0xf6f3ea); sign(c, label, 0, -5.2, 0.6, 29.27, 2.1, 1.05); // 門の校名札
  g.cyl(8, 0, 22, 0.08, 9, 0xd9d9d6, 5); g.box(8.7, 7.8, 22, 1.3, 0.9, 0.04, 0xf7f7f4);
}

export function modelPark(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x86b86a);
  const g = c.g;
  slab(c, 0, 4, 3.0, 21, 0xd6c7a1, 0.07); slab(c, 0, 0, 22, 3.0, 0xd6c7a1, 0.07); g.cyl(0, 0.02, 0, 3.6, 0.07, 0xd6c7a1, 12);
  for (const [x, z, k] of [[-11.5, -11.5, 0], [-4, -12.2, 2], [4.5, -12, 0], [11.8, -11, 1], [-12, -3, 0], [12, 3, 0], [-11.5, 10.5, 2], [11.5, 11, 0]]) tree(c, x, z, 0.9 + c.rnd() * 0.3, k);
  // ぶらんこ
  for (const x of [5.2, 9.6]) { g.box(x, 0, -5.6, 0.1, 2.5, 0.1, 0x4a8fc0); g.box(x, 0, -4.4, 0.1, 2.5, 0.1, 0x4a8fc0); }
  g.box(7.4, 2.45, -5, 4.6, 0.1, 0.1, 0x4a8fc0); for (const x of [6.4, 8.4]) { g.box(x, 0.5, -5, 0.5, 0.06, 0.25, 0x8a5a3a); g.box(x - 0.22, 0.5, -5, 0.02, 1.95, 0.02, 0x555555); g.box(x + 0.22, 0.5, -5, 0.02, 1.95, 0.02, 0x555555); }
  // すべり台・砂場
  g.box(-7.4, 0, -6.6, 1.1, 2.0, 1.1, 0xe2a23a); g.box(-7.4, 0.8, -4.6, 0.9, 0.12, 3.2, 0xd95f4a); g.box(-5.2, 0.05, 5.6, 4.4, 0.25, 3.6, 0xbfb09a, 0xe8d9a8);
  // あずまやとベンチ
  for (const [x, z] of [[6.2, 5.8], [9.8, 5.8], [6.2, 9.4], [9.8, 9.4]]) g.cyl(x, 0, z, 0.1, 2.5, 0x6b4a32, 5);
  g.pyramid(8, 2.5, 7.6, 5.4, 5.4, 1.4, 0x5a3f2c); g.box(8, 0, 7.6, 2.2, 0.45, 0.6, 0x8a6a48);
  for (const [x, z] of [[-3.4, 2.4], [3.4, -2.4], [-8.6, 1.9]]) { g.box(x, 0.3, z, 1.7, 0.1, 0.5, 0x8a6a48); g.box(x, 0, z, 1.5, 0.3, 0.1, 0x55595c); }
  g.cyl(-2.6, 0, -3, 0.07, 3.6, 0x55595c, 5); g.box(-2.6, 3.6, -3, 0.7, 0.7, 0.2, 0xfafaf7);
  hedge(c, -8.3, 13.6, 11, 0.8, 0.8); hedge(c, 8.3, 13.6, 11, 0.8, 0.8); hedge(c, -13.6, 0, 0.8, 26, 0.8); hedge(c, 13.6, 0, 0.8, 26, 0.8);
  standSign(c, '公園', 3.2, 12.6, 0.9, 1.5, true);
  for (const x of [-2.2, 2.2]) { g.cyl(x, 0, 11, 0.07, 3.8, 0x55595c, 5); win(c, 0, x, 3.7, 11.0, 0.5, 0.3, 1, 0xfff2cc); }
  bush(c, -1.8, 6.5, 0.7, 0xe07a8c); bush(c, 2.1, 7.2, 0.7, 0xe8c84a); bush(c, 2.6, -6, 0.8, 0xb07ac8);
}

export function modelFire(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b6ae);
  const g = c.g, wall = dull(c, 0xe9e6df, 0xc9c4b8);
  g.box(-2.5, 0, -5.5, 19, 10, 13, wall, 0x9b9d9e); g.box(-2.5, 10, -5.5, 19.4, 0.5, 13.4, 0xd0cdc5, 0x9b9d9e);
  g.box(-2.5, 4.6, 1.06, 19.1, 0.9, 0.12, 0xc0322b);
  for (let i = 0; i < 3; i++) { g.box(-8.2 + i * 5.7, 0, 1.08, 4.6, 4.2, 0.12, 0xdadad6); for (let k = 0; k < 5; k++) g.box(-8.2 + i * 5.7, 0.3 + k * 0.8, 1.16, 4.4, 0.06, 0.03, 0xb0b0ac); }
  winRow(c, 0, -11.5, 6.5, 6.4, 1, 6, 1.8, 1.5, 0.7); winRow(c, 2, -11.5, 0.5, 6.4, 7, 3, 1.6, 1.4, 0.5); winRow(c, 1, -11.5, 6.5, 6.4, -12, 5, 1.6, 1.4, 0.4); winRow(c, 1, -11.5, 6.5, 2, -12, 5, 1.6, 1.4, 0.3);
  sign(c, '消防署', 0, -2.5, 7.95, 1.02, 4.0);
  g.box(10.5, 0, -8, 3.6, 16, 3.6, wall, 0x9b9d9e); g.box(10.5, 14.2, -8, 3.8, 1.0, 3.8, 0xc0322b); g.cyl(10.5, 16, -8, 0.06, 4, 0x8b8f93, 4);  // 訓練塔
  winRow(c, 0, 9.5, 11.5, 3, -6.2, 1, 1.0, 9, 0.3);
  slab(c, -2.5, 8, 19, 12, 0xcfcbc2, 0.07);
  // 消防車
  g.box(-2.5, 0.25, 7, 2.4, 2.4, 7.4, 0xc0322b); g.box(-2.5, 1.1, 7, 2.46, 0.3, 7.5, 0xf2f2ee); g.box(-2.5, 0.05, 7, 2.3, 0.4, 6.6, 0x1c1d1f); g.box(-2.5, 2.65, 6.2, 1.4, 0.3, 5.6, 0xb9bcc0);
  win(c, 0, -2.5, 1.55, 10.7, 2.0, 0.8, 0.2, 0x2a3138); win(c, 0, -2.5, 2.67, 10.4, 0.5, 0.22, 1, 0xff5a4a);
  win(c, 0, -2.5, 9.2, 1.1, 0.5, 0.4, 1, 0xff5a4a);
  tree(c, -12, 11.5, 0.8); hedge(c, 12.6, 6, 0.7, 14); g.cyl(7.5, 0, 12, 0.07, 7, 0xd9d9d6, 5); g.box(8.1, 5.9, 12, 1.2, 0.8, 0.04, 0xf7f7f4);
}

export function modelWater(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x9ab07a);
  const g = c.g, tank = dull(c, 0xc9d6dc, 0xb8a892), band = dull(c, 0x3f7fb0, 0x7a6a5a);
  for (const [x, z] of [[-15, -14], [8, -14]]) {
    g.cyl(x, 0, z, 9.5, 8, tank, 16, dull(c, 0xdde6ea, 0xc4b8a4)); g.cyl(x, 5.6, z, 9.6, 0.8, band, 16);
    g.cyl(x, 8, z, 9.5, 1.0, 0x8b9094, 16, undefined, 9.5); g.box(x + 9.7, 0, z, 0.5, 8.6, 0.9, 0x8b9094);
    if (c.old) { g.box(x - 6, 1, z + 7.4, 1.2, 4.5, 0.2, 0x8a5a3a); g.box(x + 3, 0.5, z + 9.0, 0.8, 3.5, 0.2, 0x8a5a3a); }    // さびの筋
  }
  for (let i = 0; i < 3; i++) { g.box(-16 + i * 13, 0, 12, 11, 1.4, 20, 0xb9b6ae); g.box(-16 + i * 13, 1.3, 12, 9.6, 0.14, 18.4, c.old ? 0x5f8f8a : 0x4f9fc9); g.box(-16 + i * 13, 1.5, 12, 0.5, 0.2, 18.4, 0x8b9094); }
  g.box(21, 0, -15, 12, 7.5, 16, dull(c, 0xe6e0d0, 0xc4bca8), 0x9b9d9e); g.box(21, 5.4, -15, 12.2, 0.9, 16.2, band);
  winRow(c, 3, -21, -9, 1.5, 15, 3, 1.8, 1.6, 0.4); winRow(c, 0, 16, 26, 1.5, -7, 2, 1.8, 1.6, 0.4);
  sign(c, '水道', 0, 21, 3.6, -6.98, 3.2);
  g.box(-3.5, 0.6, -14, 5, 0.9, 0.9, band); g.box(8, 0.6, -2, 0.9, 0.9, 12, band); g.box(-15, 0.6, -2, 0.9, 0.9, 6, band); g.box(-3, 0.6, 1.5, 24, 0.9, 0.9, band);
  g.box(24, 0, 8, 5, 3.4, 5, 0xd9d6cf, 0x9b9d9e); g.box(24, 0, 20, 4, 2.2, 6, 0xb9bcc0);
  slab(c, 24, 14, 8, 26, 0x55585c, 0.07);
  fenceRect(c, 57.6, 57.6, 1.9, 0x8ea596, 7);
  for (const [x, z] of [[-26.5, 26.5], [-26.5, -27], [27, -27], [-27, 0]]) tree(c, x, z, 0.9, 1);
}

export function modelWaste(c: Ctx): void {
  pad(c, 58.4, 28.4, 0x55585c);
  const g = c.g, wall = dull(c, 0xe1ddd2, 0xc2bcae);
  g.box(-13, 6.2, -5.5, 28, 0.5, 14, dull(c, 0x7fa3ad, 0x7f8f92)); g.box(-13, 0, -12.3, 28, 6.2, 0.3, wall);
  for (const x of [-26.6, -17.5, -8.5, 0.6]) for (const z of [-11.5, 1.1]) g.cyl(x, 0, z, 0.18, 6.2, 0x8b9094, 5);
  for (let i = 0; i < 3; i++) { const x = -22 + i * 9; g.box(x, 0.3, -6.2, 2.3, 2.6, 5.2, 0x3f8fb5); g.box(x, 0.3, -2.4, 2.2, 2.0, 2.2, 0xf2f2ee); g.box(x, 0.05, -5, 2.2, 0.4, 7, 0x1c1d1f); win(c, 0, x, 1.3, -1.28, 1.8, 0.8, 0.2, 0x2a3138); }
  g.box(17, 0, -7, 13, 6.8, 11, wall, 0x9b9d9e); g.box(17, 6.8, -7, 13.3, 0.4, 11.3, 0xd0cdc5, 0x9b9d9e);
  winRow(c, 0, 11, 23, 1.2, -1.5, 3, 2.0, 1.5, 0.4); winRow(c, 0, 11, 23, 4.2, -1.5, 3, 2.0, 1.5, 0.3); sign(c, '清掃', 0, 17, 2.6, -1.48, 3.4);
  for (let i = 0; i < 4; i++) g.box(6 + i * 3.2, 0, 8.5, 2.5, 2.0, 5.2, [0x3f8fb5, 0x4f9a5a, 0xe0b23a, 0x8a8f94][i]);
  g.box(-10, 0, 9.5, 8, 1.6, 4, 0xb9bcc0); g.box(-20, 0, 9.5, 6, 2.2, 4, 0x9aa7ad);
  fenceRect(c, 57.6, 27.6, 1.9, 0x8ea596, 9);
  tree(c, 27, 11.5, 0.85, 1); tree(c, -27, 11.5, 0.85, 1);
}

// ---- 市以外の公共的施設 ----
export function modelStation(c: Ctx): void {
  pad(c, 88.4, 28.4, 0xcfc9bc);
  const g = c.g;
  if (!c.lm?.has('station')) stationHouse(c);
  // 駅前広場
  slab(c, 0, 8.2, 86, 11, 0xd9d3c4, 0.06);
  g.box(-22, 2.6, 9.5, 9, 0.14, 2.6, 0x9fb3bd); for (const x of [-26, -18]) g.cyl(x, 0, 10.5, 0.07, 2.6, 0x8b9094, 4);
  g.box(-22, 0.3, 12.2, 10.4, 2.7, 2.5, 0x4f9a6a); g.box(-22, 1.3, 12.2, 10.5, 1.0, 2.56, 0xf2f2ee); g.box(-22, 0.05, 12.2, 9.8, 0.4, 2.4, 0x1c1d1f); win(c, 0, -22, 1.4, 13.5, 9.0, 0.8, 0.3, 0x2a3138);  // バス
  standSign(c, 'バス', -28.5, 9.6, 1.9, 0.9, false);
  car(c, 16, 12.3, true, 0x25282c); car(c, 21.5, 12.3, true, 0xe0c040); car(c, 27, 12.3, true, 0x25282c);
  g.box(34, 2.0, 5.6, 14, 0.1, 4.6, 0xb9c2c6); for (const x of [27.5, 40.5]) g.cyl(x, 0, 7.6, 0.06, 2.0, 0x8b9094, 4);
  for (let i = 0; i < 22; i++) if (c.rnd() < 0.8) g.box(27.8 + i * 0.58, 0, 5.4, 0.1, 0.95, 1.6, pick(c, [0x2b2f33, 0x9a3a32, 0x356b8c, 0xdadad6, 0x4f9a5a]));
  for (const x of [-38, -12, 10, 40]) { g.box(x, 0, 4.6, 2.4, 0.6, 2.4, 0x8d8780); tree(c, x, 4.6, 0.85, x === 10 ? 2 : 0); }
  g.cyl(6, 0, 9, 0.12, 5.5, 0x55595c, 6); g.box(6, 5.5, 9, 1.0, 1.0, 0.3, 0xfafaf7);
  // ホームと屋根（線路は北側）
  for (const z of [-19, -40]) {
    g.box(0, 0, z, 84, 1.1, 5.4, 0xbdb9b0, 0xcfcbc2); g.box(0, 1.11, z + (z > -30 ? -2.4 : 2.4), 84, 0.02, 0.35, 0xf2c230);
    g.box(0, 4.6, z, 60, 0.25, 5.8, 0x596672); for (let i = 0; i < 7; i++) g.cyl(-27 + i * 9, 1.1, z, 0.12, 3.5, 0x8b9094, 5);
    for (const x of [-12, 12]) { g.box(x, 1.1, z + (z > -30 ? 1.6 : -1.6), 2.2, 0.45, 0.5, 0x5a8fc4); }
  }
  g.box(30, 6.4, -29.5, 4.2, 3.0, 28, 0xe4e2dc, 0x596672); winRow(c, 2, -41, -18, 7.3, 32.1, 5, 2.4, 1.2, 0.8); winRow(c, 3, -41, -18, 7.3, 27.9, 5, 2.4, 1.2, 0.8);   // 跨線橋
  g.box(30, 0, -17.5, 4, 6.4, 4, 0xe4e2dc); g.box(30, 0, -41.5, 4, 6.4, 4, 0xe4e2dc);
}

/** 駅舎（コードの模型。glb が使えないとき） */
function stationHouse(c: Ctx): void {
  const g = c.g;
  g.box(0, 0, -8, 46, 7.2, 11, 0xecebe6, 0x9b9d9e); g.box(0, 7.2, -7.2, 49, 0.5, 14, 0x3d4650);
  g.box(0, 7.7, -8, 12, 2.4, 6, 0xecebe6, 0x3d4650);
  g.box(0, 8.2, -4.9, 2.0, 2.0, 0.15, 0xfafaf7); g.box(0, 9.2, -4.8, 0.1, 0.8, 0.05, 0x222222); g.box(0.3, 9.2, -4.8, 0.6, 0.1, 0.05, 0x222222);
  win(c, 0, 0, 0.2, -2.5, 12, 3.6, 1, 0xd3e4ea); winRow(c, 0, -22, -8, 0.8, -2.5, 4, 2.4, 2.4, 0.9); winRow(c, 0, 8, 22, 0.8, -2.5, 4, 2.4, 2.4, 0.9);
  sign(c, '住野駅', 0, 0, 4.4, -2.46, 5.2);
  g.box(0, 4.0, 0.2, 18, 0.25, 5.4, 0x3d4650); for (const x of [-8, 8]) g.cyl(x, 0, 2.4, 0.14, 4.0, 0x8b9094, 5);
}

export function modelClinic(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b6ae);
  const g = c.g;
  g.box(-2, 0, -5, 18, 7.2, 12, 0xf3f3ee, 0x9b9d9e); g.box(-2, 7.2, -5, 18.3, 0.45, 12.3, 0xd9d6cf, 0x9b9d9e); g.box(-2, 3.4, -5, 18.1, 0.5, 12.1, 0xa9d1bd);
  win(c, 0, -5, 0.3, 1, 5.4, 2.6, 0.8, 0xd3e4ea); g.box(2.6, 0, 1.06, 2.0, 2.4, 0.1, 0x9fb7c2); winRow(c, 0, -10, 6, 4.6, 1, 4, 2.2, 1.5, 0.5);
  winRow(c, 2, -10, 0, 4.6, 7, 2, 1.8, 1.4, 0.4); winRow(c, 1, -10, 6, 4.6, -11, 4, 1.6, 1.4, 0.3);
  g.box(2.6, 2.7, 2.2, 5, 0.2, 2.4, 0xa9d1bd);
  g.box(8.5, 0, 4.2, 0.25, 4.6, 0.25, 0x8b9094); g.box(8.5, 3.0, 4.2, 0.3, 1.8, 3.0, 0xf7f7f4); sign(c, '診療所', 2, 4.2, 3.2, 8.66, 2.8, 1.4); sign(c, '診療所', 3, 4.2, 3.2, 8.34, 2.8, 1.4);
  slab(c, -1, 8.6, 22, 9, 0x4c4f53, 0.08); parkingLines(c, -11, 7, 9.5, 5, 7); for (let i = 0; i < 7; i++) if (c.rnd() < 0.4) car(c, -11 + 18 * (i + 0.5) / 7, 9.5, false);
  hedge(c, 12.8, -2, 0.7, 22); tree(c, 11.5, 11.5, 0.8); tree(c, -12, -12, 0.8);
}

export function modelKoban(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b6ae);
  const g = c.g;
  g.box(-6, 0, 4.5, 8, 6.2, 7, 0xefe9da, 0x9b9d9e); g.box(-6, 6.2, 4.5, 8.3, 0.4, 7.3, 0x2c3e5c); g.box(-6, 2.9, 4.5, 8.1, 0.4, 7.1, 0x2c3e5c);
  win(c, 0, -7.4, 0.5, 8, 3.2, 2.0, 1, 0xd3e4ea); g.box(-3.4, 0, 8.06, 1.1, 2.2, 0.1, 0x55595c); winRow(c, 0, -10, -2, 3.9, 8, 2, 1.6, 1.3, 0.8);
  sign(c, '交番', 0, -6, 2.15, 8.4, 2.8, 1.4); g.box(-6, 3.35, 8.5, 0.5, 0.5, 0.5, 0xd8322a); win(c, 0, -6, 3.4, 8.76, 0.4, 0.4, 1, 0xff5a4a);
  g.box(-6, 2.2, 8.9, 6, 0.15, 1.8, 0x2c3e5c);
  g.box(0.5, 0.3, 9.5, 1.7, 0.65, 4.1, 0xf2f2ee); g.box(0.5, 0.3, 9.5, 1.74, 0.3, 4.14, 0x25282c); g.box(0.5, 0.95, 9.3, 1.5, 0.55, 2.2, 0x2a3138); g.box(0.5, 1.5, 9.3, 0.9, 0.14, 0.3, 0xd8322a);  // パトカー
  g.box(-11.5, 0.9, 11, 0.1, 1.4, 2.2, 0x6b4a32); g.box(-11.4, 1.0, 11, 0.05, 1.2, 2.0, 0xf2efe6);                // 掲示板
  slab(c, 6, -4, 13, 17, 0x86b86a, 0.07); tree(c, 4, -8, 1.0); tree(c, 10, -2, 0.9, 2); tree(c, -10, -8, 0.95); bush(c, 7, 2, 0.8); g.box(8, 0.3, -9, 1.7, 0.1, 0.5, 0x8a6a48);
  slab(c, 6, 9.5, 10, 6.5, 0xc8c2b6, 0.07);
}


// ---- v5 の施設 ----
/** 汎用の箱の建物（窓の列・屋上の縁・看板つき）。x,z は中心、正面は +z */
function block(c: Ctx, x: number, z: number, w: number, d: number, floors: number, wall: number, opts: { fh?: number; roof?: number; label?: string; lit?: number; glass?: number; band?: number; mat?: number; wide?: boolean } = {}): number {
  const g = c.g, fh = opts.fh ?? 3.6, h = floors * fh + 0.6, sv = g.wallMat;
  if (opts.mat) g.wallMat = opts.mat; g.box(x, 0, z, w, h, d, wall, opts.roof ?? 0x9b9d9e); g.wallMat = sv; // v86：mat は外壁の素材、wide は横長の窓 g.box(x, h, z, w + 0.3, 0.45, d + 0.3, opts.band ?? 0xd0cdc5, opts.roof ?? 0x9b9d9e);
  const nw = Math.max(1, Math.floor(w / (opts.wide ? 4.6 : 3.2))), nd = Math.max(1, Math.floor(d / 3.2)), ww = opts.wide ? 3.8 : 2.0, wy = opts.wide ? 0.85 : 1.0, wh = fh * (opts.wide ? 0.6 : 0.5);
  for (let f = 0; f < floors; f++) {
    winRow(c, 0, x - w / 2 + 0.6, x + w / 2 - 0.6, f * fh + wy, z + d / 2, nw, ww, wh, opts.lit ?? 0.4, opts.glass);
    winRow(c, 1, x - w / 2 + 0.6, x + w / 2 - 0.6, f * fh + wy, z - d / 2, nw, ww, wh, (opts.lit ?? 0.4) * 0.7, opts.glass);
    winRow(c, 2, z - d / 2 + 0.6, z + d / 2 - 0.6, f * fh + 1.0, x + w / 2, nd, 2.0, fh * 0.5, (opts.lit ?? 0.4) * 0.6, opts.glass);
    winRow(c, 3, z - d / 2 + 0.6, z + d / 2 - 0.6, f * fh + 1.0, x - w / 2, nd, 2.0, fh * 0.5, (opts.lit ?? 0.4) * 0.6, opts.glass);
  }
  if (opts.label) sign(c, opts.label, 0, x, Math.min(h - 2.4, fh * floors - 1.6), z + d / 2 + 0.02, Math.min(4, w * 0.4));
  if (c.fine) blockDetail(c, x, z, w, d, floors, fh, h, wall, opts.band ?? 0xd0cdc5);
  return h;
}
/** ビルの細部：屋上の立ち上がり（パラペット）・室外機・階段室・給水タンク・アンテナ、各階の床の帯、雨どい、入口のひさし */
function blockDetail(c: Ctx, x: number, z: number, w: number, d: number, floors: number, fh: number, h: number, wall: number, band: number): void {
  const g = c.g, top = h + 0.45, k = (n: number) => dh(x + w * 1.7 + g.ox, z + d * 2.3 + g.oz, n);
  // パラペット（屋上のふちの低い壁）
  const pt = 0.22, ph = 0.9;
  g.box(x, top, z + d / 2 - pt / 2 + 0.15, w + 0.3, ph, pt, band); g.box(x, top, z - d / 2 + pt / 2 - 0.15, w + 0.3, ph, pt, band);
  g.box(x + w / 2 - pt / 2 + 0.15, top, z, pt, ph, d - 0.2, band); g.box(x - w / 2 + pt / 2 - 0.15, top, z, pt, ph, d - 0.2, band);
  // 屋上の設備
  const nAC = Math.min(10, Math.floor(w * d / 60) + 1);
  for (let i = 0; i < nAC; i++) { const ax = x - w / 2 + 1.5 + k(i) * (w - 3), az = z - d / 2 + 1.5 + k(i + 20) * (d - 3); g.box(ax, top, az, 1.1, 0.75, 0.75, 0xd9dcdc, 0xb8bcbe); g.cyl(ax, top + 0.76, az, 0.3, 0.02, 0x5a5e62, 8); }
  if (floors >= 3 && w > 6 && d > 6) { const sx = x + (k(40) - 0.5) * (w - 5), sz = z + (k(41) - 0.5) * (d - 5); g.box(sx, top, sz, 3.2, 2.7, 3.2, wall, 0x9a9c9e); g.box(sx, top + 2.7, sz, 3.6, 0.2, 3.6, band); if (k(43) < 0.6) g.cyl(sx + 0.8, top + 2.9, sz - 0.6, 0.05, 3.5, 0x8b8f93, 4); }
  if (floors >= 5 && k(42) < 0.5 && w > 8) { const tx = x + (k(44) - 0.5) * (w - 6), tz = z + (k(45) - 0.5) * (d - 6); for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) g.box(tx + dx, top, tz + dz, 0.15, 1.4, 0.15, 0x7a7e82); g.box(tx, top + 1.4, tz, 2.6, 1.6, 2.6, 0xc9ced2); }
  // 各階の床の帯（壁から少し出る）
  if (floors >= 2) for (let f = 1; f < floors; f++) { const y = f * fh + 0.55; g.box(x, y, z + d / 2 + 0.06, w + 0.12, 0.18, 0.14, band); g.box(x, y, z - d / 2 - 0.06, w + 0.12, 0.18, 0.14, band); }
  // 雨どい（角の縦の管）
  for (const sx of [-1, 1]) g.box(x + sx * (w / 2 + 0.08), 0, z + d / 2 + 0.08, 0.14, h, 0.14, 0x8a8e92);
  // 入口：ガラスの扉とひさし
  if (floors >= 2) { const ex = x + (k(50) - 0.5) * Math.max(0, w - 6); g.box(ex, 2.7, z + d / 2 + 0.9, 3.6, 0.18, 1.8, band); c.wb.box(ex, 0, z + d / 2 + 0.03, 2.2, 2.4, 0.06, 0x3a4a56); }
}
function parking(c: Ctx, x: number, z: number, w: number, d: number, n: number): void {
  slab(c, x, z, w, d, 0x4c4f53, 0.08); parkingLines(c, x - w / 2 + 1, x + w / 2 - 1, z, d * 0.45, n);
  for (let i = 0; i < n; i++) if (c.rnd() < 0.5) car(c, x - w / 2 + 1 + (w - 2) * (i + 0.5) / n, z, false);
}
export function modelNurseryS(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xd9c79c);
  const g = c.g, wall = dull(c, 0xf3e3c3, 0xd6caa8), roof = dull(c, 0x6aa0c8, 0x7a8fa0);
  g.box(-3, 0, -5, 15, 3.6, 10, wall); g.gable(-3, 3.6, -5, 15, 10, 1.3, roof, 'x', wall, 0.6);
  winRow(c, 0, -9.5, 3.5, 0.6, 0, 3, 2.4, 1.9, 0.9, 0xd7e6ea); sign(c, '保育園', 0, 6, 2.4, 0.04, 3.2);
  g.box(-6, 0.1, 7, 4, 0.25, 3.4, 0xbfb09a, 0xe8d9a8); g.box(2, 0, 8.5, 1.0, 1.8, 1.0, 0xe86a7a);
  fenceRect(c, 27.6, 27.6, 1.2, 0x8fbf8a, 5); tree(c, 11, 10, 0.8, 2); tree(c, -11, -11, 0.8);
}
export function modelNurseryL(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xd9c79c);
  const g = c.g, wall = dull(c, 0xf6e7b8, 0xd8cda6), roof = dull(c, 0xd9763a, 0xb97f52);
  g.box(-8, 0, -6, 34, 7.4, 11, wall); g.gable(-8, 7.4, -6, 34, 11, 1.8, roof, 'x', wall, 0.7);
  for (let f = 0; f < 2; f++) winRow(c, 0, -24, 8, 0.7 + f * 3.6, -0.5, 8, 2.6, 2.0, 0.8, 0xd7e6ea);
  g.box(17, 0, -3, 14, 4, 13, dull(c, 0xe8f1e6, 0xccd5c9)); g.gable(17, 4, -3, 14, 13, 1.4, dull(c, 0x6aa86a, 0x7a9a7a), 'z', 0xe8f1e6, 0.5);
  sign(c, '保育園', 0, 17, 2.5, 3.52, 3.2); sign(c, '福祉', 0, -8, 5.0, -0.48, 2.6);
  g.box(-14, 0.1, 9, 6, 0.25, 4, 0xbfb09a, 0xe8d9a8); g.box(-3, 0, 10, 1.1, 2.2, 1.1, 0x5aa9d6); g.box(-3, 0.9, 8, 0.9, 0.12, 3.2, 0xf2c94c);
  for (let i = 0; i < 4; i++) g.box(4 + i * 3, 0, 9.5, 2.0, 0.6, 1.0, [0xf2c94c, 0xe86a7a, 0x5aa9d6, 0x7cc36a][i]);
  fenceRect(c, 57.6, 27.6, 1.25, 0x8fbf8a, 6); tree(c, -27, 11, 0.9, 2); tree(c, 27, 11, 0.9);
}
export function modelJhs(c: Ctx): void {
  modelSchool(c, -18, 14, '中学校'); // 校庭を少し狭くして、左にテニスコートを置く（重ならないように）
  slab(c, -30, 11, 13, 19, 0x4f8f5a, 0.09); c.g.box(-30, 0.1, 11, 12.4, 0.02, 0.1, 0xf2f2ee); c.g.box(-30, 0.1, 11, 0.06, 0.02, 18, 0xf2f2ee);
  for (const x of [-37, -23]) c.g.box(x, 0, 11, 0.15, 3.6, 20, 0x5f9a78); for (const z of [1, 21]) c.g.box(-30, 0, z, 14, 3.6, 0.15, 0x5f9a78); // テニスコートの金網（四方）
}
export function modelHighschool(c: Ctx): void {
  modelSchool(c, -38, 14, '高校');
}
export function modelParkM(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x86b86a);
  const g = c.g;
  slab(c, 0, 0, 52, 3, 0xd6c7a1, 0.07); slab(c, 0, 0, 3, 52, 0xd6c7a1, 0.07); g.cyl(0, 0.02, 0, 6, 0.07, 0xd6c7a1, 16);
  g.cyl(0, 0.05, 0, 3.2, 0.6, 0xb9b6ae, 16); g.cyl(0, 0.5, 0, 2.8, 0.15, 0x4fa3d1, 16); g.cyl(0, 0.6, 0, 0.3, 2.2, 0xd9d9d6, 6); // 噴水
  slab(c, -14, -14, 20, 20, 0xa9c98a, 0.06); // 芝生広場
  for (const [x, z] of [[12, -12], [16, -8]]) { g.box(x, 0, z, 1.1, 2.2, 1.1, 0xe2a23a); g.box(x, 0.8, z + 2, 0.9, 0.12, 3.2, 0xd95f4a); }
  for (const x of [10, 14]) { g.box(x, 0, -20, 0.1, 2.5, 0.1, 0x4a8fc0); g.box(x, 0, -18.6, 0.1, 2.5, 0.1, 0x4a8fc0); } g.box(12, 2.45, -19.3, 4.6, 0.1, 0.1, 0x4a8fc0);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; tree(c, Math.cos(a) * 25, Math.sin(a) * 25, 0.9 + c.rnd() * 0.4, i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0); }
  for (const [x, z] of [[-14, 12], [14, 12], [-6, 20]]) tree(c, x, z, 1.1);
  g.pyramid(14, 2.6, 14, 5.4, 5.4, 1.4, 0x5a3f2c); for (const [x, z] of [[12, 12], [16, 12], [12, 16], [16, 16]]) g.cyl(x, 0, z, 0.1, 2.6, 0x6b4a32, 5);
  g.box(-20, 0, 16, 5, 2.6, 3, 0xe6e0d0, 0x8b8f93); // トイレ
  standSign(c, '公園', 4, 27, 0.9, 1.6, true);
}
export function modelParkL(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x86b86a);
  const g = c.g;
  // 陸上トラックと運動場
  g.box(-12, 0.06, -10, 52, 0.06, 36, 0xb5553f); g.box(-12, 0.09, -10, 42, 0.06, 26, 0x6fae58);
  for (const z of [-27, 7]) for (let x = -36; x <= 12; x += 12) g.box(x, 0, z, 0.5, 4, 0.5, 0xd9d9d6);
  // 池
  g.cyl(26, 0.02, 22, 12, 0.2, 0x8a9a7a, 20); g.cyl(26, 0.1, 22, 11, 0.15, 0x4f8fb0, 20);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; tree(c, 26 + Math.cos(a) * 15, 22 + Math.sin(a) * 15, 1.0, i % 3 === 0 ? 2 : 0); }
  // 管理棟・観客席
  block(c, 30, -28, 14, 9, 2, 0xe6e0d0, { label: '公園' });
  g.box(-12, 0, 11, 30, 2.4, 4, 0xbdb9b0, 0x6f7a86); g.box(-12, 2.4, 11.6, 30, 0.2, 5, 0x5f6b77);
  slab(c, -22, 32, 40, 14, 0xa9c98a, 0.06);
  for (let i = 0; i < 16; i++) tree(c, -42 + i * 5.5, 42, 0.95 + c.rnd() * 0.3, i % 4 === 0 ? 2 : i % 3 === 0 ? 1 : 0);
  for (let i = 0; i < 12; i++) tree(c, -42, -38 + i * 6.5, 0.95, i % 2);
  standSign(c, '公園', 0, 43, 0.9, 1.8, true);
}
export function modelGym(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xb9b6ae);
  const g = c.g, wall = dull(c, 0xe9e4d6, 0xc9c2b0);
  g.box(-4, 0, -6, 40, 13, 30, wall); g.gable(-4, 13, -6, 40, 30, 4.5, dull(c, 0x4f8f8a, 0x6f8580), 'x', wall, 0.6);
  winRow(c, 0, -22, 14, 8, 9, 7, 3.0, 2.4, 0.3); winRow(c, 0, -22, 14, 1.2, 9, 7, 3.0, 2.2, 0.5);
  sign(c, '体育館', 0, -4, 5.6, 9.04, 4.4);
  g.box(-4, 0, 11, 10, 3.4, 4, 0xd6d3cb); g.box(-4, 3.4, 11.5, 12, 0.3, 5.5, 0x4f8f8a);
  parking(c, 0, 21, 52, 10, 10);
  for (const x of [-26, 26]) tree(c, x, -26, 1.0); tree(c, 26, 12, 0.9, 2);
}
export function modelFireS(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b6ae);
  const g = c.g, wall = dull(c, 0xe9e6df, 0xc9c4b8);
  g.box(-3, 0, -6, 15, 7.6, 11, wall, 0x9b9d9e); g.box(-3, 7.6, -6, 15.3, 0.4, 11.3, 0xc0322b);
  for (let i = 0; i < 2; i++) g.box(-7 + i * 5.5, 0, -0.44, 4.4, 4, 0.12, 0xdadad6);
  winRow(c, 0, -10, 4, 5.0, -0.5, 4, 1.6, 1.3, 0.6); sign(c, '消防署', 0, 2.5, 4.4, -0.42, 3.6);
  g.box(-4, 0.25, 6, 2.4, 2.4, 7, 0xc0322b); g.box(-4, 1.1, 6, 2.46, 0.3, 7.1, 0xf2f2ee);
  slab(c, -3, 6, 15, 10, 0xcfcbc2, 0.07); tree(c, 10, 10, 0.8);
}
export function modelFireL(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xb9b6ae);
  const g = c.g, wall = dull(c, 0xe9e6df, 0xc9c4b8);
  block(c, -8, -12, 34, 18, 4, wall, { label: '消防署', band: 0xc0322b });
  for (let i = 0; i < 5; i++) { g.box(-22 + i * 7, 0, -2.9, 5.6, 4.6, 0.12, 0xdadad6); }
  g.box(20, 0, -14, 5, 24, 5, wall); g.box(20, 22, -14, 5.3, 1.2, 5.3, 0xc0322b); g.cyl(20, 23.2, -14, 0.08, 5, 0x8b8f93, 4); // 訓練塔
  g.box(18, 0, 10, 16, 0.2, 16, 0x8a8f94); g.cyl(18, 0.2, 10, 6, 0.05, 0xf2f2ee, 16); g.box(18, 0.26, 10, 4, 0.03, 0.6, 0xf2f2ee); // ヘリポート
  for (let i = 0; i < 4; i++) { const x = -22 + i * 7; g.box(x, 0.25, 5, 2.4, 2.4, 7.4, i === 3 ? 0xf2f2ee : 0xc0322b); g.box(x, 1.1, 5, 2.46, 0.3, 7.5, i === 3 ? 0xc0322b : 0xf2f2ee); }
  slab(c, -8, 8, 36, 20, 0xcfcbc2, 0.07); tree(c, -26, 26, 1.0); tree(c, 26, 26, 0.9);
}
export function modelShelter(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b6ae);
  const g = c.g;
  g.box(-3, 0, -4, 14, 5.4, 10, dull(c, 0xd8d4c8, 0xbdb7a8)); g.gable(-3, 5.4, -4, 14, 10, 1.2, 0x6f7a86, 'x', 0xd8d4c8, 0.5);
  g.box(-3, 0, 1.06, 5, 4, 0.12, 0x8b8f93); sign(c, '防災', 0, 4, 3.0, 1.04, 2.4);
  g.box(8, 0, 6, 1.2, 3.2, 1.2, 0x2f6fb5); g.cyl(8, 3.2, 6, 1.4, 1.2, 0x2f6fb5, 10); // 給水タンク
  for (let i = 0; i < 3; i++) g.box(-8 + i * 3, 0, 8, 2.4, 1.4, 1.8, 0x5a7a5a);
  standSign(c, '防災', -9, 11, 0.9, 1.6, true); tree(c, 11, -11, 0.9);
}
export function modelBasin(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x86b86a);
  const g = c.g;
  g.box(0, -3, 0, 50, 3.2, 50, 0x9aa38a, 0x9aa38a); g.box(0, -2.5, 0, 44, 0.2, 44, 0x6f9a7a); g.box(0, -2.2, 0, 30, 0.12, 30, 0x4f8fb0);
  for (const [x, z, sx, sz] of [[0, 25.5, 52, 1], [0, -25.5, 52, 1], [25.5, 0, 1, 52], [-25.5, 0, 1, 52]]) g.box(x, 0, z, sx, 1.2, sz, 0x6f9a7a);
  g.box(18, -2.4, 18, 6, 3, 2, 0xb9b6ae); fenceRect(c, 57.6, 57.6, 1.6, 0x7f9a8a, 8);
  for (let i = 0; i < 6; i++) tree(c, -27 + i * 10.8, 28, 0.85, i % 2);
}
export function modelWaterS(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x9ab07a);
  const g = c.g, tank = dull(c, 0xc9d6dc, 0xb8a892);
  g.cyl(-3, 0, -3, 8, 7, tank, 16, dull(c, 0xdde6ea, 0xc4b8a4)); g.cyl(-3, 4.8, -3, 8.1, 0.7, 0x3f7fb0, 16);
  g.box(8, 0, 6, 6, 4, 6, 0xe6e0d0, 0x9b9d9e); sign(c, '水道', 0, 8, 2.2, 9.02, 3.0);
  fenceRect(c, 27.6, 27.6, 1.8, 0x8ea596, 6); tree(c, -11, 11, 0.8, 1);
}
export function modelWaterL(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x9ab07a);
  const g = c.g, tank = dull(c, 0xc9d6dc, 0xb8a892), band = 0x3f7fb0;
  for (const [x, z] of [[-26, -26], [-4, -26], [18, -26]]) { g.cyl(x, 0, z, 9.5, 9, tank, 16, dull(c, 0xdde6ea, 0xc4b8a4)); g.cyl(x, 6.2, z, 9.6, 0.9, band, 16); }
  for (let i = 0; i < 5; i++) { g.box(-30 + i * 13, 0, 8, 11, 1.4, 26, 0xb9b6ae); g.box(-30 + i * 13, 1.3, 8, 9.6, 0.14, 24, c.old ? 0x5f8f8a : 0x4f9fc9); }
  block(c, 30, 26, 18, 14, 3, 0xe6e0d0, { label: '水道', band });
  fenceRect(c, 87.6, 87.6, 1.9, 0x8ea596, 10);
  for (let i = 0; i < 8; i++) tree(c, -42 + i * 12, 42, 0.9, 1);
}
function sewageModel(c: Ctx, sx: number, sz: number, n: number): void {
  pad(c, sx, sz, 0x9aa38a);
  const g = c.g;
  const cw = (sx - 22) / n;
  for (let i = 0; i < n; i++) { const x = -sx / 2 + 4 + cw * (i + 0.5); g.box(x, 0, -2, cw - 2, 1.5, sz - 12, 0xb9b6ae); g.box(x, 1.4, -2, cw - 3.4, 0.14, sz - 14, c.old ? 0x6f7f6a : 0x5f8f7a); }
  for (let i = 0; i < Math.max(1, n - 2); i++) { const x = sx / 2 - 9; g.cyl(x, 0, -sz / 2 + 9 + i * 12, 4.5, 3, 0xc9cdd0, 14); g.cyl(x, 2.8, -sz / 2 + 9 + i * 12, 4, 0.2, 0x6f8f6a, 14); }
  block(c, sx / 2 - 9, sz / 2 - 6, 14, 8, 2, 0xe6e0d0, { label: '下水', band: 0x2b6a8c });
  fenceRect(c, sx - 0.8, sz - 0.8, 1.8, 0x8ea596, 8);
}
export function modelSewageS(c: Ctx): void { sewageModel(c, 58.4, 28.4, 3); }
export function modelSewage(c: Ctx): void { sewageModel(c, 88.4, 58.4, 5); }
export function modelWasteL(c: Ctx): void {
  pad(c, 88.4, 58.4, 0x8a8f94);
  const g = c.g, wall = dull(c, 0xe1ddd2, 0xc2bcae);
  g.box(-10, 0, -6, 50, 22, 32, wall, 0x9b9d9e); g.box(-10, 22, -6, 50.4, 1, 32.4, 0x2f6b4f);
  winRow(c, 0, -32, 12, 14, 10, 8, 3.0, 4, 0.5, 0xb9d0da);
  sign(c, '清掃', 0, -24, 4, 10.04, 4.4); sign(c, '発電', 0, 6, 4, 10.04, 3.6);
  g.cyl(26, 0, -14, 3.2, 58, dull(c, 0xe6e2da, 0xc9c2b4), 14); g.cyl(26, 52, -14, 3.3, 2, 0xc3312b, 14); g.cyl(26, 56, -14, 3.25, 2, 0xc3312b, 14);
  for (let i = 0; i < 3; i++) g.box(-30 + i * 7, 0, 18, 5.6, 5.6, 0.12, 0x8b8f93);
  g.box(24, 0, 14, 10, 3, 10, 0xc9cdd0); slab(c, 0, 20, 70, 14, 0x55585c, 0.07);
  for (let i = 0; i < 3; i++) { const x = 4 + i * 8; g.box(x, 0.3, 22, 2.3, 2.6, 5.2, 0x3f8fb5); g.box(x, 0.3, 25.8, 2.2, 2.0, 2.2, 0xf2f2ee); }
  fenceRect(c, 87.6, 57.6, 1.9, 0x8ea596, 10); for (const x of [-42, 42]) tree(c, x, 27, 1.0, 1);
}
export function modelSolar(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x9ab07a);
  const g = c.g;
  for (let r = 0; r < 9; r++) for (let k = 0; k < 4; k++) {
    const x = -32 + k * 20, z = -38 + r * 8.6;
    g.box(x, 0, z + 1.4, 0.2, 1.6, 0.2, 0x8b8f93); g.box(x, 0, z - 1.4, 0.2, 0.7, 0.2, 0x8b8f93);
    g.quad([x - 8.8, 0.8, z + 1.6], [x + 8.8, 0.8, z + 1.6], [x + 8.8, 2.0, z - 1.8], [x - 8.8, 2.0, z - 1.8], c.old ? 0x3a4a5a : 0x24365a);
  }
  g.box(36, 0, 36, 8, 3.2, 6, 0xe6e0d0); sign(c, '発電', 0, 36, 1.4, 39.02, 2.6);
  fenceRect(c, 87.6, 87.6, 1.8, 0x8ea596, 12);
}
export function modelSubstation(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x9a9a8e);
  const g = c.g;
  for (let i = 0; i < 3; i++) { const x = -16 + i * 14; g.box(x, 0, -6, 7, 5, 5, 0x8a929a); for (const dx of [-2, 0, 2]) g.cyl(x + dx, 5, -6, 0.35, 2.4, 0xb9845a, 6); }
  for (const x of [-22, -6, 10, 24]) { g.box(x, 0, 12, 0.5, 14, 0.5, 0x9aa0a6); g.box(x, 12, 12, 0.4, 0.4, 14, 0x9aa0a6); }
  g.box(1, 13.5, 12, 48, 0.08, 0.08, 0x2c2e30); g.box(1, 11.5, 12, 48, 0.08, 0.08, 0x2c2e30);
  block(c, 20, -20, 12, 8, 2, 0xe6e0d0, { label: '発電' });
  fenceRect(c, 57.6, 57.6, 2.4, 0x7f8a8a, 8);
}
export function modelGas(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x9a9a8e);
  const g = c.g;
  g.blob(-3, 7.2, -3, 7, 7, 7, 0xe8ecef, 16); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.cyl(-3 + Math.cos(a) * 6, 0, -3 + Math.sin(a) * 6, 0.3, 6, 0x8b9094, 5); }
  g.box(8, 0, 7, 5, 3, 5, 0xe6e0d0); sign(c, 'ガス', 0, 8, 1.6, 9.52, 2.0);
  fenceRect(c, 27.6, 27.6, 2.0, 0x7f8a8a, 6);
}
export function modelPolice(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xb9b6ae);
  const g = c.g;
  block(c, -4, -10, 40, 20, 5, dull(c, 0xe8e4da, 0xccc6b8), { label: '警察署', band: 0x2c3e5c });
  g.cyl(18, 19.5, -10, 0.08, 6, 0x8b8f93, 4); g.box(18.6, 24, -10, 1.6, 1, 0.05, 0xf2f2ee);
  parking(c, 0, 16, 50, 14, 10);
  for (let i = 0; i < 3; i++) { const x = -20 + i * 6; g.box(x, 0.3, 16, 1.7, 0.65, 4.1, 0xf2f2ee); g.box(x, 0.3, 16, 1.74, 0.3, 4.14, 0x25282c); g.box(x, 1.5, 15.8, 0.9, 0.14, 0.3, 0xd8322a); }
  tree(c, -26, 26, 1.0); tree(c, 26, -26, 0.9);
}
/** 病院のバリエーション（v64）：ガラスの高層棟＋低層の外来棟（屋上にヘリポート） */
function hospitalTower(c: Ctx, wall: number): void {
  const g = c.g, glass = 0x9fc0d0;
  block(c, -22, -6, 30, 26, 2, wall, { band: 0x7fb8d8, lit: 0.6, glass });               // 外来棟（低層）
  const h = block(c, 4, -12, 22, 20, 12, 0xe8eef2, { band: 0x7fb8d8, lit: 0.55, glass, fh: 3.4 }); // 病棟（高層）
  g.box(4, h - 6.2, -1.95, 13, 6.4, 0.12, 0xffffff); sign(c, '病院', 0, 4, h - 6.0, -1.9, 12); // 高い所の大きな看板
  const top = h + 1.4;
  for (const [dx, dz] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) g.box(4 + dx, h + 0.45, -12 + dz, 0.4, 1.0, 0.4, 0x7a7e82);
  g.box(4, top, -12, 15, 0.3, 15, 0x5a5e62); g.cyl(4, top + 0.3, -12, 6, 0.03, 0xf2f2ee, 20); g.cyl(4, top + 0.33, -12, 5.2, 0.03, 0x5a5e62, 20);
  g.box(4, top + 0.36, -12, 2.8, 0.02, 0.6, 0xf2f2ee); g.box(2.6, top + 0.36, -12, 0.6, 0.02, 4.4, 0xf2f2ee); g.box(5.4, top + 0.36, -12, 0.6, 0.02, 4.4, 0xf2f2ee); // 「H」
  g.box(-22, 0, 9, 18, 3.4, 3.6, glass); g.box(-22, 3.4, 10, 22, 0.3, 6.5, 0xd9d6cf); sign(c, '病院', 0, -22, 1.4, 10.85, 2.8); // 正面玄関のガラスの風除室
  g.box(26, 0.3, 4, 2.2, 2.5, 5.4, 0xf2f2ee); g.box(26, 1.2, 4, 2.24, 0.25, 5.44, 0xd8322a); g.box(26, 3.0, -2, 9, 0.3, 6, 0xf2f2ee); g.box(26, 2.6, 0.95, 9, 0.4, 0.12, 0xd8322a); for (const sx of [-1, 1]) g.cyl(26 + sx * 4.2, 0, 0.8, 0.12, 3.0, 0xd9d9d4, 6); g.box(26, 0, -4.6, 6, 2.8, 0.1, 0x3a4a56); // 救急入口（白いひさしと赤い帯）
  parking(c, -10, 20, 60, 14, 14);
  for (let i = 0; i < 4; i++) tree(c, 24 + (i % 2) * 8, -22 + Math.floor(i / 2) * 9, 0.85);
}
/** 病院のバリエーション（v64）：中庭を囲む低層の病院（郊外型） */
function hospitalLow(c: Ctx, wall: number): void {
  const g = c.g, band = 0xd8b88a, roof = 0x6f7a86;
  { const h = block(c, -10, -20, 56, 12, 4, wall, { band, lit: 0.55, roof }); sign(c, '病院', 0, -10, h - 4.2, -13.9, 8); }
  block(c, -32, -2, 12, 24, 3, wall, { band, lit: 0.5, roof });
  block(c, 12, -2, 12, 24, 3, wall, { band, lit: 0.5, roof });
  slab(c, -10, -2, 30, 22, 0x86b86a, 0.06);                                                         // 中庭
  for (let i = 0; i < 4; i++) tree(c, -20 + i * 6.5, -2 + (i % 2 ? 4 : -4), 0.8, i === 1 ? 2 : 0);
  g.cyl(-10, 0, -2, 2.2, 0.5, 0xb9b6ae, 12); g.cyl(-10, 0.5, -2, 1.8, 0.05, 0x6aa0c8, 12);           // 噴水
  g.box(-10, 0, -12.6, 10, 3.6, 3, 0xd9d6cf); g.box(-10, 3.6, -11.4, 12, 0.3, 6, band);              // 玄関
  g.box(32, 0.3, -14, 2.2, 2.5, 5.4, 0xf2f2ee); g.box(32, 1.2, -14, 2.24, 0.25, 5.44, 0xd8322a);
  parking(c, -10, 20, 66, 14, 14);
}
export function modelHospital(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xb9b6ae);
  const g = c.g, wall = dull(c, 0xf3f3ee, 0xd6d3cb);
  { const v = (c.rnd() + dh(g.ox * 0.013, g.oz * 0.017, 9)) % 1; if (v < 0.36) { hospitalTower(c, wall); return; } if (v < 0.68) { hospitalLow(c, wall); return; } }
  { const h = block(c, -14, -12, 50, 18, 7, wall, { band: 0xa9d1bd, lit: 0.6 }); g.box(-14, h - 5.6, -2.95, 13, 5.2, 0.12, 0xffffff); sign(c, '病院', 0, -14, h - 5.4, -2.9, 10); }
  block(c, 22, -14, 20, 16, 4, wall, { band: 0xa9d1bd, lit: 0.5 });
  g.box(-14, 26.2, -12, 12, 0.2, 12, 0x8a8f94); g.cyl(-14, 26.4, -12, 4.5, 0.05, 0xf2f2ee, 16);
  g.box(22, 0, 0.5, 14, 3.6, 4, 0xa9d1bd); g.box(22, 3.6, 2, 16, 0.3, 7, 0xd9d6cf); sign(c, '病院', 0, 22, 1.2, 2.52, 2.4);
  // 救急車
  g.box(30, 0.3, 6, 2.2, 2.5, 5.4, 0xf2f2ee); g.box(30, 1.2, 6, 2.24, 0.25, 5.44, 0xd8322a);
  parking(c, -16, 20, 52, 14, 12);
  for (let i = 0; i < 5; i++) tree(c, 14 + i * 6.5, 25, 0.85);
}
function libModel(c: Ctx, sx: number, sz: number, big: boolean): void {
  pad(c, sx, sz, 0xc8c2b6);
  const g = c.g, wall = dull(c, 0xe8dcc4, 0xccbea6);
  if (big) {
    g.box(-6, 0, -8, 34, 12, 26, wall, 0x6f7a86); g.box(-6, 12, -8, 34.6, 0.6, 26.6, 0x3b5b7a);
    for (let i = 0; i < 8; i++) g.box(-21 + i * 4.3, 0, 5.1, 3.2, 10, 0.1, 0xa9c4d4);
    g.box(-6, 0, 7, 20, 4, 2, 0xd6d3cb); sign(c, '図書館', 0, -6, 7.4, 5.1, 4.4);
    g.cyl(18, 0, -14, 6, 14, wall, 16, 0x3b5b7a); winRow(c, 0, 13, 23, 5, -8.2, 3, 2, 4, 0.5);
    slab(c, 0, 20, 50, 12, 0xd8d2c4, 0.07); for (let i = 0; i < 6; i++) tree(c, -24 + i * 9.6, 25, 0.9, i % 3 === 0 ? 2 : 0);
  } else {
    g.box(-2, 0, -4, 18, 7, 12, wall, 0x6f7a86); g.box(-2, 7, -4, 18.4, 0.5, 12.4, 0x3b5b7a);
    winRow(c, 0, -10, 6, 1.2, 2, 4, 2.6, 4.4, 0.5, 0xa9c4d4); sign(c, '図書館', 0, -2, 5.6, 2.02, 3.0);
    tree(c, 10, 10, 0.9); tree(c, -10, 10, 0.8, 2); slab(c, -2, 8, 18, 6, 0xd8d2c4, 0.07);
  }
}
export function modelLibraryS(c: Ctx): void { libModel(c, 28.4, 28.4, false); }
export function modelLibrary(c: Ctx): void { libModel(c, 58.4, 58.4, true); }
export function modelHall(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xc8c2b6);
  const g = c.g, wall = dull(c, 0xe6e0d6, 0xc9c2b4);
  g.box(-8, 0, -6, 46, 14, 30, wall, 0x6f7a86); g.box(-8, 14, -6, 46.6, 0.6, 30.6, 0x4a3a6b);
  g.box(-16, 14, -10, 22, 8, 16, wall, 0x4a3a6b); // 舞台の塔
  for (let i = 0; i < 10; i++) g.box(-29 + i * 4.6, 0, 9.1, 3.4, 12, 0.1, 0xa9b8c8);
  g.box(-8, 9, 11, 30, 0.4, 6, 0x4a3a6b); sign(c, 'ホール', 0, -8, 10.4, 9.1, 5.2);
  slab(c, 0, 20, 80, 14, 0xd8d2c4, 0.07); g.cyl(30, 0, 18, 3, 0.6, 0xb9b6ae, 12); g.blob(30, 2.6, 18, 1.4, 2.4, 1.4, 0x9a6a3a, 8); // 彫刻
  for (let i = 0; i < 8; i++) tree(c, -40 + i * 10, 26, 0.95, i % 3 === 0 ? 2 : 0);
  parking(c, 30, -20, 22, 14, 6);
}
export function modelMuseum(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x86b86a);
  const g = c.g, wall = dull(c, 0xf2efe8, 0xd6d0c4);
  g.box(-10, 0, -10, 40, 10, 40, wall, 0x9b9d9e); g.box(-10, 10, -10, 41, 0.6, 41, 0x1a1a1a);
  g.cyl(16, 0, 14, 12, 16, wall, 24, 0x2a2a2e); // 円筒の展示棟
  for (let i = 0; i < 6; i++) g.box(-26 + i * 6, 0, 10.1, 4.6, 8, 0.1, 0x9fb0bc);
  sign(c, '美術館', 0, -10, 6.2, 10.06, 5.0);
  g.box(-10, 0.05, 26, 40, 0.2, 12, 0x4f8fb0); // 水盤
  g.blob(-26, 3, 30, 2.2, 3, 2.2, 0xc3312b, 8); g.blob(6, 2.5, 30, 2.5, 2.5, 2.5, 0xf2c230, 8);
  for (let i = 0; i < 10; i++) tree(c, -42 + i * 9.4, -40, 1.0, i % 4 === 0 ? 2 : 0);
}
export function modelTower(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xc8c2b6);
  const g = c.g;
  if (!c.lm?.has('tower')) towerBody(c);
  g.box(0, 0, 18, 30, 5, 10, 0xe6e0d6, 0x6f7a86); sign(c, 'タワー', 0, 0, 2.2, 23.02, 4.0);
  slab(c, 0, 0, 50, 30, 0xd8d2c4, 0.07); for (const x of [-24, 24]) tree(c, x, 24, 1.0, 2);
}
function towerBody(c: Ctx): void {
  const g = c.g;
  for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) { g.box(x * 0.9, 0, z * 0.9, 1.6, 60, 1.6, 0xc3312b); }
  for (let k = 0; k < 6; k++) { const y = 8 + k * 9, s = 15 - k * 1.8; g.box(0, y, -s / 2, s, 0.5, 0.5, 0xc3312b); g.box(0, y, s / 2, s, 0.5, 0.5, 0xc3312b); g.box(-s / 2, y, 0, 0.5, 0.5, s, 0xc3312b); g.box(s / 2, y, 0, 0.5, 0.5, s, 0xc3312b); }
  g.box(0, 0, 0, 3.6, 92, 3.6, 0xe6e0d6);
  g.cyl(0, 62, 0, 9, 7, 0xd9d6cf, 18, 0x6f7a86); for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; win(c, 0, Math.cos(a) * 8.9, 63.5, Math.sin(a) * 8.9, 2.4, 3.5, 0.7); }
  g.cyl(0, 69, 0, 7, 1.5, 0xc3312b, 18); g.cyl(0, 92, 0, 0.6, 22, 0xe6e0d6, 8); win(c, 0, 0, 113, 0.62, 0.8, 0.8, 1, 0xff5a4a);
}
export function modelStadium(c: Ctx): void {
  pad(c, 118.4, 118.4, 0x9a9a8e);
  const g = c.g, seat = dull(c, 0x2f6fb5, 0x4f6f8f);
  if (c.lm?.has('stadium')) { parking(c, 0, 52, 100, 12, 20); return; }
  g.box(0, 0.08, 0, 70, 0.08, 46, 0x5fae58); g.box(0, 0.12, 0, 0.3, 0.02, 46, 0xf2f2ee); g.cyl(0, 0.1, 0, 6, 0.04, 0xf2f2ee, 20);
  for (const [x, z, sx, sz] of [[0, -32, 86, 12], [0, 32, 86, 12], [-44, 0, 12, 54], [44, 0, 12, 54]]) { g.box(x, 0, z, sx, 14, sz, 0xd6d3cb, seat); }
  g.box(0, 16, -34, 92, 0.6, 18, 0xe6e0d6); for (const x of [-44, -22, 0, 22, 44]) g.box(x, 0, -42, 1, 16, 1, 0xb9b6ae);
  for (const [x, z] of [[-48, -40], [48, -40], [-48, 40], [48, 40]]) { g.box(x, 0, z, 1.2, 34, 1.2, 0xb9b6ae); g.box(x, 34, z, 6, 4, 1, 0xf2f2ee); }
  sign(c, 'スタジアム', 0, 0, 6, 38.02, 9);
  parking(c, 0, 52, 100, 12, 20);
}
export function modelElderly(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xc8c2b6);
  const g = c.g, wall = dull(c, 0xf3e8d6, 0xd6caba);
  block(c, -6, -4, 38, 13, 3, wall, { label: '福祉', band: 0xd9a46a, lit: 0.7 });
  g.box(18, 0, -4, 12, 4, 10, wall); g.gable(18, 4, -4, 12, 10, 1.2, 0xb97f52, 'z', wall, 0.5);
  slab(c, 0, 9, 50, 9, 0xa9c98a, 0.06); for (let i = 0; i < 6; i++) tree(c, -24 + i * 9.5, 11, 0.8, i % 3 === 0 ? 2 : 0);
  g.box(10, 0.3, 9, 1.8, 2.2, 4.4, 0xf2f2ee); g.box(10, 1.4, 9, 1.84, 0.3, 4.44, 0xd9a46a); // 送迎車
}
export function modelCarePlaza(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xc8c2b6);
  const g = c.g, wall = dull(c, 0xf6eedc, 0xd8cdb8);
  g.box(-2, 0, -4, 18, 7, 12, wall, 0x9b9d9e); g.gable(-2, 7, -4, 18, 12, 1.5, 0xb97f52, 'x', wall, 0.6);
  winRow(c, 0, -10, 6, 1.0, 2, 4, 2.4, 2.0, 0.7); winRow(c, 0, -10, 6, 4.4, 2, 4, 2.0, 1.5, 0.5); sign(c, '福祉', 0, 6, 2.6, 2.04, 2.4);
  g.box(-2, 2.6, 3.6, 8, 0.2, 2.4, 0xb97f52); slab(c, 0, 9, 24, 7, 0xd8d2c4, 0.07); bush(c, 8, 9, 0.8, 0xe8c84a); tree(c, -11, 10, 0.8, 2);
}
// ---- 企業 ----
export function modelOffice(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xc8c2b6);
  const g = c.g;
  const h = block(c, -4, -6, 30, 26, 12, dull(c, 0x9fb3c2, 0x8a9aa6), { fh: 3.8, label: 'オフィス', lit: 0.6, glass: 0x6f8fa8, band: 0x5f6b77 });
  g.box(-4, h + 0.4, -6, 10, 3, 8, 0x8b9094);
  slab(c, 0, 18, 52, 14, 0xd8d2c4, 0.07); for (let i = 0; i < 6; i++) tree(c, -24 + i * 9.6, 23, 0.85);
  g.box(18, 0, 8, 8, 3, 6, 0x5f6b77);
}
export function modelFactory(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x8a8f94);
  const g = c.g, wall = dull(c, 0xd8dcd8, 0xbcbfbc);
  for (let i = 0; i < 4; i++) { g.box(-14, 0, -24 + i * 13, 50, 10, 12.6, wall, 0x9b9d9e); g.gable(-14, 10, -24 + i * 13, 50, 12.6, 3, 0x5f8f9a, 'x', wall, 0.3); }
  g.cyl(26, 0, -28, 2.4, 34, 0xc9c2b4, 12); g.cyl(26, 30, -28, 2.5, 2, 0xc3312b, 12); g.cyl(32, 0, -28, 1.6, 24, 0xc9c2b4, 10);
  for (const z of [-10, 4]) { g.cyl(30, 0, z, 5, 12, 0xd6d3cb, 16, 0xb9b6ae); }
  block(c, 26, 26, 22, 12, 3, 0xe6e0d6, { label: '工場' });
  slab(c, -14, 34, 56, 14, 0x55585c, 0.07); for (let i = 0; i < 3; i++) { const x = -30 + i * 10; g.box(x, 0.3, 34, 2.4, 3.2, 8, 0xf2f2ee); g.box(x, 0.3, 39, 2.4, 2.4, 2.4, 0x2b5ea8); }
  fenceRect(c, 87.6, 87.6, 2.0, 0x7f8a8a, 10);
}
export function modelLogistics(c: Ctx): void {
  pad(c, 88.4, 58.4, 0x8a8f94);
  const g = c.g;
  g.box(-8, 0, -8, 66, 14, 36, dull(c, 0xe3e6e8, 0xc4c7c9), 0x9aa0a6); g.box(-8, 14, -8, 66.4, 0.6, 36.4, 0x2b5ea8);
  for (let i = 0; i < 12; i++) { g.box(-38 + i * 5.5, 0, 10.1, 4.4, 4.8, 0.12, 0x8b9094); }
  sign(c, '物流', 0, 18, 8, 10.06, 6);
  slab(c, 0, 20, 84, 14, 0x55585c, 0.07);
  for (let i = 0; i < 6; i++) { const x = -36 + i * 11; g.box(x, 0.3, 18, 2.5, 3.6, 10, 0xf2f2ee); g.box(x, 0.3, 24, 2.5, 2.6, 2.6, [0x2b5ea8, 0xc3312b, 0x2f6b4f][i % 3]); }
  fenceRect(c, 87.6, 57.6, 2.0, 0x7f8a8a, 10);
}
export function modelDatacenter(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x8a8f94);
  const g = c.g;
  g.box(-4, 0, -6, 40, 12, 34, dull(c, 0x5a6470, 0x4a525a), 0x3a4048); g.box(-4, 12, -6, 40.4, 0.4, 34.4, 0x14202e);
  for (let i = 0; i < 12; i++) g.box(-22 + i * 3.4, 12.4, -18, 2.4, 1.6, 6, 0x8b9094); // 冷却塔
  for (let i = 0; i < 10; i++) win(c, 0, -22 + i * 4, 4, 11.06, 2.6, 0.6, 1, 0x7fd0ff);
  sign(c, 'データ', 0, -4, 7.4, 11.06, 4.4);
  for (let i = 0; i < 3; i++) g.box(20, 0, -16 + i * 9, 6, 3, 6, 0xc9cdd0);
  fenceRect(c, 57.6, 57.6, 2.6, 0x5a6066, 6);
}
export function modelHotel(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xc8c2b6);
  const g = c.g;
  const h = block(c, -4, -3, 40, 16, 10, dull(c, 0xe8dcc8, 0xccbea6), { fh: 3.2, label: 'ホテル', lit: 0.7, band: 0x2a2a2e });
  g.box(-4, 0, 6.5, 16, 4.4, 4, 0x2a2a2e); g.box(-4, 4.4, 8, 20, 0.3, 7, 0xe8c87a); sign(c, 'ホテル', 0, -4, h - 2.6, 5.07, 4.2);
  for (const x of [-22, 16, 22]) tree(c, x, 10.5, 0.85);
}
export function modelThemepark(c: Ctx): void {
  pad(c, 148.4, 148.4, 0x86b86a);
  const g = c.g;
  // 観覧車
  g.cyl(30, 0, -30, 1, 4, 0x8b9094, 6); for (const dx of [-6, 6]) g.box(30 + dx * 0.5, 0, -30, 0.8, 26, 0.8, 0xf2f2ee);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, y = 27 + Math.sin(a) * 22, x = 30 + Math.cos(a) * 22; g.box(x, y - 1.5, -30, 2.4, 2.4, 2.4, [0xe86a7a, 0x5aa9d6, 0xf2c94c, 0x7cc36a][i % 4]); g.box((x + 30) / 2, (y + 27) / 2, -30.6, 0.3, 0.3, 0.3, 0xf2f2ee); }
  for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; g.box(30 + Math.cos(a) * 22, 27 + Math.sin(a) * 22, -31, 4.4, 0.4, 0.4, 0xf2f2ee); }
  // お城
  g.box(-30, 0, -30, 26, 14, 20, 0xf3eee6); for (const [x, z] of [[-42, -39], [-18, -39], [-42, -21], [-18, -21]]) { g.cyl(x, 0, z, 3, 22, 0xf3eee6, 10); g.cyl(x, 22, z, 3.6, 7, 0x2f6fb5, 10, undefined, 0.1); }
  g.cyl(-30, 14, -30, 5, 14, 0xf3eee6, 12); g.cyl(-30, 28, -30, 6, 12, 0x2f6fb5, 12, undefined, 0.1);
  // ジェットコースター
  for (let i = 0; i < 24; i++) { const x = -50 + i * 4.4, y = 6 + Math.abs(Math.sin(i * 0.5)) * 18, z = 30 + Math.sin(i * 0.3) * 10; g.box(x, 0, z, 0.5, y, 0.5, 0xc9c2b4); g.box(x, y, z, 4.6, 0.6, 1.8, 0xc3312b); }
  // 入場ゲートと広場・駐車場
  g.box(0, 0, 66, 36, 10, 6, 0xf2c94c); g.box(0, 10, 66, 38, 1, 8, 0xe86a7a); sign(c, 'パーク', 0, 0, 5, 69.02, 8);
  slab(c, 0, 50, 70, 22, 0xd8d2c4, 0.07); g.cyl(0, 0, 50, 5, 0.6, 0xb9b6ae, 14); g.cyl(0, 0.5, 50, 4.4, 0.15, 0x4f8fb0, 14);
  for (let i = 0; i < 20; i++) tree(c, -70 + i * 7.4, 72 - (i % 2) * 2, 0.9, i % 3 === 0 ? 2 : 0);
  for (let i = 0; i < 10; i++) tree(c, -70, -66 + i * 13, 1.0, i % 2);
}


// ---- v6：交通・官公庁・医療・大型施設・レジャー・自然と農業 ----
export function modelAirport(c: Ctx): void {
  pad(c, 178.4, 118.4, 0x8fae6a);
  const g = c.g;
  g.box(0, 0.08, -38, 170, 0.1, 16, 0x4c4f53); for (let x = -80; x <= 80; x += 10) g.box(x, 0.2, -38, 5, 0.02, 0.5, 0xf2f2ee); // 滑走路
  g.box(-80, 0.2, -38, 0.6, 0.02, 14, 0xf2f2ee); g.box(80, 0.2, -38, 0.6, 0.02, 14, 0xf2f2ee);
  g.box(0, 0.08, -20, 120, 0.09, 6, 0x5a5d61); slab(c, 10, -4, 90, 24, 0x6a6d71, 0.09); // 誘導路・エプロン
  const wall = dull(c, 0xe9eef2, 0xc9ced2);
  g.box(10, 0, 18, 70, 12, 18, wall, 0x9aa4ad); winRow(c, 0, -24, 44, 3, 27, 14, 3.6, 6, 0.55, 0x9fc4dc); winRow(c, 1, -24, 44, 3, 9, 14, 3.6, 6, 0.5, 0x9fc4dc);
  g.box(10, 12, 18, 74, 1.2, 22, 0xd0d6dc); sign(c, '空港', 0, 10, 8, 27.04, 6);
  g.cyl(-48, 0, 12, 2.4, 26, 0xe9eef2, 8); g.box(-48, 26, 12, 8, 4, 8, 0x5f7f99, 0x9fc4dc); // 管制塔
  for (const x of [-10, 20, 46]) { // 飛行機
    g.box(x, 2.0, -6, 4, 3.6, 30, 0xf4f4f2); g.box(x, 3.2, -8, 28, 0.6, 6, 0xf4f4f2); g.box(x, 4, 7, 10, 0.4, 3, 0xf4f4f2); g.box(x, 4, 8, 0.4, 6, 3, 0x2f6fb5);
  }
  parking(c, 10, 46, 90, 16, 18); for (let i = 0; i < 10; i++) tree(c, -84 + i * 4, 52, 0.9);
}
export function modelPort(c: Ctx): void {
  pad(c, 118.4, 88.4, 0xb9b6ae);
  const g = c.g, cols = [0xc3312b, 0x2b5ea8, 0x2e7d32, 0xe2a23a, 0x6b7076, 0xe86a2a];
  g.box(0, 0.08, -38, 116, 0.1, 10, 0x8a8f94); // 岸壁
  for (const x of [-30, 10, 40]) { g.box(x - 6, 0, -36, 1.2, 30, 1.2, 0x2e6fb0); g.box(x + 6, 0, -36, 1.2, 30, 1.2, 0x2e6fb0); g.box(x, 30, -40, 2, 2.4, 34, 0x2e6fb0); g.box(x, 24, -36, 14, 1.2, 1.4, 0x2e6fb0); } // ガントリークレーン
  for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) for (let h = 0; h < 1 + ((r + k) % 3); h++) g.box(-46 + k * 9.4, h * 2.7, -18 + r * 7, 6.1, 2.6, 2.5, cols[(r * 7 + k * 3 + h) % cols.length]);
  block(c, 40, 30, 26, 14, 3, dull(c, 0xe9e6df, 0xc9c4b8), { label: '港' });
  parking(c, -26, 32, 50, 14, 10);
}
export function modelIc(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x86b86a);
  const g = c.g, conc = 0xc9c5bc;
  g.box(0, 9, -30, 88, 1.2, 12, conc, 0x55585c); for (let x = -40; x <= 40; x += 10) g.box(x, 0, -30, 2.2, 9, 3, conc); // 高速道路の本線（高架）
  g.box(0, 10.2, -30, 88, 1.0, 0.4, 0xd9d6cf); g.box(0, 10.2, -24.2, 88, 1.0, 0.4, 0xd9d6cf);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 1.5 - Math.PI * 0.25, x = 18 + Math.cos(a) * 16, z = 2 + Math.sin(a) * 16, y = 9 * (1 - i / 24); g.box(x, Math.max(0, y - 0.6), z, 5, 0.6 + (y > 0.6 ? 0 : 0), 5, 0x4c4f53); if (y > 1) g.box(x, 0, z, 1.2, y - 0.6, 1.2, conc); }
  slab(c, -20, 20, 26, 16, 0x5a5d61, 0.1); g.box(-20, 0, 20, 24, 5.2, 1.2, 0xd9d6cf); g.box(-20, 5.2, 20, 26, 0.6, 8, 0x2e7d32); // 料金所
  for (let k = 0; k < 4; k++) g.box(-29 + k * 6, 0, 20, 1.6, 3, 2.4, 0xe9e6df);
  standSign(c, 'IC', -20, 36, 3.5, 4.2, true);
  for (let i = 0; i < 8; i++) tree(c, -40 + i * 10, 40, 1.0);
}
export function modelBusTerminal(c: Ctx): void {
  pad(c, 58.4, 28.4, 0x8f9194);
  const g = c.g;
  g.box(0, 4.2, 0, 50, 0.5, 14, 0xe9e6df, 0xb9bcc0); for (const x of [-22, -8, 8, 22]) g.cyl(x, 0, 0, 0.4, 4.2, 0x9aa0a6, 6);
  for (const x of [-14, 4, 20]) { g.box(x, 0.3, 7, 2.6, 3, 11, 0x2f8a5a); g.box(x, 1.6, 7, 2.64, 1, 11, 0xd9e6dc); }
  g.box(-18, 0, -8, 10, 3.4, 6, 0xf4f1e8); sign(c, 'バスのりば', 0, -18, 2.0, -4.96, 3.6);
}
export function modelCityHall(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xd6d1c6);
  const g = c.g, wall = dull(c, 0xece8df, 0xcfc8b8);
  block(c, -10, -10, 46, 22, 8, wall, { label: '市役所', lit: 0.5, band: 0xb5ad9a });
  block(c, 24, -6, 18, 16, 3, wall, { lit: 0.5 });
  g.cyl(-10, 29.4, -10, 3, 3, 0x9aa0a6, 8); g.box(-10, 32, -10, 0.2, 5, 0.2, 0xd9d9d6); g.box(-8.8, 35.4, -10, 2.2, 1.4, 0.06, 0xf2f2ee);
  slab(c, -10, 14, 40, 14, 0xd9d3c4, 0.08); g.cyl(-10, 0, 16, 4, 0.6, 0xb9b6ae, 14); g.cyl(-10, 0.5, 16, 3.4, 0.12, 0x4f8fb0, 14);
  parking(c, 26, 18, 30, 14, 6); for (let i = 0; i < 6; i++) tree(c, -38 + i * 6, 25, 0.9);
}
export function modelBranchOffice(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xd6d1c6);
  block(c, -6, -3, 38, 14, 3, dull(c, 0xece8df, 0xcfc8b8), { label: '行政センター', lit: 0.5 });
  parking(c, 16, 9, 22, 8, 5); tree(c, -24, 10, 0.9); tree(c, -18, 10, 0.8, 2);
}
export function modelGovOffice(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xb9b6ae);
  block(c, -2, -6, 36, 26, 9, dull(c, 0xd9dde2, 0xb9bfc6), { label: '合同庁舎', lit: 0.45, glass: 0x7f9fb8, band: 0x8a96a3 });
  parking(c, 0, 20, 52, 12, 10);
}
export function modelCourt(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xd6d1c6);
  const g = c.g, wall = dull(c, 0xe2ddd2, 0xc4bdaf);
  block(c, 0, -8, 40, 24, 5, wall, { label: '裁判所', lit: 0.4, band: 0x8f8678 });
  for (let i = 0; i < 6; i++) g.cyl(-15 + i * 6, 0, 5.4, 0.8, 8, 0xf0ece4, 8);
  g.box(0, 8, 5.4, 40, 1.2, 3, wall);
  slab(c, 0, 18, 44, 14, 0xd9d3c4, 0.08); for (let i = 0; i < 6; i++) tree(c, -22 + i * 9, 26, 0.9, 1);
}
export function modelUnivHospital(c: Ctx): void {
  pad(c, 118.4, 88.4, 0xb9b6ae);
  const g = c.g, wall = dull(c, 0xf3f3ee, 0xd6d3cb);
  block(c, -20, -16, 60, 22, 11, wall, { label: '大学病院', band: 0xa9c9e1, lit: 0.65 });
  block(c, 30, -18, 30, 26, 6, wall, { band: 0xa9c9e1, lit: 0.55 });
  block(c, -36, 14, 26, 14, 4, wall, { band: 0xa9c9e1 });
  g.box(-20, 40.2, -16, 14, 0.2, 14, 0x8a8f94); g.cyl(-20, 40.4, -16, 5, 0.05, 0xf2f2ee, 16);
  for (const x of [26, 32]) { g.box(x, 0.3, 6, 2.2, 2.5, 5.4, 0xf2f2ee); g.box(x, 1.2, 6, 2.24, 0.25, 5.44, 0xd8322a); }
  parking(c, 20, 32, 70, 18, 14);
}
export function modelNightClinic(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b6ae);
  const g = c.g;
  block(c, 0, -4, 22, 14, 2, dull(c, 0xf3f3ee, 0xd6d3cb), { label: '急病センター', lit: 0.8, band: 0xd8322a });
  g.box(6, 0.3, 8, 2.2, 2.5, 5.4, 0xf2f2ee); g.box(6, 1.2, 8, 2.24, 0.25, 5.44, 0xd8322a);
}
export function modelUniversity(c: Ctx): void {
  pad(c, 118.4, 118.4, 0x86b86a);
  const g = c.g, brick = dull(c, 0xb5644a, 0x9a6a5a), wall = dull(c, 0xece8df, 0xcfc8b8);
  block(c, -26, -30, 50, 20, 5, brick, { label: '大学', lit: 0.5 });
  block(c, 30, -30, 36, 22, 7, wall, { lit: 0.5, glass: 0x7f9fb8 });
  block(c, -30, 16, 30, 24, 4, wall, { lit: 0.5 });
  g.box(-26, 18.6, -30, 6, 10, 6, brick); g.pyramid(-26, 28.6, -30, 7, 7, 5, 0x3f5f4f); // 時計塔
  g.box(28, 0.08, 18, 50, 0.1, 34, 0x6fae58); g.box(28, 0.08, 18, 42, 0.1, 26, 0xb5553f); g.box(28, 0.12, 18, 34, 0.1, 18, 0x6fae58);
  for (let i = 0; i < 12; i++) tree(c, -52 + i * 9, 52, 1.0, i % 3 === 0 ? 2 : 0);
  for (let i = 0; i < 8; i++) tree(c, -6 + (i % 2) * 8, -6 + Math.floor(i / 2) * 9, 0.9, 3);
}
export function modelConvention(c: Ctx): void {
  pad(c, 88.4, 88.4, 0xc9c5bc);
  const g = c.g;
  g.box(0, 0, -10, 76, 16, 50, dull(c, 0xdfe5ea, 0xbfc6cc), 0x9aa4ad);
  for (let i = 0; i < 6; i++) g.gable(-30 + i * 12, 16, -10, 12, 50, 4, 0xb8c4cc, 'z', 0xdfe5ea, 0.1);
  winRow(c, 0, -36, 36, 2, 15, 12, 5, 9, 0.5, 0x9fc4dc); sign(c, 'コンベンション', 0, 0, 12, 15.1, 10);
  slab(c, 0, 30, 70, 20, 0xd9d3c4, 0.08); for (let i = 0; i < 8; i++) g.box(-28 + i * 8, 0, 24, 0.2, 7, 0.2, 0xd9d9d6);
}
export function modelArena(c: Ctx): void {
  pad(c, 88.4, 88.4, 0xb9b6ae);
  const g = c.g;
  g.cyl(0, 0, -6, 36, 16, dull(c, 0xdfe5ea, 0xbfc6cc), 28, undefined, 34); g.cyl(0, 16, -6, 34, 6, 0x9fb4c2, 28, 0xc9d3db, 18);
  winRow(c, 0, -20, 20, 4, 30, 6, 5, 6, 0.6, 0x9fc4dc); sign(c, 'アリーナ', 0, 0, 10, 30.2, 8);
  slab(c, 0, 38, 80, 12, 0xd9d3c4, 0.08); for (let i = 0; i < 9; i++) tree(c, -40 + i * 10, 42, 0.9);
}
export function modelMall(c: Ctx): void {
  pad(c, 118.4, 118.4, 0x8f9194);
  const g = c.g, wall = dull(c, 0xf1ece2, 0xd2cbbb);
  g.box(0, 0, -24, 100, 14, 56, wall, 0x9b9d9e); g.box(0, 14, -24, 102, 1.2, 58, 0xe86a2a, 0x9b9d9e);
  g.box(0, 0, 4, 30, 18, 6, 0x9fc4dc); sign(c, 'モール', 0, 0, 15, 7.04, 9);
  for (const x of [-34, 34]) { winRow(c, 0, x - 12, x + 12, 2, 4.1, 4, 4, 5, 0.6, 0xb7d0de); sign(c, 'モール', 0, x, 9, 4.1, 5); }
  parking(c, 0, 32, 110, 20, 24); parking(c, 0, 50, 110, 12, 24);
  for (let i = 0; i < 12; i++) tree(c, -55 + i * 10, 57, 0.8);
}
export function modelCinema(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x8f9194);
  const g = c.g;
  g.box(0, 0, -6, 46, 16, 34, dull(c, 0x2a2a2e, 0x3a3a3e), 0x55585c);
  g.box(0, 0, 11.4, 20, 8, 1, 0x9fc4dc); sign(c, 'シネマ', 0, 0, 10, 11.1, 9);
  for (let i = 0; i < 4; i++) g.box(-18 + i * 12, 3, 11.2, 8, 6, 0.2, [0xe86a2a, 0x2b5ea8, 0xf2c94c, 0xc3312b][i]);
  parking(c, 0, 22, 52, 10, 10);
}
export function modelOnsen(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xc9c0ac);
  const g = c.g, wall = dull(c, 0xe6dcc6, 0xc9bda5), roof = dull(c, 0x4a4f55, 0x5a5f65);
  g.box(-4, 0, -8, 36, 6, 22, wall); g.gable(-4, 6, -8, 36, 22, 4, roof, 'x', wall, 1.2);
  sign(c, '湯', 0, -4, 2.6, 3.04, 3.4); g.box(-4, 0, 4, 10, 4.2, 2, 0x5a3f2c); // のれん
  g.cyl(16, 0.05, -12, 6, 0.4, 0x9a9488, 12); g.cyl(16, 0.3, -12, 5.4, 0.15, 0x7fb6c8, 12); for (let i = 0; i < 6; i++) g.blob(10 + i * 2.6, 1, -18, 1.4, 1.2, 1.2, 0x8a8478, 5);
  g.cyl(22, 0, -20, 1.2, 14, 0x8a6f5a, 8);
  parking(c, 0, 20, 52, 12, 10); tree(c, -24, -22, 1.0, 1); tree(c, -24, -12, 1.0, 1);
}
export function modelAquarium(c: Ctx): void {
  pad(c, 88.4, 88.4, 0xd6d1c6);
  const g = c.g;
  g.box(-6, 0, -12, 60, 14, 40, dull(c, 0xe9f1f4, 0xc9d1d4)); g.cyl(-6, 14, -12, 18, 6, 0x5fa9d6, 20, 0x9fd4ea, 8);
  g.box(-6, 0, 8.4, 26, 10, 1, 0x7fc3e0); sign(c, '水族館', 0, -6, 11, 8.6, 8);
  g.cyl(30, 0.05, -18, 10, 0.5, 0x9ab0b8, 18); g.cyl(30, 0.4, -18, 9, 0.2, 0x3f8fc0, 18); // 屋外プール
  for (let i = 0; i < 3; i++) g.box(26 + i * 4, 1, -18 + i, 2.6, 1.2, 1, 0x6f7a86); // イルカの台
  slab(c, 0, 28, 80, 20, 0xd9d3c4, 0.08); for (let i = 0; i < 8; i++) tree(c, -38 + i * 10, 40, 0.9, 1);
}
export function modelZoo(c: Ctx): void {
  pad(c, 118.4, 118.4, 0x86b86a);
  const g = c.g;
  for (const [x, z, col] of [[-30, -30, 0xd9c79c], [20, -30, 0xc9b98c], [-30, 14, 0xb9c98c], [26, 18, 0xd9c79c]] as [number, number, number][]) { slab(c, x, z, 34, 30, col, 0.07); fenceRect2(c, x, z, 34, 30); }
  for (let i = 0; i < 3; i++) { g.box(-34 + i * 5, 0, -30, 1.4, 4.6, 3, 0xd9b26a); g.box(-34 + i * 5, 4.6, -29, 0.6, 4, 0.6, 0xd9b26a); } // キリン
  for (let i = 0; i < 2; i++) g.blob(18 + i * 8, 2.2, -30, 3.4, 2.2, 2, 0x8f9194, 6); // ゾウ
  g.cyl(26, 0.05, 18, 9, 0.3, 0x4f8fb0, 14); for (let i = 0; i < 3; i++) g.blob(22 + i * 4, 0.6, 16, 1.2, 0.6, 0.8, 0x2a2a2e, 5); // ペンギン
  g.box(0, 0, 54, 24, 8, 4, 0x6b4a32); sign(c, '動物園', 0, 0, 5, 56.04, 7);
  for (let i = 0; i < 26; i++) tree(c, -56 + (i % 13) * 9.3, i < 13 ? -56 : 44, 1.0 + c.rnd() * 0.3, i % 4 === 0 ? 1 : 0);
}
function fenceRect2(c: Ctx, x: number, z: number, sx: number, sz: number): void {
  const g = c.g, h = 1.2, t = 0.12, col = 0x8a7a5a;
  g.box(x, 0, z - sz / 2, sx, h, t, col); g.box(x, 0, z + sz / 2, sx, h, t, col); g.box(x - sx / 2, 0, z, t, h, sz, col); g.box(x + sx / 2, 0, z, t, h, sz, col);
}
export function modelGolf(c: Ctx): void {
  pad(c, 148.4, 148.4, 0x6fae58);
  const g = c.g;
  for (let k = 0; k < 4; k++) { const z = -54 + k * 32; slab(c, -10 + (k % 2) * 16, z, 100, 12, 0x86c46a, 0.07); g.cyl(36 - (k % 2) * 70, 0.05, z, 4.5, 0.1, 0x9ad87a, 12); g.box(36 - (k % 2) * 70, 0, z, 0.1, 3, 0.1, 0xf2f2ee); g.box(36.6 - (k % 2) * 70, 2.4, z, 1.2, 0.7, 0.05, 0xc3312b); g.cyl(-20 + k * 8, 0.04, z + 6, 3, 0.08, 0xe9dcb0, 10); }
  for (let i = 0; i < 40; i++) tree(c, -70 + (i % 10) * 15 + c.rnd() * 4, -62 + Math.floor(i / 10) * 32 + 16, 1.0 + c.rnd() * 0.4, i % 3 === 0 ? 1 : 0);
  block(c, 40, 60, 30, 14, 2, dull(c, 0xe6dcc6, 0xc9bda5), { label: 'ゴルフ' });
}
export function modelCamp(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x7aa65a);
  const g = c.g, tents = [0xe86a2a, 0x2b5ea8, 0xf2c94c, 0x2e7d32, 0xc3312b];
  for (let i = 0; i < 10; i++) { const x = -30 + (i % 5) * 14, z = -20 + Math.floor(i / 5) * 18; g.pyramid(x, 0, z, 4.4, 4.4, 3, tents[i % 5]); if (i % 3 === 0) g.box(x + 5, 0.3, z, 1.8, 1.5, 4, 0xd8cdb8); }
  g.cyl(0, 0.05, 6, 2, 0.4, 0x6b6b6b, 8); g.blob(0, 0.6, 6, 0.8, 0.8, 0.8, 0xe88a2a, 5);
  g.box(24, 0, 28, 14, 4, 8, 0x8a6a4a); g.gable(24, 4, 28, 14, 8, 2.4, 0x5a3f2c, 'x', 0x8a6a4a, 0.5); standSign(c, 'キャンプ', 10, 40, 1, 2.4, true);
  for (let i = 0; i < 30; i++) tree(c, -42 + c.rnd() * 84, -42 + c.rnd() * 20 + (i % 2) * 64, 1.0 + c.rnd() * 0.5, c.rnd() < 0.4 ? 1 : 0);
}
export function modelMichinoeki(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x8f9194);
  const g = c.g, wall = dull(c, 0xe6dcc6, 0xc9bda5);
  g.box(-6, 0, -10, 38, 6, 18, wall); g.gable(-6, 6, -10, 38, 18, 4, dull(c, 0x6b4a32, 0x7a6a5a), 'x', wall, 1.4);
  winRow(c, 0, -22, 10, 1, -0.9, 6, 4, 3.2, 0.6, 0xd7e6ea); sign(c, '道の駅', 0, -6, 6.6, -0.6, 5);
  for (let i = 0; i < 5; i++) g.box(-18 + i * 6, 0, 3, 4, 1.2, 2, [0xc3312b, 0xf2c94c, 0x6aa352, 0xe86a2a, 0x8a6aa0][i]); // 野菜の台
  parking(c, 0, 18, 52, 14, 10);
}
export function modelFarm(c: Ctx): void {
 const sv0_ = c.g.surfv; c.g.surfv = -2; // 作物は季節の桜色・紅葉にしない
  pad(c, 58.4, 58.4, 0x8a7a52, 0.04);
  const g = c.g;
  for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) {
    const x = -14 + k * 28, z = -14 + r * 28, rice = (r + k) % 2 === 0;
    slab(c, x, z, 26, 26, rice ? 0x7fa84a : 0x9a7a4a, 0.06);
    if (rice) for (let i = 0; i < 10; i++) g.box(x, 0.12, z - 11 + i * 2.4, 24, 0.25, 0.5, 0x5f8f3a); else for (let i = 0; i < 8; i++) g.box(x - 11 + i * 3, 0.1, z, 1.0, 0.5, 24, 0x6aa352);
  }
  g.box(24, 0, 24, 6, 3.6, 5, 0x8a6a4a); g.gable(24, 3.6, 24, 6, 5, 1.6, 0x6f7a86, 'x', 0x8a6a4a, 0.3); // 農機小屋
  c.g.surfv = sv0_;
}
export function modelAllotment(c: Ctx): void {
 const sv0_ = c.g.surfv; c.g.surfv = -2; // 作物は季節の桜色・紅葉にしない
  pad(c, 28.4, 28.4, 0x8a7a52, 0.04);
  const g = c.g;
  for (let i = 0; i < 12; i++) { const x = -9 + (i % 4) * 6, z = -8 + Math.floor(i / 4) * 7; slab(c, x, z, 5, 5.6, i % 3 === 0 ? 0x6aa352 : 0x9a7a4a, 0.08); if (i % 2) g.blob(x, 0.5, z, 1.6, 0.5, 1.8, 0x5c9a48, 5); }
  standSign(c, '農園', 9, 12, 0.8, 1.6, true);
  c.g.surfv = sv0_;
}
export function modelForestPark(c: Ctx): void {
  pad(c, 118.4, 118.4, 0x6f9a52);
  const g = c.g;
  for (let i = 0; i < 70; i++) tree(c, -54 + c.rnd() * 108, -54 + c.rnd() * 108, 1.0 + c.rnd() * 0.6, c.rnd() < 0.35 ? 1 : c.rnd() < 0.15 ? 3 : 0);
  for (let i = 0; i < 20; i++) slab(c, -50 + i * 5, Math.sin(i * 0.5) * 20, 5.4, 2.4, 0xc9b98c, 0.08); // 散策路
  g.cyl(20, 0.05, -24, 8, 0.3, 0x8a9a7a, 14); g.cyl(20, 0.25, -24, 7, 0.12, 0x4f8fb0, 14);
  g.box(-30, 0, 46, 10, 3, 6, 0x8a6a4a); g.gable(-30, 3, 46, 10, 6, 2, 0x5a3f2c, 'x', 0x8a6a4a, 0.5); standSign(c, '森林公園', -14, 56, 1, 3, true);
}
export function modelRiverPark(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x8fbf6a);
  const g = c.g;
  slab(c, -6, -6, 40, 34, 0x9fcf7a, 0.06); for (const x of [-22, 10]) { g.box(x, 0, -6, 0.2, 2.6, 6, 0xf2f2ee); } g.box(-6, 0.1, -6, 0.2, 0.02, 30, 0xf2f2ee); // 運動場
  slab(c, 0, 20, 56, 4, 0xd6c7a1, 0.08); for (let i = 0; i < 6; i++) tree(c, -24 + i * 10, 26, 0.9, i % 2 ? 2 : 0);
  standSign(c, '公園', 22, 16, 0.9, 1.6, true);
}
export function modelBiotope(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x7aa65a);
  const g = c.g;
  g.cyl(-4, 0.02, -4, 18, 0.2, 0x8a9a6a, 18); g.cyl(-4, 0.12, -4, 16, 0.12, 0x5a9ab0, 18);
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; g.box(-4 + Math.cos(a) * 15, 0, -4 + Math.sin(a) * 15, 0.3, 1.6 + c.rnd(), 0.3, 0x7f9a4a); } // ヨシ
  for (let i = 0; i < 6; i++) g.box(-20 + i * 4, 0.5, 18, 4, 0.2, 1.4, 0x8a6a4a); // 木道
  for (let i = 0; i < 10; i++) tree(c, -24 + c.rnd() * 48, 20 + c.rnd() * 6, 0.9, c.rnd() < 0.5 ? 0 : 1);
}


// ---- v8：業務・工業・新しい技術 ----
const CO_OFFICE = ['オフィス', '商事', '設計', '保険', 'ソフト', '建設', '不動産', 'IT'] as const;
const CO_FACTORY = ['町工場', '精密', '金属', '印刷', '電機', '部品', '塗装', '食品'] as const;
/** 小さなオフィス：社名と形をいくつかの型から選ぶ（同じ街並みが続かないように） */
export function modelOfficeS(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xc8c2b6);
  const g = c.g, type = Math.floor(c.rnd() * 5), label = pick(c, [...CO_OFFICE]), mat = pick(c, [6, 7, 8, 4]), wide = c.rnd() < 0.5; // v86：外壁の素材と窓の形も選ぶ。型 4 は打放しの小さな事務所
  const wall = dull(c, pick(c, [0xc9d1d9, 0xd8d2c4, 0xb9c4cc, 0xe0dcd2, 0x9fb0b8, 0xd9c7a8, 0x8f9fa8]), 0xa9b0b6);
  if (type === 0) { block(c, 0, -2, 20, 18, 4 + Math.floor(c.rnd() * 3), wall, { fh: 3.6, label, lit: 0.6, glass: 0x6f8fa8, mat, wide }); g.box(9, 0, 10, 6, 0.1, 4, 0x55585c); }
  else if (type === 1) { // ガラス張りの角ばったビル
    const h = block(c, -2, -3, 16, 16, 6 + Math.floor(c.rnd() * 3), dull(c, 0x6f8fa8, 0x5f7a8a), { fh: 3.5, label, lit: 0.65, glass: 0x4f7a9a, band: 0x2f3a44 });
    g.box(7, 0, 4, 8, 4.4, 10, wall); g.box(-2, h + 0.4, -3, 5, 2, 5, 0x8b9094); parking(c, 6, 11, 14, 5, 3);
  } else if (type === 2) { // 低い横長の事務所と駐車場
    block(c, -1, -6, 24, 12, 2 + Math.floor(c.rnd() * 2), wall, { fh: 3.6, label, lit: 0.5, glass: 0x7f9aac, band: pick(c, [0x2b5ea8, 0x2f6b4f, 0xc3312b, 0x6b4226]), mat: mat === 7 ? 8 : mat, wide: true });
    parking(c, 0, 8, 24, 9, 6);
  } else if (type === 4) { // 打放しの 3 階建ての事務所（正面はガラスの吹き抜け、木の庇）
    const h = block(c, -1, -3, 18, 15, 3, 0xb8b6b0, { fh: 3.4, label, lit: 0.6, glass: 0x6f8fa8, mat: 7, band: 0xa8a6a0 });
    win(c, 0, -6, 0.3, 4.52, 5.0, h - 1.4, 0.7, 0x6f8fa8); g.surfv = 10; g.box(-6, 3.2, 5.4, 6.4, 0.25, 1.8, 0x8a6448); g.surfv = 0; if (c.fine) for (let i = 0; i < 4; i++) g.box(-8.5 + i * 1.66, 0.3, 4.62, 0.08, h - 1.4, 0.08, 0x3a3e42);
    tree(c, 9, 9, 0.85); tree(c, -11, 10, 0.75); parking(c, 6, 10.5, 14, 5, 3);
  } else { // 古い雑居ビル
    const h = block(c, -3, -2, 14, 20, 5 + Math.floor(c.rnd() * 3), dull(c, pick(c, [0xcfc6b4, 0xa88a72, 0xd8d0c0]), 0xb8ae9a), { fh: 3.3, label, lit: 0.5, glass: 0x8fa3ad, mat: 6 });
    for (let f = 1; f < 5; f++) g.box(4.5, f * 3.3, -2, 1.2, 0.15, 16, 0x8b8f93); g.box(-3, h + 0.4, 2, 3, 2.4, 3, 0xe9eef0); tree(c, 9, 9, 0.8);
  }
}
export function modelOfficeM(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xc8c2b6);
  const g = c.g, type = Math.floor(c.rnd() * 3), label = pick(c, [...CO_OFFICE]);
  if (type === 0) { const h = block(c, 0, -1, 22, 20, 11 + Math.floor(c.rnd() * 5), dull(c, 0x8fa9b8, 0x7a8f9c), { fh: 3.8, label, lit: 0.65, glass: 0x5f86a3, band: 0x4a5560, mat: c.rnd() < 0.5 ? 6 : 1, wide: c.rnd() < 0.5 }); g.box(0, h + 0.4, -1, 8, 2.6, 8, 0x8b9094); }
  else if (type === 1) { // 低層部と細い塔
    g.box(0, 0, 1, 24, 7, 22, dull(c, 0xd8d2c4, 0xb9b3a6), 0x9b9d9e);
    const h = block(c, -2, -2, 15, 15, 14 + Math.floor(c.rnd() * 6), dull(c, pick(c, [0x5f7a8a, 0x8a9aa6, 0xb9a88f]), 0x7a8f9c), { fh: 3.6, label, lit: 0.65, glass: 0x4f7a9a, band: 0x2f3a44 });
    g.box(-2, h + 0.4, -2, 0.3, 8, 0.3, 0xd9d9d6);
  } else { // 段々の白いビル
    const fl = 9 + Math.floor(c.rnd() * 4);
    block(c, 0, 0, 24, 22, Math.floor(fl / 2), dull(c, 0xeceae4, 0xc9c6bf), { fh: 3.6, lit: 0.6, glass: 0x6f8fa8, mat: 8 });
    block(c, -2, -2, 18, 16, fl, dull(c, 0xeceae4, 0xc9c6bf), { fh: 3.6, label, lit: 0.6, glass: 0x6f8fa8, band: pick(c, [0x2b5ea8, 0xc3312b, 0x2f6b4f]), mat: 8, wide: true });
  }
}
/** 町工場：のこぎり屋根・かまぼこ屋根・2 階建ての事務所つきなど */
export function modelSmallFactory(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x8a8f94);
  const g = c.g, wall = dull(c, pick(c, [0xd8dcd8, 0xe4ded2, 0xc9d1d9, 0xb9c4b0, 0x8a9aa4, 0x6f7f8a]), 0xbcbfbc), type = Math.floor(c.rnd() * 3), label = pick(c, [...CO_FACTORY]), sv0 = g.wallMat;
  g.wallMat = 5; // v86：工場の壁はガルバの波板。正面に大きなシャッター・高窓・換気扇、屋根に換気筒
  const front = (x: number, fz: number, sw: number, hh: number) => { g.box(x, 0, fz + 0.06, sw, hh, 0.1, 0x8a9094); if (c.fine) { for (let i = 1; i < 8; i++) g.box(x, i * hh / 8, fz + 0.12, sw - 0.1, 0.04, 0.04, 0x6b7076); g.box(x, hh, fz + 0.2, sw + 0.4, 0.4, 0.4, 0x7a8086); } };
  if (type === 0) { g.box(-2, 0, -3, 20, 6.5, 16, wall, 0x9b9d9e); g.wallMat = sv0; g.gable(-2, 6.5, -3, 20, 16, 2, pick(c, [0x6f8a9a, 0x8a5a4a, 0x5a6f5a]), 'x', wall, 0.3); g.cyl(9, 0, -8, 0.9, 12, 0xc9c2b4, 8);
    front(-6, 5, 5.0, 4.4); winRow(c, 0, -1, 7, 4.8, 5, 3, 1.4, 0.9, 0.4); g.box(5.5, 0, 5.06, 0.9, 2.1, 0.1, 0x5a646b);
    if (c.fine) for (const x of [-8, 0, 6]) { g.cyl(x, 8.3, -3, 0.35, 0.6, 0x9aa0a4, 6); g.cyl(x, 8.9, -3, 0.5, 0.18, 0x9aa0a4, 6); } } // 換気筒
  else if (type === 1) { // のこぎり屋根
    g.box(-2, 0, -3, 22, 5.5, 18, wall, 0x9b9d9e); g.wallMat = sv0;
    for (let i = 0; i < 4; i++) { g.box(-2, 5.5 + 1.2, -10 + i * 4.6, 22, 2.4, 0.3, 0x9fb8c8); g.gable(-2, 5.5, -9.5 + i * 4.6, 22, 3.8, 2.2, 0x7a7f84, 'x', wall, 0.1); }
    front(-7, 6, 5.0, 4.2); winRow(c, 0, -3, 8, 1.2, 6, 3, 1.6, 1.1, 0.5);
  } else { // 工場と 2 階建ての事務所
    g.box(-4, 0, -4, 16, 7, 16, wall, 0x9b9d9e); g.wallMat = sv0; g.box(-4, 7, -4, 16.3, 0.4, 16.3, 0x8b9094);
    block(c, 8, 4, 8, 8, 2, dull(c, 0xeceae4, 0xc9c6bf), { fh: 3.2, lit: 0.6, mat: 8 });
    front(-4, 4, 6, 4.6); winRow(c, 0, -10, 2, 5.6, 4, 4, 1.2, 0.8, 0.4);
  }
  g.wallMat = sv0;
  if (c.fine) { g.box(-10, 0, 9, 2.4, 1.2, 1.2, 0x4f7a9a); g.box(-7.4, 0, 9.5, 1.2, 0.15, 1.0, 0x8a6448); g.box(-7.4, 0.15, 9.5, 1.0, 0.6, 0.8, 0xa07a58); g.box(-12, 0, 2, 0.5, 2.2, 3.0, 0x6b7076); } // 部品の箱・パレット・ボンベ置き場
  sign(c, label, 0, -2, 2.8, type === 2 ? 4.06 : type === 1 ? 6.04 : 5.04, 3.2);
  g.box(8, 0.3, 9, 2.2, 2.4, 4.6, 0xf2f2ee); if (c.rnd() < 0.5) g.box(4, 0, 11, 3, 1.2, 2, 0x5a7a9a);
}
export function modelHqTower(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xc8c2b6);
  const g = c.g;
  const h = block(c, -2, -4, 30, 26, 30, dull(c, 0x6f8fa8, 0x5f7a8a), { fh: 4, label: '本社', lit: 0.7, glass: 0x4f7a9a, band: 0x2f3a44 });
  g.box(-2, h + 0.4, -4, 14, 6, 10, 0x2f3a44); g.box(-2, h + 6.4, -4, 0.3, 12, 0.3, 0xd9d9d6);
  slab(c, 0, 20, 52, 12, 0xd8d2c4, 0.07); g.cyl(14, 0, 20, 3, 0.5, 0xb9b6ae, 12); g.cyl(14, 0.4, 20, 2.6, 0.1, 0x4f8fb0, 12);
  for (let i = 0; i < 5; i++) tree(c, -22 + i * 7, 24, 0.85);
}
export function modelRadioTower(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b6ae);
  const g = c.g;
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) g.box(x * 0.6, 0, z * 0.6, 0.4, 34, 0.4, 0xc3312b);
  for (let y = 4; y < 34; y += 5) g.box(0, y, 0, 4, 0.3, 4, y % 10 < 5 ? 0xf2f2ee : 0xc3312b);
  for (let k = 0; k < 3; k++) g.box(0, 30 - k * 4, 2.6, 1.2, 2.4, 0.4, 0xe9e9e4);
  g.box(-8, 0, 6, 6, 3, 5, 0xe9e6df); standSign(c, '5G', 8, 10, 0.8, 1.4, true);
  fenceRect(c, 27.6, 27.6, 2.0, 0x8a9094, 4);
}
export function modelFiberHub(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b6ae);
  const g = c.g;
  block(c, 0, -3, 20, 14, 3, dull(c, 0xe9e6df, 0xc9c4b8), { label: '光回線', lit: 0.3 });
  for (let i = 0; i < 4; i++) g.cyl(-8 + i * 5, 0, 9, 0.2, 7, 0x6b5a48, 5);
  g.box(0, 6.6, 9, 22, 0.08, 0.08, 0x2a2a2e); g.box(0, 6.2, 9, 22, 0.08, 0.08, 0x1f8fc8);
}
export function modelEvStation(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x55585c);
  const g = c.g;
  g.box(0, 5, 0, 22, 0.5, 12, 0xe9e9e4); for (const x of [-9, 9]) g.cyl(x, 0, 0, 0.3, 5, 0x9aa0a6, 6);
  for (let i = 0; i < 4; i++) { g.box(-7.5 + i * 5, 0, -2.5, 0.8, 1.8, 0.6, 0x2e7d32); if (i % 2 === 0) car(c, -7.5 + i * 5, 2, false); }
  standSign(c, 'EV', 10, 9, 2.4, 1.6, true);
}
export function modelSmartSignal(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xc8c2b6);
  const g = c.g;
  block(c, 0, -2, 22, 16, 3, dull(c, 0x2f3a44, 0x2a3036), { label: '信号', lit: 0.8, glass: 0x7fd0ff, band: 0x1f8fc8 });
  g.cyl(8, 9.2, -6, 2.4, 0.5, 0xd9d9d6, 12); g.box(8, 9.2, -6, 0.2, 3, 0.2, 0xd9d9d6);
}
export function modelAutoBusDepot(c: Ctx): void {
  pad(c, 58.4, 28.4, 0x8f9194);
  const g = c.g;
  g.box(-8, 0, -4, 36, 7, 14, dull(c, 0xe9eef2, 0xc9ced2), 0x9aa4ad); sign(c, '自動運転', 0, -8, 4, 3.04, 5);
  for (let i = 0; i < 4; i++) { const x = -20 + i * 7; g.box(x, 0.3, 9, 2.6, 3, 8, 0xf4f4f2); g.box(x, 1.4, 9, 2.64, 1.2, 8.04, 0x7fd0ff); g.box(x, 3.3, 9, 1.2, 0.5, 1.2, 0x2a2a2e); }
}
export function modelVertiport(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xb9b6ae);
  const g = c.g;
  g.box(0, 0, -2, 40, 9, 40, dull(c, 0xe9eef2, 0xc9ced2), 0x5a5d61);
  for (const [x, z] of [[-10, -12], [10, -12], [0, 8]]) { g.cyl(x, 9.05, z, 6, 0.1, 0x3a3d40, 20); g.cyl(x, 9.1, z, 4.6, 0.08, 0xf2c94c, 20); g.cyl(x, 9.15, z, 4.2, 0.08, 0x3a3d40, 20); }
  // 空飛ぶクルマ（四つのローター）
  g.box(-10, 10, -12, 3, 1.4, 4, 0xf4f4f2); for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) g.cyl(-10 + dx, 11, -12 + dz, 1.4, 0.1, 0x2a2a2e, 10);
  sign(c, 'ポート', 0, 0, 4, 18.04, 6);
}
export function modelCityOS(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xc8c2b6);
  const g = c.g;
  block(c, -2, -4, 34, 26, 6, dull(c, 0x2f3a44, 0x2a3036), { label: 'スマートシティ', lit: 0.8, glass: 0x7fd0ff, band: 0x1f8fc8 });
  g.blob(14, 24, -10, 5, 5, 5, 0xe9eef2, 10); g.box(14, 22, -10, 1, 2, 1, 0xd9d9d6);
  slab(c, 0, 20, 52, 12, 0xd8d2c4, 0.07);
}
export function modelFusion(c: Ctx): void {
  pad(c, 118.4, 118.4, 0xb9b6ae);
  const g = c.g;
  g.cyl(-10, 0, -10, 26, 30, dull(c, 0xe9eef2, 0xc9ced2), 32, undefined, 22); g.blob(-10, 30, -10, 22, 10, 22, 0xd9e1e8, 16); // トカマクの建屋
  g.cyl(-10, 40, -10, 4, 2, 0x8a6ad6, 16);
  block(c, 34, -24, 30, 30, 5, dull(c, 0xe9e6df, 0xc9c4b8), { label: '核融合', lit: 0.5 });
  for (let i = 0; i < 4; i++) g.box(30, 0, 18 + i * 8, 26, 6, 5, 0x8b9094); // 変電設備
  for (let i = 0; i < 3; i++) { g.box(-40 + i * 12, 0, 40, 0.6, 30, 0.6, 0xd9d9d6); g.box(-40 + i * 12, 28, 40, 8, 0.4, 0.4, 0xd9d9d6); }
  parking(c, -10, 46, 60, 10, 12);
}
export function modelBallpark(c: Ctx): void {
  pad(c, 118.4, 118.4, 0x9a9a8e);
  const g = c.g, seat = dull(c, 0x2f6fb5, 0x4f6f8f);
  // 扇形のグラウンド（外野の芝と内野の土）
  slab(c, 0, -4, 96, 92, 0x5fae58, 0.08); for (let k = 0; k < 6; k++) slab(c, 0, -46 + k * 15, 96, 7, 0x6bbb62, 0.09); // 外野の芝（刈り目）
  g.box(0, 0.12, 22, 30, 0.04, 30, 0xc9a27a); g.box(0, 0.16, 22, 18, 0.04, 18, 0x5fae58); g.cyl(0, 0.16, 22, 1.4, 0.2, 0xc9a27a, 10); for (const [x, z] of [[0, 35], [12, 22], [0, 9], [-12, 22]]) g.box(x, 0.2, z, 1, 0.15, 1, 0xf2f2ee);
  // スタンド
  for (const x of [-54, 54]) g.box(x, 0, 0, 8, 12, 96, seat); g.box(0, 0, -54, 116, 8, 8, dull(c, 0x2e7d32, 0x4f6f5f)); // 内野・外野スタンド
  g.box(0, 0, 50, 60, 14, 10, seat); g.box(0, 14, 50, 62, 1.2, 12, 0xe9e9e4);
  for (const x of [-48, 48]) { g.box(x, 0, 40, 1, 34, 1, 0xd9d9d6); g.box(x, 34, 40, 6, 3, 0.6, 0xf2f2ee); } // 照明塔
  sign(c, '野球場', 0, 0, 7, 55.1, 8);
}

// ---- v7：自然・交通・産業・暮らし ----
export function modelBeach(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xe9dcb0);
  const g = c.g, umb = [0xe86a2a, 0x2b5ea8, 0xf2c94c, 0xc3312b, 0x2e7d32];
  slab(c, 0, -20, 88, 16, 0x5aa9d6, 0.1); // 波打ち際
  for (let i = 0; i < 12; i++) { const x = -38 + i * 7, z = -4 + (i % 3) * 5; g.cyl(x, 0, z, 0.08, 2.4, 0xe9e9e4, 4); g.cyl(x, 2.2, z, 1.8, 0.5, umb[i % 5], 8, undefined, 0.1); g.box(x + 1.2, 0.05, z + 1, 1.6, 0.1, 0.8, 0xf2f2ee); }
  g.box(-30, 0, 20, 12, 3.2, 6, 0xf4efe6); g.box(-30, 3.2, 20, 13, 0.4, 7, 0x2b5ea8); sign(c, '海水浴場', 0, -30, 1.4, 23.04, 4);
  g.box(24, 0, 12, 0.3, 4, 0.3, 0xf2f2ee); g.box(24, 4, 12, 2, 0.3, 2, 0xc3312b); // 監視台
  for (let i = 0; i < 6; i++) tree(c, 0 + i * 7, 26, 0.9, 1);
}
export function modelHotSpring(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b6ae);
  const g = c.g;
  g.box(-4, 0, -4, 8, 4, 8, 0xe6dcc6); g.gable(-4, 4, -4, 8, 8, 2, 0x4a4f55, 'x', 0xe6dcc6, 0.6); sign(c, '源泉', 0, -4, 1.8, 0.04, 2.4);
  g.box(6, 0, -6, 1.2, 12, 1.2, 0xc8553a); g.box(6, 12, -6, 3, 1, 3, 0xc8553a); // やぐら
  for (let i = 0; i < 4; i++) g.blob(6 + (i % 2), 13 + i * 1.6, -6, 1.2 + i * 0.3, 0.9, 1.2 + i * 0.3, 0xeeeeea, 5); // 湯けむり
  g.cyl(4, 0.05, 7, 3.5, 0.3, 0x9a9488, 10); g.cyl(4, 0.25, 7, 3, 0.12, 0x7fb6c8, 10);
}
export function modelFlowerPark(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x8fbf6a);
  const g = c.g, fl = [0xf3b9c8, 0xf2c94c, 0xe86a7a, 0xb98ad6, 0xffffff];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) slab(c, -18 + k * 7, -18 + r * 8, 6, 5, fl[(r + k) % 5], 0.12);
  for (let i = 0; i < 9; i++) { tree(c, -25 + i * 6.2, 22, 1.0, 2); tree(c, -25, -24 + i * 5.5, 1.0, 2); }
  slab(c, 0, 14, 56, 3, 0xd6c7a1, 0.08); standSign(c, '花の名所', 18, 26, 0.9, 2.6, true);
}
export function modelTameike(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x8fae6a);
  const g = c.g;
  g.box(0, 0, 0, 52, 1.6, 52, 0x9a9a7a); g.box(0, 0.6, 0, 48, 1.0, 48, 0x4f8fb0); // 堤と水面
  g.box(0, 1.6, 24.6, 30, 0.4, 2, 0xb9b6ae); for (let i = 0; i < 12; i++) tree(c, -26 + i * 4.6, 28, 0.85, i % 3 ? 0 : 2);
}
export function modelLrt(c: Ctx): void {
  pad(c, 88.4, 28.4, 0x8f9194);
  const g = c.g;
  for (const z of [-4, 2]) { g.box(0, 0.12, z, 86, 0.1, 0.25, 0x9aa0a6); g.box(0, 0.12, z + 1.4, 86, 0.1, 0.25, 0x9aa0a6); }
  g.box(-22, 0, -6, 40, 9, 16, dull(c, 0xe9e6df, 0xc9c4b8), 0x9b9d9e); // 車庫
  for (const x of [8, 28]) { g.box(x, 0.4, 2.7, 18, 3.2, 2.6, 0xf2f2ee); g.box(x, 1.4, 2.7, 18.04, 1.4, 2.64, 0x9fc4dc); g.box(x, 0.4, 2.7, 18.06, 0.5, 2.66, 0xc3312b); g.box(x, 3.8, 2.7, 0.1, 1.6, 0.1, 0x333333); }
  g.box(18, 0, 10, 30, 0.5, 4, 0xd9d6cf); g.box(18, 3.2, 10, 30, 0.3, 4, 0x6f7a86); for (const x of [6, 30]) g.box(x, 0, 10, 0.3, 3.2, 0.3, 0x6f7a86);
  sign(c, 'LRT', 0, -22, 6, 2.04, 3.4);
}
export function modelParkingLot(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x4c4f53);
  parkingLines(c, -12, 12, -6, 7, 8); parkingLines(c, -12, 12, 7, 7, 8);
  for (let i = 0; i < 16; i++) if (c.rnd() < 0.6) car(c, -12 + 24 * ((i % 8) + 0.5) / 8, i < 8 ? -6 : 7, false);
  standSign(c, 'P', 12, 13, 2.2, 1.6, true);
}
export function modelIndustrialPark(c: Ctx): void {
  pad(c, 118.4, 118.4, 0xb9b6ae);
  const g = c.g, walls = [0xd9dde2, 0xe9e6df, 0xc9d1d9, 0xdfd6c6];
  slab(c, 0, 0, 116, 8, 0x5a5d61, 0.1); slab(c, 0, 0, 8, 116, 0x5a5d61, 0.1); // 団地内の道路
  for (let k = 0; k < 4; k++) { const x = k % 2 ? 30 : -30, z = k < 2 ? -30 : 30; g.box(x, 0, z, 44, 10 + k * 2, 36, dull(c, walls[k], 0xb9bcc0), 0x8b9094); g.gable(x, 10 + k * 2, z, 44, 36, 2.6, 0x8f9aa3, 'x', walls[k], 0.3); if (k === 1) { g.cyl(x + 14, 0, z - 10, 1.6, 26, 0xc9c5bc, 8); } }
  standSign(c, '工業団地', 8, 56, 3, 4, true);
}
export function modelLab(c: Ctx): void {
  pad(c, 88.4, 58.4, 0x86b86a);
  const g = c.g;
  block(c, -10, -6, 56, 22, 5, dull(c, 0xf3f3ee, 0xd6d3cb), { label: '研究所', glass: 0x7f9fb8, lit: 0.7 });
  g.cyl(26, 0, -10, 7, 8, 0xe9eef2, 16); g.blob(26, 8, -10, 7, 5, 7, 0xe9eef2, 10); // 実験棟のドーム
  parking(c, 0, 20, 70, 12, 14);
}
export function modelFishPort(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xb9b6ae);
  const g = c.g, boats = [0xf2f2ee, 0x2b5ea8, 0xc3312b];
  slab(c, 0, -20, 88, 16, 0x4f8fb0, 0.1);
  for (let i = 0; i < 6; i++) { const x = -34 + i * 13; g.box(x, 0.3, -18, 3.4, 1.6, 9, boats[i % 3]); g.box(x, 1.9, -20, 2.4, 2, 3, 0xf2f2ee); g.box(x, 3.9, -20, 0.2, 4, 0.2, 0x6f7478); }
  g.box(-12, 0, 8, 40, 5, 14, 0xd9d6cf); g.box(-12, 5, 8, 42, 0.4, 16, 0x2b5ea8); sign(c, '漁港', 0, -12, 2, 15.04, 4);
  for (let i = 0; i < 6; i++) g.box(-28 + i * 6, 0, 18, 4, 1, 2, 0xe9e9e4); // 朝市の台
  g.box(26, 0, 12, 10, 10, 10, 0xe9e6df); // 製氷
}
export function modelTourFarm(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x86b86a);
  const g = c.g;
  for (let r = 0; r < 8; r++) for (let k = 0; k < 9; k++) { const x = -38 + k * 6, z = -38 + r * 6; g.box(x, 0, z, 0.15, 1.8, 0.15, 0x6b4a32); g.blob(x, 1.8, z, 1.4, 0.9, 1.0, r % 2 ? 0x5c9a48 : 0x4f8a3c, 5); if ((r + k) % 3 === 0) g.blob(x + 0.5, 1.2, z + 0.6, 0.4, 0.4, 0.4, 0x6b1f3a, 4); }
  g.box(26, 0, 20, 26, 7, 16, dull(c, 0xe6dcc6, 0xc9bda5)); g.gable(26, 7, 20, 26, 16, 4, 0x6b4a32, 'x', 0xe6dcc6, 0.8); sign(c, 'ワイナリー', 0, 26, 3, 28.04, 5);
  for (let i = 0; i < 4; i++) g.cyl(16 + i * 4, 0, 34, 1.4, 5, 0xc9c5bc, 8);
}
export function modelRecycleCenter(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xb9b6ae);
  const g = c.g;
  g.box(-8, 0, -4, 34, 9, 16, dull(c, 0xe9e6df, 0xc9c4b8), 0x8b9094); g.box(-8, 9, -4, 34.3, 0.5, 16.3, 0x2e7d32);
  sign(c, 'リサイクル', 0, -8, 5.5, 4.04, 5);
  for (let i = 0; i < 4; i++) g.box(14 + (i % 2) * 6, 0, -6 + Math.floor(i / 2) * 8, 4.6, 2.2, 3.6, [0x2b5ea8, 0x2e7d32, 0xe2a23a, 0x8b9094][i]); // コンテナ
  g.box(-14, 0.4, 9, 2.4, 2.8, 6, 0x2e7d32);
}

// ---- 工事中 ----
const TARGET_H: Partial<Record<Kind, number>> = { house: 6, apartment: 11, mansion: 30, bakery: 6, shop: 7, supermarket: 9, nursery: 5, school: 12, park: 1, fire: 11, water: 8, waste: 7 };
export function modelConstruction(c: Ctx, kind: Kind, w: number, h: number, progress: number): void {
  const g = c.g, sx = w * 30 - 1.6, sz = h * 30 - 1.6;
  pad(c, sx, sz, 0x9a8468);
  // 仮囲い
  const t = 0.1, fh = 2.2;
  g.box(0, 0, -sz / 2, sx, fh, t, 0xe8e8e4); g.box(-sx / 2, 0, 0, t, fh, sz, 0xe8e8e4); g.box(sx / 2, 0, 0, t, fh, sz, 0xe8e8e4);
  g.box(-(sx + 6) / 4, 0, sz / 2, (sx - 6) / 2, fh, t, 0xe8e8e4); g.box((sx + 6) / 4, 0, sz / 2, (sx - 6) / 2, fh, t, 0xe8e8e4);
  g.box(-(sx + 6) / 4, 1.6, sz / 2 + 0.02, (sx - 6) / 2, 0.3, t, 0xe8862a); g.box((sx + 6) / 4, 1.6, sz / 2 + 0.02, (sx - 6) / 2, 0.3, t, 0xe8862a);
  sign(c, '工事中', 0, -(sx + 6) / 4, 0.5, sz / 2 + 0.1, 2.4);
  const H = (TARGET_H[kind] ?? 8), bw = Math.min(sx - 8, kind === 'house' ? 20 : sx * 0.72), bd = Math.min(sz - 10, sz * 0.5), bz = -sz * 0.12;
  if (kind === 'park') { for (let i = 0; i < 4; i++) g.blob(-6 + i * 4, 0.5, -4 + (i % 2) * 5, 1.6, 0.9, 1.4, 0x8a6f4f, 5); }
  else {
    const cur = Math.max(1.2, H * Math.min(1, progress * 1.15));
    const nx = Math.max(2, Math.round(bw / 6)), nz = Math.max(2, Math.round(bd / 6));
    for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) g.box(-bw / 2 + bw * ix / nx, 0, bz - bd / 2 + bd * iz / nz, 0.28, cur, 0.28, 0x7d858c);
    for (let y = 3; y <= cur + 0.01; y += 3) { for (let iz = 0; iz <= nz; iz++) g.box(0, y - 0.25, bz - bd / 2 + bd * iz / nz, bw, 0.25, 0.22, 0x7d858c); for (let ix = 0; ix <= nx; ix++) g.box(-bw / 2 + bw * ix / nx, y - 0.25, bz, 0.22, 0.25, bd, 0x7d858c); }
    if (progress > 0.35) { const ph = cur * Math.min(1, (progress - 0.35) * 1.8); g.box(0, 0, bz - bd / 2 - 0.6, bw + 1.4, ph, 0.08, 0x9fb4c2); g.box(-bw / 2 - 0.6, 0, bz, 0.08, ph, bd + 1.4, 0x8fa6b5); g.box(bw / 2 + 0.6, 0, bz, 0.08, ph, bd + 1.4, 0x8fa6b5); }
    if (H >= 9) { const ch = H + 9; g.box(bw / 2 + 2.4, 0, bz - bd / 2, 0.9, ch, 0.9, 0xe2b12c); g.box(bw / 2 + 2.4 - 6, ch, bz - bd / 2, 22, 0.7, 0.7, 0xe2b12c); g.box(bw / 2 + 5.5, ch - 1.4, bz - bd / 2, 2.2, 1.4, 1.4, 0x6f7478); g.box(bw / 2 - 8, ch - 5, bz - bd / 2, 0.06, 5, 0.06, 0x333333); }
  }
  // 重機・資材・現場事務所
  g.box(-sx / 2 + 5, 0.4, sz / 2 - 5, 2.4, 1.1, 3.4, 0xe2b12c); g.box(-sx / 2 + 5, 1.5, sz / 2 - 5.4, 1.6, 1.3, 1.6, 0xe2b12c); g.box(-sx / 2 + 5, 2.2, sz / 2 - 3.2, 0.35, 0.35, 3.6, 0x3a3d40); g.box(-sx / 2 + 5, 0, sz / 2 - 5, 2.6, 0.5, 3.8, 0x2a2c2e);
  g.box(sx / 2 - 5, 0, sz / 2 - 4, 5.6, 2.6, 2.4, 0xf0f0ec, 0xb9bcc0); g.box(sx / 2 - 5, 1.9, sz / 2 - 4, 5.64, 0.3, 2.44, 0x3f7fb0);
  for (let i = 0; i < 3; i++) g.box(sx / 2 - 9 - i * 0.2, 0.1 + i * 0.3, sz / 2 - 8.5, 4.5, 0.28, 1.0, 0x8b9094);
  g.blob(0, 0.4, sz / 2 - 6, 2.2, 1.2, 1.8, 0x8a6f4f, 5);
}

/** 更新工事中・休止中の目印（足場、バリケード） */
export function modelScaffold(c: Ctx, w: number, h: number, hgt: number, renew: boolean): void {
  const g = c.g, sx = w * 30 - 3, sz = h * 30 - 3;
  if (renew) {
    for (let x = -sx / 2 + 2; x <= sx / 2 - 2; x += 3) g.box(x, 0, sz / 2 - 1.5, 0.08, hgt, 0.08, 0x9aa0a6);
    for (let y = 1.8; y < hgt; y += 1.8) g.box(0, y, sz / 2 - 1.5, sx - 4, 0.06, 0.9, 0xaeb4b9);
    g.box(0, 0, sz / 2 - 1.0, sx - 4, hgt, 0.04, 0xb7c7d1);
    sign(c, '工事中', 0, 0, 0.6, sz / 2 + 0.2, 3.2);
  } else {
    for (let x = -sx / 2 + 2; x <= sx / 2 - 2; x += 2.4) { g.box(x, 0, sz / 2 + 0.5, 1.8, 0.9, 0.1, 0xf2c230); g.box(x, 0.35, sz / 2 + 0.56, 1.8, 0.2, 0.02, 0x1a1a1a); }
  }
}

// ---- v12：店と企業、自衛隊 ----
export function modelKonbini(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x55585c);
  const g = c.g, band = pick(c, [[0x2f8a4f, 0xf2c230], [0x1f5fb0, 0xffffff], [0xe86a2b, 0x2f8a4f], [0xc3312b, 0x1f5fb0]]), x = 0, bz = -4, w = 18, d = 12, fz = bz + d / 2;
  g.box(x, 0, bz, w, 4.6, d, 0xf2f2ee, 0x9b9d9e); g.box(x, 3.4, bz, w + 0.2, 0.6, d + 0.2, band[0]); g.box(x, 4.0, bz, w + 0.2, 0.3, d + 0.2, band[1]);
  win(c, 0, x - 2, 0.3, fz, 12, 2.9, 1, 0xe6f2f6); g.box(x + 6.5, 0, fz + 0.06, 1.8, 2.4, 0.1, 0xd9e6ea);
  sign(c, 'コンビニ', 0, x - 3, 3.45, fz + 0.12, 3.4);
  standSign(c, 'コンビニ', 11, 11.5, 3.4, 1.6, true);
  slab(c, 0, 8.4, 26, 9, 0x4c4f53, 0.08); parkingLines(c, -11, 9, 8.4, 5, 6); for (let i = 0; i < 6; i++) if (c.rnd() < 0.45) car(c, -11 + 20 * (i + 0.5) / 6, 8.4, false);
  vending(c, -8.2, fz + 0.5);
}
export function modelCafe(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xc9bda6);
  const g = c.g, wall = pick(c, [0xf2ead8, 0x6b4a32, 0xe8e3d8, 0x9fb8a8]), x = -3, bz = -1, w = 13, d = 10, fz = bz + d / 2;
  g.box(x, 0, bz, w, 4.2, d, wall); g.gable(x, 4.2, bz, w, d, 2.4, pick(c, [0x3a3f44, 0x6b3a2a, 0x2f4a3a]), 'x', wall, 0.5);
  win(c, 0, x - 1.5, 0.6, fz, 7, 2.6, 1, 0xf2e2c0); g.box(x + 4.6, 0, fz + 0.06, 1.2, 2.4, 0.1, 0x4a3426);
  sign(c, 'カフェ', 0, x - 1.5, 3.4, fz + 0.1, 3.0);
  slab(c, x, fz + 3.4, 12, 5, 0xb89a74, 0.1);
  for (const tx of [x - 3.6, x + 0.2, x + 4]) { g.cyl(tx, 0, fz + 3.5, 0.5, 0.75, 0xe9e2d2, 6); g.cyl(tx, 0.75, fz + 3.5, 0.04, 1.6, 0x8b8f93, 4); g.cyl(tx, 2.1, fz + 3.5, 1.4, 0.5, pick(c, [0xf2ead8, 0x2f6b4f, 0xc3312b]), 8, undefined, 0.05); }
  tree(c, 9, -9, 0.9); tree(c, 10, 8, 0.8); bush(c, -11, 9, 0.8, 0xe07a8c);
}
export function modelDrugstore(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x55585c);
  const g = c.g, bz = -5, w = 24, d = 14, fz = bz + d / 2;
  g.box(0, 0, bz, w, 6.2, d, 0xeeece6, 0x9b9d9e); g.box(0, 4.4, bz, w + 0.2, 1.6, d + 0.2, pick(c, [0xf2c230, 0x1f6fb2, 0x2e7d5b]));
  win(c, 0, -3, 0.3, fz, 14, 3.4, 1, 0xe6f2f6); sign(c, 'ドラッグ', 0, 0, 4.45, fz + 0.12, 5);
  slab(c, 0, 9.4, 27, 8, 0x4c4f53, 0.08); parkingLines(c, -12, 12, 9.4, 5, 8); for (let i = 0; i < 8; i++) if (c.rnd() < 0.4) car(c, -12 + 24 * (i + 0.5) / 8, 9.4, false);
}
export function modelItPark(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xc8c2b6);
  const g = c.g;
  const h1 = block(c, -12, -10, 20, 18, 8 + Math.floor(c.rnd() * 4), dull(c, 0x4f7a9a, 0x3f6a8a), { fh: 3.8, label: pick(c, ['IT', 'ソフト']), lit: 0.75, glass: 0x3f6a8a, band: 0x1f2f4a });
  block(c, 12, -8, 16, 16, 5, dull(c, 0xeceae4, 0xc9c6bf), { fh: 3.8, lit: 0.7, glass: 0x6f8fa8 });
  g.box(0, 7, -9, 8, 1.2, 4, 0x9fb8c8); g.box(-12, h1 + 0.4, -10, 6, 2, 6, 0x8b9094);
  slab(c, 0, 16, 52, 20, 0xd8d2c4, 0.07); for (let i = 0; i < 6; i++) tree(c, -22 + i * 9, 20, 0.8);
  for (let i = 0; i < 4; i++) g.cyl(-6 + i * 4, 0, 12, 0.6, 0.45, 0x8b6b4a, 6);
}
export function modelGameStudio(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xc8c2b6);
  const g = c.g, cols = [0xe86a7a, 0x5aa9d6, 0x7cc36a, 0xf2c94c, 0x9a6ad6];
  const h = block(c, -4, -2, 40, 18, 4, dull(c, 0x2a2a2e, 0x3a3a3e), { fh: 3.8, label: 'スタジオ', lit: 0.8, glass: 0x9a6ad6 });
  for (let i = 0; i < 5; i++) g.box(-22 + i * 8.8, 0.6, 7.06, 8.4, 2.2, 0.08, cols[i]);
  g.box(-4, h + 0.4, -2, 10, 3, 6, cols[Math.floor(c.rnd() * 5)]);
  slab(c, 18, 10, 18, 7, 0xd8d2c4, 0.07); tree(c, 24, 10, 0.8);
}
export function modelFoodFactory(c: Ctx): void {
  pad(c, 88.4, 58.4, 0x9a9f9f);
  const g = c.g, wall = dull(c, 0xf2f2ee, 0xd9d9d6);
  g.box(-10, 0, -6, 56, 11, 30, wall, 0xb9bcc0); g.box(-10, 11, -6, 56.3, 0.5, 30.3, 0xc3312b);
  sign(c, '食品', 0, -10, 6, 9.06, 6);
  for (let i = 0; i < 3; i++) g.cyl(28 + (i % 2) * 7, 0, -16 + i * 7, 2.6, 14, 0xd6d3cb, 12, 0xb9b6ae);
  slab(c, 0, 20, 84, 14, 0x55585c, 0.07); for (let i = 0; i < 4; i++) { const x = -32 + i * 12; g.box(x, 0.3, 18, 2.5, 3.2, 9, 0xf2f2ee); g.box(x, 0.3, 23, 2.5, 2.5, 2.5, 0xc3312b); }
  parking(c, 32, 20, 18, 12, 6); fenceRect(c, 87.6, 57.6, 2.0, 0x7f8a8a, 10);
}
export function modelPharma(c: Ctx): void {
  pad(c, 88.4, 88.4, 0xc8c2b6);
  const g = c.g;
  block(c, -18, -18, 40, 22, 5, dull(c, 0xf4f4f0, 0xd9d9d6), { fh: 3.8, label: '製薬', lit: 0.7, glass: 0x6f9ab8, band: 0x1f6fb2 });
  g.box(18, 0, -16, 30, 9, 30, dull(c, 0xe9eef0, 0xc9ced2), 0xb9bcc0); for (let i = 0; i < 6; i++) g.box(8 + i * 4, 9, -16, 2.4, 1.4, 6, 0x9aa0a6);
  for (let i = 0; i < 2; i++) g.cyl(28 + i * 8, 0, 14, 3, 10, 0xd6d3cb, 12);
  slab(c, -16, 20, 46, 28, 0x9fc47a, 0.06); for (let i = 0; i < 8; i++) tree(c, -36 + i * 6, 28, 0.85);
  parking(c, 16, 30, 30, 12, 8); fenceRect(c, 87.6, 87.6, 2.0, 0x7f8a8a, 10);
}
export function modelCallCenter(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xc8c2b6);
  block(c, -6, -2, 36, 18, 6, dull(c, pick(c, [0xd8d2c4, 0xb9c4cc, 0xe0dcd2]), 0xa9b0b6), { fh: 3.6, label: 'センター', lit: 0.8, glass: 0x6f8fa8, band: 0x27405e });
  parking(c, 20, 8, 16, 10, 4);
}
export function modelBankHq(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xd8d2c4);
  const g = c.g;
  const h = block(c, 0, -6, 34, 28, 9, dull(c, 0xd9cfb8, 0xc4b89c), { fh: 3.8, lit: 0.6, glass: 0x6f8fa8, band: 0x8a7a5a });
  g.box(0, 0, 9.5, 20, 7, 3, 0xe8e0cc); for (let i = 0; i < 6; i++) g.cyl(-8.5 + i * 3.4, 0, 11.4, 0.6, 7, 0xf2ece0, 10);
  g.box(0, 7, 10.2, 21, 1.2, 4.6, 0xd9cfb8); sign(c, '銀行', 0, 0, 8.3, 12.6, 6); g.box(0, h + 0.4, -6, 10, 3, 8, 0x8b8f93);
  slab(c, 0, 20, 52, 14, 0xc8c2b6, 0.07); for (let i = 0; i < 4; i++) tree(c, -20 + i * 13.3, 23, 0.85);
}
export function modelBattery(c: Ctx): void {
  pad(c, 118.4, 88.4, 0x9a9f9f);
  const g = c.g, wall = dull(c, 0xe9eef0, 0xc9ced2);
  g.box(-8, 0, -10, 90, 13, 50, wall, 0xb9bcc0);
  for (let i = 0; i < 9; i++) g.box(-46 + i * 9.6, 13.1, -10, 8.4, 0.3, 46, 0x2a3b5a);   // 屋根の太陽光パネル
  sign(c, '電池', 0, -30, 7, 15.06, 8);
  block(c, 40, 22, 26, 14, 4, dull(c, 0xeceae4, 0xc9c6bf), { fh: 3.6, lit: 0.6, glass: 0x6f8fa8, band: 0x2e7d32 });
  slab(c, -10, 32, 90, 18, 0x55585c, 0.07); for (let i = 0; i < 6; i++) { const x = -50 + i * 12; g.box(x, 0.3, 30, 2.5, 3.4, 10, 0xf2f2ee); g.box(x, 0.3, 36, 2.5, 2.6, 2.6, 0x2e7d32); }
  for (let i = 0; i < 4; i++) g.box(52, 0, -30 + i * 7, 8, 4, 5, 0xc9cdd0);
  fenceRect(c, 117.6, 87.6, 2.0, 0x7f8a8a, 12);
}
export function modelSemicon(c: Ctx): void {
  pad(c, 118.4, 118.4, 0x9a9f9f);
  const g = c.g, wall = dull(c, 0xf4f4f2, 0xdcdcd8);
  g.box(-14, 0, -18, 74, 24, 58, wall, 0xc9ced2); g.box(-14, 24, -18, 74.4, 0.6, 58.4, 0x14202e);
  for (let i = 0; i < 14; i++) g.box(-46 + i * 5, 24.6, -40, 3.6, 2.4, 8, 0x9aa0a6);
  sign(c, '半導体', 0, -14, 14, 11.06, 10);
  for (let i = 0; i < 4; i++) g.cyl(36 + (i % 2) * 10, 0, -40 + Math.floor(i / 2) * 12, 4, 18, 0xd6d3cb, 14, 0xb9b6ae);
  block(c, 40, 10, 22, 22, 6, dull(c, 0xeceae4, 0xc9c6bf), { fh: 3.8, lit: 0.6, glass: 0x6f8fa8, band: 0x14202e });
  parking(c, -14, 38, 70, 16, 18); fenceRect(c, 117.6, 117.6, 2.6, 0x5a6066, 12);
}
export function modelSdfBase(c: Ctx): void {
  pad(c, 118.4, 118.4, 0x9a9a7a);
  const g = c.g, olive = 0x4b5a32, wall = dull(c, 0xd9d3c0, 0xbdb6a0);
  for (let i = 0; i < 3; i++) block(c, -36, -36 + i * 18, 34, 12, 3, wall, { fh: 3.4, lit: 0.55, glass: 0x8fa3ad, band: 0x6b7a4a }); // 隊舎
  block(c, 14, -42, 30, 14, 3, wall, { fh: 3.6, label: '自衛隊', lit: 0.6, glass: 0x8fa3ad, band: olive });
  slab(c, 18, 2, 56, 40, 0xb9a77a, 0.06);                                       // グラウンド
  for (let i = 0; i < 6; i++) { const x = -6 + i * 6; g.box(x, 0.3, 30, 2.6, 2.8, 6.5, olive); g.box(x, 3.1, 31.6, 2.4, 0.8, 3, 0x3a4628); } // 車両
  g.cyl(-34, 0, 30, 9, 0.12, 0x6b6f62, 16); g.box(-34, 0.14, 30, 8, 0.05, 1, 0xf2f2ee); g.box(-34, 0.14, 30, 1, 0.05, 8, 0xf2f2ee); // ヘリポート
  g.box(44, 0, 30, 16, 9, 14, olive, 0x3a4628);                                 // 格納庫
  g.cyl(0, 0, -20, 0.15, 14, 0xd9d9d6, 5); g.box(1.4, 12.4, -20, 2.6, 1.6, 0.05, 0xffffff); g.cyl(1.4, 13.2, -20, 0.5, 0.06, 0xc3312b, 10); // 旗
  for (let i = 0; i < 10; i++) tree(c, -56 + i * 12, -54, 0.9);
  fenceRect(c, 117.6, 117.6, 2.4, 0x6b7076, 12);
}

// ---- v13：発電所・山・レジャー ----
/** 鉄塔と電線（発電所から外へ） */
function pylons(c: Ctx, x: number, z: number, n: number, dx: number, dz: number): void {
  for (let k = 0; k < n; k++) { const px = x + dx * k, pz = z + dz * k; c.g.box(px, 0, pz, 1.4, 22, 1.4, 0x9aa0a4); c.g.box(px, 18, pz, 9, 0.5, 0.5, 0x8b9094); c.g.box(px, 21, pz, 6, 0.5, 0.5, 0x8b9094); }
}
export function modelNuclear(c: Ctx): void {
  pad(c, 118.4, 118.4, 0xb9b6ae);
  const g = c.g;
  for (const x of [-30, 0]) { g.cyl(x, 0, -24, 11, 26, 0xe9e7e0, 24); g.blob(x, 26, -24, 11, 9, 11, 0xe9e7e0, 16); }
  block(c, 30, -24, 34, 22, 6, dull(c, 0xdfe3e6, 0xc4c9cc), { fh: 4, label: '原子力', lit: 0.3, glass: 0x8fa3ad, band: 0x1d3557 });
  g.cyl(-15, 0, 4, 1.8, 70, 0xf2f2f2, 12); for (let k = 0; k < 4; k++) g.cyl(-15, 10 + k * 16, 4, 1.85, 3, k % 2 ? 0xc3312b : 0xf2f2f2, 12);
  g.box(-15, 0, 26, 50, 0.3, 26, 0x8f9496); for (let i = 0; i < 4; i++) g.box(-34 + i * 12, 0, 26, 2, 9, 2, 0x9aa0a4);
  pylons(c, 38, 30, 3, 0, 12); fenceRect(c, 117.6, 117.6, 3, 0x6b7076, 10);
}
function powerHall(c: Ctx, label: string, stacks: number, tall: number, tanks: boolean, coal: boolean): void {
  pad(c, 118.4, 88.4, 0xa9a59c);
  const g = c.g, wall = dull(c, 0xe1e4e6, 0xc4c9cc);
  g.box(-14, 0, -12, 48, 26, 30, wall, 0x9aa0a6); g.box(-14, 26, -12, 48.4, 0.6, 30.4, 0x6b7076); sign(c, label, 0, -14, 14, 3.06, 8);
  for (let k = 0; k < stacks; k++) { const x = 18 + k * 10; g.cyl(x, 0, -18, 2.6, tall, 0xd9d6cf, 14); g.cyl(x, tall - 6, -18, 2.7, 3, 0xc3312b, 14); g.cyl(x, tall - 12, -18, 2.7, 3, 0xf2f2f2, 14); }
  if (tanks) for (let k = 0; k < 2; k++) { g.cyl(-44 + k * 22, 0, 22, 9, 14, 0xf2f2f0, 24); g.blob(-44 + k * 22, 14, 22, 9, 3, 9, 0xf2f2f0, 16); }
  if (coal) { for (let k = 0; k < 3; k++) g.blob(-44 + k * 16, 0, 22, 8, 5, 6, 0x2b2b2b, 10); g.box(-10, 8, 20, 50, 1.2, 2, 0x6b7076); }
  pylons(c, 48, -36, 3, 0, 14); fenceRect(c, 117.6, 87.6, 2.6, 0x6b7076, 10);
}
export function modelLngPower(c: Ctx): void { powerHall(c, '火力', 2, 70, true, false); }
export function modelCoalPower(c: Ctx): void { powerHall(c, '石炭', 1, 110, false, true); }
/** 風車：塔・ナセル・3 枚の羽根（羽根の角度は建物ごとに違う） */
function turbine(c: Ctx, x: number, z: number, h: number, yaw: number, spin: number): void {
  const g = c.g; g.cyl(x, 0, z, 1.6, h, 0xf4f4f2, 12, undefined, 0.9);
  const ca = Math.cos(yaw), sa = Math.sin(yaw), hx = x + ca * 2.4, hz = z + sa * 2.4, hy = h + 1.2;
  g.box(x, h - 0.4, z, 5, 3, 3, 0xf4f4f2);
  for (let k = 0; k < 3; k++) {
    const a = spin + k * Math.PI * 2 / 3, L = Math.min(26, h - 3), w = 1.1, ux = Math.cos(a), uy = Math.sin(a);
    // 羽根は風を受ける面（yaw に直交する鉛直面）に並べる：面内の横方向は (-sa, ca)
    const P = (l: number, o: number): [number, number, number] => [hx + (-sa) * (ux * l - uy * o), hy + uy * l + ux * o, hz + ca * (ux * l - uy * o)];
    g.quad(P(0, -w), P(L, -w * 0.3), P(L, w * 0.3), P(0, w), 0xf4f4f2); g.quad(P(0, w), P(L, w * 0.3), P(L, -w * 0.3), P(0, -w), 0xe9e9e6);
  }
}
export function modelWindFarm(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x8fae6a);
  const yaw = c.rnd() * Math.PI * 2;
  for (const [x, z] of [[-24, -22], [20, -14], [-6, 24]]) turbine(c, x, z, 46, yaw, c.rnd() * 6);
  c.g.box(26, 0, 30, 10, 4, 7, 0xe9e6df); standSign(c, '風力', 18, 36, 1, 1.8, true);
}
export function modelHydro(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xa9b49a);
  const g = c.g;
  block(c, -3, 0, 12, 10, 2, dull(c, 0xe9e6df, 0xc9c4b8), { fh: 3.2, label: '水力', lit: 0.3 });
  g.box(8, 0, -8, 3, 1.2, 14, 0x6f9fc0); g.box(8, 0, -8, 4, 0.8, 15, 0xb9b6ae); g.cyl(8, 1.4, 4, 1.1, 5, 0x5a6066, 8);
}
export function modelGeothermal(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xb9a98a);
  const g = c.g;
  for (const x of [-14, 6]) { g.cyl(x, 0, -10, 7, 16, 0xd9d6cf, 18, 0x9aa0a4, 5.5); g.blob(x, 19, -10, 5, 4, 5, 0xf4f4f4, 8); g.blob(x + 1, 24, -9, 4, 3, 4, 0xf8f8f8, 8); }
  block(c, 10, 14, 22, 12, 2, dull(c, 0xe9e6df, 0xc9c4b8), { fh: 4, label: '地熱', lit: 0.3 });
  for (let k = 0; k < 3; k++) g.box(-18 + k * 6, 1.5, 16, 1, 1, 22, 0xb9b6ae);
}
export function modelBiomass(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xa9a59c);
  const g = c.g;
  block(c, -8, -8, 26, 20, 4, dull(c, 0xd9d2c4, 0xbdb4a2), { fh: 4, label: 'バイオマス', lit: 0.3, band: 0x5a4632 });
  g.cyl(12, 0, -12, 1.8, 34, 0xd6d3cb, 12);
  for (let k = 0; k < 3; k++) g.blob(-14 + k * 10, 0, 18, 6, 3.4, 5, 0x9a7a4a, 8);
  for (let k = 0; k < 6; k++) g.box(16, 0.5 + (k % 3) * 1.1, 14 + Math.floor(k / 3) * 3, 10, 1, 1, 0x7a5a3a);
}
export function modelRopeway(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xc8c2b6);
  const g = c.g;
  block(c, -6, -2, 26, 14, 2, dull(c, 0xe9e6df, 0xc9c4b8), { fh: 4, label: 'ロープウェイ', lit: 0.5, glass: 0x8fb3c9, band: 0xc3312b });
  g.box(14, 0, -2, 10, 9, 10, 0xd9d6cf); g.cyl(14, 9, -2, 3.4, 0.6, 0x5a6066, 16);
  slab(c, -6, 9, 30, 6, 0xc4bfb4, 0.07); for (let i = 0; i < 3; i++) tree(c, -22 + i * 8, 11, 0.7);
}
export function modelDome(c: Ctx): void {
  pad(c, 148.4, 148.4, 0x9a9f9f);
  const g = c.g;
  g.cyl(0, 0, -6, 52, 14, 0xd9d6cf, 40, undefined, 52); g.blob(0, 14, -6, 52, 26, 52, 0xf2f2f0, 24);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.box(Math.cos(a) * 52, 0, -6 + Math.sin(a) * 52, 6, 12, 6, 0xc9c6bf); }
  sign(c, 'ドーム', 0, 0, 8, 46.2, 14);
  parking(c, 0, 62, 140, 18, 24);
}
export function modelLiveHouse(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x4c4f53);
  const g = c.g;
  g.box(-2, 0, -2, 20, 9, 18, 0x23232a, 0x1a1a1f); g.box(-2, 6.5, 7.06, 20, 0.5, 0.1, 0xff4fa8); g.box(-2, 1.2, 7.06, 20, 0.3, 0.1, 0x4fd2ff);
  sign(c, 'LIVE', 0, -2, 3.2, 7.1, 6); g.box(4, 0, 7.06, 2.4, 2.6, 0.12, 0x101012);
  for (let k = 0; k < 4; k++) g.box(-9 + k * 2.4, 0, 10, 1.2, 2.2, 0.8, [0x2b2b2b, 0x9a3a32, 0x356b8c, 0xdadad6][k]);
}
export function modelFitness(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x55585c);
  const g = c.g;
  block(c, 0, -3, 22, 16, 3, dull(c, 0x2b2f33, 0x3a3f44), { fh: 4, label: 'ジム', lit: 0.85, glass: 0x9fc8d8, band: 0xf2c230 });
  g.box(0, 0, 8, 22, 0.1, 6, 0x4c4f53); for (let i = 0; i < 5; i++) if (c.rnd() < 0.6) car(c, -8 + i * 4, 9, false);
}
export function modelRobotaxi(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x55585c);
  const g = c.g;
  block(c, -10, -12, 30, 18, 2, dull(c, 0xeef2f4, 0xd0d6d9), { fh: 4.2, label: '自動運転', lit: 0.6, glass: 0x7fd0c8, band: 0x1fa89a });
  for (let i = 0; i < 8; i++) { const x = -22 + i * 6; car(c, x, 12, false, 0xf4f8f8); g.box(x, 1.55, 12, 0.6, 0.35, 0.6, 0x1fa89a); g.box(x - 1.6, 0, 16, 0.5, 1.4, 0.5, 0x2b2f33); }
  for (let i = 0; i < 2; i++) { g.box(16, 0.2, -18 + i * 9, 3, 3.2, 11, 0xf4f8f8); g.box(16, 1.8, -18 + i * 9, 3.05, 1, 10, 0x1fa89a); }
}

// ---- v15：寺社・城・葬祭・世界のいろいろな施設 ----
type V = [number, number, number];
/** 向きを持つ箱（u・v・w は右手系の単位ベクトル、h は半分の大きさ） */
function obox(c: Ctx, cx: number, cy: number, cz: number, u: V, v: V, w: V, hu: number, hv: number, hw: number, color: number): void {
  const P = (a: number, b: number, d: number): V => [cx + u[0] * a + v[0] * b + w[0] * d, cy + u[1] * a + v[1] * b + w[1] * d, cz + u[2] * a + v[2] * b + w[2] * d];
  const face = (n: number, t1: number, t2: number, sn: number, s1: number, s2: number) => {
    const at = (a: number, b: number) => { const k = [0, 0, 0]; k[n] = sn; k[t1] = a * s1; k[t2] = b * s2; return P(k[0] * hu, k[1] * hv, k[2] * hw); };
    c.g.quad(at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), color);
  };
  face(0, 1, 2, 1, 1, 1); face(0, 2, 1, -1, 1, 1); face(1, 2, 0, 1, 1, 1); face(1, 0, 2, -1, 1, 1); face(2, 0, 1, 1, 1, 1); face(2, 1, 0, -1, 1, 1);
}
/** x-y 面で傾けた棒（観覧車の輪や支柱） */
function zbar(c: Ctx, x0: number, y0: number, x1: number, y1: number, z: number, t: number, d: number, color: number): void {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  obox(c, (x0 + x1) / 2, (y0 + y1) / 2, z, [ux, uy, 0], [-uy, ux, 0], [0, 0, 1], L / 2, t / 2, d / 2, color);
}
/** 鳥居（朱塗り）。s は大きさ、z は立つ位置、手前（+z）向き */
function torii(c: Ctx, x: number, z: number, s: number, col = 0xc3312b): void {
  const g = c.g;
  for (const sx of [-3.4, 3.4]) { g.cyl(x + sx * s, 0, z, 0.42 * s, 6.6 * s, col, 10); g.cyl(x + sx * s, 0, z, 0.6 * s, 0.6 * s, 0x2b2b2b, 10); }
  g.box(x, 5.4 * s, z, 8.6 * s, 0.45 * s, 0.5 * s, col);                       // 貫
  g.box(x, 6.6 * s, z, 9.6 * s, 0.6 * s, 0.75 * s, col);                       // 島木
  g.box(x, 7.2 * s, z, 10.8 * s, 0.5 * s, 1.0 * s, 0x1f1f1f);                   // 笠木
  g.box(x, 5.85 * s, z, 0.5 * s, 0.75 * s, 0.4 * s, col);                      // 額束
}
/** 石灯籠 */
function lantern(c: Ctx, x: number, z: number, s = 1): void {
  const g = c.g, st = 0xb5b0a4;
  g.box(x, 0, z, 0.9 * s, 0.4 * s, 0.9 * s, st); g.cyl(x, 0.4 * s, z, 0.2 * s, 1.0 * s, st, 6); g.box(x, 1.4 * s, z, 0.8 * s, 0.6 * s, 0.8 * s, st); g.pyramid(x, 2.0 * s, z, 1.3 * s, 1.3 * s, 0.6 * s, st);
}
/** 社殿（切妻屋根の木造。屋根は銅板の緑か檜皮） */
function shaden(c: Ctx, x: number, z: number, w: number, d: number, h: number, roof: number): void {
  const g = c.g, wood = dull(c, 0xd8c39c, 0xb3a07c), pillar = 0x8a3a2a;
  g.box(x, 0, z, w + 2, 0.8, d + 2, 0xc9c2b0);
  g.box(x, 0.8, z, w, h, d, wood);
  for (let k = 0; k <= 4; k++) g.box(x - w / 2 + k * w / 4, 0.8, z + d / 2 + 0.1, 0.4, h, 0.4, pillar);
  g.gable(x, 0.8 + h, z, w + 2.4, d + 3, h * 0.75, roof, 'x', wood, 1.2);
  g.box(x, 0.8 + h + h * 0.75, z, 1.4, 0.5, d + 3.4, roof);                    // 棟
  for (const sx of [-1, 1]) { zbar(c, x + sx * (w / 2 + 1.0), 0.8 + h + h * 0.55, x + sx * (w / 2 + 2.2), 0.8 + h + h * 1.15, z, 0.3, 0.3, roof); } // 千木
}
export function modelShrine(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xd2c8ad);
  const g = c.g;
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, r = 22 + c.rnd() * 5; if (Math.sin(a) > 0.55) continue; tree(c, Math.cos(a) * r, Math.max(-25, Math.sin(a) * r - 4), 1.2 + c.rnd() * 0.5, i % 3 === 0 ? 1 : 0); } // 鎮守の森
  slab(c, 0, 12, 3.2, 34, 0xe2dccd, 0.08);                                      // 参道
  torii(c, 0, 25, 0.9); torii(c, 0, 6, 0.6);
  if (!c.lm?.has('shrine')) shaden(c, 0, -8, 12, 8, 4.4, dull(c, 0x5f8f7a, 0x4a6a5c));
  for (const z of [16, 10]) { lantern(c, -3, z); lantern(c, 3, z); }
  g.box(-9, 0, 6, 5, 2.6, 3, 0xd8c39c); g.gable(-9, 2.6, 6, 5.6, 3.6, 1.2, 0x5a4a3a, 'x', 0xd8c39c, 0.4);          // 手水舎
  g.box(9, 0, 6, 0.3, 2.4, 3, 0x8a6a4a); g.box(9, 2.2, 6, 1.6, 0.2, 3.6, 0x5a4a3a);                                  // 絵馬かけ
}
export function modelTemple(c: Ctx): void {
  pad(c, 88.4, 88.4, 0xd9d1bd);
  const g = c.g, roof = dull(c, 0x3e4044, 0x4c4e50), wall = dull(c, 0xece4d2, 0xcfc6b2), wood = 0x7a3a2a;
  slab(c, 0, 26, 4, 34, 0xe6dfd0, 0.08);
  // 山門
  g.box(0, 0, 38, 12, 6, 5, wood); g.box(0, 0, 38.1, 3.6, 4.4, 5.2, 0x2b1f1a); g.gable(0, 6, 38, 14, 7, 2.6, roof, 'x', wood, 1.0);
  // 本堂
  g.box(-8, 0, -12, 30, 1.2, 22, 0xc9c2b0); g.box(-8, 1.2, -12, 26, 8, 18, wall);
  for (let k = 0; k <= 6; k++) g.box(-21 + k * (26 / 6), 1.2, -2.9, 0.6, 8, 0.6, wood);
  g.gable(-8, 9.2, -12, 31, 24, 8, roof, 'x', wall, 2.0); g.box(-8, 17, -12, 2, 0.8, 25, roof);
  // 五重塔（glb があればそちら）
  const px = 28, pz = -16;
  if (!c.lm?.has('temple')) {
    g.box(px, 0, pz, 10, 1, 10, 0xc9c2b0);
    for (let k = 0; k < 5; k++) { const y = 1 + k * 5.4, s = 7 - k * 0.55; g.box(px, y, pz, s, 4.2, s, k % 2 ? 0x8a3a2a : 0x7a3a2a); g.pyramid(px, y + 4.0, pz, s + 4.4, s + 4.4, 1.5, roof); }
    g.cyl(px, 28, pz, 0.35, 7, 0xc9a24a, 8); for (let k = 0; k < 5; k++) g.cyl(px, 29 + k * 1.1, pz, 0.9, 0.18, 0xc9a24a, 8);
  }
  // 鐘楼・池・庭
  g.box(-30, 0, 20, 6, 5, 6, wood); g.pyramid(-30, 5, 20, 9, 9, 3, roof); g.cyl(-30, 2.2, 20, 1.3, 2.4, 0x5a5048, 10);
  g.cyl(22, 0.05, 18, 8, 0.12, 0x3f7fa6, 16); g.cyl(22, 0.05, 18, 8.8, 0.08, 0x8a8478, 16);
  for (let i = 0; i < 14; i++) tree(c, -40 + (i % 7) * 13 + c.rnd() * 3, i < 7 ? -38 : 34 + c.rnd() * 4, 0.9 + c.rnd() * 0.4, i % 4 === 0 ? 1 : 0);
  lantern(c, -3, 30, 1.2); lantern(c, 3, 30, 1.2);
}
export function modelGrandShrine(c: Ctx): void {
  pad(c, 118.4, 118.4, 0xd2c8ad);
  const g = c.g, roof = dull(c, 0x3b3530, 0x4a4440), wood = dull(c, 0xe0cfa8, 0xbca988);
  for (let i = 0; i < 70; i++) { const x = -56 + c.rnd() * 112, z = -56 + c.rnd() * 112; if (Math.abs(x) < 26 && z > -40) continue; tree(c, x, z, 1.3 + c.rnd() * 0.7, c.rnd() < 0.5 ? 1 : 0); } // 広い鎮守の森
  slab(c, 0, 20, 6, 76, 0xe6dfd0, 0.08);
  torii(c, 0, 52, 1.9); torii(c, 0, 22, 1.2, 0xe8e2d6);                              // 大鳥居と白木の鳥居
  for (let z = 30; z <= 46; z += 4) { lantern(c, -6, z, 1.3); lantern(c, 6, z, 1.3); }
  // 回廊で囲んだ本殿
  const cw = 46, cd = 40, cz = -16;
  for (const [x, z, w, d] of [[0, cz + cd / 2, cw, 3], [0, cz - cd / 2, cw, 3], [-cw / 2, cz, 3, cd], [cw / 2, cz, 3, cd]] as const) { g.box(x, 0, z, w, 4, d, 0xc3312b); g.box(x, 4, z, w + 1.4, 0.6, d + 1.4, roof); }
  g.box(0, 0, cz + cd / 2, 8, 5.5, 3.6, 0xc3312b); g.gable(0, 5.5, cz + cd / 2, 10, 6, 3, roof, 'x', 0xc3312b, 1.0); // 楼門
  shaden(c, 0, cz + 6, 16, 9, 5, roof);                                              // 拝殿
  shaden(c, 0, cz - 8, 12, 10, 8, roof);                                             // 本殿（高い）
  slab(c, 0, cz, cw - 4, cd - 4, 0xeae6dc, 0.06);
}
export function modelChurch(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xc9c6bf);
  const g = c.g, wall = dull(c, 0xf2eee6, 0xd6d0c4), roof = dull(c, 0x5a3f3a, 0x4a3a36);
  g.box(4, 0, -1, 26, 9, 12, wall); g.gable(4, 9, -1, 27, 13, 6, roof, 'x', wall, 0.6);
  for (let k = 0; k < 5; k++) { g.box(-5 + k * 4.6, 2.5, 5.06, 1.3, 4.5, 0.1, 0x6a8fc0); g.box(-5 + k * 4.6, 2.5, -7.06, 1.3, 4.5, 0.1, 0x6a8fc0); }
  // 鐘楼と尖塔
  g.box(-13, 0, -1, 6, 17, 6, wall); g.pyramid(-13, 17, -1, 6.4, 6.4, 10, roof);
  g.box(-13, 27, -1, 0.3, 3, 0.3, 0xd4af37); g.box(-13, 28.6, -1, 1.6, 0.3, 0.3, 0xd4af37);
  g.cyl(-13, 9, 2.06, 1.6, 0.1, 0xb5d0e8, 12); g.box(-13, 0, 2.06, 2.4, 3.6, 0.15, 0x6b3f22);
  for (const x of [20, 25]) tree(c, x, 10, 0.8, 2);
}
export function modelCastle(c: Ctx): void {
  pad(c, 118.4, 118.4, 0x8fbf74);
  const g = c.g, stone = dull(c, 0xa59f92, 0x8e887c), white = dull(c, 0xf6f4ee, 0xdcd8cc), roof = dull(c, 0x3a4048, 0x4a4e54), gold = 0xd4af37;
  // 堀と石垣（上が少し狭い）
  slab(c, 0, 0, 112, 112, 0x3f7fa6, 0.12); slab(c, 0, 0, 100, 100, 0x8fbf74, 0.14);
  const sw = (x: number, z: number, w: number, d: number, h: number) => { const e = 1.6; g.quad([x - w / 2, 0, z + d / 2], [x + w / 2, 0, z + d / 2], [x + w / 2 - e, h, z + d / 2 - e], [x - w / 2 + e, h, z + d / 2 - e], stone);
    g.quad([x + w / 2, 0, z - d / 2], [x - w / 2, 0, z - d / 2], [x - w / 2 + e, h, z - d / 2 + e], [x + w / 2 - e, h, z - d / 2 + e], stone);
    g.quad([x + w / 2, 0, z + d / 2], [x + w / 2, 0, z - d / 2], [x + w / 2 - e, h, z - d / 2 + e], [x + w / 2 - e, h, z + d / 2 - e], stone);
    g.quad([x - w / 2, 0, z - d / 2], [x - w / 2, 0, z + d / 2], [x - w / 2 + e, h, z + d / 2 - e], [x - w / 2 + e, h, z - d / 2 + e], stone);
    g.box(x, h, z, w - 2 * e, 0.3, d - 2 * e, 0xcfc8b8); };
  if (!c.lm?.has('castle')) castleKeep(c, sw, white, roof, gold);
  // 門・橋・松
  g.box(0, 0, 26, 12, 6, 6, white); g.gable(0, 6, 26, 14, 8, 2.4, roof, 'x', white, 0.6); g.box(0, 0, 26.1, 4, 4.4, 6.2, 0x3a2a1f);
  g.box(0, 0.2, 46, 6, 0.6, 18, 0x8a6a4a);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; tree(c, Math.cos(a) * 44, Math.sin(a) * 44, 1 + c.rnd() * 0.3, 1); }
}
/** コードで組む石垣と天守（glb が使えないとき・一覧の小さな絵用） */
function castleKeep(c: Ctx, sw: (x: number, z: number, w: number, d: number, h: number) => void, white: number, roof: number, gold: number): void {
  const g = c.g;
  sw(0, -6, 60, 52, 12);
  // 天守（4 層）
  let y = 12.3;
  for (let k = 0; k < 4; k++) {
    const w = 30 - k * 6, d = 24 - k * 5, h = k === 0 ? 7 : 5.6;
    g.box(0, y, -8, w, h, d, white);
    for (let j = 0; j < Math.max(2, Math.floor(w / 4)); j++) g.box(-w / 2 + 2 + j * ((w - 4) / Math.max(1, Math.floor(w / 4) - 1)), y + h * 0.45, -8 + d / 2 + 0.05, 1.2, 1.3, 0.1, 0x2b2b2b);
    g.pyramid(0, y + h, -8, w + 5, d + 5, k === 3 ? 4.5 : 2.4, roof);
    if (k < 3) g.gable(0, y + h, -8 + d / 2, w * 0.45, 4, 2.6, roof, 'x', white, 0.4); // 千鳥破風
    y += h + (k === 3 ? 0 : 1.4);
  }
  for (const sx of [-2.4, 2.4]) g.box(sx, y + 3.6, -8, 0.8, 1.6, 0.8, gold);                                         // 鯱
  // 櫓
  g.box(-26, 12.3, -28, 8, 5, 6, white); g.pyramid(-26, 17.3, -28, 11, 9, 2.6, roof);
}
export function modelCastleRuins(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x8fbf74);
  const g = c.g, stone = dull(c, 0xa59f92, 0x8e887c);
  slab(c, 0, -36, 84, 10, 0x3f7fa6, 0.12); slab(c, -38, 0, 8, 70, 0x3f7fa6, 0.12);                                   // 残った堀
  for (const [x, z, w, d] of [[0, -28, 64, 4], [-30, -4, 4, 52], [30, -14, 4, 32]] as const) { g.box(x, 0, z, w, 5, d, stone); g.box(x, 5, z, w, 0.3, d, 0x9aa07a); }
  g.box(8, 0, -10, 20, 7, 16, stone); g.box(8, 7, -10, 20, 0.3, 16, 0xb8b09c);                                        // 天守台
  slab(c, 0, 20, 4, 44, 0xd6c7a1, 0.07);
  for (let i = 0; i < 28; i++) tree(c, -34 + (i % 7) * 11 + c.rnd() * 3, -18 + Math.floor(i / 7) * 14 + c.rnd() * 3, 1.0 + c.rnd() * 0.3, 0); // 桜（春に花が咲く）
  for (let k = 0; k < 4; k++) g.box(-10 + k * 7, 0, 30, 4, 0.5, 1.2, 0x8a6a4a);                                       // ベンチ
}
export function modelCrematorium(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xc9c6bf);
  const g = c.g, wall = dull(c, 0xebe7df, 0xcfc9bd);
  block(c, -8, -4, 46, 22, 2, wall, { fh: 4, label: '斎場', lit: 0.3, glass: 0x9fb4c0, band: 0x8a8478 });
  g.box(-8, 0, 8.6, 14, 4, 3, 0x8a8478); g.box(-8, 4, 9.2, 18, 0.5, 5, 0x6b665e);                                      // 車寄せ
  g.cyl(24, 0, -14, 1.6, 22, 0xd9d6cf, 12); g.cyl(24, 21.5, -14, 1.8, 0.6, 0x6b6b6b, 12);                            // 煙突
  block(c, 24, -6, 18, 12, 1, wall, { fh: 5, lit: 0.1 });
  parking(c, 18, 20, 40, 12, 9);
  for (let i = 0; i < 8; i++) tree(c, -40 + i * 5, 24, 0.8, 1);
}
export function modelFuneralHall(c: Ctx): void {
  pad(c, 58.4, 28.4, 0x5c6064);
  const g = c.g, wall = dull(c, 0xf2efe8, 0xd6d1c6);
  block(c, -8, -3, 32, 16, 2, wall, { fh: 4, label: '葬儀', lit: 0.4, glass: 0x7f8f98, band: 0x2b2b2b });
  g.box(-8, 0, 5.2, 6, 3.4, 0.2, 0x1a1a1a); g.box(-8, 3.4, 6, 10, 0.4, 3, 0x2b2b2b);
  for (let i = 0; i < 4; i++) car(c, 14 + (i % 2) * 6, -8 + Math.floor(i / 2) * 8, false, i === 0 ? 0x1a1a1a : undefined);
}
export function modelCemetery(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x93b874);
  const g = c.g, stones = [0x8e8e8c, 0x6e6e6c, 0xa9a7a2, 0x5a5a58];
  slab(c, 0, 0, 4, 84, 0xd6cdb6, 0.07); slab(c, 0, 0, 84, 4, 0xd6cdb6, 0.07);
  for (let qx = 0; qx < 2; qx++) for (let qz = 0; qz < 2; qz++) for (let r = 0; r < 5; r++) for (let k = 0; k < 8; k++) {
    const x = (qx ? 8 : -38) + k * 4, z = (qz ? 8 : -38) + r * 6.4;
    g.box(x, 0, z, 1.6, 0.25, 1.4, 0xb5b0a4); g.box(x, 0.25, z - 0.2, 0.75, 1.3 + (k % 3) * 0.15, 0.45, stones[(k + r) % 4]);
  }
  for (let i = 0; i < 12; i++) tree(c, i < 6 ? -42 : 42, -40 + (i % 6) * 16, 1.1, 1);
  g.box(30, 0, 38, 10, 3.6, 6, 0xe6e0d4); g.gable(30, 3.6, 38, 11, 7, 1.4, 0x5a4a3a, 'x', 0xe6e0d4, 0.4); standSign(c, '霊園', 18, 41, 1, 2.6, true);
}
export function modelLighthouse(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb8b2a4);
  const g = c.g;
  for (let i = 0; i < 6; i++) g.blob(-9 + i * 3.6, 0, 10 - (i % 2) * 3, 2.6, 1.4, 2.2, 0x8a8478, 6);
  if (!c.lm?.has('lighthouse')) {
    g.cyl(0, 0, -2, 3.4, 22, 0xf6f6f2, 16, undefined, 2.3); g.cyl(0, 7, -2, 3.1, 3, 0xc3312b, 16, undefined, 2.95); g.cyl(0, 15, -2, 2.75, 2.6, 0xc3312b, 16, undefined, 2.55);
  g.cyl(0, 22, -2, 3.2, 0.5, 0x2b2b2b, 16); g.cyl(0, 22.5, -2, 1.9, 2.6, 0xfff3c8, 12); g.blob(0, 25.1, -2, 2.2, 1.4, 2.2, 0xc3312b, 10); g.box(0, 26.3, -2, 0.2, 1.4, 0.2, 0x2b2b2b);
  }
  g.box(8, 0, -6, 6, 3, 5, 0xf2f2ee); g.gable(8, 3, -6, 6.6, 5.6, 1.2, 0xc3312b, 'x', 0xf2f2ee, 0.3);
}
export function modelObservatory(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xc9c6bf);
  const g = c.g, wall = dull(c, 0xeef0f2, 0xd2d5d8);
  block(c, -6, 4, 30, 14, 1, wall, { fh: 5, label: '天文台', lit: 0.4, glass: 0x8fa9b8, band: 0x1d3557 });
  g.cyl(8, 0, -10, 7, 8, wall, 20); g.blob(8, 8, -10, 7.2, 6.6, 7.2, 0xf4f6f8, 16); g.box(8, 8, -6.4, 1.6, 6.4, 4.2, 0x2b3138);
  g.cyl(-14, 0, -12, 4, 5, wall, 16); g.blob(-14, 5, -12, 4.2, 3.8, 4.2, 0xdfe3e6, 12);
  for (let i = 0; i < 6; i++) tree(c, -24 + i * 9, 24, 0.9, 1);
}
export function modelFerrisWheel(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x7d8186);
  const g = c.g, R = 26, cy = 31, z = -4, frame = 0xf2f2f4, cols = [0xe86a7a, 0x4fd2ff, 0xf2c230, 0x7cc36a, 0xb07ad8, 0xff9a3a];
  if (!c.lm?.has('ferrisWheel')) {
  for (const dz of [-1.4, 1.4]) {
    for (let k = 0; k < 36; k++) { const a0 = k / 36 * Math.PI * 2, a1 = (k + 1) / 36 * Math.PI * 2; zbar(c, Math.cos(a0) * R, cy + Math.sin(a0) * R, Math.cos(a1) * R, cy + Math.sin(a1) * R, z + dz, 0.6, 0.5, frame); }
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; zbar(c, 0, cy, Math.cos(a) * R, cy + Math.sin(a) * R, z + dz, 0.25, 0.25, 0xd0d4d8); }
  }
  g.cyl(0, cy - 1.2, z - 2.2, 1.4, 2.4, 0x9aa0a6, 12);
  // ゴンドラ
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = Math.cos(a) * (R + 0.2), y = cy + Math.sin(a) * (R + 0.2); g.box(x, y - 3.2, z, 2.2, 2.6, 2.4, cols[k % cols.length]); g.box(x, y - 2.4, z + 1.22, 1.6, 1.0, 0.05, 0x9fd0e8); }
  // 支柱（A 字）
  for (const dz of [-3.6, 3.6]) { zbar(c, -14, 0, 0, cy, z + dz, 1.2, 1.0, 0xd9dde0); zbar(c, 14, 0, 0, cy, z + dz, 1.2, 1.0, 0xd9dde0); }
  }
  g.box(0, 0, 16, 16, 4, 8, 0xf4f0e8); g.box(0, 4, 16, 17, 0.4, 9, 0xe86a7a);
}
export function modelRacecourse(c: Ctx): void {
  pad(c, 148.4, 148.4, 0x7fb062);
  const g = c.g, dirt = 0xb08a5a, turf = 0x6aa850;
  const ring = (rx: number, rz: number, w: number, col: number) => { const n = 48; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = Math.cos(a) * rx, z = Math.sin(a) * rz - 10; slab(c, x, z, w + Math.abs(Math.sin(a)) * 8, w + Math.abs(Math.cos(a)) * 8, col, 0.09); } };
  ring(62, 40, 8, dirt); ring(54, 32, 6, turf);
  for (let k = 0; k < 6; k++) { const a = 1.2 + k * 0.08; g.box(Math.cos(a) * 62, 0.1, Math.sin(a) * 40 - 10, 2.2, 1.6, 0.7, k % 2 ? 0x5a3a22 : 0x2b1f1a); }
  // スタンド
  for (let k = 0; k < 6; k++) g.box(0, 0, 50 + k * 2.4, 90, 1.5 + k * 1.5, 2.4, 0xc9c6bf);
  g.box(0, 0, 64, 90, 11, 4, 0xe6e2da); g.box(0, 13.5, 56, 94, 0.6, 18, 0xf2f2f2);
  for (let k = 0; k < 6; k++) g.box(-45 + k * 18, 0, 64, 0.6, 13.5, 0.6, 0x9aa0a6);
  sign(c, '競馬場', 0, 0, 9, 66.1, 10);
  g.box(40, 0, -10, 1.4, 9, 1.4, 0xf2f2f2); g.box(40, 9, -10, 12, 6, 1, 0x1a1a1a);
}
export function modelBotanical(c: Ctx): void {
  pad(c, 118.4, 118.4, 0x86b86a);
  const g = c.g, glass = 0xcfe8ea, frame = 0xf4f6f6, beds = [0xe0405a, 0xf2c230, 0x9a5ac8, 0xf4f4f0, 0xf08a3a];
  g.box(-14, 0, -18, 44, 9, 22, glass); g.gable(-14, 9, -18, 44, 22, 6, glass, 'x', glass, 0.1);
  for (let k = 0; k <= 8; k++) g.box(-36 + k * 5.5, 0, -6.9, 0.3, 9, 0.3, frame);
  g.cyl(26, 0, -24, 10, 4, glass, 20); g.blob(26, 4, -24, 10.2, 10, 10.2, glass, 16);
  for (let r = 0; r < 6; r++) slab(c, -20 + r * 8, 26, 5, 22, beds[r % beds.length], 0.25);
  slab(c, 0, 8, 110, 4, 0xd6c7a1, 0.07); g.cyl(30, 0.05, 22, 9, 0.12, 0x3f7fa6, 16);
  for (let i = 0; i < 24; i++) tree(c, -54 + (i % 12) * 9.5, i < 12 ? -50 : 50, 1 + c.rnd() * 0.4, i % 4 === 0 ? 1 : 0);
  standSign(c, '植物園', 0, 52, 1, 3, true);
}
export function modelOperaHouse(c: Ctx): void {
  pad(c, 88.4, 88.4, 0xd8d2c4);
  const g = c.g, stone = dull(c, 0xefe8d8, 0xd6cdb8), roof = dull(c, 0x6fa08a, 0x5a8070);
  g.box(0, 0, -4, 66, 2.4, 60, 0xc9c2b0);
  g.box(0, 2.4, -8, 52, 18, 40, stone);
  for (let k = 0; k < 10; k++) g.cyl(-22.5 + k * 5, 2.4, 13.5, 1.0, 13, 0xf6f2e8, 10);
  g.box(0, 15.4, 13.5, 52, 1.4, 4, stone); g.gable(0, 16.8, 13.5, 30, 4.6, 5, stone, 'x', stone, 0.3);
  for (let k = 0; k < 3; k++) g.box(0, 0 + k * 0.8, 18 + k * 1.6, 40 - k * 4, 0.8, 1.6, 0xe6dfd0); // 階段
  g.cyl(0, 20.4, -10, 10, 4, stone, 24); g.blob(0, 24.4, -10, 10.4, 9, 10.4, roof, 20); g.cyl(0, 33, -10, 1.2, 3, 0xd4af37, 10);
  sign(c, '歌劇場', 0, 0, 9, 15.6, 6);
  for (let i = 0; i < 6; i++) tree(c, -40 + i * 16, 38, 0.9, 2);
}
export function modelMarket(c: Ctx): void {
  pad(c, 118.4, 88.4, 0x6b6f73);
  const g = c.g, wall = dull(c, 0xc4ccd2, 0xa8b0b6), roof = dull(c, 0x8a9aa6, 0x7a8890);
  g.box(-6, 0, -12, 90, 8, 46, wall);
  for (let k = 0; k < 6; k++) g.gable(-6 - 45 + 7.5 + k * 15, 8, -12, 15, 47, 3.2, roof, 'z', wall, 0.4);
  for (let k = 0; k < 10; k++) { g.box(-46 + k * 9, 0, 11.2, 7, 4.8, 0.2, 0x3a3f44); } // 荷さばきの口
  for (let k = 0; k < 9; k++) { const x = -44 + k * 9.6; g.box(x, 0.3, 17, 2.4, 2.6, 6.6, 0xf2f2f2); g.box(x, 0.3, 21.4, 2.4, 2.2, 2.2, k % 3 ? 0x2b5ea8 : 0xc3312b); }
  sign(c, '市場', 0, -6, 6, 11.1, 5);
  parking(c, 40, 34, 34, 14, 8);
}
export function modelShipyard(c: Ctx): void {
  pad(c, 148.4, 88.4, 0x6b6f73);
  const g = c.g;
  g.box(-10, -6, 4, 100, 6.1, 30, 0x3a5566, 0x3a5566);                                                         // ドック（水を抜いた溝）
  g.box(-10, -5.9, 4, 74, 6, 15, 0xa8322d); g.box(-10, 0.1, 4, 74, 6, 16, 0x2b3a4a); g.box(-10, 6.1, 4, 70, 0.4, 15.6, 0x9aa0a6); // 船体
  g.box(-38, 6.5, 4, 12, 9, 13, 0xf2f2f2); g.box(-38, 15.5, 4, 8, 3, 10, 0xf2f2f2); g.cyl(-30, 6.5, 4, 1.8, 7, 0x2b2b2b, 10);
  // 門形クレーン（ドックをまたぐ）
  for (const x of [-48, 30]) for (const z of [-14, 22]) g.box(x, 0, z, 3, 44, 3, 0xf2c230);
  g.box(-9, 44, -14, 84, 4, 3.2, 0xf2c230); g.box(-9, 44, 22, 84, 4, 3.2, 0xf2c230); g.box(5, 38, 4, 8, 6, 40, 0xc3312b);
  // ジブクレーンと工場
  for (const x of [50, 62]) { g.box(x, 0, -30, 2.4, 26, 2.4, 0xc3312b); zbar(c, x, 26, x - 22, 30, -30, 1.4, 1.4, 0xc3312b); }
  block(c, 52, 20, 36, 22, 3, dull(c, 0xd0d6da, 0xb6bcc0), { fh: 5, label: '造船', lit: 0.3, band: 0x2b5ea8 });
}
export function modelPrison(c: Ctx): void {
  pad(c, 148.4, 148.4, 0xb8b6ae);
  const g = c.g, wall = dull(c, 0xd8d6cf, 0xbfbdb6);
  for (const [x, z, w, d] of [[0, -70, 142, 1.6], [0, 70, 142, 1.6], [-70, 0, 1.6, 142], [70, 0, 1.6, 142]] as const) g.box(x, 0, z, w, 6, d, 0xc4c2ba);
  for (const [x, z] of [[-70, -70], [70, -70], [-70, 70], [70, 70]]) { g.box(x, 0, z, 4, 12, 4, 0xb0aea6); g.box(x, 12, z, 6, 3, 6, 0x8a8880); g.pyramid(x, 15, z, 7, 7, 1.5, 0x5a5a58); }
  for (let k = 0; k < 4; k++) block(c, -40 + k * 27, -26, 20, 50, 3, wall, { fh: 3.4, lit: 0.15, band: 0x9a9890 });
  block(c, 30, 44, 50, 18, 2, wall, { fh: 4, label: '刑務所', lit: 0.4, band: 0x1d3557 });
  slab(c, -10, 40, 50, 30, 0xa89a7a, 0.08);
}

export function modelDam(c: Ctx): void {
  pad(c, 118.4, 88.4, 0x8a8f86);
  const g = c.g, con = dull(c, 0xd2d0c8, 0xb4b1a8), H0 = 18;
  // 上流のダム湖（高い水面）と、下流の川
  g.box(0, 0, -24, 116, H0 - 3, 40, 0x6f8a5e, 0x3f7fa6); for (const sx of [-1, 1]) g.quad([sx * 58, 0, -44], [sx * 58, 0, -4], [sx * 58, H0 - 3, -4], [sx * 58, H0 - 3, -44], 0x6f8a5e); // 湖を囲む土手
  g.box(0, 0, 32, 26, 0.3, 24, 0x3f7fa6);
  // 堤体（下流側が斜め）
  const zf = -4, zb = 8, y1 = H0 + 1;
  g.quad([-58, 0, zb], [58, 0, zb], [58, y1, zf + 2], [-58, y1, zf + 2], con);
  g.box(0, 0, zf - 1, 116, y1, 6, con, 0xbdbab2);
  g.box(0, y1, zf, 118, 1.2, 8, 0x9a9890);                                       // 天端の道路
  for (let k = 0; k < 4; k++) { const x = -15 + k * 10; g.box(x, y1 - 6, zf + 4.2, 7, 6, 2, 0x6b7076); g.box(x, y1 + 1.2, zf, 1.2, 4, 1.2, 0x8b9094); } // 放流ゲート
  for (let k = 0; k < 4; k++) g.quad([-18 + k * 10, 0.4, zb + 1], [-12 + k * 10, 0.4, zb + 1], [-12 + k * 10, y1 - 6, zf + 5.2], [-18 + k * 10, y1 - 6, zf + 5.2], 0xe8f2f6); // 放流の水
  sign(c, 'ダム', 0, 30, 4, zb + 0.6, 6);
  block(c, 34, 22, 18, 10, 1, dull(c, 0xe6e3dc, 0xc9c5bc), { fh: 5, label: '水力', lit: 0.3, band: 0x1f6fb2 });   // 発電所
  for (let k = 0; k < 8; k++) g.box(-56 + k * 16, y1 + 1.2, zf + 3.6, 0.2, 2.6, 0.2, 0x6b7076);
  for (let i = 0; i < 10; i++) tree(c, -55 + i * 12, 40, 1.1, 1);
}

export const MODEL: Record<Kind, (c: Ctx) => void> = {
  megaFloat: modelMegaFloat, undergroundCity: modelUndergroundCity, skyGarden: modelSkyGarden, verticalFarm: modelVerticalFarm, orbitalHotel: modelOrbitalHotel, moonBase: modelMoonBase, aiDataCity: modelAiDataCity, robotDistrict: modelRobotDistrict, metaverseHall: modelMetaverseHall,
  jizodo: modelJizodo, hokora: modelHokora, mosque: modelMosque, synagogue: modelSynagogue, hinduTemple: modelHinduTemple, monastery: modelMonastery, shinshukyo: modelShinshukyo, chonaikaikan: modelChonaikaikan, shobodan: modelShobodan, koshuToilet: modelKoshuToilet, bosaiMusen: modelBosaiMusen,
  observatoryDeck: modelObservatoryDeck, suspensionBridge: modelSuspensionBridge, waterfallTrail: modelWaterfallTrail, cave: modelCave, zipline: modelZipline, athletic: modelAthletic, glamping: modelGlamping, autoCamp: modelAutoCamp, circuit: modelCircuit, kart: modelKart, horseClub: modelHorseClub, skateRink: modelSkateRink, skiJump: modelSkiJump, rowing: modelRowing, budokan: modelBudokan, sumoBeya: modelSumoBeya, nohgaku: modelNohgaku, kabukiza: modelKabukiza, yose: modelYose, smallTheater: modelSmallTheater, jazzClub: modelJazzClub, artIsland: modelArtIsland, railMuseum: modelRailMuseum, mangaMuseum: modelMangaMuseum, hauntedHouse: modelHauntedHouse, maze: modelMaze, yagura: modelYagura, mikoshiGura: modelMikoshiGura, dashiKaikan: modelDashiKaikan, monzenmachi: modelMonzenmachi, shukubamachi: modelShukubamachi, onsenGai: modelOnsenGai, ashiyu: modelAshiyu, kofun: modelKofun, bukeYashiki: modelBukeYashiki, sando: modelSando,
  pumpedHydro: modelPumpedHydro, solarThermal: modelSolarThermal, tidalPower: modelTidalPower, biogas: modelBiogas, rdf: modelRdf, pylon: modelPylon, districtHeat: modelDistrictHeat, kyodoko: modelKyodoko, gasHolder: modelGasHolder, waterTower: modelWaterTower, oilStockpile: modelOilStockpile, irrigation: modelIrrigation, sabo: modelSabo, yusuichi: modelYusuichi, gaikaku: modelGaikaku, haisuiki: modelHaisuiki, cableLanding: modelCableLanding, satStation: modelSatStation, radioTelescope: modelRadioTelescope,
  serviceArea: modelServiceArea, parkingArea: modelParkingArea, tollGate: modelTollGate, jct: modelJct, ventTower: modelVentTower, parkRide: modelParkRide, truckStation: modelTruckStation, coinParking: modelCoinParking, bikeParking: modelBikeParking, shinkansen: modelShinkansen, freightTerminal: modelFreightTerminal, busDepot: modelBusDepot, cableCar: modelCableCar, chairlift: modelChairlift, torokko: modelTorokko, ferryTerminal: modelFerryTerminal, marina: modelMarina, funadamari: modelFunadamari, lock: modelLock, suimon: modelSuimon, hangar: modelHangar, controlTower: modelControlTower, heliTour: modelHeliTour, deliveryRobot: modelDeliveryRobot, airshipMast: modelAirshipMast,
  kencho: modelKencho, zeimusho: modelZeimusho, hellowork: modelHellowork, nenkin: modelNenkin, menkyo: modelMenkyo, nyukan: modelNyukan, kensatsu: modelKensatsu, kasai: modelKasai, kochisho: modelKochisho, shonenin: modelShonenin, policeAcademy: modelPoliceAcademy, kidotai: modelKidotai, coastGuard: modelCoastGuard, kenekijo: modelKenekijo, navyBase: modelNavyBase, airBase: modelAirBase, radarSite: modelRadarSite, ammoDepot: modelAmmoDepot, gikai: modelGikai, seisoJimusho: modelSeisoJimusho, doroJimusho: modelDoroJimusho, yukisute: modelYukisute, suibo: modelSuibo,
  dental: modelDental, specialClinic: modelSpecialClinic, psychHospital: modelPsychHospital, rehabHospital: modelRehabHospital, ryoyo: modelRyoyo, hospice: modelHospice, dialysis: modelDialysis, hokenjo: modelHokenjo, bloodRoom: modelBloodRoom, pharmacy: modelPharmacy, dayService: modelDayService, shuro: modelShuro, yogo: modelYogo, boshi: modelBoshi, jisou: modelJisou, houkatsu: modelHoukatsu, nokotsudo: modelNokotsudo, petCemetery: modelPetCemetery,
  privSchool: modelPrivSchool, intlSchool: modelIntlSchool, foreignSchool: modelForeignSchool, specialSchool: modelSpecialSchool, teijisei: modelTeijisei, kosen: modelKosen, senmon: modelSenmon, tandai: modelTandai, kunren: modelKunren, kyoshujo: modelKyoshujo, accelerator: modelAccelerator, natLab: modelNatLab, kishodai: modelKishodai, quakeObs: modelQuakeObs, histMuseum: modelHistMuseum, scienceMuseum: modelScienceMuseum, bungakukan: modelBungakukan, kominkan: modelKominkan, lifelong: modelLifelong, seishonen: modelSeishonen, planetarium: modelPlanetarium,
  danchi: modelDanchi, newTown: modelNewTown, shataku: modelShataku, studentDorm: modelStudentDorm, shareHouse: modelShareHouse, sakouju: modelSakouju, yuryoRojin: modelYuryoRojin, groupHome: modelGroupHome, nagaya: modelNagaya, kominka: modelKominka, besso: modelBesso, nisetai: modelNisetai, hiraya: modelHiraya, garageHouse: modelGarageHouse, gatedTown: modelGatedTown, tinyVillage: modelTinyVillage, kasetsu: modelKasetsu, jiritsu: modelJiritsu,
  electronics: modelElectronics, homeCenter: modelHomeCenter, furnitureStore: modelFurnitureStore, bookstore: modelBookstore, reuseShop: modelReuseShop, dollarShop: modelDollarShop, discount: modelDiscount, warehouseClub: modelWarehouseClub, carGoods: modelCarGoods, dealer: modelDealer, usedCar: modelUsedCar, rentACar: modelRentACar, laundromat: modelLaundromat, carWash: modelCarWash, autoRepair: modelAutoRepair, carInspect: modelCarInspect, famiRes: modelFamiRes, chainFood: modelChainFood, fastFood: modelFastFood, izakaya: modelIzakaya, yataiMura: modelYataiMura, jogaiMarket: modelJogaiMarket, kojinten: modelKojinten, shinkin: modelShinkin, securities: modelSecurities, realEstate: modelRealEstate, lawOffice: modelLawOffice, pawnShop: modelPawnShop, cleaning: modelCleaning, photoStudio: modelPhotoStudio, petShop: modelPetShop, vet: modelVet, cramSchool: modelCramSchool, lessonSchool: modelLessonSchool, karaokeBox: modelKaraoke, bowling: modelBowling, gameCenter: modelGameCenter, mangaCafe: modelMangaCafe, mahjong: modelMahjong, battingCenter: modelBattingCenter, golfRange: modelGolfRange, fishingPond: modelFishingPond, sauna: modelSauna, capsuleHotel: modelCapsuleHotel, minpaku: modelMinpaku, loveHotel: modelLoveHotel, coworking: modelCoworking,
  chemPlant: modelChemPlant, paperMill: modelPaperMill, cementPlant: modelCementPlant, glassWorks: modelGlassWorks, tirePlant: modelTirePlant, textileMill: modelTextileMill, aluminumPlant: modelAluminumPlant, kiln: modelKiln, cutlery: modelCutlery, furnitureShop: modelFurnitureShop, foundry: modelFoundry, printPlant: modelPrintPlant, dairyPlant: modelDairyPlant, bottling: modelBottling, medDevice: modelMedDevice, aeroParts: modelAeroParts, quarry: modelQuarry, gravelPit: modelGravelPit, mine: modelMine, indWaste: modelIndWaste, landfill: modelLandfill, nightSoil: modelNightSoil, scrapYard: modelScrapYard, carAuction: modelCarAuction, cosmetics: modelCosmetics, toyFactory: modelToyFactory,
  poultry: modelPoultry, pigFarm: modelPigFarm, beefRanch: modelBeefRanch, dairy: modelDairy, horseFarm: modelHorseFarm, teaField: modelTeaField, orchard: modelOrchard, greenhouse: modelGreenhouse, plantFactory: modelPlantFactory, flowerFarm: modelFlowerFarm, shiitake: modelShiitake, bamboo: modelBamboo, riceCenter: modelRiceCenter, compost: modelCompost, sakeBrewery: modelSakeBrewery, soyBrewery: modelSoyBrewery, teaFactory: modelTeaFactory, aquaRaft: modelAquaRaft, landAqua: modelLandAqua, fishFarm: modelFishFarm, setNet: modelSetNet, fishProcess: modelFishProcess, coldStorage: modelColdStorage, sawmill: modelSawmill, timberMarket: modelTimberMarket, forestry: modelForestry, ranchPark: modelRanchPark, apiary: modelApiary, wasabi: modelWasabi, saltField: modelSaltField,
  slDepot: modelSlDepot, waterBus: modelWaterBus, cruisePier: modelCruisePier, yakatabune: modelYakatabune,
  hydrogenStation: modelHydrogenStation, droneHub: modelDroneHub, mobilityHub: modelMobilityHub, gridBattery: modelGridBattery, perovskite: modelPerovskite, offshoreWind: modelOffshoreWind, smr: modelSmr, logiTunnel: modelLogiTunnel, spaceSolar: modelSpaceSolar, spaceElevator: modelSpaceElevator,
  lngTerminal: modelLngTerminal, desalination: modelDesalination,
  cellTower: modelCellTower, telecomHub: modelTelecomHub,
  yokocho: modelYokocho, nightDistrict: modelNightDistrict, fuzokuDistrict: modelFuzokuDistrict, carPlant: modelCarPlant, heavyInd: modelHeavyInd, foodMaker: modelFoodMaker, zenecon: modelZenecon, tradingCo: modelTradingCo, stockExch: modelStockExch, spaceport: modelSpaceport, spaceVenture: modelSpaceVenture, humanoidLab: modelHumanoidLab, bizHotel: modelBizHotel, luxuryHotel: modelLuxuryHotel, ryokan: modelRyokan, privHigh: modelPrivHigh, clubTeam: modelClubTeam, arcade: modelArcade,
  railDepot: modelRailDepot, maglevStation: modelMaglevStation, hyperloop: modelHyperloop, consulate: modelConsulate, department: modelDepartment, futureTower: modelFutureTower, expoSite: modelExpoSite, redBrick: modelRedBrick, westernHouse: modelWesternHouse, machiya: modelMachiya, clockTower: modelClockTower, ironTower: modelIronTower, windmill: modelWindmill, pyramidHall: modelPyramidHall, triumphGate: modelTriumphGate, autoHub: modelAutoHub,
  house: modelHouseLot, apartment: modelApartment, mansion: modelMansion, tsunamiTower: modelTsunamiTower, tvStation: modelTvStation, megaBank: modelMegaBank, globalIT: modelGlobalIT, towerMansion: modelTowerMansion, usBase: modelUsBase, oilField: modelOilField, oilRefinery: modelOilRefinery, gasStation: modelGasStation, parkingTower: modelParkingTower, ancientRuins: modelAncientRuins, bakery: modelBakery, shop: modelShop, supermarket: modelSupermarket,
  nursery: modelNursery, privNursery: modelNursery, school: modelSchool, park: modelPark, fire: modelFire, water: modelWater, waste: modelWaste,
  station: modelStation, clinic: modelClinic, koban: modelKoban,
  nurseryS: modelNurseryS, nurseryL: modelNurseryL, jhs: modelJhs, highschool: modelHighschool, parkM: modelParkM, parkL: modelParkL, fireS: modelFireS, fireL: modelFireL,
  waterS: modelWaterS, waterL: modelWaterL, sewageS: modelSewageS, sewage: modelSewage, wasteL: modelWasteL, solar: modelSolar, substation: modelSubstation, gas: modelGas,
  police: modelPolice, hospital: modelHospital, libraryS: modelLibraryS, library: modelLibrary, gym: modelGym, hall: modelHall, museum: modelMuseum, tower: modelTower, stadium: modelStadium,
  elderly: modelElderly, carePlaza: modelCarePlaza, shelter: modelShelter, basin: modelBasin,
  office: modelOffice, factory: modelFactory, logistics: modelLogistics, datacenter: modelDatacenter, hotel: modelHotel, themepark: modelThemepark,
  airport: modelAirport, port: modelPort, ic: modelIc, busTerminal: modelBusTerminal, cityHall: modelCityHall, branchOffice: modelBranchOffice, govOffice: modelGovOffice, court: modelCourt,
  univHospital: modelUnivHospital, nightClinic: modelNightClinic, university: modelUniversity, convention: modelConvention, arena: modelArena,
  mall: modelMall, cinema: modelCinema, onsen: modelOnsen, aquarium: modelAquarium, zoo: modelZoo, golf: modelGolf, camp: modelCamp, michinoeki: modelMichinoeki,
  farm: modelFarm, allotment: modelAllotment, forestPark: modelForestPark, riverPark: modelRiverPark, biotope: modelBiotope,
  itPark: modelItPark, gameStudio: modelGameStudio, foodFactory: modelFoodFactory, pharma: modelPharma, callCenter: modelCallCenter, bankHq: modelBankHq, battery: modelBattery, semicon: modelSemicon, konbini: modelKonbini, nuclear: modelNuclear, lngPower: modelLngPower, coalPower: modelCoalPower, windFarm: modelWindFarm, hydro: modelHydro, geothermal: modelGeothermal, biomass: modelBiomass, ropeway: modelRopeway, dome: modelDome, liveHouse: modelLiveHouse, fitness: modelFitness, robotaxi: modelRobotaxi, cafe: modelCafe, drugstore: modelDrugstore, sdfBase: modelSdfBase,
  officeS: modelOfficeS, officeM: modelOfficeM, smallFactory: modelSmallFactory, hqTower: modelHqTower, radioTower: modelRadioTower, fiberHub: modelFiberHub, evStation: modelEvStation, smartSignal: modelSmartSignal, autoBusDepot: modelAutoBusDepot, ioDatacenter: modelDatacenter, vertiport: modelVertiport, cityOS: modelCityOS, fusion: modelFusion,
  shrine: modelShrine, temple: modelTemple, grandShrine: modelGrandShrine, church: modelChurch, castle: modelCastle, castleRuins: modelCastleRuins, crematorium: modelCrematorium, funeralHall: modelFuneralHall, cemetery: modelCemetery,
  lighthouse: modelLighthouse, observatory: modelObservatory, ferrisWheel: modelFerrisWheel, racecourse: modelRacecourse, botanical: modelBotanical, operaHouse: modelOperaHouse, market: modelMarket, shipyard: modelShipyard, prison: modelPrison, dam: modelDam,
  ballpark: modelBallpark, beach: modelBeach, hotSpring: modelHotSpring, flowerPark: modelFlowerPark, tameike: modelTameike, lrt: modelLrt, parkingLot: modelParkingLot, industrialPark: modelIndustrialPark, lab: modelLab, fishPort: modelFishPort, tourFarm: modelTourFarm, recycleCenter: modelRecycleCenter,
  musicArena: modelMusicArena, brewery: modelBrewery, steelMill: modelSteelMill, partsPlant: modelPartsPlant, defensePlant: modelDefensePlant, kindergarten: modelKindergarten, salon: modelSalon, maternity: modelMaternity, perinatal: modelPerinatal, clubhouse: modelClubhouse, postOffice: modelPostOffice, paddy: modelPaddy, field: modelField, heliport: modelHeliport, multicultural: modelMulticultural,
  kodomoMirai: modelKodomoMirai, ecoCenter: modelEcoCenter, kankoDmo: modelKankoDmo, incubator: modelIncubator, bosaiCenter: modelBosaiCenter, dxCenter: modelDxCenter,
  weddingHall: modelWeddingHall, jidokan: modelJidokan, kidsPark: modelKidsPark, amusementPark: modelAmusementPark, megaPark: modelMegaPark, pool: modelPool, athletics: modelAthletics, rugby: modelRugby, pachinko: modelPachinko, boatRace: modelBoatRace, keirin: modelKeirin, japaneseGarden: modelJapaneseGarden, giantRobot: modelGiantRobot, robotFactory: modelRobotFactory, casino: modelCasino, outletMall: modelOutletMall, skiResort: modelSkiResort, esportsArena: modelEsportsArena, skyscraper: modelSkyscraper,
};
/** v86：よく建つ公共施設の外壁の素材（保育園・幼稚園は塗り壁、消防署はタイル、交番・診療所は窯業サイディング）。形は変えない */
for (const [k, mat] of [['nursery', 8], ['nurseryS', 8], ['nurseryL', 8], ['kindergarten', 8], ['fire', 6], ['fireS', 6], ['fireL', 6], ['koban', 4], ['clinic', 4]] as [Kind, number][]) {
  const f = MODEL[k]; if (f) MODEL[k] = (c) => { const s = c.g.wallMat; c.g.wallMat = mat; try { f(c); } finally { c.g.wallMat = s; } };
}
export const MODEL_H: Record<Kind, number> = {
  megaFloat: 42, undergroundCity: 6, skyGarden: 112, verticalFarm: 48, orbitalHotel: 49, moonBase: 8, aiDataCity: 22, robotDistrict: 18, metaverseHall: 14,
  jizodo: 5, hokora: 4, mosque: 28, synagogue: 11, hinduTemple: 18, monastery: 18, shinshukyo: 28, chonaikaikan: 7, shobodan: 17, koshuToilet: 4, bosaiMusen: 14,
  observatoryDeck: 26, suspensionBridge: 8, waterfallTrail: 26, cave: 14, zipline: 18, athletic: 6, glamping: 7, autoCamp: 4, circuit: 10, kart: 3, horseClub: 5, skateRink: 16, skiJump: 44, rowing: 6, budokan: 17, sumoBeya: 7, nohgaku: 14, kabukiza: 22, yose: 9, smallTheater: 11, jazzClub: 7, artIsland: 14, railMuseum: 14, mangaMuseum: 19, hauntedHouse: 11, maze: 5, yagura: 8, mikoshiGura: 8, dashiKaikan: 12, monzenmachi: 7, shukubamachi: 8, onsenGai: 9, ashiyu: 4, kofun: 10, bukeYashiki: 7, sando: 8,
  pumpedHydro: 20, solarThermal: 60, tidalPower: 9, biogas: 12, rdf: 30, pylon: 41, districtHeat: 26, kyodoko: 4, gasHolder: 25, waterTower: 30, oilStockpile: 13, irrigation: 4, sabo: 10, yusuichi: 4, gaikaku: 10, haisuiki: 10, cableLanding: 8, satStation: 16, radioTelescope: 44,
  serviceArea: 9, parkingArea: 5, tollGate: 8, jct: 20, ventTower: 31, parkRide: 12, truckStation: 7, coinParking: 4, bikeParking: 3, shinkansen: 16, freightTerminal: 13, busDepot: 7, cableCar: 44, chairlift: 30, torokko: 4, ferryTerminal: 16, marina: 9, funadamari: 4, lock: 11, suimon: 16, hangar: 14, controlTower: 45, heliTour: 5, deliveryRobot: 4, airshipMast: 31,
  kencho: 76, zeimusho: 15, hellowork: 12, nenkin: 12, menkyo: 12, nyukan: 20, kensatsu: 20, kasai: 12, kochisho: 17, shonenin: 11, policeAcademy: 15, kidotai: 12, coastGuard: 14, kenekijo: 8, navyBase: 20, airBase: 28, radarSite: 32, ammoDepot: 6, gikai: 17, seisoJimusho: 8, doroJimusho: 8, yukisute: 8, suibo: 7,
  dental: 7, specialClinic: 11, psychHospital: 11, rehabHospital: 15, ryoyo: 11, hospice: 7, dialysis: 8, hokenjo: 11, bloodRoom: 4, pharmacy: 5, dayService: 5, shuro: 5, yogo: 7, boshi: 9, jisou: 8, houkatsu: 4, nokotsudo: 16, petCemetery: 4,
  privSchool: 18, intlSchool: 11, foreignSchool: 11, specialSchool: 8, teijisei: 11, kosen: 15, senmon: 21, tandai: 16, kunren: 11, kyoshujo: 7, accelerator: 18, natLab: 18, kishodai: 24, quakeObs: 9, histMuseum: 18, scienceMuseum: 25, bungakukan: 10, kominkan: 9, lifelong: 14, seishonen: 12, planetarium: 20,
  danchi: 9, newTown: 7, shataku: 12, studentDorm: 15, shareHouse: 8, sakouju: 12, yuryoRojin: 12, groupHome: 5, nagaya: 5, kominka: 9, besso: 7, nisetai: 9, hiraya: 6, garageHouse: 8, gatedTown: 8, tinyVillage: 4, kasetsu: 4, jiritsu: 10,
  electronics: 12, homeCenter: 10, furnitureStore: 16, bookstore: 8, reuseShop: 7, dollarShop: 7, discount: 10, warehouseClub: 14, carGoods: 7, dealer: 9, usedCar: 4, rentACar: 4, laundromat: 4, carWash: 6, autoRepair: 7, carInspect: 9, famiRes: 9, chainFood: 4, fastFood: 12, izakaya: 7, yataiMura: 4, jogaiMarket: 6, kojinten: 8, shinkin: 13, securities: 19, realEstate: 7, lawOffice: 15, pawnShop: 9, cleaning: 4, photoStudio: 7, petShop: 4, vet: 7, cramSchool: 14, lessonSchool: 11, karaokeBox: 16, bowling: 20, gameCenter: 11, mangaCafe: 14, mahjong: 11, battingCenter: 12, golfRange: 30, fishingPond: 4, sauna: 6, capsuleHotel: 22, minpaku: 8, loveHotel: 20, coworking: 12,
  chemPlant: 22, paperMill: 24, cementPlant: 46, glassWorks: 12, tirePlant: 12, textileMill: 8, aluminumPlant: 12, kiln: 8, cutlery: 6, furnitureShop: 6, foundry: 22, printPlant: 12, dairyPlant: 14, bottling: 16, medDevice: 16, aeroParts: 20, quarry: 14, gravelPit: 8, mine: 24, indWaste: 40, landfill: 8, nightSoil: 8, scrapYard: 10, carAuction: 14, cosmetics: 14, toyFactory: 12,
  poultry: 5, pigFarm: 4, beefRanch: 6, dairy: 16, horseFarm: 5, teaField: 3, orchard: 4, greenhouse: 4, plantFactory: 10, flowerFarm: 5, shiitake: 10, bamboo: 14, riceCenter: 28, compost: 8, sakeBrewery: 16, soyBrewery: 8, teaFactory: 12, aquaRaft: 4, landAqua: 7, fishFarm: 3, setNet: 5, fishProcess: 11, coldStorage: 17, sawmill: 9, timberMarket: 7, forestry: 12, ranchPark: 7, apiary: 3, wasabi: 4, saltField: 6,
  slDepot: 10, waterBus: 7, cruisePier: 9, yakatabune: 7,
  hydrogenStation: 8, droneHub: 12, mobilityHub: 4, gridBattery: 6, perovskite: 35, offshoreWind: 50, smr: 20, logiTunnel: 14, spaceSolar: 33, spaceElevator: 120,
  lngTerminal: 30, desalination: 11,
  cellTower: 34, telecomHub: 42,
  yokocho: 8, nightDistrict: 18, fuzokuDistrict: 20, carPlant: 18, heavyInd: 30, foodMaker: 16, zenecon: 30, tradingCo: 45, stockExch: 22, spaceport: 56, spaceVenture: 18, humanoidLab: 18, bizHotel: 34, luxuryHotel: 72, ryokan: 13, privHigh: 18, clubTeam: 12, arcade: 9,
  railDepot: 11, maglevStation: 20, hyperloop: 12, consulate: 13, department: 30, futureTower: 200, expoSite: 30, redBrick: 12, westernHouse: 17, machiya: 8, clockTower: 84, ironTower: 130, windmill: 30, pyramidHall: 22, triumphGate: 27, autoHub: 13,
  house: 7, apartment: 12, mansion: 32, tsunamiTower: 18, tvStation: 70, megaBank: 52, globalIT: 22, towerMansion: 130, usBase: 26, oilField: 33, oilRefinery: 48, gasStation: 8, parkingTower: 19, ancientRuins: 15, bakery: 8, shop: 8, supermarket: 9, nursery: 5, privNursery: 5, school: 13, park: 4, fire: 12, water: 9, waste: 7, station: 9, clinic: 8, koban: 7,
  nurseryS: 5, nurseryL: 8, jhs: 13, highschool: 13, parkM: 5, parkL: 8, fireS: 8, fireL: 24, waterS: 7, waterL: 10, sewageS: 4, sewage: 6, wasteL: 58, solar: 2, substation: 14, gas: 14,
  police: 19, hospital: 26, libraryS: 7, library: 14, gym: 17, hall: 22, museum: 16, tower: 115, stadium: 38, elderly: 12, carePlaza: 8, shelter: 6, basin: 2,
  office: 46, factory: 34, logistics: 15, datacenter: 13, hotel: 33, themepark: 50,
  airport: 30, port: 32, ic: 12, busTerminal: 5, cityHall: 38, branchOffice: 12, govOffice: 33, court: 19, univHospital: 41, nightClinic: 8, university: 34, convention: 20, arena: 22,
  mall: 18, cinema: 16, onsen: 14, aquarium: 20, zoo: 10, golf: 8, camp: 6, michinoeki: 10, farm: 4, allotment: 2, forestPark: 9, riverPark: 4, biotope: 3,
  itPark: 42, gameStudio: 16, foodFactory: 14, pharma: 20, callCenter: 22, bankHq: 36, battery: 15, semicon: 28, konbini: 5, nuclear: 30, lngPower: 70, coalPower: 110, windFarm: 72, hydro: 7, geothermal: 20, biomass: 34, ropeway: 9, dome: 40, liveHouse: 9, fitness: 12, robotaxi: 9, cafe: 7, drugstore: 7, sdfBase: 14,
  officeS: 20, officeM: 50, smallFactory: 10, hqTower: 128, radioTower: 34, fiberHub: 12, evStation: 6, smartSignal: 12, autoBusDepot: 8, ioDatacenter: 13, vertiport: 12, cityOS: 24, fusion: 45,
  shrine: 12, temple: 36, grandShrine: 26, church: 30, castle: 52, castleRuins: 8, crematorium: 22, funeralHall: 9, cemetery: 4, lighthouse: 27, observatory: 15, ferrisWheel: 58, racecourse: 15, botanical: 15, operaHouse: 35, market: 12, shipyard: 48, prison: 15, dam: 36,
  ballpark: 36, beach: 5, hotSpring: 16, flowerPark: 8, tameike: 3, lrt: 10, parkingLot: 3, industrialPark: 26, lab: 20, fishPort: 10, tourFarm: 12, recycleCenter: 10,
  musicArena: 24, brewery: 19, steelMill: 48, partsPlant: 16, defensePlant: 20, kindergarten: 6, salon: 7, maternity: 12, perinatal: 34, clubhouse: 8, postOffice: 7, paddy: 2, field: 3, heliport: 9, multicultural: 9,
  kodomoMirai: 13, ecoCenter: 22, kankoDmo: 10, incubator: 16, bosaiCenter: 20, dxCenter: 12,
  weddingHall: 26, jidokan: 9, kidsPark: 13, amusementPark: 40, megaPark: 56, pool: 12, athletics: 22, rugby: 12, pachinko: 18, boatRace: 14, keirin: 12, japaneseGarden: 8, giantRobot: 18, robotFactory: 15, casino: 98, outletMall: 9, skiResort: 10, esportsArena: 15, skyscraper: 300,
};

// ---- v17 の施設 ----
export function modelMusicArena(c: Ctx): void {
  pad(c, 118.4, 88.4, 0x8f939a);
  const g = c.g, wall = dull(c, 0x2a2d36, 0x3a3c42);
  g.box(0, 0, -6, 84, 18, 56, wall, 0x5a5f6a); g.box(0, 18, -6, 78, 4, 50, 0x6a707c, 0x7d8592); g.box(0, 22, -6, 60, 1.2, 34, 0x9aa3b0);
  // 正面のガラスのロビーと、色の変わる帯（夜にも灯る）
  c.wa.box(0, 2, 22.3, 60, 10, 0.4, 0x8fd0ff); g.box(0, 12.2, 23, 70, 1.6, 2, 0xff4fa8); g.box(0, 15, 22.6, 84, 0.8, 0.6, 0x4fd0ff);
  sign(c, 'LIVE', 0, 0, 13.2, 24.1, 9);
  slab(c, 0, 33, 90, 18, 0xc8c2b6, 0.08);
  for (let i = 0; i < 6; i++) g.box(-40 + i * 16, 0, 38, 0.6, 7, 0.6, 0x3a3a3a), g.box(-40 + i * 16, 7, 38, 6, 3, 0.3, [0xff4fa8, 0x4fd0ff, 0xf2c230][i % 3]);
  parking(c, -44, -6, 24, 50, 6);
  for (let i = 0; i < 8; i++) tree(c, -56 + i * 16, 42, 0.9);
}
export function modelBrewery(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x9a9890);
  const g = c.g, wall = dull(c, 0xe9e3d6, 0xcfc7b6);
  block(c, -18, -18, 40, 30, 3, wall, { fh: 5, roof: 0x8a8d90, band: 0x8a5a2a });
  for (let i = 0; i < 6; i++) { const x = 12 + (i % 3) * 10, z = -26 + Math.floor(i / 3) * 12; g.cyl(x, 0, z, 4, 16, 0xd6d8da, 12, 0xb8bcbf); g.cyl(x, 16, z, 4, 1.6, 0xb8bcbf, 12, 0xa8acaf, 1.2); }
  // ビアレストラン（れんが・三角屋根）と見学者の入口
  g.box(-14, 0, 22, 30, 6, 16, 0x9a4a2e); g.gable(-14, 6, 22, 30, 16, 4, 0x3a3a3a, 'x', 0x9a4a2e, 0.5);
  c.wa.box(-14, 1, 30.2, 22, 3, 0.3, 0xffd890); sign(c, 'ビール', 0, -14, 7.2, 30.4, 5);
  g.cyl(-36, 0, 24, 3, 1.2, 0xc89a3a, 10); g.cyl(-36, 1.2, 24, 3.2, 4, 0xe0b040, 10, 0xfff4d0, 2.6); // 看板の樽
  for (let i = 0; i < 4; i++) g.box(14 + i * 7, 0, 22, 3, 3, 9, 0xf2c230), g.box(14 + i * 7, 3, 22, 3, 0.4, 9, 0xd0d0d0);
  for (let i = 0; i < 6; i++) tree(c, -40 + i * 16, 40, 0.9);
}
export function modelSteelMill(c: Ctx): void {
  pad(c, 148.4, 118.4, 0x6a6862);
  const g = c.g, wall = dull(c, 0x6f7a86, 0x5e6670);
  g.box(-20, 0, -14, 90, 22, 40, wall, 0x5a5a58); g.gable(-20, 22, -14, 90, 40, 6, 0x4a4e52, 'x', wall, 0.3);
  g.box(40, 0, -20, 30, 30, 24, 0x5a6066, 0x4a4a48); // 電炉の建屋
  for (let i = 0; i < 3; i++) g.cyl(36 + i * 8, 30, -26, 1.8, 18, 0x8a8a88, 8), g.cyl(36 + i * 8, 46, -26, 2.0, 2, 0xc3312b, 8);
  sign(c, '製鉄', 0, -20, 14, 6.1, 8);
  // スクラップの山と鋼材の置き場、クレーン
  for (let i = 0; i < 4; i++) g.blob(-50 + i * 14, 0, 30, 6, 4 + (i % 2) * 2, 6, [0x6a5a4a, 0x7a6a5a, 0x5a4a3a][i % 3], 6);
  for (let i = 0; i < 5; i++) g.box(20 + i * 8, 0, 30, 6, 1.4 + (i % 3) * 0.6, 14, 0x4a5058);
  zbar(c, 10, 14, 70, 14, 46, 1.4, 1.4, 0xf2c230); g.box(12, 0, 46, 1.6, 14, 1.6, 0xf2c230); g.box(68, 0, 46, 1.6, 14, 1.6, 0xf2c230);
  for (let k = 0; k < 6; k++) g.box(-70 + k * 4, 0.1, 52, 1.2, 0.6, 8, 0x3a3a3a);
}
export function modelPartsPlant(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xa4a29a);
  const g = c.g, wall = dull(c, 0xe8ebee, 0xc8ccd0);
  g.box(-10, 0, -4, 56, 10, 34, wall, 0x9aa0a6);
  for (let i = 0; i < 7; i++) g.gable(-34 + i * 8, 10, -4, 8, 34, 2.4, 0x7f8a96, 'z', wall, 0.1); // のこぎり屋根
  block(c, 30, 8, 18, 12, 3, 0xffffff, { label: '部品', glass: 0x6f8fa8 });
  parking(c, 30, -14, 22, 14, 5);
  for (let i = 0; i < 3; i++) g.box(-30 + i * 10, 0, 20, 6, 2.4, 3, 0x2b5ea8);
}
export function modelDefensePlant(c: Ctx): void {
  pad(c, 118.4, 88.4, 0x7f8478);
  const g = c.g, wall = dull(c, 0x8e9682, 0x7a8270);
  g.box(-14, 0, -10, 70, 16, 46, wall, 0x6a7064); g.box(-14, 16, -10, 70, 2, 46, 0x6a7064);
  g.box(36, 0, -16, 26, 12, 30, 0x6f7866, 0x5a6052);
  block(c, 38, 26, 22, 10, 3, 0xe6e6e0, { label: '防衛', glass: 0x5a6a7a, band: 0x4b5a32 });
  // 試験場・保管庫（窓の少ない頑丈な建物）と、二重のフェンス
  for (let i = 0; i < 3; i++) { g.box(-44 + i * 16, 0, 30, 12, 5, 10, 0x6a7064); g.cyl(-44 + i * 16, 5, 30, 5, 0.8, 0x5a6052, 10); }
  fenceRect(c, 116, 86, 2.6, 0x9a9e96, 4); fenceRect(c, 112, 82, 2.2, 0x9a9e96, 4);
  g.box(56, 0, 40, 4, 3, 4, 0xe6e6e0); // 守衛所
}
export function modelKindergarten(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xd9c79c);
  const g = c.g, wall = dull(c, 0xfff2d6, 0xe0d4b6), roof = dull(c, 0xe86a4a, 0xb07a6a);
  g.box(-12, 0, -4, 30, 4, 12, wall); g.gable(-12, 4, -4, 30, 12, 2, roof, 'x', wall, 0.6);
  winRow(c, 0, -26, 2, 0.6, 2.05, 5, 3.2, 2.2, 0.9, 0xd7e6ea); sign(c, '幼稚園', 0, -12, 3.0, 2.08, 3);
  slab(c, 14, 2, 26, 20, 0xd9b98a, 0.07); // 園庭
  g.box(8, 0, 6, 6, 0.6, 4, 0xf2c230); g.box(18, 0, 2, 1, 3, 1, 0xe86a7a); zbar(c, 16, 3, 20, 3, 2, 0.3, 0.3, 0x3a6fb0); g.box(22, 0, 8, 3, 1.4, 3, 0x6ab0e0);
  fenceRect(c, 57.6, 27.6, 1.2, 0x8fbf8a, 5); tree(c, 26, -10, 0.8, 2); tree(c, -26, 10, 0.8);
}
export function modelSalon(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb3b0a8);
  const g = c.g, wall = pick(c, [0xf4f1ea, 0x2a2a2e, 0xe8dcd0, 0xc9d6d9]);
  g.box(0, 0, 0, 16, 6.6, 12, wall, 0x8f9192); g.box(0, 6.6, 0, 16.2, 0.4, 12.2, 0xc9c6bf);
  c.wa.box(-1.5, 0.4, 6.05, 10, 4, 0.1, 0xf6e7d0); g.box(5, 0, 6.06, 1.2, 2.4, 0.1, 0x3a3f44);
  // 美容室のサインポール（赤・白・青）
  for (let k = 0; k < 3; k++) g.cyl(7.4, 0.6 + k * 0.8, 6.6, 0.35, 0.8, [0xc3312b, 0xffffff, 0x2b4c8c][k], 8);
  sign(c, '美容室', 0, -1.5, 5.1, 6.08, 4); bush(c, -9, 10, 1); tree(c, 11, 10, 0.8);
  slab(c, 0, 10, 14, 6, 0xc8c2b6, 0.07);
}
export function modelMaternity(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b5ac);
  const g = c.g, wall = dull(c, 0xfbeff0, 0xe0d4d6);
  block(c, 0, -2, 20, 14, 3, wall, { label: '産院', glass: 0xbfd8e8, band: 0xe8a0b0 });
  g.box(0, 0, 6.5, 6, 3, 2, 0xe8a0b0); bush(c, -8, 10, 1, 0xd88aa0); bush(c, 8, 10, 1); car(c, 10, 9, true);
}
export function modelPerinatal(c: Ctx): void {
  pad(c, 88.4, 88.4, 0xb4b2ab);
  const g = c.g, wall = dull(c, 0xf6f6f2, 0xdcdcd4);
  block(c, -10, -12, 50, 30, 9, wall, { label: '病院', glass: 0x9fc4dc });
  block(c, 22, 12, 26, 18, 4, 0xfbeff0, { label: '周産期', glass: 0xbfd8e8, band: 0xe8a0b0 });
  // 屋上のヘリポート（H の印）
  const h = 9 * 3.6 + 0.6; g.box(-10, h + 0.45, -12, 16, 0.3, 16, 0x4a4e52); g.box(-12, h + 0.8, -12, 1, 0.05, 7, 0xffffff); g.box(-8, h + 0.8, -12, 1, 0.05, 7, 0xffffff); g.box(-10, h + 0.8, -12, 4, 0.05, 1, 0xffffff);
  g.box(-10, 0, 6, 12, 4, 5, 0xc3312b); parking(c, -24, 30, 36, 14, 8);
  for (let i = 0; i < 5; i++) tree(c, 10 + i * 7, 38, 0.8);
}
export function modelClubhouse(c: Ctx): void {
  pad(c, 88.4, 58.4, 0x6f9a52);
  const g = c.g;
  slab(c, 12, -2, 58, 40, 0x5aa04a, 0.06); g.box(12, 0.12, -2, 0.4, 0.05, 40, 0xffffff); // 練習グラウンド
  for (const x of [-15, 39]) { g.box(x, 0, -2, 0.3, 2.4, 7, 0xffffff); }
  block(c, -32, -4, 18, 26, 2, 0xf4f1e8, { label: 'センター', glass: 0x6f8fa8, band: 0x1f6b3a });
  g.box(-32, 0, 14, 18, 3, 6, 0x1f6b3a); fenceRect(c, 87, 57, 4, 0x6a8a6a, 6);
}
export function modelPostOffice(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb3b0a8);
  const g = c.g, wall = dull(c, 0xf4f1ea, 0xd6d1c6);
  g.box(0, 0, -1, 18, 6, 13, wall, 0x8f9192); g.box(0, 6, -1, 18.2, 0.5, 13.2, 0xc3312b);
  c.wa.box(-2, 0.5, 5.55, 9, 3.4, 0.1, 0xd7e6ea); g.box(5, 0, 5.56, 2, 2.4, 0.1, 0x3a3f44);
  sign(c, '郵便', 0, -2, 4.6, 5.58, 3.4);
  g.cyl(8, 0, 9, 0.6, 1.6, 0xc3312b, 10, 0xc3312b); g.box(8, 1.6, 9, 1.4, 0.2, 1.2, 0xc3312b); // ポスト
  g.box(-8, 0, 9, 1.4, 1.1, 2.2, 0xc3312b); // 赤いバイク
}
export function modelPaddy(c: Ctx): void {
 const sv0_ = c.g.surfv; c.g.surfv = -2; // 作物は季節の桜色・紅葉にしない
  pad(c, 58.4, 58.4, 0x8a7a52, 0.04);
  const g = c.g;
  for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) {
    const x = -14 + k * 28, z = -14 + r * 28;
    g.box(x, 0, z, 27, 0.45, 27, 0x7a6a42); slab(c, x, z, 25, 25, 0x6a9ab0, 0.42); // あぜと水面
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) g.box(x - 11 + i * 2.75, 0.4, z - 11 + j * 2.75, 0.7, 0.55, 0.7, 0x6fae3a);
  }
  g.box(28, 0, -28, 1.2, 0.6, 1.2, 0x5a5a58); // 水口
  c.g.surfv = sv0_;
}
export function modelField(c: Ctx): void {
 const sv0_ = c.g.surfv; c.g.surfv = -2; // 作物は季節の桜色・紅葉にしない
  pad(c, 58.4, 58.4, 0x8a7a52, 0.04);
  const g = c.g;
  for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) {
    const x = -14 + k * 28, z = -14 + r * 28, wheat = r === 0 && k === 1;
    slab(c, x, z, 26, 26, wheat ? 0xd6b85a : 0x8a6a42, 0.06);
    if (wheat) for (let i = 0; i < 12; i++) g.box(x, 0.1, z - 12 + i * 2.2, 24, 0.9, 1.4, 0xe0c060, 0xf0d070);
    else for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) g.blob(x - 11 + i * 2.8, 0.2, z - 10 + j * 4, 0.9, 0.6, 0.9, (i + j + r) % 3 ? 0x5c9a48 : 0x7ab84a, 5);
  }
  g.box(24, 0, 26, 5, 3, 4, 0x8a6a4a); g.gable(24, 3, 26, 5, 4, 1.2, 0x4a6a8a, 'x', 0x8a6a4a, 0.3);
  c.g.surfv = sv0_;
}
export function modelHeliport(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x7f8478);
  const g = c.g;
  g.cyl(0, 0.05, -2, 18, 0.3, 0x4a4e52, 24, 0x4a4e52); g.cyl(0, 0.35, -2, 16, 0.05, 0xf2c230, 24, 0x4a4e52, 15.4);
  g.box(-4, 0.4, -2, 1.6, 0.05, 12, 0xffffff); g.box(4, 0.4, -2, 1.6, 0.05, 12, 0xffffff); g.box(0, 0.4, -2, 8, 0.05, 1.6, 0xffffff);
  block(c, 18, 20, 18, 12, 2, 0xffffff, { label: 'ヘリ', glass: 0x6f8fa8, band: 0xc3312b });
  g.box(-16, 0, 20, 16, 8, 12, 0xd6d8da); g.box(-16, 8, 20, 16, 0.4, 12, 0x9aa0a6); // 格納庫
  g.cyl(24, 0, -22, 0.2, 6, 0xd0d0d0, 6); g.box(24, 5.2, -21.4, 0.4, 1, 1.4, 0xff7a2a); // 吹き流し
}
export function modelMulticultural(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb3b0a8);
  const g = c.g, wall = dull(c, 0xf4f1e8, 0xd6d1c6);
  block(c, 0, -2, 20, 14, 2, wall, { label: '多文化', glass: 0x9fc4dc, band: 0x2e7d5b });
  const flags = [0xc3312b, 0x1f5fb0, 0xf2c230, 0x2e7d32, 0xffffff];
  for (let i = 0; i < 5; i++) { g.box(-8 + i * 4, 0, 9, 0.2, 5, 0.2, 0xd0d0d0); g.box(-7.2 + i * 4, 4, 9, 1.6, 1, 0.08, flags[i]); }
  bush(c, 9, 10, 1); tree(c, -11, 10, 0.8);
}

// ---- v19：ビジョン専用の施設 ----
export function modelKodomoMirai(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xd9c79c);
  const g = c.g, wall = dull(c, 0xfff4dc, 0xe2d6bc);
  g.box(-8, 0, -10, 34, 8, 22, wall, 0x9fd0e8);
  for (let i = 0; i < 4; i++) g.gable(-21 + i * 8.6, 8, -10, 8.6, 22, 4, [0xf26a5a, 0xf2c230, 0x5ab0e0, 0x6cc070][i], 'x', wall, 0.2); // 色違いの屋根
  winRow(c, 0, -24, 8, 1, 1.05, 7, 3.2, 3.8, 0.8, 0xd7e6ea); sign(c, 'こども', 0, -8, 6.2, 1.07, 4);
  slab(c, 8, 16, 38, 22, 0x8fd06a, 0.07); // 芝生の遊び場
  g.cyl(-6, 0, 18, 4, 0.5, 0xf2c230, 16); g.box(14, 0, 14, 1.2, 4, 1.2, 0xe86a7a); zbar(c, 12, 4, 20, 0.5, 14, 0.4, 0.4, 0x5ab0e0); g.box(22, 0, 20, 5, 2, 3, 0x6cc070);
  for (let i = 0; i < 6; i++) g.box(-20 + i * 3, 0, 24, 1.2, 0.8 + (i % 3) * 0.4, 1.2, [0xf26a5a, 0xf2c230, 0x5ab0e0][i % 3]);
  fenceRect(c, 57.6, 57.6, 1.2, 0x8fbf8a, 5); tree(c, 26, -24, 1, 2); tree(c, -26, 24, 0.9);
}
export function modelEcoCenter(c: Ctx): void {
  pad(c, 88.4, 58.4, 0x6f9a52);
  const g = c.g;
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { const x = -38 + k * 6.4, z = -20 + r * 7; g.box(x, 0, z, 0.3, 1.2, 0.3, 0x8b9094); obox(c, x, 1.6, z, [1, 0, 0], [0, 0.6, 0.8], [0, -0.8, 0.6], 2.8, 0.08, 2.2, 0x1f3a5a); }
  block(c, 18, -8, 26, 14, 2, 0xf4f1e8, { label: 'エコ', glass: 0x7fbfa8, band: 0x2e7d5b, roof: 0x5c9a48 }); // 屋上緑化
  slab(c, 10, 16, 36, 16, 0x4a8fb0, 0.08); for (let i = 0; i < 8; i++) g.blob(-6 + i * 4.5, 0.2, 16 + (i % 2 ? 6 : -6), 1.4, 1.0, 1.4, 0x6a9a4a, 5); // ビオトープ
  g.box(34, 0, 18, 6, 2.6, 4, 0x2e7d5b); for (let i = 0; i < 3; i++) g.box(31 + i * 3, 2.6, 18, 2.4, 0.3, 3.6, 0x1f3a5a); // 蓄電池
  turbine(c, -36, 6, 22, 0, 0.2);
  for (let i = 0; i < 6; i++) tree(c, -20 + i * 7, 26, 0.9);
}
export function modelKankoDmo(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xc8c2b6);
  const g = c.g, wall = dull(c, 0x6b4a32, 0x5a4232);
  g.box(0, 0, -2, 18, 6, 12, wall); g.gable(0, 6, -2, 19, 13, 3.6, 0x3a3a3a, 'x', wall, 0.6); // 古民家風
  c.wa.box(0, 0.6, 4.05, 12, 3.4, 0.1, 0xffe0a0); g.box(0, 4.2, 4.3, 16, 0.3, 1.2, 0x3a2a1a);
  sign(c, '観光案内', 0, 0, 5.0, 4.6, 4.4);
  for (const x of [-7, 7]) { g.box(x, 0, 9, 0.2, 3, 0.2, 0x5a4232); g.box(x, 2.4, 9, 1.6, 0.6, 0.1, 0xc3312b); } // のぼり
  g.cyl(-10, 0, 9, 0.5, 1.5, 0xc3312b, 8); lantern(c, 10, 9, 0.9); bush(c, -11, -9, 1);
}
export function modelIncubator(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xa9a59c);
  const g = c.g;
  block(c, -10, -2, 30, 16, 4, 0xf4f4f2, { label: '起業支援', glass: 0x7fd0ff, band: 0x1f2f4a });
  g.box(18, 0, -2, 16, 7, 16, 0xd0d4d8, 0x6f767d); for (let i = 0; i < 3; i++) g.gable(12 + i * 6, 7, -2, 6, 16, 1.6, 0x5a6066, 'z', 0xd0d4d8, 0.1); // 試作工房
  g.box(18, 0, 6.1, 8, 5, 0.1, 0x3a3f44);
  for (let i = 0; i < 4; i++) car(c, -20 + i * 6, 10, false);
}
export function modelBosaiCenter(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x9a9890);
  const g = c.g;
  block(c, -8, -10, 30, 22, 5, 0xe6e6e0, { label: '防災', glass: 0x5a7a9a, band: 0xe06a1f });
  const h = 5 * 3.6 + 0.6; g.box(-8, h + 0.45, -10, 14, 0.3, 14, 0x4a4e52); g.box(-10, h + 0.8, -10, 1, 0.05, 6, 0xffffff); g.box(-6, h + 0.8, -10, 1, 0.05, 6, 0xffffff); g.box(-8, h + 0.8, -10, 4, 0.05, 1, 0xffffff); // 屋上ヘリポート
  for (let i = 0; i < 3; i++) { g.box(16 + (i % 2) * 8, 0, -16 + i * 9, 7, 5, 7, 0xd0d4d8, 0x8a8f96); } // 備蓄倉庫
  g.cyl(18, 0, 18, 4, 5, 0x9fb5c8, 12, 0x7f95a8); // 耐震性貯水槽
  for (let i = 0; i < 3; i++) g.box(-20 + i * 6, 0, 18, 2.8, 2.6, 6, [0xc3312b, 0xc3312b, 0xffffff][i]); // 消防車・救急車
  slab(c, -8, 18, 30, 14, 0x4c4f53, 0.08); g.box(26, 0, 26, 0.2, 9, 0.2, 0xd0d0d0); g.box(26.6, 8, 26, 1.2, 0.8, 0.1, 0xe06a1f);
}
export function modelDxCenter(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b5ac);
  const g = c.g;
  block(c, 0, -2, 20, 14, 3, 0x1f2f4a, { label: 'DX', glass: 0x7fd0ff, band: 0x7fd0ff, lit: 0.7 });
  g.box(8, 11.2, -6, 3, 2.4, 2, 0x8b9094); g.cyl(-6, 11.2, -6, 1.2, 0.3, 0xd0d0d0, 10); // 屋上の機器とアンテナ
  bush(c, -9, 10, 1); bush(c, 9, 10, 1);
}

// ---- v20：遊び・暮らし・仕事の施設 ----
export function modelWeddingHall(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xd8d2c4);
  const g = c.g, w = dull(c, 0xfbf8f2, 0xe6e1d6);
  g.box(-8, 0, -10, 22, 9, 16, w); g.gable(-8, 9, -10, 23, 17, 5, 0x6a7a8a, 'z', w, 0.4);
  g.box(-8, 9, -1, 3, 10, 3, w); g.pyramid(-8, 19, -1, 3.4, 3.4, 5, 0x6a7a8a); g.box(-8, 24, -1, 0.3, 2.4, 0.3, 0xe8c87a); g.box(-8, 25.2, -1, 1.4, 0.3, 0.3, 0xe8c87a); // チャペルの尖塔と十字
  c.wa.box(-8, 2, -1.9, 4, 5, 0.1, 0xffe8c0);
  block(c, 14, -12, 14, 12, 2, w, { label: 'ウェディング', glass: 0xbfd8e8, band: 0xe8c87a });
  slab(c, 2, 16, 40, 18, 0x86c060, 0.08); g.box(2, 0.1, 16, 2.4, 0.05, 16, 0xf4efe6); // 芝生の庭とバージンロード
  for (let i = 0; i < 6; i++) { g.box(-14 + i * 6, 0, 10, 0.3, 3.2, 0.3, 0xffffff); g.blob(-14 + i * 6, 3.4, 10, 0.9, 0.7, 0.9, i % 2 ? 0xf3c9d6 : 0xffffff, 5); }
  for (let i = 0; i < 4; i++) tree(c, -24 + i * 16, 26, 0.8, 1);
}
export function modelJidokan(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xd9c79c);
  const g = c.g, w = dull(c, 0xfff2d6, 0xe2d6bc);
  g.box(-2, 0, -4, 18, 6, 12, w); g.gable(-2, 6, -4, 18.6, 12.6, 2.6, 0x5ab0e0, 'x', w, 0.5);
  winRow(c, 0, -10, 6, 0.8, 2.05, 4, 3, 2.6, 0.9, 0xd7e6ea); sign(c, '児童館', 0, -2, 4.6, 2.08, 3.2);
  slab(c, 4, 9, 18, 8, 0xd9b98a, 0.07); g.box(-2, 0, 9, 1, 2.6, 1, 0xf26a5a); zbar(c, 0, 2.6, 4, 0.4, 9, 0.3, 0.3, 0xf2c230); g.box(8, 0, 10, 3, 1.2, 3, 0x6cc070);
  fenceRect(c, 27.6, 27.6, 1.2, 0x8fbf8a, 5);
}
export function modelKidsPark(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xb9b5ac);
  const g = c.g;
  g.box(-4, 0, -6, 34, 10, 26, 0xf4f1ea, 0xd0d0d0); g.cyl(-4, 10, -6, 12, 3, 0xf2c230, 16, 0xf26a5a, 9); // 丸い屋根
  for (let i = 0; i < 5; i++) g.box(-18 + i * 7, 2, 7.05, 5, 6, 0.1, [0xf26a5a, 0xf2c230, 0x5ab0e0, 0x6cc070, 0xc88ad0][i]);
  sign(c, 'キッズ', 0, -4, 8.4, 7.1, 4.4); parking(c, 10, 20, 34, 12, 8);
}
export function modelAmusementPark(c: Ctx): void {
  pad(c, 118.4, 118.4, 0xc8c2b6);
  const g = c.g;
  // ジェットコースター：上下する高架のレールを輪にする
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2, b = ((k + 1) / 64) * Math.PI * 2, r = 42, h = 8 + 14 * Math.max(0, Math.sin(a * 2)), h2 = 8 + 14 * Math.max(0, Math.sin(b * 2));
    const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r * 0.75, x1 = Math.cos(b) * r, z1 = Math.sin(b) * r * 0.75;
    zbarXZ(c, x0, h, z0, x1, h2, z1, 1.6, 0xc3312b);
    if (k % 4 === 0) g.box(x0, 0, z0, 0.6, h, 0.6, 0xf4f4f2);
  }
  // メリーゴーラウンド・コーヒーカップ・フリーフォール
  g.cyl(-12, 0, 0, 7, 1, 0xf2c230, 16); g.cyl(-12, 1, 0, 0.5, 6, 0xffffff, 8); g.cyl(-12, 7, 0, 7.5, 2, 0xf26a5a, 16, 0xf2c230, 0.5);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.cyl(10 + Math.cos(a) * 4, 0.3, 4 + Math.sin(a) * 4, 1.4, 1.2, [0x5ab0e0, 0xf26a5a, 0x6cc070][i % 3], 10); }
  g.box(18, 0, -18, 3, 40, 3, 0xd0d4d8); g.box(18, 18, -18, 5, 2.4, 5, 0x5a2a8a);
  for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2, b = (k + 1) / 20 * Math.PI * 2; zbar(c, -30 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, -30 + Math.cos(b) * 12, 16 + Math.sin(b) * 12, -24, 0.5, 0.6, 0xe9e9e4); } g.box(-30, 0, -24, 1, 16, 1, 0xd0d4d8); // 小さな観覧車
  block(c, 0, 50, 26, 8, 1, 0xf4f1ea, { label: '遊園地', glass: 0xbfd8e8, band: 0xc3312b, fh: 5 });
  for (let i = 0; i < 10; i++) tree(c, -52 + i * 11, 54, 0.9);
}
export function modelMegaPark(c: Ctx): void {
  pad(c, 178.4, 178.4, 0xd8d2c4);
  const g = c.g;
  // 中央のお城（白い壁に青い尖塔）
  const W = dull(c, 0xf6f2fa, 0xe0dce6), B = 0x3f6fd0;
  g.box(0, 0, -20, 34, 18, 22, W); for (const [x, z, h] of [[-16, -30, 30], [16, -30, 30], [-16, -10, 26], [16, -10, 26], [0, -20, 44], [-6, -16, 34], [6, -16, 34]] as const) { g.cyl(x, 0, z, 3.2, h, W, 12); g.pyramid(x, h, z, 7, 7, 12, B); g.box(x, h + 12, z, 0.3, 3, 0.3, 0xe8c87a); }
  c.wa.box(0, 4, -8.9, 8, 9, 0.1, 0xffe8c0);
  // 大通り（パレードの道）と、まわりのエリア・ホテル
  slab(c, 0, 40, 14, 80, 0xe6dccb, 0.08); for (let i = 0; i < 8; i++) { g.box(-10, 0, 10 + i * 10, 6, 7 + (i % 3), 6, [0xf26a5a, 0xf2c230, 0x6cc070, 0x5ab0e0][i % 4]); g.box(10, 0, 10 + i * 10, 6, 7 + ((i + 1) % 3), 6, [0x5ab0e0, 0xf26a5a, 0xf2c230, 0x6cc070][i % 4]); }
  for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2, r = 70; zbarXZ(c, Math.cos(a) * r, 10 + 10 * Math.max(0, Math.sin(a * 3)), Math.sin(a) * r, Math.cos(a + 0.131) * r, 10 + 10 * Math.max(0, Math.sin((a + 0.131) * 3)), Math.sin(a + 0.131) * r, 1.6, 0x5a2a8a); }
  g.cyl(-50, 0, 30, 14, 0.4, 0x4a8fb0, 20); g.blob(-50, 0, 30, 5, 9, 5, 0x8a7a6a, 6); // 湖と岩山
  block(c, 56, 60, 28, 18, 12, 0xf4f1ea, { label: 'ホテル', glass: 0x7fbfd8, band: B });
  for (let i = 0; i < 18; i++) tree(c, -84 + i * 10, -84, 1.1);
}
export function modelPool(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xd8d2c4);
  const g = c.g;
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; g.box(Math.cos(a) * 14 - 6, 0.05, Math.sin(a) * 10 + 4, 4.4, 0.3, 4.4, 0x5ac0e8); } // 流れるプール（輪）
  slab(c, -6, 4, 18, 12, 0x86c060, 0.08);
  slab(c, 16, -10, 16, 10, 0x5ac0e8, 0.2); for (let i = 0; i < 5; i++) g.box(16, 0.22, -14 + i * 2, 16, 0.04, 0.12, 0xffffff);
  g.box(18, 0, 14, 3, 12, 3, 0xf26a5a); for (let k = 0; k < 10; k++) g.box(18 - k * 1.6, 12 - k * 1.2, 14 + Math.sin(k * 0.8) * 3, 1.8, 0.5, 1.8, 0xf2c230); // スライダー
  block(c, -16, -18, 18, 10, 1, 0xf4f1ea, { label: 'プール', glass: 0xbfd8e8, band: 0x5ab0e0, fh: 5 });
  for (let i = 0; i < 6; i++) g.cyl(-24 + i * 4, 0, 24, 0.1, 2.4, 0xd0d0d0, 4), g.cyl(-24 + i * 4, 2.4, 24, 1.4, 0.2, [0xf26a5a, 0xf2c230][i % 2], 8); // パラソル
}
export function modelAthletics(c: Ctx): void {
  pad(c, 118.4, 88.4, 0xb9b5ac);
  const g = c.g;
  for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, b = (k + 1) / 48 * Math.PI * 2; zbarXZ(c, Math.cos(a) * 44, 0.06, Math.sin(a) * 26, Math.cos(b) * 44, 0.06, Math.sin(b) * 26, 6.4, 0xb8483a); } // 赤いトラック
  slab(c, 0, 0, 72, 40, 0x5aa04a, 0.07); g.box(0, 0.11, 0, 0.4, 0.04, 40, 0xffffff);
  g.box(0, 0, -38, 70, 6, 8, 0xc8c4bc); for (let r = 0; r < 4; r++) g.box(0, 6 + r * 1.4, -38 + r * 1.6 - 2, 70, 1.4, 1.6, 0xd8d4cc); g.box(0, 12, -40, 70, 0.5, 9, 0xe9e9e4);
  for (const x of [-52, 52]) g.box(x, 0, -30, 1, 22, 1, 0xd0d4d8), g.box(x, 22, -30, 4, 2, 1, 0xf4f4f0);
}
export function modelRugby(c: Ctx): void {
  pad(c, 118.4, 88.4, 0xb9b5ac);
  const g = c.g;
  slab(c, 0, 4, 80, 50, 0x4a9a3c, 0.07); for (let i = -4; i <= 4; i++) g.box(i * 9, 0.11, 4, 0.3, 0.04, 50, 0xffffff);
  for (const x of [-40, 40]) { g.box(x, 0, -2, 0.4, 12, 0.4, 0xffffff); g.box(x, 0, 10, 0.4, 12, 0.4, 0xffffff); g.box(x, 3, 4, 0.3, 0.3, 12, 0xffffff); } // H のゴール
  for (const z of [-34, 40]) { g.box(0, 0, z, 84, 7, 8, 0xc8c4bc); g.box(0, 7, z, 84, 0.5, 9, z < 0 ? 0xc3312b : 0x1f4fa8); }
}
export function modelPachinko(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x4c4f53);
  const g = c.g;
  g.box(0, 0, -12, 40, 9, 22, 0xf4f4f0, 0x9aa0a6); g.box(0, 9, -1.4, 40, 3, 0.6, 0xc3312b);
  c.wa.box(0, 9.3, -1, 36, 2.4, 0.1, 0xffe14a); // 光る帯
  sign(c, 'パチンコ', 0, 0, 9.6, -0.9, 8);
  g.box(18, 0, -1.2, 1.2, 18, 1.2, 0xd0d0d0); g.box(18, 14, -0.4, 6, 4, 0.4, 0xc3312b); // 塔の看板
  parkingLines(c, -18, 18, 14, 9, 10); for (let i = 0; i < 9; i++) car(c, -16 + i * 4, 14, false);
}
export function modelBoatRace(c: Ctx): void {
  pad(c, 148.4, 88.4, 0xb9b5ac);
  const g = c.g;
  slab(c, 0, 12, 130, 50, 0x3f7fa6, 0.15); // 競走水面
  for (const x of [-44, 44]) g.cyl(x, 0.15, 12, 1.4, 2.4, 0xff7a2a, 8); // ターンマーク
  for (let i = 0; i < 6; i++) g.box(-30 + i * 9, 0.2, 4 + (i % 2) * 6, 2.4, 0.6, 5, [0xffffff, 0x1a1a1a, 0xc3312b, 0x2b5ea8, 0xf2c230, 0x2e7d32][i]); // 6 艇
  g.box(0, 0, -30, 110, 14, 18, 0xe6e6e0, 0x9aa0a6); for (let f = 0; f < 3; f++) c.wa.box(0, 3 + f * 4, -20.9, 104, 2.2, 0.1, 0xbfd8e8);
  sign(c, 'ボート', 0, 0, 11, -20.8, 8);
}
export function modelKeirin(c: Ctx): void {
  pad(c, 118.4, 118.4, 0xb9b5ac);
  const g = c.g;
  for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, b = (k + 1) / 48 * Math.PI * 2; for (let r = 0; r < 3; r++) zbarXZ(c, Math.cos(a) * (34 + r * 2.4), 0.3 + r * 1.2, Math.sin(a) * (22 + r * 2.4), Math.cos(b) * (34 + r * 2.4), 0.3 + r * 1.2, Math.sin(b) * (22 + r * 2.4), 2.6, r === 2 ? 0x7f7b75 : 0x9a9690); } // すりばちのバンク（外ほど高い）
  slab(c, 0, 0, 52, 30, 0x5aa04a, 0.07);
  g.box(0, 0, -46, 80, 12, 14, 0xe6e6e0, 0x9aa0a6); c.wa.box(0, 4, -38.9, 74, 5, 0.1, 0xbfd8e8); sign(c, '競輪', 0, 0, 10, -38.8, 5);
  for (let i = 0; i < 9; i++) g.box(-20 + i * 5, 0.3, 24, 0.6, 1.4, 1.6, [0xffffff, 0x1a1a1a, 0xc3312b, 0x2b5ea8, 0xf2c230, 0x2e7d32, 0xff7a2a, 0xe86a9a, 0x8a4ac0][i]);
}
export function modelJapaneseGarden(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x6f9a52);
  const g = c.g;
  g.cyl(-6, 0.05, 4, 20, 0.3, 0x4a8fb0, 24); g.blob(-2, 0.1, 6, 5, 2.4, 4, 0x6a8a4a, 6); // 池と中島
  zbarXZ(c, -14, 1.6, 12, -4, 2.4, 6, 2, 0xc3312b); // 赤い太鼓橋
  slab(c, 26, -24, 24, 22, 0xe6e0d4, 0.08); for (let i = 0; i < 8; i++) g.box(26, 0.1, -32 + i * 2.6, 22, 0.04, 0.3, 0xcfc8b8); for (const [x, z] of [[22, -26], [30, -20], [28, -30]]) g.blob(x, 0, z, 1.6, 1.2, 1.4, 0x7a7a74, 5); // 枯山水
  g.box(24, 0, 20, 12, 3.6, 9, 0xd8cdb4); g.gable(24, 3.6, 20, 13, 10, 2.4, 0x5a5a4a, 'x', 0xd8cdb4, 0.6); // 茶室
  lantern(c, 4, 24, 1.2); lantern(c, -24, -16, 1.2);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; tree(c, Math.cos(a) * 38, Math.sin(a) * 38, 1, i % 3 === 0 ? 2 : 1); }
  sign(c, '庭園', 0, -38, 1.4, 43, 3);
}
export function modelGiantRobot(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xc8c2b6);
  const g = c.g, W = 0xf4f4f2, B = 0x2b4ca8, R = 0xc3312b, Y = 0xf2c230;
  // 足・胴・腕・頭（高さ約 18m）
  for (const x of [-2.6, 2.6]) { g.box(x, 0, 0, 3.2, 1.6, 5, B); g.box(x, 1.6, 0, 2.6, 6, 2.8, W); g.box(x, 4, 0.2, 2.8, 1.6, 3, B); }
  g.box(0, 7.6, 0, 7.4, 2.4, 3.6, R); g.box(0, 10, 0, 8, 4.4, 4.4, B); g.box(0, 10.6, 2.25, 4, 2, 0.2, Y);
  for (const x of [-5.4, 5.4]) { g.box(x, 13, 0, 3, 2.4, 3.4, W); g.box(x, 8, 0, 2, 5, 2, W); g.box(x, 7, 0, 2.2, 1.4, 2.2, R); }
  g.box(0, 14.4, 0, 2.6, 2.6, 2.6, W); g.box(0, 17, 0.2, 0.3, 1.6, 0.3, Y); g.box(-0.8, 16.8, 0.2, 1.6, 0.3, 0.3, Y); g.box(0.8, 16.8, 0.2, 1.6, 0.3, 0.3, Y);
  c.wa.box(0, 15.4, 1.32, 1.8, 0.4, 0.05, 0x7fffd0); // 光る目
  slab(c, 0, 16, 40, 16, 0xd8d2c4, 0.08); standSign(c, 'ロボット', 14, 20, 1, 3, true);
}
export function modelRobotFactory(c: Ctx): void {
  pad(c, 118.4, 88.4, 0xa4a29a);
  const g = c.g, w = dull(c, 0xeef0f2, 0xcfd2d6);
  g.box(-10, 0, -8, 80, 12, 50, w, 0x9aa0a6); for (let i = 0; i < 10; i++) g.gable(-46 + i * 8, 12, -8, 8, 50, 2.6, 0x6f7a86, 'z', w, 0.1);
  block(c, 42, 20, 26, 16, 4, 0xffffff, { label: 'ロボット', glass: 0x7fd0ff, band: 0x1f2f4a });
  for (let i = 0; i < 4; i++) { const x = -36 + i * 9; g.box(x, 0, 26, 2, 1, 2, 0xf2c230); g.box(x, 1, 26, 0.8, 3, 0.8, 0xf2c230); g.box(x + 1, 4, 26, 2.4, 0.8, 0.8, 0xf2c230); } // 外に並ぶロボットアーム
  parking(c, 40, -28, 34, 14, 8);
}
export function modelCasino(c: Ctx): void {
  pad(c, 148.4, 118.4, 0x9a968e);
  const g = c.g;
  block(c, -30, -20, 40, 30, 22, 0x1f2f4a, { label: 'ホテル', glass: 0xe8c87a, band: 0xe8c87a, lit: 0.8 }); // ホテル棟
  block(c, 22, -24, 36, 24, 26, 0x2a2a3a, { glass: 0x9fd0ff, band: 0xe8c87a, lit: 0.8 });
  g.box(0, 0, 18, 100, 12, 34, 0x14141a, 0x2a2a3a); c.wa.box(0, 3, 35.1, 80, 6, 0.1, 0xffd060); // カジノと会議場の低層部
  g.cyl(0, 12, 18, 14, 4, 0xe8c87a, 24, 0xffe8a0, 10); // 金色のドーム
  sign(c, 'カジノ', 0, 0, 9, 35.2, 10);
  for (let i = 0; i < 8; i++) g.box(-56 + i * 16, 0, 46, 0.4, 8, 0.4, 0xe8c87a), c.wa.box(-56 + i * 16, 8, 46, 2, 2, 2, 0xffe8a0);
}
export function modelOutletMall(c: Ctx): void {
  pad(c, 118.4, 88.4, 0x4c4f53);
  const g = c.g;
  for (let i = 0; i < 6; i++) { const x = -42 + i * 17; g.box(x, 0, -24, 14, 7, 16, [0xf4f1ea, 0xe8dcc8, 0xd8e4ea][i % 3]); g.gable(x, 7, -24, 15, 17, 2.4, 0x8a5a3a, 'x', 0xf4f1ea, 0.5); c.wa.box(x, 0.6, -15.9, 11, 4, 0.1, 0xfff1d0); }
  slab(c, 0, -6, 104, 8, 0xd8d2c4, 0.08); for (let i = 0; i < 9; i++) tree(c, -48 + i * 12, -6, 0.7);
  sign(c, 'アウトレット', 0, -42, 6, -15.8, 6);
  parkingLines(c, -54, 54, 22, 18, 22); for (let i = 0; i < 20; i++) car(c, -52 + i * 5.4, 22, false);
}
export function modelSkiResort(c: Ctx): void {
  pad(c, 88.4, 88.4, 0xdfe6ea);
  const g = c.g;
  for (let r = 0; r < 6; r++) slab(c, 0, -30 + r * 10, 60 - r * 4, 10, 0xf4f8fa, 0.08 + r * 0.02); // ゲレンデ
  for (let i = 0; i < 8; i++) { g.box(-30 + i * 2, i * 0.2, -36 + i * 9, 0.3, 8, 0.3, 0x6a6f76); } // リフトの支柱
  g.box(22, 0, 30, 18, 6, 10, 0x6b4a32); g.gable(22, 6, 30, 19, 11, 3, 0x3a3a3a, 'x', 0x6b4a32, 0.5); sign(c, 'スキー', 0, 22, 4, 35.1, 4); // ロッジ
  for (let i = 0; i < 10; i++) tree(c, 36 + (i % 2) * 4, -36 + i * 7, 1, 1);
}
export function modelEsportsArena(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x4c4f53);
  const g = c.g;
  g.box(0, 0, -6, 44, 14, 32, 0x14141a, 0x2a2a3a);
  c.wa.box(0, 3, 10.1, 30, 9, 0.1, 0x7f5aff); g.box(0, 14, 10.4, 44, 0.8, 0.6, 0x00e0ff); // 大画面と光る帯
  sign(c, 'eスポーツ', 0, 0, 12.2, 10.2, 7);
  slab(c, 0, 20, 50, 10, 0xd8d2c4, 0.08);
}
export function modelSkyscraper(c: Ctx): void {
  pad(c, 88.4, 88.4, 0xc8c2b6);
  const g = c.g, glass = 0x5f86a8;
  // 段々に細くなる 62 階の塔と、てっぺんの展望台・アンテナ
  const h1 = block(c, 0, -2, 40, 40, 12, 0xd8dee4, { label: 'タワー', glass, lit: 0.6, band: 0x2f3a44 });
  g.box(0, h1, -2, 32, 3.6 * 26, 32, 0x7a98b4, 0x2f3a44); for (let f = 0; f < 26; f += 1) { c.wa.box(0, h1 + f * 3.6 + 1, 14.05, 28, 1.6, 0.1, f % 3 ? 0xd8ecff : 0xffe8b0); c.wb.box(16.05, h1 + f * 3.6 + 1, -2, 0.1, 1.6, 28, 0x405a74); }
  const h2 = h1 + 3.6 * 26;
  g.box(0, h2, -2, 24, 3.6 * 22, 24, 0x6f8fac, 0x2f3a44); for (let f = 0; f < 22; f++) c.wa.box(0, h2 + f * 3.6 + 1, 10.05, 20, 1.6, 0.1, f % 4 ? 0xd8ecff : 0xffe8b0);
  const h3 = h2 + 3.6 * 22;
  g.box(0, h3, -2, 18, 10, 18, 0x2f3a44); c.wa.box(0, h3 + 2, 7.05, 16, 5, 0.1, 0xffe8b0); // 展望台
  g.box(0, h3 + 10, -2, 0.8, 30, 0.8, 0xd0d4d8); c.wa.box(0, h3 + 40, -2, 1.2, 1.2, 1.2, 0xff3a3a); // アンテナと航空障害灯
  slab(c, 0, 32, 70, 18, 0xe6e0d4, 0.08); for (let i = 0; i < 8; i++) tree(c, -34 + i * 10, 36, 0.9);
}
/** 斜めのはり（2 点を結ぶ細い箱）。ジェットコースターや橋など。置き場所の変換（g.at）を崩さないよう、向きつきの箱で描く */
function zbarXZ(c: Ctx, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, col: number): void {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz) || 0.01, u: V = [dx / L, dy / L, dz / L];
  const hz = Math.hypot(dx, dz) || 1, wv: V = [-dz / hz, 0, dx / hz], vv: V = [u[1] * wv[2] - u[2] * wv[1], u[2] * wv[0] - u[0] * wv[2], u[0] * wv[1] - u[1] * wv[0]];
  obox(c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, u, vv, wv, L / 2 + 0.15, 0.3, w / 2, col);
}

// ---- v21 ----
export function modelTowerMansion(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xbab6ae);
  const g = c.g, floors = 38 + Math.floor(c.rnd() * 8), fh = 3.1, H = floors * fh;
  const wall = pick(c, [0xe4e2dc, 0xcfd3d6, 0xb9b2a8, 0x8e949a]), glass = pick(c, [0x6f8fa8, 0x587890, 0x7d98aa]);
  const w = 21, d = 21, z0 = -1;
  g.box(0, 0, z0, w, 6, d, 0x4f4a45, 0x6a665f); win(c, 0, 0, 0.3, z0 + d / 2 + 0.05, 12, 4.6, 1, 0xd9e6ea); // 2 層吹き抜けのエントランス
  g.box(0, 6, z0, w - 1, H - 6, d - 1, wall, 0x8e9092);
  for (let f = 2; f < floors; f++) {
    const y = f * fh;
    g.box(0, y - 0.15, z0, w + 1.4, 0.18, d + 1.4, 0xf0eee8);          // 四方を回るバルコニー
    if (f % 2 === 0) { c.wa.box(0, y + 0.6, z0 + d / 2 + 0.05, w - 3, 1.7, 0.1, f % 6 ? 0xffe8b0 : 0xd8ecff); c.wb.box(w / 2 + 0.05, y + 0.6, z0, 0.1, 1.7, d - 3, glass); }
    else { c.wb.box(0, y + 0.6, z0 + d / 2 + 0.05, w - 3, 1.7, 0.1, glass); c.wa.box(-w / 2 - 0.05, y + 0.6, z0, 0.1, 1.7, d - 3, f % 5 ? 0xffe8b0 : 0xd8ecff); }
  }
  for (const [x, z] of [[-w / 2, z0 - d / 2], [w / 2, z0 - d / 2], [-w / 2, z0 + d / 2], [w / 2, z0 + d / 2]] as [number, number][]) g.box(x, 6, z, 1.6, H - 6 + 1.2, 1.6, 0x6b6e72); // 角の柱
  g.box(0, H, z0, w + 1.6, 1.4, d + 1.6, 0x4a4d52); g.box(0, H + 1.4, z0, 8, 3, 8, 0xcfcdc7); g.box(0, H + 4.4, z0, 12, 0.3, 12, 0xe8b830); // 屋上のヘリのホバリングスペース
  c.wa.box(-w / 2, H + 1.6, z0 - d / 2, 0.6, 0.6, 0.6, 0xff3a3a); c.wa.box(w / 2, H + 1.6, z0 + d / 2, 0.6, 0.6, 0.6, 0xff3a3a);
  tree(c, -12, 12, 0.9); tree(c, 12, 12, 0.9); bush(c, -6, 12.6, 1); bush(c, 6, 12.6, 1);
}
export function modelUsBase(c: Ctx): void {
  pad(c, 178.4, 148.4, 0x9aa18a);
  const g = c.g;
  fenceRect(c, 176, 146, 3.2, 0x8a8f94, 14);
  slab(c, 0, -40, 168, 22, 0x5a5d61, 0.12);                        // 滑走路
  for (let k = -7; k <= 7; k++) slab(c, k * 11, -40, 5, 0.9, 0xf4f4f0, 0.14);
  slab(c, 0, -22, 120, 10, 0x6a6d70, 0.12);                        // 誘導路・駐機場
  for (let k = 0; k < 3; k++) { const x = -54 + k * 30; g.box(x, 0, 4, 24, 12, 22, 0x7e8a6c, 0x6b7560); g.cyl(x, 12, 4, 11, 0.01, 0x6b7560, 10); } // かまぼこ形の格納庫
  for (let k = 0; k < 3; k++) { const x = -54 + k * 30; airplaneS(c, x, -22); }
  g.box(48, 0, 6, 10, 22, 10, 0xd8d4c8, 0x9b9d9e); g.box(48, 22, 6, 13, 4, 13, 0x3a4a5a); c.wa.box(48, 23, 12.6, 12, 2.4, 0.1, 0xd8ecff); // 管制塔
  for (let k = 0; k < 4; k++) block(c, -60 + k * 26, 50, 20, 14, 3, 0xe9e6df, { lit: 0.5 });   // 兵舎・住宅
  block(c, 50, 46, 34, 18, 2, 0xd8d4c8, { label: '米軍', lit: 0.5 });
  slab(c, 60, 24, 30, 18, 0x6f9a5a, 0.08);                         // 野球場
  g.cyl(-80, 0, 30, 0.12, 14, 0xd0d4d8, 4); g.box(-79.1, 11, 30, 2.2, 1.3, 0.05, 0xc3312b); g.box(-80.3, 11.8, 30.03, 0.9, 0.5, 0.05, 0x1d3557); // 旗
  for (let i = 0; i < 6; i++) car(c, 10 + i * 6, 64, true);
}
function airplaneS(c: Ctx, x: number, z: number): void {
  const g = c.g, col = 0x8a9096;
  g.box(x, 1.2, z, 2.6, 2.2, 16, col); g.box(x, 2.0, z + 1, 18, 0.35, 4.2, col); g.box(x, 2.4, z - 7, 7, 0.3, 2.2, col); g.box(x, 2.4, z - 7.4, 0.3, 3.6, 2, col);
}
export function modelOilField(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xb8ad94);
  const g = c.g;
  fenceRect(c, 56, 56, 2.0, 0x8a8f94, 8);
  // 掘削やぐら
  const tx = -12, tz = -10, H = 32;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) zbarXZ(c, tx + sx * 5, 0, tz + sz * 5, tx + sx * 0.8, H, tz + sz * 0.8, 0.5, 0xd9622b);
  for (let k = 1; k < 6; k++) { const y = (H * k) / 6, r = 5 - 4.2 * (k / 6); g.box(tx, y, tz - r, r * 2, 0.35, 0.35, 0xd9622b); g.box(tx, y, tz + r, r * 2, 0.35, 0.35, 0xd9622b); g.box(tx - r, y, tz, 0.35, 0.35, r * 2, 0xd9622b); g.box(tx + r, y, tz, 0.35, 0.35, r * 2, 0xd9622b); }
  g.box(tx, 0, tz, 12, 2, 12, 0x5a5d61); g.box(tx, H, tz, 2.4, 1.2, 2.4, 0xd9622b);
  // ポンプ（うなずき型）
  for (const [px, pz] of [[12, -14], [14, 8], [-6, 16]] as [number, number][]) {
    g.box(px, 0, pz, 3, 0.6, 8, 0x5a5d61); g.box(px, 0.6, pz - 1, 1.2, 4.2, 1.2, 0x2b2b2b);
    zbarXZ(c, px, 4.9, pz - 4.5, px, 5.6, pz + 3.5, 0.9, 0x2b2b2b); g.box(px, 3.6, pz - 4.8, 1.6, 2.6, 1.2, 0xf2c230);
  }
  g.cyl(16, 0, -2, 3.2, 6, 0xd8d4c8, 12); g.cyl(16, 0, -2 + 7, 3.2, 6, 0xd8d4c8, 12);
  standSign(c, '石油', 20, 26, 2.2, 3, true);
}
export function modelOilRefinery(c: Ctx): void {
  pad(c, 148.4, 118.4, 0xaaa69c);
  const g = c.g;
  fenceRect(c, 146, 116, 2.4, 0x8a8f94, 12);
  // 丸いタンク群
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const x = -54 + i * 20, z = -36 + j * 22; g.cyl(x, 0, z, 8.5, 12, 0xf0eee8, 18, 0xdad7cf); g.box(x, 12, z, 1, 0.6, 17, 0x9aa0a6); }
  // 精製装置（塔とパイプ）
  for (let k = 0; k < 4; k++) { const x = 20 + k * 12; g.cyl(x, 0, -24, 2.4 - k * 0.3, 26 + k * 6, 0xc9ccd0, 10, 0x9aa0a6); for (let y = 6; y < 26 + k * 6; y += 6) g.cyl(x, y, -24, 3.0 - k * 0.3, 0.5, 0x8a8f94, 10); }
  g.box(36, 0, -8, 46, 6, 10, 0x8a9096); for (let k = 0; k < 6; k++) g.box(16 + k * 8, 6, -8, 0.6, 8, 0.6, 0x5a5d61);
  for (let y = 3; y < 10; y += 2) g.box(36, y, 2, 52, 0.5, 0.5, 0x9aa0a6);
  g.cyl(60, 0, 20, 1.2, 46, 0xc3312b, 8); g.cyl(60, 40, 20, 1.25, 3, 0xf4f4f0, 8); c.wa.box(60, 46.4, 20, 1.4, 1.2, 1.4, 0xff9a3a); // フレアスタック
  g.cyl(30, 0, 30, 9, 10, 0xe8e4da, 16, 0xd0ccc2); g.cyl(10, 0, 32, 5, 8, 0xe8e4da, 14);
  block(c, -40, 44, 30, 14, 3, 0xe9e6df, { label: '製油所', lit: 0.5 });
  slab(c, 0, 56, 140, 6, 0x5a5d61, 0.1);
}
export function modelGasStation(c: Ctx): void {
  pad(c, 28.4, 28.4, 0x5a5d61);
  const g = c.g;
  for (const [x, z] of [[-6, 2], [6, 2], [-6, 10], [6, 10]] as [number, number][]) g.box(x, 0, z, 0.6, 5.6, 0.6, 0xf0eee8);
  g.box(0, 5.6, 6, 22, 1.2, 14, 0xc3312b, 0xf0eee8); c.wa.box(0, 5.4, 6, 20, 0.1, 12, 0xffffff);
  for (const z of [2, 10]) { g.box(0, 0, z, 6, 0.3, 1.6, 0xb9b6ae); g.box(-1.4, 0.3, z, 1, 1.8, 0.8, 0xf0eee8); g.box(1.4, 0.3, z, 1, 1.8, 0.8, 0xf0eee8); }
  g.box(0, 0, -9, 16, 4, 8, 0xf0eee8, 0x9b9d9e); win(c, 0, 0, 0.4, -4.95, 9, 2.6, 1, 0xd9e6ea);
  g.box(-10, 0, -9, 5, 3.6, 7, 0x8a8f94); // 洗車機
  g.box(12, 0, 12, 0.5, 8, 0.5, 0x8a8f94); sign(c, 'ガソリン', 0, 12, 8, 12.3, 4, 1.8);
  if (c.rnd() < 0.7) car(c, -3.5, 2, false); if (c.rnd() < 0.5) car(c, 3.5, 10, false);
}
export function modelParkingTower(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x6a6d70);
  const g = c.g, W2 = 48, D2 = 40, z0 = -4, fh = 3.0, F = 6;
  for (let f = 0; f <= F; f++) {
    const y = f * fh;
    g.box(0, y, z0, W2, 0.5, D2, 0xb9b6ae, 0x8f8c86);
    if (f > 0) { g.box(0, y + 0.5, z0 + D2 / 2, W2, 1.1, 0.25, 0xe6e3dc); g.box(0, y + 0.5, z0 - D2 / 2, W2, 1.1, 0.25, 0xe6e3dc); g.box(W2 / 2, y + 0.5, z0, 0.25, 1.1, D2, 0xe6e3dc); g.box(-W2 / 2, y + 0.5, z0, 0.25, 1.1, D2, 0xe6e3dc); }
    if (f < F) { c.wa.box(0, y + 2.6, z0, W2 - 2, 0.1, D2 - 2, 0xfff2d0); for (let k = 0; k < 6; k++) if (c.rnd() < 0.55) car(c, -20 + k * 8, z0 + (k % 2 ? 12 : -12), false); }
  }
  for (const x of [-W2 / 2 + 1, -8, 8, W2 / 2 - 1]) for (const z of [z0 - D2 / 2 + 1, z0 + D2 / 2 - 1]) g.box(x, 0, z, 1, F * fh + 0.5, 1, 0x8f8c86);
  zbarXZ(c, -W2 / 2 - 3, 0, z0 + 10, -W2 / 2 - 3, fh, z0 - 10, 5, 0x8f8c86); // スロープ
  g.box(W2 / 2 - 4, 0, z0 - 4, 6, F * fh + 4, 6, 0xd8d4c8, 0x9b9d9e);        // 階段・エレベーター
  sign(c, 'P', 0, W2 / 2 - 4, F * fh + 0.4, z0 - 4 + 3.05, 3, 3);
  standSign(c, 'P', 22, 25, 2.2, 1.6, true);
}
export function modelAncientRuins(c: Ctx): void {
  pad(c, 118.4, 88.4, 0x8fb06a);
  const g = c.g;
  // 前方後円墳（鍵穴形の丘と周りの堀）
  const kx = -22, kz = -8;
  g.cyl(kx - 10, 0, kz, 26, 0.3, 0x4f86a6, 20); g.box(kx + 16, 0, kz, 30, 0.3, 30, 0x4f86a6);
  g.cyl(kx - 10, 0.3, kz, 20, 5, 0x6f9a4a, 18, 0x7aa64f, 13); g.cyl(kx - 10, 5.3, kz, 13, 4, 0x77a352, 16, 0x86b05a, 7);
  g.box(kx + 14, 0.3, kz, 22, 5.5, 18, 0x6f9a4a, 0x7aa64f);
  for (let i = 0; i < 6; i++) tree(c, kx - 18 + i * 6, kz + (i % 2 ? 4 : -4), 0.8);
  // 復元した竪穴住居と物見やぐら
  for (let i = 0; i < 5; i++) { const x = 18 + (i % 3) * 12, z = 4 + Math.floor(i / 3) * 14; g.cyl(x, 0, z, 4.2, 1.0, 0x8a6a42, 10); g.cyl(x, 1.0, z, 4.4, 4.2, 0xb08a52, 10, undefined, 0.3); }
  const wx = 48, wz = -20;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) g.box(wx + sx * 2.4, 0, wz + sz * 2.4, 0.6, 10, 0.6, 0x7a5a3a);
  g.box(wx, 10, wz, 7, 0.5, 7, 0x8a6a42); g.gable(wx, 12.4, wz, 7.6, 7.6, 2.4, 0xb08a52, 'x', 0x8a6a42, 0.4);
  for (let x = 6; x < 58; x += 2.2) g.box(x, 0, 36, 0.4, 2.6, 0.4, 0x7a5a3a); // 柵（環濠集落の柵）
  block(c, -30, 32, 30, 14, 2, 0xd8cbb2, { label: '史跡', lit: 0.4, roof: 0x5a4a3a });
  slab(c, 0, 26, 110, 4, 0xd8c8a4, 0.08);
}
/** 津波避難タワー：鉄骨の 4 本脚、15m の避難デッキと手すり、外階段、「津波避難場所」の看板 */
export function modelTsunamiTower(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b6ae);
  const g = c.g, H = 15, s = 6.5, col = 0xd8dade;
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]] as [number, number][]) g.box(x, 0, z, 0.9, H, 0.9, col);
  for (const y of [5, 10]) { g.box(0, y, -s, 2 * s, 0.4, 0.4, col); g.box(0, y, s, 2 * s, 0.4, 0.4, col); g.box(-s, y, 0, 0.4, 0.4, 2 * s, col); g.box(s, y, 0, 0.4, 0.4, 2 * s, col); }
  for (const [x0, z0, x1, z1] of [[-s, -s, s, s], [s, -s, -s, s]] as [number, number, number, number][]) zbarXZ(c, x0, 0.5, z0, x1, H - 0.5, z1, 0.3, 0x9aa0a6);
  g.box(0, H, 0, 2 * s + 2, 0.6, 2 * s + 2, 0x8f9499, 0xc9ccd0);
  for (const [x, z, w, d] of [[0, -s - 1, 2 * s + 2, 0.15], [0, s + 1, 2 * s + 2, 0.15], [-s - 1, 0, 0.15, 2 * s + 2], [s + 1, 0, 0.15, 2 * s + 2]] as [number, number, number, number][]) g.box(x, H + 0.6, z, w, 1.2, d, 0xf2c230);
  for (let k = 0; k < 6; k++) { const y = k * 2.5; zbarXZ(c, s + 2.2, y, -s + k * 2.4 - 1, s + 2.2, y + 2.5, -s + k * 2.4 + 1.4, 1.6, 0xb0b4b8); } // 外階段
  g.box(s + 2.2, 0, -s, 0.2, H, 0.2, 0x9aa0a6); g.box(s + 2.2, 0, s, 0.2, H, 0.2, 0x9aa0a6);
  g.box(0, H + 1.8, -s - 1.05, 6, 1.6, 0.1, 0x1f6fb2); sign(c, '避難', 0, 0, H + 1.85, -s - 1.0, 4.8, 1.4);
  standSign(c, '避難', -10, 12, 2.2, 1.8, true);
}
/** ローカルテレビ局：社屋と、赤白の電波塔、屋上のパラボラ */
export function modelTvStation(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xc8c2b6);
  const g = c.g, h = block(c, -12, -2, 46, 26, 6, 0xe9ecef, { label: 'テレビ', glass: 0x6f8fa8, lit: 0.6, band: 0x1f3b57 });
  for (const [x, z] of [[-26, -6], [-4, -6]] as [number, number][]) { g.cyl(x, h, z, 3, 0.4, 0xd8dade, 12); g.cyl(x, h + 0.4, z, 0.3, 2.4, 0x9aa0a6, 6); }
  const tx = 30, tz = -6, H = 62;
  for (let k = 0; k < 8; k++) { const y0 = (H * k) / 8, y1 = (H * (k + 1)) / 8, r0 = 5 - 4.2 * (k / 8), r1 = 5 - 4.2 * ((k + 1) / 8), col = k % 2 ? 0xf4f4f0 : 0xd0392e;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) zbarXZ(c, tx + sx * r0, y0, tz + sz * r0, tx + sx * r1, y1, tz + sz * r1, 0.45, col);
    g.box(tx, y1, tz, r1 * 2 + 0.4, 0.3, r1 * 2 + 0.4, col); }
  g.box(tx, H, tz, 0.5, 8, 0.5, 0xd0392e); c.wa.box(tx, H + 8, tz, 0.9, 0.9, 0.9, 0xff3a3a);
  slab(c, 0, 22, 84, 10, 0x5a5d61, 0.1); for (let i = 0; i < 6; i++) car(c, -30 + i * 9, 22, true);
}
/** メガバンクの地域本部：石張りの重厚なビル、列柱の玄関 */
export function modelMegaBank(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xd8d2c4);
  const g = c.g, h = block(c, 0, -4, 40, 34, 14, 0xb9b2a4, { label: '銀行', glass: 0x47607a, lit: 0.55, band: 0x8a7a5a, roof: 0x6b6e72 });
  for (let k = 0; k < 6; k++) g.cyl(-15 + k * 6, 0, 14.5, 1.1, 9, 0xe9e4d8, 10); g.box(0, 9, 14.5, 38, 1.6, 4, 0xe2dccc);
  g.box(0, h, -4, 20, 4, 14, 0x8f9499); c.wa.box(0, h + 2, 3.05, 18, 1.2, 0.1, 0xffe8b0);
  slab(c, 0, 24, 52, 8, 0xc8c2b6, 0.08); tree(c, -22, 22, 0.9); tree(c, 22, 22, 0.9);
}
/** 米大手 IT 企業の研究所：芝生の中庭を囲むガラスの低層キャンパス、屋上の太陽光、自転車置き場 */
export function modelGlobalIT(c: Ctx): void {
  pad(c, 118.4, 88.4, 0x86b86a);
  const g = c.g, glass = 0x6fa0c8;
  block(c, -36, -18, 34, 30, 4, 0xe8eef4, { glass, lit: 0.7, band: 0x2a3a4a });
  block(c, 2, -26, 46, 22, 5, 0xf2f5f8, { glass, lit: 0.7, band: 0x2a3a4a, label: 'IT' });
  block(c, 38, 0, 26, 40, 3, 0xe8eef4, { glass, lit: 0.7, band: 0x2a3a4a });
  for (let k = 0; k < 5; k++) g.box(2 - 18 + k * 9, 5 * 3.6 + 0.8, -26, 7, 0.25, 18, 0x22324a); // 太陽光
  g.cyl(-6, 0, 8, 11, 0.3, 0x9ccc6a, 18); for (let i = 0; i < 8; i++) tree(c, -6 + Math.cos(i) * 9, 8 + Math.sin(i) * 9, 0.85);
  g.box(-10, 0, 34, 30, 2.4, 6, 0xd8dade, 0x9aa0a6); for (let i = 0; i < 10; i++) g.box(-23 + i * 2.8, 0, 34, 0.15, 1, 1.6, 0x2a2a2a);
  slab(c, 30, 36, 50, 12, 0x5a5d61, 0.1); for (let i = 0; i < 7; i++) car(c, 10 + i * 6, 36, true);
}

// ================================================================ v33：鉄道・次世代交通・国際・未来・万博・昔の建物・外国風の名所
/** 電車の車両基地：並んだ留置線と電車、検修庫 */
export function modelRailDepot(c: Ctx): void {
  const g = c.g; pad(c, 148.4, 58.4, 0x8d8a82);
  for (let k = 0; k < 6; k++) { const z = -22 + k * 8; g.box(0, 0.05, z, 140, 0.15, 2.6, 0x6b5a48); for (const dx of [-0.75, 0.75]) g.box(0, 0.2, z + dx, 140, 0.12, 0.14, 0xa8adb2);
    if (k !== 2) for (let n = 0; n < 3; n++) { const x = -50 + n * 21 + (k % 2) * 8; g.box(x, 0.5, z, 19, 3.4, 2.9, [0xe6e8ea, 0xd8e8f0, 0xf0e6d0][k % 3], 0xc0c4c8); g.box(x, 2.0, z + 1.46, 18, 0.9, 0.05, 0x2a4a6a); g.box(x, 1.2, z + 1.47, 19, 0.3, 0.04, [0x2a7fe0, 0x2aa060, 0xe8862a][k % 3]); } }
  g.box(50, 0, -6, 36, 11, 34, 0xc9ccd0, 0x8a8f94); g.box(50, 11, -6, 37, 0.6, 35, 0x9aa0a6); for (let k = 0; k < 4; k++) g.box(32 - 0.05, 0, -18 + k * 8, 0.1, 7, 5.5, 0x3d4247);
  for (let k = 0; k < 5; k++) { g.cyl(-60 + k * 28, 0, 26, 0.18, 8, 0x8b8f93, 5); g.box(-60 + k * 28, 8, 26, 0.4, 0.3, 6, 0x8b8f93); }
}
/** リニアの駅：長い流線形の屋根とガラス、停まっているリニア */
export function modelMaglevStation(c: Ctx): void {
  const g = c.g; pad(c, 148.4, 58.4, 0xd8d4cc);
  g.box(0, 6, 8, 140, 1.4, 6, 0xb9bec4); for (let k = 0; k < 8; k++) g.cyl(-63 + k * 18, 0, 8, 0.9, 6, 0xc8ccd0, 8);
  g.box(0, 7.4, 8, 138, 0.6, 1.8, 0x8a9096); obox(c, 0, 8.8, 8, [1, 0, 0], [0, 1, 0], [0, 0, 1], 60, 1.4, 1.6, 0xf4f6f8); obox(c, 0, 8.6, 9.65, [1, 0, 0], [0, 1, 0], [0, 0, 1], 59, 0.35, 0.05, 0x1f4e9a);
  g.blob(62, 8.8, 8, 6, 1.5, 1.6, 0xf4f6f8, 8); g.blob(-62, 8.8, 8, 6, 1.5, 1.6, 0xf4f6f8, 8);
  for (let k = 0; k < 14; k++) { const x = -52 + k * 8; g.box(x, 0, -12, 7.4, 14 + Math.sin(k / 13 * Math.PI) * 6, 22, 0xdfe6ec, 0x9fb4c8); c.wa.box(x, 2, -0.95, 6.8, 9 + Math.sin(k / 13 * Math.PI) * 5, 0.06, 0x9fc4e0); }
  slab(c, 0, 24, 120, 6, 0x5a5d61);
}
/** 次世代交通の実験線：高架の白いチューブと見学館 */
export function modelHyperloop(c: Ctx): void {
  const g = c.g; pad(c, 178.4, 28.4, 0xc8c4bb);
  for (let k = 0; k < 9; k++) g.cyl(-80 + k * 20, 0, 0, 0.8, 6, 0xb0b5ba, 6);
  obox(c, 0, 8.2, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1], 88, 2.2, 2.2, 0xeef2f5); for (let k = 0; k < 18; k++) g.box(-85 + k * 10, 7.6, 0, 0.5, 5.2, 4.8, 0xc8d0d6);
  c.wa.box(20, 8.2, 2.25, 10, 1.2, 0.05, 0x8ff0ff); g.blob(-70, 7, -6, 10, 7, 8, 0xe4eaee, 10); c.wa.box(-70, 4, 1.8, 12, 3, 0.05, 0x9fd8f0);
}
/** 外国の総領事館：洋館と旗、塀と警備ボックス */
export function modelConsulate(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xd2cdc0);
  g.box(0, 0, -6, 34, 10, 20, 0xf2eee4, 0x8a8f94); g.box(0, 10, -6, 35, 0.8, 21, 0xd8d2c4); for (let k = 0; k < 6; k++) g.cyl(-12.5 + k * 5, 0, 4.4, 0.6, 8, 0xf6f4ee, 8); g.gable(0, 10.8, 5.2, 16, 3, 2.6, 0xe8e4da, 'x', 0xf2eee4);
  for (let f = 0; f < 2; f++) winRow(c, 0, -15, 15, 2 + f * 4.4, 4.05, 6, 1.6, 2.4, 0.5);
  for (const x of [-20, 20]) { g.cyl(x, 0, 20, 0.12, 12, 0xd8dade, 5); g.box(x + 1.6, 9.5, 20, 3, 2, 0.05, x < 0 ? 0x2a4ac8 : 0xd8382c); }
  g.box(0, 0, 27, 56, 2, 0.5, 0xe0dcd2); g.box(22, 0, 24, 2.4, 2.6, 2.4, 0xf4f4f0, 0x2a3a4a);
}
/** デパート：重厚な石張り、壁面の大看板、屋上の観覧車 */
export function modelDepartment(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 88.4, 0xcac4b8);
  const h = block(c, 0, 0, 80, 80, 8, 0xe8dcc4, { label: '百貨店', glass: 0x6a7a8a, lit: 0.7, band: 0xb8a070 });
  for (let k = 0; k < 6; k++) g.box(-32 + k * 13, 0, 40.4, 9, 4.2, 0.4, [0xd8382c, 0xe8a020, 0x2a7fe0][k % 3]);
  g.cyl(24, h, -24, 0.6, 3, 0x8b8f93, 6); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; zbarXZ(c, 24, h + 9, -24, 24 + Math.cos(a) * 7, h + 9 + Math.sin(a) * 7, -24, 0.25, 0xf4f4f0); g.box(24 + Math.cos(a) * 7, h + 8.4 + Math.sin(a) * 7, -24, 1.3, 1.2, 1.3, [0xff6a6a, 0xffd23a, 0x6ad0ff][k % 3]); }
}
/** 未来都市タワー：ねじれたガラスの塔と空中庭園 */
export function modelFutureTower(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 88.4, 0xc4ccd2);
  const N = 40, fh = 4.6;
  for (let f = 0; f < N; f++) { const a = f * 0.035, r = 15 - Math.abs(f - 22) * 0.12, u: V = [Math.cos(a), 0, Math.sin(a)], w: V = [-Math.sin(a), 0, Math.cos(a)];
    obox(c, 0, f * fh + fh / 2, 0, u, [0, 1, 0], w, r, fh / 2 - 0.2, r, f % 10 === 9 ? 0x6aa04a : 0x7fa8c4); if (f % 2 === 0) c.wa.box(Math.cos(a) * r * 0.2, f * fh + 1, Math.sin(a) * r * 0.2 + r * 0.98, r * 1.4, fh * 0.5, 0.05, 0xa8e0ff); }
  g.cyl(0, N * fh, 0, 6, 1.2, 0xd8e0e6, 16); g.cyl(0, N * fh + 1.2, 0, 1, 14, 0xd8e0e6, 8); c.wa.box(0, N * fh + 15, 0, 1.2, 1.2, 1.2, 0x6af0ff);
  for (let k = 0; k < 8; k++) g.blob(-30 + k * 8, 1.2, 34, 2.4, 2, 2.4, 0x5f9a4a, 6);
}
/** 万博会場：大屋根の輪と、色とりどりのパビリオン */
export function modelExpoSite(c: Ctx): void {
  const g = c.g; pad(c, 178.4, 148.4, 0xd8d0c0);
  const R = 62, n = 48; for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2; obox(c, Math.cos((a0 + a1) / 2) * R, 12, Math.sin((a0 + a1) / 2) * R, [-Math.sin((a0 + a1) / 2), 0, Math.cos((a0 + a1) / 2)], [0, 1, 0], [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)], R * Math.PI / n + 0.3, 0.9, 7, 0xa8784a); if (k % 3 === 0) g.cyl(Math.cos(a0) * R, 0, Math.sin(a0) * R, 0.6, 11.2, 0x8a5e38, 6); }
  const P = [[-30, -20, 0xff5a5a, 'b'], [5, -30, 0x4ab0ff, 'd'], [32, -8, 0xffd23a, 'b'], [-8, 12, 0x6ee07a, 'd'], [26, 26, 0xff7ad9, 'b'], [-34, 24, 0x9a7bff, 'd'], [0, -4, 0xffffff, 'b']] as [number, number, number, string][];
  for (const [x, z, col, t] of P) { if (t === 'd') g.blob(x, 0, z, 9, 9, 9, col, 10); else { g.box(x, 0, z, 14, 9, 14, col, 0xf4f4f0); g.cyl(x, 9, z, 5, 4, 0xf4f4f0, 10); } c.wa.box(x, 2, z + 7.1, 6, 3, 0.05, 0xfff0c0); }
  g.cyl(0, 0, 0, 1, 30, 0xf0f0f0, 8); g.blob(0, 30, 0, 4, 4, 4, 0xff3a3a, 10);
}
/** 赤レンガ倉庫：切妻屋根の長い倉庫 2 棟 */
export function modelRedBrick(c: Ctx): void {
  const g = c.g; pad(c, 118.4, 28.4, 0xb8b0a0);
  for (const x of [-29, 29]) { g.box(x, 0, 0, 52, 9, 20, 0xa8483a, 0x6a4a3a); g.gable(x, 9, 0, 52, 20, 3, 0x5a5e62, 'x', 0xa8483a); for (let k = 0; k < 8; k++) { g.box(x - 22 + k * 6.2, 1.2, 10.05, 2.2, 3.2, 0.1, 0x3a2a22); g.box(x - 22 + k * 6.2, 5.6, 10.05, 1.6, 2.2, 0.1, 0x2a3a4a); c.wa.box(x - 22 + k * 6.2, 5.6, 10.1, 1.4, 2.0, 0.04, 0xffd08a); } }
}
/** 洋館（異人館）：下見板張りの白い洋館、塔屋と鎧戸 */
export function modelWesternHouse(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0x9cba78);
  g.box(0, 0, -4, 24, 8, 16, 0xf4f0e6, 0x8a5a4a); g.gable(0, 8, -4, 24, 16, 4, 0x7a4a3a, 'x', 0xf4f0e6);
  g.box(-8, 0, -4, 7, 13, 7, 0xf4f0e6); g.gable(-8, 13, -4, 7.4, 7.4, 4, 0x6a8a5a, 'z', 0xf4f0e6); g.box(-8, 17, -4, 0.3, 3, 0.3, 0x3a3a3a);
  for (let k = 0; k < 4; k++) for (let f = 0; f < 2; f++) { g.box(-6 + k * 5, 1.4 + f * 3.8, 4.05, 1.6, 2.4, 0.08, 0x2a4a6a); g.box(-7.1 + k * 5, 1.4 + f * 3.8, 4.06, 0.5, 2.4, 0.06, 0x3a6a4a); g.box(-4.9 + k * 5, 1.4 + f * 3.8, 4.06, 0.5, 2.4, 0.06, 0x3a6a4a); }
  for (let k = 0; k < 6; k++) tree(c, -24 + k * 9, 22, 1);
}
/** 町家の街並み：格子と瓦屋根の 2 階建てが並ぶ石畳の通り */
export function modelMachiya(c: Ctx): void {
  const g = c.g; pad(c, 118.4, 58.4, 0xb4a890); slab(c, 0, 0, 116, 8, 0x8a8478);
  for (const z of [-16, 16]) for (let k = 0; k < 9; k++) { const x = -52 + k * 13, d = z < 0 ? 1 : -1; g.box(x, 0, z, 12, 6.4, 18, 0x6a4a32, 0x3a3e42); g.gable(x, 6.4, z, 12.6, 18.6, 2.2, 0x3a3e42, 'z', 0x6a4a32);
    for (let n = 0; n < 8; n++) g.box(x - 4.6 + n * 1.3, 0.4, z + d * 9.06, 0.18, 3, 0.08, 0x8a6a4a); g.box(x, 3.4, z + d * 9.05, 11, 0.4, 0.4, 0x3a3e42); c.wa.box(x, 1.8, z + d * 9.1, 4, 1.4, 0.04, 0xffc070); g.cyl(x + 5, 3.2, z + d * 9.6, 0.5, 1, 0xff5a3a, 8); }
}
/** 時計塔（ロンドン風）：石造り風の角塔と、四面の時計 */
export function modelClockTower(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xc8c0a8); slab(c, 0, 0, 40, 40, 0xb0a890);
  g.box(0, 0, 0, 12, 52, 12, 0xd8c08a, 0x8a7a5a); for (let k = 0; k < 10; k++) g.box(0, 5 + k * 5, 0, 12.4, 0.6, 12.4, 0xc0a870);
  g.box(0, 52, 0, 13, 10, 13, 0xd8c08a); for (const [dx, dz, f] of [[0, 6.55, 0], [0, -6.55, 0], [6.55, 0, 1], [-6.55, 0, 1]] as [number, number, number][]) { g.box(dx, 53.5, dz, f ? 0.1 : 8, 7, f ? 8 : 0.1, 0xf4f0e0); c.wa.box(dx * 1.005, 53.5, dz * 1.005, f ? 0.05 : 7, 7, f ? 7 : 0.05, 0xfff4c8); }
  g.box(0, 62, 0, 10, 4, 10, 0xc0a870); g.cyl(0, 66, 0, 5.6, 14, 0x4a5a4a, 4, undefined, 0.4); g.cyl(0, 80, 0, 0.3, 4, 0xd8b84a, 4);
}
/** 鉄の塔（パリ風）：4 本の脚が上ですぼまる鉄骨の展望塔 */
export function modelIronTower(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 88.4, 0x9cba78);
  const H = 120, col = 0x7a5a3a, R = (y: number) => 30 * Math.pow(1 - y / H, 1.8) + 1.2;
  for (let k = 0; k < 16; k++) { const y0 = H * k / 16, y1 = H * (k + 1) / 16, r0 = R(y0), r1 = R(y1);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) zbarXZ(c, sx * r0, y0, sz * r0, sx * r1, y1, sz * r1, k < 4 ? 1.6 : 0.9, col);
    if (k === 7 || k === 11) g.box(0, y1, 0, r1 * 2 + 2, 1.2, r1 * 2 + 2, col); }
  { const y = 26, r = R(y); for (const [x0, z0, x1, z1] of [[-r, -r, r, -r], [r, -r, r, r], [r, r, -r, r], [-r, r, -r, -r]] as [number, number, number, number][]) { zbarXZ(c, x0, y, z0, x1, y, z1, 1.4, col); c.wa.box((x0 + x1) / 2, y + 1.2, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.5, 0.5, Math.abs(z1 - z0) + 0.5, 0xffc860); } } g.cyl(0, H, 0, 0.6, 10, col, 6); c.wa.box(0, H + 10, 0, 1.4, 1.4, 1.4, 0xffe08a);
}
/** 風車とチューリップ畑：オランダ風の風車小屋と色の帯 */
export function modelWindmill(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0x8cbc5c);
  for (let k = 0; k < 9; k++) g.box(-30 + k * 7, 0.06, 6, 5.6, 0.5, 40, [0xff4a4a, 0xffd23a, 0xff7ad9, 0xffffff, 0xff8a2a][k % 5]);
  g.cyl(28, 0, -12, 6.5, 14, 0x8a6a4a, 8, undefined, 4.5); g.cyl(28, 14, -12, 4.8, 4, 0x5a5e62, 8, undefined, 0.4);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; zbarXZ(c, 28, 15, -5.5, 28 + Math.cos(a) * 15, 15 + Math.sin(a) * 15, -5.5, 0.4, 0xf4efe6); obox(c, 28 + Math.cos(a) * 9, 15 + Math.sin(a) * 9, -5.4, [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1], 6, 1.4, 0.05, 0xe8e0d0); }
}
/** ピラミッド形の展示館：ガラスのピラミッドと広場の池 */
export function modelPyramidHall(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 88.4, 0xd8d0c0); slab(c, 0, 0, 84, 84, 0xc8c0b0);
  const H = 22, B = 30; for (let k = 0; k < 11; k++) { const y = H * k / 11, w = B * (1 - k / 11) * 2; g.box(0, y, 0, w, H / 11, w, 0x9fc4d8, 0x9fc4d8); }
  for (let k = 0; k < 10; k++) c.wa.box(0, 1 + k * 2, B * (1 - (1 + k * 2) / H) + 0.1, B * (1 - (1 + k * 2) / H) * 1.8, 0.4, 0.05, 0xd0f0ff);
  for (const [x, z] of [[-32, -32], [32, -32], [-32, 32], [32, 32]] as [number, number][]) g.box(x, 0.05, z, 14, 0.3, 14, 0x5a8ab8);
}
/** 凱旋門風の門：アーチのある石造り風の門 */
export function modelTriumphGate(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 28.4, 0xc8c0b0);
  for (const x of [-12, 12]) g.box(x, 0, 0, 12, 22, 12, 0xe8dcc0, 0xc8b890);
  g.box(0, 16, 0, 36, 10, 12.2, 0xe8dcc0); g.box(0, 26, 0, 37, 1.4, 13, 0xd8c8a0);
  for (let k = 0; k < 9; k++) { const a = k / 8 * Math.PI; g.box(Math.cos(a) * 6, 10 + Math.sin(a) * 6, 6.15, 1.6, 1.6, 0.3, 0xc8b890); }
  for (const x of [-12, 12]) g.box(x, 6, 6.15, 8, 6, 0.2, 0xd0c4a4);
}
/** 自動運転トラックの中継拠点：大屋根の積み替え棟と、並ぶ無人トラック */
export function modelAutoHub(c: Ctx): void {
  const g = c.g; pad(c, 118.4, 88.4, 0x8d8a82);
  g.box(0, 0, -18, 100, 12, 34, 0xe4e8ec, 0x9aa0a6); g.box(0, 12, -18, 101, 0.6, 35, 0x8a9096); for (let k = 0; k < 10; k++) g.box(-45 + k * 10, 0, -0.9, 7, 5, 0.1, 0x3d4247);
  for (let k = 0; k < 8; k++) { const x = -42 + k * 12; g.box(x, 0.5, 14, 2.6, 3.4, 10, 0xf4f6f8, 0xc0c8d0); g.box(x, 0.5, 8.4, 2.6, 2.6, 2.4, 0x2a7fe0); c.wa.box(x, 2.4, 7.1, 2, 0.6, 0.05, 0x8ff0ff); }
  for (let k = 0; k < 4; k++) { g.cyl(-45 + k * 30, 0, 36, 0.15, 7, 0x8b8f93, 5); c.wa.box(-45 + k * 30, 7, 36, 0.6, 0.6, 0.6, 0x6af0ff); }
}

// ======== v41：夜の街・産業・宇宙・ロボット・ホテル・高校スポーツ・商店街 ========
/** 小さな飲み屋の間口 1 軒（のれん・ちょうちん・光る窓）。face 0 で +z を向く */
function izakaya(c: Ctx, x: number, z: number, w: number, h: number, wall: number, noren: number): void {
  const g = c.g; g.box(x, 0, z - 2.6, w - 0.15, h, 5.2, wall, 0x3a3a3a);
  c.wa.box(x, 0.5, z + 0.02, w * 0.62, 1.7, 0.06, 0xffc98a);                 // 光る格子戸
  g.box(x, 2.25, z + 0.12, w * 0.7, 0.5, 0.04, noren);                       // のれん
  g.cyl(x + w * 0.38, 2.4, z + 0.45, 0.28, 0.6, 0xff5a3a, 8);                 // 赤ちょうちん
  c.wa.box(x - w * 0.2, h - 1.2, z + 0.03, w * 0.5, 0.7, 0.06, pick(c, [0xff4f9a, 0x4fe0ff, 0xffd34f, 0xff8a3a])); // 小さな看板
}
export function modelYokocho(c: Ctx): void {
  pad(c, 58.4, 28.4, 0x5a5650);
  const g = c.g;
  // 高架の線路（上を電車が通る）と、その下に並ぶ店
  g.box(0, 6.2, -9, 58, 1.2, 9, 0x8a8c8e, 0x6f7274); for (let x = -27; x <= 27; x += 9) g.box(x, 0, -9, 1.2, 6.2, 1.2, 0x9a9c9e);
  g.box(0, 7.4, -13.2, 58, 1.1, 0.4, 0x7a7c7e); g.box(0, 7.4, -4.8, 58, 1.1, 0.4, 0x7a7c7e);
  for (let i = 0; i < 9; i++) izakaya(c, -26 + i * 6.5, -4.2, 6.2, 5.6, pick(c, [0x6b4a32, 0x5a3a28, 0x3a3f46, 0x7a5a3a]), pick(c, [0x1d3557, 0xc3312b, 0x2b2b2b, 0xf4efe6]));
  // 向かいの路地の店（2 階建て）と、間の路地のちょうちんの列
  for (let i = 0; i < 7; i++) { const x = -24 + i * 8; g.box(x, 0, 9.5, 7.6, 6.6, 7, pick(c, [0x8a6a4a, 0x6b5a4a, 0x9a8a7a]), 0x4a4a4a); c.wa.box(x, 0.5, 5.98, 4.6, 1.8, 0.06, 0xffc98a); c.wa.box(x, 3.8, 5.98, 2.4, 1.2, 0.06, 0xffe0b0); g.box(x, 2.3, 5.6, 5, 0.5, 0.04, pick(c, [0x1d3557, 0xc3312b, 0x2b2b2b])); }
  for (let k = 0; k < 14; k++) { const x = -26 + k * 4; g.box(x, 3.6, 0.8, 0.5, 0.6, 0.5, k % 2 ? 0xff5a3a : 0xfff1d0); }
  g.box(0, 3.9, 0.8, 56, 0.05, 0.05, 0x2a2a2a);
  sign(c, '横丁', 0, -22, 4.5, 5.0, 3.2);
}
export function modelNightDistrict(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x4a4c50);
  const g = c.g, NE = [0xff4f9a, 0x4fe0ff, 0xffd34f, 0x9a7bff, 0x6cff9a, 0xff8a3a];
  slab(c, 0, 0, 8, 56, 0x6a6460, 0.12); // 真ん中の通り（歩行者の路地）
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const z = -22 + i * 11, x = side * 15, fl = 3 + Math.floor(c.rnd() * 4), h = fl * 3.3 + 0.4, wall = pick(c, [0x3a3f46, 0x5a5650, 0x6b6e74, 0x2b2e33, 0x7a6a5a]);
    g.box(x, 0, z, 18, h, 10, wall, 0x55585e);
    for (let f = 0; f < fl; f++) winRow(c, side > 0 ? 3 : 2, z - 4, z + 4, f * 3.3 + 1.1, x - side * 9, 3, 2, 1.4, 0.5); // 雑居ビルの窓
    // 縦の袖看板（ネオン）と、1 階の入口の光
    const ax = x - side * 9.1; for (let f = 1; f < fl; f++) c.wa.box(ax - side * 0.4, f * 3.3 + 0.2, z + (f % 2 ? -3 : 3), 0.3, 2.6, 1.6, NE[(i * 3 + f + (side > 0 ? 2 : 0)) % NE.length]);
    c.wa.box(ax - side * 0.05, 0.3, z, 0.06, 2.4, 6, 0xffd8a8);
    g.box(ax - side * 1.2, 2.8, z, 2.4, 0.2, 7, 0x2a2a2e); // 庇
  }
  // 通りの入口のゲート（光る文字の帯）
  for (const z of [-27, 27]) { g.box(-4.6, 0, z, 0.6, 7, 0.6, 0x2a2a2e); g.box(4.6, 0, z, 0.6, 7, 0.6, 0x2a2a2e); g.box(0, 6.2, z, 10, 1.6, 0.5, 0x2a2a2e); c.wa.box(0, 6.4, z + (z > 0 ? 0.27 : -0.27), 8.4, 1.1, 0.05, 0xff4f9a); }
  sign(c, 'カラオケ', 3, 26, 8, -6.1 + 0, 4); sign(c, 'BAR', 2, -26, 6, 6.1, 3);
}
export function modelFuzokuDistrict(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x45474b);
  const g = c.g, NE = [0xff3f8a, 0xc04fff, 0xff6a3a, 0xffd34f, 0x4fd0ff];
  slab(c, 0, 0, 7, 56, 0x5a5654, 0.12);
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = -20 + i * 13.5, x = side * 15, fl = 4 + Math.floor(c.rnd() * 3), h = fl * 3.4 + 0.4;
    g.box(x, 0, z, 18, h, 12, pick(c, [0x2b2e33, 0x3a2f3a, 0x4a3f46, 0x2f2f38]), 0x45474b);
    const ax = x - side * 9.1;
    // 窓のない壁一面の看板と、ふちを回るネオン管
    c.wa.box(ax - side * 0.06, 3.4, z, 0.05, h - 4.5, 9, NE[(i + (side > 0 ? 2 : 0)) % NE.length]);
    g.box(ax - side * 0.03, 3.0, z, 0.06, h - 3.7, 10.2, 0x1a1a1e);
    c.wa.box(ax - side * 0.05, 0.3, z, 0.06, 2.3, 5, 0xffb0d0);
    for (let f = 0; f < 3; f++) c.wa.box(ax - side * 0.1, 0.4, z - 5.4 + f * 0.25, 0.05, 2.6, 0.08, 0xffe14a); // 入口の電飾
  }
  g.box(-21, 0, 26, 6, 3, 4, 0xf2f2ee); sign(c, '案内所', 0, -21, 1.6, 28.05, 3);
  for (const z of [-28, 28]) { g.box(-4, 0, z, 0.5, 6.5, 0.5, 0x2a2a2e); g.box(4, 0, z, 0.5, 6.5, 0.5, 0x2a2a2e); c.wa.box(0, 5.6, z, 8.4, 1.0, 0.3, 0xff3f8a); }
}
export function modelCarPlant(c: Ctx): void {
  pad(c, 148.4, 118.4, 0xb4b1aa);
  const g = c.g, wall = dull(c, 0xe9ebec, 0xcfd2d4);
  // 組み立て工場（のこぎり屋根）と塗装工場・本館
  g.box(-20, 0, -20, 90, 14, 50, wall, 0x9aa0a6);
  for (let k = 0; k < 10; k++) { const x = -60 + k * 9 + 4.5; g.quad([x - 4.5, 14, 5], [x + 4.5, 14, 5], [x + 4.5, 17, 5], [x - 4.5, 17, 5], 0x7a8086); c.wa.quad([x + 4.5, 14.2, 5.02], [x + 4.5, 14.2, -45], [x + 4.5, 16.8, -45], [x + 4.5, 16.8, 5.02], 0xcfe0ea); }
  g.box(-20, 14, -20, 90, 0.4, 50, 0x8a9096);
  winRow(c, 0, -64, 24, 7, 5.02, 14, 3, 2.4, 0.5);
  block(c, 45, -30, 30, 18, 4, 0xf4f4f0, { label: '自動車', lit: 0.5, glass: 0x7fa6c0, band: 0xc3312b });
  g.box(45, 0, 0, 26, 18, 20, 0xdfe2e4, 0x9aa0a6); g.cyl(55, 18, 4, 1.5, 12, 0xc8cbce, 10); // 塗装工場と排気筒
  // 完成車のモータープール（色とりどりの新車がずらり）
  slab(c, -10, 38, 110, 34, 0x55585c, 0.1);
  for (let r = 0; r < 6; r++) for (let k = 0; k < 22; k++) car(c, -62 + k * 4.8, 25 + r * 5.2, false, pick(c, [0xffffff, 0xf2f2f2, 0x1a1a1a, 0xc3312b, 0x2b5ea8, 0x8a9096, 0xd8d8d8]));
  // テストコース
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; g.box(52 + Math.cos(a) * 16, 0.04, 38 + Math.sin(a) * 12, 6, 0.06, 6, 0x3a3c3e); }
  fenceRect(c, 147, 117, 2, 0x8a9096, 10);
}
export function modelHeavyInd(c: Ctx): void {
  pad(c, 148.4, 118.4, 0xa9a59c);
  const g = c.g, wall = dull(c, 0x5d7f9a, 0x55708a);
  g.box(-30, 0, -15, 80, 24, 40, wall, 0x7a8086); g.box(-30, 24, -15, 80, 2, 40, 0x6a7076);
  winRow(c, 0, -68, 8, 16, 5.02, 12, 3.4, 3, 0.45, 0xcfe0ea);
  sign(c, '重工', 0, -30, 18.5, 5.05, 8);
  // 天井クレーンのレールと、門形クレーン
  for (const x of [20, 50]) { g.box(x, 0, 20, 1.6, 30, 1.6, 0xd9622b); g.box(x, 0, 50, 1.6, 30, 1.6, 0xd9622b); g.box(x, 28, 35, 2, 2, 32, 0xd9622b); }
  g.box(35, 26, 35, 32, 2.4, 3, 0xf2c230); g.box(35, 18, 35, 0.3, 8, 0.3, 0x2a2a2a);
  // 組み立て中の大きな部品（発電機のタービンと、船体ブロック）
  g.cyl(-50, 0, 28, 6, 3, 0x8a9096, 16); g.cyl(-50, 3, 28, 5.2, 14, 0x9aa0a6, 16, 0x6a7076); for (let k = 0; k < 6; k++) g.box(-50, 3 + k * 2.3, 28, 13, 0.3, 0.6, 0x5a6066);
  g.box(-18, 0, 32, 26, 9, 14, 0x3a5a7a, 0xc3312b); g.box(-18, 9, 32, 22, 0.4, 12, 0x6a7076);
  block(c, 50, -38, 34, 14, 5, 0xf4f4f0, { lit: 0.5, glass: 0x7fa6c0, band: 0x1d3557 });
  fenceRect(c, 147, 117, 2, 0x8a9096, 10);
}
export function modelFoodMaker(c: Ctx): void {
  pad(c, 118.4, 88.4, 0xc0bdb4);
  const g = c.g, wall = dull(c, 0xfafaf7, 0xe0ddd6);
  g.box(-14, 0, -10, 70, 12, 40, wall, 0xc9ccd0); g.box(-14, 12, -10, 70, 0.5, 40, 0xb9bcc0);
  g.box(-14, 9, 10.1, 70, 1.2, 0.3, 0xc3312b); winRow(c, 0, -46, 18, 4, 10.05, 12, 3, 2.2, 0.5, 0xcfe0ea);
  sign(c, '食品', 0, -34, 8.2, 10.15, 6);
  for (let k = 0; k < 4; k++) { g.cyl(32 + (k % 2) * 9, 0, -26 + Math.floor(k / 2) * 10, 3.6, 16, 0xe9ebec, 14, 0xd0d3d6); } // 原料のサイロ
  g.box(36, 0, 12, 16, 8, 14, 0xf4f1e8, 0x9aa0a6); sign(c, '工場', 0, 36, 5.4, 19.1, 3); // 工場見学の受付
  parking(c, -20, 32, 60, 10, 12); for (let i = 0; i < 4; i++) g.box(30 + i * 5, 0, 32, 2.5, 3.4, 9, 0xf4f4f0); // トラック
  for (let i = 0; i < 6; i++) tree(c, -52 + i * 7, 40, 0.9);
}
export function modelZenecon(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b5ac);
  const h = block(c, 0, -2, 18, 16, 8, dull(c, 0xd8d6d0, 0xbcb9b2), { fh: 3.4, lit: 0.55, glass: 0x7a96aa, band: 0xf2c230, label: '建設' });
  const g = c.g; g.box(0, h + 0.4, -2, 6, 2.4, 6, 0x9aa0a6); // 屋上の設備
  for (const x of [-10, 10]) tree(c, x, 10, 0.8);
  g.box(0, 0, 9, 10, 3.2, 1, 0x3a3f46); c.wa.box(0, 0.3, 9.55, 8, 2.2, 0.05, 0xcfe0ea);
}
export function modelTradingCo(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xb9b5ac);
  const g = c.g, h = block(c, -6, -2, 34, 18, 12, 0x5a6a7a, { fh: 3.6, lit: 0.6, glass: 0x5f88a8, band: 0x27405e, label: '商事' });
  g.box(-6, h + 0.4, -2, 12, 3, 8, 0x6a7076); for (let k = 0; k < 5; k++) g.box(-22 + k * 8, 0, 8, 0.5, h, 0.5, 0x8a96a2);
  g.box(18, 0, 0, 8, 6, 8, 0x27405e); c.wa.box(18, 0.4, 4.05, 6, 4.6, 0.05, 0xcfe0ea);
  for (const x of [12, 24]) tree(c, x, 10, 0.8);
}
export function modelStockExch(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xd2ccbf);
  const g = c.g, st = dull(c, 0xe8e2d4, 0xd0c8b6);
  // 石造りの本館（列柱と三角の破風）と、株価の電光掲示
  g.box(0, 0, -6, 44, 2, 30, 0xcfc7b4); g.box(0, 2, -8, 40, 16, 24, st, 0x9aa0a6);
  for (let k = 0; k < 8; k++) g.cyl(-17.5 + k * 5, 2, 5.6, 0.9, 13, 0xf4efe2, 10);
  g.box(0, 15, 5.6, 40, 1.6, 2.6, st); g.gable(0, 16.6, 5.6, 40, 2.6, 4, st, 'x', st, 0.1);
  c.wa.box(0, 9, 4.2, 30, 2.6, 0.08, 0x2a8a4a); c.wa.box(0, 6, 4.2, 30, 1.6, 0.08, 0xc3312b); // 緑と赤の数字の帯
  sign(c, '取引所', 0, 0, 12.2, 4.25, 6);
  for (let k = 0; k < 6; k++) g.box(-12 + k * 4.8, 0, 14, 3, 0.4 + k * 0.4, 0.6, 0xcfc7b4); // 正面の階段
  block(c, 0, -22, 30, 10, 14, 0x3a4a5a, { fh: 3.6, lit: 0.6, glass: 0x5f88a8, band: 0x1d3557 });
  for (const x of [-24, 24]) tree(c, x, 22, 1);
}
export function modelSpaceport(c: Ctx): void {
  pad(c, 178.4, 148.4, 0x9a9a8c);
  const g = c.g;
  // 発射台：鉄骨の塔と、白いロケット
  slab(c, 40, -20, 40, 40, 0xbfbab0, 0.3); g.box(40, 0.3, -20, 14, 3, 14, 0x8a8c8e);
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) g.box(52 + dx * 0.4, 3, -20 + dz * 0.4, 0.8, 52, 0.8, 0xd9622b);
  for (let y = 6; y < 54; y += 6) { g.box(52, 3 + y, -20, 4, 0.4, 4, 0xd9622b); g.box(47, 3 + y, -20, 6, 0.3, 0.6, 0xd9622b); }
  g.cyl(40, 3.3, -20, 2.6, 40, 0xf4f4f2, 16); g.cyl(40, 43.3, -20, 2.6, 6, 0xf4f4f2, 16, undefined, 0.2); g.cyl(40, 3.3, -20, 2.7, 1, 0x2a2a2a, 16);
  for (const a of [0, 2.1, 4.2]) g.cyl(40 + Math.cos(a) * 3.6, 3.3, -20 + Math.sin(a) * 3.6, 1.1, 14, 0xe8e8e4, 10, undefined, 0.3); // 補助ロケット
  g.box(40, 36, -17.3, 2.6, 4, 0.05, 0xc3312b);
  // 組み立て棟（大きな扉）・管制塔・見学の丘
  g.box(-30, 0, -30, 34, 46, 28, 0xf2f2ee, 0x9aa0a6); g.box(-30, 0, -15.95, 14, 40, 0.1, 0x5a6066); sign(c, '宇宙', 0, -30, 41, -15.8, 8);
  g.box(-60, 0, 20, 8, 22, 8, 0xe9ebec); g.box(-60, 22, 20, 11, 4, 11, 0x3a5a7a); c.wa.box(-60, 22.6, 25.6, 10, 2.4, 0.05, 0xcfe0ea);
  slab(c, 0, 52, 120, 30, 0x86b86a, 0.6); for (let i = 0; i < 8; i++) tree(c, -50 + i * 14, 62, 1);
  g.box(-20, 0, 45, 50, 0.1, 3, 0x3a3c3e); // 道
}
export function modelSpaceVenture(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xb9b5ac);
  const g = c.g;
  g.box(-14, 0, -8, 52, 14, 30, 0xf4f4f0, 0xb9bcc0); g.box(-14, 14, -8, 52, 0.4, 30, 0xa9acb0);
  c.wa.box(-14, 1, 7.05, 40, 10, 0.05, 0xcfe0ea); // ガラス張りのクリーンルーム
  g.cyl(-26, 0.5, 2, 1.6, 16, 0xf4f4f2, 12); g.cyl(-26, 16.5, 2, 1.6, 3, 0xf4f4f2, 12, undefined, 0.1); // 展示の小型ロケット
  sign(c, '宇宙', 0, 0, 11.4, 7.1, 5);
  block(c, 28, -12, 18, 18, 4, 0x2b3440, { lit: 0.6, glass: 0x5f88a8, band: 0x4fd0ff });
  g.cyl(30, 13, 12, 3.4, 0.4, 0xe9ebec, 16); g.box(30, 13.4, 12, 0.4, 2, 0.4, 0x9aa0a6); // 通信アンテナ（パラボラ）
  parking(c, 0, 22, 50, 9, 10);
}
export function modelHumanoidLab(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xc0c4c8);
  const g = c.g;
  block(c, -16, -10, 46, 24, 4, 0xeef1f4, { fh: 4.2, lit: 0.65, glass: 0x6fa0c8, band: 0x2a6fd0, label: 'ロボット' });
  // 屋外の歩行テストのコースと、人型ロボット（白い体・黒い顔）
  slab(c, 24, 10, 34, 30, 0x7a8086, 0.1); for (let k = 0; k < 5; k++) g.box(24, 0.12 + k * 0.3, -2 + k * 2.4, 10, 0.3, 2.4, 0xa9acb0); // 階段
  for (let i = 0; i < 4; i++) { const x = 14 + i * 6, z = 16 + (i % 2) * 4;
    g.box(x - 0.35, 0, z, 0.45, 0.9, 0.45, 0xf2f2ee); g.box(x + 0.35, 0, z, 0.45, 0.9, 0.45, 0xf2f2ee); // 脚
    g.box(x, 0.9, z, 1.2, 0.9, 0.7, 0xe9ebec); g.box(x, 1.8, z, 0.5, 0.5, 0.5, 0x2a2e33); c.wa.box(x, 1.95, z + 0.26, 0.36, 0.1, 0.02, 0x4fd0ff); // 胴と顔（目が光る）
    g.box(x - 0.75, 1.0, z, 0.25, 0.8, 0.25, 0xd0d3d6); g.box(x + 0.75, 1.0, z, 0.25, 0.8, 0.25, 0xd0d3d6); }
  g.box(-16, 0, 18, 30, 5, 10, 0x2a6fd0, 0x9aa0a6); c.wa.box(-16, 0.5, 23.05, 26, 3.6, 0.05, 0xcfe0ea); // ショールーム
}
export function modelBizHotel(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xb9b5ac);
  const g = c.g, h = block(c, 0, -2, 14, 18, 11, dull(c, 0xe9e4da, 0xcfc8ba), { fh: 3.0, lit: 0.7, band: 0x1d3557 });
  g.box(0, h - 6, 7.2, 4, 6, 0.4, 0x1d3557); sign(c, 'ホテル', 0, 0, h - 4.6, 7.45, 3.4);
  g.box(0, 0, 8.4, 8, 3, 2.6, 0x2a2a2e); c.wa.box(0, 0.3, 9.75, 6, 2.2, 0.05, 0xffe0b0);
}
export function modelLuxuryHotel(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xc8c2b6);
  const g = c.g;
  // ガラスの高層棟（上の階は少し細く）と、車寄せ・庭とプール
  const h1 = block(c, -6, -10, 26, 22, 18, 0x3a4a5a, { fh: 3.4, lit: 0.75, glass: 0x5f88a8, band: 0xe8c87a });
  g.box(-6, h1 + 0.4, -10, 18, 10, 16, 0x2a3440, 0x9aa0a6); c.wa.box(-6, h1 + 1.4, -1.95, 16, 8, 0.05, 0xffe0a0); // 最上階のバー（夜は金色）
  sign(c, 'ホテル', 0, -6, h1 - 3, 1.1, 5);
  g.box(-6, 0, 6, 22, 0.6, 10, 0xd8d2c4); g.box(-6, 5, 7, 24, 0.4, 12, 0xe8c87a); for (const x of [-16, 4]) g.box(x, 0, 11.5, 0.6, 5, 0.6, 0xe8c87a);
  slab(c, 18, 14, 18, 26, 0x86b86a, 0.1); slab(c, 18, 14, 10, 14, 0x4fb3d9, 0.2);
  for (let i = 0; i < 5; i++) tree(c, 28, -2 + i * 7, 0.9, 1);
}
export function modelRyokan(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xb9ad90);
  const g = c.g, wall = dull(c, 0xe9dcc0, 0xcfc0a2), wood = 0x5a3a28, roof = 0x3a3f46;
  // 木造の 3 階建ての本館（瓦屋根）と、離れの露天風呂
  g.box(-8, 0, -4, 34, 9.6, 14, wall); for (let f = 0; f < 3; f++) { g.box(-8, f * 3.2 + 3.1, 3.2, 35, 0.25, 1.4, wood); winRow(c, 0, -24, 8, f * 3.2 + 0.8, 3.02, 8, 2.6, 1.7, 0.6, 0xfff1d0); }
  g.gable(-8, 9.6, -4, 34, 14, 3.6, roof, 'x', wall, 0.9);
  g.box(-8, 0, 4.6, 8, 3, 2, wood); g.box(-8, 3, 5.4, 10, 0.3, 3.4, roof); sign(c, '旅館', 0, -8, 3.4, 7.15, 3);
  // 露天風呂（湯けむりは演出で）と竹垣
  slab(c, 18, 0, 16, 18, 0x8a8478, 0.3); slab(c, 18, 0, 10, 10, 0x6fb3c8, 0.45); for (let k = 0; k < 8; k++) g.blob(13 + (k % 4) * 3.4, 0.4, -5.5 + Math.floor(k / 4) * 11, 0.9, 0.6, 0.9, 0x8a8478, 5);
  for (let k = 0; k < 16; k++) g.box(10 + k, 0, 9.2, 0.25, 2.4, 0.25, 0x9a8a4a);
  for (const x of [26, 27.5]) tree(c, x, -10, 1, 1);
  for (let k = 0; k < 4; k++) lantern(c, -22 + k * 9, 8.5, 0.8);
}
export function modelPrivHigh(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xcdb892);
  const g = c.g, wall = dull(c, 0xe8e4dc, 0xccc6b8);
  // 校舎（4 階建て）と、ナイター照明のある野球のグラウンド
  g.box(-28, 0, -18, 30, 14.4, 12, wall, 0x9b9d9e); for (let f = 0; f < 4; f++) winRow(c, 0, -42, -14, f * 3.6 + 1.1, -11.95, 8, 2.2, 1.9, 0.25, 0xb9d0da);
  g.box(-28, 14.4, -18, 30.4, 0.6, 12.4, 0xd6d3cb); sign(c, '高校', 0, -28, 11.5, -11.9, 3);
  g.box(-28, 0, 4, 22, 8, 14, 0xe0dcd0, 0x8a9a7a); winRow(c, 0, -38, -18, 2, 11.02, 6, 2.4, 1.6, 0.25); // 寮
  slab(c, 18, 2, 50, 50, 0x7ab85a, 0.08); for (let k = 0; k < 16; k++) { const a = Math.PI / 4 + k / 16 * Math.PI / 2; g.box(5 + Math.cos(a) * 18, 0.1, 18 - Math.sin(a) * 18, 3, 0.06, 3, 0xc9a978); } // 内野
  for (const [x, z] of [[-6, -22], [42, -22], [-6, 26], [42, 26]] as [number, number][]) { g.box(x, 0, z, 0.6, 18, 0.6, 0x9aa0a6); c.wa.box(x, 18, z, 3, 2, 0.4, 0xfffbe8); } // ナイター照明
  g.box(18, 0, -22, 40, 4, 0.2, 0x2e7d32); // バックネットと外野の柵
  fenceRect(c, 87.6, 57.6, 1.5, 0x5f9a78, 8);
}
export function modelClubTeam(c: Ctx): void {
  pad(c, 58.4, 58.4, 0x86b86a);
  const g = c.g;
  slab(c, -4, 0, 46, 32, 0x5aa04a, 0.08); for (const [x, z, sx, sz] of [[-4, -16, 46, 0.25], [-4, 16, 46, 0.25], [-27, 0, 0.25, 32], [19, 0, 0.25, 32], [-4, 0, 0.25, 32]]) g.box(x, 0.1, z, sx, 0.02, sz, 0xf4f1e6);
  for (const x of [-26, 18]) { g.box(x, 0, 0, 0.12, 2.4, 7.3, 0xf2f2ee); g.box(x + (x < 0 ? 1 : -1), 2.3, 0, 2, 0.1, 7.3, 0xf2f2ee); }
  g.box(-4, 0, -24, 26, 5, 8, 0xf4f1e8, 0x2b5ea8); c.wa.box(-4, 0.5, -19.95, 20, 2.4, 0.05, 0xcfe0ea); sign(c, 'クラブ', 0, -4, 3.4, -19.9, 3);
  for (const [x, z] of [[-27, -17], [19, -17], [-27, 17], [19, 17]] as [number, number][]) { g.box(x, 0, z, 0.4, 12, 0.4, 0x9aa0a6); c.wa.box(x, 12, z, 2, 1.2, 0.3, 0xfffbe8); }
  for (let i = 0; i < 6; i++) tree(c, 24, -20 + i * 8, 0.9);
}
export function modelArcade(c: Ctx): void {
  pad(c, 88.4, 28.4, 0x8a8478);
  const g = c.g;
  // 両側の店と、通りを覆うかまぼこ形の屋根（明かり取りのガラス）
  for (const side of [-1, 1]) for (let i = 0; i < 9; i++) { const x = -38 + i * 9.5, z = side * 9; g.box(x, 0, z, 9.2, 6 + (i % 3), 9, pick(c, [0xe8dcc8, 0xd6c8b0, 0xc4b6a2, 0xf0ebe0]), 0x6a6e72);
    c.wa.box(x, 0.4, z - side * 4.55, 6.4, 2.6, 0.05, pick(c, [0xffe0b0, 0xfff1d0, 0xe0f0ff])); g.box(x, 3.3, z - side * 4.7, 8, 0.8, 0.1, pick(c, [0xc3312b, 0x1d3557, 0x2e7d32, 0xf2c230, 0x6b4226])); }
  for (let k = 0; k < 12; k++) { const a0 = Math.PI * k / 12, a1 = Math.PI * (k + 1) / 12, r = 4.6, P = (a: number, x: number): [number, number, number] => [x, 6.4 + Math.sin(a) * 2.4, Math.cos(a) * r];
    (k % 3 === 1 ? c.wa : g).quad(P(a0, -43), P(a0, 43), P(a1, 43), P(a1, -43), k % 3 === 1 ? 0xdfe9ee : 0x9aa0a6); }
  for (let x = -40; x <= 40; x += 10) for (const z of [-4.5, 4.5]) g.box(x, 0, z, 0.3, 6.4, 0.3, 0x6a6e72);
  for (const x of [-43, 43]) { g.box(x, 6.2, 0, 0.6, 2.6, 9.4, 0x1d3557); c.wa.box(x + (x < 0 ? -0.32 : 0.32), 6.8, 0, 0.05, 1.4, 7, 0xfff1d0); }
  sign(c, '商店街', 3, 0, 6.6, -43.35, 4);
}

// ---- v42 通信 ----
export function modelCellTower(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xa9a59c);
  const g = c.g, H = 32;
  // 4 本脚の鉄塔（上ほど細い）と、3 方向のアンテナ
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let k = 0; k < 8; k++) { const y = k * H / 8, f0 = 2.2 * (1 - k / 9), f1 = 2.2 * (1 - (k + 1) / 9); g.box(sx * (f0 + f1) / 2, y, sz * (f0 + f1) / 2, 0.22, H / 8 + 0.05, 0.22, 0xc8ccd0); }
  for (let k = 1; k < 8; k++) { const y = k * H / 8, f = 2.2 * (1 - k / 9); g.box(0, y, f, f * 2, 0.12, 0.12, 0xb8bcc0); g.box(0, y, -f, f * 2, 0.12, 0.12, 0xb8bcc0); g.box(f, y, 0, 0.12, 0.12, f * 2, 0xb8bcc0); g.box(-f, y, 0, 0.12, 0.12, f * 2, 0xb8bcc0); }
  g.box(0, H, 0, 1.4, 0.3, 1.4, 0x9aa0a6); for (let a = 0; a < 3; a++) { const r = a * Math.PI * 2 / 3; g.box(Math.cos(r) * 0.9, H - 3.2, Math.sin(r) * 0.9, 0.45, 2.6, 0.45, 0xf2f2ee); g.box(Math.cos(r) * 0.9, H - 7, Math.sin(r) * 0.9, 0.4, 1.8, 0.4, 0xf2f2ee); }
  g.cyl(1.2, H - 10, 1.2, 0.6, 0.15, 0xe9ebec, 10); c.wa.box(0, H + 0.3, 0, 0.3, 0.3, 0.3, 0xff3030); // 航空障害灯
  g.box(-6, 0, -6, 3.4, 2.6, 2.4, 0xe2e2de, 0x9aa0a6); fenceRect(c, 18, 18, 1.8, 0x8a9096, 3); // 無線機の小屋
}
export function modelTelecomHub(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xb9b5ac);
  const g = c.g, h = block(c, -6, -1, 32, 18, 6, dull(c, 0xd8d6d0, 0xbcb9b2), { fh: 4.2, lit: 0.85, glass: 0x7a96aa, band: 0x2b5ea8 });
  // 屋上の電波塔とパラボラ、非常用の発電機と燃料タンク
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.box(-6 + sx * 1.2, h + 0.4, -1 + sz * 1.2, 0.2, 16, 0.2, 0xc8ccd0);
  g.box(-6, h + 16.4, -1, 3, 0.3, 3, 0x9aa0a6); g.cyl(-3, h + 9, -1, 1.2, 0.3, 0xe9ebec, 12);
  g.box(18, 0, -4, 8, 3.2, 6, 0x7a8086, 0x5a6066); g.cyl(18, 0, 6, 2, 2.6, 0xd9dcdc, 12);
  for (const x of [12, 24]) tree(c, x, 11, 0.8);
}

// ---- v42 ガスと水 ----
export function modelLngTerminal(c: Ctx): void {
  pad(c, 118.4, 88.4, 0xb4b0a6);
  const g = c.g;
  // 球形のガスタンク（4 基）と、平底の LNG タンク、気化器、桟橋
  for (let k = 0; k < 4; k++) { const x = -40 + k * 18, z = -22; for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, -8.4], [0, 8.4], [-8.4, 0], [8.4, 0]]) g.box(x + dx * 0.9, 0, z + dz * 0.9, 0.5, 9, 0.5, 0xc8ccd0); g.blob(x, 15, z, 8.6, 8.6, 8.6, 0xf2f2ee, 12); g.box(x, 15, z + 8.4, 0.3, 9, 0.3, 0x9aa0a6); }
  for (const x of [-24, 6]) { g.cyl(x, 0, 18, 13, 26, 0xeef0f0, 20, 0xd9dcdc); g.cyl(x, 26, 18, 13, 3, 0xd9dcdc, 20, undefined, 0.75); }
  for (let k = 0; k < 6; k++) g.box(36 + (k % 3) * 6, 0, 10 + Math.floor(k / 3) * 9, 4, 6, 7, 0xa9b4bc, 0x8a9096); // 気化器
  g.box(48, 0.5, 34, 6, 1, 18, 0x8a8c8e); g.cyl(48, 1.5, 40, 0.5, 9, 0xd9622b, 6); // 桟橋と荷役の腕
  for (let x = -54; x <= 54; x += 12) g.box(x, 4, 0, 12, 0.6, 0.6, 0xc8ccd0); // 配管の架台
  fenceRect(c, 117, 87, 2, 0x8a9096, 10);
}
export function modelDesalination(c: Ctx): void {
  pad(c, 88.4, 58.4, 0xb9b5ac);
  const g = c.g;
  block(c, -22, -12, 34, 22, 2, dull(c, 0xe8eef2, 0xc8d0d6), { fh: 5, lit: 0.5, glass: 0x7fa6c0, band: 0x2b8ab8 });
  // 膜ろ過のモジュールの棚と、ろ過池・海水の取水管
  for (let k = 0; k < 5; k++) for (let j = 0; j < 3; j++) g.cyl(10 + k * 4, 0.6 + j * 1.2, -18, 0.5, 0.01, 0x2b8ab8, 8); g.box(18, 0, -18, 22, 4.4, 4, 0x9aa0a6);
  for (let k = 0; k < 3; k++) { slab(c, -24 + k * 16, 16, 13, 14, 0x9aa0a6, 1.2); slab(c, -24 + k * 16, 16, 11, 12, k === 2 ? 0x4fb3d9 : 0x3a8aa8, 1.3); }
  g.box(30, 0, 14, 3, 3, 22, 0x2b5ea8); g.cyl(30, 1.5, 26, 1.2, 1, 0x2b5ea8, 10);
  for (const x of [30, 38]) tree(c, x, -24, 0.8);
}

// ======== v44 次世代・次次世代の都市の要素 ========
export function modelHydrogenStation(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xc8c4bc);
  const g = c.g;
  g.box(0, 6, 0, 22, 0.8, 14, 0xf4f4f2, 0x2b8ab8); g.box(0, 6.8, 7.05, 22, 0.8, 0.1, 0x2b8ab8); // 屋根（水色の帯）
  for (const x of [-7, 7]) g.box(x, 0, 0, 0.6, 6, 0.6, 0xd9dcdc);
  for (const x of [-4, 4]) { g.box(x, 0, 0, 1.2, 2.2, 0.8, 0xf2f2ee); c.wa.box(x, 1.4, 0.42, 0.8, 0.5, 0.02, 0x4fd0ff); } // ディスペンサー
  for (let k = 0; k < 3; k++) g.cyl(-9 + k * 2.2, 0, -10, 0.9, 5, 0xe9ebec, 10); // 高圧の水素タンク
  sign(c, '水素', 0, 0, 5.2, 7.11, 3.4);
  car(c, 4, 3.5, false, 0xf2f2f2);
}
export function modelDroneHub(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xbfbab0);
  const g = c.g;
  block(c, -14, -2, 26, 18, 2, 0xeef1f4, { fh: 5, lit: 0.6, glass: 0x6fa0c8, band: 0x2bb673 });
  // 屋上と庭の発着パッド（H マーク）と、待機中のドローン
  for (const [x, z] of [[8, -6], [20, -6], [8, 6], [20, 6]] as [number, number][]) { slab(c, x, z, 8, 8, 0x5a5e62, 0.12); g.box(x - 1.2, 0.14, z, 0.4, 0.02, 3, 0xf2f2ee); g.box(x + 1.2, 0.14, z, 0.4, 0.02, 3, 0xf2f2ee); g.box(x, 0.14, z, 2.4, 0.02, 0.4, 0xf2f2ee);
    g.box(x, 0.3, z + 2, 1.2, 0.3, 1.2, 0xf2f2ee); for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) g.cyl(x + dx, 0.62, z + 2 + dz, 0.45, 0.04, 0x2a2a2a, 8); }
}
export function modelMobilityHub(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xc8c4bc);
  const g = c.g;
  g.box(-4, 0, -4, 14, 3.2, 8, 0x2bb673, 0xe9ebec); c.wa.box(-4, 0.3, 0.05, 12, 2.4, 0.05, 0xcfe0ea); sign(c, 'MaaS', 0, -4, 2.6, 0.1, 3);
  for (let k = 0; k < 8; k++) { const x = -10 + k * 1.3; g.box(x, 0, 6, 0.08, 0.9, 1.7, 0x2a2a2a); g.box(x, 0.85, 6.6, 0.4, 0.06, 0.06, 0xf2c230); } // シェアサイクル
  for (let k = 0; k < 5; k++) { const x = 4 + k * 1.1; g.box(x, 0.05, 6, 0.15, 0.08, 1.0, 0x2bb673); g.box(x, 0.1, 6.45, 0.06, 1.1, 0.06, 0x2a2a2a); } // 電動キックボード
  g.box(8, 0, -5, 2.6, 2.3, 5, 0xf2f2f2); c.wa.box(8, 1.2, -2.48, 2.2, 0.8, 0.04, 0x26313a); // 乗り合いの小型 EV バス
}
export function modelGridBattery(c: Ctx): void {
  pad(c, 58.4, 28.4, 0xb4b0a6);
  const g = c.g;
  for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) { const x = -22 + k * 8, z = -5 + r * 10; g.box(x, 0, z, 6, 2.9, 2.6, 0xf2f2ee, 0xd9dcdc); g.box(x, 0.4, z + 1.32, 5.4, 0.15, 0.04, 0x2bb673); g.box(x + 2.4, 2.9, z, 0.8, 0.5, 0.8, 0x9aa0a6); }
  g.box(24, 0, 0, 6, 5, 6, 0x8a9096); fenceRect(c, 57, 27, 2, 0x8a9096, 6);
}
export function modelPerovskite(c: Ctx): void {
  pad(c, 28.4, 28.4, 0xbfbab0);
  const g = c.g, h = 34;
  // 壁一面が濃い紺の発電パネルのビル（細いアルミの枠の格子）
  g.box(0, 0, -1, 18, h, 16, 0x1f2b3c, 0x2b3a50);
  for (let y = 3; y < h; y += 3.4) { g.box(0, y, 7.05, 18.1, 0.12, 0.08, 0xb9c0c8); g.box(0, y, -9.05, 18.1, 0.12, 0.08, 0xb9c0c8); }
  for (let x = -8; x <= 8; x += 2) { g.box(x, 0, 7.06, 0.08, h, 0.08, 0xb9c0c8); }
  c.wa.box(0, 0.3, 7.08, 8, 2.6, 0.05, 0xcfe0ea); // 1 階の入口
  for (let k = 0; k < 6; k++) g.box(-6 + k * 2.4, h, -1, 1.8, 0.2, 12, 0x1f2b3c); // 屋上のパネル
}
export function modelOffshoreWind(c: Ctx): void {
  pad(c, 88.4, 88.4, 0x9a9a8c);
  const g = c.g;
  // 岸の変電所と、浮体に載った大きな風車 3 基（海側に並ぶ）
  g.box(-30, 0, -30, 14, 8, 10, 0xd9dcdc, 0x8a9096); for (const x of [-34, -26]) g.box(x, 8, -30, 0.4, 6, 0.4, 0x8a9096);
  for (const [x, z] of [[-8, 8], [16, -12], [20, 14]] as [number, number][]) {
    for (const [dx, dz] of [[-4, -4], [4, -4], [0, 4.6]]) g.cyl(x + dx, -1, z + dz, 1.6, 2.4, 0xd9622b, 10); g.box(x, 0.8, z, 9, 0.6, 0.8, 0xd9dcdc); // 浮体
    turbine(c, x, z, 30, 0.5, 0.2);
  }
}
export function modelSmr(c: Ctx): void {
  pad(c, 88.4, 88.4, 0xc0bdb4);
  const g = c.g;
  // 小さな円筒の建屋（6 基のモジュール）と、タービン建屋・冷却塔なし（空冷）
  for (let k = 0; k < 6; k++) { const x = -26 + (k % 3) * 14, z = -16 + Math.floor(k / 3) * 16; g.cyl(x, 0, z, 5, 16, 0xeef0f2, 16); g.blob(x, 16, z, 5, 3, 5, 0xe2e6ea, 12); }
  g.box(24, 0, -8, 22, 18, 26, 0xf2f2ee, 0x9aa0a6); c.wa.box(24, 4, 5.05, 18, 1.2, 0.05, 0xcfe0ea); sign(c, '原子力', 0, 24, 13, 5.1, 6);
  fenceRect(c, 87, 87, 3, 0x8a9096, 10); g.box(0, 0, 38, 20, 6, 6, 0x8a9096);
}
export function modelLogiTunnel(c: Ctx): void {
  pad(c, 58.4, 58.4, 0xb4b0a6);
  const g = c.g;
  // 地下トンネルの坑口（斜めに下がる）と、無人カートの荷さばき場
  g.box(-10, 0, -10, 34, 12, 30, 0xeef1f4, 0x9aa0a6); c.wa.box(-10, 0.6, 5.05, 30, 3.4, 0.05, 0xcfe0ea);
  for (const x of [14, 22]) { g.box(x, -2, 6, 6, 6, 40, 0x6a6e72); g.box(x, -2, 6, 5, 5.2, 40.2, 0x2a2c30); }
  for (let k = 0; k < 6; k++) { const z = -20 + k * 7; g.box(14, 0.1, z, 1.6, 1.2, 2.6, 0xf2c230); g.box(22, 0.1, z + 3, 1.6, 1.2, 2.6, 0x2bb673); } // 無人カート
  sign(c, '物流', 0, -10, 9, 5.1, 5);
}
export function modelSpaceSolar(c: Ctx): void {
  pad(c, 148.4, 148.4, 0x9aa080);
  const g = c.g;
  // 受電アンテナ（レクテナ）：広い網の板を少し傾けて並べる。中央に変電所と管制塔
  for (let r = -5; r <= 5; r++) for (let k = -5; k <= 5; k++) { if (Math.hypot(r, k) > 5.6 || (Math.abs(r) < 1 && Math.abs(k) < 1)) continue; const x = k * 12, z = r * 12;
    g.box(x, 0, z, 0.3, 1.6, 0.3, 0x8a9096); g.quad([x - 5, 1.2, z + 4], [x + 5, 1.2, z + 4], [x + 5, 2.6, z - 4], [x - 5, 2.6, z - 4], 0x3a4a5a); }
  g.box(0, 0, 0, 16, 10, 16, 0xf2f2ee, 0x9aa0a6); g.box(0, 10, 0, 4, 22, 4, 0xe9ebec); g.cyl(0, 32, 0, 5, 0.6, 0xe9ebec, 16); c.wa.box(0, 26, 2.05, 3, 2, 0.05, 0x4fd0ff);
}
export function modelSpaceElevator(c: Ctx): void {
  pad(c, 148.4, 148.4, 0xc8c2b6);
  const g = c.g;
  // 海に浮かぶ円形の地上局と、空へまっすぐ伸びるケーブル（上は雲の上まで）、昇降機のクライマー
  g.cyl(0, 0, 0, 40, 6, 0xeef0f2, 32, 0xd9dcdc); g.cyl(0, 6, 0, 30, 10, 0xf4f4f2, 32, 0xe2e6ea); g.cyl(0, 16, 0, 12, 14, 0xe9ebec, 24);
  c.wa.box(0, 8, 30.05, 30, 4, 0.05, 0xcfe0ea);
  g.cyl(0, 30, 0, 0.8, 600, 0xd9dcdc, 8); c.wa.box(0, 600, 0, 2, 2, 2, 0xff3030);
  for (const y of [60, 180, 340]) { g.cyl(0, y, 0, 4, 6, 0xf2f2ee, 12); c.wa.box(0, y + 2, 4.05, 3, 1, 0.05, 0xcfe0ea); }
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.box(Math.cos(a) * 34, 6, Math.sin(a) * 34, 3, 3, 3, 0x2b8ab8); }
  sign(c, '宇宙', 0, 0, 12, 30.1, 10);
}

// ---- v48 観光SLと水上交通 ----
/** 蒸気機関車（向きは x 軸。長さ約 16m） */
function steamLoco(c: Ctx, x: number, y: number, z: number): void {
  const g = c.g;
  obox(c, x + 1.5, y + 2.6, z, [1, 0, 0], [0, 1, 0], [0, 0, 1], 5.2, 1.25, 1.25, 0x1b1b1d); // ボイラー
  g.box(x + 6.8, y + 1.2, z, 0.4, 2.8, 2.6, 0x2a2a2c); g.box(x + 6.9, y + 2.5, z, 0.1, 0.8, 0.8, 0x9a9a92); // 煙室の扉
  g.cyl(x + 5.4, y + 3.8, z, 0.45, 1.6, 0x151515, 8, undefined, 0.6); // 煙突
  g.blob(x + 1.5, y + 4.0, z, 0.8, 0.5, 0.7, 0x1b1b1d, 6); // 蒸気溜め
  g.box(x - 4.6, y + 1.0, z, 3.4, 3.8, 2.9, 0x1b1b1d); c.wa.box(x - 4.6, y + 3.4, 1.46 + z, 1.4, 0.8, 0.02, 0xffd890); c.wa.box(x - 4.6, y + 3.4, z - 1.46, 1.4, 0.8, 0.02, 0xffd890); // 運転室
  g.box(x - 4.6, y + 4.8, z, 3.8, 0.2, 3.2, 0x111111);
  g.box(x - 8.6, y + 0.9, z, 4.2, 2.4, 2.7, 0x1b1b1d); g.box(x - 8.6, y + 3.3, z, 3.8, 0.4, 2.3, 0x2b2622); // 炭水車
  for (const dx of [-1.6, 1.0, 3.6]) for (const s of [-1, 1]) g.cyl(x + dx, y + 0.0, z + s * 1.2, 1.0, 0.2, 0x7a1f1f, 10); // 動輪（赤）
  g.box(x + 1.0, y + 0.9, z, 7.5, 0.25, 2.8, 0x1b1b1d); g.box(x + 6.6, y + 2.6, z, 0.05, 0.5, 0.5, 0xffffff); c.wa.box(x + 6.96, y + 2.6, z, 0.02, 0.45, 0.45, 0xfff2c0); // 前照灯
  g.box(x + 6.0, y + 2.2, z + 1.3, 0.1, 0.5, 0.05, 0xc8a24a); g.box(x + 6.0, y + 2.2, z - 1.3, 0.1, 0.5, 0.05, 0xc8a24a); // 真鍮の飾り
}
/** 観光SLの機関区：転車台と扇形庫と、転車台の上のSL */
export function modelSlDepot(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0x8b857a);
  const tx = 18, tz = 6;
  g.cyl(tx, -0.6, tz, 14, 0.7, 0x5c5850, 24); g.cyl(tx, 0.05, tz, 13.2, 0.12, 0x4a4640, 24); // 転車台のピット
  g.box(tx, 0.2, tz, 27, 0.5, 3.0, 0x3a3a3c); for (const s of [-0.75, 0.75]) g.box(tx, 0.5, tz + s, 27, 0.12, 0.14, 0xa8adb2); // 回る桁と線路
  g.box(tx + 13, 0.2, tz + 2.4, 1.6, 2.2, 1.6, 0x6b6560); // 運転小屋
  // 扇形庫（放射状の線路と、レンガの車庫）
  for (let k = 0; k < 6; k++) { const a = Math.PI * (0.64 + k * 0.145), ca = Math.cos(a), sa = Math.sin(a);
    obox(c, tx + ca * 21, 0.15, tz + sa * 21, [ca, 0, sa], [0, 1, 0], [-sa, 0, ca], 7, 0.1, 1.3, 0x6b5a48);
    obox(c, tx + ca * 30, 4.5, tz + sa * 30, [ca, 0, sa], [0, 1, 0], [-sa, 0, ca], 7, 4.5, 3.3, 0x9a4a32);
    obox(c, tx + ca * 23.1, 3.0, tz + sa * 23.1, [ca, 0, sa], [0, 1, 0], [-sa, 0, ca], 0.08, 3.0, 2.0, 0x2a2622);
    obox(c, tx + ca * 30, 9.3, tz + sa * 30, [ca, 0, sa], [0, 1, 0], [-sa, 0, ca], 7.4, 0.3, 3.5, 0x4a4a4c); }
  steamLoco(c, tx - 1, 0.7, tz);
  // 給水塔と給炭台
  g.cyl(-30, 0, 18, 0.25, 6, 0x5a4a3a, 6); g.cyl(-27, 0, 18, 0.25, 6, 0x5a4a3a, 6); g.cyl(-28.5, 6, 18, 2.4, 3.2, 0x6b5a48, 12);
  g.box(-32, 0, -14, 8, 3, 5, 0x3a3532); g.box(-32, 3, -14, 8.4, 0.4, 5.4, 0x1a1a1a);
  g.box(-20, 0, -18, 16, 6, 9, 0xe8e0cc, 0x7a2f2a); c.wa.box(-20, 2, -13.45, 12, 2, 0.05, 0xffe2a8); sign(c, 'SL', 0, -20, 6.4, -13.4, 4);
}
/** 水の切り欠き（船の泊まる所）：pad の手前側を水色にする */
function slip(c: Ctx, sx: number, z0: number, z1: number): void { c.g.box(0, -0.4, (z0 + z1) / 2, sx - 0.4, 0.55, z1 - z0, 0x3d6f8f); c.g.box(0, 0.0, z0, sx, 0.5, 0.8, 0xbab4a8); for (const e of [-1, 1]) c.g.box(e * (sx / 2 - 0.3), 0, (z0 + z1) / 2, 0.6, 0.5, z1 - z0, 0xbab4a8); } // 水面と、石の護岸
/** 水上バスの船着き場：ガラスの待合所と浮き桟橋と、平たい未来的な水上バス */
export function modelWaterBus(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 28.4, 0xcfc9bd); slip(c, 58.4, 1, 14.2);
  g.box(-12, 0, -7, 22, 4.2, 10, 0xeef2f4, 0x2a6aa0); c.wa.box(-12, 0.6, -1.95, 20, 3, 0.05, 0x9fd0ec); g.box(-12, 4.2, -7, 24, 0.4, 12, 0xd8dde0);
  g.box(8, 0.05, 5, 30, 0.35, 4, 0x9a8f80); g.box(-2, 0.05, 2.2, 3, 0.3, 5, 0x9a8f80); // 浮き桟橋
  // 水上バス（低く平たい銀色の船体＋青いガラス）
  g.blob(8, 0.1, 10, 13, 1.1, 2.6, 0xdfe4e8, 10); g.blob(8, 1.1, 10, 9, 1.1, 2.0, 0x5c7f9a, 10); c.wa.box(8, 1.4, 12.05, 12, 0.6, 0.02, 0xa8dcff); c.wa.box(8, 1.4, 7.95, 12, 0.6, 0.02, 0xa8dcff);
  sign(c, '水上バス', 0, -12, 4.7, -1.85, 5);
}
/** 遊覧船の乗り場：切符売り場と桟橋と、白い2階建ての遊覧船 */
export function modelCruisePier(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xd2ccc0); slip(c, 58.4, 4, 29.2);
  block(c, -12, -16, 24, 14, 2, 0xf4efe6, { fh: 4, lit: 0.6, glass: 0x8fb8d0, band: 0x1f6fb2 });
  g.box(0, 0.05, 6, 40, 0.4, 3.2, 0x8a7a66); for (let k = 0; k < 6; k++) g.cyl(-18 + k * 7.2, -0.4, 7.7, 0.2, 1.5, 0x5a4a3a, 5);
  // 遊覧船（白い船体・2層の客室・上のデッキ）
  g.blob(0, 0.0, 16, 22, 1.8, 5.2, 0xf6f6f2, 12); g.box(0, 0.0, 16, 34, 1.4, 8.6, 0x1f4f8a);
  g.box(-1, 1.4, 16, 28, 2.6, 7.6, 0xf4f4f0); c.wa.box(-1, 2.0, 19.85, 26, 1.4, 0.02, 0xffe8b8); c.wa.box(-1, 2.0, 12.15, 26, 1.4, 0.02, 0xffe8b8);
  g.box(-3, 4.0, 16, 18, 2.2, 6.4, 0xf4f4f0); c.wa.box(-3, 4.5, 19.25, 16, 1.2, 0.02, 0xffe8b8); c.wa.box(-3, 4.5, 12.75, 16, 1.2, 0.02, 0xffe8b8);
  g.box(-3, 6.2, 16, 18.6, 0.2, 7, 0x2a6aa0); for (let k = 0; k < 8; k++) c.wa.box(-11 + k * 2.6, 6.6, 16, 0.25, 0.25, 0.25, [0xff6a6a, 0xffe06a, 0x6affb0, 0x6ab8ff][k % 4]); // デッキの電飾
  g.cyl(10, 4.0, 16, 0.5, 3.4, 0x1f4f8a, 8);
  sign(c, '遊覧船', 0, -12, 8.6, -8.9, 5);
}
/** 屋形船の船宿：木造の宿と提灯と、屋根付きの屋形船（夜は提灯が灯る） */
export function modelYakatabune(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 28.4, 0xbcb3a2); slip(c, 58.4, 1, 14.2);
  g.box(-14, 0, -7, 20, 4.6, 9, 0x6b4a32, 0x3a2a20); c.wa.box(-14, 0.8, -2.45, 16, 2.6, 0.05, 0xffd49a);
  g.gable(-14, 4.6, -7, 20, 9, 2.4, 0x3a3e44, 'x', 0x6b4a32, 0.8);
  for (let k = 0; k < 5; k++) c.wa.box(-21 + k * 3.5, 3.7, -2.3, 0.7, 0.9, 0.7, 0xff5a2a); // 赤提灯
  g.box(10, 0.05, 2.4, 3, 0.3, 4, 0x8a7a66);
  // 屋形船（木の船体と、障子の窓の客室、黒い屋根、提灯）
  g.blob(6, 0.0, 9.5, 14, 1.0, 3.0, 0x5a3a24, 10); g.box(6, 0.6, 9.5, 20, 2.4, 5.0, 0xf2e6cc, 0x6b4a32);
  c.wa.box(6, 1.2, 12.05, 18, 1.3, 0.02, 0xffe0a0); c.wa.box(6, 1.2, 6.95, 18, 1.3, 0.02, 0xffe0a0);
  g.box(6, 3.0, 9.5, 21.5, 0.4, 6.0, 0x2a2a2c);
  for (let k = 0; k < 8; k++) { c.wa.box(-3.5 + k * 2.7, 2.5, 12.3, 0.5, 0.65, 0.5, 0xff4a2a); c.wa.box(-3.5 + k * 2.7, 2.5, 6.7, 0.5, 0.65, 0.5, 0xff4a2a); }
  sign(c, '屋形船', 0, -14, 5.6, -2.35, 5);
}

// ---- v49 農業・畜産・漁業・林業 ----
/** 切妻屋根の建物（ridge が x 軸か z 軸） */
function barn(c: Ctx, x: number, z: number, w: number, d: number, h: number, wall: number, roof: number, ax: 'x' | 'z' = 'x', rh = Math.min(w, d) * 0.28): void { c.g.box(x, 0, z, w, h, d, wall); c.g.gable(x, h, z, w, d, rh, roof, ax, wall, 0.4); }
/** サイロ（円筒と丸屋根） */
function silo(c: Ctx, x: number, z: number, r: number, h: number, col = 0xd8d4c8, top = 0x8a939c): void { c.g.cyl(x, 0, z, r, h, col, 12); c.g.blob(x, h, z, r, r * 0.55, r, top, 8); }
/** 動物（体・頭・脚）。along で向き（x か z） */
function beast(c: Ctx, x: number, z: number, along: boolean, s: number, body: number, head: number, spot?: number): void {
  const g = c.g, L = 1.0 * s, Wd = 0.42 * s, Ht = 0.48 * s, y = 0.62 * s + Ht * 0.6;
  g.blob(x, y, z, along ? L : Wd, Ht, along ? Wd : L, body, 6);
  if (spot !== undefined) g.blob(x + (along ? 0.2 * s : 0.15 * s), y + 0.12 * s, z + (along ? 0.15 * s : 0.2 * s), 0.35 * s, 0.3 * s, 0.32 * s, spot, 5);
  g.blob(x + (along ? L * 1.05 : 0), y + 0.25 * s, z + (along ? 0 : L * 1.05), 0.3 * s, 0.28 * s, 0.3 * s, head, 5);
  for (const a of [-0.6, 0.6]) for (const b of [-0.6, 0.6]) g.box(x + (along ? a * L : b * Wd), 0, z + (along ? b * Wd : a * L), 0.14 * s, 0.7 * s, 0.14 * s, head);
}
function cows(c: Ctx, x0: number, z0: number, sx: number, sz: number, n: number, kind: 0 | 1 | 2 | 3): void {
  for (let i = 0; i < n; i++) { const x = x0 + (c.rnd() - 0.5) * sx, z = z0 + (c.rnd() - 0.5) * sz, al = c.rnd() < 0.5;
    if (kind === 0) beast(c, x, z, al, 1.5, 0xf4f2ec, 0x2a2a2a, 0x1e1e1e); // ホルスタイン
    else if (kind === 1) beast(c, x, z, al, 1.5, 0x2a2420, 0x221c18); // 黒毛和牛
    else if (kind === 2) beast(c, x, z, al, 1.6, [0x6a3e22, 0x3a2414, 0xb08a6a][i % 3], 0x2a1a10); // 馬
    else beast(c, x, z, al, 0.9, 0xe8b4a8, 0xd89a90); } // 豚
}
function rail(c: Ctx, x: number, z: number, sx: number, sz: number, col = 0xe8e2d4): void { // 牧柵（2 段の横木と柱）
  const g = c.g; for (const y of [0.5, 1.0]) { g.box(x, y, z - sz / 2, sx, 0.1, 0.1, col); g.box(x, y, z + sz / 2, sx, 0.1, 0.1, col); g.box(x - sx / 2, y, z, 0.1, 0.1, sz, col); g.box(x + sx / 2, y, z, 0.1, 0.1, sz, col); }
  for (let t = 0; t <= sx; t += 4) { g.box(x - sx / 2 + t, 0, z - sz / 2, 0.16, 1.2, 0.16, col); g.box(x - sx / 2 + t, 0, z + sz / 2, 0.16, 1.2, 0.16, col); }
  for (let t = 0; t <= sz; t += 4) { g.box(x - sx / 2, 0, z - sz / 2 + t, 0.16, 1.2, 0.16, col); g.box(x + sx / 2, 0, z - sz / 2 + t, 0.16, 1.2, 0.16, col); }
}
/** ビニールハウス（かまぼこ形を細い切妻で近似した白い膜） */
function hoop(c: Ctx, x: number, z: number, w: number, d: number, col = 0xe9eef0): void { c.g.box(x, 0, z, w, 1.6, d, col); c.g.gable(x, 1.6, z, w, d, w * 0.32, col, 'z', col, 0.05); }
/** 飼料タンク（脚の上の円筒と、円すいの底） */
function feedTank(c: Ctx, x: number, z: number, col = 0xc9ccd0): void { const g = c.g; for (const a of [-0.8, 0.8]) for (const b of [-0.8, 0.8]) g.box(x + a, 0, z + b, 0.15, 2.4, 0.15, 0x7a7f86); g.cyl(x, 2.0, z, 0.15, 1.2, col, 8, undefined, 1.1); g.cyl(x, 3.2, z, 1.1, 4.0, col, 10); g.blob(x, 7.2, z, 1.1, 0.4, 1.1, col, 8); }

/** 養鶏場：窓のない長い鶏舎（ウインドウレス）と飼料タンク、たまごの集卵場 */
export function modelPoultry(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0x9a9070);
  for (let k = 0; k < 4; k++) { const z = -20 + k * 11; barn(c, -6, z, 64, 8, 3.2, 0xe6e2d6, 0x6f7a84, 'x', 1.4); for (let f = 0; f < 4; f++) g.box(-34.2, 0.8, z - 2.4 + f * 1.6, 0.4, 1.2, 1.2, 0x5a5f66); feedTank(c, 30, z + 1); }
  barn(c, 36, 22, 12, 10, 4, 0xf0ece0, 0x8a3a2a); c.wa.box(36, 1.2, 27.05, 8, 1.6, 0.05, 0xfff0c8); standSign(c, '鶏卵', 30, 28, 1.2, 3);
  for (let i = 0; i < 14; i++) g.blob(-30 + c.rnd() * 30, 0.35, 25 + c.rnd() * 3, 0.32, 0.3, 0.26, 0xf6f4ee, 5); // 放し飼いの一角
}
/** 養豚場：低い豚舎と浄化槽、運動場の豚 */
export function modelPigFarm(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0x8f8466);
  for (let k = 0; k < 3; k++) barn(c, -8, -18 + k * 11, 38, 8, 2.6, 0xd8d2c2, 0x5e6a74, 'x', 1.2);
  g.cyl(20, -0.2, -16, 5, 1.4, 0x7a7f86, 14); g.cyl(20, 1.15, -16, 4.6, 0.1, 0x5a6670, 14); g.cyl(20, -0.2, -4, 4, 1.4, 0x7a7f86, 14); // 浄化槽
  slab(c, -6, 21, 40, 12, 0x7a6a4a, 0.08); rail(c, -6, 21, 40, 12, 0x9a9a92); cows(c, -6, 21, 34, 9, 9, 3); feedTank(c, 22, 10);
}
/** 肉牛の牧場：黒毛和牛の牛舎と放牧地 */
export function modelBeefRanch(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0x7fa056);
  barn(c, -28, -16, 26, 14, 4, 0x8a6a4a, 0x4a4f56, 'x', 2.4); g.box(-28, 0.05, -7.5, 24, 0.1, 3, 0x7a6a4a);
  rail(c, 14, 4, 56, 44); cows(c, 14, 4, 50, 38, 14, 1); for (let i = 0; i < 6; i++) g.cyl(-28 + i * 4, 0, 12, 0.6, 0.9, 0xd9d0b0, 8); // ロールベール（干し草）
  silo(c, -36, 6, 2.6, 10); g.box(-20, 0, 8, 6, 1.0, 3, 0x7a8a96); // 水槽
}
/** 酪農牧場：赤い牛舎・サイロ・搾乳場と、白黒のホルスタイン */
export function modelDairy(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0x86a85a);
  barn(c, -24, -14, 30, 14, 4.6, 0xa83a2a, 0x3e4248, 'x', 3.6); g.box(-24, 0.8, -6.95, 6, 3.2, 0.05, 0xf4f0e6); // 赤い牛舎と白い戸
  silo(c, -4, -18, 3.2, 14, 0xd8d4c8); silo(c, 3, -18, 3.2, 14, 0xd8d4c8); barn(c, -34, 10, 12, 10, 3.4, 0xf0ece0, 0x6a7680, 'z'); standSign(c, '牧場', -26, 18, 1.2, 3.2);
  rail(c, 18, 6, 48, 40); cows(c, 18, 6, 42, 34, 12, 0); g.box(36, 0, -22, 3, 1.2, 1.2, 0xc8c8c0); // 生乳の集乳タンク
  for (let i = 0; i < 5; i++) g.blob(-14 + i * 3, 0.9, 20, 0.9, 0.9, 0.9, 0xf0f0f0, 7); // ラップの牧草（白い玉）
}
/** 馬の牧場：厩舎・角馬場・放牧地の馬 */
export function modelHorseFarm(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0x86a85a);
  barn(c, -28, -18, 28, 10, 3.6, 0xf2ede0, 0x2f5a3a, 'x', 2.2); for (let k = 0; k < 6; k++) g.box(-39 + k * 4.4, 0.6, -12.95, 2.2, 2.4, 0.05, 0x6a4a32);
  slab(c, -26, 10, 26, 20, 0xc9b08a, 0.08); rail(c, -26, 10, 26, 20, 0xf4f4f0); // 角馬場（砂）
  rail(c, 20, 0, 46, 50, 0xf4f4f0); cows(c, 20, 0, 40, 44, 8, 2); g.box(38, 3.0, -22, 0.4, 0.4, 0.4, 0xffffff);
}
/** 茶畑：かまぼこ形の茶の畝が等高線のように並ぶ。防霜ファン */
export function modelTeaField(c: Ctx): void {
 const sv0_ = c.g.surfv; c.g.surfv = -2; // 作物は季節の桜色・紅葉にしない
  const g = c.g; pad(c, 58.4, 58.4, 0x7a6a4a);
  for (let r = 0; r < 14; r++) { const z = -25 + r * 3.8, bend = Math.sin(r * 0.5) * 2; g.blob(bend, 0.6, z, 26, 0.75, 1.3, r % 2 ? 0x3f7a36 : 0x4a8a3c, 10); }
  for (let k = 0; k < 4; k++) { const x = -20 + k * 13, z = -10 + (k % 2) * 16; g.cyl(x, 0, z, 0.12, 6, 0x9aa0a6, 5); g.box(x, 6, z, 1.6, 0.25, 0.2, 0x5a5f66); } // 防霜ファン
  c.g.surfv = sv0_;
}
/** 果樹園：りんご（赤）・みかん（橙）・ぶどう棚 */
export function modelOrchard(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0x7f9a52);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { const x = -24 + i * 6, z = -24 + j * 8, fr = j < 2 ? 0xd8342a : 0xf08a1a; g.cyl(x, 0, z, 0.2, 1.4, 0x6a4a32, 5); g.blob(x, 2.4, z, 2.2, 1.3, 2.2, 0x4f8a3a, 6); for (let k = 0; k < 5; k++) g.blob(x + (c.rnd() - 0.5) * 3.2, 1.8 + c.rnd() * 1.4, z + (c.rnd() - 0.5) * 3.2, 0.25, 0.25, 0.25, fr, 4); }
  for (let i = 0; i < 12; i++) g.box(-8, 2.0, 10 + i * 1.5, 40, 0.06, 0.8, 0x5a8a3a); // ぶどう棚（すき間のある葉） for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) g.box(-26 + i * 7.2, 0, 10 + j * 8, 0.15, 2.0, 0.15, 0x8a8a82); // ぶどう棚
  for (let k = 0; k < 30; k++) g.blob(-26 + c.rnd() * 36, 1.6, 10 + c.rnd() * 16, 0.3, 0.45, 0.3, 0x5a2a6a, 4);
  barn(c, 22, 22, 10, 8, 3, 0xe6dcc8, 0x8a3a2a); standSign(c, '果樹', 16, 26, 1.0, 2.6);
}
/** ビニールハウス群（いちご・トマト） */
export function modelGreenhouse(c: Ctx): void { pad(c, 58.4, 58.4, 0x8a7a5a); for (let k = 0; k < 6; k++) hoop(c, -22 + k * 8.8, -2, 7.2, 46); c.g.box(22, 0, 26, 6, 2.6, 4, 0x9aa3ac); }
/** 植物工場：窓のない白い建屋の中で LED 栽培（夜は紫の光がもれる） */
export function modelPlantFactory(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xbab6ac);
  g.box(-4, 0, -4, 44, 9, 36, 0xf2f4f4, 0xdfe3e6); c.wa.box(-4, 3, 14.05, 40, 1.4, 0.05, 0xd27aff); c.wa.box(17.95, 3, -4, 0.05, 1.4, 30, 0xd27aff);
  for (let k = 0; k < 8; k++) g.box(-22 + k * 5.4, 9, -4, 3.2, 0.12, 34, 0x2a3a5a); // 屋上の太陽光
  g.box(24, 0, 20, 6, 3, 6, 0x9aa3ac); sign(c, '植物工場', 0, -4, 6.2, 14.06, 7);
}
/** 花き農園：色とりどりの花の畝とガラス温室 */
export function modelFlowerFarm(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0x7a6a4a);
  const cols = [0xe84a6a, 0xf6d23a, 0xffffff, 0xb05ad8, 0xf08a2a, 0xe8a0c8];
  for (let r = 0; r < 10; r++) { g.box(-10, 0.05, -24 + r * 3.2, 32, 0.35, 2.0, 0x4f8a3a); for (let k = 0; k < 16; k++) g.blob(-25 + k * 2, 0.55, -24 + r * 3.2, 0.6, 0.3, 0.6, cols[r % cols.length], 4); }
  g.box(18, 0, 14, 16, 4, 22, 0xd8eef0); g.gable(18, 4, 14, 16, 22, 2.4, 0xcfe6ea, 'z', 0xd8eef0, 0.1);
}
/** しいたけ栽培：杉林の木陰に並ぶほだ木 */
export function modelShiitake(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 28.4, 0x5f6a3e);
  for (let i = 0; i < 12; i++) tree(c, -26 + i * 4.7, -10 + (i % 2) * 3, 1.1, 1);
  for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) { const x = -22 + r * 8 + k * 0.6, z = 4; obox(c, x, 0.9, z, [0, 0.35, 0.94], [0, 0.94, -0.35], [1, 0, 0], 2.6, 0.18, 0.18, 0x6a5440); }
  barn(c, 20, 8, 10, 7, 2.8, 0x8a6a4a, 0x3f4a3a);
}
/** 竹林 */
export function modelBamboo(c: Ctx): void {
 const sv0_ = c.g.surfv; c.g.surfv = -2; // 作物は季節の桜色・紅葉にしない
  const g = c.g; pad(c, 58.4, 58.4, 0x6f7a3e);
  for (let i = 0; i < 220; i++) { const x = (c.rnd() - 0.5) * 54, z = (c.rnd() - 0.5) * 54, h = 11 + c.rnd() * 7, lean = (c.rnd() - 0.5) * 1.2; g.cyl(x, 0, z, 0.13, h, c.rnd() < 0.5 ? 0x8ab05a : 0x6f9f48, 5, undefined, 0.08); for (let k = 0; k < 3; k++) g.blob(x + lean * (0.6 + k * 0.2), h * (0.62 + k * 0.15), z + lean * 0.3, 0.7, 0.9, 0.7, k % 2 ? 0x7ab04e : 0x5f9a42, 4); } // 細い稈と、上のほうの小さな葉のかたまり
  for (let i = 0; i < 12; i++) slab(c, -27 + i * 4.6, Math.sin(i * 0.6) * 6, 4.8, 1.8, 0xb8a47a, 0.06); // 小径
  c.g.surfv = sv0_;
}
/** JA のライスセンター：カントリーエレベーター（背の高いサイロ群）と乾燥・精米の建屋 */
export function modelRiceCenter(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xb4b0a6);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) silo(c, -30 + i * 7.2, -16 + j * 7.2, 3.4, 24, 0xe6e2d8, 0xc8c4ba);
  g.box(-19, 24, -12.4, 30, 5, 3, 0xd8d4c8); // 上の搬送路
  block(c, 18, -8, 34, 24, 3, 0xece8de, { fh: 4.2, lit: 0.15, glass: 0x7a8a96, band: 0x2a7a3a });
  g.box(18, 0, 20, 36, 5, 10, 0x9aa3ac, 0x7a838c); standSign(c, 'JA', 2, 26, 1.6, 4);
}
/** 堆肥センター：屋根付きの発酵槽と、たい肥の山 */
export function modelCompost(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0x9a8f78);
  g.box(-6, 0, -6, 40, 6, 26, 0x9aa3ac); g.gable(-6, 6, -6, 40, 26, 3, 0x6a737c, 'x', 0x9aa3ac, 0.6); for (let k = 0; k < 5; k++) g.blob(-22 + k * 8, 0.8, -6, 3.4, 1.6, 9, 0x4a3a28, 6);
  for (let k = 0; k < 3; k++) g.blob(-18 + k * 12, 1.2, 18, 4, 2.4, 3.4, 0x5a4630, 7); g.box(20, 0, 20, 5, 2.6, 3, 0xe8b23a); // ホイールローダー
}
/** 酒蔵：なまこ壁の土蔵・杉玉・煙突 */
export function modelSakeBrewery(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xbcb3a2);
  barn(c, -10, -12, 34, 14, 7, 0xf2efe6, 0x2f3438, 'x', 3.2); for (let k = 0; k < 8; k++) g.box(-26 + k * 4.4, 0, -4.95, 3.0, 2.2, 0.05, 0x3a3e44); // なまこ壁（下の黒い腰壁）
  barn(c, 14, 10, 14, 18, 6, 0xf2efe6, 0x2f3438, 'z', 3);
  g.cyl(-24, 0, 6, 0.9, 16, 0x8a3a2a, 8, undefined, 0.7); g.blob(-2, 4.4, -4.6, 0.9, 0.9, 0.9, 0x6a7a3a, 7); // 煙突と杉玉
  g.box(-8, 0, 16, 18, 4, 9, 0x6b4a32); c.wa.box(-8, 1, 20.55, 14, 2, 0.05, 0xffe0a8); sign(c, '酒蔵', 0, -8, 4.3, 20.56, 5); // 直売所
}
/** 醤油・味噌蔵：黒い板張りの蔵と、大きな木桶 */
export function modelSoyBrewery(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xb4ab9a);
  barn(c, -8, -10, 36, 16, 6.5, 0x2e2a26, 0x3a3e44, 'x', 3); g.box(-8, 4.4, -1.95, 34, 1.2, 0.05, 0xf2efe6);
  for (let k = 0; k < 4; k++) { g.cyl(-22 + k * 7, 0, 14, 2.6, 4, 0x8a6a42, 12); for (const y of [1, 3]) g.cyl(-22 + k * 7, y, 14, 2.7, 0.3, 0x3a3e44, 12); }
  barn(c, 18, 14, 12, 10, 4, 0xe6dcc8, 0x3a3e44); sign(c, '醤油', 0, -8, 3.2, -1.9, 4.4);
}
/** 製茶工場 */
export function modelTeaFactory(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 28.4, 0xb4ae9e);
  block(c, -6, -2, 34, 18, 2, 0xece6d6, { fh: 4, lit: 0.2, glass: 0x7a8a96, band: 0x3f7a36 }); g.cyl(16, 0, -6, 0.7, 12, 0x9aa0a6, 8);
  for (let k = 0; k < 4; k++) g.box(18 + k * 0, 0, 6, 6, 2, 3, 0x5a8a4a); sign(c, '製茶', 0, -6, 8.4, 7.05, 4.5);
}
/** 養殖いかだ：水面の竹いかだ（牡蠣・のり）と作業小屋 */
export function modelAquaRaft(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xbab4a8); slip(c, 58.4, -14, 29.2);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const x = -18 + i * 18, z = 2 + j * 13; for (let k = 0; k < 6; k++) { g.box(x, 0.12, z - 5 + k * 2, 14, 0.25, 0.3, 0xb89a5a); g.box(x - 6 + k * 2.4, 0.12, z, 0.3, 0.25, 11, 0xb89a5a); } for (let k = 0; k < 4; k++) g.cyl(x - 5 + k * 3.4, 0.0, z + 5.6, 0.45, 0.6, 0x2a2a2a, 8); }
  barn(c, -14, -21, 18, 9, 3.4, 0xd8d2c2, 0x4a6a8a); g.blob(16, 0.3, -22, 4, 0.8, 1.6, 0xf2f2ee, 6); // 作業船
}
/** 陸上養殖場：屋内の水槽が並ぶ建屋と、屋外の円形水槽 */
export function modelLandAqua(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xb8b4ac);
  g.box(-8, 0, -12, 38, 7, 28, 0xe8ecee, 0x9aa8b2); c.wa.box(-8, 2.4, 2.05, 34, 1.4, 0.05, 0x9fd0ec);
  for (let k = 0; k < 4; k++) { g.cyl(-20 + k * 9, 0, 18, 3.6, 1.6, 0x8a9aa6, 14); g.cyl(-20 + k * 9, 1.5, 18, 3.3, 0.12, 0x2a6a8a, 14); }
  g.box(22, 0, 0, 6, 4, 10, 0x9aa3ac);
}
/** 養魚場（うなぎ・鮎）：細長い池と水車 */
export function modelFishFarm(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0x9a9078);
  for (let k = 0; k < 4; k++) { const z = -20 + k * 11; g.box(-4, 0, z, 46, 0.5, 8, 0x8a8a82); slab(c, -4, z, 44, 6.6, 0x3d6f6a, 0.6); g.cyl(-20 + k * 10, 0.6, z, 0.9, 0.3, 0xe8e8e0, 8); }
  barn(c, 24, 18, 8, 10, 3, 0xd8d2c2, 0x4a5a6a, 'z');
}
/** 定置網の番屋：浜の作業小屋・網干し場・漁船 */
export function modelSetNet(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 28.4, 0xc9bc9a); slip(c, 58.4, 2, 14.2);
  barn(c, -16, -7, 18, 9, 4, 0x6b5a48, 0x3a3e44); for (let k = 0; k < 5; k++) g.box(8 + k * 4, 0, -8, 0.15, 2.4, 0.15, 0x6b5a48); g.box(16, 1.2, -8, 18, 1.2, 0.05, 0x2a4a3a); // 網干し
  g.blob(0, 0.2, 8.5, 7, 0.9, 1.8, 0xf2f0e8, 8); g.box(-2, 1.0, 8.5, 2.4, 1.6, 2.2, 0xf6f6f2); g.box(-2, 2.6, 8.5, 0.12, 2, 0.12, 0x5a5a58);
}
/** 魚の加工場（水産加工） */
export function modelFishProcess(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xbab6ac);
  block(c, -14, -6, 52, 30, 2, 0xe8ecee, { fh: 5, lit: 0.25, glass: 0x7a8a96, band: 0x1f6fb2 });
  for (let k = 0; k < 5; k++) g.box(-34 + k * 9, 0, 14, 6, 3.2, 0.3, 0x5a6a7a); g.box(26, 0, -12, 10, 3, 8, 0x9aa3ac); g.cyl(26, 3, -12, 0.5, 6, 0x9aa0a6, 8);
  sign(c, '水産加工', 0, -14, 10.4, 9.05, 8);
}
/** 冷凍冷蔵倉庫：窓のない白い大箱とトラックの荷台口 */
export function modelColdStorage(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xa8a49c);
  g.box(-4, 0, -6, 70, 16, 36, 0xf2f4f6, 0xe2e6ea); for (let k = 0; k < 9; k++) { g.box(-36 + k * 8, 0.8, 12.05, 4.4, 4, 0.05, 0x9aa3ac); g.box(-36 + k * 8, 4.8, 13.5, 5.4, 0.3, 3, 0x7a838c); }
  for (let k = 0; k < 6; k++) g.box(-30 + k * 3, 16, -12, 2, 1.6, 2, 0x8a939c); sign(c, '冷蔵', 0, -4, 12, 12.06, 7);
}
/** 製材所：丸太の山・製材の建屋・乾燥機 */
export function modelSawmill(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0x9a8a6a);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 10 - r * 2; k++) obox(c, -26, 0.7 + r * 1.3, -18 + k * 1.4 + r * 1.4, [1, 0, 0], [0, 1, 0], [0, 0, 1], 12, 0.65, 0.65, 0xa8865a); // 丸太
  barn(c, 4, -8, 34, 18, 7, 0x8a8f96, 0x5a6168, 'x', 2.6); g.box(28, 0, -12, 10, 6, 8, 0x9aa3ac); g.cyl(30, 6, -12, 0.6, 5, 0x7a7f86, 8);
  for (let k = 0; k < 4; k++) g.box(-6 + k * 9, 0, 18, 7, 2.4, 3.2, 0xd8b884); standSign(c, '製材', 22, 22, 1.4, 3.2); // 製材品の山
}
/** 木材市場：屋根の下に丸太がずらり（せり場） */
export function modelTimberMarket(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xa89a7a);
  { const z = -14; for (let i = 0; i < 6; i++) for (const e of [-8, 8]) g.box(-36 + i * 14, 0, z + e, 0.4, 6, 0.4, 0x6a6f76); g.box(0, 6, z, 76, 0.3, 18, 0x9aa3ac); g.gable(0, 6.3, z, 76, 18, 1.6, 0x8a939c, 'x', 0x9aa3ac, 0.2); } // せり場の屋根
  for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) obox(c, -34 + i * 5.6, 0.55 + j * 1.0, 6 + r * 8 + j * 0.2, [0, 0, 1], [0, 1, 0], [1, 0, 0], 3.2, 0.5, 0.5, j % 2 ? 0xb8966a : 0xa8865a); // 土場に並ぶ丸太（はい積み）
  barn(c, 36, 0, 10, 8, 3.4, 0xe6dcc8, 0x3a3e44, 'z'); g.box(0, 4, -5.1, 8, 2, 0.2, 0x6b4a32); sign(c, '木材市場', 0, 0, 4.1, -4.95, 7);
}
/** 林業の作業所：土場の丸太・林業機械・作業小屋と杉林 */
export function modelForestry(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0x7a6a4a);
  for (let i = 0; i < 26; i++) tree(c, -26 + c.rnd() * 52, -26 + c.rnd() * 20, 1.2, 1);
  for (let k = 0; k < 8; k++) obox(c, -8, 0.6, 6 + k * 1.2, [1, 0, 0], [0, 1, 0], [0, 0, 1], 9, 0.55, 0.55, 0xa8865a);
  g.box(14, 0, 8, 6, 2.6, 3, 0xe8b23a); g.box(16, 2.6, 8, 0.4, 0.4, 7, 0x3a3e44); barn(c, 16, 22, 10, 7, 3, 0x6b5a48, 0x3a3e44);
}
/** 観光牧場：羊と牛のふれあい、ソフトクリームの売店 */
export function modelRanchPark(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0x8ab05e);
  rail(c, -14, 0, 50, 46); cows(c, -14, -8, 44, 22, 6, 0);
  for (let i = 0; i < 12; i++) { const x = -34 + c.rnd() * 40, z = 6 + c.rnd() * 14; g.blob(x, 0.9, z, 0.9, 0.7, 0.6, 0xf2efe6, 6); g.blob(x + 0.9, 1.1, z, 0.3, 0.3, 0.3, 0x2a2a2a, 5); } // 羊
  barn(c, 28, -12, 18, 12, 5, 0xa83a2a, 0x3e4248, 'x', 3.4); g.box(28, 0, 14, 12, 3.4, 8, 0xf6f2e6); g.box(28, 3.4, 18.6, 13, 0.3, 2, 0xe84a6a);
  g.cyl(36, 0, 20, 0.12, 3, 0x8a8f96, 5); g.blob(36, 3.6, 20, 0.7, 1.0, 0.7, 0xfff8e8, 6); // ソフトクリームの看板
  standSign(c, '牧場', 20, 22, 1.2, 3);
}
/** 養蜂場：巣箱の列と花畑 */
export function modelApiary(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 28.4, 0x86a85a);
  for (let k = 0; k < 10; k++) { g.box(-24 + k * 4, 0, -4, 1.4, 1.2, 1.0, [0xf0e6c8, 0x8ab0d0, 0xe8c87a][k % 3]); g.box(-24 + k * 4, 1.2, -4, 1.6, 0.15, 1.2, 0xffffff); }
  for (let k = 0; k < 40; k++) g.blob(-26 + c.rnd() * 52, 0.3, 4 + c.rnd() * 8, 0.4, 0.25, 0.4, [0xf6d23a, 0xffffff, 0xe8a0c8][k % 3], 4);
  barn(c, 22, -6, 8, 6, 2.6, 0xe6dcc8, 0x8a5a2a); standSign(c, 'はちみつ', 16, -1, 1.0, 3);
}
/** わさび田：渓流の段々の砂利の田と、日よけの黒い寒冷紗 */
export function modelWasabi(c: Ctx): void {
 const sv0_ = c.g.surfv; c.g.surfv = -2; // 作物は季節の桜色・紅葉にしない
  const g = c.g; pad(c, 58.4, 58.4, 0x6f7a52);
  for (let r = 0; r < 6; r++) { const z = -22 + r * 8.4; g.box(-4, 0, z, 46, 0.4, 7.2, 0x9a9a92); slab(c, -4, z, 44, 6.4, 0x6a9ab0, 0.5); for (let k = 0; k < 20; k++) g.blob(-25 + k * 2.2, 0.62, z, 0.5, 0.25, 0.5, 0x4f9a4a, 4); }
  for (let i = 0; i < 9; i++) g.box(-4, 3.4, -24 + i * 6, 48, 0.06, 2.2, 0x2a3a2a); // 寒冷紗（すき間のある日よけ） for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.box(-26 + i * 15, 0, -24 + j * 24, 0.2, 3.4, 0.2, 0x8a8a82);
  for (let i = 0; i < 6; i++) tree(c, 24 + c.rnd() * 3, -24 + i * 9, 1.1, 1);
  c.g.surfv = sv0_;
}
/** 塩田（揚げ浜式）：砂の浜に海水をまき、釜屋で煮つめる */
export function modelSaltField(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xd8ccb0); slip(c, 58.4, 18, 29.2);
  for (let r = 0; r < 4; r++) { slab(c, -10, -20 + r * 9, 34, 7, r % 2 ? 0xc8b890 : 0xd6c8a4, 0.1); for (let k = 0; k < 8; k++) g.box(-26 + k * 4.4, 0.1, -20 + r * 9, 0.08, 0.05, 6.6, 0xb8a880); }
  barn(c, 20, -8, 12, 14, 4, 0x6b5a48, 0x3a3e44, 'z'); g.cyl(22, 4, -14, 0.6, 6, 0x6a5a4a, 8); g.box(20, 0, 10, 6, 1.6, 4, 0xf6f4ee); standSign(c, '塩', 12, 14, 1.0, 2.4);
}

// ---- v49 製造業・工場・鉱業・処理施設 ----
/** のこぎり屋根の工場棟（ridge は x 軸、北向きの採光窓） */
function sawRoof(c: Ctx, x: number, z: number, w: number, d: number, h: number, n: number, wall: number, roof = 0x7a838c): void {
  const g = c.g; g.box(x, 0, z, w, h, d, wall); const step = d / n;
  for (let k = 0; k < n; k++) { const zz = z - d / 2 + step * (k + 0.5); obox(c, x, h + 1.1, zz + step * 0.12, [1, 0, 0], [0, 0.85, -0.53], [0, 0.53, 0.85], w / 2, 0.12, step * 0.52, roof); c.wa.box(x, h + 0.2, zz - step * 0.42, w - 1, 1.6, 0.05, 0xcfe0ea); }
}
/** 煙突（赤白の帯つき） */
function stack(c: Ctx, x: number, z: number, h: number, r = 1.1, band = true): void { const g = c.g; g.cyl(x, 0, z, r, h, 0xd8d4cc, 10, undefined, r * 0.75); if (band) for (let k = 0; k < 3; k++) g.cyl(x, h - 2.2 - k * 4.4, z, r * 0.8, 2.2, 0xc8382a, 10); }
/** 円筒タンク */
function tank(c: Ctx, x: number, z: number, r: number, h: number, col = 0xe8e8e4): void { c.g.cyl(x, 0, z, r, h, col, 14); c.g.cyl(x, h, z, r * 1.02, 0.25, 0x9aa0a6, 14); }
/** 配管（x か z に沿って） */
function pipe(c: Ctx, x: number, y: number, z: number, len: number, ax: 'x' | 'z', col = 0xb8a070): void { if (ax === 'x') c.g.box(x, y, z, len, 0.5, 0.5, col); else c.g.box(x, y, z, 0.5, 0.5, len, col); }

/** 化学コンビナート：蒸留塔・球形タンク・配管ラック・フレアスタック（夜は灯りがきらめく） */
export function modelChemPlant(c: Ctx): void {
  const g = c.g; pad(c, 118.4, 88.4, 0x9a968c);
  for (let k = 0; k < 4; k++) { g.cyl(-40 + k * 7, 0, -26, 1.8, 26 + k * 3, 0xd8d4cc, 12); for (let y = 6; y < 26 + k * 3; y += 6) { g.cyl(-40 + k * 7, y, -26, 2.3, 0.25, 0x8a8f96, 12); c.wa.box(-40 + k * 7, y + 0.6, -23.7, 0.3, 0.3, 0.3, 0xfff2c0); } }
  for (let k = 0; k < 3; k++) { g.blob(10 + k * 14, 7, -24, 6, 6, 6, 0xeeeeea, 12); for (const a of [-4, 4]) for (const b of [-4, 4]) g.box(10 + k * 14 + a, 0, -24 + b, 0.5, 5, 0.5, 0x8a8f96); }
  for (let k = 0; k < 5; k++) tank(c, -40 + k * 13, 14, 5, 9, 0xe6e6e2);
  for (let y of [5, 8]) pipe(c, 0, y, -6, 110, 'x'); for (let k = 0; k < 10; k++) g.box(-50 + k * 11, 0, -6, 0.6, 8.5, 2.6, 0x7a7f86);
  g.cyl(50, 0, 30, 0.7, 38, 0x9aa0a6, 8); c.wa.box(50, 38.4, 30, 0.9, 1.6, 0.9, 0xff8a2a); // フレアスタック
  block(c, 40, 30, 18, 14, 3, 0xe8e4da, { fh: 3.6, lit: 0.5, glass: 0x7a8a96, band: 0x2a5aa0 });
}
/** 製紙工場：大きな抄紙機の建屋・チップの山・高い煙突 */
export function modelPaperMill(c: Ctx): void {
  const g = c.g; pad(c, 118.4, 88.4, 0x9a968c);
  g.box(-10, 0, -10, 70, 18, 22, 0xd8dce0, 0xb8bcc2); g.box(30, 0, -10, 18, 24, 22, 0xc8ccd2);
  for (let k = 0; k < 3; k++) g.blob(-36 + k * 16, 3, 26, 9, 6, 7, 0xc8a46a, 8); // 木材チップの山
  stack(c, 46, 22, 60, 2.2); tank(c, 20, 26, 6, 10, 0xd8d4cc); tank(c, 34, 30, 4, 8, 0xd8d4cc); g.cyl(0, 0, 30, 0.5, 14, 0x8a8f96, 6); g.box(0, 14, 28, 0.5, 0.5, 6, 0x8a8f96);
}
/** セメント工場：長い回転窯・予熱塔・サイロ群と石灰石のベルトコンベア */
export function modelCementPlant(c: Ctx): void {
  const g = c.g; pad(c, 118.4, 88.4, 0xb4b0a8);
  g.box(-30, 0, -22, 14, 46, 14, 0xc8c4bc); for (let y = 10; y < 46; y += 9) g.box(-30, y, -22, 15, 0.6, 15, 0x8a8f96); // 予熱塔
  obox(c, 0, 5, -22, [0.99, 0.12, 0], [-0.12, 0.99, 0], [0, 0, 1], 30, 2.2, 2.2, 0x9aa0a6); for (let k = 0; k < 5; k++) g.box(-24 + k * 12, 0, -22, 1.6, 4 + k * 1.4, 4, 0xb4b0a8);
  for (let k = 0; k < 4; k++) silo(c, 20 + (k % 2) * 10, 10 + (k >> 1) * 10, 4.4, 30, 0xd8d4cc, 0xb4b0a8);
  obox(c, -20, 9, 22, [0.82, 0.57, 0], [-0.57, 0.82, 0], [0, 0, 1], 22, 0.6, 1.2, 0x7a7f86); g.blob(-42, 4, 30, 10, 6, 8, 0xd8d0bc, 8); stack(c, -42, -10, 50, 1.8);
}
/** ガラス工場：溶解炉の建屋と、板ガラスのラック */
export function modelGlassWorks(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xa8a49c);
  sawRoof(c, -8, -6, 56, 34, 9, 5, 0xd8d4cc); stack(c, 26, -16, 34, 1.4);
  for (let k = 0; k < 6; k++) { g.box(-30 + k * 7, 0, 20, 5, 0.3, 3, 0x6a6f76); obox(c, -30 + k * 7, 2.0, 20, [1, 0, 0], [0, 0.95, 0.31], [0, -0.31, 0.95], 2.2, 1.8, 0.05, 0x9fd0e0); }
  g.box(30, 0, 14, 10, 6, 10, 0x9aa3ac);
}
/** タイヤ工場：大きな工場棟と、積み上げたタイヤ */
export function modelTirePlant(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xa8a49c);
  sawRoof(c, -6, -6, 62, 34, 10, 6, 0xd4d8dc); stack(c, 32, -18, 30);
  for (let k = 0; k < 8; k++) for (let j = 0; j < 4; j++) g.cyl(-30 + k * 3.4, j * 0.9, 20, 1.4, 0.85, 0x1e1e1e, 12);
  g.cyl(30, 0, 20, 4, 1.0, 0x1e1e1e, 16); g.cyl(30, 0, 20, 2.6, 1.05, 0xa8a49c, 16); // 看板の大タイヤ
}
/** 繊維・紡績工場：赤レンガののこぎり屋根（明治の工場のなごり） */
export function modelTextileMill(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xb4ac9a);
  sawRoof(c, -6, -2, 66, 40, 6, 8, 0x9a4a32, 0x5a6168); stack(c, 32, -20, 26, 1.4, false); g.box(32, 0, -20, 3.4, 3, 3.4, 0x8a3a2a);
  g.box(-30, 0, 24, 14, 5, 6, 0x9a4a32); g.gable(-30, 5, 24, 14, 6, 2, 0x3a3e44, 'x', 0x9a4a32, 0.4);
}
/** アルミ工場：電解の長い建屋と、地金の山 */
export function modelAluminumPlant(c: Ctx): void {
  const g = c.g; pad(c, 118.4, 58.4, 0xa8a49c);
  for (let k = 0; k < 2; k++) { g.box(-6, 0, -16 + k * 16, 96, 10, 12, 0xc8ccd2); for (let i = 0; i < 12; i++) g.box(-50 + i * 8, 10, -16 + k * 16, 2, 1.6, 10, 0x9aa0a6); }
  for (let k = 0; k < 6; k++) g.box(-40 + k * 6, 0, 22, 4, 1.6, 3, 0xd8dce0); stack(c, 48, 18, 34, 1.4); g.box(40, 0, 22, 10, 4, 6, 0x9aa3ac);
}
/** 陶磁器の窯元：斜面の登り窯と、作業場・ギャラリー */
export function modelKiln(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xb49a78);
  for (let k = 0; k < 6; k++) g.blob(-18 + k * 4.6, 1.4 + k * 0.5, -14, 2.6, 1.8, 3.2, 0x8a5a3a, 8); // 登り窯の連なり
  g.cyl(10, 0, -14, 0.8, 8, 0x7a4a2a, 8); barn(c, -10, 10, 18, 10, 3.4, 0xe6dcc8, 0x3a3e44); c.wa.box(-10, 0.8, 15.05, 14, 1.8, 0.05, 0xffe0a8);
  for (let k = 0; k < 10; k++) g.cyl(14 + (k % 5) * 2.2, 0, 8 + Math.floor(k / 5) * 2.4, 0.7, 1.4, [0x5a7a8a, 0xe8e0d0, 0x8a5a3a][k % 3], 8, undefined, 0.45); // 並べた器
  standSign(c, '窯元', 16, 20, 1.2, 3);
}
/** 刃物の工場：鍛冶場の煙突と、研ぎの作業場 */
export function modelCutlery(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 28.4, 0xa8a094);
  barn(c, -12, -2, 26, 14, 4.2, 0x6a5a4a, 0x3a3e44); g.cyl(-20, 4, -4, 0.7, 8, 0x5a4a3a, 8); c.wa.box(-12, 0.8, 5.05, 4, 2.4, 0.05, 0xff8a3a); // 炉の火
  block(c, 16, 0, 18, 14, 2, 0xece6d6, { fh: 3.4, lit: 0.3, glass: 0x7a8a96, band: 0x5a5f66 }); sign(c, '刃物', 0, 16, 7.0, 7.05, 4.4);
}
/** 家具工房：木の匂いのする工房と展示場 */
export function modelFurnitureShop(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 28.4, 0xb4ab9a);
  barn(c, -12, -2, 26, 14, 5, 0xc8a46a, 0x4a4f56, 'x', 2.6); for (let k = 0; k < 4; k++) obox(c, -26 + k * 0, 0.4 + k * 0.6, 8, [1, 0, 0], [0, 1, 0], [0, 0, 1], 4, 0.25, 1, 0xd8b884);
  g.box(14, 0, 0, 22, 4.4, 14, 0xf2efe6); c.wa.box(14, 0.6, 7.05, 20, 3, 0.05, 0xffe8c0); sign(c, '家具', 0, 14, 4.6, 7.06, 4.4);
}
/** 鋳物工場：キューポラ（溶解炉）の塔と砂の山 */
export function modelFoundry(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0x8f8a80);
  sawRoof(c, -6, -6, 40, 30, 7, 4, 0x8a8f96, 0x5a6168); g.cyl(20, 0, -16, 2.2, 22, 0x5a5550, 10, undefined, 1.6); c.wa.box(20, 2, -13.8, 1.2, 1.6, 0.1, 0xff7a2a);
  for (let k = 0; k < 2; k++) g.blob(-14 + k * 14, 1.2, 20, 5, 2.4, 4, 0x6a5a4a, 7); for (let k = 0; k < 6; k++) g.cyl(10 + k * 2.4, 0, 20, 0.9, 0.6, 0x3a3a3a, 10);
}
/** 印刷工場：輪転機の建屋と紙ロールの倉庫 */
export function modelPrintPlant(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xb0aca4);
  block(c, -10, -6, 56, 34, 2, 0xe8ecf0, { fh: 6, lit: 0.6, glass: 0x8fb0c8, band: 0x2a2a2a }); g.box(32, 0, -6, 16, 8, 30, 0xc8ccd2);
  for (let k = 0; k < 8; k++) obox(c, -30 + k * 4, 1.0, 20, [0, 0, 1], [0, 1, 0], [1, 0, 0], 1.4, 1.0, 1.0, 0xf4f2ec); sign(c, '印刷', 0, -10, 12.4, 11.05, 5);
}
/** 乳製品・パン工場：白い工場と牛乳のタンク */
export function modelDairyPlant(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xb4b0a8);
  block(c, -10, -6, 54, 32, 2, 0xf6f6f2, { fh: 6, lit: 0.5, glass: 0x8fb8d0, band: 0x2a7ad8 }); for (let k = 0; k < 4; k++) tank(c, 26 + (k % 2) * 8, -14 + (k >> 1) * 9, 3.2, 14, 0xeef0f2);
  for (let k = 0; k < 4; k++) g.box(-30 + k * 9, 0, 18, 6, 3.4, 0.3, 0x5a6a7a); sign(c, '乳業', 0, -10, 12.4, 10.05, 5);
}
/** 飲料のボトリング工場：大きな倉庫と自販機トラック */
export function modelBottling(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xb4b0a8);
  g.box(-8, 0, -6, 62, 12, 34, 0xf2f4f6, 0xe2e6ea); g.box(-8, 8, 11.05, 50, 3, 0.05, 0xd8342a); for (let k = 0; k < 3; k++) tank(c, 30, -16 + k * 8, 3, 16, 0xd8dce0);
  for (let k = 0; k < 3; k++) { g.box(-28 + k * 10, 0, 20, 4, 2.6, 7, 0xffffff); g.box(-28 + k * 10, 0, 16, 3.6, 2.2, 1.8, 0xd8342a); } sign(c, '飲料', 0, -8, 4, 11.06, 6);
}
/** 医療機器工場：クリーンルームの白い建物 */
export function modelMedDevice(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xbab8b0);
  block(c, -8, -4, 50, 30, 3, 0xf6f8fa, { fh: 4.2, lit: 0.6, glass: 0x9fc8e0, band: 0x2ab0a0 }); g.box(26, 0, -4, 12, 16, 12, 0xe8ecee);
  for (let k = 0; k < 6; k++) g.box(-26 + k * 6, 12.6, -10, 2.4, 1.6, 2.4, 0x9aa3ac); for (let k = 0; k < 4; k++) tree(c, -30 + k * 10, 20, 0.9, 0); sign(c, '医療機器', 0, -8, 13, 11.05, 7);
}
/** 航空機部品工場：大きな格納庫のような組立棟 */
export function modelAeroParts(c: Ctx): void {
  const g = c.g; pad(c, 118.4, 58.4, 0xa8a49c);
  g.box(-8, 0, -4, 76, 16, 40, 0xdfe3e6); g.cyl(-8, 16, -4, 20, 0.1, 0xdfe3e6, 3); obox(c, -8, 18, -4, [1, 0, 0], [0, 1, 0], [0, 0, 1], 38, 2, 20, 0xc8ccd2);
  g.box(-8, 0.5, 16.05, 40, 14, 0.05, 0x9aa3ac); // 大きな扉
  obox(c, 40, 3, 14, [1, 0, 0], [0, 1, 0], [0, 0, 1], 8, 1.2, 1.2, 0xe8ecef); obox(c, 40, 3.2, 14, [0, 0, 1], [0, 1, 0], [-1, 0, 0], 7, 0.15, 1.6, 0xe8ecef); // 胴体と主翼の部品
  sign(c, '航空', 0, 30, 10, 16.06, 6);
}
/** 採石場：段になった岩肌（ベンチカット）とダンプ・砕石プラント */
export function modelQuarry(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 88.4, 0x9a9488);
  for (let k = 0; k < 5; k++) g.box(-10, 0, -30 + k * 6, 66 - k * 8, 14 - k * 3, 6, k % 2 ? 0xb4aea2 : 0xa8a296); // 段の岩肌
  g.box(26, 0, 18, 12, 10, 10, 0x8a8f96); obox(c, 14, 6, 18, [0.85, 0.5, 0], [-0.5, 0.85, 0], [0, 0, 1], 9, 0.5, 1, 0x6a6f76);
  for (let k = 0; k < 3; k++) g.blob(-24 + k * 12, 2.4, 26, 5, 3, 4, [0xb8b2a6, 0x9a948a, 0xc8c2b6][k], 7); g.box(-6, 0, 10, 5, 3.2, 3, 0xe8b23a); g.box(-6, 3.2, 9, 4.4, 1.6, 2.6, 0xd8a028);
}
/** 砂利採取場：水を張った採取池と、ふるい分けのプラント */
export function modelGravelPit(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xb4ac98);
  g.box(-14, -0.6, -4, 50, 0.7, 36, 0x7a8a7a); slab(c, -14, -4, 46, 32, 0x5a7a7a, 0.1); g.box(-14, 0.2, 12, 6, 2, 3, 0x8a8f96); // 採取池と浚渫船
  for (let k = 0; k < 4; k++) g.blob(22 + (k % 2) * 10, 2, -14 + (k >> 1) * 14, 5, 3, 4.4, [0xc8bca4, 0xa89e88][k % 2], 7); g.box(34, 0, 18, 8, 7, 6, 0x8a8f96);
}
/** 鉱山：坑口・やぐら（立坑の巻き上げ塔）・ズリ山 */
export function modelMine(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 88.4, 0x8a8478);
  g.box(-6, 0, -16, 10, 0.4, 10, 0x6a645a); for (const a of [-3, 3]) for (const b of [-3, 3]) obox(c, -6 + a * 0.6, 12, -16 + b * 0.6, [a / 30, 1, 0], [1, -a / 30, 0], [0, 0, 1], 12, 0.25, 0.25, 0x5a5f66);
  g.cyl(-6, 23, -16, 2.4, 0.6, 0x3a3e44, 12); g.blob(30, 8, 20, 16, 10, 14, 0x5a544a, 8); // やぐらとズリ山
  g.box(-30, 0, 20, 12, 8, 3, 0x6a5a4a); g.box(-30, 0, 21.6, 5, 5, 0.1, 0x1a1a1a); // 坑口
  barn(c, 18, -24, 22, 12, 6, 0x9a8f80, 0x4a4f56); for (let k = 0; k < 4; k++) g.box(-30 + k * 4, 0, 30, 3, 1.6, 1.6, 0x6a4a2a); // トロッコ
}
/** 産業廃棄物処理場：焼却炉と破砕施設、仕分けヤード */
export function modelIndWaste(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0x9a968c);
  g.box(-14, 0, -8, 34, 14, 22, 0xc8ccd2); stack(c, -2, -16, 40, 1.6); g.box(18, 0, -8, 22, 9, 18, 0x9aa3ac);
  for (let k = 0; k < 5; k++) g.blob(-30 + k * 9, 1.4, 20, 4, 2, 3, [0x6a6458, 0x8a7a6a, 0x5a5f66][k % 3], 6); fenceRect(c, 86, 56, 2.2, 0x8a8f96, 12);
}
/** 最終処分場（埋立地）：遮水シートの区画と、覆土した丘 */
export function modelLandfill(c: Ctx): void {
  const g = c.g; pad(c, 118.4, 88.4, 0x8a8a70);
  g.box(-20, -1.5, -10, 60, 1.6, 50, 0x2a2e30); for (let k = 0; k < 3; k++) g.blob(-30 + k * 14, 1, -10, 6, 2.4, 9, 0x6a6458, 6); // 遮水シートと埋め立て中のごみ
  g.blob(30, 0, 10, 24, 8, 30, 0x7a9a52, 10); for (let k = 0; k < 6; k++) g.cyl(24 + k * 3, 6, 4 + k * 2, 0.2, 1.6, 0x8a8f96, 5); // 覆土した丘とガス抜き管
  g.box(-44, 0, 30, 10, 4, 6, 0xe8e8e2); g.box(-30, 0, 30, 6, 3, 3, 0xe8b23a); fenceRect(c, 116, 86, 2.0, 0x8a8f96, 14);
}
/** し尿処理場：円形の処理槽と管理棟 */
export function modelNightSoil(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0xa8aca0);
  for (let k = 0; k < 4; k++) { const x = -14 + (k % 2) * 16, z = -12 + (k >> 1) * 16; g.cyl(x, -0.2, z, 6.4, 2, 0x9aa0a6, 16); g.cyl(x, 1.75, z, 6, 0.1, 0x5a6670, 16); g.box(x, 2, z, 12, 0.3, 0.6, 0x8a8f96); }
  block(c, 20, 18, 14, 12, 2, 0xe8ecee, { fh: 3.6, lit: 0.3, glass: 0x7a8a96, band: 0x2a7a8a });
}
/** 解体・スクラップ工場：つぶした車の山とクレーン */
export function modelScrapYard(c: Ctx): void {
  const g = c.g; pad(c, 58.4, 58.4, 0x8a8478);
  for (let k = 0; k < 18; k++) g.box(-22 + (k % 6) * 5, Math.floor(k / 6) * 1.5, -16, 4.2, 1.4, 2, [0x8a3a2a, 0x3a5a8a, 0xd8d8d0, 0x2a2a2a, 0x6a7a3a][k % 5]);
  g.blob(10, 3, 12, 10, 4, 8, 0x6a5f54, 8); g.box(-16, 0, 14, 4, 2.6, 6, 0xe8b23a); obox(c, -12, 8, 12, [0.6, 0.8, 0], [-0.8, 0.6, 0], [0, 0, 1], 8, 0.4, 0.4, 0xe8b23a);
  fenceRect(c, 56, 56, 2.4, 0x6a6f76, 8);
}
/** 中古車オークション会場：大きな駐車場にずらりと並ぶ車と、せりの建物 */
export function modelCarAuction(c: Ctx): void {
  const g = c.g; pad(c, 118.4, 88.4, 0x6a6e72);
  const cols = [0xf2f2f2, 0x1e1e1e, 0x9aa0a6, 0xc8382a, 0x2a5aa0, 0xd8c8a0];
  for (let r = 0; r < 8; r++) for (let k = 0; k < 22; k++) g.box(-50 + k * 4.6, 0.3, -36 + r * 7, 2.0, 1.4, 4.2, cols[(r * 7 + k * 3) % cols.length]);
  block(c, 30, 30, 40, 22, 3, 0xe8ecf0, { fh: 4.5, lit: 0.6, glass: 0x8fb0c8, band: 0xd8342a }); sign(c, 'オークション', 0, 30, 13.8, 41.05, 9);
}
/** 化粧品工場：ガラス張りの明るい工場と庭 */
export function modelCosmetics(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xc8c4bc);
  block(c, -8, -6, 50, 28, 3, 0xfaf6f4, { fh: 4.4, lit: 0.6, glass: 0xc8b8d8, band: 0xd88aa8 }); for (let k = 0; k < 6; k++) tree(c, -30 + k * 9, 20, 0.8, 3);
  g.box(28, 0, -6, 12, 6, 20, 0xeeeae6); sign(c, '化粧品', 0, -8, 13.6, 8.05, 6);
}
/** おもちゃ工場：カラフルな工場と見学の入口 */
export function modelToyFactory(c: Ctx): void {
  const g = c.g; pad(c, 88.4, 58.4, 0xc8c4bc);
  g.box(-8, 0, -6, 52, 10, 30, 0xf6f2e6); for (let k = 0; k < 6; k++) g.box(-30 + k * 8.6, 10, -6, 8.6, 1.2, 30, [0xe84a3a, 0xf6c23a, 0x3aa0e8, 0x5ac85a, 0xb05ad8, 0xf08a2a][k]);
  g.blob(28, 4, 14, 4, 4, 4, 0xf6c23a, 10); g.blob(28, 9, 14, 2.6, 2.6, 2.6, 0xe84a3a, 10); sign(c, 'おもちゃ', 0, -8, 6, 9.05, 7);
}

// ---- v49 商業・サービス ----
/** 郊外の大型店：箱の店舗・正面の帯看板・ガラスの入口・駐車場 */
function bigStore(c: Ctx, sx: number, sz: number, w: number, d: number, h: number, wall: number, band: number, label: string, zBack = -sz / 2 + d / 2 + 2): void {
  const g = c.g, front = zBack + d / 2;
  g.box(0, 0, zBack, w, h, d, wall); g.box(0, h - 2.4, front + 0.06, w, 2.4, 0.1, band); c.wa.box(0, 0.4, front + 0.08, Math.min(14, w * 0.4), 3, 0.05, 0xd8eef8);
  sign(c, label, 0, 0, h - 2.2, front + 0.16, Math.min(12, w * 0.4)); const pz0 = front + 2, pz1 = sz / 2 - 1; if (pz1 - pz0 > 6) { slab(c, 0, (pz0 + pz1) / 2, sx - 2, pz1 - pz0, 0x5a5e62, 0.08); parkingLines(c, -sx / 2 + 3, sx / 2 - 3, (pz0 + pz1) / 2, Math.min(5, pz1 - pz0 - 1), Math.floor(sx / 3.2)); parkedCars(c, sx, (pz0 + pz1) / 2); }
}
function parkedCars(c: Ctx, sx: number, z: number): void { const cols = [0xf2f2f2, 0x1e1e1e, 0x9aa0a6, 0xc8382a, 0x2a5aa0, 0xd8c8a0]; for (let x = -sx / 2 + 4.6; x < sx / 2 - 3; x += 3.2) if (c.rnd() < 0.55) c.g.box(x, 0.3, z, 1.8, 1.4, 4, cols[Math.floor(c.rnd() * 6)]); }
/** 街なかの小さな店（1〜2 階、ひさし・看板・ガラス） */
function smallShop(c: Ctx, x: number, z: number, w: number, d: number, floors: number, wall: number, awning: number, label: string): void {
  const g = c.g, h = floors * 3.2, front = z + d / 2; g.box(x, 0, z, w, h, d, wall); g.box(x, h, z, w + 0.2, 0.3, d + 0.2, 0x6a6f76);
  c.wa.box(x, 0.3, front + 0.05, w * 0.8, 2.2, 0.05, 0xffe8c0); obox(c, x, 2.9, front + 0.7, [1, 0, 0], [0, 0.94, 0.34], [0, -0.34, 0.94], w / 2, 0.06, 0.8, awning);
  if (floors > 1) for (let f = 1; f < floors; f++) c.wa.box(x, f * 3.2 + 0.9, front + 0.05, w * 0.6, 1.3, 0.05, 0xfff0d0);
  sign(c, label, 0, x, 3.4, front + 0.12, Math.min(w * 0.8, 6));
}

export function modelElectronics(c: Ctx): void { pad(c, 88.4, 88.4, 0xb0aca4); bigStore(c, 88.4, 88.4, 70, 40, 12, 0xf6f6f4, 0xd8342a, '家電'); }
export function modelHomeCenter(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0xb0aca4); bigStore(c, 88.4, 88.4, 64, 40, 10, 0xf2efe6, 0xf08a1a, 'ホームセンター'); g.box(38, 0, -24, 10, 5, 36, 0x7a8a6a); for (let k = 0; k < 8; k++) g.blob(38, 5.6, -40 + k * 4.4, 1.2, 0.8, 1.2, [0x4f9a4a, 0xe84a6a, 0xf6d23a][k % 3], 5); }
export function modelFurnitureStore(c: Ctx): void { pad(c, 88.4, 88.4, 0xb0aca4); bigStore(c, 88.4, 88.4, 72, 42, 16, 0x1f5aa8, 0xf6d23a, '家具'); }
export function modelBookstore(c: Ctx): void { pad(c, 58.4, 58.4, 0xb0aca4); bigStore(c, 58.4, 58.4, 44, 26, 8, 0xece6d6, 0x2a5a3a, '書店'); }
export function modelReuseShop(c: Ctx): void { pad(c, 58.4, 58.4, 0xb0aca4); bigStore(c, 58.4, 58.4, 44, 26, 7, 0xf6f2e0, 0xf6c23a, 'リユース'); }
export function modelDollarShop(c: Ctx): void { pad(c, 58.4, 58.4, 0xb0aca4); bigStore(c, 58.4, 58.4, 42, 24, 6.5, 0xffffff, 0xe84a8a, '100円'); }
export function modelDiscount(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xb0aca4); bigStore(c, 58.4, 58.4, 46, 28, 10, 0xf6d23a, 0xd8342a, '激安'); for (let k = 0; k < 6; k++) g.box(-18 + k * 7, 8.6, -14 + 14.06 + 0.2, 5, 0.6, 0.05, [0x2a5aa0, 0xd8342a][k % 2]); }
export function modelWarehouseClub(c: Ctx): void { pad(c, 118.4, 88.4, 0xb0aca4); bigStore(c, 118.4, 88.4, 96, 44, 14, 0xe8e8e4, 0xd8342a, '倉庫店'); }
export function modelCarGoods(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xb0aca4); bigStore(c, 58.4, 58.4, 40, 22, 7, 0xf2f2f2, 0xf08a1a, 'カー用品'); for (let k = 0; k < 3; k++) { g.box(-24 + 0, 0, -14 + k * 6, 6, 4, 5, 0x9aa3ac); g.box(-21, 0.2, -14 + k * 6, 0.05, 3.4, 4.4, 0x2a2a2a); } }
export function modelDealer(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc8c8c4); g.box(0, 0, -10, 40, 7, 24, 0xf6f6f6); c.wa.box(0, 0.4, 2.06, 36, 6, 0.05, 0xbfe0f0); g.box(0, 7, -10, 41, 0.6, 25, 0x2a5aa0); sign(c, 'ディーラー', 0, 0, 7.6, 2.1, 8); for (let k = 0; k < 6; k++) g.box(-20 + k * 8, 0.3, 18, 2.0, 1.5, 4.4, [0xd8342a, 0xf2f2f2, 0x1e1e1e][k % 3]); g.cyl(24, 0, 24, 0.15, 9, 0x8a8f96, 5); g.box(24, 9, 24, 3, 1.6, 0.1, 0x2a5aa0); }
export function modelUsedCar(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x7a7e82); for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) g.box(-22 + k * 5.4, 0.3, -18 + r * 8, 2.0, 1.5, 4.2, [0xf2f2f2, 0x1e1e1e, 0x9aa0a6, 0xc8382a, 0x2a5aa0, 0xd8c8a0][(r + k * 2) % 6]); for (let k = 0; k < 10; k++) g.box(-24 + k * 5.4, 3.2, 26, 1.2, 0.8, 0.05, [0xd8342a, 0xf6d23a, 0x2a5aa0][k % 3]); g.box(18, 0, 22, 8, 3, 5, 0xf2efe6); }
export function modelRentACar(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0x7a7e82); smallShop(c, -18, -4, 14, 10, 1, 0xf6f6f6, 0x2a5aa0, 'レンタカー'); for (let k = 0; k < 6; k++) g.box(2 + k * 4, 0.3, 0, 2.0, 1.5, 4.2, 0xf2f2f2); }
export function modelLaundromat(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -4, 18, 12, 1, 0xf6f6f6, 0x3aa0e8, 'ランドリー'); for (let k = 0; k < 4; k++) c.wa.box(-6 + k * 4, 1.0, 2.06, 1.6, 1.6, 0.05, 0x9fd8f0); g.box(0, 0, 10, 10, 0.1, 6, 0x5a5e62); }
export function modelCarWash(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0x8a8e92); g.box(-10, 0, 0, 14, 5, 8, 0x3aa0e8); g.box(-10, 0.2, 0, 15, 4.6, 7, 0x2a2e30); for (let k = 0; k < 3; k++) g.cyl(-14 + k * 4, 0.5, 0, 1.2, 3.4, [0xd8342a, 0xf6d23a, 0x2a5aa0][k], 10); for (let k = 0; k < 4; k++) g.box(8 + k * 5, 0, 0, 0.3, 3.4, 6, 0xe8e8e4); standSign(c, '洗車', 22, 10, 2, 3); }
export function modelAutoRepair(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0x8a8e92); g.box(-6, 0, -4, 36, 6, 14, 0xe6e2d8); for (let k = 0; k < 4; k++) { g.box(-20 + k * 8, 0.2, 3.06, 6, 4.6, 0.05, 0x2a2e30); g.box(-20 + k * 8, 0.3, 6, 2, 1.4, 4, [0xf2f2f2, 0xc8382a, 0x1e1e1e, 0x2a5aa0][k]); } sign(c, '整備', 0, -6, 6.2, 3.1, 5); }
export function modelCarInspect(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x8a8e92); g.box(0, 0, -6, 60, 8, 20, 0xd8dce0); for (let k = 0; k < 4; k++) g.box(-24 + k * 16, 0.2, 4.06, 8, 6, 0.05, 0x2a2e30); block(c, 0, 20, 30, 12, 2, 0xece8de, { fh: 3.6, lit: 0.4, glass: 0x7a8a96, band: 0x1f3f8a }); for (let k = 0; k < 8; k++) g.box(-36 + k * 3, 0.3, 14, 2, 1.5, 4.2, 0x9aa0a6); sign(c, '車検', 0, 0, 8.4, 4.1, 5); }
export function modelFamiRes(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xb0aca4); g.box(0, 0, -12, 32, 5, 18, 0xf2e2c8); g.gable(0, 5, -12, 32, 18, 3, 0xb8382a, 'x', 0xf2e2c8, 0.8); c.wa.box(0, 0.8, -2.94, 28, 3, 0.05, 0xffe0a8); sign(c, 'ファミレス', 0, 10, 6.8, -2.9, 8); g.cyl(22, 0, 8, 0.25, 10, 0x8a8f96, 6); g.box(22, 10, 8, 4, 3, 0.4, 0xd8342a); slab(c, 0, 18, 56, 18, 0x5a5e62, 0.08); parkedCars(c, 56, 18); }
export function modelChainFood(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -4, 20, 14, 1, [0xf6a01a, 0xd8342a, 0x2a2a2a][Math.floor(c.rnd() * 3)], 0xd8342a, 'チェーン'); }
export function modelFastFood(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0xb0aca4); smallShop(c, -12, -3, 22, 14, 1, 0xd8342a, 0xf6d23a, 'バーガー'); g.box(14, 0.05, 0, 26, 0.1, 4, 0x4a4e52); g.box(4, 0, 6, 1.4, 2.4, 0.6, 0x3a3e44); c.wa.box(4, 1.2, 6.32, 1.0, 1.0, 0.02, 0xbfe0f0); g.cyl(22, 0, -8, 0.3, 11, 0x8a8f96, 6); g.box(22, 11, -8, 4, 3, 0.4, 0xf6d23a); }
export function modelIzakaya(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x9a948a); smallShop(c, 0, -2, 18, 14, 2, 0x5a3a24, 0x2a2a2a, '居酒屋'); for (let k = 0; k < 4; k++) c.wa.box(-6 + k * 4, 2.2, 5.4, 0.7, 0.9, 0.7, 0xff4a2a); }
export function modelYataiMura(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0x8a8478); for (let k = 0; k < 8; k++) { const x = -24 + k * 6.6; g.box(x, 0, -2, 4.4, 2.4, 3, 0x6b4a32); g.box(x, 2.4, -2, 5, 0.25, 4, [0xd8342a, 0x2a5aa0, 0xf6f2e6][k % 3]); c.wa.box(x, 2.0, -0.2, 0.6, 0.8, 0.6, 0xff6a2a); } for (let k = 0; k < 8; k++) g.box(-24 + k * 6.6, 0, 6, 2.4, 0.8, 1.2, 0x8a6a4a); standSign(c, '屋台村', 0, 12, 2.4, 4); }
export function modelJogaiMarket(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x9a948a); for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) { const x = -36 + k * 9, z = -18 + r * 16; g.box(x, 0, z, 7.6, 3.6, 8, [0xece6d6, 0xd8d4c8][k % 2]); obox(c, x, 3.2, z + 4.6, [1, 0, 0], [0, 0.94, 0.34], [0, -0.34, 0.94], 3.8, 0.06, 1.0, [0x2a5aa0, 0xd8342a, 0x3a8a4a][(k + r) % 3]); g.box(x, 0.8, z + 5.2, 6, 0.8, 1.6, 0xd8dce0); } standSign(c, '市場', 40, 26, 2.4, 4); }
export function modelKojinten(c: Ctx): void { pad(c, 58.4, 28.4, 0x9a948a); const L = ['八百屋', '魚屋', '肉屋', '豆腐', '和菓子', '酒屋']; const cols = [0xece6d6, 0xd8cfc0, 0xe6dcc8]; for (let k = 0; k < 6; k++) smallShop(c, -24 + k * 9.6, -2, 8.6, 12, 2, cols[k % 3], [0x3a8a4a, 0x2a5aa0, 0xd8342a, 0xf6f2e6, 0x8a3a6a, 0x6b4a32][k], L[k]); }
export function modelShinkin(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 22, 16, 3, 0xece8e0, { fh: 3.6, lit: 0.5, glass: 0x7a8a96, band: 0x2a7a3a }); sign(c, '信用金庫', 0, 0, 8.4, 6.05, 7); }
export function modelSecurities(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 22, 16, 5, 0xd8dce0, { fh: 3.6, lit: 0.6, glass: 0x5a7a96, band: 0x1f3f8a }); sign(c, '証券', 0, 0, 3.8, 6.05, 5); }
export function modelRealEstate(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -2, 16, 12, 2, 0xf6f6f2, 0x2a8a4a, '不動産'); for (let k = 0; k < 6; k++) g.box(-6 + k * 2.4, 0.8, 4.12, 1.8, 1.4, 0.05, 0xffffff); }
export function modelLawOffice(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 20, 16, 4, 0xe6e2d8, { fh: 3.4, lit: 0.6, glass: 0x6a7a8a, band: 0x5a5f66 }); sign(c, '法律事務所', 0, 0, 13.8, 6.05, 7); }
export function modelPawnShop(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x9a948a); g.box(0, 0, -2, 14, 6, 12, 0xf2efe6); g.gable(0, 6, -2, 14, 12, 2.6, 0x2f3438, 'x', 0xf2efe6, 0.5); g.box(0, 0, 4.05, 12, 1.6, 0.05, 0x2e2a26); sign(c, '質', 0, 0, 2.4, 4.1, 3); }
export function modelCleaning(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -4, 14, 10, 1, 0xf6f6f6, 0x3aa0e8, 'クリーニング'); }
export function modelPhotoStudio(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -2, 14, 12, 2, 0xf2ece2, 0x6a4a8a, '写真館'); }
export function modelPetShop(c: Ctx): void { pad(c, 58.4, 28.4, 0xb0aca4); smallShop(c, -12, -2, 26, 14, 1, 0xfff6e6, 0xf08a1a, 'ペット'); smallShop(c, 16, -2, 18, 14, 1, 0xf6f6f6, 0x3aa0a0, 'トリミング'); }
export function modelVet(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -4, 18, 12, 2, 0xf6f8fa, 0x2ab0a0, '動物病院'); g.blob(-8, 0.6, 9, 0.6, 0.45, 0.35, 0xc8a06a, 5); g.blob(-7.4, 0.9, 9, 0.25, 0.25, 0.25, 0xc8a06a, 5); }
export function modelCramSchool(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 22, 16, 4, 0xf2f2ee, { fh: 3.4, lit: 0.9, glass: 0x9fc8e0, band: 0x1f6fb2 }); sign(c, '学習塾', 0, 0, 13.8, 6.05, 6); }
export function modelLessonSchool(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 20, 14, 3, 0xfaf6ee, { fh: 3.4, lit: 0.8, glass: 0xc8b8e0, band: 0xb05ad8 }); sign(c, '英会話', 0, 0, 10.4, 5.05, 5); }
export function modelKaraoke(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 22, 16, 4, 0x2a2a3a, { fh: 3.4, lit: 0.9, glass: 0xd27aff, band: 0xff3a8a }); g.box(0, 13.6, 6.1, 18, 2.4, 0.1, 0xff3a8a); sign(c, 'カラオケ', 0, 0, 13.8, 6.2, 8); }
export function modelBowling(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xb0aca4); g.box(0, 0, -8, 66, 10, 30, 0xf2efe6); g.box(0, 10, -8, 67, 0.6, 31, 0xd8342a); g.cyl(28, 10.6, 2, 1.6, 7, 0xffffff, 12, undefined, 1.0); g.cyl(28, 12.6, 2, 1.0, 0.5, 0xd8342a, 12); g.blob(28, 18, 2, 1.2, 1.2, 1.2, 0xffffff, 8); sign(c, 'ボウリング', 0, 0, 6.6, 7.05, 10); slab(c, 0, 20, 86, 14, 0x5a5e62, 0.08); parkedCars(c, 86, 20); }
export function modelGameCenter(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 22, 16, 3, 0x1e1e2a, { fh: 3.6, lit: 1, glass: 0xff6ad8, band: 0x3ad8ff }); sign(c, 'ゲーム', 0, 0, 10.8, 6.05, 7); }
export function modelMangaCafe(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 20, 16, 4, 0xf6f2e0, { fh: 3.4, lit: 1, glass: 0xffe8a8, band: 0xf6c23a }); sign(c, 'ネットカフェ', 0, 0, 13.8, 6.05, 8); }
export function modelMahjong(c: Ctx): void { pad(c, 28.4, 28.4, 0x9a948a); block(c, 0, -2, 18, 14, 3, 0xd8d0c0, { fh: 3.4, lit: 0.9, glass: 0xa8e0a8, band: 0x2a7a3a }); sign(c, '麻雀', 0, 0, 10.4, 5.05, 4); }
export function modelBattingCenter(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x7a9a5a); for (let k = 0; k < 8; k++) g.box(-24 + k * 6.6, 0, 0, 0.2, 12, 50, 0x6a6f76); for (let k = 0; k < 9; k++) g.box(0, 12, -24 + k * 6, 54, 0.06, 0.06, 0x8a8f96); g.box(0, 0, -22, 54, 3, 6, 0xf2efe6); for (let k = 0; k < 7; k++) g.box(-21 + k * 6.6, 0, 22, 1.2, 1.8, 1.2, 0x3a3e44); sign(c, 'バッティング', 0, 0, 3.2, -18.9, 9); }
export function modelGolfRange(c: Ctx): void { const g = c.g; pad(c, 88.4, 118.4, 0x6aa04a); g.box(0, 0, -50, 80, 10, 12, 0xf2efe6); for (let f = 0; f < 3; f++) g.box(0, f * 3.3 + 3, -44, 80, 0.3, 2, 0x8a8f96); for (const x of [-42, 42]) for (let k = 0; k < 6; k++) g.cyl(x, 0, -40 + k * 18, 0.4, 30, 0x8a8f96, 6); for (const x of [-42, 42]) for (let y = 4; y <= 28; y += 4) g.box(x, y, 5, 0.06, 0.06, 110, 0x8a8f96); for (let y = 4; y <= 28; y += 4) g.box(0, y, 59, 84, 0.06, 0.06, 0x8a8f96); for (let k = 0; k < 4; k++) g.cyl(-20 + k * 14, 0.1, -10 + k * 14, 3, 0.1, 0xffffff, 12); }
export function modelFishingPond(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0x8a9a6a); g.box(-4, 0, 0, 40, 0.6, 20, 0x8a8a82); slab(c, -4, 0, 38, 18, 0x3d6f8f, 0.58); for (let k = 0; k < 8; k++) g.box(-20 + k * 4.4, 0.6, 10.6, 1.2, 0.4, 1.2, 0x5a4a3a); barn(c, 22, 0, 8, 10, 3, 0xe6dcc8, 0x3a3e44, 'z'); standSign(c, '釣り堀', 18, 8, 1.2, 3); }
export function modelSauna(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x8a8478); barn(c, -2, -4, 16, 12, 4.4, 0x5a4030, 0x2a2a2a); g.box(9, 0, 6, 6, 1.0, 6, 0x6a9ab0); g.cyl(-6, 4.4, -6, 0.4, 3, 0x3a3a3a, 6); sign(c, 'サウナ', 0, -2, 2.4, 2.05, 4); }
export function modelCapsuleHotel(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 18, 16, 7, 0xe8ecee, { fh: 3, lit: 0.8, glass: 0x9fc8e0, band: 0x5a6a7a }); sign(c, 'カプセル', 0, 0, 2.4, 6.05, 6); }
export function modelMinpaku(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x8a9a6a); barn(c, 0, -2, 14, 10, 5.6, 0xece2cc, 0x3a3e44, 'x', 3); c.wa.box(0, 1, 3.05, 8, 2.2, 0.05, 0xffe0a8); g.box(9, 0, 6, 0.8, 1.2, 0.8, 0x5a4a3a); standSign(c, '民泊', 8, 9, 1, 2); }
export function modelLoveHotel(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x9a948a); block(c, 0, -2, 20, 16, 5, 0xf6d8e6, { fh: 3.2, lit: 0.7, glass: 0xffa8d8, band: 0xff3a8a }); g.box(0, 16, -2, 8, 4, 8, 0xffffff); g.box(0, 16, -2, 4, 6, 4, 0xff6ab8); sign(c, 'HOTEL', 0, 0, 13.8, 6.05, 6); }
export function modelCoworking(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 22, 16, 3, 0xece6d6, { fh: 3.8, lit: 0.8, glass: 0xbfe0c8, band: 0x2a8a6a }); for (let k = 0; k < 4; k++) g.blob(-8 + k * 5, 11.8, -2, 1.4, 1.0, 1.4, 0x4f9a4a, 5); sign(c, 'コワーキング', 0, 0, 2.4, 6.05, 8); }

// ---- v49 住まい ----
/** 中層の板状の住棟（南面にベランダの帯） */
function slabBlock(c: Ctx, x: number, z: number, w: number, floors: number, wall: number, rail = 0xeeeee8, d = 9): void {
  const g = c.g, fh = 2.8, H = floors * fh, fz = z + d / 2; g.box(x, 0, z, w, H, d, wall); g.box(x, H, z, w + 0.3, 0.4, d + 0.3, 0xcfcfca);
  for (let f = 0; f < floors; f++) { g.box(x, f * fh + 0.05, fz + 1.35, w, 1.0, 0.1, rail); g.box(x, f * fh + 0.02, fz + 0.7, w, 0.12, 1.4, 0xd8d6d0); c.wa.box(x, f * fh + 1.1, fz + 0.02, w * 0.9, 1.4, 0.04, 0xffe8c0); balconyLife(c, x - w / 2, x + w / 2, f * fh + 0.14, fz, Math.max(1, Math.round(w / 3.6)), 1.3); }
}
/** 小さな家（切妻・窓） */
function cottage(c: Ctx, x: number, z: number, w: number, d: number, wall: number, roof: number, ax: 'x' | 'z' = 'x', h = 3.0): void { barn(c, x, z, w, d, h, wall, roof, ax, Math.min(w, d) * 0.35); c.wa.box(x, 1.0, z + d / 2 + 0.03, w * 0.5, 1.2, 0.04, 0xffe0a8); }
const H_ROOFS = [0x3a3e44, 0x8a3a2a, 0x2f4a6a, 0x5a4a3a, 0x4a5a4a];
const H_WALLS = [0xece6d6, 0xd8cfc0, 0xe6dcc8, 0xc9d2d6, 0xf2efe6];

export function modelDanchi(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x9aa088); for (let k = 0; k < 3; k++) slabBlock(c, -10, -22 + k * 16, 60, 5, 0xe8e4da); for (let k = 0; k < 8; k++) tree(c, 28 + (k % 2) * 6, -20 + Math.floor(k / 2) * 12, 1.1, 0); g.box(30, 0, 24, 8, 0.4, 6, 0xc9b98c); g.box(28, 0, 24, 0.2, 2.6, 0.2, 0xd8342a); g.box(32, 0, 24, 0.2, 2.6, 0.2, 0xd8342a); g.box(30, 2.6, 24, 4.4, 0.2, 0.2, 0xd8342a); } // 住棟・中庭の木・公園の遊具
export function modelNewTown(c: Ctx): void { const g = c.g; pad(c, 118.4, 118.4, 0x8aa868); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { if ((i === 2 || i === 3) && (j === 2 || j === 3)) continue; const x = -50 + i * 20, z = -50 + j * 20; slab(c, x, z, 16, 16, 0x9ab07a, 0.05); cottage(c, x, z - 2, 9, 7, H_WALLS[(i * 3 + j) % 5], H_ROOFS[(i + j * 2) % 5], 'x', 5.6); g.box(x + 6, 0.3, z + 5, 1.8, 1.3, 3.8, [0xf2f2f2, 0x1e1e1e, 0x9aa0a6][(i + j) % 3]); } for (let k = 0; k < 6; k++) { g.box(0, 0.06, -55 + k * 20 + 10, 116, 0.05, 2.4, 0x6a6e72); g.box(-55 + k * 20 + 10, 0.06, 0, 2.4, 0.05, 116, 0x6a6e72); } slab(c, 0, 0, 36, 36, 0x7ab05a, 0.08); for (let k = 0; k < 10; k++) tree(c, -14 + c.rnd() * 28, -14 + c.rnd() * 28, 1.2, 0); }
export function modelShataku(c: Ctx): void { pad(c, 28.4, 28.4, 0xa8a49c); slabBlock(c, 0, -4, 22, 4, 0xd8d4c8, 0xb8c0c8); standSign(c, '社宅', 10, 10, 1, 2.4); }
export function modelStudentDorm(c: Ctx): void { pad(c, 28.4, 28.4, 0xa8a49c); slabBlock(c, 0, -4, 22, 5, 0xe8d8c0, 0xc8a46a); standSign(c, '学生寮', 9, 10, 1, 3); }
export function modelShareHouse(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x8aa868); cottage(c, -2, -4, 16, 10, 0xf6f0e0, 0x2f4a6a, 'x', 6); g.box(8, 0, 6, 6, 0.2, 6, 0xa8865a); for (let k = 0; k < 3; k++) g.box(6 + k * 2, 0, 9, 1.4, 0.8, 0.6, 0xd8b884); standSign(c, 'シェアハウス', -6, 10, 1, 4); }
export function modelSakouju(c: Ctx): void { pad(c, 58.4, 28.4, 0xa8aca0); slabBlock(c, -4, -4, 44, 4, 0xf2ece0, 0xc8d8c0); for (let k = 0; k < 4; k++) tree(c, 22, -10 + k * 5, 0.8, 3); standSign(c, 'サ高住', -20, 10, 1, 3); }
export function modelYuryoRojin(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0xb4b0a6); block(c, -6, -2, 38, 18, 3, 0xf6f0e6, { fh: 3.4, lit: 0.6, glass: 0xc8d8e0, band: 0x8a6a4a }); g.box(20, 0, 4, 10, 0.1, 10, 0x6aa04a); for (let k = 0; k < 3; k++) tree(c, 18 + k * 3, 8, 0.8, 3); sign(c, '老人ホーム', 0, -6, 10.4, 7.05, 8); }
export function modelGroupHome(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x8aa868); cottage(c, -2, -4, 18, 10, 0xf2e8d0, 0x8a3a2a, 'x', 3.2); g.box(8, 0, 7, 6, 0.1, 6, 0x6aa04a); standSign(c, 'グループホーム', -6, 10, 1, 4.4); }
export function modelNagaya(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x9a948a); barn(c, 0, -4, 24, 8, 3, 0xc8b8a0, 0x3a3e44, 'x', 2.4); for (let k = 0; k < 5; k++) { g.box(-9.6 + k * 4.8, 0.2, 0.05, 1.8, 2.2, 0.05, 0x6b4a32); c.wa.box(-8 + k * 4.8, 1.2, 0.06, 1.0, 0.8, 0.04, 0xffe0a8); g.box(-8 + k * 4.8, 0, 2, 0.8, 0.8, 0.8, [0x4f9a4a, 0x8a5a3a][k % 2]); } }
export function modelKominka(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x8a9a6a); g.box(0, 0, -2, 16, 3.2, 10, 0xd8c8a8); g.gable(0, 3.2, -2, 18, 12, 5.4, 0x8a7a5a, 'x', 0xd8c8a8, 0.8); c.wa.box(0, 0.6, 3.05, 10, 2, 0.04, 0xffe0a8); g.box(0, 0, 3.6, 16, 0.5, 1.2, 0x6b4a32); for (let k = 0; k < 3; k++) tree(c, -10 + k * 10, 10, 1, 0); } // 茅葺きの古民家
export function modelBesso(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x6f9a52); for (let i = 0; i < 18; i++) tree(c, -26 + c.rnd() * 52, -26 + c.rnd() * 52, 1.2, c.rnd() < 0.6 ? 1 : 0); for (let k = 0; k < 4; k++) { const x = -14 + (k % 2) * 26, z = -12 + (k >> 1) * 22; cottage(c, x, z, 10, 8, [0x6b4a32, 0xe6dcc8, 0x3a3e44, 0xc8a46a][k], [0x2f4a3a, 0x8a3a2a, 0x3a3e44, 0x5a4a3a][k], 'z', 4); g.box(x + 6, 0.4, z + 2, 4, 0.2, 5, 0xa8865a); } }
export function modelNisetai(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x9ab07a); g.box(0, 0, -3, 16, 6.2, 10, 0xece6d6); g.gable(0, 6.2, -3, 16, 10, 2.6, 0x3a3e44, 'x', 0xece6d6, 0.5); for (const x of [-4, 4]) { c.wa.box(x, 1, 2.05, 3, 1.2, 0.04, 0xffe0a8); c.wa.box(x, 4, 2.05, 3, 1.2, 0.04, 0xffe0a8); g.box(x, 0, 3.4, 1.6, 2.2, 0.1, 0x6b4a32); } g.box(8, 0.3, 8, 1.8, 1.4, 4, 0xf2f2f2); } // 玄関が 2 つの二世帯住宅
export function modelHiraya(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x9ab07a); barn(c, -2, -3, 18, 10, 3.0, 0xf2ece0, 0x3a3e44, 'x', 2.0); c.wa.box(-2, 0.4, 2.05, 12, 2.2, 0.04, 0xffe0a8); g.box(-2, 0, 3.8, 14, 0.4, 3, 0xa8865a); g.box(8, 0.3, 8, 1.8, 1.4, 4, 0x9aa0a6); } // ウッドデッキの平屋
export function modelGarageHouse(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xa8a49c); g.box(0, 0, -2, 16, 8, 12, 0x3a3e44); g.box(-3, 0.1, 4.05, 8, 3.4, 0.05, 0x9aa0a6); c.wa.box(4, 4.6, 4.05, 6, 2.4, 0.04, 0xffe0a8); g.box(-3, 0.3, 1, 2, 1.3, 4.4, 0xc8382a); }
export function modelGatedTown(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0x8ab06a); fenceRect(c, 86, 86, 2.4, 0xd8d4c8, 10); g.box(0, 0, 43, 10, 3.6, 2, 0xe6dcc8); g.box(0, 3.6, 43, 11, 0.4, 3, 0x3a3e44); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { if (i === 1 && j === 1) { g.cyl(0, 0, 0, 8, 0.4, 0x6aa0c8, 18); continue; } const x = -26 + i * 26, z = -26 + j * 26; cottage(c, x, z - 3, 14, 10, [0xf2efe6, 0xe6dcc8, 0xd8d4c8][(i + j) % 3], [0x3a3e44, 0x8a3a2a][(i + j) % 2], 'x', 6.4); g.box(x + 8, 0.6, z + 6, 4, 0.3, 4, 0x6aa0c8); } }
export function modelTinyVillage(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0x8aa868); for (let k = 0; k < 7; k++) { const x = -24 + k * 8; cottage(c, x, -2, 5, 3.6, [0xe8d8b8, 0x6aa0c8, 0xf2efe6, 0xc8a46a][k % 4], [0x3a3e44, 0x5a4a3a][k % 2], 'z', 2.4); g.box(x, 0, 2.2, 2, 0.2, 2.6, 0xa8865a); } for (let k = 0; k < 6; k++) tree(c, -24 + k * 9, 10, 0.8, 0); }
export function modelKasetsu(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xa8a49c); for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) { const x = -32 + k * 16, z = -20 + r * 13; g.box(x, 0.3, z, 13, 2.8, 7, 0xe8ecee); g.box(x, 3.1, z, 13.4, 0.2, 7.6, 0x9aa3ac); c.wa.box(x, 1.2, z + 3.53, 6, 1.0, 0.04, 0xffe8c0); } standSign(c, '仮設住宅', 38, 26, 1, 4); }
export function modelJiritsu(c: Ctx): void { pad(c, 28.4, 28.4, 0xa8a49c); block(c, 0, -2, 22, 16, 3, 0xece8de, { fh: 3.2, lit: 0.6, glass: 0xc8d8e0, band: 0x3a8a6a }); sign(c, '自立支援', 0, 0, 9.8, 6.05, 6); }

// ---- v49 教育・研究・学び ----
/** 校舎と校庭（トラック付き） */
function campus(c: Ctx, sx: number, sz: number, wall: number, band: number, floors: number, label: string, ground = true): void {
  const g = c.g; block(c, 0, -sz / 2 + 9, sx - 8, 12, floors, wall, { fh: 3.6, lit: 0.4, glass: 0x9fc0d8, band });
  if (ground) { slab(c, 0, sz / 4 + 2, sx - 10, sz / 2 - 6, 0xc9a77a, 0.08); g.box(0, 0.1, sz / 4 + 2, sx - 22, 0.05, 0.4, 0xffffff); }
  g.box(sx / 2 - 6, floors * 3.6, -sz / 2 + 9, 3, 3, 3, 0xe8e4da); g.cyl(sx / 2 - 6, floors * 3.6 + 3, -sz / 2 + 9, 1.2, 0.1, 0xffffff, 12); // 時計
  sign(c, label, 0, -sx / 4, 3.8, -sz / 2 + 15.06, Math.min(10, sx / 4));
}
export function modelPrivSchool(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xb8b0a0); campus(c, 88.4, 58.4, 0xe8dcc8, 0x8a2a3a, 5, '学園'); g.box(36, 0, 18, 12, 9, 16, 0xd8d4c8); g.gable(36, 9, 18, 12, 16, 2, 0x5a6168, 'z', 0xd8d4c8, 0.4); }
export function modelIntlSchool(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xb8b0a0); block(c, -6, -12, 40, 18, 3, 0xf2f2ee, { fh: 3.8, lit: 0.5, glass: 0x8fc0e0, band: 0x1f6fb2 }); slab(c, 0, 16, 52, 20, 0x5aa04a, 0.08); for (let k = 0; k < 3; k++) { g.cyl(-22 + k * 2.4, 0, 2, 0.08, 7, 0xd8d8d8, 5); g.box(-21 + k * 2.4, 6, 2, 2, 1.2, 0.05, [0xd8342a, 0x1f6fb2, 0xf6f6f6][k]); } sign(c, 'International', 0, -6, 7.8, -2.95, 10); }
export function modelForeignSchool(c: Ctx): void { pad(c, 58.4, 58.4, 0xb8b0a0); campus(c, 58.4, 58.4, 0xe6e2d8, 0x2a6a8a, 3, '外国人学校'); }
export function modelSpecialSchool(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xb8b0a0); block(c, -8, -10, 56, 22, 2, 0xf6f0e2, { fh: 3.6, lit: 0.5, glass: 0xa8d0e0, band: 0x3aa07a }); g.box(-8, 0, 3, 50, 0.3, 4, 0xd8d4c8); slab(c, 0, 20, 80, 14, 0x6aa04a, 0.08); g.box(30, 0, 18, 8, 0.4, 6, 0xc9b98c); g.box(26, 0, 4, 4, 0.1, 10, 0x9a948a); sign(c, '特別支援学校', 0, -8, 7.4, 1.05, 10); } // スロープと平らな庭
export function modelTeijisei(c: Ctx): void { pad(c, 58.4, 58.4, 0xb8b0a0); campus(c, 58.4, 58.4, 0xdcd8cc, 0x5a5f66, 3, '定時制'); }
export function modelKosen(c: Ctx): void { const g = c.g; pad(c, 118.4, 88.4, 0xb8b0a0); block(c, -20, -30, 70, 16, 4, 0xe8e4da, { fh: 3.6, lit: 0.5, glass: 0x9fc0d8, band: 0x2a5aa0 }); sawRoof(c, 36, -26, 32, 22, 6, 3, 0xd8d4cc); slab(c, -10, 18, 90, 40, 0xc9a77a, 0.08); for (let k = 0; k < 4; k++) g.box(40, 0, 10 + k * 8, 18, 3, 5, 0xd8dce0); g.cyl(-48, 0, 30, 0.2, 14, 0x9aa0a6, 6); obox(c, -48, 14, 30, [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0, 1], 3, 0.1, 0.1, 0x9aa0a6); sign(c, '高専', 0, -20, 14.8, -21.95, 6); } // 実習工場・風車の研究
export function modelSenmon(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 22, 16, 6, 0xf2ece6, { fh: 3.4, lit: 0.8, glass: 0x9fc8e0, band: 0xd8342a }); sign(c, '専門学校', 0, 0, 20.6, 6.05, 7); }
export function modelTandai(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xb8b0a0); block(c, -10, -12, 50, 18, 4, 0xece6d6, { fh: 3.8, lit: 0.5, glass: 0x9fc0d8, band: 0x6a4a8a }); for (let k = 0; k < 8; k++) tree(c, -36 + k * 9, 14, 1, k % 2 ? 3 : 0); g.box(30, 0, 12, 14, 7, 18, 0xe8e4da); sign(c, '短期大学', 0, -10, 15.4, -2.95, 8); }
export function modelKunren(c: Ctx): void { pad(c, 58.4, 58.4, 0xa8a49c); block(c, -10, -14, 32, 14, 3, 0xe6e2d8, { fh: 3.6, lit: 0.5, glass: 0x9fc0d8, band: 0x2a7a3a }); sawRoof(c, 6, 12, 40, 20, 6, 3, 0xd8d4cc); sign(c, '職業訓練校', 0, -10, 11.2, -6.95, 8); }
export function modelKyoshujo(c: Ctx): void { const g = c.g; pad(c, 118.4, 88.4, 0x7a9a5a); g.box(0, 0.06, 0, 100, 0.05, 6, 0x5a5e62); g.box(0, 0.06, -30, 100, 0.05, 6, 0x5a5e62); g.box(0, 0.06, 30, 100, 0.05, 6, 0x5a5e62); for (const x of [-48, 0, 48]) g.box(x, 0.06, 0, 6, 0.05, 66, 0x5a5e62); g.box(-24, 0.06, 15, 20, 0.05, 4, 0x5a5e62); // 教習コース（外周・クランク・S字）
  for (let k = 0; k < 6; k++) g.box(-40 + k * 14, 0.3, [0, -30, 30][k % 3], 2, 1.4, 4, [0xf2f2f2, 0xd8342a, 0x1f6fb2][k % 3]); g.cyl(24, 0, 15, 0.12, 4, 0x8a8f96, 5); g.box(24, 4, 15, 0.6, 1.6, 0.6, 0x2a2a2a);
  block(c, 40, 15, 22, 14, 2, 0xf2efe6, { fh: 3.6, lit: 0.5, glass: 0x9fc0d8, band: 0x2a8a4a }); sign(c, '教習所', 0, 40, 7.4, 22.05, 6); }
export function modelAccelerator(c: Ctx): void { const g = c.g; pad(c, 148.4, 148.4, 0x8aa86a); g.cyl(0, -0.2, 0, 60, 1.6, 0xd8d4cc, 48); g.cyl(0, -0.2, 0, 56, 1.65, 0x8aa86a, 48); // 円形の加速器のトンネル（地上の盛り土）
  block(c, 0, 0, 40, 30, 4, 0xe8ecee, { fh: 4, lit: 0.6, glass: 0x8fb0c8, band: 0x2a5aa0 }); g.box(-40, 0, 40, 30, 14, 20, 0xc8ccd2); g.cyl(40, 0, -40, 10, 18, 0xd8dce0, 20); g.blob(40, 18, -40, 10, 6, 10, 0xd8dce0, 14); sign(c, '研究機構', 0, 0, 16.4, 15.05, 8); }
export function modelNatLab(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0x8aa86a); for (let k = 0; k < 3; k++) block(c, -24 + k * 24, -20, 18, 22, 4, 0xe8ecee, { fh: 4, lit: 0.6, glass: 0x8fb0c8, band: 0x2a6a8a }); g.cyl(26, 0, 22, 8, 10, 0xeeeeea, 20); g.blob(26, 10, 22, 8, 6, 8, 0xeeeeea, 14); for (let k = 0; k < 8; k++) tree(c, -36 + k * 6, 26, 1, 0); sign(c, '研究所', 0, -24, 16.4, -8.95, 6); }
export function modelKishodai(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x8aa86a); block(c, -8, -10, 30, 16, 4, 0xf2f2ee, { fh: 3.6, lit: 0.6, glass: 0x8fb0c8, band: 0x1f6fb2 }); g.cyl(-8, 14.4, -10, 0.1, 8, 0x9aa0a6, 5); g.blob(-8, 22.6, -10, 1.6, 1.6, 1.6, 0xf2f2ee, 10); fenceRect2(c, 14, 16, 16, 14); g.box(14, 0, 16, 2, 1.4, 1.2, 0xf6f6f2); g.box(18, 0, 16, 0.15, 3, 0.15, 0x8a8f96); obox(c, 18, 3.2, 16, [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.8, 0.05, 0.05, 0x8a8f96); sign(c, '気象台', 0, -8, 3.6, -1.95, 5); } // 百葉箱と風向計・レーダー
export function modelQuakeObs(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x8aa86a); g.box(0, 0, -2, 12, 3, 10, 0xe6e2d8); g.box(0, 3, -2, 12.4, 0.3, 10.4, 0x5a6168); for (let k = 0; k < 3; k++) g.box(-4 + k * 4, 0, 8, 1.4, 0.8, 1.4, 0x8a8f96); g.cyl(8, 0, -8, 0.12, 9, 0x9aa0a6, 5); standSign(c, '観測所', 6, 6, 1, 3); }
export function modelHistMuseum(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0xc8c0b0); g.box(0, 0, -10, 60, 12, 40, 0xe6dcc8); g.gable(0, 12, -10, 64, 44, 6, 0x5a5048, 'x', 0xe6dcc8, 0.6); for (let k = 0; k < 8; k++) g.cyl(-21 + k * 6, 0, 11, 0.9, 12, 0xf2eee4, 10); g.box(0, 0, 14, 50, 0.8, 6, 0xd8d0c0); sign(c, '博物館', 0, 0, 13, 10.4, 10); for (let k = 0; k < 6; k++) tree(c, -36 + k * 14, 34, 1.1, 0); }
export function modelScienceMuseum(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0xc0c0bc); block(c, -10, -10, 50, 36, 3, 0xe8ecf0, { fh: 5, lit: 0.6, glass: 0x8fb8e0, band: 0x2a5aa0 }); g.blob(26, 8, 20, 12, 12, 12, 0xc8ccd2, 16); obox(c, -30, 12, 28, [0, 1, 0], [1, 0, 0], [0, 0, 1], 12, 1.2, 1.2, 0xf6f6f6); g.blob(-30, 25, 28, 1.6, 2.4, 1.6, 0xd8342a, 8); sign(c, '科学館', 0, -10, 15.4, 8.05, 8); } // ドームとロケット
export function modelBungakukan(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc0b8a8); g.box(-4, 0, -6, 34, 7, 22, 0x8a6a4a); g.gable(-4, 7, -6, 36, 24, 3, 0x2f3438, 'x', 0x8a6a4a, 0.6); c.wa.box(-4, 1, 5.05, 26, 4, 0.04, 0xffe8c0); for (let k = 0; k < 6; k++) tree(c, -24 + k * 9, 20, 1, 3); sign(c, '文学館', 0, -4, 5.4, 5.1, 5); }
export function modelKominkan(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0xb4b0a6); g.box(-8, 0, -2, 30, 6, 16, 0xe6e2d8); g.gable(-8, 6, -2, 32, 18, 2.4, 0x3a5a6a, 'x', 0xe6e2d8, 0.6); c.wa.box(-8, 1, 6.05, 24, 3, 0.04, 0xffe8c0); slab(c, 18, 0, 18, 22, 0xc9b98c, 0.06); sign(c, '公民館', 0, -8, 4.4, 6.1, 5); }
export function modelLifelong(c: Ctx): void { pad(c, 58.4, 58.4, 0xb4b0a6); block(c, 0, -6, 46, 30, 3, 0xf2ece2, { fh: 4, lit: 0.7, glass: 0x9fc8e0, band: 0xf08a1a }); sign(c, '生涯学習センター', 0, 0, 12.4, 9.05, 10); }
export function modelSeishonen(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0x7aa05a); for (let i = 0; i < 26; i++) tree(c, -40 + c.rnd() * 80, -40 + c.rnd() * 30, 1.2, c.rnd() < 0.5 ? 1 : 0); block(c, -10, 10, 40, 16, 3, 0xe8dcc8, { fh: 3.4, lit: 0.5, glass: 0x9fc0d8, band: 0x2a7a3a }); slab(c, 24, 26, 30, 24, 0xc9a77a, 0.06); for (let k = 0; k < 6; k++) { g.box(-36 + k * 6, 0, 34, 3, 2.4, 3, 0xc8a46a); g.gable(-36 + k * 6, 2.4, 34, 3, 3, 1.4, 0x5a4a3a, 'x', 0xc8a46a, 0.2); } sign(c, '青少年の家', 0, -10, 10.6, 18.05, 8); } // 宿泊棟・キャンプのバンガロー
export function modelPlanetarium(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc0c0bc); g.cyl(0, 0, -4, 16, 8, 0xe8ecf0, 24); g.blob(0, 8, -4, 16, 12, 16, 0xd8dce0, 20); g.box(0, 0, 14, 20, 5, 6, 0xf2f2ee); c.wa.box(0, 0.8, 17.05, 16, 3, 0.04, 0xbfe0f0); sign(c, 'プラネタリウム', 0, 0, 5.3, 17.1, 10); }

// ---- v49 医療・福祉・葬送 ----
/** 赤十字のような緑の十字の看板（医療） */
function crossSign(c: Ctx, x: number, y: number, z: number, col = 0x2aa05a): void { const g = c.g; g.box(x, y, z, 2.4, 0.7, 0.12, col); g.box(x, y - 0.85, z, 0.7, 2.4, 0.12, col); }
export function modelDental(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -4, 16, 12, 2, 0xf6f8fa, 0x3ab0d8, '歯科'); }
export function modelSpecialClinic(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 20, 16, 3, 0xf6f8fa, { fh: 3.4, lit: 0.6, glass: 0xa8d0e0, band: 0x2ab0a0 }); sign(c, 'クリニック', 0, 0, 10.4, 6.05, 7); crossSign(c, 8, 9.2, 6.1); }
export function modelPsychHospital(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0x8aa86a); for (let k = 0; k < 2; k++) block(c, -16 + k * 32, -18, 26, 18, 3, 0xf2efe6, { fh: 3.6, lit: 0.5, glass: 0xc8d8e0, band: 0x7a9a8a }); for (let i = 0; i < 18; i++) tree(c, -38 + c.rnd() * 76, 6 + c.rnd() * 34, 1.1, i % 3 === 0 ? 3 : 0); g.box(0, 0.06, 18, 4, 0.05, 50, 0xc9b98c); sign(c, 'こころの病院', 0, -16, 11, -8.95, 9); }
export function modelRehabHospital(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xb8b4ac); block(c, -10, -8, 50, 26, 4, 0xf6f8fa, { fh: 3.6, lit: 0.6, glass: 0xa8d0e0, band: 0x3aa07a }); slab(c, 30, 14, 20, 24, 0x6aa04a, 0.06); g.box(30, 0.2, 14, 14, 0.05, 1.2, 0xc9b98c); for (let k = 0; k < 4; k++) tree(c, 24 + k * 4, 24, 0.8, 3); sign(c, 'リハビリ病院', 0, -10, 14.8, 5.05, 9); crossSign(c, 12, 13.4, 5.1); }
export function modelRyoyo(c: Ctx): void { pad(c, 58.4, 58.4, 0xb8b4ac); block(c, 0, -6, 46, 26, 3, 0xf2efe6, { fh: 3.6, lit: 0.5, glass: 0xc8d8e0, band: 0x8a7a6a }); sign(c, '療養病院', 0, 0, 11, 7.05, 7); }
export function modelHospice(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x8aa86a); g.box(0, 0, -8, 40, 4, 16, 0xf6f0e2); g.gable(0, 4, -8, 42, 18, 3, 0x8a6a4a, 'x', 0xf6f0e2, 0.8); c.wa.box(0, 0.6, 0.05, 34, 2.4, 0.04, 0xffe0a8); slab(c, 0, 16, 50, 20, 0x7ab05a, 0.06); for (let k = 0; k < 8; k++) g.blob(-20 + k * 5.6, 0.5, 20, 1.2, 0.5, 1.2, [0xe84a6a, 0xf6d23a, 0xffffff][k % 3], 5); for (let k = 0; k < 4; k++) tree(c, -18 + k * 12, 10, 0.9, 3); sign(c, 'ホスピス', 0, 0, 2.8, 0.1, 5); }
export function modelDialysis(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); block(c, 0, -2, 20, 16, 2, 0xf6f8fa, { fh: 3.6, lit: 0.7, glass: 0xa8d0e0, band: 0x2a7ad8 }); sign(c, '透析', 0, 0, 7.6, 6.05, 4); crossSign(c, 7, 6.6, 6.1); }
export function modelHokenjo(c: Ctx): void { pad(c, 58.4, 28.4, 0xb4b0a6); block(c, -4, -2, 40, 18, 3, 0xece8e0, { fh: 3.6, lit: 0.5, glass: 0x9fc0d8, band: 0x2aa05a }); sign(c, '保健所', 0, -4, 11, 7.05, 6); }
export function modelBloodRoom(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -4, 16, 12, 1, 0xf6f6f6, 0xd8342a, '献血ルーム'); }
export function modelPharmacy(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -4, 14, 10, 1, 0xf6f8fa, 0x2aa05a, '調剤薬局'); crossSign(c, 5, 4.2, 1.2); }
export function modelDayService(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x9ab07a); cottage(c, -2, -4, 18, 10, 0xf6f0e2, 0x8a6a4a, 'x', 3.2); g.box(8, 0.3, 8, 2, 1.8, 4.4, 0xf6f6f6); g.box(8, 0.3, 6, 1.9, 0.1, 0.05, 0x2a7ad8); standSign(c, 'デイサービス', -6, 10, 1, 4); }
export function modelShuro(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -4, 18, 12, 1, 0xf6f2e0, 0xf08a1a, 'パン工房'); g.box(-6, 0, 6, 4, 0.8, 1.2, 0xc8a46a); } // 就労支援の工房とお店
export function modelYogo(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0x9ab07a); for (let k = 0; k < 3; k++) cottage(c, -20 + k * 14, -4, 11, 9, [0xf6f0e2, 0xe8dcc8, 0xf2e8d0][k], [0x2f4a6a, 0x8a3a2a, 0x3a5a3a][k], 'x', 5.6); g.box(18, 0, 6, 6, 0.4, 4, 0xc9b98c); g.box(16, 0, 6, 0.2, 2.6, 0.2, 0xf6c23a); g.box(20, 0, 6, 0.2, 2.6, 0.2, 0xf6c23a); g.box(18, 2.6, 6, 4.4, 0.2, 0.2, 0xf6c23a); } // 家庭的な小舎制の家
export function modelBoshi(c: Ctx): void { pad(c, 28.4, 28.4, 0x9ab07a); slabBlock(c, 0, -4, 22, 3, 0xf6eee0, 0xf2c8b8); }
export function modelJisou(c: Ctx): void { pad(c, 58.4, 28.4, 0xb4b0a6); block(c, -4, -2, 40, 18, 2, 0xf2efe6, { fh: 3.8, lit: 0.5, glass: 0xc8d8e0, band: 0xf08a6a }); sign(c, '児童相談所', 0, -4, 7.8, 7.05, 8); }
export function modelHoukatsu(c: Ctx): void { pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -4, 18, 12, 1, 0xf2efe6, 0x3aa07a, '包括支援'); }
export function modelNokotsudo(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb8b0a0); block(c, 0, -2, 20, 16, 4, 0xd8d0c0, { fh: 3.4, lit: 0.2, glass: 0x8a7a6a, band: 0x5a4a3a }); g.gable(0, 13.6, -2, 20, 16, 3, 0x3a3e44, 'x', 0xd8d0c0, 0.6); sign(c, '納骨堂', 0, 0, 2.4, 6.05, 5); }
export function modelPetCemetery(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0x8aa86a); for (let r = 0; r < 3; r++) for (let k = 0; k < 12; k++) { g.box(-24 + k * 4.2, 0, -6 + r * 5, 1.2, 1.0, 0.5, 0x9a9a92); g.blob(-24 + k * 4.2, 0.2, -5 + r * 5, 0.4, 0.2, 0.4, [0xe84a6a, 0xf6d23a, 0xffffff][(k + r) % 3], 4); } barn(c, 20, 6, 10, 8, 3, 0xece6d6, 0x3a3e44); standSign(c, 'ペット霊園', 14, 11, 1, 4); }

// ---- v49 行政・治安・防衛・市の現場 ----
/** 官庁の建物（中層・旗竿） */
function govBlock(c: Ctx, x: number, z: number, w: number, d: number, floors: number, label: string, band = 0x2a4a7a, wall = 0xe6e2d8): void { const g = c.g; block(c, x, z, w, d, floors, wall, { fh: 3.8, lit: 0.6, glass: 0x8fb0c8, band }); g.cyl(x + w / 2 - 2, 0, z + d / 2 + 4, 0.1, 9, 0xd8d8d8, 5); g.box(x + w / 2 - 1, 8, z + d / 2 + 4, 2, 1.3, 0.05, 0xffffff); g.cyl(x + w / 2 - 1, 8.65, z + d / 2 + 4.03, 0.35, 0.02, 0xd8342a, 10); sign(c, label, 0, x, 3.8, z + d / 2 + 0.06, Math.min(10, w * 0.5)); }
export function modelKencho(c: Ctx): void { const g = c.g; pad(c, 118.4, 88.4, 0xc0bcb2); block(c, 0, -14, 40, 30, 18, 0xe2ded4, { fh: 4, lit: 0.6, glass: 0x7a9ab8, band: 0x2a4a7a }); g.box(0, 72, -14, 14, 4, 14, 0xd8d4c8); block(c, -40, 4, 30, 30, 4, 0xe8e4da, { fh: 4, lit: 0.5, glass: 0x8fb0c8, band: 0x2a4a7a }); block(c, 40, 4, 30, 30, 4, 0xe8e4da, { fh: 4, lit: 0.5, glass: 0x8fb0c8, band: 0x2a4a7a }); slab(c, 0, 30, 60, 22, 0x7ab05a, 0.08); sign(c, '県庁', 0, 0, 4, 1.06, 8); }
export function modelZeimusho(c: Ctx): void { pad(c, 58.4, 28.4, 0xb8b4ac); govBlock(c, -4, -2, 40, 16, 4, '税務署'); }
export function modelHellowork(c: Ctx): void { pad(c, 58.4, 28.4, 0xb8b4ac); govBlock(c, -4, -2, 40, 16, 3, 'ハローワーク', 0x2a8a4a); }
export function modelNenkin(c: Ctx): void { pad(c, 28.4, 28.4, 0xb8b4ac); govBlock(c, 0, -2, 22, 14, 3, '年金事務所', 0x2a6a8a); }
export function modelMenkyo(c: Ctx): void { const g = c.g; pad(c, 118.4, 88.4, 0x9aa088); govBlock(c, -24, -24, 56, 24, 3, '免許センター', 0x2a5aa0); g.box(20, 0.06, 18, 60, 0.05, 40, 0x5a5e62); g.box(20, 0.08, 18, 50, 0.05, 30, 0x9aa088); for (let k = 0; k < 4; k++) g.box(-6 + k * 16, 0.3, 37, 2, 1.4, 4, 0xf2f2f2); slab(c, -30, 24, 50, 30, 0x5a5e62, 0.06); parkedCars(c, 50, 24); }
export function modelNyukan(c: Ctx): void { pad(c, 58.4, 58.4, 0xb8b4ac); govBlock(c, 0, -8, 46, 28, 5, '出入国在留管理局', 0x1f3f8a); }
export function modelKensatsu(c: Ctx): void { pad(c, 58.4, 28.4, 0xb8b4ac); govBlock(c, -4, -2, 40, 16, 5, '検察庁', 0x3a3e44, 0xd8d4cc); }
export function modelKasai(c: Ctx): void { pad(c, 58.4, 28.4, 0xb8b4ac); govBlock(c, -4, -2, 40, 16, 3, '家庭裁判所', 0x5a4a6a); }
export function modelKochisho(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0xa8a49c); fenceRect(c, 84, 84, 5, 0xb8b4ac, 8); block(c, 0, -6, 50, 40, 5, 0xd0ccc2, { fh: 3.4, lit: 0.3, glass: 0x6a7a8a, band: 0x5a5f66 }); for (const p of [[-38, -38], [38, -38], [-38, 38], [38, 38]]) { g.box(p[0], 0, p[1], 4, 9, 4, 0xc0bcb2); c.wa.box(p[0], 9.2, p[1], 0.6, 0.6, 0.6, 0xfff2c0); } }
export function modelShonenin(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0x9aa088); fenceRect(c, 84, 84, 3, 0xb8b4ac, 8); block(c, -14, -18, 44, 20, 3, 0xe6e2d8, { fh: 3.4, lit: 0.5, glass: 0x8fb0c8, band: 0x2a6a5a }); slab(c, 10, 18, 50, 30, 0xc9a77a, 0.06); for (let k = 0; k < 4; k++) g.box(-34, 0, 4 + k * 8, 10, 0.3, 6, 0x6a9a4a); } // 寮・グラウンド・実習の畑
export function modelPoliceAcademy(c: Ctx): void { const g = c.g; pad(c, 118.4, 88.4, 0xa8a49c); govBlock(c, -24, -24, 56, 22, 4, '警察学校', 0x1f3f8a); slab(c, 20, 18, 64, 40, 0xc9a77a, 0.06); for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) { g.box(4 + k * 3, 0, 8 + r * 4, 0.6, 1.7, 0.4, 0x1f2f4a); g.blob(4 + k * 3, 1.9, 8 + r * 4, 0.25, 0.25, 0.25, 0x1f2f4a, 4); } } // 整列する訓練
export function modelKidotai(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xa8a49c); govBlock(c, -18, -12, 40, 20, 3, '機動隊', 0x1f3f8a); for (let k = 0; k < 6; k++) { g.box(14 + (k % 3) * 9, 0.4, 6 + Math.floor(k / 3) * 12, 2.6, 3, 8, 0x2a4a8a); g.box(14 + (k % 3) * 9, 3.4, 6 + Math.floor(k / 3) * 12, 2.6, 0.3, 8, 0xf6f6f6); } }
export function modelCoastGuard(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xc0bcb2); slip(c, 88.4, 4, 29.2); govBlock(c, -18, -18, 40, 14, 3, '海上保安部', 0x1f4f8a); g.blob(0, 0.2, 16, 18, 2, 4, 0xf6f6f6, 10); g.box(0, 2, 16, 26, 0.3, 7, 0x1f4f8a); g.box(-4, 2.2, 16, 10, 4, 5, 0xf6f6f6); g.box(-4, 6.2, 16, 3, 3, 3, 0xf6f6f6); obox(c, 10, 1.6, 16, [1, 0, 0], [0, 1, 0], [0, 0, 1], 6, 0.2, 3.6, 0x1f4f8a); }
export function modelKenekijo(c: Ctx): void { pad(c, 58.4, 28.4, 0xc0bcb2); govBlock(c, -4, -2, 40, 16, 2, '検疫所', 0x2aa0a0); }
export function modelNavyBase(c: Ctx): void { const g = c.g; pad(c, 148.4, 118.4, 0xa8a49c); slip(c, 148.4, 10, 59.2); govBlock(c, -40, -40, 50, 22, 4, '海上自衛隊', 0x1f2f4a); for (let k = 0; k < 2; k++) { const z = 22 + k * 22; g.blob(10, 0.2, z, 40, 2.4, 5, 0x7a838c, 12); g.box(10, 2.4, z, 60, 3, 8, 0x8a939c); g.box(6, 5.4, z, 14, 6, 6, 0x8a939c); g.box(6, 11.4, z, 4, 6, 3, 0x8a939c); g.cyl(26, 5.4, z, 1.2, 2, 0x6a737c, 10); g.box(-14, 5.4, z, 2, 1, 1, 0x6a737c); } g.box(-40, 0, 40, 6, 1, 70, 0x9aa0a6); }
export function modelAirBase(c: Ctx): void { const g = c.g; pad(c, 178.4, 118.4, 0x8aa86a); g.box(0, 0.06, 20, 170, 0.05, 14, 0x4a4e52); for (let k = 0; k < 16; k++) g.box(-80 + k * 10.6, 0.1, 20, 5, 0.02, 0.6, 0xffffff); for (let k = 0; k < 3; k++) { g.box(-50 + k * 30, 0, -34, 24, 10, 20, 0x8a939c); g.cyl(-50 + k * 30, 10, -34, 12, 0.1, 0x8a939c, 3); } g.box(60, 0, -30, 6, 22, 6, 0xd8d4cc); g.box(60, 22, -30, 9, 4, 9, 0x5a7a8a); for (let k = 0; k < 3; k++) { const x = -20 + k * 14; obox(c, x, 1.4, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1], 6, 0.8, 0.8, 0x8a939c); obox(c, x - 1, 1.6, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1], 2.4, 0.1, 5, 0x8a939c); } govBlock(c, 50, 40, 40, 16, 3, '航空自衛隊', 0x2a4a7a); }
export function modelRadarSite(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x8a9a7a); g.box(0, 0, 0, 16, 18, 16, 0xe6e2d8); g.blob(0, 22, 0, 9, 8, 9, 0xf6f6f2, 16); for (let k = 0; k < 2; k++) g.box(-16 + k * 32, 0, 18, 8, 4, 6, 0xd8d4cc); fenceRect(c, 56, 56, 2.4, 0x8a8f96, 8); }
export function modelAmmoDepot(c: Ctx): void { const g = c.g; pad(c, 118.4, 88.4, 0x7a9a5a); fenceRect(c, 116, 86, 2.6, 0x8a8f96, 12); for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const x = -40 + i * 26, z = -18 + j * 30; g.blob(x, 0, z, 8, 5, 6, 0x6a9a4a, 10); g.box(x, 0, z + 5.8, 4, 3, 0.4, 0x6a737c); } }
export function modelGikai(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc0bcb2); g.box(0, 0, -6, 40, 10, 26, 0xe6e2d8); g.blob(0, 10, -6, 10, 6, 10, 0x6a8a9a, 14); for (let k = 0; k < 6; k++) g.cyl(-15 + k * 6, 0, 8, 0.8, 10, 0xf2eee4, 10); g.box(0, 10, 8, 34, 1, 2.4, 0xe6e2d8); sign(c, '市議会', 0, 0, 11.2, 9.25, 6); }
export function modelSeisoJimusho(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xa8a49c); govBlock(c, -14, -16, 26, 14, 2, '清掃事務所', 0x2a8a4a); for (let k = 0; k < 6; k++) { g.box(-20 + k * 7, 0.4, 14, 2.4, 2.6, 6, 0xf6f6f6); g.box(-20 + k * 7, 0.4, 10.5, 2.3, 2.2, 1.5, 0x2a8a4a); } }
export function modelDoroJimusho(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xa8a49c); govBlock(c, -14, -16, 26, 14, 2, '道路維持事務所', 0xf08a1a); for (let k = 0; k < 4; k++) g.box(-18 + k * 10, 0.4, 14, 3, 3, 7, 0xf6c23a); for (let k = 0; k < 6; k++) g.cyl(16 + (k % 3) * 2.5, 0, 20 + Math.floor(k / 3) * 2.5, 0.5, 1.2, 0xf08a1a, 8, undefined, 0.15); g.blob(18, 1.6, -18, 6, 3, 5, 0x8a7a6a, 7); }
export function modelYukisute(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x9a9a92); for (let k = 0; k < 3; k++) g.blob(-24 + k * 24, 2, -4, 12, 6, 10, 0xf2f6fa, 10); g.box(30, 0, 18, 4, 3, 7, 0xf08a1a); g.box(32.5, 0.6, 18, 1.2, 2, 6, 0x5a5f66); slab(c, 0, 22, 84, 10, 0x6a7a8a, 0.08); }
export function modelSuibo(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xa8a49c); g.box(0, 0, -2, 16, 5, 12, 0x8a939c); g.gable(0, 5, -2, 16, 12, 1.6, 0x5a6168, 'x', 0x8a939c, 0.3); for (let k = 0; k < 10; k++) g.box(-6 + (k % 5) * 2.6, (k / 5 | 0) * 0.7, 7, 2.2, 0.6, 1.2, 0xc8b89a); sign(c, '水防倉庫', 0, 0, 2.4, 4.05, 5); } // 土のう

// ---- v49 交通の施設 ----
export function modelServiceArea(c: Ctx): void { const g = c.g; pad(c, 118.4, 88.4, 0x8a8e92); block(c, 0, -26, 60, 22, 2, 0xf2efe6, { fh: 4.4, lit: 0.8, glass: 0xbfe0f0, band: 0x2a7a3a }); for (let r = 0; r < 3; r++) for (let k = 0; k < 16; k++) if (c.rnd() < 0.7) g.box(-48 + k * 6.2, 0.3, -2 + r * 12, 2, 1.4, 4.4, [0xf2f2f2, 0x1e1e1e, 0x9aa0a6, 0xc8382a, 0x2a5aa0][(r + k) % 5]); for (let k = 0; k < 4; k++) g.box(-40 + k * 26, 0.4, 36, 2.6, 3.2, 12, [0xf6f6f6, 0x2a8a4a, 0xf6c23a, 0xd8342a][k]); g.box(48, 0, 30, 10, 5, 8, 0xd8342a); g.box(48, 5, 30, 14, 0.4, 12, 0xf6f6f6); sign(c, 'サービスエリア', 0, 0, 9.2, -14.95, 12); }
export function modelParkingArea(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x8a8e92); g.box(-28, 0, -16, 20, 4, 10, 0xf2efe6); g.box(-28, 4, -16, 22, 0.4, 12, 0x5a6168); for (let k = 0; k < 10; k++) if (c.rnd() < 0.6) g.box(-12 + k * 5, 0.3, 4, 2, 1.4, 4.4, [0xf2f2f2, 0x1e1e1e, 0x9aa0a6][k % 3]); for (let k = 0; k < 3; k++) g.box(-6 + k * 14, 0.4, 20, 2.6, 3.2, 12, 0xf6f6f6); for (let k = 0; k < 6; k++) tree(c, 30 + (k % 2) * 6, -20 + Math.floor(k / 2) * 10, 1, 0); standSign(c, 'P', -14, -6, 2, 2); }
export function modelTollGate(c: Ctx): void { const g = c.g; pad(c, 88.4, 28.4, 0x6a6e72); g.box(0, 6, 0, 84, 1.4, 12, 0x2a7a3a); for (let k = 0; k < 9; k++) { g.box(-36 + k * 9, 0, 0, 1.6, 6, 3, 0xf2efe6); c.wa.box(-36 + k * 9, 6.2, 6.05, 3, 0.8, 0.05, k % 3 === 0 ? 0x8aff8a : 0xffe8a8); } sign(c, 'ETC', 0, 0, 6.2, 6.06, 6); }
export function modelJct(c: Ctx): void { const g = c.g; pad(c, 118.4, 118.4, 0x7aa05a); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, x = Math.cos(a) * 34, z = Math.sin(a) * 34, h = 6 + 5 * Math.sin(a * 2); obox(c, x, h, z, [-Math.sin(a), 0, Math.cos(a)], [0, 1, 0], [Math.cos(a), 0, Math.sin(a)], 7.2, 0.6, 4, 0x9aa0a6); g.box(x, 0, z, 1.6, h, 1.6, 0xb8b4ac); } g.box(0, 12, 0, 118, 1.2, 9, 0x9aa0a6); g.box(0, 18, 0, 9, 1.2, 118, 0x9aa0a6); for (let k = 0; k < 8; k++) { g.box(-50 + k * 14, 0, 0, 1.6, 12, 1.6, 0xb8b4ac); g.box(0, 0, -50 + k * 14, 1.6, 18, 1.6, 0xb8b4ac); } }
export function modelVentTower(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xa8a49c); g.box(0, 0, 0, 12, 30, 12, 0xd8d4cc); for (let k = 0; k < 6; k++) g.box(0, 6 + k * 4, 6.05, 10, 2, 0.05, 0x8a939c); g.box(0, 30, 0, 13, 1, 13, 0x9aa0a6); }
export function modelParkRide(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x6a6e72); for (let f = 0; f < 4; f++) { g.box(0, f * 3, -2, 76, 0.4, 40, 0xb8b4ac); for (let k = 0; k < 20; k++) if (c.rnd() < 0.6) g.box(-36 + k * 3.8, f * 3 + 0.4, -14 + (k % 2) * 24, 1.8, 1.3, 4, [0xf2f2f2, 0x1e1e1e, 0x9aa0a6, 0xc8382a][k % 4]); } for (let k = 0; k < 6; k++) g.box(-36 + k * 14.4, 0, 18, 1, 12, 1, 0x9aa0a6); g.box(0, 0, 24, 30, 3, 4, 0xe8e4da); sign(c, 'P&R', 0, 0, 9, 18.1, 6); }
export function modelTruckStation(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x6a6e72); for (let k = 0; k < 8; k++) { g.box(-34 + k * 9, 0.6, 8, 2.6, 3.6, 12, [0xf6f6f6, 0x2a5aa0, 0xd8342a, 0x3a8a4a][k % 4]); g.box(-34 + k * 9, 0.6, 0.2, 2.5, 2.8, 3, 0x9aa0a6); } block(c, 0, -20, 40, 14, 2, 0xe6e2d8, { fh: 3.4, lit: 0.8, glass: 0xbfe0f0, band: 0x2a5aa0 }); sign(c, 'トラックステーション', 0, 0, 7.2, -12.95, 12); }
export function modelCoinParking(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x5a5e62); parkingLines(c, -12, 12, -6, 5, 8); parkingLines(c, -12, 12, 6, 5, 8); for (let k = 0; k < 8; k++) if (c.rnd() < 0.6) g.box(-10.5 + k * 3, 0.3, k % 2 ? -6 : 6, 1.8, 1.3, 4, [0xf2f2f2, 0x1e1e1e, 0x9aa0a6, 0xc8382a][k % 4]); g.cyl(12, 0, 12, 0.12, 4, 0x8a8f96, 5); g.box(12, 4, 12, 2, 2, 0.2, 0xf6c23a); g.box(-12, 0, 12, 0.8, 1.4, 0.6, 0xe8e8e2); }
export function modelBikeParking(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x8a8e92); g.box(0, 2.6, 0, 24, 0.15, 20, 0x9aa3ac); for (const x of [-11, 11]) for (const z of [-9, 9]) g.box(x, 0, z, 0.2, 2.6, 0.2, 0x8a8f96); for (let r = 0; r < 4; r++) for (let k = 0; k < 14; k++) g.box(-10 + k * 1.5, 0.2, -7 + r * 4.6, 0.1, 1, 1.7, [0x2a2a2a, 0xd8342a, 0xf6f6f6, 0x2a5aa0][(r + k) % 4]); }
export function modelShinkansen(c: Ctx): void { const g = c.g; pad(c, 178.4, 58.4, 0xb8b4ac); g.box(0, 0, -4, 170, 12, 24, 0xd8dce0); g.box(0, 12, -4, 172, 1.2, 28, 0x9aa3ac); g.gable(0, 13.2, -4, 172, 28, 4, 0xc8ccd2, 'x', 0xd8dce0, 0.3); for (let k = 0; k < 16; k++) g.box(-80 + k * 10.6, 0, 9, 1.6, 12, 1.6, 0xb8b4ac); obox(c, -20, 13.6, -4, [1, 0, 0], [0, 1, 0], [0, 0, 1], 60, 1.4, 1.6, 0xf6f6f6); obox(c, -20, 13.6, -4, [1, 0, 0], [0, 1, 0], [0, 0, 1], 60, 0.3, 1.62, 0x1f4f9a); g.blob(41, 14.6, -4, 6, 1.4, 1.6, 0xf6f6f6, 10); // 高架ホームと新幹線
  block(c, 0, 20, 70, 14, 3, 0xe8ecf0, { fh: 4, lit: 0.8, glass: 0xbfe0f0, band: 0x1f4f9a }); sign(c, '新幹線', 0, 0, 12.4, 27.05, 10); }
export function modelFreightTerminal(c: Ctx): void { const g = c.g; pad(c, 178.4, 88.4, 0x9a968c); for (let k = 0; k < 6; k++) { g.box(0, 0.05, -30 + k * 6, 170, 0.1, 0.4, 0x6a5a48); g.box(0, 0.15, -30 + k * 6 - 0.7, 170, 0.12, 0.1, 0xa8adb2); g.box(0, 0.15, -30 + k * 6 + 0.7, 170, 0.12, 0.1, 0xa8adb2); } for (let k = 0; k < 18; k++) g.box(-70 + k * 8, 0.6, -24, 7, 2.6, 2.4, [0x2a7a3a, 0x2a5aa0, 0xd8a028, 0xc8382a][k % 4]); for (let k = 0; k < 30; k++) g.box(-80 + (k % 15) * 11, (k / 15 | 0) * 2.6, 22, 6, 2.5, 2.4, [0x2a7a3a, 0x2a5aa0, 0xd8a028, 0xc8382a, 0x8a8f96][k % 5]); for (let k = 0; k < 2; k++) { g.box(-30 + k * 60, 0, 6, 2, 12, 26, 0xe8b23a); g.box(-30 + k * 60, 12, 6, 2, 1.4, 30, 0xe8b23a); } sign(c, '貨物ターミナル', 0, 60, 3, 36.05, 12); }
export function modelBusDepot(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x6a6e72); g.box(0, 0, -16, 80, 6, 22, 0x9aa3ac); for (let k = 0; k < 10; k++) { g.box(-36 + k * 8, 0.6, 10, 2.6, 3, 10, [0xf6f6f6, 0x3a8a4a][k % 2]); g.box(-36 + k * 8, 1.8, 15.05, 2.4, 1, 0.05, 0x2a2a2a); } block(c, 30, 22, 20, 10, 2, 0xe6e2d8, { fh: 3.4, lit: 0.6, glass: 0x9fc0d8, band: 0x3a8a4a }); sign(c, 'バス営業所', 0, 0, 3, -4.95, 8); }
export function modelCableCar(c: Ctx): void { const g = c.g; pad(c, 58.4, 118.4, 0x7a9a5a); for (let k = 0; k < 10; k++) { const z = -54 + k * 12; g.box(0, k * 4, z, 10, 0.5, 12, 0xa8a49c); g.box(-2, k * 4 + 0.5, z, 0.12, 0.12, 12, 0xa8adb2); g.box(2, k * 4 + 0.5, z, 0.12, 0.12, 12, 0xa8adb2); g.box(0, 0, z, 9, k * 4, 1, 0xb8b4ac); } g.box(0, 0, -56, 14, 6, 8, 0xe6e2d8); g.box(0, 38, 56, 14, 6, 8, 0xe6e2d8); obox(c, -2, 18, 0, [0, 0.31, 0.95], [0, 0.95, -0.31], [1, 0, 0], 4, 1.8, 1.4, 0xd8342a); for (let i = 0; i < 20; i++) tree(c, (c.rnd() < 0.5 ? -1 : 1) * (10 + c.rnd() * 16), -50 + c.rnd() * 100, 1.2, 1); }
export function modelChairlift(c: Ctx): void { const g = c.g; pad(c, 28.4, 118.4, 0x7a9a5a); for (let k = 0; k < 8; k++) { const z = -52 + k * 15; g.cyl(0, 0, z, 0.3, 8 + k * 3, 0x8a8f96, 6); g.box(0, 8 + k * 3, z, 5, 0.3, 0.3, 0x8a8f96); } for (let k = 0; k < 14; k++) { const z = -50 + k * 7.6, y = 6 + (z + 52) * 0.2; g.box(-2.2, y, z, 1.2, 0.8, 0.8, 0x2a5aa0); g.box(2.2, y + 0.4, z + 3, 1.2, 0.8, 0.8, 0x2a5aa0); } g.box(0, 0, -56, 8, 4, 5, 0xe6e2d8); g.box(0, 0, 56, 8, 4, 5, 0xe6e2d8); }
export function modelTorokko(c: Ctx): void { const g = c.g; pad(c, 88.4, 28.4, 0x8a9a6a); g.box(0, 0.05, 0, 86, 0.1, 2.4, 0x6a5a48); for (const z of [-0.6, 0.6]) g.box(0, 0.2, z, 86, 0.1, 0.1, 0xa8adb2); g.box(-30, 0.6, 0, 6, 2.6, 2.2, 0x2a6a3a); for (let k = 0; k < 4; k++) { g.box(-20 + k * 7, 0.6, 0, 6, 1.0, 2.2, 0x8a5a2a); g.box(-20 + k * 7, 2.6, 0, 6.2, 0.15, 2.4, 0xc8382a); for (const e of [-1, 1]) g.box(-20 + k * 7 + e * 2.9, 1.6, 0, 0.1, 1, 2.2, 0x6a4a2a); } barn(c, 28, -8, 14, 8, 3, 0x8a6a4a, 0x3a3e44); standSign(c, 'トロッコ', 30, 8, 1.2, 3); }
export function modelFerryTerminal(c: Ctx): void { const g = c.g; pad(c, 118.4, 88.4, 0xb8b4ac); slip(c, 118.4, 6, 44.2); block(c, -20, -22, 50, 22, 3, 0xe8ecf0, { fh: 4, lit: 0.7, glass: 0x9fd0ec, band: 0x1f4f8a }); g.box(20, 4, -4, 4, 0.6, 22, 0xd8dce0); g.blob(0, 0, 26, 40, 3, 8, 0xf6f6f2, 14); g.box(0, 3, 26, 64, 4, 13, 0x1f4f8a); g.box(-4, 7, 26, 46, 5, 11, 0xf6f6f2); c.wa.box(-4, 8.6, 31.55, 42, 1.6, 0.04, 0xffe8b8); g.box(-10, 12, 26, 18, 3, 9, 0xf6f6f2); g.cyl(10, 12, 26, 1.4, 4, 0xd8342a, 10); for (let k = 0; k < 6; k++) g.box(40 + (k % 2) * 4, 0.3, -24 + (k >> 1) * 6, 2.4, 3, 9, [0xf6f6f6, 0x2a5aa0][k % 2]); sign(c, 'フェリー', 0, -20, 12.4, -10.95, 8); }
export function modelMarina(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0xc0bcb2); slip(c, 88.4, -14, 44.2); for (let k = 0; k < 3; k++) { g.box(-10 + k * 22, 0.1, 14, 2, 0.3, 54, 0xc8b89a); for (let j = 0; j < 6; j++) for (const e of [-1, 1]) { const x = -10 + k * 22 + e * 5, z = -6 + j * 8; g.blob(x, 0.3, z, 1.2, 0.5, 3.2, 0xf6f6f6, 8); g.cyl(x, 0.5, z, 0.08, 9, 0xd8d8d8, 4); } } block(c, -24, -30, 36, 16, 2, 0xf6f2ea, { fh: 3.8, lit: 0.7, glass: 0x9fd0ec, band: 0x1f6fb2 }); sign(c, 'マリーナ', 0, -24, 7.8, -21.95, 6); }
export function modelFunadamari(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xbab4a8); slip(c, 58.4, -10, 29.2); for (let k = 0; k < 8; k++) { const x = -22 + k * 6.2; g.blob(x, 0.2, 10 + (k % 2) * 6, 1.6, 0.7, 4, [0xf6f6f2, 0x2a5aa0, 0xf6f6f2][k % 3], 8); g.box(x, 0.9, 9 + (k % 2) * 6, 1.4, 1.2, 1.6, 0xf6f6f2); } g.box(0, 0, -20, 40, 0.6, 3, 0x9a9a92); barn(c, -16, -22, 10, 6, 3, 0x6b5a48, 0x3a3e44); }
export function modelLock(c: Ctx): void { const g = c.g; pad(c, 88.4, 28.4, 0xb4b0a6); g.box(0, -1, 0, 84, 1.2, 12, 0x8a8a82); slab(c, 0, 0, 80, 10, 0x3d6f8f, 0.1); for (const x of [-30, 30]) { g.box(x, 0, -7, 2, 10, 2, 0xd8d4cc); g.box(x, 0, 7, 2, 10, 2, 0xd8d4cc); g.box(x, 10, 0, 2.4, 1.4, 16, 0xd8d4cc); g.box(x, 0.2, 0, 0.6, 6, 10, 0x5a6a7a); } g.box(0, 0, -10, 14, 4, 4, 0xe6e2d8); sign(c, '閘門', 0, 0, 2, -7.95, 4); }
export function modelSuimon(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0xb4b0a6); slab(c, 0, 0, 56, 12, 0x3d6f8f, 0.1); for (let k = 0; k < 4; k++) { g.box(-21 + k * 14, 0, 0, 2.4, 14, 14, 0xd8d4cc); if (k < 3) g.box(-14 + k * 14, 4, 0, 11, 6, 0.8, 0x2a5a8a); } g.box(0, 14, 0, 46, 2.4, 6, 0xd8d4cc); }
export function modelHangar(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x6a6e72); g.box(0, 0, -6, 70, 12, 40, 0xd8dce0); obox(c, 0, 13, -6, [1, 0, 0], [0, 1, 0], [0, 0, 1], 35, 1.6, 20, 0xc8ccd2); g.box(0, 0.2, 14.05, 60, 11, 0.05, 0x9aa3ac); obox(c, 0, 2, 22, [1, 0, 0], [0, 1, 0], [0, 0, 1], 9, 1.4, 1.4, 0xf6f6f6); obox(c, 0, 2.4, 22, [0, 0, 1], [0, 1, 0], [-1, 0, 0], 1.2, 0.15, 10, 0xf6f6f6); }
export function modelControlTower(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xa8a49c); g.cyl(0, 0, 0, 3, 34, 0xe6e2d8, 12); g.cyl(0, 34, 0, 6, 1, 0xd8d4cc, 12); g.cyl(0, 35, 0, 5.6, 4, 0x5a8aaa, 12, undefined, 6.2); g.cyl(0, 39, 0, 6.4, 0.6, 0xd8d4cc, 12); g.cyl(0, 39.6, 0, 0.12, 5, 0x9aa0a6, 4); c.wa.box(0, 44.4, 0, 0.5, 0.5, 0.5, 0xff3a3a); }
export function modelHeliTour(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0x7f8478); g.cyl(-12, 0.1, 0, 10, 0.1, 0x5a5e62, 20); g.box(-12, 0.25, 0, 6, 0.02, 1, 0xffffff); g.box(-14, 0.25, 0, 1, 0.02, 6, 0xffffff); g.blob(-12, 1.6, 0, 2, 1.4, 1.4, 0xd8342a, 10); obox(c, -15, 1.8, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1], 3, 0.25, 0.25, 0xd8342a); g.box(-12, 3.2, 0, 10, 0.08, 0.4, 0x2a2a2a); g.box(14, 0, 0, 16, 4, 10, 0xf2efe6); sign(c, 'ヘリ遊覧', 0, 14, 4.2, 5.05, 5); }
export function modelDeliveryRobot(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb0aca4); smallShop(c, 0, -6, 18, 10, 1, 0xf6f6f6, 0x3ac8a0, '配送ロボ'); for (let k = 0; k < 6; k++) { g.box(-8 + k * 3.2, 0.2, 6, 1.0, 0.8, 1.3, 0xf6f6f6); g.box(-8 + k * 3.2, 1.0, 6, 0.9, 0.08, 1.2, 0x3ac8a0); } }
export function modelAirshipMast(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x8aa86a); g.cyl(-30, 0, 0, 0.8, 24, 0xd8d4cc, 8); g.blob(4, 24, 0, 30, 7, 7, 0xe8ecf0, 16); g.box(4, 16, 0, 10, 2, 3, 0xd8dce0); obox(c, 32, 24, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1], 2, 4, 0.2, 0xd8342a); g.box(20, 0, 20, 14, 4, 8, 0xf2efe6); }

// ---- v49 エネルギー・インフラ・観測 ----
export function modelPumpedHydro(c: Ctx): void { const g = c.g; pad(c, 118.4, 118.4, 0x7a9a5a); g.box(-20, 0, -30, 70, 3, 44, 0x8a8a82); slab(c, -20, -30, 66, 40, 0x3d6f8f, 3.1); g.box(-20, 0, -8, 70, 16, 4, 0xc8c4bc); for (let k = 0; k < 3; k++) obox(c, 10 + k * 5, 8, 20, [0, -0.6, 0.8], [0, 0.8, 0.6], [1, 0, 0], 22, 1, 1, 0x7a838c); block(c, 24, 46, 40, 16, 2, 0xd8d4cc, { fh: 4, lit: 0.5, glass: 0x8fb0c8, band: 0x2a5aa0 }); for (let i = 0; i < 12; i++) tree(c, 36 + c.rnd() * 18, -50 + c.rnd() * 60, 1.2, 1); } // 上の池・ダム・水圧管・発電所
export function modelSolarThermal(c: Ctx): void { const g = c.g; pad(c, 118.4, 118.4, 0xc8b890); g.box(0, 0, 0, 6, 60, 6, 0xd8d4cc); g.box(0, 52, 0, 9, 8, 9, 0x5a5550); c.wa.box(0, 54, 4.6, 6, 4, 0.1, 0xffe08a); for (let r = 0; r < 4; r++) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, rr = 18 + r * 9, x = Math.cos(a) * rr, z = Math.sin(a) * rr; obox(c, x, 1.8, z, [Math.cos(a), 0.5, Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)], [-Math.cos(a) * 0.5, 0.87, -Math.sin(a) * 0.5], 1.4, 1.6, 0.05, 0x9ac0e0); } } // タワーと鏡（ヘリオスタット）
export function modelTidalPower(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xbab4a8); slip(c, 88.4, -6, 29.2); g.box(0, 0, 10, 84, 6, 6, 0xc8c4bc); for (let k = 0; k < 8; k++) g.box(-36 + k * 10, 6, 10, 4, 3, 4, 0x6a737c); for (let k = 0; k < 4; k++) { g.cyl(-24 + k * 16, -0.3, 22, 1.4, 1.2, 0xe8b23a, 10); g.cyl(-24 + k * 16, 0.9, 22, 0.15, 3, 0x9aa0a6, 4); } block(c, 0, -18, 30, 12, 2, 0xe6e2d8, { fh: 3.6, lit: 0.5, glass: 0x8fb0c8, band: 0x1f6fb2 }); } // 潮受け堤と波力ブイ
export function modelBiogas(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xa8a49c); for (let k = 0; k < 2; k++) { g.cyl(-14 + k * 18, 0, -10, 7, 6, 0x6a7a80, 16); g.blob(-14 + k * 18, 6, -10, 7, 4.4, 7, 0x4a5a64, 14); } g.box(14, 0, 14, 16, 5, 10, 0xd8d4cc); g.cyl(22, 0, -18, 0.6, 12, 0x9aa0a6, 8); c.wa.box(22, 12.2, -18, 0.6, 1, 0.6, 0xff8a2a); }
export function modelRdf(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xa8a49c); g.box(-6, 0, -6, 36, 12, 26, 0xc8ccd2); stack(c, 18, -16, 30, 1.2); for (let k = 0; k < 5; k++) g.cyl(-20 + k * 4, 0, 18, 0.9, 1.8, 0x8a7a5a, 8); }
export function modelPylon(c: Ctx): void { const g = c.g; pad(c, 28.4, 88.4, 0x8aa868, 0.02); for (const z of [-30, 30]) { for (const a of [-1, 1]) for (const b of [-1, 1]) obox(c, a * 1.6, 18, z + b * 1.6, [-a * 0.06, 1, -b * 0.06], [1, a * 0.06, 0], [0, b * 0.06, 1], 18, 0.2, 0.2, 0x9aa0a6); for (const y of [24, 30, 36]) g.box(0, y, z, 14 - (y - 24) * 0.3, 0.4, 0.4, 0x9aa0a6); g.box(0, 36, z, 0.6, 4, 0.6, 0x9aa0a6); c.wa.box(0, 40.5, z, 0.4, 0.4, 0.4, 0xff3a3a); } for (const x of [-6, 0, 6]) for (const y of [23.4, 29.4]) g.box(x, y, 0, 0.06, 0.06, 88, 0x3a3e44); } // 鉄塔と電線
export function modelDistrictHeat(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xb4b0a6); block(c, -6, -6, 36, 26, 3, 0xd8dce0, { fh: 4, lit: 0.4, glass: 0x8fb0c8, band: 0xd8342a }); for (let k = 0; k < 3; k++) g.cyl(20, 0, -18 + k * 9, 3, 12, 0xe6e6e2, 12); stack(c, -20, 18, 26, 1.2, false); sign(c, '地域冷暖房', 0, -6, 12.4, 7.05, 8); }
export function modelKyodoko(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xa8a49c); g.box(0, 0, 0, 8, 3, 6, 0xd8d4cc); g.box(0, 3, 0, 8.4, 0.3, 6.4, 0x5a6168); g.box(0, -0.5, 10, 26, 0.6, 6, 0x6a6e72); for (let k = 0; k < 3; k++) g.cyl(-8 + k * 8, 0, 10, 0.8, 0.1, 0x3a3e44, 10); sign(c, '共同溝', 0, 0, 1.2, 3.05, 4); }
export function modelGasHolder(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xa8a49c); for (let k = 0; k < 2; k++) { const x = -12 + k * 24; g.blob(x, 14, 0, 11, 11, 11, 0xeeeeea, 16); for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2; g.box(x + Math.cos(a) * 9, 0, Math.sin(a) * 9, 0.5, 10, 0.5, 0x8a8f96); } } fenceRect(c, 56, 56, 2.2, 0x8a8f96, 8); }
export function modelWaterTower(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xa8a49c); for (const a of [-3, 3]) for (const b of [-3, 3]) g.box(a, 0, b, 0.5, 18, 0.5, 0x9aa0a6); g.cyl(0, 18, 0, 5, 6, 0x6aa0c8, 14); g.blob(0, 24, 0, 5, 1.6, 5, 0x5a8ab0, 12); }
export function modelOilStockpile(c: Ctx): void { const g = c.g; pad(c, 148.4, 118.4, 0x9a968c); for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { const x = -56 + i * 28, z = -42 + j * 28; g.box(x, 0, z, 24, 1.2, 24, 0x8a8a82); tank(c, x, z, 10, 12, 0xe8e8e4); } fenceRect(c, 146, 116, 2.4, 0x8a8f96, 14); }
export function modelIrrigation(c: Ctx): void { const g = c.g; pad(c, 88.4, 28.4, 0x8aa868, 0.02); g.box(0, -0.6, 0, 88, 0.7, 5, 0x8a8a82); slab(c, 0, 0, 86, 3.6, 0x4a7a9a, 0.12); g.box(-30, 0, 0, 3, 3, 8, 0xd8d4cc); g.box(-30, 3, 0, 4, 0.4, 9, 0x5a6168); g.cyl(20, 1.6, 4, 2.2, 0.4, 0x8a6a42, 12); sign(c, '取水堰', 0, -30, 0.8, 4.05, 3); } // 用水路・取水堰・水車
export function modelSabo(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x7a8a5a); g.box(0, 0, 0, 54, 10, 6, 0xc8c4bc); g.box(0, 7, 0, 12, 3, 6.2, 0x8a8a82); for (let k = 0; k < 3; k++) g.box(-14 + k * 14, 2, 3.05, 1.4, 1.4, 0.05, 0x3a3e44); g.blob(0, 3, -14, 20, 4, 10, 0x8a7a6a, 8); for (let i = 0; i < 14; i++) tree(c, -26 + c.rnd() * 52, 10 + c.rnd() * 16, 1.1, 1); }
export function modelYusuichi(c: Ctx): void { const g = c.g; pad(c, 118.4, 118.4, 0x8aa868); g.box(0, 0, 0, 116, 3, 116, 0x7a9a5a); slab(c, 0, 0, 108, 108, 0x9ab878, 3.05); for (let k = 0; k < 6; k++) slab(c, -40 + k * 16, 10, 12, 60, 0x7aa860, 3.1); g.box(0, 3.1, -40, 80, 0.05, 6, 0xc9a77a); sign(c, '遊水地', 0, 0, 3.2, 58, 6); } // 堤に囲まれた低い原っぱ（ふだんは運動場や田）
export function modelGaikaku(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xa8a49c); g.cyl(-10, 0, -6, 9, 4, 0xd8d4cc, 20); g.cyl(-10, 4, -6, 9.2, 0.4, 0x8a8f96, 20); block(c, 14, 10, 24, 16, 2, 0xe6e2d8, { fh: 4, lit: 0.5, glass: 0x8fb0c8, band: 0x1f6fb2 }); sign(c, '地下放水路', 0, 14, 8.4, 18.05, 8); } // 地下の巨大な調圧水槽の入口
export function modelHaisuiki(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0xb4b0a6); g.box(-8, 0, -2, 30, 10, 14, 0xd8d4cc); for (let k = 0; k < 4; k++) obox(c, -18 + k * 6, 2, 8, [0, 0, 1], [0, 1, 0], [1, 0, 0], 4, 1, 1, 0x5a6a7a); slab(c, 16, 6, 20, 14, 0x3d6f8f, 0.12); sign(c, '排水機場', 0, -8, 7, 5.05, 6); }
export function modelCableLanding(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0xbab4a8); slip(c, 58.4, 4, 14.2); block(c, -8, -4, 30, 14, 2, 0xe8ecee, { fh: 3.6, lit: 0.3, glass: 0x6a8aa0, band: 0x2a5aa0 }); g.box(12, -0.2, 8, 0.6, 0.4, 14, 0xe8b23a); sign(c, '海底ケーブル', 0, -8, 7.4, 3.05, 8); }
export function modelSatStation(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x8aa868); for (let k = 0; k < 3; k++) { const x = -26 + k * 22; g.box(x, 0, 0, 3, 6, 3, 0xd8d4cc); obox(c, x, 9, 0, [0.6, 0.8, 0], [-0.8, 0.6, 0], [0, 0, 1], 0.4, 7, 7, 0xf6f6f2); } block(c, 30, 20, 20, 12, 2, 0xe6e2d8, { fh: 3.6, lit: 0.5, glass: 0x8fb0c8, band: 0x2a5aa0 }); }
export function modelRadioTelescope(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0x8aa868); g.box(0, 0, 0, 10, 14, 10, 0xd8d4cc); obox(c, 0, 26, 0, [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0, 1], 0.8, 18, 18, 0xf6f6f2); g.cyl(0, 14, 0, 0.5, 20, 0x9aa0a6, 6); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.box(Math.cos(a) * 34, 0, Math.sin(a) * 34, 3, 3, 3, 0xd8d4cc); obox(c, Math.cos(a) * 34, 5.4, Math.sin(a) * 34, [0.6, 0.8, 0], [-0.8, 0.6, 0], [0, 0, 1], 0.2, 3, 3, 0xf6f6f2); } }

// ---- v49 観光・レジャー・文化・まつり ----
export function modelObservatoryDeck(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x7a9a5a); g.blob(0, 0, 0, 26, 14, 26, 0x6f9a52, 12); g.box(0, 12, 0, 12, 2, 12, 0xc8c4bc); g.box(0, 14, 0, 6, 10, 6, 0xd8d4cc); g.box(0, 24, 0, 14, 0.6, 14, 0xd8d4cc); for (const a of [-6.6, 6.6]) { g.box(a, 24.6, 0, 0.12, 1.2, 14, 0x8a8f96); g.box(0, 24.6, a, 14, 1.2, 0.12, 0x8a8f96); } for (let i = 0; i < 12; i++) tree(c, -24 + c.rnd() * 48, -24 + c.rnd() * 48, 1, 1); }
export function modelSuspensionBridge(c: Ctx): void { const g = c.g; pad(c, 118.4, 28.4, 0x6f8a52); g.box(0, -6, 0, 100, 6, 24, 0x5a6a4a); slab(c, 0, 0, 90, 20, 0x3d6f6a, -5.5); for (const x of [-48, 48]) for (const z of [-1.6, 1.6]) g.box(x, 0, z, 0.6, 9, 0.6, 0x8a6a42); for (let k = 0; k < 24; k++) { const x = -46 + k * 4, sag = 3 * (1 - Math.pow(x / 48, 2)); g.box(x, 5 - sag * 0.6, 0, 4, 0.2, 2.4, 0xa8865a); for (const z of [-1.4, 1.4]) { g.box(x, 6.4 - sag * 0.6, z, 4, 0.08, 0.08, 0x6a6f76); g.box(x, 5 - sag * 0.6, z, 0.06, 1.4, 0.06, 0x6a6f76); } } }
export function modelWaterfallTrail(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x6a8a4a); g.box(0, 0, -20, 50, 26, 12, 0x7a7468); g.box(0, 0, -13.9, 8, 26, 0.3, 0xdfeef8); slab(c, 0, 0, 30, 20, 0x5a8aa8, 0.15); g.blob(0, 0.6, -10, 6, 1.2, 3, 0xffffff, 8); for (let k = 0; k < 10; k++) slab(c, 16 + Math.sin(k) * 3, -20 + k * 5, 3, 3, 0xb8a47a, 0.15); for (let i = 0; i < 16; i++) tree(c, (c.rnd() < 0.5 ? -1 : 1) * (18 + c.rnd() * 8), -20 + c.rnd() * 44, 1.1, 0); }
export function modelCave(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x7a8a5a); g.blob(0, 0, -6, 26, 14, 18, 0x8a8478, 10); g.blob(0, 2.4, 10, 5, 4, 1, 0x1a1a1a, 8); g.box(16, 0, 18, 12, 3.4, 7, 0xe6dcc8); sign(c, '鍾乳洞', 0, 16, 3.6, 21.55, 5); for (let i = 0; i < 10; i++) tree(c, -26 + c.rnd() * 52, -26 + c.rnd() * 20, 1, 0); }
export function modelZipline(c: Ctx): void { const g = c.g; pad(c, 28.4, 118.4, 0x6a8a4a); g.box(0, 0, -50, 6, 18, 6, 0x8a6a42); g.box(0, 18, -50, 8, 0.4, 8, 0xa8865a); g.box(0, 0, 50, 4, 3, 4, 0x8a6a42); obox(c, 0, 10.5, 0, [0, -0.15, 0.99], [0, 0.99, 0.15], [1, 0, 0], 50, 0.05, 0.05, 0x3a3e44); g.blob(0, 9.5, 8, 0.4, 0.8, 0.4, 0xf08a1a, 5); for (let i = 0; i < 20; i++) tree(c, (c.rnd() < 0.5 ? -1 : 1) * (5 + c.rnd() * 8), -50 + c.rnd() * 100, 1.3, 1); }
export function modelAthletic(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x7a9a5a); for (let k = 0; k < 6; k++) { const x = -20 + (k % 3) * 20, z = -12 + Math.floor(k / 3) * 24; for (const a of [-3, 3]) g.cyl(x + a, 0, z, 0.3, 6, 0x8a6a42, 6); g.box(x, 5, z, 7, 0.3, 2, 0xa8865a); g.box(x, 2, z + 2, 6, 3, 0.1, 0x6a5a3a); } for (let i = 0; i < 14; i++) tree(c, -26 + c.rnd() * 52, -26 + c.rnd() * 52, 1.2, 0); }
export function modelGlamping(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x7aa05a); for (let k = 0; k < 6; k++) { const x = -18 + (k % 3) * 18, z = -12 + Math.floor(k / 3) * 22; g.cyl(x, 0, z, 4, 0.3, 0xa8865a, 12); g.blob(x, 0.3, z, 3.6, 3.4, 3.6, 0xf2ece0, 12); c.wa.box(x, 1.2, z + 3.4, 1.4, 1.6, 0.05, 0xffd890); g.cyl(x + 5, 0, z + 2, 0.6, 0.4, 0x5a4a3a, 8); } for (let i = 0; i < 10; i++) tree(c, -26 + c.rnd() * 52, -26 + c.rnd() * 52, 1.2, 1); }
export function modelAutoCamp(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x7aa05a); for (let k = 0; k < 10; k++) { const x = -36 + (k % 5) * 18, z = -14 + Math.floor(k / 5) * 26; slab(c, x, z, 12, 10, 0xb8a47a, 0.06); g.box(x - 2, 0.3, z, 2, 1.6, 4.4, [0xf2f2f2, 0x2a5aa0, 0x5a7a3a][k % 3]); g.blob(x + 3, 0, z + 1, 2, 1.6, 2, [0xf08a1a, 0x3aa07a, 0xd8342a][k % 3], 6); } for (let i = 0; i < 14; i++) tree(c, -40 + c.rnd() * 80, -26 + c.rnd() * 52, 1.2, c.rnd() < 0.5 ? 1 : 0); }
export function modelCircuit(c: Ctx): void { const g = c.g; pad(c, 178.4, 118.4, 0x7aa05a); for (let k = 0; k < 64; k++) { const a = k / 64 * Math.PI * 2, x = Math.cos(a) * 74 + Math.cos(a * 3) * 8, z = Math.sin(a) * 44, x2 = Math.cos(a + 0.1) * 74 + Math.cos((a + 0.1) * 3) * 8, z2 = Math.sin(a + 0.1) * 44, dx = x2 - x, dz = z2 - z, L = Math.hypot(dx, dz); obox(c, (x + x2) / 2, 0.08, (z + z2) / 2, [dx / L, 0, dz / L], [0, 1, 0], [-dz / L, 0, dx / L], L / 2 + 0.4, 0.04, 5, 0x4a4e52); } g.box(0, 0, -50, 80, 8, 12, 0xe8ecf0); for (let k = 0; k < 20; k++) g.box(-38 + k * 4, 8, -50, 3.6, 0.3, 12, [0xd8342a, 0xf6f6f6][k % 2]); g.box(-20, 0, 50, 40, 6, 10, 0x9aa3ac); sign(c, 'サーキット', 0, 0, 4, -43.95, 12); for (let k = 0; k < 3; k++) g.box(-60 + k * 6, 0.3, -44, 2, 0.8, 4, [0xd8342a, 0xf6c23a, 0x2a5aa0][k]); }
export function modelKart(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0x6a6e72); for (let k = 0; k < 6; k++) g.box(0, 0.1, -20 + k * 8, 48, 0.05, 5, 0x3a3e44); for (let k = 0; k < 5; k++) g.box(k % 2 ? 22 : -22, 0.1, -16 + k * 8, 5, 0.05, 8, 0x3a3e44); for (let k = 0; k < 8; k++) g.box(-20 + k * 5, 0.2, -20 + (k % 6) * 8, 1, 0.6, 1.6, [0xd8342a, 0xf6c23a, 0x2a5aa0, 0x3a8a4a][k % 4]); for (let k = 0; k < 30; k++) g.cyl(-26 + (k % 15) * 3.6, 0, k < 15 ? -25 : 25, 0.5, 0.8, 0x1e1e1e, 8); }
export function modelHorseClub(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x86a85a); slab(c, -10, 4, 50, 34, 0xc9b08a, 0.08); rail(c, -10, 4, 50, 34, 0xf4f4f0); for (let k = 0; k < 4; k++) g.box(-26 + k * 10, 0, 4, 0.2, 1.0, 3, 0xffffff); cows(c, -10, 4, 40, 24, 4, 2); barn(c, 30, -12, 18, 10, 3.6, 0xf2ede0, 0x2f5a3a); }
export function modelSkateRink(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xb8b4ac); g.box(0, 0, 0, 70, 12, 44, 0xe8ecf0); g.cyl(0, 12, 0, 22, 0.1, 0xe8ecf0, 3); obox(c, 0, 14, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1], 35, 2.4, 22, 0xd8dce0); c.wa.box(0, 1, 22.05, 40, 4, 0.05, 0xbfe0f0); sign(c, 'スケート', 0, 0, 7, 22.1, 10); }
export function modelSkiJump(c: Ctx): void { const g = c.g; pad(c, 28.4, 148.4, 0x8aa868); obox(c, 0, 26, -40, [0, -0.6, 0.8], [0, 0.8, 0.6], [1, 0, 0], 26, 0.4, 3, 0xf6f6f6); g.box(0, 0, -60, 6, 44, 6, 0xd8d4cc); obox(c, 0, 6, 30, [0, -0.45, 0.89], [0, 0.89, 0.45], [1, 0, 0], 40, 0.2, 10, 0xf2f6fa); g.box(0, 0, 68, 24, 4, 8, 0xe6e2d8); }
export function modelRowing(c: Ctx): void { const g = c.g; pad(c, 58.4, 148.4, 0xbab4a8); g.box(4, -0.6, 0, 40, 0.7, 144, 0x8a8a82); slab(c, 4, 0, 38, 142, 0x3d6f8f, 0.12); for (let k = 0; k < 5; k++) g.box(4 - 15 + k * 7.5, 0.15, 0, 0.1, 0.1, 142, 0xf6f6f6); for (let k = 0; k < 3; k++) obox(c, -8 + k * 7.5, 0.3, -20 + k * 14, [0, 0, 1], [0, 1, 0], [-1, 0, 0], 6, 0.2, 0.3, 0xf6f6f6); g.box(-22, 0, -60, 10, 6, 20, 0xe6e2d8); }
export function modelBudokan(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc0b8a8); g.box(0, 0, -4, 40, 10, 30, 0xe6dcc8); g.gable(0, 10, -4, 44, 34, 7, 0x2f3438, 'x', 0xe6dcc8, 1.2); g.box(0, 0, 18, 30, 3, 6, 0x6b4a32); for (let k = 0; k < 5; k++) g.cyl(-20 + k * 2.6, 0.9, 24, 0.5, 0.05, 0xf6f6f6, 10); sign(c, '武道館', 0, 0, 7, 11.05, 6); }
export function modelSumoBeya(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb4ab9a); barn(c, 0, -3, 18, 14, 4.4, 0xe6dcc8, 0x2f3438, 'x', 3); g.box(0, 0, 5, 7, 0.6, 7, 0xc8a46a); g.cyl(0, 0.6, 5, 2.4, 0.06, 0xf2ece0, 16); for (let k = 0; k < 3; k++) g.box(-8 + k * 0.8, 0, 6, 0.4, 3, 0.1, [0x2a2a6a, 0xd8342a, 0xf6f6f6][k]); sign(c, '相撲部屋', 0, 0, 2.6, 4.05, 5); }
export function modelNohgaku(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc0b8a8); g.box(0, 0, -6, 40, 9, 30, 0xd8ccb4); g.gable(0, 9, -6, 42, 32, 5, 0x5a5048, 'x', 0xd8ccb4, 0.8); g.box(0, 0, 14, 14, 1, 10, 0xc8a46a); for (const a of [-6, 6]) for (const b of [10, 18]) g.cyl(a, 1, b, 0.3, 5, 0xa8865a, 6); g.gable(0, 6, 14, 14, 10, 2.6, 0x8a7a5a, 'z', 0xc8a46a, 0.4); g.box(-14, 1, 18, 14, 0.4, 2, 0xc8a46a); for (let k = 0; k < 3; k++) tree(c, -12 + k * 3, 21, 0.6, 1); }
export function modelKabukiza(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xc0b8a8); g.box(0, 0, -8, 70, 16, 34, 0xf2ece0); g.gable(0, 16, -8, 74, 38, 6, 0x2f3438, 'x', 0xf2ece0, 1); for (const x of [-26, 0, 26]) g.gable(x, 9, 10, 18, 4, 4, 0x2f3438, 'z', 0xf2ece0, 0.6); for (let k = 0; k < 10; k++) c.wa.box(-30 + k * 6.6, 6.4, 9.1, 0.8, 1.4, 0.8, 0xff4a2a); g.box(0, 0.6, 9.2, 60, 4, 0.1, 0x2a2a2a); for (let k = 0; k < 3; k++) g.box(-20 + k * 20, 0.6, 9.3, 18, 4, 0.05, [0x2a6a3a, 0xd88a2a, 0x2a2a2a][k]); sign(c, '歌舞伎座', 0, 0, 12, 9.15, 10); } // 定式幕の色
export function modelYose(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x9a948a); barn(c, 0, -2, 18, 14, 6, 0x6b4a32, 0x2f3438, 'x', 2.6); for (let k = 0; k < 6; k++) g.box(-7 + k * 2.8, 0.4, 5.1, 2.2, 3.4, 0.05, [0xf6f6f2, 0xd8342a, 0x2a2a6a][k % 3]); for (let k = 0; k < 4; k++) c.wa.box(-6 + k * 4, 4.4, 5.6, 0.6, 0.8, 0.6, 0xff6a2a); sign(c, '寄席', 0, 0, 4.4, 5.12, 4); }
export function modelSmallTheater(c: Ctx): void { pad(c, 28.4, 28.4, 0x9a948a); block(c, 0, -2, 20, 16, 3, 0x2a2a2a, { fh: 3.6, lit: 0.6, glass: 0xffd27a, band: 0xd8342a }); sign(c, '劇場', 0, 0, 3.8, 6.05, 5); }
export function modelJazzClub(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x8a8478); block(c, 0, -2, 18, 14, 2, 0x5a3a2a, { fh: 3.4, lit: 0.8, glass: 0xffb06a, band: 0x1e1e1e }); g.box(0, 2.6, 5.4, 10, 1.6, 0.2, 0x1e1e1e); sign(c, 'JAZZ', 0, 0, 2.7, 5.55, 5); }
export function modelArtIsland(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0x8aa868); g.blob(-20, 2, -16, 4, 4, 4, 0xf6c23a, 10); for (let k = 0; k < 12; k++) g.blob(-20 + (c.rnd() - 0.5) * 6, 2 + (c.rnd() - 0.5) * 6, -16 + (c.rnd() - 0.5) * 6, 0.4, 0.4, 0.4, 0x1e1e1e, 5); for (let k = 0; k < 5; k++) obox(c, 14 + k * 3, 4 + k * 2, 10, [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0, 1], 3, 0.3, 0.3, [0xd8342a, 0x2a5aa0, 0xf6f6f6][k % 3]); g.box(10, 0, -24, 20, 6, 12, 0xd8d4cc); g.box(10, 0, -24, 20.2, 3, 0.4, 0x3a3e44); for (let k = 0; k < 4; k++) g.cyl(-24 + k * 6, 0, 24, 1.2, 8 + k * 2, [0xf6f6f6, 0xd8342a, 0x2a5aa0, 0x3a3e44][k], 10); }
export function modelRailMuseum(c: Ctx): void { const g = c.g; pad(c, 118.4, 58.4, 0xb8b4ac); g.box(-10, 0, -6, 80, 14, 34, 0xe8ecf0); c.wa.box(-10, 1, 11.05, 70, 10, 0.05, 0xbfe0f0); for (let k = 0; k < 3; k++) { g.box(-40 + k * 24, 0.6, 2, 20, 3.4, 3, [0x2a6a3a, 0xf6f6f6, 0x8a3a2a][k]); } steamLoco(c, 40, 0.6, 18); g.box(40, 0.05, 18, 24, 0.1, 2.4, 0x6a5a48); sign(c, '鉄道博物館', 0, -10, 11, 11.1, 10); }
export function modelMangaMuseum(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc0bcb2); block(c, 0, -6, 44, 28, 3, 0xfaf6ee, { fh: 4, lit: 0.6, glass: 0xffd8a8, band: 0xf08a1a }); for (let k = 0; k < 6; k++) g.box(-20 + k * 8, 12.4, 8.1, 6, 6, 0.1, [0xf6c23a, 0x3aa0e8, 0xe84a6a, 0x5ac85a, 0xb05ad8, 0xf08a2a][k]); sign(c, '漫画館', 0, 0, 4, 8.05, 6); }
export function modelHauntedHouse(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x5a5a4a); g.box(0, 0, -2, 18, 7, 14, 0x4a4038); g.gable(0, 7, -2, 20, 16, 4, 0x2a2622, 'x', 0x4a4038, 0.6); for (let k = 0; k < 3; k++) c.wa.box(-5 + k * 5, 3, 5.05, 1.4, 1.6, 0.05, 0x8affa0); tree(c, -10, 8, 1, 2); sign(c, 'お化け屋敷', 0, 0, 0.6, 5.1, 6); }
export function modelMaze(c: Ctx): void { const g = c.g, sv0 = g.surfv; pad(c, 58.4, 58.4, 0x8aa868); g.surfv = -2; for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { if (((i * 7 + j * 3) % 5) === 0) continue; const horiz = (i + j) % 2 === 0; g.box(-24 + i * 6, 0, -24 + j * 6, horiz ? 6 : 0.8, 2.6, horiz ? 0.8 : 6, 0x3f7a36); } g.box(0, 0, 0, 3, 5, 3, 0xf6f6f2);  g.surfv = sv0; }
export function modelYagura(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc9b98c); for (const a of [-3, 3]) for (const b of [-3, 3]) g.box(a, 0, b, 0.4, 6, 0.4, 0xa8865a); g.box(0, 3, 0, 7, 0.3, 7, 0xa8865a); g.box(0, 3.3, 3.5, 7, 1.2, 0.05, 0xd8342a); g.box(0, 6, 0, 8, 0.2, 8, 0x8a3a2a); for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; c.wa.box(Math.cos(a) * 20, 4, Math.sin(a) * 20, 0.6, 0.8, 0.6, 0xff6a2a); g.cyl(Math.cos(a) * 20, 0, Math.sin(a) * 20, 0.06, 4, 0x6a6f76, 4); } for (let k = 0; k < 6; k++) { g.box(-26 + k * 10, 0, 24, 6, 2.4, 3, 0xe6dcc8); g.box(-26 + k * 10, 2.4, 24, 7, 0.2, 4, [0xd8342a, 0x2a5aa0][k % 2]); } }
export function modelMikoshiGura(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb8b0a0); barn(c, 0, -2, 14, 10, 4.4, 0xf2ece0, 0x3a3e44); g.box(0, 0, 3.05, 8, 3.6, 0.05, 0x6b4a32); g.box(6, 0, 8, 3, 1.6, 3, 0x2a2a2a); g.gable(6, 1.6, 8, 3, 3, 1.2, 0xc8a24a, 'x', 0x2a2a2a, 0.2); }
export function modelDashiKaikan(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0xb8b0a0); g.box(-8, 0, -2, 32, 12, 16, 0xe8e4da); c.wa.box(-8, 1, 6.05, 28, 10, 0.05, 0xbfe0f0); g.box(-14, 0, 2, 5, 4, 7, 0x8a3a2a); g.box(-14, 4, 2, 5, 3, 5, 0xc8a24a); g.gable(-14, 7, 2, 6, 6, 2, 0x2a2a2a, 'x', 0xc8a24a, 0.3); g.box(-4, 0, 2, 5, 4, 7, 0x2a2a6a); g.box(-4, 4, 2, 5, 3, 5, 0xc8a24a); sign(c, '山車会館', 0, 14, 3, 6.05, 7); g.box(14, 0, 2, 14, 6, 6, 0xe8e4da); }
export function modelMonzenmachi(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xb4ab9a); g.box(0, 0.06, 0, 6, 0.05, 56, 0xc8b89a); for (let k = 0; k < 6; k++) for (const e of [-1, 1]) { const z = -24 + k * 9.4; barn(c, e * 12, z, 14, 8, 4, 0xe6dcc8, 0x3a3e44, 'z', 2); obox(c, e * 4.6, 2.8, z, [0, 0, 1], [0.34 * -e, 0.94, 0], [0.94, 0.34 * e, 0], 3.6, 0.06, 0.9, [0x2a5aa0, 0xd8342a, 0x6b4a32][k % 3]); c.wa.box(e * 5, 1.2, z, 0.04, 1.4, 4, 0xffe0a8); } g.box(0, 0, 30, 14, 8, 1, 0xd8342a); g.box(0, 8, 30, 18, 1, 1.4, 0x2a2a2a); sign(c, '門前町', 0, 0, 6, 30.55, 5); }
export function modelShukubamachi(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xb4ab9a); g.box(0, 0.06, 0, 6, 0.05, 56, 0xb8a47a); for (let k = 0; k < 6; k++) for (const e of [-1, 1]) { const z = -24 + k * 9.4; g.box(e * 12, 0, z, 14, 6.4, 8, 0x5a4030); g.gable(e * 12, 6.4, z, 14, 8, 2.4, 0x3a3e44, 'z', 0x5a4030, 0.6); g.box(e * 5.2, 3.2, z, 0.4, 0.4, 8, 0x3a3e44); for (let j = 0; j < 8; j++) g.box(e * 5.05, 0.4, z - 3.6 + j, 0.04, 2.6, 0.08, 0x2e2a26); c.wa.box(e * 5.06, 4.2, z, 0.5, 0.8, 0.5, 0xffe0a8); } } // 格子戸と卯建の宿場町
export function modelOnsenGai(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x9a948a); g.box(0, 0.06, 0, 5, 0.05, 56, 0xb8a47a); for (let k = 0; k < 5; k++) for (const e of [-1, 1]) { const z = -22 + k * 11; barn(c, e * 14, z, 18, 9, 7, [0x6b4a32, 0xe6dcc8][k % 2], 0x3a3e44, 'z', 2.6); c.wa.box(e * 4.96, 2, z, 0.04, 1.6, 6, 0xffe0a8); c.wa.box(e * 4.6, 6, z, 0.5, 0.7, 0.5, 0xff6a2a); } g.box(0, 0, 0, 3, 0.6, 6, 0x6a9ab0); for (let k = 0; k < 5; k++) g.blob(0, 1.2 + k * 0.8, k * 0.6, 0.6, 0.6, 0.6, 0xf2f2f2, 5); sign(c, '温泉街', 0, 0, 4, 28, 5); } // 湯けむり
export function modelAshiyu(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb4ab9a); g.box(0, 0, 0, 14, 0.6, 6, 0x8a8a82); slab(c, 0, 0, 12, 4, 0x8ab0b8, 0.62); for (const e of [-1, 1]) g.box(0, 0, e * 3.6, 14, 0.6, 1, 0xa8865a); for (const a of [-6, 6]) for (const b of [-3, 3]) g.box(a, 0, b, 0.3, 3, 0.3, 0x8a6a42); g.gable(0, 3, 0, 15, 8, 1.6, 0x3a3e44, 'x', 0x8a6a42, 0.3); g.blob(0, 1.2, 0, 1, 0.6, 1, 0xf2f2f2, 5); }
export function modelKofun(c: Ctx): void { const g = c.g; pad(c, 118.4, 88.4, 0x8aa868); g.blob(-10, 0, 0, 22, 10, 22, 0x5f8a42, 14); g.box(20, 0, 0, 30, 6, 26, 0x5f8a42); g.box(20, 6, 0, 30, 0.05, 22, 0x6a9a4a); g.box(-10, -0.4, 0, 70, 0.5, 60, 0x4a7a9a); g.blob(-10, 0, 0, 24, 1, 24, 0x5f8a42, 14); } // 前方後円墳と周濠
export function modelBukeYashiki(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xb4ab9a); g.box(0, 0.06, 0, 86, 0.05, 6, 0xc8b89a); for (let k = 0; k < 3; k++) for (const e of [-1, 1]) { const x = -28 + k * 28, z = e * 15; g.box(x, 0, e * 4, 24, 2.4, 0.6, 0xf2ece0); g.box(x, 2.4, e * 4, 24.4, 0.5, 1.2, 0x3a3e44); barn(c, x, z + e * 2, 16, 10, 3.6, 0xe6dcc8, 0x3a3e44, 'x', 3); tree(c, x + 8, z - e * 2, 1, 1); } }
export function modelSando(c: Ctx): void { const g = c.g; pad(c, 28.4, 118.4, 0xb4ab9a); g.box(0, 0.06, 0, 6, 0.05, 116, 0xc8b89a); for (let k = 0; k < 12; k++) for (const e of [-1, 1]) { const z = -54 + k * 9.6; g.box(e * 5, 0, z, 1, 1.2, 1, 0x9a948a); g.box(e * 5, 1.2, z, 1.4, 1.2, 1.4, 0xa8a296); c.wa.box(e * 5, 1.6, z, 0.8, 0.6, 0.8, 0xffd890); g.box(e * 5, 2.4, z, 1.8, 0.3, 1.8, 0x9a948a); if (k % 2) tree(c, e * 10, z, 1.2, 1); } g.box(0, 0, -56, 0.8, 7, 0.8, 0xd8342a); }

// ---- v49 宗教・地域の小さな施設 ----
export function modelJizodo(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb4ab9a); g.box(0, 0, -2, 6, 3, 5, 0x8a6a42); g.gable(0, 3, -2, 7, 6, 2, 0x3a3e44, 'x', 0x8a6a42, 0.5); for (let k = 0; k < 6; k++) { g.blob(-5 + k * 2, 0.6, 6, 0.4, 0.6, 0.4, 0x9a9a92, 6); g.box(-5 + k * 2, 0.6, 6.35, 0.6, 0.4, 0.1, 0xd8342a); } tree(c, 8, -6, 1, 0); } // 赤い前掛けのお地蔵さん
export function modelHokora(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0x7a9a5a); g.box(0, 0, 0, 2, 0.6, 2, 0x9a9a92); g.box(0, 0.6, 0, 1.4, 1.2, 1.2, 0x8a6a42); g.gable(0, 1.8, 0, 1.8, 1.6, 0.8, 0x3a3e44, 'x', 0x8a6a42, 0.2); for (const a of [-2.4, 2.4]) g.box(a, 0, 4, 0.3, 2.6, 0.3, 0xd8342a); g.box(0, 2.6, 4, 5.6, 0.3, 0.3, 0xd8342a); for (let i = 0; i < 6; i++) tree(c, -10 + c.rnd() * 20, -10 + c.rnd() * 8, 1.2, 0); }
export function modelMosque(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xd8d0c0); g.box(0, 0, -4, 30, 9, 26, 0xf2ece0); g.blob(0, 9, -4, 9, 8, 9, 0x2a8a8a, 16); g.cyl(18, 0, -14, 1.2, 26, 0xf2ece0, 10); g.cyl(18, 26, -14, 1.6, 1, 0xe6dcc8, 10); g.blob(18, 27.5, -14, 1.3, 2, 1.3, 0x2a8a8a, 8); c.wa.box(0, 3, 9.05, 6, 4, 0.04, 0xffe8b8); }
export function modelSynagogue(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xd0c8b8); g.box(0, 0, -2, 18, 9, 14, 0xe6dcc8); g.box(0, 9, -2, 19, 0.6, 15, 0x9a948a); c.wa.box(0, 3, 5.05, 3, 4, 0.04, 0xa8c8f0); g.box(0, 10.2, 5.1, 3, 0.3, 0.1, 0x2a5aa0); }
export function modelHinduTemple(c: Ctx): void { const g = c.g; pad(c, 58.4, 28.4, 0xd8c8a8); g.box(-6, 0, -2, 22, 6, 14, 0xf2e2c0); for (let k = 0; k < 5; k++) g.box(-6, 6 + k * 2.4, -2, 16 - k * 3, 2.4, 10 - k * 1.8, [0xe8a83a, 0xd8342a, 0x3aa07a, 0x2a5aa0, 0xf6c23a][k]); g.box(16, 0, 0, 10, 4, 10, 0xf2e2c0); }
export function modelMonastery(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0x8aa868); g.box(0, 0, -6, 40, 6, 30, 0xe6dcc8); g.box(0, 0, -6, 30, 6.1, 20, 0x7aa860); g.gable(0, 6, -21, 40, 4, 1.6, 0x8a3a2a, 'x', 0xe6dcc8, 0.3); g.box(-24, 0, -6, 8, 14, 10, 0xe6dcc8); g.gable(-24, 14, -6, 8, 10, 4, 0x8a3a2a, 'z', 0xe6dcc8, 0.3); for (let r = 0; r < 3; r++) g.box(20, 0.05, 14 + r * 4, 30, 0.3, 2, 0x5a8a3a); }
export function modelShinshukyo(c: Ctx): void { const g = c.g; pad(c, 118.4, 88.4, 0xd0c8b8); g.box(0, 0, -10, 60, 18, 40, 0xf6f2ea); g.blob(0, 18, -10, 20, 10, 16, 0xc8a24a, 16); for (let k = 0; k < 10; k++) g.cyl(-27 + k * 6, 0, 11, 1.2, 18, 0xf6f2ea, 10); slab(c, 0, 30, 100, 24, 0xe6dcc8, 0.08); for (let k = 0; k < 8; k++) tree(c, -50 + k * 14, 40, 1.1, 1); }
export function modelChonaikaikan(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb4ab9a); barn(c, 0, -2, 16, 10, 3.6, 0xe6e2d8, 0x5a6168); c.wa.box(0, 0.6, 3.05, 10, 2, 0.04, 0xffe8c0); g.box(-6, 0, 7, 3, 1.6, 0.1, 0xf6f6f2); sign(c, '町内会館', 0, 0, 2.8, 3.1, 5); }
export function modelShobodan(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb4ab9a); g.box(-3, 0, 0, 10, 4.4, 8, 0xe6e2d8); g.box(-3, 0.2, 4.05, 6, 3.4, 0.05, 0xd8342a); for (const a of [-1.4, 1.4]) for (const b of [-1.4, 1.4]) g.box(8 + a, 0, 2 + b, 0.2, 14, 0.2, 0x8a3a2a); g.box(8, 14, 2, 3.6, 0.3, 3.6, 0x8a3a2a); g.cyl(8, 14.3, 2, 0.5, 0.8, 0xc8a24a, 8); g.gable(8, 15.4, 2, 3, 3, 1.4, 0x3a3e44, 'x', 0x8a3a2a, 0.2); sign(c, '消防団', 0, -3, 3.8, 4.1, 4); } // 火の見櫓と半鐘
export function modelKoshuToilet(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb0aca4); g.box(0, 0, 0, 8, 3.2, 6, 0xd8d4cc); g.box(0, 3.2, 0, 9, 0.3, 7, 0x5a6168); g.box(-2, 0.2, 3.05, 1.4, 2.4, 0.05, 0x2a5aa0); g.box(2, 0.2, 3.05, 1.4, 2.4, 0.05, 0xd8342a); c.wa.box(0, 2.6, 3.06, 1, 0.5, 0.04, 0xffffff); }
export function modelBosaiMusen(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xb0aca4, 0.02); g.cyl(0, 0, 0, 0.3, 14, 0x9aa0a6, 6); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; obox(c, Math.cos(a) * 0.8, 12, Math.sin(a) * 0.8, [Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)], 0.6, 0.5, 0.5, 0xd8d4cc); } g.box(0, 0, 1.2, 1, 1.6, 0.6, 0xd8d4cc); }

// ---- v49 未来の施設 ----
export function modelMegaFloat(c: Ctx): void { const g = c.g; pad(c, 148.4, 148.4, 0xbab4a8); slip(c, 148.4, -74, 74); g.box(0, 0.2, 0, 120, 2, 120, 0xd8dce0); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; block(c, Math.cos(a) * 34, Math.sin(a) * 34, 16, 16, 8 + k * 2, 0xeef2f6, { fh: 3.4, lit: 0.8, glass: 0x8fd0f0, band: 0x3ac8c8 }); } g.cyl(0, 2, 0, 14, 40, 0xe8f0f4, 20, undefined, 8); g.blob(0, 42, 0, 8, 6, 8, 0x8fd0f0, 14); for (let k = 0; k < 12; k++) tree(c, -50 + k * 9, 52, 1, 3); }
export function modelUndergroundCity(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc0c4c8); g.box(0, 0, 0, 30, 0.3, 30, 0x9aa3ac); obox(c, 0, 4, 0, [1, 0, 0], [0, 0.8, 0.6], [0, -0.6, 0.8], 12, 0.2, 10, 0x8fd0f0); g.box(0, -1, 4, 20, 1.2, 12, 0x2a2e30); for (let k = 0; k < 8; k++) c.wa.box(-10 + k * 3, 0.4, -12, 0.6, 0.6, 0.6, 0x8affe8); sign(c, '地下都市', 0, 0, 0.4, 15.1, 8); }
export function modelSkyGarden(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc0c4c8); for (const x of [-14, 14]) block(c, x, 0, 18, 30, 30, 0xe8ecf0, { fh: 3.6, lit: 0.7, glass: 0x8fb8e0, band: 0x5a6a7a }); g.box(0, 108, 0, 48, 4, 34, 0xe8ecf0); g.box(0, 112, 0, 46, 0.6, 32, 0x7ab05a); for (let k = 0; k < 14; k++) tree(c, -20 + (k % 7) * 6.6, k < 7 ? -8 : 8, 1, 0); }
export function modelVerticalFarm(c: Ctx): void { const g = c.g; pad(c, 28.4, 28.4, 0xc0c4c8); g.box(0, 0, 0, 20, 48, 20, 0xe8f2ee); for (let f = 0; f < 12; f++) { c.wa.box(0, 2 + f * 4, 10.05, 18, 2.4, 0.05, 0xd27aff); g.box(0, 3.6 + f * 4, 10.3, 20, 0.4, 0.6, 0x4f9a4a); } }
export function modelOrbitalHotel(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xc0c4c8); g.cyl(0, 0, 0, 14, 8, 0xf2f6fa, 24); g.blob(0, 8, 0, 14, 8, 14, 0x9ac8f0, 20); g.box(0, 18, 0, 0.6, 30, 0.6, 0x9aa0a6); g.cyl(0, 48, 0, 10, 1.2, 0xe8ecf0, 24); g.cyl(0, 48, 0, 8.6, 1.3, 0xc0c4c8, 24); sign(c, '宇宙ホテル', 0, 0, 2, 14.1, 8); }
export function modelMoonBase(c: Ctx): void { const g = c.g; pad(c, 88.4, 58.4, 0xc8c8c4); for (let k = 0; k < 4; k++) g.blob(-30 + k * 18, 0, -6, 7, 6, 7, 0xf6f6f6, 14); for (let k = 0; k < 3; k++) g.box(-21 + k * 18, 0, -6, 8, 2.4, 2.4, 0xd8d8d8); for (let k = 0; k < 2; k++) obox(c, 30, 4, -10 + k * 8, [1, 0, 0], [0, 0.5, 0.87], [0, -0.87, 0.5], 6, 0.1, 3, 0x2a3a6a); block(c, 0, 20, 30, 12, 2, 0xe8ecf0, { fh: 3.6, lit: 0.8, glass: 0x8fd0f0, band: 0x2a2a6a }); sign(c, '月面管制', 0, 0, 7.4, 26.05, 6); }
export function modelAiDataCity(c: Ctx): void { const g = c.g; pad(c, 118.4, 118.4, 0x9aa3ac); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = -42 + i * 28, z = -42 + j * 28; g.box(x, 0, z, 22, 10 + ((i + j) % 3) * 6, 22, 0x2a2e34); c.wa.box(x, 1, z + 11.05, 18, 6, 0.05, 0x3ac8ff); } for (let k = 0; k < 8; k++) g.cyl(-50 + k * 14, 0, 56, 2, 8, 0xd8dce0, 10); }
export function modelRobotDistrict(c: Ctx): void { const g = c.g; pad(c, 88.4, 88.4, 0xb0b4b8); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) block(c, -28 + i * 28, -28 + j * 28, 18, 18, 2 + ((i * 3 + j) % 4), 0xe8ecf0, { fh: 3.6, lit: 0.8, glass: 0x9fd8f0, band: 0x3ac8a0 }); for (let k = 0; k < 14; k++) { const x = -40 + c.rnd() * 80, z = -40 + c.rnd() * 80; g.box(x, 0, z, 0.6, 1.2, 0.4, 0xf6f6f6); g.blob(x, 1.5, z, 0.3, 0.3, 0.3, 0x3ac8ff, 5); } }
export function modelMetaverseHall(c: Ctx): void { const g = c.g; pad(c, 58.4, 58.4, 0xb0b4b8); g.blob(0, 0, -4, 22, 14, 18, 0x1e1e2a, 16); for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; c.wa.box(Math.cos(a) * 20, 4 + (k % 3) * 3, -4 + Math.sin(a) * 16, 1.2, 0.4, 1.2, [0xff3ad8, 0x3ad8ff, 0x8aff3a][k % 3]); } sign(c, 'メタバース', 0, 0, 1, 14.5, 8); }
