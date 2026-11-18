// 画面部品。状態は Game から読み、操作は game.act() に渡すだけ。
import { buyoutCost } from '../sim/actions';
import { devLayout, planRedevelop } from '../devplan';
import { planText, ROLES } from '../cityplan';
import { Game, SPEED_NAMES } from '../game';
import { AUTO_ORDERS } from '../autoplay';
import { View } from '../render/scene';
import { thumb } from '../render/thumbs';
import { chartSvg, legendHtml, attachChartHover, type Series } from './chart';
import { startForecast } from '../forecastRunner';
import { routeRoad, snapPlace, railPath, railLayPath } from './route';
import { findCandidates, hasCandidates, type Cand } from './candidates';
import {
  W, H, P, DEFS, MISSIONS, VISION_PERKS, furusatoCalc, econFactor, AIR_ROUTES, airportUpCheck, airRouteCheck, bondCap, POLICIES, policyCost, CITY_KINDS, DISTRICTS, HH_NAMES, ZONE_NAMES, ROAD_NAMES, SAT_PARTS, SAT_W, isRes, isShop, isCity, getMap, idx, landReason, heightAt,
  SISTERS, SIS, EXCHANGES, MAX_SISTERS, altitude, hasSea, seaDist, tsunamiDepth, designWave, liquefyRisk,
  CHALLENGES, CH, maxLv, stageName, upgradeBlock, expandCost, optionsFor, optSlots, optCost, STYLES, STYLE_COST, sponsorOf, moveCost,
  LEVELS, MEDALS, RANK_CATS, N_CITIES, mayorDiff, MAYOR_DIFF, levelOf, blockRect, blockName, annexable, BX, BY,
  planStreet, planRailKind, rerunRules, RERUN, monthlyIssues, allIssues, loopTopics, loopEntryIssue, type Issue, WIN_VOTE, voteText, fiscalWatch, RAILKIND_NAME, modAdd, THREATS, SECTORS, sectorOf, industryBalance, rateAdd, type Macro, REAL, MAP_ID, mapEntry, baseEntry, TILE, monthlyBudget, pledgeStatus, GOALS, VISIONS, CAT_NAMES, BUILD_KINDS, fam, lvOf, LV_CAP, SV_NAMES, goalProgress, visionProgress, electionOutlook, upgradeCost, buildCost, CIVIC, isBiz, NEIGHBOR_SEED, DIFFS, diffOf, rerunCheck, teamCheck, teamVenue, SPORTS, upkeepOf, staffReq, designCap, sumHH, roadCapacity, checkPlace, lineTiles, rectTiles, planRoad, planTunnel, planBridge, planOverpass, planFootbridge, planCanal, planBusStop, planLevee, planArea, planTerra, planWiden, planFlyover, TERRA_NAMES, planUnroad, planRepair, planZone, planRail, planRailGrade, planUnrail, fiscalCrisis, tempDebt, ledgerGap, stationUpCheck, shinCheck, eventDef, forecastAsync, modMul,
  stationStats, FREQS, DOOR_COST, SUBWAY_COST, BIDS, bidChance, STYLES_M, REC_PLANS, hasOp, terrainOf, isCastaway, missionsFor, calMonth, POSTS, candidates, execOf, landOf, landPrices, routeStats, FREQ, MAX_ROUTES, citsOf, CIT_N, voteForecast, FACTIONS, PLANS, LOBBY_COST, SPEECH_COST, ADS_COST, monthsToElection, campaignOpen, PRESS, grantChance, PETITION_COST, GRANTS, GRANT_COOL, APPLY_COST, FESTS, pyramid, projection,
  authorityLabel, currentOffice, prefOf, localize,
  dataSource, DATA_REAL, DATA_EST,
  riskOutlook, renewCostOf,
} from '../sim/index';
import type { GameState, Building, Kind, Zone, Layer, ForecastSet, Action, TilePlan, Cat, TerraOp, MissionDef } from '../sim/index';
import { sound } from '../audio/sound';
import { onlineState, submit, refresh, scoreOf, startOnline, shareCity, sharedCities, loadShared, cloudSave, cloudLoad, contestList, contestSubmit, contestLoad } from '../online';
import { playTimeline, timelineCount } from './timelapse';
import { dailyOf, dailyProgress, checkDaily, DAILY, DAILY_PTS, heroOf, avatar, lifeIcon, FIRSTS, cityTitles } from './engage';
import { loadCareer, canRun, startRun } from '../career';
import { familiesOf, featured, famTitle, famWhere, moodIcon, driverOf, type Family } from './people';
import { issueSteps, pastResults, reportHtml, policyCard, buildFacts, voiceDetail, voiceDistrict, districtCenter, type IssueFlow, type PolicyTrial } from './flow';
import { trialOptions, compareTrial, annualReport, type AnnualReport } from '../sim/report';

type Tool = { t: 'select' } | { t: 'road'; road: 1 | 2 } | { t: 'tunnel'; road: 1 | 2 } | { t: 'bridge'; road: 1 | 2 } | { t: 'overpass' } | { t: 'footbridge' } | { t: 'canal' } | { t: 'busStop'; on: boolean } | { t: 'railKind'; kind: 0 | 1 | 2 } | { t: 'street'; style: 'tree' | 'stone' | 'nopole' | 'charge' | 'none' } | { t: 'levee' } | { t: 'area'; v: 0 | 1 | 2 } | { t: 'terra'; op: TerraOp } | { t: 'widen'; on: boolean } | { t: 'flyover' } | { t: 'unroad' } | { t: 'rail'; level: 1 | 2 | 3; grade: 0 | 1 | 2 | 3 } | { t: 'railgrade'; grade: 0 | 1 | 2 | 3 } | { t: 'unrail' } | { t: 'repair' } | { t: 'zone'; zone: Zone } | { t: 'devarea'; zone: 1 | 2 | 3 } | { t: 'build'; kind: Kind; move?: number } | { t: 'sandbox'; kind: Kind };
type Tab = 'home' | 'term' | 'voice' | 'money' | 'policy' | 'fc' | 'fac' | 'mayor' | 'city';
const $ = (id: string) => document.getElementById(id)!;

const n0 = (v: number) => Math.round(v).toLocaleString('ja-JP');
const man = (v: number) => yen(v);
/** 金額（万円単位の数）を「1兆2,345億円」「3億4,500万円」「6,059万円」のように表す。sign で +/− を付ける、per は「/月」など */
const yen = (v: number, sign = false, per = '') => { const r = Math.round(v), a = Math.abs(r), sg = r < 0 ? '−' : sign ? '+' : '', u = (t: string) => `<i>${t}</i>`;
  if (a < 10000) return `${sg}${n0(a)}${u('万円' + per)}`;
  if (a < 1e8) { const oku = Math.trunc(a / 10000), rest = a % 10000; return `${sg}${n0(oku)}${u('億')}${rest ? n0(rest) + u('万円' + per) : u('円' + per)}`; }
  const cho = Math.trunc(a / 1e8), oku = Math.trunc((a % 1e8) / 10000); return `${sg}${n0(cho)}${u('兆')}${oku ? n0(oku) + u('億円' + per) : u('円' + per)}`; };
const yenT = (v: number, sign = false, per = '') => yen(v, sign, per).replace(/<\/?i>/g, '');
const pct = (v: number) => Math.round(v * 100) + '%';
const signed = (v: number) => (v >= 0 ? '+' : '−') + n0(Math.abs(v));
export const dateStr = (m: number) => `${Math.floor(m / 12) + 1} 年目 ${((m + 3) % 12) + 1} 月`;
const ZC = ['', '#58b368', '#3f9bd1', '#7a5fd0', '#e8a33a', '#4a6fa5', '#9a7a5a'];
const AREA_C = [0x9aa0a6, 0xc9a24a, 0x3fb6a8], AREA_CSS = ['#9aa0a6', '#c9a24a', '#3fb6a8'], AREA_N = ['市街化区域に戻す', '市街化調整区域', '居住誘導区域'];
const phone = () => window.innerWidth <= 900;
/** タイトル画面へ戻る（読み込み直す。公開ページの引き継ぎで街がそのまま再開しないよう印を付ける） */
const toTitle = () => { try { sessionStorage.setItem('sumu-title', '1'); } catch { /* 使えなくても戻れる */ } location.reload(); };
/** 季節と天気と時間帯の表示（例：4 月・春・晴れ・朝） */
const wxText = (v: View, s: GameState) => { const cm = (s.month % 12 + 3) % 12, h = v.hour; return `${cm + 1} 月・${cm >= 2 && cm <= 4 ? '春' : cm >= 5 && cm <= 7 ? '夏' : cm >= 8 && cm <= 10 ? '秋' : '冬'}・${v.weather.kind}・${h < 4.5 ? '深夜' : h < 6.5 ? '明け方' : h < 10 ? '朝' : h < 16 ? '昼' : h < 18.5 ? '夕方' : h < 22 ? '夜' : '深夜'}`; };
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const coarse = () => matchMedia('(pointer: coarse)').matches;
const cls = (ok: boolean, warn = false) => (ok ? 'good' : warn ? 'warn' : 'bad');

interface TutStep { title: string; text: string; done?: (s: GameState, ui: UI) => boolean }
const inWest = (s: GameState, i: number) => getMap(s.seed).district[i] === 3;
const realTutorial = (): TutStep[] => {
  const e = baseEntry(MAP_ID), km = (v: number) => (v * TILE / 1000).toFixed(1);
  if (REAL!.deformed) {
    let z0 = -1;
    const zones = (st: GameState) => st.zone.reduce((a, z) => a + (z ? 1 : 0), 0);
    return [
      { title: 'ようこそ、市長', text: `${e?.area ?? ''}の${e?.name ?? ''}をもとにした「まちづくり版」です。駅・線路・川・幹線道路の並びと地形は実在の地図から取り、1/3 ほどに縮めて、細い道や家並みをゲーム用に整理しました。空き地に道路を引き、用途を指定して街を育てます。左ドラッグで移動、右ドラッグで回転、ホイールで拡大です。` },
      { title: '道路をつくる', text: '左の［道路を引く］→［生活道路］を選び、いまある道路の端から空き地へドラッグしてください。家や川を避けて道筋を探します（Shift でまっすぐ）。道路に面していない区画には何も建ちません。', done: st => st.road.some((r, i) => r && !REAL!.road[i]) },
      { title: '用途を指定する', text: '［土地の用途］→［低層住宅］などを選び、つくった道路の両側をドラッグで塗ってください。市が住宅を建てるのではなく、需要があれば民間が建てます。駅の近くは高層住宅や商業が向いています。', done: st => { if (z0 < 0) z0 = zones(st); return zones(st) >= z0 + 3; } },
      { title: '時間を進める', text: '右上の ▶▶ で時間を進めます（スペースキーで一時停止）。数か月で着工が始まり、世帯が入居します。', done: st => st.month >= 3 },
      { title: '保育の不足を見る', text: '左下の［🗺 地図の表示・カメラ］を開いて［保育］を選んでください。赤い住宅ほど、保育園に入れない子どもがいます。青が保育園です。', done: (_s, ui) => ui.view.layer === 'care' },
      { title: '保育園を建てる', text: '［施設を建てる］→［市立保育園］を選ぶと「おすすめの場所」が出ます。そこから選ぶか、赤い住宅の近くの道路沿いの空き地に置いてください。', done: st => st.buildings.filter(b => b.kind === 'nursery').length >= 3 },
      { title: 'ここからは自由に', text: '任期は 48 か月。期末に暮らしの満足、公約、財政で評価され、選挙があります。混雑する幹線は広げ、公園や店の足りない所には用途を指定しましょう。［概要］の公約と［声］が手がかりです。' },
    ];
  }
  return [
  { title: 'ようこそ、市長', text: `${e?.area ?? REAL!.name}の${e?.name ?? ''}周辺（東西 ${km(W)}km・南北 ${km(H)}km）を、${e?.role ?? '市長'}として運営します（ゲーム中の表記は「市」で統一）。道路・鉄道・川・建物の位置は OpenStreetMap、地形は国土地理院の標高です。世帯数や施設の定員はゲームの推計です。左ドラッグで移動、右ドラッグで回転、ホイールで拡大です。` },
  { title: '保育の不足を見る', text: '左下の［🗺 地図の表示・カメラ］を開いて［保育］を選んでください。赤い住宅ほど、保育園に入れない子どもがいます。青が保育園です。利用できるのは道路で 1.2km 以内の園だけです。', done: (_s, ui) => ui.view.layer === 'care' },
  { title: '保育園を建てる', text: '［施設を建てる］→［市立保育園］を選び、赤い住宅が多い地区の道路沿いの空き地に置いてください。家並みがあっても、計算上の住宅がない区画には建てられます（用地を確保した扱い）。足りなければ［財政］で市債を発行できます。', done: s => s.buildings.some(b => b.kind === 'nursery' && !b.osm && !b.name) },
  { title: '人員を整える', text: '保育園は建物だけでは受け入れられません。保育士の採用には時間がかかります。［政策］で「保育人材支援」を始めると採用が速くなります。', done: s => !!s.policies.careStaff?.on },
  { title: '朝の混雑を見る', text: '地図レイヤーの［混雑］で、通勤時間帯に混む道路が赤く出ます。国道は国の管理なので、市は直接は広げられません。並行する市道を「幹線道路」に広げると分散します。', done: (_s, ui) => ui.view.layer === 'traffic' },
  { title: '先を読む', text: '［予測］を開き、「試算する」を押してください。街が大きいので、計算には少し時間がかかります。「計画案をつくる」で、建てる前に比べることもできます。', done: (_s, ui) => !!ui.fcBase },
  { title: 'ここからは自由に', text: '任期は 48 か月。期末に暮らしの満足、公約、財政で評価され、選挙があります。浄水場の更新も課題です。［概要］の公約と［声］を手がかりにしてください。' },
  ];
};
const TUTORIAL_FICTION: TutStep[] = [
  { title: 'ようこそ、市長', text: '住野市は人口およそ 5,000 人。駅前の開発で子育て世帯が増え、保育園の不足、朝の混雑、古くなった水道施設が課題です。東には東台駅のある「東台」、南には川沿いの農村「南原」が広がり、これから開発できます。まず街を眺めてみましょう。左ドラッグで移動、右ドラッグで回転、ホイールで拡大です。' },
  { title: '道路をつくる', text: '駅の西、田畑が広がる「西新町」を開発します。左の［道路を引く］→［生活道路］を選び、いまある道路の西の端から西へドラッグしてください。道路がつながっていない区画には何も建ちません。', done: s => { let n = 0; for (let i = 0; i < W * H; i++) if (s.road[i] === 1 || s.road[i] === 2) if (inWest(s, i)) n++; return n >= 4; } },
  { title: '用途を指定する', text: '［土地の用途］→［低層住宅］を選び、つくった道路の両側をドラッグで塗ってください。市が住宅を建てるのではなく、需要があれば民間が建てます。', done: s => { let n = 0; for (let i = 0; i < W * H; i++) if (inWest(s, i) && s.zone[i] >= 1 && s.zone[i] <= 3) n++; return n >= 4; } },
  { title: '店の場所も用意する', text: '同じ［土地の用途］から［商業］を選び、道路沿いに 1〜2 区画指定してください。店は、歩いて来られる世帯の買物需要が採算を超えたときだけ開きます。', done: s => { for (let i = 0; i < W * H; i++) if (inWest(s, i) && s.zone[i] === 4) return true; return false; } },
  { title: '時間を進める', text: '右上の ▶▶ で時間を進めます（スペースキーで一時停止）。空き住戸が少ないので、数か月で着工が始まります。', done: s => s.buildings.some(b => isRes(b.kind) && inWest(s, idx(b.x, b.y))) },
  { title: '世帯が入居する', text: '工事が終わると世帯が入居します。入居した世帯の構成に応じて、買物・通勤・保育の需要が増えていきます。', done: s => s.buildings.some(b => isRes(b.kind) && b.status === 'operating' && inWest(s, idx(b.x, b.y)) && sumHH(b) >= 1) },
  { title: '保育の不足を見る', text: '左下の［🗺 地図の表示・カメラ］を開いて［保育］を選んでください。赤い住宅ほど、保育園に入れない子どもがいます。青が保育園です。利用できるのは道路で 900m 以内の園だけです。', done: (_s, ui) => ui.view.layer === 'care' },
  { title: '保育園を建てる', text: '［施設を建てる］→［市立保育園］を選び、不足している地区の道路沿いに置いてください。建設費は着工時に支出されます。足りなければ［財政］で市債を発行できます。', done: s => s.buildings.filter(b => b.kind === 'nursery').length >= 2 },
  { title: '人員を整える', text: '保育園は建物だけでは受け入れられません。保育士の採用には時間がかかります。［政策］で「保育人材支援」を始めると採用が速くなります。', done: s => !!s.policies.careStaff?.on },
  { title: '先を読む', text: '［予測］を開き、「試算する」を押してください。12 か月・60 か月先の人口、保育、財政の見込みが出ます。「計画案をつくる」で、建てる前に比べることもできます。', done: (_s, ui) => !!ui.fcBase },
  { title: 'ここからは自由に', text: '任期は 48 か月（体験版は 24 か月）。期末に暮らしの満足、公約、財政で評価され、選挙があります。水道施設の更新も忘れずに。［概要］の公約と［声］を手がかりにしてください。' },
];
let tutCache: { id: string; steps: TutStep[] } | null = null;
/** いまの地図の案内（地図を選ぶと変わる） */
const tut = (): TutStep[] => { if (!tutCache || tutCache.id !== MAP_ID) tutCache = { id: MAP_ID, steps: REAL ? realTutorial() : TUTORIAL_FICTION }; return tutCache.steps; };
/** 施設の能力の説明（建設メニュー用） */
const capText = (k: Kind): string => {
  const d = DEFS[k], f = d.fam, out: string[] = [];
  if (f === 'fire') out.push(`到達範囲 道路 ${n0(d.capacity * 30)}m`);
  else if (d.gen) out.push(`発電 ${n0(d.gen)} 世帯分`);
  else if (d.build === 'invite') out.push(`雇用 ${n0(d.jobs ?? 0)} 人・税収 月 ${yenT(d.bizTax ?? 0)}${d.use ? `・電力 ${n0(d.use)} 世帯分を使う` : ''}`);
  else if (d.capacity > 1) out.push(`容量 ${n0(d.capacity)} ${d.capUnit}`);
  if (d.reach) out.push(`範囲 道路 ${n0(d.reach * 30)}m`);
  if (d.visitors) out.push(`来訪 月 ${n0(d.visitors)} 人`);
  if (d.fame) out.push(`知名度 +${d.fame}`);
  if (d.income) out.push(`収入 月 ${yenT(d.income)}`);
  if ((d.pollution ?? 0) >= 1) out.push('周りの空気が悪くなる');
  return out.join('・');
};
/** 施設の表示名（実在の施設は名前で） */
const bname = (b: Building) => (b.name ? b.name.replace(/^横浜市立/, '').replace(/^(相鉄|JR)/, '') : DEFS[b.kind].name);

export class UI {
  game: Game; view: View;
  tool: Tool = { t: 'select' };
  group: string | null = null;
  tab: Tab = 'home';
  sel: { b?: number; tile?: number } | null = null;
  /** 予測の結果。rev は計算を始めたときの状態の番号で、いまの状態と違えば古い結果として扱う */
  /** 計画案の確定に失敗した操作（何件目・名前・理由）。試算モードの帯に出す */
  draftFail: { index: number; name: string; msg: string } | null = null;
  fc: { base: ForecastSet[]; draft: ForecastSet[] | null; rev: number; month: number; ms: number; mode: string; actions: Action[] } | null = null;
  private job: { rev: number; cancel: () => void } | null = null;
  fcBusy = 0;
  get fcBase() { return this.fc?.base ?? null; }
  get fcDraft() { return this.fc?.draft ?? null; }
  fcMetric: 'pop' | 'wait' | 'cash' | 'renewal' = 'pop';
  /** 建設メニューの分類・公約選びの途中の選択 */
  tourStop = false;
  bcat: Cat = 'kids'; gp: string[] = []; gv: string | null = null; /** 選んだ挑戦（任期を始めるまでは変えられる） */ gc: string | null = null;
  photo = false; pfilter = ''; pstamp = true; eventHidden = false; overSeen = false; lastWx = ''; menu = false; menuMsg = ''; confirmNew: '' | 'full' | 'short' | 'title' = ''; shot = '';
  private drag: { id: number; btn: number; x: number; y: number; moved: boolean; start: number; mode: 'pan' | 'rotate' | 'tool' | 'tap' } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private hover = -1;
  private lastTop = '';

  constructor(game: Game, view: View) {
    this.game = game; this.view = view;
    game.onMonth.push(() => { const rd = this.game.reportDue; if (rd && !this.game.auto) { this.game.reportDue = null; const rep = annualReport(this.game.state, rd.from, rd.to, rd.title); if (rep.rows.length) { this.reportOpen = rep; this.renderModal(); } } if (this.ix?.trial) { this.ix.trial = null; this.ix.confirm = false; } this.refreshIxOpts(); if (this.ix?.open === 'result') this.ix.open = null; this.ptrial = null; });
    game.onMonth.push(() => { if (this.game.auto) { const last = this.game.autoLog.filter(n => n.month === this.game.state.month); if (last.length) this.toast(`オート：${last[last.length - 1].text}${last.length > 1 ? `（ほか ${last.length - 1} 件）` : ''}`); } });
    game.onSave.push(() => { const f = this.game.saveFail; this.renderSaveMark(); if (f && f.where === '自動保存') this.toast('自動保存に失敗しました。上の「未保存」からファイルに保存できます', true); if (this.menu) this.renderModal(); });
    game.onChange.push(() => { this.flushNotes(); if (this.job && this.game.rev !== this.job.rev) { this.cancelForecast(); this.toast('街が変わったため、計算中の試算を中止しました。もう一度「試算する」を押してください'); } this.refresh(); });
    if (REAL) {
      const e = baseEntry(MAP_ID);
      document.title = `スムシティ ${e?.name ?? REAL.name}`;
      document.querySelector('#top .plate')!.innerHTML = `<b>${e?.name ?? REAL.name}</b><span>${REAL.deformed ? 'まちづくり版' : e?.area ?? 'スムシティ・実在都市'}</span>`;
      $('gl').setAttribute('aria-label', `${e?.name ?? REAL.name}周辺の 3D 地図`);
      const cr = document.createElement('div'); cr.id = 'credit';
      const ds = dataSource(); cr.title = ds.note; // v90：実データと推計の区別
      cr.innerHTML = '地図 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors（ODbL）・標高 <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>' + (ds.date ? `（${ds.date} 取得）` : '') + '・数値はゲームの推計';
      $('app').appendChild(cr);
    } else if (game.state.cityName && game.state.cityName !== '住野市') {
      const t = terrainOf(game.state.seed);
      document.querySelector('#top .plate')!.innerHTML = `<b>${esc(game.state.cityName)}</b><span>スムシティ・${esc(t.name)}</span>`;
      document.title = `スムシティ ${game.state.cityName}`;
    }
    this.bind();
    attachChartHover($('panel'), $('tip')); attachChartHover($('modal'), $('tip'));
    if (phone()) $('side').classList.add('closed');
    this.refresh();
  }
  get s(): GameState { return this.game.view; }

  /** 短い知らせ。いつも 1 つだけ出す。長い文は最初の文だけにし、（）の補足は省く（全文はベルの「お知らせ」に残る） */
  toast(msg: string, err = false): void {
    let t = msg.replace(/\u0001.*$/, '');
    if (t.length > 34) t = t.replace(/（[^）]*）/g, '');
    const cut = t.indexOf('。'); if (cut > 0 && cut < t.length - 1) t = t.slice(0, cut + 1);
    if (t.length > 58) t = t.slice(0, 56) + '…';
    const box = $('toast'); if (box.lastElementChild && box.lastElementChild.textContent === t) return;
    box.innerHTML = '';
    const d = document.createElement('div'); d.textContent = t; if (err) d.className = 'err';
    box.appendChild(d); setTimeout(() => d.remove(), err ? 4800 : 2800);
  }
  /** シミュレーションからの知らせ（誘致の結果など）を出して消す */
  private celebShown = '';
  private flushNotes(): void {
    const c = this.game.state.celeb, ck = c ? `${c.kind}:${c.month}` : ''; if (c && ck !== this.celebShown && this.game.state.month - c.month <= 1) { this.celebShown = ck; this.view.celebrate(c.kind, c.label); }
    const n = this.game.state.notes; if (!n || !n.length) return;
    const st = this.game.state, log = st.news ?? (st.news = []);
    for (const m0 of n.splice(0)) { const [m, at] = m0.split('\u0001'); if (NEWS_RE.test(m)) this.newsShow(m); else if (TOAST_RE.test(m)) this.toast(m); /* それ以外はベルの「お知らせ」にだけ残す */ log.push({ m: st.month, t: m.slice(0, 400), ...(at !== undefined && /^\d+$/.test(at) ? { at: Number(at) } : {}) }); }
    if (log.length > 120) { const cut = log.length - 120; log.splice(0, cut); st.newsSeen = Math.max(0, (st.newsSeen ?? 0) - cut); }
    this.renderBell();
  }
  /** ニュース番組風の知らせ（画面の下のテロップ）。テレビ局があれば、キャスターが読み上げる */
  private newsQ: string[] = []; private newsT = 0;
  private newsShow(m: string): void {
    this.newsQ.push(m); if (this.newsQ.length > 4) this.newsQ.shift(); if (this.newsT) return;
    const next = () => {
      const t = this.newsQ.shift(); let el = document.getElementById('newsbar');
      if (!t) { el?.classList.remove('on'); this.newsT = 0; return; }
      if (!el) { el = document.createElement('div'); el.id = 'newsbar'; $('app').appendChild(el); }
      const tv = hasOp(this.game.state, 'tvStation'), body = t.replace(/^\S+\s*/, '');
      const tag = /^🔥/.test(t) ? '速報' : /^🗳|^📣/.test(t) ? '選挙' : /^🏛/.test(t) ? '議会' : /^📊|^🏆/.test(t) ? '発表' : /^📱/.test(t) ? 'SNS' : /^🏢/.test(t) ? '行政' : /^🎆/.test(t) ? '行事' : 'ニュース';
      el.innerHTML = `<div class="nb-l"><b>${tv ? '📺 スムテレビ' : '📻 市民ニュース'}</b><span class="tag ${tag === '速報' ? 'hot' : ''}">${tag}</span></div><div class="nb-t"><span>${esc(body)}</span></div>`;
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      if (tv || tag === '速報' || tag === '選挙') sound.say(body.replace(/（[^）]*）/g, '').slice(0, 80), { vol: 0.55, rate: 1.05 });
      this.newsT = window.setTimeout(next, Math.max(5200, body.length * 140));
    };
    next();
  }
  act(a: Action): boolean {
    const r = this.game.act(a);
    sound.uiAct(a, r.ok);
    this.toast(r.msg, !r.ok);
    return r.ok;
  }

  // ------------------------------------------------------------ 入力
  private bind(): void {
    const cv = this.view.renderer.domElement;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) { const p = [...this.pointers.values()]; this.pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); this.drag = null; this.clearPreview(); return; }
      if (e.button === 1) e.preventDefault();
      const tile = this.view.pick(e.clientX, e.clientY);
      const toolOn = this.tool.t !== 'select' && this.view.mode === 'orbit' && !this.photo;
      // 施設は「クリックで置く・ドラッグで地図を動かす」。道路・用途・線路は左ドラッグで引き、右ドラッグで地図を動かす。中ボタンは回転
      const place = this.tool.t === 'build' || this.tool.t === 'sandbox';
      const mode = e.button === 1 ? 'rotate' : e.button === 2 ? (toolOn ? 'pan' : 'rotate') : toolOn ? (place ? 'tap' : 'tool') : this.view.mode === 'ground' ? 'rotate' : 'pan';
      this.drag = { id: e.pointerId, btn: e.button, x: e.clientX, y: e.clientY, moved: false, start: tile, mode };
      if (mode === 'tool' || mode === 'tap') this.preview(tile);
    });
    cv.addEventListener('pointermove', e => {
      const prev = this.pointers.get(e.pointerId);
      if (prev && this.pointers.size === 2) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = [...this.pointers.values()], d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (this.pinch > 0) this.view.zoomBy(this.pinch / Math.max(1, d));
        this.pinch = d; this.view.panBy((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
        return;
      }
      if (prev) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = this.drag;
      if (d && d.id === e.pointerId) {
        const dx = e.clientX - (prev?.x ?? e.clientX), dy = e.clientY - (prev?.y ?? e.clientY);
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
        if (d.mode === 'tap' && d.moved) { d.mode = 'pan'; this.view.setGhost(null); } // 置く道具のまま、ドラッグで地図を動かせる
        if (d.mode === 'rotate') this.view.orbitBy(dx, dy);
        else if (d.mode === 'pan') { if (d.moved) this.view.panBy(dx, dy); }
        else if (d.mode === 'tool') this.preview(this.view.pick(e.clientX, e.clientY));
      } else if (!d && this.tool.t !== 'select' && !this.photo) this.preview(this.view.pick(e.clientX, e.clientY));
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId); this.pinch = 0;
      const d = this.drag; if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      const tile = this.view.pick(e.clientX, e.clientY);
      if (d.mode === 'tool' || d.mode === 'tap') this.commit(d.start, tile, e.pointerType !== 'mouse');
      else if (this.tool.t !== 'select' && e.pointerType === 'mouse') this.preview(tile);
      else if (d.btn === 0 && !d.moved && this.view.mode === 'orbit' && !this.photo) this.select(tile);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!this.drag) this.clearPreview(); });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.view.zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    window.addEventListener('keydown', e => {
      const tg = e.target as HTMLElement; if (tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT' || tg.tagName === 'SELECT')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); this.setSpeed(this.game.speed ? 0 : (this.lastSpeed || 1)); return; }
      if (k === 'escape') { this.view.followCar = -1; this.escape(); return; }
      if (k === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.doUndo(); return; }
      if (['1', '2', '3'].includes(k) && !e.ctrlKey && !e.metaKey) { this.setSpeed(Number(k)); return; }
      this.view.keys.add(k);
      if (k.startsWith('arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.view.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.view.keys.clear());
    window.addEventListener('resize', () => this.view.resize());
    document.addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (el && !(el as HTMLButtonElement).disabled) { if (el.dataset.act !== 'sound') sound.click(); this.onAct(el.dataset.act!, el.dataset.arg ?? '', el); }
    });
    document.addEventListener('toggle', e => { const d = e.target as HTMLDetailsElement; if (d && d.tagName === 'DETAILS' && d.dataset.k) { if (d.open) this.openK.add(d.dataset.k); else this.openK.delete(d.dataset.k); } }, true);
    document.addEventListener('input', e => {
      const el = e.target as HTMLInputElement;
      if (el.id === 'hour') { this.view.hour = Number(el.value); this.view.clockRun = false; this.renderViewbar(); }
      if (el.id === 'fov') this.view.fov = Number(el.value);
      if (el.id === 'sndvol') { sound.set.vol = Number(el.value); sound.save(); }
      if (el.id === 'phour') { this.view.hour = Number(el.value); this.view.clockRun = false; }
      if (el.id === 'pwx') this.view.weatherForce = el.value as '';
      if (el.id === 'pdof') this.view.dof = el.checked;
      if (el.id === 'pmini') { this.mini = el.checked; $('app').classList.toggle('mini', this.mini); }
      if (el.id === 'pfilter') { this.pfilter = el.value; this.view.canvas.style.filter = PFILTERS[this.pfilter]?.[1] ?? ''; }
      if (el.id === 'pstamp') this.pstamp = el.checked;
    });
    document.addEventListener('change', e => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.policy) this.act({ type: 'policy', id: el.dataset.policy, on: el.checked });
      if (el.id === 'quality') { this.view.setQuality(el.value as any); }
      if (el.dataset.act === 'railfreq') { this.act({ type: 'pol', op: 'railfreq', n: Number(el.value) }); this.renderSide(); }
      if (el.dataset.act === 'busfreq') { this.act({ type: 'pol', op: 'freq', id: el.dataset.arg, n: Number(el.value) }); this.renderSide(); }
      if (el.id === 'loadfile' && el.files && el.files[0]) el.files[0].text().then(t => this.loadText(t));
    });
  }
  lastSpeed = 2;
  setSpeed(n: number): void {
    if (n > 0 && this.game.blocked) { this.toast(this.game.draft ? '試算モード中は時間が止まります。計画を実行するか破棄してください' : 'イベントか選挙結果への対応が先です', true); }
    this.game.speed = n; if (n) this.lastSpeed = n;
    this.renderTop(true);
  }
  private escape(): void {
    if (this.shot) { this.shot = ''; this.renderModal(); return; }
    if (this.menu) { this.menu = false; this.renderModal(); return; }
    if (this.photo) { this.setPhoto(false); return; }
    if (this.view.mode === 'ground') { this.view.setMode('orbit'); this.renderViewbar(); return; }
    if (this.tool.t !== 'select' || this.group) { this.setTool({ t: 'select' }); this.group = null; this.renderTools(); return; }
    this.sel = null; this.renderInfo(); this.view.setCursor([]); this.view.setRoute(-1);
  }
  setTool(t: Tool): void {
    this.tool = t; this.clearPreview();
    this.view.showZones = t.t === 'zone' || t.t === 'devarea' || t.t === 'area'; this.view.showArea = t.t === 'area'; this.view.placeMode = t.t !== 'select'; this.view.refreshOverlay();
    this.renderTools(); this.renderHint();
  }

  // ------------------------------------------------------------ 設置プレビューと実行
  private snapAt: { cur: number; x: number; y: number } | null = null;
  private clearPreview(): void { this.hover = -1; this.view.setGhost(null); if (!this.sel) this.view.setCursor([]); else this.markSel(); this.renderHint(); }
  private tilesFor(start: number, cur: number): number[] {
    if (cur < 0) return [];
    const a = start >= 0 ? start : cur, t = this.tool;
    if (t.t === 'zone' || t.t === 'devarea' || t.t === 'area' || (t.t === 'terra' && t.op !== 'valley')) return rectTiles(a % W, (a / W) | 0, cur % W, (cur / W) | 0);
    // 実在都市版：道路は家や川を避けて自動で道筋を探す（Shift を押している間はまっすぐ）
    if (REAL && t.t === 'road' && !this.view.keys.has('shift')) { const r = routeRoad(this.s, a, cur); if (r) return r; }
    // 線路：新しく敷くときはまっすぐ（線路の端からは曲線でつなぐ）、複線化・高さの変更・撤去は線路に沿ってたどる
    if (t.t === 'rail' && t.level === 1) return railLayPath(this.s, a, cur);
    if ((t.t === 'rail' && t.level >= 2) || t.t === 'unrail' || t.t === 'railgrade' || t.t === 'railKind') { const r = railPath(this.s, a, cur); if (r) return r; }
    return lineTiles(a % W, (a / W) | 0, cur % W, (cur / W) | 0);
  }
  private preview(cur: number): void {
    const t = this.tool, s = this.s;
    this.hover = cur;
    if (cur < 0) { this.view.setCursor([]); this.view.setGhost(null); this.renderHint(); return; }
    const OK = 0x35c46a, BAD = 0xe0453a, WARN = 0xf2c230;
    if (t.t === 'build' || t.t === 'sandbox') {
      const d = DEFS[t.kind];
      // 実在都市版：置けない場所を指したら、近くの置ける場所に寄せる
      const sp = REAL ? snapPlace(s, t.kind, cur % W, (cur / W) | 0, t.t === 'sandbox') : { x: cur % W, y: (cur / W) | 0, moved: false };
      const x = sp.x, y = sp.y;
      this.snapAt = { cur, x, y };
      const c = checkPlace(s, t.kind, x, y, t.t === 'sandbox');
      const tiles: [number, number][] = [];
      for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) if (x + dx < W && y + dy < H) tiles.push([idx(x + dx, y + dy), c.level === 'ok' ? OK : c.level === 'warn' ? WARN : BAD]);
      this.view.setCursor(tiles); this.view.setGhost(c.level === 'error' ? null : t.kind, x, y);
      if (t.t === 'build' && t.move !== undefined) { this.renderHint(c.level === 'error' ? 'error' : 'ok', `${d.name}の移設先：${c.level === 'error' ? c.reasons.join('・') : 'ここに移せます（クリックで移設）'}。Esc でやめる`); return; }
      this.renderHint(c.level, (c.level === 'ok' ? `${d.name}：ここに${d.build === 'invite' ? '誘致できます' : '建てられます'}（${t.t === 'sandbox' ? '直接配置・無料' : `${d.build === 'invite' ? '用地の整備と誘致活動' : d.build === 'request' ? '用地と負担金' : '建設費'} ${yenT(c.cost)}、${d.months} か月`}）${c.reasons.length ? '。' + c.reasons.join('／') : ''}` : `${d.name}：${c.reasons.join('／')}`) + (sp.moved && c.level !== 'error' ? '（近くの置ける場所に合わせました）' : ''));
      return;
    }
    const start = this.drag && this.drag.mode === 'tool' ? this.drag.start : -1;
    const tiles = this.tilesFor(start, cur);
    // 表示と請求が必ず一致するよう、実行と同じ計画関数（planRoad など）で区画数と費用を出す
    const crisis = fiscalCrisis(s) && (t.t === 'road');
    const paint = (pl: TilePlan, okColor: number) => { const okSet = new Set(pl.ok); this.view.setCursor([...new Set(tiles)].map(i => [i, okSet.has(i) ? okColor : BAD])); };
    if (t.t === 'road') {
      // すでに同じか上の道路がある区画は「通るだけ」（費用なし・対象外に数えない）。青で示す
      const pass = new Set(tiles.filter(i => s.road[i] >= t.road)), fresh = tiles.filter(i => !pass.has(i));
      const pl = planRoad(s, fresh.length ? fresh : tiles, t.road), over = pl.cost > s.cash;
      paint(pl, over || crisis ? WARN : OK);
      if (pass.size && fresh.length) { const okSet = new Set(pl.ok); this.view.setCursor([...new Set(tiles)].map(i => [i, pass.has(i) ? 0x4a90d9 : okSet.has(i) ? (over || crisis ? WARN : OK) : BAD])); }
      const why = pl.bad.length ? `／対象外 ${pl.bad.length} 区画（${pl.bad[0][1]}）` : '';
      this.renderHint(over || crisis || !pl.ok.length ? 'error' : 'ok', crisis ? '財政危機のため、新しい道路はつくれません（一時借入が上限を超えています）' : `${ROAD_NAMES[t.road]} ${pl.ok.length} 区間：${yenT(pl.cost)}${over ? '（資金が足りません）' : ''}${why}`);
    } else if (t.t === 'tunnel') {
      const pl = planTunnel(s, tiles, t.road), over = pl.cost > s.cash, tun = new Set(pl.tun), okSet = new Set(pl.ok);
      this.view.setCursor([...new Set(tiles)].map(i => [i, tun.has(i) ? 0x8a6a4a : okSet.has(i) ? (over ? WARN : OK) : BAD]));
      this.renderHint(over || !pl.tun.length ? 'error' : 'ok', pl.tun.length ? `トンネル ${pl.tun.length} 区間（茶色・約 ${pl.tun.length * 30}m）と道路 ${pl.ok.length - pl.tun.length} 区間：${yenT(pl.cost)}${pl.bad.length ? `／対象外 ${pl.bad.length} 区画（${pl.bad[0][1]}）` : ''}` : '山（急斜面や保全林）を通るようにドラッグしてください。山の区画はトンネルになります');
    } else if (t.t === 'bridge') {
      const pl = planBridge(s, tiles, t.road), over = pl.cost > s.cash, br = new Set(pl.br), okSet = new Set(pl.ok);
      this.view.setCursor([...new Set(tiles)].map(i => [i, br.has(i) ? 0x4a90d9 : okSet.has(i) ? (over ? WARN : OK) : BAD]));
      this.renderHint(over || !pl.br.length ? 'error' : 'ok', pl.br.length ? `橋 ${pl.br.length} 区間（青・約 ${pl.br.length * 30}m）と道路 ${pl.ok.length - pl.br.length} 区間：${yenT(pl.cost)}${over ? '（資金が足りません）' : ''}${pl.bad.length ? `／対象外 ${pl.bad.length} 区画（${pl.bad[0][1]}）` : ''}` : '川・水面・水路・谷を渡るようにドラッグしてください。岸の道路から向こう岸までつなぐと、水の上が橋になります');
    } else if (t.t === 'overpass' || t.t === 'footbridge' || t.t === 'canal') {
      const pl = t.t === 'overpass' ? planOverpass(s, tiles) : t.t === 'footbridge' ? planFootbridge(s, tiles) : planCanal(s, tiles), over = pl.cost > s.cash;
      paint(pl, over ? WARN : t.t === 'canal' ? 0x4a90d9 : OK);
      const nm = t.t === 'overpass' ? '陸橋（踏切をなくす）' : t.t === 'footbridge' ? '歩道橋' : '水路';
      this.renderHint(over || !pl.ok.length ? 'error' : 'ok', pl.ok.length ? `${nm} ${pl.ok.length} ${t.t === 'canal' ? '区画' : 'か所'}：${yenT(pl.cost)}${over ? '（資金が足りません）' : ''}${pl.bad.length ? `／対象外 ${pl.bad.length} 区画（${pl.bad[0][1]}）` : ''}` : (pl.bad[0]?.[1] ?? (t.t === 'overpass' ? '踏切（道路と地上の線路が交わる区画）を選んでください' : t.t === 'footbridge' ? '道路の区画を選んでください' : '空き地をドラッグしてください')));
    } else if (t.t === 'terra' || t.t === 'widen' || t.t === 'flyover') {
      const pl = t.t === 'terra' ? planTerra(s, tiles, t.op) : t.t === 'widen' ? planWiden(s, tiles, t.on) : planFlyover(s, tiles), over = pl.cost > s.cash;
      paint(pl, over ? WARN : t.t === 'terra' ? (t.op === 'water' || t.op === 'wet' ? 0x4a90d9 : t.op === 'forest' ? 0x2f7a3a : 0xb08a4a) : OK);
      const nm = t.t === 'terra' ? TERRA_NAMES[t.op] : t.t === 'widen' ? (t.on ? '6 車線に広げる' : '4 車線に戻す') : '立体交差';
      this.renderHint(over || !pl.ok.length ? 'error' : 'ok', pl.ok.length ? `${nm} ${pl.ok.length} ${t.t === 'flyover' ? 'か所' : '区画'}${pl.cost ? `：${yenT(pl.cost)}` : ''}${over ? '（資金が足りません）' : ''}${pl.bad.length ? `／対象外 ${pl.bad.length} 区画（${pl.bad[0][1]}）` : ''}` : (pl.bad[0]?.[1] ?? '区画をドラッグしてください'));
    } else if (t.t === 'street') {
      const pl = planStreet(s, tiles, t.style), over = pl.cost > s.cash, nm = { tree: '並木道', stone: '石畳・カラー舗装', nopole: '無電柱化', charge: '走行中給電', none: 'ふつうの道路に戻す' }[t.style];
      this.renderHint(over || !pl.ok.length ? 'error' : 'ok', pl.ok.length ? `${nm} ${pl.ok.length} 区間${pl.cost ? `：${yenT(pl.cost)}` : '（無料）'}${over ? '（お金が足りません）' : ''}` : (pl.bad[0]?.[1] ?? '道路の上をドラッグしてください'));
    } else if (t.t === 'busStop' || t.t === 'levee' || t.t === 'area') {
      const pl = t.t === 'busStop' ? planBusStop(s, tiles, t.on) : t.t === 'levee' ? planLevee(s, tiles) : planArea(s, tiles, t.v), over = pl.cost > s.cash;
      paint(pl, over ? WARN : t.t === 'area' ? AREA_C[t.v] : t.t === 'levee' ? 0x8a6a4a : OK);
      const nm = t.t === 'busStop' ? (t.on ? 'バス停' : 'バス停の撤去') : t.t === 'levee' ? '堤防' : AREA_N[t.v];
      this.renderHint(over || !pl.ok.length ? 'error' : 'ok', pl.ok.length ? `${nm} ${pl.ok.length} ${t.t === 'busStop' ? 'か所' : '区画'}${pl.cost ? `：${yenT(pl.cost)}` : '（無料）'}${over ? '（資金が足りません）' : ''}${pl.bad.length ? `／対象外 ${pl.bad.length} 区画（${pl.bad[0][1]}）` : ''}` : (pl.bad[0]?.[1] ?? '区画をドラッグしてください'));
    } else if (t.t === 'rail') {
      const pl = planRail(s, tiles, t.level, t.grade), over = pl.cost > s.cash;
      paint(pl, over ? WARN : 0x8e6bd6);
      const cross = t.level === 1 && t.grade === 0 ? pl.ok.filter(i => s.road[i]).length : 0;
      this.renderHint(over || !pl.ok.length ? 'error' : 'ok', pl.ok.length ? `${t.level === 3 ? '複々線化' : t.level === 2 ? '複線化' : `${['地上', '高架', '地下', '掘割'][t.grade]}の単線`} ${pl.ok.length} 区間：${yenT(pl.cost)}（市が負担し、鉄道事業者が工事。維持の負担金 月 ${P.railUpkeep[t.level]} 万円〜/区間）${cross ? `。踏切 ${cross} か所` : ''}${over ? '（資金が足りません）' : ''}${pl.bad.length ? `／対象外 ${pl.bad.length} 区画（${pl.bad[0][1]}）` : ''}` : (pl.bad[0]?.[1] ?? '線路を敷ける区画がありません'));
    } else if (t.t === 'railKind') {
      const pl = planRailKind(s, tiles, t.kind), over = pl.cost > s.cash;
      paint(pl, over ? WARN : 0x2bb6a3);
      this.renderHint(over || !pl.ok.length ? 'error' : 'ok', pl.ok.length ? `線路 ${pl.ok.length} 区間を${RAILKIND_NAME[t.kind]}に${pl.cost ? `：${yenT(pl.cost)}` : '（無料）'}${over ? '（資金が足りません）' : ''}` : (pl.bad[0]?.[1] ?? '線路に沿ってドラッグしてください'));
    } else if (t.t === 'railgrade') {
      const pl = planRailGrade(s, tiles, t.grade), over = pl.cost > s.cash;
      paint(pl, over ? WARN : 0x8e6bd6);
      const fix = t.grade ? pl.ok.filter(i => s.road[i] && !s.railGrade?.[i]).length : 0;
      this.renderHint(over || !pl.ok.length ? 'error' : 'ok', pl.ok.length ? `線路 ${pl.ok.length} 区間を${['地上に戻す', '高架にする', '地下にする'][t.grade]}：${yenT(pl.cost)}${fix ? `。踏切 ${fix} か所がなくなります` : ''}${over ? '（資金が足りません）' : ''}${pl.bad.length ? `／対象外 ${pl.bad.length} 区画（${pl.bad[0][1]}）` : ''}` : (pl.bad[0]?.[1] ?? '対象の線路がありません'));
    } else if (t.t === 'unrail') {
      const pl = planUnrail(s, tiles);
      paint(pl, WARN);
      this.renderHint(pl.ok.length ? 'warn' : 'error', pl.ok.length ? `線路 ${pl.ok.length} 区間を撤去：${yenT(pl.cost)}。線路が途切れて市外につながらなくなった駅は使えなくなります` : (pl.bad[0]?.[1] ?? '撤去できる線路がありません'));
    } else if (t.t === 'unroad') {
      const pl = planUnroad(s, tiles);
      paint(pl, WARN);
      this.renderHint(pl.ok.length ? 'warn' : 'error', pl.ok.length ? `市道 ${pl.ok.length} 区間を撤去：${yenT(pl.cost)}。沿道が市外につながらなくなると、住宅は転出が進み店舗・施設は止まります` : (pl.bad[0]?.[1] ?? '撤去できる市道がありません'));
    } else if (t.t === 'repair') {
      const pl = planRepair(s, tiles);
      paint(pl, OK);
      this.renderHint(pl.ok.length ? 'ok' : 'error', pl.ok.length ? `市道 ${pl.ok.length} 区間を補修：${yenT(pl.cost)}（老朽度を 0 に戻します）` : '補修が必要な市道がありません');
    } else if (t.t === 'devarea') {
      const lay = devLayout(s, tiles), pr = planRoad(s, lay.road, 1), pz = planZone(s, lay.lots, t.zone), okR = new Set(pr.ok), okZ = new Set(pz.ok), over = pr.cost > s.cash;
      this.view.setCursor([...new Set(tiles)].map(i => [i, okR.has(i) ? 0x6f7478 : okZ.has(i) ? parseInt(ZC[t.zone].slice(1), 16) : s.road[i] ? 0x4a90d9 : BAD]));
      this.renderHint(over || (!pr.ok.length && !pz.ok.length) ? 'error' : 'ok', `区画整理：生活道路 ${pr.ok.length} 区間（${yenT(pr.cost)}）と、${ZONE_NAMES[t.zone]} ${pz.ok.length} 区画の指定${over ? '（資金が足りません）' : ''}。範囲の端を既存の道路に接するようにドラッグしてください`);
    } else if (t.t === 'zone') {
      const pl = planZone(s, tiles, t.zone);
      paint(pl, parseInt(ZC[t.zone || 1].slice(1), 16));
      this.renderHint(pl.ok.length ? 'ok' : 'error', pl.ok.length ? `${t.zone ? ZONE_NAMES[t.zone] + 'に指定' : '指定を解除'}：${pl.ok.length} 区画（無料）` : `用途を変えられる空き区画がありません（${pl.bad[0]?.[1] ?? ''}）`);
    }
  }
  private commit(start: number, cur: number, touch = false): void {
    const t = this.tool;
    if (cur < 0) { this.clearPreview(); return; }
    let x = cur % W, y = (cur / W) | 0;
    if ((t.t === 'build' || t.t === 'sandbox') && this.snapAt && this.snapAt.cur === cur) { x = this.snapAt.x; y = this.snapAt.y; }
    const tiles = this.tilesFor(start, cur);
    const a: Action | null = t.t === 'build' ? (t.move !== undefined ? { type: 'move', id: t.move, x, y } : { type: 'build', kind: t.kind, x, y }) : t.t === 'sandbox' ? { type: 'sandboxPlace', kind: t.kind, x, y }
      : t.t === 'rail' ? { type: 'rail', tiles, level: t.level, grade: t.grade } : t.t === 'railgrade' ? { type: 'railgrade', tiles, grade: t.grade } : t.t === 'railKind' ? { type: 'railKind', tiles, kind: t.kind } : t.t === 'unrail' ? { type: 'unrail', tiles }
      : t.t === 'tunnel' ? { type: 'tunnel', tiles, road: t.road } : t.t === 'bridge' ? { type: 'bridge', tiles, road: t.road } : t.t === 'overpass' ? { type: 'overpass', tiles } : t.t === 'footbridge' ? { type: 'footbridge', tiles } : t.t === 'canal' ? { type: 'canal', tiles } : t.t === 'terra' ? { type: 'terra', tiles, op: t.op } : t.t === 'widen' ? { type: 'widen', tiles, on: t.on } : t.t === 'flyover' ? { type: 'flyover', tiles } : t.t === 'busStop' ? { type: 'busStop', tiles, on: t.on } : t.t === 'street' ? { type: 'street', tiles, style: t.style } : t.t === 'levee' ? { type: 'levee', tiles } : t.t === 'area' ? { type: 'area', tiles, v: t.v } : t.t === 'road' ? { type: 'road', tiles: tiles.filter(i => this.s.road[i] < t.road).length ? tiles.filter(i => this.s.road[i] < t.road) : tiles, road: t.road } : t.t === 'unroad' ? { type: 'unroad', tiles } : t.t === 'repair' ? { type: 'repair', tiles } : t.t === 'zone' ? { type: 'zone', tiles, zone: t.zone } : null;
    if (t.t === 'devarea') {
      const lay = devLayout(this.s, tiles), pr = planRoad(this.s, lay.road, 1);
      const r1 = pr.ok.length ? this.game.act({ type: 'road', tiles: pr.ok, road: 1 }) : { ok: true, msg: '' };
      if (!r1.ok) { this.renderHint('error', r1.msg); return; }
      const pz = planZone(this.s, lay.lots, t.zone), r2 = pz.ok.length ? this.game.act({ type: 'zone', tiles: pz.ok, zone: t.zone }) : { ok: true, msg: '' };
      this.view.setGhost(null); this.view.setCursor([]); this.view.refreshOverlay();
      this.toast(`区画整理：道路 ${pr.ok.length} 区間・${ZONE_NAMES[t.zone]} ${r2.ok ? pz.ok.length : 0} 区画。需要があれば民間が家を建てます`);
      if (!touch) this.preview(cur); else this.renderHint();
      return;
    }
    if (!a) return;
    const r = this.game.act(a);
    sound.uiAct(a, r.ok);
    this.view.setGhost(null); this.view.setCursor([]); this.view.refreshOverlay();
    if (r.ok && a.type === 'move') { this.toast(r.msg); this.setTool({ t: 'select' }); this.refresh(); return; }
    if (r.ok) { this.toast(r.msg); if (!touch) this.preview(cur); else this.renderHint(); }
    else this.renderHint('error', t.t === 'road' && r.msg === '既に道路があります' ? 'そこは既に道路です。道路の端から、道のない方へドラッグしてください' : r.msg);
  }
  private select(tile: number): void {
    if (phone() && tile >= 0) $('side').classList.add('closed');
    if (tile < 0) { this.sel = null; }
    else { const id = this.s.occ[tile]; this.sel = id ? { b: id } : { tile }; }
    this.markSel(); this.renderInfo();
  }
  private markSel(): void {
    const s = this.s, sel = this.sel;
    if (!sel) { this.view.setCursor([]); if (this.view.routeKey) this.view.setRoute(-1); return; }
    if (sel.b) { const b = s.buildings.find(o => o.id === sel.b); if (!b) { this.sel = null; this.view.setCursor([]); return; } this.view.setRoute(isRes(b.kind) && b.acc >= 0 ? b.acc : -1); const t: [number, number][] = []; for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) t.push([idx(b.x + dx, b.y + dy), 0xffffff]); this.view.setCursor(t); }
    else if (sel.tile !== undefined) this.view.setCursor([[sel.tile, 0xffffff]]);
  }

  // ------------------------------------------------------------ クリック操作
  private onAct(act: string, arg: string, el: HTMLElement): void {
    const g = this.game, s = this.s;
    switch (act) {
      case 'speed': this.setSpeed(Number(arg)); break;
      case 'auto': {
        if (g.draft) { this.toast('試算モード中はオートにできません', true); break; }
        g.auto = !g.auto;
        if (g.auto && this.gc && !this.s.challenge && this.s.month === 0) { this.act({ type: 'challenge', id: this.gc }); this.gc = null; } // 公約の画面で選んだ挑戦も始める
        if (g.auto) { g.autoUnblock(); if (!g.speed) g.speed = 2; this.lastSpeed = g.speed; this.eventHidden = false; this.toast(`オートプレイを始めました（作戦：${AUTO_ORDERS[s.autoOrder ?? 1].name}）。［概要］で作戦を変えられ、判断の記録も出ます`); }
        else this.toast('手動に戻しました');
        this.refresh(); break;
      }
      case 'aorder': { // オートへの作戦を変える
        const k = Math.max(0, Math.min(2, Number(arg) | 0)) as 0 | 1 | 2; if ((s.autoOrder ?? 1) === k) break;
        s.autoOrder = k; g.autoLog.push({ month: s.month, text: `作戦を「${AUTO_ORDERS[k].name}」に変更` }); this.toast(`作戦：${AUTO_ORDERS[k].icon} ${AUTO_ORDERS[k].name}（${AUTO_ORDERS[k].short}）`); this.refresh(); break;
      }
      case 'issue': {
        const v = this.view, see = (layer: Layer, key: string) => { v.layer = layer; v.refreshOverlay(); this.renderViewbar(); const x = s.voices.find(o => o.key.startsWith(key) && o.tile >= 0); if (x) v.focus(x.tile, 520); this.refreshTutorial(); };
        if (arg === 'go') this.setSpeed(2);
        else if (arg === 'buildNursery') { see('care', 'care'); this.setTool({ t: 'build', kind: 'nursery' }); this.toast('赤い住宅の近くで、道路に面した空き地をクリックしてください'); }
        else if (arg === 'seeCare') { this.setTool({ t: 'select' }); see('care', 'care'); this.toast('赤い住宅ほど、保育園に入れない子がいます。青が保育園です'); }
        else if (arg === 'seeTraffic') { this.setTool({ t: 'select' }); see('traffic', 'traffic'); this.toast('赤・橙の道が容量を超えています'); }
        else if (arg === 'widen') { see('traffic', 'traffic'); this.setTool({ t: 'road', road: 2 }); this.toast('赤・橙の道の上をドラッグでなぞると、幹線道路に広がります'); }
        else if (arg === 'water') { const b = [...s.buildings].filter(o => fam(o.kind) === 'water').sort((p, q) => q.age - p.age)[0]; if (b) { this.sel = { b: b.id }; v.focus(idx(b.x, b.y), 420); this.markSel(); this.renderInfo(); } }
        else if (arg === 'road') { this.setTool({ t: 'road', road: 1 }); }
        else if (arg === 'zone') { this.setTool({ t: 'zone', zone: 1 }); }
        else if (arg === 'term') { this.tab = 'term'; this.renderSide(); }
        else if (arg === 'policy' || arg === 'money') { this.tab = arg as Tab; this.renderSide(); }
        if (phone() && arg !== 'policy' && arg !== 'money' && arg !== 'term') { $('side').classList.add('closed'); }
        break;
      }
      case 'ix': this.issueAct(arg); break;
      case 'play': { // v90：遊び方の入口（経営とは別の遊び方）
        if (arg === 'photo' || arg === 'ground') { this.menu = false; this.renderModal(); if (arg === 'photo') this.setPhoto(true); else { this.view.setMode('ground'); this.renderViewbar(); this.toast('街歩き：W A S D で歩く・ドラッグで見回す・Esc で戻る（スマホは画面の下のボタン）'); } break; }
        if (arg === 'sandbox') { const st = g.state; if (st.mode === 'sandbox') break; if (!this.confirmPlay) { this.confirmPlay = true; this.renderModal(); setTimeout(() => { this.confirmPlay = false; }, 6000); break; }
          this.confirmPlay = false; st.mode = 'sandbox'; st.goalPick = false; st.notes.push('🧱 自由建築に切り替えました。「直」の道具で、費用も土地の持ち主も気にせず建物を置けます。選挙はありません'); this.menu = false; this.renderModal(); this.renderTools(); this.refresh(); }
        break; }
      case 'ptrial': { const p = POLICIES.find(x => x.id === arg); if (!p) break; const on = !!g.state.policies[p.id]?.on; this.ptrial = { id: p.id, busy: true, res: null }; this.renderSide();
        setTimeout(() => { if (this.ptrial?.id !== p.id) return; this.ptrial.res = compareTrial(g.state, [{ type: 'policy', id: p.id, on: !on }], '*'); this.ptrial.busy = false; this.renderSide(); }, 30); break; }
      case 'vpol': { this.tab = 'policy'; this.renderSide(); requestAnimationFrame(() => { const e = document.getElementById('pol-' + arg)?.closest('.card') as HTMLElement | null; if (e) { e.scrollIntoView({ block: 'start' }); e.classList.add('f90-flash'); setTimeout(() => e.classList.remove('f90-flash'), 1600); } }); break; }
      case 'vsel': { const k = Number(arg), v = s.voices[k]; this.vsel = this.vsel === k ? -1 : k;
        if (v && this.vsel === k) { const d = voiceDistrict(s, v), t = v.tile >= 0 ? v.tile : d >= 0 ? districtCenter(s, d) : -1; if (t >= 0) this.view.focus(t, 520); if (v.layer !== 'none') { this.view.layer = v.layer; this.view.refreshOverlay(); this.renderViewbar(); } }
        this.renderSide(); break; }
      case 'report': { if (arg === 'close') this.reportOpen = null; else { const y0 = Math.floor(g.state.month / 12) * 12; this.reportOpen = annualReport(g.state, y0 - (g.state.month - y0 < 3 ? 12 : 0), g.state.month + 1, `${Math.floor(g.state.month / 12) + 1} 年目の報告（途中経過）`); } this.renderModal(); break; }
      case 'camrot': this.view.want.yaw += Number(arg) * 0.6; break;
      case 'camzoom': this.view.zoomBy(Number(arg) > 0 ? 0.7 : 1.4); break;
      case 'group': if (phone()) $('side').classList.add('closed'); this.group = this.group === arg ? null : arg; if (arg === 'select') { this.group = null; this.setTool({ t: 'select' }); } this.renderTools(); break;
      case 'tool': {
        const [k, v, w] = arg.split(':');
        this.setTool(k === 'devarea' ? { t: 'devarea', zone: Number(v) as 1 | 2 | 3 } : k === 'rail' ? { t: 'rail', level: Number(v) as 1 | 2, grade: Number(w || 0) as 0 | 1 | 2 } : k === 'railkind' ? { t: 'railKind', kind: Number(v) as 0 | 1 | 2 } : k === 'railgrade' ? { t: 'railgrade', grade: Number(v) as 0 | 1 | 2 } : k === 'unrail' ? { t: 'unrail' } : k === 'road' ? { t: 'road', road: Number(v) as 1 | 2 } : k === 'tunnel' ? { t: 'tunnel', road: Number(v) as 1 | 2 } : k === 'bridge' ? { t: 'bridge', road: Number(v) as 1 | 2 } : k === 'overpass' ? { t: 'overpass' } : k === 'footbridge' ? { t: 'footbridge' } : k === 'canal' ? { t: 'canal' } : k === 'terra' ? { t: 'terra', op: v as TerraOp } : k === 'widen' ? { t: 'widen', on: v === '1' } : k === 'street' ? { t: 'street', style: v as 'tree' | 'stone' | 'nopole' | 'charge' | 'none' } : k === 'flyover' ? { t: 'flyover' } : k === 'busStop' ? { t: 'busStop', on: v === '1' } : k === 'levee' ? { t: 'levee' } : k === 'area' ? { t: 'area', v: Number(v) as 0 | 1 | 2 } : k === 'unroad' ? { t: 'unroad' } : k === 'repair' ? { t: 'repair' } : k === 'zone' ? { t: 'zone', zone: Number(v) as Zone } : k === 'build' ? { t: 'build', kind: v as Kind } : { t: 'sandbox', kind: v as Kind });
        this.group = null; this.renderTools(); if (phone()) { $('side').classList.add('closed'); this.sel = null; this.renderInfo(); }
        break;
      }
      case 'candsee': case 'candbuild': {
        const [cx, cy] = arg.split(':').map(Number), tile = idx(cx, cy), t = this.tool;
        if (t.t !== 'build') break;
        if (act === 'candsee') { this.view.focus(tile, 380); this.snapAt = { cur: tile, x: cx, y: cy }; this.preview(tile); break; }
        const r = this.game.act({ type: 'build', kind: t.kind, x: cx, y: cy });
        this.view.setGhost(null); this.view.setCursor([]); this.view.refreshOverlay();
        if (r.ok) { this.toast(r.msg); this.view.focus(tile, 380); } else this.renderHint('error', r.msg);
        break;
      }
      case 'tab': this.tab = arg as Tab; $('side').classList.remove('closed'); this.renderSide(); break;
      case 'sidetoggle': $('side').classList.toggle('closed'); if (phone()) { this.group = null; this.renderTools(); this.sel = null; this.renderInfo(); } this.renderSide(); break;
      case 'sound': { const on = sound.toggle(); const sb = document.querySelector('.sndbtn'); if (sb) sb.textContent = on ? '🔊' : '🔇'; if (el.classList.contains('seg')) el.textContent = on ? '🔊 音あり' : '🔇 消音'; el.setAttribute('aria-pressed', String(on)); this.toast(on ? '音を出します（BGM・街の音・効果音・声）。保存・設定で細かく選べます' : '音を消しました'); break; }
      case 'sndset': { const k = arg as 'bgm' | 'env' | 'sfx' | 'voice'; sound.set[k] = !sound.set[k]; sound.save(); el.setAttribute('aria-pressed', String(sound.set[k])); break; }
      case 'news': { this.newsOpen = !this.newsOpen; if (this.newsOpen) this.renderModal(); this.game.state.newsSeen = this.game.state.news?.length ?? 0; if (!this.newsOpen) this.renderModal(); this.renderBell(); break; }
      case 'menutab': this.menuTab = arg as 'set' | 'save'; this.menuMsg = ''; this.renderModal(); break;
      case 'fontsize': this.fontSize = arg as 's' | 'm' | 'l'; try { localStorage.setItem('sumu-fs', arg); } catch { /* なし */ } this.applyFont(); this.renderModal(); break;
      case 'viewtoggle': { const o = $('viewbar').classList.toggle('open'); try { localStorage.setItem('sumu-viewbar', o ? '1' : '0'); } catch { /* なし */ } this.renderViewbar(); break; }
      case 'layer': this.view.layer = (this.view.layer === arg ? 'none' : arg) as Layer; this.view.refreshOverlay(); this.renderViewbar(); this.refreshTutorial(); break;
      case 'cam': if (arg === 'photo') this.setPhoto(true); else { this.view.setMode(arg as any); this.renderViewbar(); } break;
      case 'clock': this.view.clockRun = !this.view.clockRun; this.renderViewbar(); break;
      case 'focus': { const [tile, layer] = arg.split(':'); if (Number(tile) >= 0) { this.view.focus(Number(tile)); this.select(Number(tile)); } if (layer && layer !== 'none') { this.view.layer = layer as Layer; this.view.refreshOverlay(); this.renderViewbar(); this.refreshTutorial(); } if (el.dataset.also === 'hide') { this.eventHidden = true; this.renderModal(); this.renderDraftbar(); } break; }
      case 'selb': { const b = s.buildings.find(o => o.id === Number(arg)); if (b) { this.sel = { b: b.id }; this.view.focus(idx(b.x, b.y)); this.markSel(); this.renderInfo(); } break; }
      case 'closeinfo': this.sel = null; this.view.setCursor([]); this.view.setRoute(-1); this.renderInfo(); break;
      case 'staff': { const b = s.buildings.find(o => o.id === this.sel?.b); if (b) this.act({ type: 'staff', id: b.id, n: (b.staffTarget ?? 0) + Number(arg) }); break; }
      case 'renew': this.act({ type: 'renew', id: Number(arg) }); break;
      case 'redevshow': { const rp = this.redevPlan(); if (rp) { this.view.focus(rp.at, 520); this.view.setCursor([...rp.road.map(i => [i, 0x4f8fe0] as [number, number]), ...rp.lots.map(i => [i, 0x58b368] as [number, number]), ...rp.buy.map(id => { const b = s.buildings.find(o => o.id === id)!; return [idx(b.x, b.y), 0xe0503a] as [number, number]; })]); this.toast('青：通す道路／緑：使えるようになる区画／赤：買い取る住宅'); } break; }
      case 'redevelop': {
        // 区画整理：入口をふさぐ住宅を買い取り、取り残された空き地に生活道路を通して、低層住宅に指定する
        const rp = this.redevPlan(); if (!rp) break;
        if (s.cash < rp.cost) { this.toast(`資金が足りません（必要 ${yenT(rp.cost)}）。［財政］で市債を発行できます`, true); break; }
        for (const id of rp.buy) if (!this.game.act({ type: 'buyout', id }).ok) { this.toast('住宅の買収ができませんでした', true); this.refresh(); return; }
        const r = this.game.act({ type: 'road', tiles: rp.road, road: 1 });
        if (r.ok) { const lots = rp.lots.filter(i => !s.occ[i] && !s.road[i]); if (lots.length) this.game.act({ type: 'zone', tiles: lots, zone: 1 }); this.toast(`区画整理：生活道路を ${rp.road.length} 区間通し、${lots.length} 区画を低層住宅に指定しました${rp.buy.length ? `（住宅 ${rp.buy.length} 軒を買収）` : ''}`); this.view.focus(rp.at, 520); }
        else this.toast(r.msg, true);
        this.redevCache = null; this.refresh(); break;
      }
      case 'renewall': {
        // 老朽化で使用停止した施設を、資金の続く限りまとめて更新する（arg は施設の系統。all はすべて）
        const list = s.buildings.filter(b => isCity(b.kind) && b.status === 'suspended' && b.age >= 99 && (arg === 'all' || fam(b.kind) === arg)).sort((a, b) => renewCostOf(a) - renewCostOf(b));
        let n = 0, cost = 0; for (const b of list) { if (s.cash < renewCostOf(b)) break; const r = this.game.act({ type: 'renew', id: b.id }); if (r.ok) { n++; cost += renewCostOf(b); } }
        this.toast(n ? `使用停止の施設 ${n} か所の更新を始めました（${yenT(cost)}）${n < list.length ? `。残り ${list.length - n} か所は資金が足りません` : ''}` : '資金が足りず、更新できませんでした。市債を発行してください', !n);
        break;
      }
      case 'upgrade': this.act({ type: 'upgrade', id: Number(arg) }); break;
      case 'team': { const [sp, on] = arg.split(':'); this.act({ type: 'team', sport: sp as any, on: on === '1' }); this.refresh(); break; }
      case 'rerun': this.act({ type: 'rerun' }); this.refresh(); break;
      case 'buyout': if (el.dataset.sure) { if (this.act({ type: 'buyout', id: Number(arg) })) { this.sel = null; this.view.setCursor([]); this.renderInfo(); } } else { el.dataset.sure = '1'; el.textContent = 'もう一度押すと買収・撤去'; } break;
      case 'bcat': this.bcat = arg as Cat; this.renderTools(); break;
      case 'tax': { const [k, v] = arg.split(':'); this.act({ type: 'tax', key: k as any, v: k === 'stay' ? Number(v) : Math.round((s.tax[k as 'res'] + Number(v)) * 100) / 100 }); break; }
      case 'civic': if (el.dataset.sure) this.act({ type: 'civic', id: arg }); else { el.dataset.sure = '1'; el.textContent = 'もう一度押すと実行'; } break;
      case 'gpick': { const i = this.gp.indexOf(arg); if (i >= 0) this.gp.splice(i, 1); else if (this.gp.length < 3) this.gp.push(arg); else this.toast('公約は 3 つまでです。外したいものをもう一度押してください', true); this.renderModal(); break; }
      case 'gvision': {
        // ビジョンを選び直したら、前のビジョンが入れた公約を外し、新しいビジョンの公約を入れる（自分で選んだ公約は、空きがあれば残す）
        const old = VISIONS.find(o => o.id === this.gv); this.gv = this.gv === arg ? null : arg; const v = VISIONS.find(o => o.id === this.gv);
        const mine = this.gp.filter(id => !old?.goals.includes(id));
        this.gp = [...new Set([...(v?.goals.slice(0, 3) ?? []), ...mine])].slice(0, 3);
        this.renderModal(); break;
      }
      case 'diff': this.act({ type: 'difficulty', v: arg as any }); this.renderModal(); break;
      case 'gok': { if (this.gc && !this.s.challenge && !this.act({ type: 'challenge', id: this.gc })) break; if (this.act({ type: 'goals', ids: [...this.gp], vision: this.gv ?? undefined })) { this.gp = []; this.gv = null; this.gc = null; this.tab = 'term'; this.refresh(); } break; }
      case 'suspend': this.act({ type: 'suspend', id: Number(arg) }); break;
      case 'demolish': if (el.dataset.sure) { if (this.act({ type: 'demolish', id: Number(arg) })) { this.sel = null; this.view.setCursor([]); this.renderInfo(); } } else { el.dataset.sure = '1'; el.textContent = 'もう一度押すと実行'; } break;
      case 'borrow': this.act({ type: 'borrow', amount: Number(arg) }); break;
      case 'repaytemp': this.act({ type: 'repayTemp' }); break;
      case 'stationup': this.act({ type: 'stationUp', id: Number(arg), what: 'bldg' }); break;
      case 'airportup': this.act({ type: 'airportUp', id: Number(arg) }); break;
      case 'airroute': { const [r, o] = arg.split(':'); this.act({ type: 'airRoute', route: r, on: o === '1' }); break; }
      case 'shinkansen': this.act({ type: 'stationUp', id: Number(arg), what: 'shin' }); break;
      case 'event': if (this.act({ type: 'event', id: arg.split(':')[0], option: Number(arg.split(':')[1]) })) this.eventHidden = false; break;
      case 'eventhide': this.eventHidden = !this.eventHidden; this.renderModal(); this.renderDraftbar(); break;
      case 'election': g.state.pendingElection = null; this.refresh(); break;
      case 'tl': {
        if (this.tlBusy) break; this.tlBusy = true; const sp = g.speed; g.speed = 0; $('app').classList.add('photo'); this.renderTop(true);
        let cap = document.getElementById('tlcap'); if (!cap) { cap = document.createElement('div'); cap.id = 'tlcap'; $('app').appendChild(cap); }
        playTimeline(g.state, this.view as any, t => { cap!.textContent = t; cap!.hidden = !t; }, arg === 'rec').then(b => { this.tlBusy = false; $('app').classList.remove('photo'); g.speed = sp; this.renderTop(true); if (b) this.download(`sumucity-${Date.now()}.webm`, b); else if (arg === 'rec') this.toast('この端末では動画を作れませんでした', true); });
        break;
      }
      case 'hero': if (g.state.pol) { g.state.pol.hero = Number(arg); this.heroSeen = ''; this.renderModal(); this.toast('主人公を決めました。人生の出来事を知らせます'); } break;
      case 'ride': { const want = arg as 'train' | 'bus'; const hr = this.view.hour % 24; if (this.view.ride === want) this.view.ride = null; else if (want === 'train' && hr >= 1 && hr < 5) this.toast('終電のあとです。電車は 5 時から走ります（時刻を進めてください）', true); else { if (this.view.mode !== 'orbit') this.view.setMode('orbit'); this.view.ride = want; setTimeout(() => { if (!this.view.ride) this.toast(want === 'train' ? '走っている電車がいません' : '走っているバスがいません（市政の画面でバス路線を開いてください）', true); }, 400); } this.renderViewbar(); break; }
      case 'tour': {
        if (this.tlBusy) { this.tourStop = true; break; } this.tlBusy = true; this.tourStop = false; const sp = g.speed; g.speed = 0; $('app').classList.add('photo'); this.renderTop(true);
        let cap = document.getElementById('tlcap'); if (!cap) { cap = document.createElement('div'); cap.id = 'tlcap'; $('app').appendChild(cap); }
        // やめるボタン（画面のどこを押しても・Esc でも終わる）
        let stop = document.getElementById('tourstop'); if (!stop) { stop = document.createElement('button'); stop.id = 'tourstop'; stop.className = 'btn'; stop.textContent = '✕ 街めぐりをやめる'; stop.style.cssText = 'position:fixed;top:max(12px,env(safe-area-inset-top));right:12px;z-index:60;font-size:15px;padding:10px 14px'; stop.onclick = () => { this.tourStop = true; }; document.body.appendChild(stop); } stop.hidden = false;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.tourStop = true; }, onTap = (e: Event) => { if ((e.target as HTMLElement)?.id !== 'tourstop') this.tourStop = true; }; addEventListener('keydown', onKey); const cv = this.view.canvas; setTimeout(() => cv.addEventListener('pointerdown', onTap), 300);
        const st = g.state, pts = [...st.buildings.filter(b => b.kind === 'station' && b.status === 'operating').slice(0, 1), ...st.buildings.filter(b => b.status === 'operating' && ['landmark', 'leisure', 'history', 'nature'].includes(DEFS[b.kind].cat)).sort((a, b) => DEFS[b.kind].cost - DEFS[a.kind].cost).slice(0, 4), ...st.buildings.filter(b => b.status === 'operating' && b.builtMonth > 0).sort((a, b) => b.builtMonth - a.builtMonth).slice(0, 1)];
        (async () => {
          for (const b of pts.length ? pts : st.buildings.slice(0, 1)) { if (this.tourStop) break; cap!.hidden = false; cap!.textContent = `${DISTRICTS[getMap(st.seed).district[idx(b.x, b.y)]] ?? ''}・${b.kind === 'station' ? '駅前' : DEFS[b.kind].name}`; this.view.focus(idx(b.x, b.y), 220 + 40 * Math.sqrt(b.w * b.h)); const t0 = performance.now(); while (!this.tourStop && performance.now() - t0 < 3800) { this.view.orbitBy(0.9, 0); await new Promise(r => requestAnimationFrame(r)); } }
          if (!this.tourStop) { this.view.focus(Math.floor(H * 0.45) * W + Math.floor(W / 2), Math.max(W, H) * TILE * 0.95); cap!.textContent = st.cityName; } const t0 = performance.now(); while (!this.tourStop && performance.now() - t0 < 3000) { this.view.orbitBy(0.5, 0); await new Promise(r => requestAnimationFrame(r)); }
        })().finally(() => { cap!.hidden = true; stop!.hidden = true; removeEventListener('keydown', onKey); cv.removeEventListener('pointerdown', onTap); if (this.tourStop) this.toast('街めぐりを終えました'); this.tlBusy = false; $('app').classList.remove('photo'); g.speed = sp; this.renderTop(true); });
        break;
      }
      case 'explain': { const on = !document.body.classList.contains('explain'); document.body.classList.toggle('explain', on); try { localStorage.setItem('sumu-explain', on ? '1' : '0'); } catch { /* なし */ } this.toast(on ? '説明の文を表示します' : '説明の文を隠しました（？で表示）'); this.renderSide(); break; }
      case 'countskip': this.countDone = this.countFor; this.renderModal(); break;
      case 'undo': this.doUndo(); break;
      case 'olshare': shareCity(g.state, g.exportText()).then(m => { this.toast(m); this.renderSide(); }); break;
      case 'olload': { if (this.confirmLoad !== arg) { this.confirmLoad = arg; this.renderSide(); break; } this.confirmLoad = ''; if (!this.backupFirst()) break; loadShared(arg).then(t => { if (!t) { this.toast('街を読み込めませんでした', true); return; } this.loadText(t); }); break; }
      case 'ctsend': { const ct = (g.state.pol as any)?.contest; if (ct) contestSubmit(g.state, ct.week).then(m => { this.toast(m); this.renderSide(); }); break; }
      case 'ctload': { const ct = (g.state.pol as any)?.contest; if (ct) contestLoad(ct.week).then(() => this.renderSide()); break; }
      case 'olstart': startOnline(); this.renderSide(); break;
      case 'olsend': submit(this.game.state).then(m => { this.toast(m); this.renderSide(); }); break;
      case 'olrefresh': refresh().then(() => this.renderSide()); break;
      case 'postopen': { const k = 'post-' + arg; if (this.openK.has(k)) this.openK.delete(k); else this.openK.add(k); this.renderSide(); break; }
      case 'newroute': { const v = (id: string) => (document.getElementById(id) as HTMLSelectElement | null)?.value ?? ''; this.act({ type: 'pol', op: 'route', id: `${v('rt-a')}-${v('rt-b')}`, n: Number(v('rt-f')) }); this.renderSide(); break; }
      case 'pol': { const [op, id, n] = arg.split(':'); this.act({ type: 'pol', op: op as 'plan', ...(id ? { id } : {}), ...(n !== undefined && n !== '' ? { n: Number(n) } : {}) }); this.renderSide(); break; }
      case 'sis': { const [id, a] = arg.split(':'); this.act({ type: 'sister', id, act: a as 'join' }); this.renderSide(); break; }
      case 'people': this.peopleOpen = !this.peopleOpen; this.renderModal(); break;
      case 'famhome': { this.peopleOpen = false; this.renderModal(); const b = s.buildings.find(o => o.id === Number(arg)); if (b) { this.sel = { b: b.id }; this.view.focus(idx(b.x, b.y), 220); this.markSel(); this.renderInfo(); } break; }
      case 'run': if (!this.confirmRun) { this.confirmRun = true; this.renderSide(); setTimeout(() => { this.confirmRun = false; }, 6000); } else { const r = g.saveLocal(); if (!r.ok) this.toast(r.msg, true); startRun(g.state, g.exportText()); } break;
      case 'card': { this.renderModal(); this.makeCard().then(u => { this.menu = false; this.shot = u; albumAdd(u, `${this.s.cityName}の記念カード`); this.renderModal(); }); break; }
      case 'album': this.albumOpen = !this.albumOpen; this.renderModal(); break;
      case 'albumdel': albumDel(Number(arg)); this.renderModal(); break;
      case 'follow': { const on = this.view.follow(this.view.followCar < 0); this.toast(on ? `${driverOf(this.s, this.view.followCar)}の車を追いかけます。地図を動かすか、もう一度押すとやめます` : '追いかけるのをやめました'); this.renderViewbar(); break; }
      case 'challenge': if (!this.s.challenge) { this.gc = this.gc === arg ? null : arg; this.renderModal(); } break; // 任期を始めるときに挑戦も始める（それまでは選び直せる）
      case 'chseen': if (g.state.challenge) g.state.challenge.seen = true; this.renderModal(); break;
      case 'lite': this.view.setLite(!this.view.lite); try { localStorage.setItem('sumu-lite', this.view.lite ? '1' : '0'); } catch { /* なし */ } this.renderModal(); break;
      case 'slotsave': { const r = g.saveSlot(Number(arg)); this.menuMsg = r.msg; this.toast(r.msg, !r.ok); this.renderModal(); break; }
      case 'cloudsave': cloudSave(g.state, g.exportText()).then(m => { this.menuMsg = m; this.toast(m); this.renderModal(); }); break;
      case 'cloudload': cloudLoad().then(t => { if (!t) { this.toast('クラウドに保存した街がありません（または読み込めません）', true); return; } if (!this.backupFirst()) return; this.loadText(t); }); break;
      case 'slotload': { const r = g.loadSlot(arg === 'auto' || arg === 'prev' ? arg : Number(arg)); this.afterLoad(r.ok, r.msg); if (r.ok) this.refresh(); break; }
      case 'stats': this.statsOpen = !this.statsOpen; this.renderModal(); break;
      case 'statsrange': this.statsRange = Number(arg); this.renderModal(); break;
      case 'newsgo': { this.newsOpen = false; this.renderModal(); const t = Number(arg); this.view.focus(t, 260); this.select(t); break; }
      case 'movestart': { const b = this.s.buildings.find(o => o.id === Number(arg)); if (b) { this.setTool({ t: 'build', kind: b.kind, move: b.id }); this.toast(`${DEFS[b.kind].name}の移設先を地図で選んでください（建設費の 3 割・工期は短め）`); } break; }
      case 'expand': this.act({ type: 'expand', id: Number(arg) }); this.refresh(); break;
      case 'opt': { const [id, o, on] = arg.split(':'); this.act({ type: 'option', id: Number(id), opt: o, on: on === '1' }); this.refresh(); break; }
      case 'style': { const [id, v] = arg.split(':').map(Number); this.act({ type: 'style', id, v }); this.refresh(); break; }
      case 'annex': { const b = Number(arg); if (this.act({ type: 'annex', block: b })) { const r = blockRect(b); this.view.focus(Math.floor((r.y0 + r.y1) / 2) * W + Math.floor((r.x0 + r.x1) / 2), 900); sound.cheer(0.6, 2); } this.refresh(); break; }
      case 'seeblock': { const r = blockRect(Number(arg)); this.view.focus(Math.floor((r.y0 + r.y1) / 2) * W + Math.floor((r.x0 + r.x1) / 2), 900); break; }
      case 'lvseen': if (g.state.mayor) g.state.mayor.seenLv = levelOf(g.state.mayor.pts); this.renderModal(); if (arg) { this.tab = 'mayor'; $('side').classList.remove('closed'); this.renderSide(); } break;
      case 'rankseen': if (g.state.mayor) g.state.mayor.seenRank = g.state.mayor.ranks.at(-1)?.month ?? -1; this.renderModal(); if (arg) { this.tab = 'mayor'; $('side').classList.remove('closed'); this.renderSide(); } break;
      case 'overnew': g.reset({}); g.auto = false; this.overSeen = false; this.resetLocal(); this.toast('新しく始めました'); break;
      case 'overtitle': toTitle(); break;
      case 'overlook': this.overSeen = true; this.renderModal(); break;
      case 'fcrun': this.runForecast(); break;
      case 'fcmetric': this.fcMetric = arg as any; this.renderSide(); break;
      case 'fccancel': this.cancelForecast(); this.toast('試算を中止しました'); this.renderSide(); break;
      case 'draft': g.startDraft(); this.toast('試算モードに入りました。建設や政策を試して「予測を更新」で比べられます'); break;
      case 'draftdiscard': this.draftFail = null; g.discardDraft(); if (this.fc) this.fc.draft = null; this.sel = null; this.toast('計画案を破棄しました'); break;
      case 'draftcommit': { const r = g.commitDraft(); if (r.ok) this.fc = null; this.draftFail = r.ok ? null : r.failed ?? null; this.toast(r.msg, !r.ok); this.renderDraftbar(); break; }
      case 'draftdrop': { const r = g.dropDraftAction(Number(arg)); this.draftFail = null; if (this.fc) this.fc.draft = null; this.toast(r.msg, !r.ok); this.renderDraftbar(); break; }
      case 'tutnext': g.state.tutorial.step++; if (g.state.tutorial.step >= tut().length) g.state.tutorial.done = true; this.refreshTutorial(true); break;
      case 'tutskip': g.state.tutorial.done = true; this.refreshTutorial(true); break;
      case 'menu': this.menu = !this.menu; this.menuMsg = ''; this.confirmNew = ''; this.renderModal(); break;
      case 'save': { const r = g.saveLocal(); this.menuMsg = r.msg; this.toast(r.msg, !r.ok); this.renderModal(); break; }
      case 'load': { const r = g.loadLocal(); this.afterLoad(r.ok, r.msg); break; }
      case 'unsaved': this.menu = true; this.menuTab = 'save'; this.menuMsg = g.saveFail?.msg ?? ''; this.confirmNew = ''; this.renderModal(); break;
      case 'savefile': this.download(`sumucity-${(this.s.cityName ?? 'save').replace(/[\\/:*?"<>|\s]/g, '_')}-${Math.floor(this.s.month / 12) + 1}年目.json`, g.exportText(), 'application/json'); g.noteExported(); this.menuMsg = 'ファイルに書き出しました（ダウンロードの場所に入ります）。読み込むときは「ファイルから読み込む」を使います'; this.toast('ファイルに書き出しました'); this.renderModal(); break;
      case 'saveretry': { const w = g.saveFail?.where ?? '', m = /^枠 (\d)$/.exec(w); const r = m ? g.saveSlot(Number(m[1])) : w === '自動保存' ? g.saveSlot('auto') : g.saveLocal(); this.menuMsg = r.msg; this.toast(r.msg, !r.ok); this.renderModal(); break; }
      case 'export': { const text = g.exportText(); g.noteExported(); // v90：noteExported がメニューを描き直して欄が空になっていたので、描き直したあとの欄に入れる
        const ta = $('iotext') as HTMLTextAreaElement; ta.value = text; ta.select(); navigator.clipboard?.writeText(text).then(() => this.toast('保存データをコピーしました'), () => this.toast('下の欄のテキストを選択してコピーしてください')); this.download('sumucity-save.json', text, 'application/json'); break; }
      case 'import': this.loadText(($('iotext') as HTMLTextAreaElement).value); break;
      case 'title': if (this.confirmNew === 'title') toTitle(); else { this.confirmNew = 'title'; this.renderModal(); } break;
      case 'titlesave': { const r = g.saveLocal(); if (r.ok) toTitle(); else { this.menuMsg = r.msg; this.renderModal(); } break; }
      case 'new': if (this.confirmNew === arg) { g.reset({ short: arg === 'short' }); this.menu = false; this.confirmNew = ''; this.resetLocal(); this.toast(arg === 'short' ? '体験版（任期 24 か月）で始めました' : '新しく始めました（任期 48 か月）'); } else { this.confirmNew = arg as any; this.renderModal(); } break;
      case 'photoend': this.setPhoto(false); break;
      case 'shoot': { const u = this.view.capture(), cap = this.pstamp ? `${this.s.cityName}　${dateStr(this.s.month)}` : ''; (this.mini ? tiltShift(u) : Promise.resolve(u)).then(v => finishPhoto(v, this.pfilter, cap)).then(v => { this.shot = v; albumAdd(v, `${this.view.rareNow ? `✨レア：${this.view.rareNow}・` : ''}${this.s.cityName}・${dateStr(this.s.month)}`); if (this.view.rareNow) this.toast(`✨ レアな写真「${this.view.rareNow}」をアルバムに残しました`); this.download(`sumucity-${Date.now()}.png`, v); this.renderModal(); }); break; }
      case 'shotclose': this.shot = ''; this.renderModal(); break;
    }
  }
  private resetLocal(): void { this.sel = null; this.fc = null; this.cancelForecast(); this.tool = { t: 'select' }; this.group = null; this.eventHidden = false; this.view.setCursor([]); this.refresh(); this.renderTools(); }
  /** いまの街を自動保存へ退避してから、別の街を読み込む。退避できなければ読み込まない（いまの街を失わないため） */
  private backupFirst(): boolean { const r = this.game.saveSlot('auto'); if (!r.ok) { this.toast('いまの街を退避できなかったため、読み込みをやめました。先にファイルへ保存してください', true); this.renderSaveMark(); } return r.ok; }
  /** 保存に失敗しているあいだ、上の帯に「未保存」を出す */
  renderSaveMark(): void { const el = document.getElementById('unsaved'); if (!el) return; const f = this.game.saveFail; el.hidden = !f; if (f) el.title = `${f.where}に失敗しました：${f.msg}`; }
  private afterLoad(ok: boolean, msg: string): void { this.menuMsg = msg; this.toast(msg, !ok); if (ok) { this.menu = false; this.resetLocal(); } else this.renderModal(); }
  private loadText(t: string): void { if (!t.trim()) { this.afterLoad(false, '読み込むテキストがありません'); return; } const r = this.game.loadText(t); this.afterLoad(r.ok, r.msg); }
  /** ファイル保存。公開ページの枠内では保存が効かないので、失敗しても画面上の表示から保存できるようにしてある */
  mini = false;
  /** ファイルを保存する。公開ページの枠内では、ページの「保存」の仕組み（確認が出る）を使う */
  download(name: string, data: string | Blob, mime?: string): void {
    const c = (window as any).claude;
    if (c?.use) {
      const blob = typeof data !== 'string' ? data : data.startsWith('data:') ? dataUrlBlob(data) : new Blob([data], { type: mime ?? 'text/plain' });
      c.use('downloads').then((d: any) => { if (!d) { this.toast('この表示では保存できません（画像は長押し・右クリックで保存できます）', true); return; } return d.save({ filename: name, data: blob }).then(() => this.toast('保存しました')).catch((e: any) => this.toast(e?.code === 'declined' ? '保存をやめました' : '保存できませんでした', true)); }).catch(() => this.toast('保存できませんでした', true));
      return;
    }
    if (typeof data !== 'string') { const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = name; document.body.appendChild(a); a.click(); a.remove(); return; }
    try { const a = document.createElement('a'); a.href = mime ? URL.createObjectURL(new Blob([data], { type: mime })) : data; a.download = name; document.body.appendChild(a); a.click(); a.remove(); } catch { /* 表示側で代替 */ }
  }
  private setPhoto(on: boolean): void {
    this.photo = on; $('app').classList.toggle('photo', on);
    if (on) { this.setTool({ t: 'select' }); this.group = null; this.sel = null; this.view.setCursor([]); }
    else { this.view.fov = 42; this.view.weatherForce = ''; this.view.dof = false; this.mini = false; $('app').classList.remove('mini'); this.pfilter = ''; this.view.canvas.style.filter = ''; }
    this.renderPhoto(); this.view.resize();
  }
  cancelForecast(): void { if (this.job) { this.job.cancel(); this.job = null; } this.fcBusy = 0; }
  async runForecast(): Promise<void> {
    this.cancelForecast();
    const g = this.game;
    if (g.speed) { g.speed = 0; this.toast('試算のあいだは時間を止めます'); this.renderTop(true); }
    const rev = g.rev, t0 = performance.now(), month = g.state.month;
    let pb = 0, pd = 0;
    const total = g.draft ? 2 : 1;
    const upd = () => { this.fcBusy = Math.max(0.001, (pb + pd) / total); this.updateFcProgress(); };
    const jb = startForecast(g.state, 60, p => { pb = p; upd(); });
    const jd = g.draft ? startForecast(g.draft.state, 60, p => { pd = p; upd(); }) : null;
    const actions = g.draft ? [...g.draft.actions] : [];
    const job = { rev, cancel: () => { jb.cancel(); jd?.cancel(); } };
    this.job = job; this.fcBusy = 0.001; this.renderSide();
    try {
      const [base, draft] = await Promise.all([jb.promise, jd ? jd.promise : Promise.resolve(null)]);
      if (this.job !== job) return;                       // 中止された
      if (g.rev !== rev) { this.toast('計算中に街が変わったため、結果を破棄しました'); return; }
      this.fc = { base, draft, rev, month, ms: performance.now() - t0, mode: jb.mode === 'worker' ? '別スレッド' : '画面側', actions };
    } catch (e) {
      if ((e as Error).message !== 'cancelled') this.toast('予測を計算できませんでした：' + (e as Error).message, true);
    } finally {
      if (this.job === job) { this.job = null; this.fcBusy = 0; }
      this.renderSide(); this.refreshTutorial();
    }
  }
  private updateFcProgress(): void { const e = document.getElementById('fcprog'); if (e) e.textContent = `計算中… ${Math.round(this.fcBusy * 100)}%`; const b = document.getElementById('fcbar'); if (b) b.style.width = Math.round(this.fcBusy * 100) + '%'; }

  // ------------------------------------------------------------ 描画
  refresh(): void {
    if (this.sel?.b && !this.s.buildings.some(b => b.id === this.sel!.b)) this.sel = null;
    this.renderTop(true); this.renderSide(); this.renderInfo(); this.renderModal(); this.renderDraftbar(); this.renderViewbar(); this.refreshTutorial(); this.renderBell();
    if (this.s.mode === 'sandbox' && !document.querySelector('.tool.sandbox')) this.renderTools();
    if (this.sel) this.markSel();
  }
  /** 毎フレーム呼ばれる軽い更新（月の進み具合、性能表示） */
  private labelKey = '';
  /** 地図の上に、地区名と主な施設の名前・状況を重ねる */
  private updateLabels(): void {
    const el = $('labels'), v = this.view, s = this.s, m = getMap(s.seed);
    if (this.photo || v.mode !== 'orbit') { el.hidden = true; return; }
    el.hidden = false;
    let list = s.buildings.filter(b => (isCity(b.kind) && fam(b.kind) !== 'park') || b.kind === 'parkL' || b.kind === 'station' || b.kind === 'privNursery' || b.kind === 'supermarket' || DEFS[b.kind].build === 'request' || DEFS[b.kind].build === 'invite');
    // 施設が多いときは、駅と、いま見ている所に近い 14 か所だけ札を出す（重なって読めなくなるため）
    if (list.length > 14) { const tx = v.target.x / 30, tz = v.target.z / 30, d2 = (b: Building) => (b.x + b.w / 2 - tx) ** 2 + (b.y + b.h / 2 - tz) ** 2; list = [...list.filter(b => b.kind === 'station'), ...list.filter(b => b.kind !== 'station').sort((a, b) => d2(a) - d2(b)).slice(0, 14)]; }
    const txt = (b: Building) => { const d = { name: bname(b) + (lvOf(b) > 1 ? ` Lv${lvOf(b)}` : '') }; if (b.status === 'construction' && DEFS[b.kind].build !== 'invite') return `${d.name}<i>工事中 あと ${b.remain} か月</i>`; if (b.status === 'renewing') return `${d.name}<i>更新工事 あと ${b.remain} か月</i>`; if (b.status === 'suspended') return `${d.name}<i class="bad">停止中</i>`; if (!b.connected) return `${d.name}<i class="bad">道路がつながっていない</i>`; if (b.status === 'construction' && DEFS[b.kind].build === 'invite') return `${d.name}<i>誘致の交渉中</i>`; if (fam(b.kind) === 'care' || b.kind === 'privNursery') return `${d.name}<i class="${b.effCap < designCap(s, b) * 0.9 ? 'bad' : ''}">受入 ${n0(b.effCap)}／定員 ${n0(designCap(s, b))} 人</i>`; if (b.kind === 'school' || b.kind === 'jhs') return `${d.name}<i class="${b.used > b.effCap ? 'bad' : ''}">${n0(b.used)}／${n0(b.effCap)} 人</i>`; if (fam(b.kind) === 'water') return `${d.name}<i class="${b.age >= 70 ? 'bad' : ''}">老朽度 ${Math.round(b.age)}</i>`; return d.name; };
    // 混雑レイヤー：いちばん混む所に「渋滞」の札（離れた所を 6 つまで）
    const jams: number[] = [];
    if (v.layer === 'traffic') { const hot: number[] = []; for (let i = 0; i < W * H; i++) if (s.road[i] && s.road[i] !== 3 && (s.vc[i] || 0) > 1) hot.push(i); hot.sort((a, b) => s.vc[b] - s.vc[a]); for (const i of hot) { if (jams.length >= 6) break; if (jams.every(j => Math.max(Math.abs(j % W - i % W), Math.abs(((j / W) | 0) - ((i / W) | 0))) > (REAL ? 12 : 5))) jams.push(i); } }
    const key = Math.round(v.target.x / 150) + ':' + Math.round(v.target.z / 150) + list.map(b => b.id + txt(b)).join('|') + s.stats.popDistrict.map(p => Math.round(p)).join(',') + jams.map(i => i + ':' + Math.round(s.vc[i] * 100)).join(',');
    if (key !== this.labelKey) {
      this.labelKey = key;
      el.innerHTML = jams.map(i => `<div class="fl jam" data-x="${(i % W + 0.5) * 30}" data-z="${(((i / W) | 0) + 0.5) * 30}">渋滞<i class="bad">${pct(s.vc[i])}</i></div>`).join('') + DISTRICTS.map((n, d) => `<div class="dl" data-d="${d}">${n}<i>${n0(s.stats.popDistrict[d])} 人${s.plan && this.game.auto ? `・${ROLES[s.plan.roles[d]]?.short ?? ''}` : ''}</i></div>`).join('') + list.map(b => `<button class="fl ${isCity(b.kind) ? 'city' : ''} ${b.kind === 'station' ? 'st' : ''}" data-act="selb" data-arg="${b.id}" data-x="${(b.x + b.w / 2) * 30}" data-z="${(b.y + b.h / 2) * 30}">${txt(b)}</button>`).join('');
    }
    const DC = REAL ? REAL.districts.map(d => [d.x, d.y]) : [[21, 8], [13, 21], [33, 24], [7, 8], [57, 22], [36, 51], [100, 34], [64, 88]], far = v.dist > 520, vfar = REAL && v.dist > 1100;
    const shown: { c: HTMLElement; x: number; y: number; pri: number }[] = [];
    for (const c of el.children as any as HTMLElement[]) {
      const isD = c.classList.contains('dl');
      let x: number, z: number, y: number;
      if (isD) { const d = Number(c.dataset.d); x = DC[d][0] * 30; z = DC[d][1] * 30; y = REAL ? heightAt(m, x, z) + 60 : 40; if (v.dist <= (REAL ? 700 : 300)) { c.style.display = 'none'; continue; } }
      else {
        if (far && !c.classList.contains('city') && !c.classList.contains('st') && !c.classList.contains('jam')) { c.style.display = 'none'; continue; }
        if (vfar && !c.classList.contains('st') && !c.classList.contains('jam') && !c.querySelector('.bad')) { c.style.display = 'none'; continue; } // 遠くからは駅と、問題のある施設だけ
        x = Number(c.dataset.x); z = Number(c.dataset.z); y = heightAt(m, x, z) + 16;
      }
      const p = v.project(x, y, z);
      if (!p.visible || p.x < 150 || p.y < 70 || p.x > window.innerWidth - (window.innerWidth > 900 ? 400 : 10) || p.y > window.innerHeight - 60) { c.style.display = 'none'; continue; }
      c.style.display = ''; c.style.transform = `translate(-50%,-100%) translate(${p.x.toFixed(0)}px,${p.y.toFixed(0)}px)`;
      shown.push({ c, x: p.x, y: p.y, pri: isD ? 3 : c.classList.contains('st') ? 2 : c.querySelector('.bad') || c.classList.contains('jam') ? 1 : 0 });
    }
    // 重なる札は、大事なもの（地区名・駅・問題のある施設）を残して隠す
    shown.sort((a, b) => b.pri - a.pri); const boxes: [number, number, number, number][] = [];
    for (const it of shown) { const w = (it.c as any)._w ?? ((it.c as any)._w = it.c.offsetWidth || 80), h = (it.c as any)._h ?? ((it.c as any)._h = it.c.offsetHeight || 30); const r: [number, number, number, number] = [it.x - w / 2 - 4, it.y - h - 4, it.x + w / 2 + 4, it.y + 4];
      if (boxes.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) { it.c.style.display = 'none'; continue; } boxes.push(r); }
    el.classList.toggle('compact', v.dist > 300);
  }
  tick(): void {
    this.renderTop(false);
    this.engageTick();
    { const u = document.getElementById('undo'); const on = this.game.canUndo; if (u && u.hidden === on) u.hidden = !on; }
    // 時計が進んでいるときは、時刻と季節・天気の表示を合わせる
    if (this.view.clockRun || this.view.weather.kind !== this.lastWx) { const ht = document.getElementById('hourtxt'), wx = document.getElementById('wxtxt'), hr = document.getElementById('hour') as HTMLInputElement | null, h = this.view.hour;
      if (ht) ht.textContent = `${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; if (hr && document.activeElement !== hr) hr.value = h.toFixed(1);
      if (wx) wx.textContent = wxText(this.view, this.s); this.lastWx = this.view.weather.kind; }
    this.updateLabels();
    const p = $('perf'), v = this.view.stats;
    p.textContent = `${v.fps} fps ・ ${n0(v.tris)} 三角形 ・ 描画 ${v.calls} 回`;
  }
  renderTop(full: boolean): void {
    const s = this.s, st = s.stats, g = this.game;
    const L = monthlyBudget(s);
    const left = s.mode === 'term' ? `任期 ${s.term} 期目・残り ${s.termLength - (s.month - s.termStart)} か月` : 'サンドボックス';
    const key = `${s.month}:${Math.round(s.cash)}:${Math.round(st.pop)}:${g.speed}:${g.auto}:${!!g.draft}:${s.mode}:${Math.round(L.operating)}:${Math.round(st.waitlist)}:${st.maxVc.toFixed(2)}:${st.sat.toFixed(3)}:${s.mayor?.pts ?? 0}:${s.mayor?.annex ?? 0}`;
    if (full || key !== this.lastTop) {
      this.lastTop = key;
      $('chips').innerHTML = [
        ...(s.mayor ? [['市長', `Lv${levelOf(s.mayor.pts)}<i>${LEVELS[levelOf(s.mayor.pts) - 1].title}${s.mayor.annex > 0 && s.unlocked ? '・編入できます' : ''}</i>`, s.mayor.annex > 0 && s.unlocked ? 'good' : '', 'mayor']] : []),
        ['人口', `${n0(st.pop)}<i>人</i>`, '', 'home'], ['市の資金', yen(s.cash), s.cash < 2000 ? 'bad' : '', 'money'],
        ['毎月の収支', yen(L.operating, true, '/月'), L.operating < 0 ? 'bad' : '', 'money'], ['満足度', `${Math.round(st.sat * 100)}<i>%</i>`, st.sat < 0.6 ? 'warn' : '', 'home'],
        ['保育の待機', `${n0(st.waitlist)}<i>人</i>`, st.waitlist > 10 ? 'warn' : '', 'home'], ['最大混雑率', `${Math.round(st.maxVc * 100)}<i>%</i>`, st.maxVc > 1 ? 'warn' : '', 'home'],
      ].map(([l, v, c, tab]) => `<button class="chip ${c}" data-act="tab" data-arg="${tab}"><small>${l}</small><b>${v}</b></button>`).join('');
      $('date').innerHTML = `<b>${dateStr(s.month)}</b><small>${left}${g.speed === 0 && !g.blocked ? ' ・<b style="color:#f2c230">停止中<span class="long">（▶ で進む）</span></b>' : ''}</small><div class="mbar"><i id="mprog" style="width:0%"></i></div>`;
      { let el = document.getElementById('rci'); if (!el) { el = document.createElement('button'); el.id = 'rci'; el.dataset.act = 'tab'; el.dataset.arg = 'home'; el.title = '街の発展（住宅・商業・職の需要）'; $('app').appendChild(el); }
      const d = this.dev(), k = `${Math.round(d.resD * 20)}:${Math.round(d.shopD * 20)}:${Math.round(d.jobD * 20)}`;
      if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = [['住', d.resD, '#58b368'], ['商', d.shopD, '#3f9bd1'], ['職', d.jobD, '#e8a33a']].map(([n, v, c]) => `<span><i style="height:${Math.round((v as number) * 100)}%;background:${c}"></i><b>${n}</b></span>`).join('') + '<small>需要</small>'; } }
      $('speed').innerHTML = ['Ⅱ', '▶', '▶▶', '▶▶▶'].map((t, i) => `<button data-act="speed" data-arg="${i}" aria-pressed="${g.speed === i}" title="${SPEED_NAMES[i]}" aria-label="${SPEED_NAMES[i]}">${t}</button>`).join('') + `<button data-act="auto" aria-pressed="${g.auto}" title="CPU が市長の代わりに街を運営します（もう一度押すと手動に戻ります）" aria-label="オートプレイ" class="autobtn">${g.auto ? 'オート中' : 'オート'}</button>`;
    }
    const mp = document.getElementById('mprog'); if (mp) mp.style.width = (g.blocked ? 0 : g.acc * 100).toFixed(0) + '%';
  }
  /** 市長の初仕事（ミッション）：次の 3 つと進み具合・ごほうび */
  /** 開いた・たたんだを覚える折りたたみ（資料を描き直しても開いたまま） */
  openK = new Set<string>();
  fold(k: string, html: string, cls = ''): string {
    return html.replace(/^\s*<section([^>]*)><h2>([\s\S]*?)<\/h2>/, (_m, a: string, h: string) => `<details class="fold ${cls}" data-k="${k}"${this.openK.has(k) ? ' open' : ''}${a.replace('class="', 'data-c="')}><summary><h2>${h}</h2></summary>`).replace(/<\/section>\s*$/, '</details>');
  }
  private foldAll(html: string, titles: string[]): string {
    return html.replace(/<section( class="[^"]*")?><h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/section>/g, (m, _c, h: string) => { const t = titles.find(x => h.startsWith(x)); return t ? this.fold('home-' + t, m) : m; });
  }
  /** 今日の課題・主人公・街の称号（概要のいちばん上） */
  private pEngage(): string {
    const s = this.s; if (REAL && !s.pol) return '';
    const d = dailyOf(s), tt = REAL ? [] : cityTitles(s);
    const body = `<div class="daily">${d.ids.map(id => { const x = DAILY.find(o => o.id === id)!, v = dailyProgress(s, d, id), ok = d.done.includes(id); return `<div class="dq ${ok ? 'ok' : ''}"><b>${ok ? '✅' : '⬜'} ${x.name}</b><div class="bar"><i style="width:${Math.round((v / x.need) * 100)}%"></i></div></div>`; }).join('')}</div>`;
    return `${tt.length ? `<div class="titles">${tt.map(t => `<span>🏅 ${t}</span>`).join('')}</div>` : ''}${this.fold('home-daily', `<section class="engage"><h2>🎯 今日の課題 <small>${d.done.length} / 3 達成</small></h2>${body}</section>`)}`;
  }
  /** 毎秒：今日の課題・はじめての〇〇・主人公の人生の出来事 */
  private engT = 0; private heroLast = -1e9; private heroSeen = ''; private rareSeen = '';
  private engageTick(): void {
    const now = performance.now(); if (now - this.engT < 1000) return; this.engT = now;
    const s = this.game.state; if (this.game.draft || s.over) return;
    const dn = checkDaily(s); if (dn.length && this.tab === 'home') this.renderSide();
    for (const n of dn) { this.toast(`🎯 今日の課題「${n}」達成！ 市長ポイント +${DAILY_PTS}`); sound.onView('firstStep', 0, 0, 0, this.view.audioInfo()); }
    if (!REAL) for (const f of FIRSTS) { const k = 'first:' + f.id; if (s.acts[k] !== undefined || !f.test(s)) continue; s.acts[k] = s.month; this.toast(`🎉 ${f.name}！`); sound.onView('firstStep', 0, 0, 0, this.view.audioInfo()); }
    { const r = this.view.rareNow; if (r && r !== this.rareSeen) { this.toast(`✨ レアな景色：${r}が見えています！ 写真モードで撮ると、アルバムに残ります`); sound.onView('firstStep', 0, 0, 0, this.view.audioInfo()); } this.rareSeen = r || this.rareSeen; if (!r) this.rareSeen = ''; }
    const h = heroOf(s); if (h && h.log.length) { const l = h.log.at(-1)!, key = `${h.id}:${l.m}:${l.t}`; if (this.heroSeen && key !== this.heroSeen && /結婚|生まれ|定年|市外|亡くな/.test(l.t) && performance.now() - this.heroLast > 90000) { this.heroLast = performance.now(); this.heroCard(h, l.t); } this.heroSeen = key; }
    if (!REAL) { const pl = document.querySelector('#top .plate span'); const t = cityTitles(s)[0]; if (pl && t && pl.textContent !== t) pl.textContent = t; }
  }
  private heroCard(h: { name: string; age: number; sex: string }, t: string): void {
    let el = document.getElementById('herocard'); if (!el) { el = document.createElement('div'); el.id = 'herocard'; $('app').appendChild(el); }
    el.innerHTML = `<span class="av">${avatar(h.age, h.sex)}</span><span class="ic">${lifeIcon(t)}</span><div><small>主人公の人生</small><b>${esc(h.name)}さん（${Math.floor(h.age)}）</b><p>${esc(t)}</p></div>`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(this.heroTimer); this.heroTimer = window.setTimeout(() => el!.classList.remove('on'), 6500);
  }
  private heroTimer = 0;
  pMissions(): string {
    const s = this.s, done = new Set(s.missions ?? []), b = s.missionBase;
    const next = missionsFor(s).filter(m => !done.has(m.id)).slice(0, 3);
    if (!next.length) return `<section class="missions"><h2>市長の初仕事 <small>${missionsFor(s).length} / ${missionsFor(s).length} 達成</small></h2><p class="note">すべて達成しました。ここからは、選んだビジョンの街を目指しましょう。</p></section>`;
    const rw = (m: MissionDef) => [m.reward.cash ? `${m.reward.cash.toLocaleString()} 万円` : '', m.reward.approval ? '支持率' : '', m.reward.fame ? '知名度' : ''].filter(Boolean).join('・');
    return `<section class="missions"><h2>市長の初仕事 <small>${done.size} / ${missionsFor(s).length} 達成</small></h2><div class="mbar"><i style="width:${Math.round(done.size / missionsFor(s).length * 100)}%"></i></div>` +
      next.slice(0, 1).map(m => `<div class="mission now"><b>▶ ${m.title}</b>${b && m.progress ? `<em>${m.progress(s, b)}</em>` : ''}<small>${m.how}</small><span class="rw">ごほうび：${rw(m)}</span></div>`).join('') +
      (next.length > 1 ? this.fold('mis-more', `<section><h2>このあとの初仕事 <small>${next.length - 1} 件</small></h2>${next.slice(1).map(m => `<div class="mission"><b>${m.title}</b><small>${m.how}</small><span class="rw">ごほうび：${rw(m)}</span></div>`).join('')}</section>`, 'sub') : '') + `</section>`;
  }
  /** 日本と世界の経済：日経平均・金利・物価・海外の戦争・業種の調子・1 次〜3 次産業の割合 */
  pMacro(): string {
    const s = this.s, M = (s.econ as any)?.macro as Macro | undefined; if (!M) return '';
    const h = M.hist.length > 1 ? M.hist : [M.nikkei, M.nikkei], lo = Math.min(...h), hi = Math.max(...h), W0 = 220, H0 = 44;
    const pts = h.map((v, i) => `${(i / (h.length - 1) * W0).toFixed(1)},${(H0 - 4 - (hi > lo ? (v - lo) / (hi - lo) : 0.5) * (H0 - 8)).toFixed(1)}`).join(' '), up = h[h.length - 1] >= h[0];
    const spark = `<svg viewBox="0 0 ${W0} ${H0}" width="100%" height="${H0}" preserveAspectRatio="none" role="img" aria-label="日経平均の 3 年の動き"><polyline points="${pts}" fill="none" stroke="var(--${up ? 'good' : 'bad'})" stroke-width="2" stroke-linejoin="round"/></svg>`;
    const mine = new Map<string, number>(); for (const b of s.buildings) { if (b.status !== 'operating') continue; const sc = sectorOf(b.kind); if (sc) mine.set(sc, (mine.get(sc) ?? 0) + 1); }
    const rows = SECTORS.filter(x => mine.has(x.id)).map(x => { const v = M.sect[x.id] ?? 1, c = v >= 1.05 ? 'good' : v <= 0.95 ? 'bad' : 'muted'; return `<span title="${x.why}">${x.name}<i>（市内 ${mine.get(x.id)}）</i></span><b style="color:var(--${c === 'muted' ? 'ink' : c})">${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}<i>%</i></b>`; }).join('');
    const ind = M.ind, bal = industryBalance(s), bar = `<div class="indbar" style="display:flex;height:12px;border-radius:6px;overflow:hidden;margin:4px 0"><i style="width:${ind[0] * 100}%;background:#6ab04c" title="1 次産業"></i><i style="width:${ind[1] * 100}%;background:#4a7fb5" title="2 次産業"></i><i style="width:${ind[2] * 100}%;background:#e0a040" title="3 次産業"></i></div>`;
    const relief = Math.min(0.8, modAdd(s, 'bukkaRelief'));
    return this.fold('macro', `<section><h2>日本と世界の経済 <small>日経平均・金利・物価</small></h2>
      <div class="rows"><span>日経平均</span><b>${M.nikkei.toLocaleString()}<i>円</i></b>
        <span title="日銀の政策金利。物価が 2% を超えると上がり、景気が悪いと下がります">政策金利</span><b>${M.rate.toFixed(2)}<i>%</i></b>
        <span title="前の年と比べた物価の上がり方">物価の上昇</span><b style="color:var(--${M.cpi > 3 ? 'bad' : M.cpi > 2.5 ? 'warn' : 'good'})">${M.cpi >= 0 ? '+' : ''}${M.cpi.toFixed(1)}<i>%</i></b>
        <span>原油の値段</span><b>${Math.round(M.oil * 100)}<i>（平年 100）</i></b>
        <span>海外の戦争</span><b style="color:var(--${M.warLeft > 0 ? 'bad' : 'good'})">${M.warLeft > 0 ? `続いている（あと約 ${M.warLeft} か月）` : 'なし'}</b>
        <span>市債の利率</span><b>${((P.bondRate + rateAdd(s)) * 100).toFixed(2)}<i>%</i></b></div>
      ${spark}
      <p class="note">${M.cpi > 2.5 ? `物価高で暮らしが苦しく、とくに年金暮らしと子育て世帯の満足が下がっています${relief > 0 ? `（物価高対策で ${Math.round(relief * 100)}% 和らいでいます）` : '。［政策］の物価高対策（商品券・水道料金の減免・給食費の無償化）で和らげられます'}。` : '物価は落ち着いています。'}金利が上がると市債の利息と住宅ローンが重くなり、家族の転入が少し減ります。</p>
      ${rows ? `<h3>市内の企業の業種の調子 <small>法人の税に効きます</small></h3><div class="rows">${rows}</div>` : ''}
      <h3>産業の割合 <small>働き口で</small></h3>${bar}
      <div class="rows"><span>1 次産業（農林水産）</span><b>${Math.round(ind[0] * 100)}<i>%</i></b><span>2 次産業（工業・建設）</span><b>${Math.round(ind[1] * 100)}<i>%</i></b><span>3 次産業（商業・サービス）</span><b>${Math.round(ind[2] * 100)}<i>%</i></b><span>産業のバランス</span><b>${Math.round(bal * 100)}<i>点</i></b></div>
      <p class="note">1 つの産業にかたよらない街ほど、不況のときの税収の落ち込みが小さくなります（バランス 100 点で 35% 小さい）。</p></section>`, 'sub');
  }
  /** 経済・財政・ふるさと納税・外国人住民（概要タブ） */
  pEcon(): string {
    const s = this.s, st = s.stats, e = s.econ, f = s.fiscal, fr = st.foreign;
    const ph = !e ? '—' : e.shock > 0 ? '金融危機' : e.cycle > 0.4 ? '好況' : e.cycle > 0 ? '回復' : e.cycle > -0.4 ? '後退' : '不況';
    const fz = furusatoCalc(s, s.ledger.at(-1)?.taxResident ?? 0);
    const stName = !f ? '—' : f.status === 'rebuild' ? '財政再生団体' : f.status === 'early' ? '早期健全化団体' : '健全';
    const col = (bad: boolean, warn: boolean) => `var(--${bad ? 'bad' : warn ? 'warn' : 'good'})`;
    const ob = st.obstetric ?? 0.92;
    return `<section><h2>経済・財政 <small>景気・為替・財政指標</small></h2>
      <div class="rows"><span>景気</span><b style="color:${col(!!e && e.cycle < -0.4, !!e && e.cycle < 0)}">${ph}</b><span>景気による税収</span><b>×${econFactor(s).toFixed(2)}</b>
        <span>為替</span><b>${e ? e.fx.toFixed(1) : '135'}<i>円/ドル</i></b>
        <span>財政の段階</span><b style="color:${col(f?.status === 'rebuild', f?.status === 'early')}">${stName}</b>
        <span title="借金の返済と利子 ÷ 標準的な収入。25% で早期健全化、35% で財政再生">実質公債費比率</span><b>${f ? (f.kosai * 100).toFixed(1) : '—'}<i>%</i></b>
        <span title="借金の残高 ÷ 標準的な収入。350% で早期健全化">将来負担比率</span><b>${f ? Math.round(f.shorai * 100) : '—'}<i>%</i></b></div>
      <p class="note">為替：${e && e.fx > 140 ? '円安。輸出の工場と海外からの観光客が増え、燃料・資材は高い' : e && e.fx < 125 ? '円高。輸出の工場が苦しく、燃料・資材は安い' : 'ほぼ平年'}。財政の基準：実質公債費比率 ${P.fiscalEarly.kosai * 100}% で早期健全化、${P.fiscalRebuild.kosai * 100}% で財政再生。将来負担比率 ${P.fiscalEarly.shorai * 100}% で早期健全化。</p>
      <p class="note">景気は 8〜9 年の波で上下し、まれに金融危機が来ます。不況のときは税収が減り、生活保護などの費用が増えます。財政指標が悪くなると「早期健全化団体」（市債は上限の 6 割）、さらに悪いと「財政再生団体」（市債を出せず、暮らしに欠かせない施設のほかは建てられない・税を下げられない）になります。抜けるには指標を下げて 1 年待ちます。</p></section>
    ${this.pMacro()}
    <section><h2>ふるさと納税 <small>月あたり</small></h2>
      <div class="rows"><span>市への寄付</span><b>${yenT(fz.gift)}</b><span>返礼品と経費（5 割）</span><b>${yenT(fz.cost)}</b><span>市民がよその市へ寄付（住民税が減る）</span><b>${yenT(fz.loss)}</b><span>差し引き</span><b style="color:${col(fz.gift - fz.cost - fz.loss < 0, false)}">${yenT(fz.gift - fz.cost - fz.loss)}</b></div>
      <p class="note">田んぼ・畑・ビール工場・漁港・温泉などが返礼品になります。知名度が高いほど寄付が集まります（施策「ふるさと納税の PR」で 1.6 倍）。</p></section>
    ${fr ? `<section><h2>外国人住民と、相談・情報の届きやすさ <small>推計</small></h2>
      <div class="rows"><span>外国人住民</span><b>${n0(fr.total)}<i>人</i></b><span>人口に占める割合</span><b>${(fr.total / Math.max(1, st.pop) * 100).toFixed(1)}<i>%</i></b><span>技能実習生</span><b>${n0(fr.trainee)}<i>人</i></b><span>特定技能</span><b>${n0(fr.skilled)}<i>人</i></b><span>留学生</span><b>${n0(fr.student)}<i>人</i></b>
      </div>
      ${st.access ? `<div class="rows"><span title="相談窓口・手続きの届きやすさ・多言語/やさしい日本語の情報・オンライン手続き（住民全体）">行政サービスへのアクセス</span><b style="color:${col(st.access.access < 0.35, st.access.access < 0.55)}">${pct(st.access.access)}</b><span title="日本語学習の機会・通訳・学校での支援が足りないほど高い">言語の壁</span><b style="color:${col(st.access.lang < 0.25, st.access.lang < 0.45)}">${pct(1 - st.access.lang)}</b>
        <span title="高齢のひとり暮らし・障害のある人・転入したばかりの世帯・日本語に不慣れな人に、医療・防災・福祉の情報と相談が届く割合（推計）">情報が届きにくい住民への到達</span><b style="color:${col(st.access.reach < 0.55, st.access.reach < 0.7)}">${pct(st.access.reach)}</b><span title="人手不足の職（介護・保育・工場など）の採用と定着への倍率">採用の定着</span><b>×${st.access.retain.toFixed(2)}</b></div>` : ''}
      <p class="note">人数は推計（ゲーム上の仮定）です。工場・農業・介護・ホテルなどが人手を外国人の働き手に頼るほど増えます。外国人住民の数は治安を悪くしません。暮らしを左右するのは、相談と手続きの届きやすさと言語の壁です。多文化共生センター（誰でも使える相談と情報の拠点）・日本語教室・多言語の相談窓口で、相談の利用（福祉の満足・孤立）、採用の定着、災害時の避難の情報、転出が良くなり、高齢の人や転入したばかりの世帯にも効きます。</p></section>` : ''}
    <section><h2>災害のリスクの見通し <small>推計・幅で表示</small></h2><table class="t"><tr><th>災害</th><th>リスク</th><th>年に起きる見込み</th><th>影響を受ける世帯</th></tr>${riskOutlook(s).map(r => `<tr title="主な要因：${r.factors}。対策：${r.measures}"><td>${r.name}</td><td style="color:${col(r.level === '高', r.level === '中')}">${r.level}</td><td>${r.perYear[1] > 0 ? `${r.perYear[0]}〜${r.perYear[1]}%` : '条件なし'}</td><td>${n0(r.exposed)}</td></tr>`).join('')}</table>
      <p class="note">行にカーソルを合わせると、主な要因と対策で下がる分が出ます。確率は地形と街のようすから出したゲーム上の推計で、幅（±4 割）で示します。地震の発生は地域によらず一律の仮定で、被害の大きさが液状化・備え・老朽で変わります。</p></section>
    <section><h2>お産と子育ての医療</h2>
      <div class="rows"><span>市内で出産できる所</span><b style="color:${col(ob < 0.95, ob < 1)}">${ob >= 1.07 ? '周産期母子医療センター' : ob >= 1 ? '産院' : ob >= 0.95 ? '一般の病院だけ' : 'なし（市外へ通う）'}</b><span>出生への効果</span><b>×${ob.toFixed(2)}</b>${s.stats.yudoShare !== undefined ? `<span>居住誘導区域に住む世帯</span><b>${pct(s.stats.yudoShare ?? 0)}</b>` : ''}</div></section>`;
  }
  renderTools(): void {
    const s = this.s, t = this.tool;
    const groups: [string, string, string][] = [['select', '指', '見る・選ぶ'], ['road', '道', '道路を引く'], ['zone', '用', '土地の用途'], ['build', '施', '施設を建てる']];
    if (!REAL) groups.splice(3, 0, ['terra', '地', '地形']);
    if (s.mode === 'sandbox') groups.push(['sandbox', '直', '直接配置']);
    const active = t.t === 'select' ? 'select' : t.t === 'road' || t.t === 'tunnel' || t.t === 'bridge' || t.t === 'overpass' || t.t === 'footbridge' || t.t === 'canal' || t.t === 'busStop' || t.t === 'street' || t.t === 'levee' || t.t === 'widen' || t.t === 'flyover' || t.t === 'unroad' || t.t === 'repair' || t.t === 'rail' || t.t === 'railgrade' || t.t === 'railKind' || t.t === 'unrail' ? 'road' : t.t === 'zone' || t.t === 'devarea' || t.t === 'area' ? 'zone' : t.t === 'terra' ? 'terra' : t.t === 'build' ? 'build' : 'sandbox';
    $('tools').innerHTML = groups.map(([id, ch, label]) => `<button class="tool ${id === 'sandbox' ? 'sandbox' : ''}" data-act="group" data-arg="${id}" aria-pressed="${active === id}" aria-label="${label}"><b>${ch}</b><span>${label}</span></button>`).join('') + `<button class="tool panelbtn" data-act="sidetoggle" aria-label="課題と資料"><b>課</b><span>課題・資料</span></button>`;
    const f = $('flyout');
    if (!this.group) { f.hidden = true; $('tutorial').classList.remove('shift'); return; }
    f.hidden = false; $('tutorial').classList.add('shift');
    const item = (arg: string, name: string, cost: string, desc: string, on: boolean, sw = '') => { const k = arg.startsWith('build:') || arg.startsWith('sandbox:') ? arg.split(':')[1] as Kind : null, im = k ? thumb(k) : ''; return `<button class="item ${im ? 'withpic' : ''}" data-act="tool" data-arg="${arg}" aria-pressed="${on}">${im ? `<img class="pic" src="${im}" alt="" width="96" height="64">` : ''}<b>${sw ? `<span class="sw" style="background:${sw}"></span>` : ''}${name}</b><em>${cost}</em><small>${desc}</small></button>`; };
    if (this.group === 'road') f.innerHTML = `<h3>道路</h3><p>ドラッグで直線に引きます。市外（国道）までつながった道路に面した区画だけが使えます。</p>` +
      item('road:1', '生活道路', `${P.roadCost[1]}万円/区間`, `容量 ${P.roadCap[1]} 台/時。維持費 月 ${P.roadUpkeep[1]} 万円/区間`, t.t === 'road' && t.road === 1) +
      item('road:2', '幹線道路', `${P.roadCost[2]}万円/区間`, `容量 ${P.roadCap[2]} 台/時。生活道路からの拡幅は差額のみ。維持費 月 ${P.roadUpkeep[2]} 万円/区間`, t.t === 'road' && t.road === 2) +
      item('tunnel:1', 'トンネル（山を抜ける道）', `${P.tunnelCost[1].toLocaleString()}万円/区間`, '急斜面や保全林の区画をトンネルで抜けます。山の手前から向こうの道路までドラッグ。ほかの区画はふつうの生活道路になります', t.t === 'tunnel' && t.road === 1) +
      item('tunnel:2', 'トンネル（幹線）', `${P.tunnelCost[2].toLocaleString()}万円/区間`, '幹線道路のトンネル。容量が大きい', t.t === 'tunnel' && t.road === 2) +
      item('bridge:1', '橋（川・水路・谷を渡る道）', `${P.bridgeCost[1].toLocaleString()}万円/区間`, '岸の道路から向こう岸までドラッグ。水の上と谷（急な斜面）・湿地・保全林の上が橋になり、ほかの区画はふつうの生活道路になります', t.t === 'bridge' && t.road === 1) +
      item('bridge:2', '橋（幹線）', `${P.bridgeCost[2].toLocaleString()}万円/区間`, '幹線道路の橋。容量が大きい', t.t === 'bridge' && t.road === 2) +
      (this.s.rail ? item('overpass', '陸橋（跨線橋）', `${P.overpassCost.toLocaleString()}万円/か所`, '踏切の区画を選ぶと、道路が線路の上を越える陸橋になります。車が列車を待たなくなり、渋滞が減ります', t.t === 'overpass') : '') +
      item('footbridge', '歩道橋', `${P.footbridgeCost.toLocaleString()}万円/か所`, '道路をまたぐ歩行者の橋。まわり 90m の世帯の治安（交通安全）の水準が上がります。学校や駅の近くの幹線に', t.t === 'footbridge') +
      item('canal', '水路（運河）を掘る', `${P.canalCost.toLocaleString()}万円/区画`, '空き地に水路を掘ります。まわり 90m の浸水が半分になり（放水路）、水辺の散歩道で空気の水準も少し上がります。道路で渡るには橋が要ります', t.t === 'canal') +
      item('widen:1', '幹線を 6 車線に広げる', `${P.wideCost.toLocaleString()}万円/区間`, '幹線道路の上をドラッグ。片側 3 車線になり、容量が 1.5 倍になります。混む幹線に', t.t === 'widen' && t.on) +
      item('widen:0', '4 車線に戻す', '無料', '6 車線にした幹線を元の幅に戻します', t.t === 'widen' && !t.on) +
      item('flyover', '立体交差にする', `${P.flyoverCost.toLocaleString()}万円/か所`, '幹線（国道を含む）どうしの交差点をクリック。片方の道路が高架で交差点をまたぎ、信号で止まらなくなります（容量 1.8 倍・通り抜け 3 割速く）', t.t === 'flyover') +
      item('levee', '堤防を築く', `${P.leveeCost.toLocaleString()}万円/区画`, '川・水辺に面した空き地に盛り土の堤防を築きます。うしろ 120m の浸水が 5 分の 1 になります', t.t === 'levee') +
      item('busStop:1', 'バス停を置く', `${P.busStopCost}万円/か所`, `道路の上をクリック・ドラッグ。路線バスが停まり、まわり 120m の世帯は車で通勤する人が減ります。運行の赤字補助 月 ${P.busStopSubsidy} 万円/か所（自動運転バスの車庫があると半分）`, t.t === 'busStop' && t.on) +
      item('busStop:0', 'バス停をなくす', '無料', '補助をやめると、その停留所に路線バスが来なくなります', t.t === 'busStop' && !t.on) +
      `<h3 style="margin-top:10px">道路の種類</h3>` +
      item('street:tree', '並木道にする', `${P.streetCost.tree}万円/区間`, '歩道に街路樹を植えます。暮らしの満足が少し上がります（80 区間で頭打ち）', t.t === 'street' && t.style === 'tree') +
      item('street:stone', '石畳・カラー舗装にする', `${P.streetCost.stone}万円/区間`, '歩きやすい石畳とれんが色の歩道に。来訪者と知名度が上がり、高齢世帯が歩きやすくなります。商店街や駅前に', t.t === 'street' && t.style === 'stone') +
      item('street:nopole', '電線を地中に埋める（無電柱化）', `${P.streetCost.nopole}万円/区間`, '生活道路の電柱をなくします。地震や台風で電柱が倒れる被害が減り、景観が良くなります（費用は大きめ）', t.t === 'street' && t.style === 'nopole') +
      item('street:charge', '走りながら充電できる道路（次世代）', `${P.streetCost.charge}万円/区間`, '幹線道路の下にコイルを埋め、走る EV に電気を送ります。物流が強くなり、知名度が上がります。20 年目から', t.t === 'street' && t.style === 'charge') +
      item('street:none', 'ふつうの道路に戻す', '無料', '並木・石畳・無電柱化をやめます', t.t === 'street' && t.style === 'none') +
      item('repair', '補修', `${P.roadRepairCost}万円/区間`, '老朽度を 0 に戻します。老朽度 70 超で容量が 15% 落ちます', t.t === 'repair') +
      item('unroad', '撤去', `${P.roadRemoveCost}万円/区間`, '市道のみ。国道は国の管理で撤去できません', t.t === 'unroad') +
      (this.s.rail ? `<h3 style="margin-top:10px">鉄道</h3><p>市が費用を負担し、鉄道事業者に工事してもらいます。駅は線路に面していて、線路が地図の端（市外）までつながっていると使えます。</p>` +
        item('rail:1:0', '線路を敷く（地上）', `${yenT(P.railCost[1])}/区間`, `ドラッグした 2 点をまっすぐ結びます。線路の端から引くと、その向きから曲線でつながります。急なカーブ（1 区画で 45 度より急）や線路どうしの平面交差はできません。道路と交わる所は踏切になり、車が待たされます。駅の利用は 1 駅 朝 ${P.stationCap[1]} 人まで`, t.t === 'rail' && t.level === 1 && t.grade === 0) +
        item('rail:1:1', '線路を敷く（高架）', `${yenT(P.railCost[1] * P.railGradeMul[1])}/区間`, '道路の上を立体で越えます（踏切なし）。下は道路にできますが、建物は置けません', t.t === 'rail' && t.level === 1 && t.grade === 1) +
        item('rail:1:2', '線路を敷く（地下）', `${yenT(P.railCost[1] * P.railGradeMul[2])}/区間`, '家や公園の下も通せます。地上はそのまま使えます', t.t === 'rail' && t.level === 1 && t.grade === 2) +
        item('rail:1:3', '線路を敷く（掘割）', `${yenT(P.railCost[1] * P.railGradeMul[3])}/区間`, '地面を掘り下げた半地下の線路。踏切がなく、地下より安く敷けます。上には建物を置けず、道路は橋で渡ります', t.t === 'rail' && t.level === 1 && t.grade === 3) +
        item('rail:2', '複線にする', `${yenT(P.railCost[2] - P.railCost[1])}/区間〜`, `線路に沿ってドラッグ。駅の利用が 1 駅 朝 ${P.stationCap[2]} 人まで増え、混雑が減ります。踏切の待ち時間は長くなります`, t.t === 'rail' && t.level === 2) +
        item('rail:3', '複々線にする', `${yenT(P.railCost[3] - P.railCost[2])}/区間〜`, `線路に沿ってドラッグ。各駅停車と快速を分けて走らせる 4 本の線路で、駅の利用が 1 駅 朝 ${P.stationCap[3]} 人まで増えます。踏切の待ち時間はさらに長くなるので、高架か地下と組み合わせて`, t.t === 'rail' && t.level === 3) +
        item('railgrade:1', '高架にする', `${yenT(P.railGradeCost[1])}/区間`, '線路に沿ってドラッグ。踏切がなくなり、道路の渋滞が減ります', t.t === 'railgrade' && t.grade === 1) +
        item('railkind:1', 'モノレールにする', `${yenT(P.railKindCost[1])}/区間`, '線路に沿ってドラッグ。1 本の太い桁にまたがって走る高架の乗り物に。踏切がなく、音が静かです（高架ならもっと安い）', t.t === 'railKind' && t.kind === 1) +
        item('railkind:2', '新交通システムにする', `${yenT(P.railKindCost[2])}/区間`, '線路に沿ってドラッグ。ゴムタイヤの小さな車両が無人で走る高架の軌道に（ゆりかもめ・ポートライナーのような）', t.t === 'railKind' && t.kind === 2) +
        item('railkind:0', 'ふつうの鉄道に戻す', '無料', 'モノレール・新交通をふつうの鉄道に（高架のまま）', t.t === 'railKind' && t.kind === 0) +
        item('railgrade:2', '地下にする', `${yenT(P.railGradeCost[2])}/区間`, '線路に沿ってドラッグ。踏切がなくなり、地上の跡地に建物や用途を置けます', t.t === 'railgrade' && t.grade === 2) +
        item('railgrade:3', '掘割にする', `${yenT(P.railGradeCost[3])}/区間`, '線路に沿ってドラッグ。地面を掘り下げて半地下にし、踏切をなくします。地下化より安く、上は空いたまま（建物は置けません）', t.t === 'railgrade' && t.grade === 3) +
        item('railgrade:0', '地上に戻す', `${yenT(P.railGradeCost[0])}/区間`, '高架・地下の線路を地上の線路にします（上に建物がない所だけ）', t.t === 'railgrade' && t.grade === 0) +
        item('unrail', '線路を撤去', `${P.railRemoveCost}万円/区間`, '跡地に道路や建物を置けます。つながらなくなった駅は止まります', t.t === 'unrail') : '');
    else if (this.group === 'zone') f.innerHTML = `<h3>用途の指定</h3><p>ドラッグで範囲を塗ります（無料）。建てるのは民間で、道路・水道の余力・需要がそろったときだけです。</p>` +
      item('zone:1', '低層住宅', '4 戸/区画', '戸建て。子育て（就学）・高齢世帯に好まれます', t.t === 'zone' && t.zone === 1, ZC[1]) +
      item('zone:2', '中層住宅', '14 戸/区画', '3〜4 階の集合住宅。単身・夫婦世帯が中心', t.t === 'zone' && t.zone === 2, ZC[2]) +
      item('zone:3', '高層住宅', '40 戸/区画', `駅から道路で ${P.mansionStationRange * 30}m 以内なら分譲マンション（人口 ${P.towerPop / 10000} 万人を超えると、駅から ${P.towerStationRange * 30}m 以内はタワーマンション 150 戸にも）。子育て（未就学）世帯が増えます`, t.t === 'zone' && t.zone === 3, ZC[3]) +
      item('zone:4', '商業', '店舗', 'パン屋・商店。2×2 で幹線か国道に面していればスーパーも', t.t === 'zone' && t.zone === 4, ZC[4]) +
      item('zone:5', '業務（オフィス）', 'オフィス', '市内の職が足りないと民間がオフィスビルを建てます。駅の近くは大きなビルに。税収と雇用', t.t === 'zone' && t.zone === 5, ZC[5]) +
      item('zone:6', '工業', '町工場', '民間が中小の工場を建てます。雇用と税収。周りの空気が少し悪くなるので住宅から離して', t.t === 'zone' && t.zone === 6, ZC[6]) +
      item('zone:0', '指定を解除', '', '空き区画の用途指定を外します', t.t === 'zone' && t.zone === 0) +
      `<h3 style="margin-top:10px">区画整理（道路と住宅地を一度に）</h3><p>空き地を四角にドラッグすると、3 区画ごとに生活道路を通し、残りを住宅に指定します。範囲の端を、いまある道路に接するように選んでください。</p>` +
      item('devarea:1', '戸建ての住宅地をつくる', `道路 ${P.roadCost[1]}万円/区間`, '低層住宅。子育て・高齢世帯向け', t.t === 'devarea' && t.zone === 1, ZC[1]) +
      item('devarea:2', '集合住宅の住宅地をつくる', `道路 ${P.roadCost[1]}万円/区間`, '中層住宅。単身・夫婦世帯向け、たくさん住める', t.t === 'devarea' && t.zone === 2, ZC[2]) +
      item('devarea:3', 'マンション街をつくる', `道路 ${P.roadCost[1]}万円/区間`, `高層住宅。駅から道路で ${P.mansionStationRange * 30}m 以内がおすすめ`, t.t === 'devarea' && t.zone === 3, ZC[3]) +
      `<h3 style="margin-top:10px">線引きと立地適正化（都市計画法・都市再生特別措置法）</h3><p>どこに街を広げ、どこを守るかを決めます（無料）。${s.stats.yudoShare !== undefined ? `いま居住誘導区域に住む世帯は ${Math.round((s.stats.yudoShare ?? 0) * 100)}%（6 割を超えると国の支援が増えます）。` : ''}</p>` +
      item('area:1', '市街化調整区域にする', '無料', '新しい住宅・店の用途を指定できず、民間の家も原則建ちません（農家の家など少しだけ）。田畑・林を守り、道路や水道を広げずに済みます', t.t === 'area' && t.v === 1, AREA_CSS[1]) +
      item('area:2', '居住誘導区域にする', '無料', '駅やバス停の近くに住宅を集めます。区域の中は家が 1.3 倍建ちやすく、外は少し建ちにくくなります。区域に 6 割が住むと国の交付金が 3% 増えます', t.t === 'area' && t.v === 2, AREA_CSS[2]) +
      item('area:0', '市街化区域に戻す', '無料', '線引きを外し、ふつうの市街化区域にします', t.t === 'area' && t.v === 0);
    else if (this.group === 'terra') {
      const T = (op: TerraOp, desc: string) => item('terra:' + op, TERRA_NAMES[op], `${(P.terraCost[op] ?? 0).toLocaleString()}万円/区画`, desc, t.t === 'terra' && t.op === op);
      f.innerHTML = `<h3>地形の造作</h3><p>空き地をドラッグして、土地の形を変えます。建物・道路・線路・水路・堤防のある区画と、そのすぐ隣の高さは変えられません。急な斜面（30m で 3.5m 以上の高低差）には建物も道路も置けなくなります。</p>` +
        `<h4 style="margin:8px 0 2px">高さ</h4>` +
        T('raise', '2.5m 盛り土します。低い土地を浸水から守る高台に') + T('lower', '2.5m 掘り下げます（川の水面より下には掘りません）') + T('flatten', '選んだ範囲を平らにします。斜面を造成して建てられるように') +
        T('hill', 'なだらかな丘（中央が約 7m 高い）。眺めのよい住宅地や公園に') + T('mountain', '山（中央が約 28m 高い）。まわりは急な斜面になり、建てられなくなります。ロープウェイの山にも') + T('valley', 'ドラッグした線に沿って約 5m の谷を掘ります') + T('cliff', '選んだ範囲を 14m 持ち上げ、まわりを切り立った崖にします。崖の上は平らな台地で、建物や道路を置けます（崖の斜面には置けません）') +
        `<h4 style="margin:8px 0 2px">水・緑・土</h4>` +
        T('water', '池・川・海をつくります。広く塗れば湖や入り江に、陸のまわりを塗れば島になります。そばの世帯は環境がよくなります（水辺の近くは浸水のおそれも出ます）') + T('fill', '水面・湿地を埋め立てて陸にします。川や海も埋め立てられます') +
        T('forest', '木を植えて林にします（建物は置けなくなります）。そばの世帯の環境がよくなります') + T('clear', '林を切り開いて、建物や道路を置けるようにします') +
        T('wet', '湿地（葦の生える水辺）。建物は置けませんが、大雨の水をためて、まわり 90m の浸水を半分にします（遊水地）') + T('sand', '砂地（砂浜・砂丘）にします。建物は置けます') +
        T('desert', '砂漠（風紋のある砂丘）にします。建物は置けます。16 区画以上広げると砂丘が観光地になり、来訪者と知名度が増えます') + T('snow', '雪原にします。建物は置けます。スキー場があると、雪原の広さに応じてスキー客が増えます') +
        T('reset', '選んだ区画を、造作する前の元の地形に戻します');
    }
    else if (this.group === 'build') {
      const isle = isCastaway(this.s.seed), BK = BUILD_KINDS.filter(k => !DEFS[k].isle || isle).sort((a, b) => (DEFS[b].isle ? 1 : 0) - (DEFS[a].isle ? 1 : 0)); // v88：無人島の施設は島でだけ、先頭に
      const cats = (Object.keys(CAT_NAMES) as Cat[]).filter(c => BK.some(k => DEFS[k].cat === c && (k !== 'station' || this.s.rail)));
      if (!cats.includes(this.bcat)) this.bcat = cats[0];
      const kinds = BK.filter(k => DEFS[k].cat === this.bcat && (k !== 'station' || this.s.rail));
      const how = (k: Kind) => { const a = authorityLabel(k); return a.act === 'direct' ? '' : `<span class="tag" title="${a.actor}：${a.how}${a.why ? '（' + a.why + '）' : ''}">${a.name}・${a.actor}</span> `; }; // v90：5 つの行動種別と主体
      f.innerHTML = `<h3>施設を建てる・誘致する</h3><div class="btnrow cats">${cats.map(c => `<button class="seg" data-act="bcat" data-arg="${c}" aria-pressed="${this.bcat === c}">${CAT_NAMES[c]}</button>`).join('')}</div>
        <p>${this.bcat === 'biz' || this.bcat === 'industry' || this.bcat === 'commerce' ? '企業やホテル・工場・店は市が建てるのではなく、用地を整えて誘致します。条件（道路・駅・電力・知名度）と税で来てくれる見込みが変わり、失敗することもあります。' : '<b>市</b>の施設は市が建てて運営します（直接整備）。<span class="tag">補助</span>は法人が建て市が補助、<span class="tag">協議</span>は国・県・都道府県警察・鉄道事業者などが決め（時間がかかり、断られることもある）、<span class="tag">広域共同事業</span>は近隣と共同で負担金を出します。建設費は着工時に支出します。'}${(() => { const o = currentOffice(); return o.office === 'mayor' ? '' : `<br><small class="note">${o.role}（${o.power.name}）：${o.power.note}</small>`; })()}</p>` +
        kinds.map(k => { const d = DEFS[k]; return k === 'station' ? item('build:station', '新しい駅（請願駅）', yenT(buildCost(this.s, k)), `${d.w}×${d.h} 区画・工期 ${d.months} か月。線路に面して置きます。市が費用を負担し、鉄道事業者が運営します。駅の近くは高層住宅が建ちやすくなります`, t.t === 'build' && t.kind === k) : item('build:' + k, how(k) + d.name, yenT(buildCost(this.s, k)), `${d.w}×${d.h} 区画・${d.months} か月${isCity(k) ? `・維持費 月 ${d.upkeep} 万円` : ''}${d.staffReq && d.wage ? `・${d.staffKind} ${d.staffReq} 人` : ''}。${capText(k)}${d.lvMax ? `。増築でレベル ${d.lvMax} まで` : ''}`, t.t === 'build' && t.kind === k); }).map((h, j) => { const k = kinds[j], vd = DEFS[k].vision; if (vd) { const vn = VISIONS.find(v => v.id === vd)?.name ?? ''; return this.s.vision === vd ? h.replace('</b>', ' <span class="tag good">ビジョン専用</span></b>') : h.replace('<button class="item', `<button disabled title="ビジョン「${vn}」の街だけ" class="item locked`).replace('</b>', ` <span class="tag">「${vn}」専用</span></b>`); } const u = DEFS[k].unlock, y = Math.floor(this.s.month / 12) + 1; return u && y < u ? h.replace('<button class="item', '<button disabled title="まだ技術がありません" class="item locked').replace('</b>', ` <span class="tag">${u} 年目から</span></b>`) : u ? h.replace('</b>', ' <span class="tag good">新技術</span></b>') : h; }).join('');
    }
    else if (this.group === 'sandbox') f.innerHTML = `<h3>直接配置（サンドボックス専用）</h3><p>落選後の自由な街づくり用です。経営モードの民間開発とは別扱いで、建物には「直接配置」の印が付きます。入居・売上・税収は通常の計算のままで、需要がなければ空のままです。</p>` +
      (['house', 'apartment', 'mansion', 'towerMansion', 'bakery', 'shop', 'konbini', 'cafe', 'drugstore', 'supermarket', 'officeS', 'officeM', 'smallFactory'] as Kind[]).map(k => item('sandbox:' + k, DEFS[k].name, '無料', `${DEFS[k].w}×${DEFS[k].h} 区画`, t.t === 'sandbox' && t.kind === k)).join('');
    else f.hidden = true;
  }
  renderHint(level = '', text = ''): void {
    const h = $('hint'), t = this.tool;
    if (!text) {
      if (t.t === 'select' || this.photo) { h.hidden = true; return; }
      text = t.t === 'build' || t.t === 'sandbox' ? `【${DEFS[t.kind].name}を建てる】地図の上で置きたい場所をクリック。緑＝置ける／黄＝注意／赤＝置けない。${REAL ? '置けない所を指すと近くの置ける場所に寄せます。家のある区画は用地買収で建てられます。' : ''}Esc でやめる` : t.t === 'zone' ? `【${t.zone ? ZONE_NAMES[t.zone] + 'に指定' : '用途の指定を解除'}】道路沿いの空き地をドラッグで塗る。${REAL ? '家のある区画も、より高い住宅の用途に変えると、需要があれば民間が建て替えます。' : ''}Esc でやめる` : t.t === 'road' ? `【${ROAD_NAMES[t.road]}を引く】いまある道路の端から、地図の上をドラッグ。${REAL ? '家や川を避けて自動で道筋を探します（Shift を押すとまっすぐ）。' : ''}Esc でやめる` : t.t === 'repair' ? '【道路を補修】直したい道路の上をドラッグ。Esc でやめる' : t.t === 'terra' ? `【${TERRA_NAMES[t.op]}】空き地をドラッグ。Esc でやめる` : t.t === 'widen' ? '【6 車線】幹線道路の上をドラッグ。Esc でやめる' : t.t === 'flyover' ? '【立体交差】幹線どうしの交差点をクリック。Esc でやめる' : t.t === 'area' ? `【${AREA_N[t.v]}】範囲をドラッグで塗る（無料）。地図の黄土色が市街化調整区域、青緑が居住誘導区域。Esc でやめる` : t.t === 'busStop' ? (t.on ? '【バス停を置く】道路の上をクリック。Esc でやめる' : '【バス停をなくす】バス停の上をクリック。Esc でやめる') : t.t === 'levee' ? '【堤防を築く】川・水辺に面した空き地をドラッグ。Esc でやめる': t.t === 'devarea' ? '【区画整理】空き地を四角にドラッグ（端を既存の道路に接するように）。道路と住宅地を一度につくります。Esc でやめる' : '【道路を撤去】なくしたい道路の上をドラッグ。Esc でやめる';
    }
    if (!level && !coarse()) text = text.replace('Esc でやめる', t.t === 'build' || t.t === 'sandbox' ? 'ドラッグで地図を動かせます。Esc でやめる' : '右ドラッグで地図を動かせます。Esc でやめる');
    if (!level && coarse()) text = text.replace('Esc でやめる', '地図を動かすのは 2 本指。やめるときは［見る・選ぶ］');
    h.hidden = false; h.className = level; h.textContent = text;
    this.renderCands();
  }
  // ------------------------------------------------------------ おすすめの場所（足りない所の近くで、実際に建てられる所）
  private cands: { key: string; list: Cand[] } | null = null;
  private renderCands(): void {
    let el = document.getElementById('cands');
    const t = this.tool;
    if (t.t !== 'build' || this.photo) { if (el) el.hidden = true; return; }
    const facts = `<details class="f90-bf"${this.openK.has('f90bf') ? ' open' : ''} data-k="f90bf"><summary>${esc(DEFS[t.kind].name)}：費用・工期・権限など</summary>${buildFacts(this.s, t.kind)}</details>`; // v90
    if (!hasCandidates(t.kind)) { if (!el) { el = document.createElement('div'); el.id = 'cands'; $('app').appendChild(el); } el.hidden = false; el.innerHTML = facts; return; }
    if (!el) { el = document.createElement('div'); el.id = 'cands'; $('app').appendChild(el); }
    const key = `${t.kind}:${this.game.rev}:${this.game.draft ? 1 : 0}`;
    if (!this.cands || this.cands.key !== key) this.cands = { key, list: findCandidates(this.s, t.kind, 4) };
    const list = this.cands.list, m = getMap(this.s.seed), MARK = '①②③④';
    el.hidden = false;
    el.innerHTML = facts + `<b>おすすめの場所</b>` + (list.length
      ? list.map((c, k) => `<div class="cand"><button class="btn small" data-act="candsee" data-arg="${c.x}:${c.y}"><span class="mk">${MARK[k]}</span>${esc(DISTRICTS[m.district[idx(c.x, c.y)]] ?? '')}<small>${esc(c.label)}・${yenT(c.cost)}</small></button><button class="btn small primary" data-act="candbuild" data-arg="${c.x}:${c.y}">建てる</button></div>`).join('')
      : '<small>いまは足りない所が見つかりません</small>');
  }
  /** 電車・バスに乗っている間は「降りる」ボタンを出す（Esc でも降りる） */
  private rideBtn(): void {
    let b = document.getElementById('rideexit') as HTMLButtonElement | null;
    if (!b) { b = document.createElement('button'); b.id = 'rideexit'; b.className = 'btn primary'; b.style.cssText = 'position:fixed;top:calc(max(12px,env(safe-area-inset-top)) + 96px);left:50%;transform:translateX(-50%);z-index:60;font-size:15px;padding:10px 16px;box-shadow:0 2px 10px rgba(0,0,0,.3)';
      b.onclick = () => { this.view.ride = null; this.renderViewbar(); }; document.body.appendChild(b);
      this.view.onRideEnd = () => { this.toast('終電が終わったので降りました（1〜5 時は電車が走りません）'); this.renderViewbar(); };
      addEventListener('keydown', e => { if (e.key === 'Escape' && this.view.ride) { this.view.ride = null; this.renderViewbar(); } });
      setInterval(() => { const bb = document.getElementById('rideexit'); if (bb && bb.hidden !== !this.view.ride) this.renderViewbar(); }, 600); }
    b.textContent = this.view.ride === 'bus' ? '✕ バスを降りる' : '✕ 電車を降りる'; b.hidden = !this.view.ride;
  }
  renderViewbar(): void {
    this.rideBtn();
    const v = this.view, L: [Layer, string][] = [['conn', '道路接続'], ['traffic', '混雑'], ['age', '老朽化'], ['sat', '満足度']];
    const L2: [Layer, string][] = [['elev', '標高'], ['tsunami', '津波'], ['land', '地価'], ['bus', 'バス'], ['care', '保育'], ['edu', '教育'], ['health', '医療'], ['welfare', '福祉'], ['safety', '治安'], ['disaster', '防災'], ['env', '空気'], ['culture', '文化'], ['life', 'ライフライン'], ['pipes', '地下の管']];
    const lv = (fac: string): [string, string][] => [['#2f7fd0', fac], ['#9fc4a8', '十分'], ['#d9c53a', 'やや不足'], ['#e5892f', '不足'], ['#d0392e', 'かなり不足']];
    const leg: Record<string, [string, string][]> = {
      conn: [['#2f7fd0', '道路'], ['#3aa655', '市外までつながる'], ['#d0392e', 'つながっていない']],
      traffic: [['#3aa655', '〜50%'], ['#9bc53d', '〜80%'], ['#d9c53a', '〜100%'], ['#e5892f', '〜125%'], ['#d0392e', '125% 超']],
      care: [['#2f7fd0', '保育園'], ['#6a1f8a', '止まっている園'], ['#9fc4a8', '待機なし'], ['#d9c53a', '一部入れない'], ['#e5892f', '半数入れない'], ['#d0392e', 'ほぼ入れない']],
      age: [['#3aa655', '老朽度 〜30'], ['#d9c53a', '〜55'], ['#e5892f', '〜80'], ['#d0392e', '80 超']],
      sat: [['#9fc4a8', '満足 85% 超'], ['#d9c53a', '〜70%'], ['#e5892f', '〜60%'], ['#d0392e', '低い']],
      edu: lv('学校・図書館'), health: lv('病院・診療所'), welfare: lv('福祉施設'), safety: lv('交番・警察'), culture: lv('文化・スポーツ施設'), life: lv('水道・電気・ガス・ごみ'),
      elev: [['#2b6cc4', '海抜 2m 未満'], ['#5fb0d8', '〜5m'], ['#7cc47a', '〜10m'], ['#d9c53a', '〜20m'], ['#d08a3a', '〜40m'], ['#a0522d', '40m 以上']],
      land: [['#cfe3c8', '4 万円/㎡ 未満'], ['#9fd08a', '〜7 万円'], ['#e8d36a', '〜11 万円'], ['#f0a050', '〜16 万円'], ['#e0643c', '〜24 万円'], ['#b02a3a', '24 万円以上']],
      bus: [['#e0402a', 'バス路線（路線ごとの色）'], ['#1f2f3f', 'バス停'], ['#bfe0f4', '路線の沿線（停留所から 4 区画）']],
      pipes: [['#2a8ae0', '上水道（水道管）'], ['#9a5a2a', '下水道'], ['#e8c020', '都市ガス'], ['#d0d0d0', '線のない道路は届いていない']], // v87
      tsunami: [['#f2ea7a', `浸水 0.5m 未満（想定 ${designWave(this.s)}m の津波）`], ['#f4c38a', '〜1m'], ['#f08a8a', '〜3m'], ['#e05060', '〜5m'], ['#b03a8a', '〜10m'], ['#7a2a8a', '10m 以上']],
      disaster: [['#2f7fd0', '消防・備蓄・調整池'], ['#7fb0e0', '浸水のおそれ'], ['#9fc4a8', '備え十分'], ['#e5892f', '不足'], ['#d0392e', 'かなり不足・浸水']],
      env: [['#2f7fd0', '公園'], ['#7a3fa0', '空気を汚す施設'], ['#9fc4a8', 'きれい'], ['#e5892f', 'やや悪い'], ['#d0392e', '悪い']],
    };
    const hh = Math.floor(v.hour), mm = Math.floor((v.hour % 1) * 60 / 10) * 10;
    const open = $('viewbar').classList.contains('open'), LN = [...L, ...L2].find(([id]) => id === v.layer)?.[1];
    $('viewbar').innerHTML =
      `<div class="vrow vtog"><button class="seg" data-act="viewtoggle" aria-expanded="${open}">🗺 地図の表示・カメラ ${open ? '▾ たたむ' : '▸'}</button>${LN ? `<button class="seg" data-act="layer" data-arg="${v.layer}" aria-pressed="true">${LN} ✕</button>` : ''}</div>` +
      (v.layer !== 'none' ? `<div class="vrow leg"><div class="legendbar">${leg[v.layer].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div></div>` : '') +
      `<div class="vrow"><span>地図</span>${L.map(([id, n]) => `<button class="seg" data-act="layer" data-arg="${id}" aria-pressed="${v.layer === id}">${n}</button>`).join('')}</div>` +
      `<div class="vrow"><span>暮らし</span>${L2.map(([id, n]) => `<button class="seg" data-act="layer" data-arg="${id}" aria-pressed="${v.layer === id}">${n}</button>`).join('')}</div>` +
      `<div class="vrow opt2"><span>カメラ</span><button class="seg" data-act="follow" aria-pressed="${v.followCar >= 0}">🚗 住民を追う</button><button class="seg" data-act="tour">🚁 街めぐり</button><button class="seg" data-act="ride" data-arg="train" aria-pressed="${this.view.ride === 'train'}">🚃 電車に乗る</button><button class="seg" data-act="ride" data-arg="bus" aria-pressed="${this.view.ride === 'bus'}">🚌 バスに乗る</button><button class="seg" data-act="camrot" data-arg="-1" aria-label="左に回す">⟲ 回す</button><button class="seg" data-act="camrot" data-arg="1" aria-label="右に回す">回す ⟳</button><button class="seg" data-act="camzoom" data-arg="1" aria-label="近づく">＋ 近づく</button><button class="seg" data-act="camzoom" data-arg="-1" aria-label="離れる">− 離れる</button></div><div class="vrow opt2"><span>視点</span><button class="seg" data-act="cam" data-arg="orbit" aria-pressed="${v.mode === 'orbit'}">俯瞰</button><button class="seg" data-act="cam" data-arg="ground" aria-pressed="${v.mode === 'ground'}">地上</button><button class="seg" data-act="cam" data-arg="photo">フォト</button>` +
      `<span style="margin-left:8px">時刻</span><input id="hour" type="range" min="0" max="23.9" step="0.1" value="${v.hour.toFixed(1)}" aria-label="見た目の時刻"><b class="num" id="hourtxt">${hh}:${String(mm).padStart(2, '0')}</b><small id="wxtxt" style="margin:0 6px;white-space:nowrap">${wxText(v, this.s)}</small><button class="seg" data-act="clock" aria-pressed="${v.clockRun}" title="見た目の昼夜を自動で進める（経営の月とは独立）">自動</button></div>` +
      (v.mode === 'ground' ? `<div class="vrow gmode"><span>地上視点</span>W A S D で歩く・Q E で向き・ドラッグで見回す・Shift で走る・Esc で戻る</div>` : '');
  }

  // ---- 右パネル
  renderSide(): void {
    const s = this.s, tabs: [Tab, string][] = [['home', '概要'], ['mayor', '市長'], ['city', '市政'], ['term', '任期'], ['voice', '声'], ['money', '財政'], ['policy', '政策'], ['fc', '予測'], ['fac', '施設']];
    const bad = s.voices.filter(v => v.tone !== 'good').length;
    $('tabs').innerHTML = tabs.map(([id, n]) => `<button role="tab" data-act="tab" data-arg="${id}" aria-selected="${this.tab === id}">${n}${id === 'voice' && bad ? `<span class="dot">${bad}</span>` : ''}</button>`).join('') + `<button class="xpl" data-act="explain" aria-pressed="${document.body.classList.contains('explain')}" title="説明の文を表示する・隠す">？</button><button class="fold" data-act="sidetoggle" aria-label="資料パネルをたたむ・ひらく" title="たたむ・ひらく">${phone() ? '×' : $('side').classList.contains('closed') ? '▼' : '▲'}</button>`;
    const p = $('panel'), top = p.scrollTop, same = p.dataset.tab === this.tab;
    p.dataset.tab = this.tab;
    p.innerHTML = this.tab === 'home' ? this.pHome() : this.tab === 'mayor' ? this.pMayor() : this.tab === 'city' ? this.pCity() + this.pThreats() : this.tab === 'term' ? this.pTerm() : this.tab === 'voice' ? this.pVoice() : this.tab === 'money' ? this.pMoney() : this.tab === 'policy' ? this.pPolicy() : this.tab === 'fc' ? this.pForecast() : this.pFac();
    p.scrollTop = same ? top : 0;
  }
  /** 街が発展するのに必要なものの充足（0〜1）。足りないものから順に */
  /** v90：課題の導線（① 原因を見る → ② 対策を試算 → ③ 実行 → ④ 結果）。③で押すまで街は変わらない */
  private issueAct(arg: string): void {
    const [cmd, key, n] = arg.split('|'), g = this.game, s = g.state, iss = allIssues(s).find(i => i.key === key) ?? loopEntryIssue(s, key);
    const f = this.ix?.key === key ? this.ix : (this.ix = { key, open: null, opts: [], pick: -1, trial: null, busy: false, confirm: false });
    if (cmd === 'close') { this.ix = null; this.renderSide(); return; }
    if (cmd === 'cause') {
      f.open = f.open === 'cause' ? null : 'cause';
      if (iss && f.open) { const v = s.voices.find(o => o.key.split(':')[0] === key.split(':')[0] && o.tile >= 0), t = iss.tile >= 0 ? iss.tile : v ? v.tile : -1; if (t >= 0) this.view.focus(t, 520); if (iss.layer !== 'none') { this.view.layer = iss.layer; this.view.refreshOverlay(); this.renderViewbar(); } }
    } else if (cmd === 'trial') { f.open = f.open === 'trial' && !f.trial ? null : 'trial'; if (iss) f.opts = trialOptions(s, iss); if (f.pick < 0) f.pick = f.opts.findIndex(o => o.actions); if (f.pick >= 0 && !f.trial) return this.issueAct(`pick|${key}|${f.pick}`); }
    else if (cmd === 'pick') {
      f.open = 'trial'; f.pick = Number(n); f.confirm = false; f.range = null; const o = f.opts[f.pick]; if (!o?.actions) { this.renderSide(); return; }
      f.busy = true; f.trial = null; const rev = g.rev;
      setTimeout(() => { if (this.ix !== f || g.rev !== rev) { f.busy = false; return; } f.trial = compareTrial(g.state, o.actions!, key); f.busy = false; this.renderSide(); }, 30);
    } else if (cmd === 'run') {
      const o = f.opts[f.pick]; if (!o?.actions || !f.trial?.ok) return;
      if (!f.confirm) { f.confirm = true; this.renderSide(); return; }
      let ok = 0, msg = ''; for (const a of o.actions) { const r = g.act(a, { issue: key }); if (r.ok) ok++; else msg = r.msg; }
      this.ix = { key, open: 'result', opts: [], pick: -1, trial: null, busy: false, confirm: false };
      this.toast(ok ? `実行しました：${o.label}。3・6・12 か月後に「④ 数か月後の結果」で予測と比べられます` : `実行できませんでした：${msg}`, !ok);
    } else if (cmd === 'range') { // v90：ループの対策の期待効果の幅（expectOf。重いので押したときだけ）
      const o = f.opts[f.pick]; if (!o?.range || f.range === 'busy') return; f.range = 'busy'; const rev = g.rev;
      setTimeout(() => { if (this.ix !== f || g.rev !== rev) return; try { f.range = o.range!(); } catch { f.range = []; } this.renderSide(); }, 30);
    } else if (cmd === 'result') f.open = f.open === 'result' ? null : 'result';
    this.renderSide();
  }
  /** v91：月が進んだら、開いている「② 対策を試算」の候補を今月の状態で作り直す（前は開いたときの候補・注意のまま残り、16 か月の容積の試算で水道の注意が出なかった） */
  private refreshIxOpts(): void {
    const f = this.ix; if (!f || f.open !== 'trial') return;
    const s = this.game.state, iss = allIssues(s).find(i => i.key === f.key) ?? loopEntryIssue(s, f.key);
    if (!iss) { this.ix = null; return; }
    const label = f.opts[f.pick]?.label; f.opts = trialOptions(s, iss); f.pick = label ? f.opts.findIndex(o => o.label === label) : -1;
  }
  /** 今月の街の課題（最大 3 件）。何が起きた／どこ／主因／対策の候補／地図へ。押しても道具や資料が開くだけで、建設や政策の変更は自動ではしない */
  private pIssues(): string {
    const list = monthlyIssues(this.s), all = allIssues(this.s);
    const tag = (i: Issue) => { const p = i.parts, t: string[] = []; if (p.deadline >= 0.5) t.push('期限が近い'); if (p.trend >= 0.4) t.push('悪化している'); if (p.hard >= 0.6) t.push('放置すると戻しにくい'); return t.map(x => `<em class="itag">${x}</em>`).join(''); };
    const card = (i: Issue, k: number) => `<div class="issue"><h3><b class="inum">${k + 1}</b>${esc(i.title)}${tag(i)}</h3>
      <dl><dt>何が</dt><dd>${esc(i.what)}</dd><dt>どこ</dt><dd>${esc(i.where)}${i.tile >= 0 || i.layer !== 'none' ? ` <button class="btn small" data-act="${i.tile >= 0 ? 'focus' : 'layer'}" data-arg="${i.tile >= 0 ? `${i.tile}:${i.layer}` : i.layer}">地図へ</button>` : ''}</dd><dt>主因</dt><dd>${esc(i.cause)}</dd>
      <dt>対策</dt><dd class="iopts">${i.options.map(o => `<span><button class="btn small" data-act="${o.act === 'loop' ? 'ix' : o.act}" data-arg="${o.act === 'loop' ? `trial|${esc(i.key)}` : o.arg}">${esc(o.label)}</button>${o.note ? `<small>${esc(o.note)}</small>` : ''}</span>`).join('')}</dd></dl>${this.game.draft ? '' : issueSteps(this.s, i, this.ix, k === firstK)}</div>`;
    // v90：はじめての人には 1 件を「まずこれ」と示す（案内が終わってから。施策をまだ課題から実行していない最初の 2 年）
    const s0 = this.s, firstK = s0.mode === 'term' && s0.tutorial.done && s0.month < 24 && !(s0.decisions ?? []).some(d => d.issue) && list.length ? Math.max(0, list.findIndex(i => i.key === 'care' || i.key === 'aging' || i.key.startsWith('cap:'))) : -1;
    return `<section class="needtop issues"><h2>今月の街の課題 <small>${list.length ? `${list.length} 件（重要な順${all.length > list.length ? `・候補 ${all.length} 件から` : ''}）` : '大きな課題はありません'}</small></h2>
      ${this.game.speed === 0 && !this.game.blocked ? '<p class="note">時間が止まっています。右上の ▶ で進みます（止めたまま準備しても構いません）。 <button class="btn small" data-act="issue" data-arg="go">時間を進める</button></p>' : ''}${list.length ? list.map(card).join('') : '<p class="note">いまは急いで手を打つ課題がありません。公約やビジョンを進めるか、街を広げる時期です。［声］で住民の様子を確かめられます。</p>'}
      ${this.loopTopicsHtml(list)}
      ${pastResults(this.s, new Set(list.map(i => i.key)))}
      <div class="btnrow"><button class="btn small" data-act="report" data-arg="year">📘 年次報告（今年度の施策と結果）</button></div>
      <p class="note">影響を受ける人の多さを基本に、悪化の傾向・期限の近さ・戻しにくさを足して並べています。対策のボタンは道具や資料を開くだけで、建設や政策の変更はあなたが決めます（②の試算も、③を押すまで街は変わりません）。</p></section>`;
  }
  /** v91：実在マップの「出典・取得日・実データと推計（ゲーム上の仮定）・役と権限の主体」を、概要の「街のいま」に文字で出す（前は見出しの小さなラベルと、押さないと出ない説明だけだった） */
  private realNote(): string {
    if (!REAL) return '';
    const ds = dataSource(), e = mapEntry(MAP_ID) ?? baseEntry(MAP_ID), pf = prefOf(), office = currentOffice();
    return `<p class="realsrc">📍 ${esc(e ? `${e.area}をもとにした街` : '実在の地図をもとにした街')}。<b>実データ</b>：${esc(DATA_REAL)}（出典：${esc(ds.credits || 'OpenStreetMap')}${ds.date ? `、取得日 ${esc(ds.date)}` : ''}）。<b>推計</b>：${esc(DATA_EST)}は<b>ゲーム上の仮定</b>で、実在の自治体の統計ではありません。<br>あなたの役：${esc(e?.role ?? office.role)}${REAL.deformed ? '（まちづくり版。市長として遊びます）' : ''}。警察は${esc(pf ? (pf === '東京都' ? '警視庁' : pf + '警察') : '都道府県警察')}、鉄道は鉄道事業者が決め、市は要望・協議します（施設を選ぶと「市の権限」に出ます）。</p>`;
  }
  /** v91：街の 3 つの論点（駅前・老朽インフラ・産業と暮らし）。上位 3 件に入口の課題がなくても、いつでも対策を比べられる */
  private loopTopicsHtml(list: Issue[]): string {
    const s = this.s; if (s.mode !== 'term' && s.mode !== 'sandbox') return '';
    let T: ReturnType<typeof loopTopics>; try { T = loopTopics(s); } catch { return ''; }
    const shown = new Set(list.map(i => i.loop).filter(Boolean)), open = this.ix?.key.startsWith('loop:') ? this.ix.key : '';
    const row = (t: ReturnType<typeof loopTopics>[number]) => { const iss = open === t.key ? loopEntryIssue(s, t.key) : undefined;
      return `<div class="ltopic"><h4>${esc(t.title)}${shown.has(t.id) ? '<em class="itag">上の課題にも</em>' : ''}</h4><p class="lsum">${esc(t.summary)}</p>
        ${iss && !this.game.draft ? issueSteps(s, iss, this.ix, false) : `<button class="btn small" data-act="ix" data-arg="trial|${t.key}">対策を比べる</button>`}</div>`; };
    return `<section class="ltopics"><h3>街の 3 つの論点 <small>課題の上位に出ていなくても、ここから対策を比べられます</small></h3>${T.map(row).join('')}</section>`;
  }
  private needs(): { name: string; r: number; text: string; btn?: [string, string, string] }[] {
    const s = this.s, st = s.stats, out: { name: string; r: number; text: string; btn?: [string, string, string] }[] = [];
    const R = (cap: number, dem: number) => (dem > 0 ? Math.min(1, cap / dem) : 1);
    const stopped = (f: string) => s.buildings.filter(b => isCity(b.kind) && fam(b.kind) === f && b.status === 'suspended' && b.age >= 99).length;
    const bld = (k: string): [string, string, string] => ['tool', 'build:' + k, '建てる'];
    const add = (name: string, r: number, text: string, f: string | null, btn?: [string, string, string]) => { const n = f ? stopped(f) : 0; out.push({ name, r, text: text + (n ? `・<b style="color:var(--bad)">使用停止 ${n} か所</b>` : ''), btn: n ? ['renewall', f!, `${n} か所を更新`] : btn }); };
    add('水道', R(st.waterCap, st.waterDemand * 1.05), `${n0(st.waterDemand)} / ${n0(st.waterCap)} 世帯`, 'water', bld('waterS'));
    add('下水', R(st.sewageCap, st.sewageDemand * 1.03), `${n0(st.sewageDemand)} / ${n0(st.sewageCap)} 世帯`, 'sewage', bld('sewageS'));
    add('電力', R(st.powerCap, st.powerDemand * 1.05), `${n0(st.powerDemand)} / ${n0(st.powerCap)} 世帯分`, 'power', bld('substation'));
    add('都市ガス', R(st.gasCap, st.gasDemand), `${n0(st.gasDemand)} / ${n0(st.gasCap)} 世帯`, null, bld('gas'));
    if (st.telDemand) add('通信', R(st.telCap ?? 1e9, st.telDemand), `${n0(st.telDemand)} / ${n0(st.telCap ?? 0)} 世帯相当`, null, bld('cellTower'));
    add('ごみ処理', R(st.wasteCap, st.wasteDemand), `${n0(st.wasteDemand)} / ${n0(st.wasteCap)} 世帯`, 'waste', bld('waste'));
    add('保育', R(st.careCap, st.careDemand), `待機 ${n0(st.waitlist)} 人（希望 ${n0(st.careDemand)}・受入 ${n0(st.careCap)} 人）`, 'care', bld(st.waitlist > 40 ? 'nursery' : 'nurseryS'));
    add('小学校', R(st.schoolCap, st.schoolKids), `${n0(st.schoolKids)} / ${n0(st.schoolCap)} 人`, 'school', bld('school'));
    add('中学校', R(st.jhsCap, st.jhsKids), `${n0(st.jhsKids)} / ${n0(st.jhsCap)} 人`, 'jhs', bld('jhs'));
    add('介護', R(st.elderCap, st.elderNeed), `介護が必要な高齢者 ${n0(st.elderNeed)} 人・施設の定員 ${n0(st.elderCap)} 人`, null, bld('elderly'));
    add('医療', st.lv[1] ?? 1, `水準 ${pct(st.lv[1] ?? 1)}`, 'health', bld(s.buildings.some(b => b.kind === 'hospital') ? 'nightClinic' : 'hospital'));
    add('治安', st.lv[2] ?? 1, `水準 ${pct(st.lv[2] ?? 1)}`, null, bld('koban'));
    add('消防', st.fireCover, `届く世帯 ${pct(st.fireCover)}`, 'fire', bld('fireS'));
    add('文化', st.lv[4] ?? 1, `水準 ${pct(st.lv[4] ?? 1)}`, 'library', bld('libraryS'));
    add('空気', st.lv[3] ?? 1, `水準 ${pct(st.lv[3] ?? 1)}`, null, bld('parkM'));
    const d = this.dev(), want = Math.max(10, Math.round(st.households / 80));
    add('住宅地', d.resD < 0.3 ? 1 : Math.min(1, d.stock / want), `空き区画 ${d.stock}・入れない世帯 ${st.pentUp.toFixed(1)}/月`, null, ['tool', 'devarea:1', '区画整理']);
    add('店', Math.min(1, st.shopLevel / 0.8), `市内の買物 ${pct(st.shopLevel)}`, null, ['tool', 'zone:4', '商業を指定']);
    add('職', Math.min(1, st.localJobs / Math.max(1, st.workers * 0.75)), `職 ${n0(st.localJobs)} / 働き手 ${n0(st.workers)} 人`, null, ['tool', 'zone:5', '業務を指定']);
    add('道路', Math.min(1, 1 / Math.max(0.01, st.maxVc)), `最大混雑率 ${pct(st.maxVc)}`, null, ['layer', 'traffic', '混雑を見る']);
    const allStop = s.buildings.filter(b => isCity(b.kind) && b.status === 'suspended' && b.age >= 99).length;
    if (allStop) out.push({ name: '施設の老朽化', r: 0.2, text: `<b style="color:var(--bad)">老朽化で使用停止 ${allStop} か所</b>（更新すると再開）`, btn: ['renewall', 'all', 'まとめて更新'] });
    return out.sort((a, b) => a.r - b.r);
  }
  /** 街の発展：人口の伸び、住宅・店・職の需要（シティーズ・スカイラインの需要メーターのようなもの） */
  private redevCache: { key: string; plan: ReturnType<typeof planRedevelop> } | null = null;
  /** 区画整理の案（道路・建物が変わったときだけ計算し直す） */
  private redevPlan(): ReturnType<typeof planRedevelop> {
    const s = this.s, key = s.roadVersion + ':' + s.bVersion + ':' + s.buildings.length;
    if (!this.redevCache || this.redevCache.key !== key) this.redevCache = { key, plan: REAL && !REAL.deformed ? null : planRedevelop(s, { maxBuy: 4, minGain: 8 }) };
    return this.redevCache.plan;
  }
  private dev(): { growth: number; pop0: number; resD: number; shopD: number; jobD: number; stock: number; shopStock: number; building: number; starts: number; advice: string; act: [string, string] | null } {
    const s = this.s, st = s.stats, h = s.history;
    const pop0 = h.length > 12 ? h[h.length - 13].pop : h[0]?.pop ?? st.pop;
    let stock = 0, shopStock = 0; for (let i = 0; i < W * H; i++) { if (s.occ[i] || s.road[i]) continue; if (s.zone[i] >= 1 && s.zone[i] <= 3) stock++; else if (s.zone[i] === 4) shopStock++; }
    const building = s.buildings.filter(b => isRes(b.kind) && b.status === 'construction').length;
    const starts = s.buildings.filter(b => isRes(b.kind) && b.builtMonth >= s.month - 1).length;
    const resD = Math.max(0, Math.min(1, st.pentUp / 12 + Math.max(0, 0.05 - st.vacancy) * 8));
    const shopD = Math.max(0, Math.min(1, (0.85 - st.shopLevel) / 0.6));
    const jobD = Math.max(0, Math.min(1, (st.workers / Math.max(1, st.localJobs) - 1.2) / 2));
    let advice = '', act: [string, string] | null = null;
    if (st.waterCap < st.waterDemand * 1.02 || st.sewageCap < st.sewageDemand || st.powerCap < st.powerDemand) { advice = '水道・下水・電力の余力がないため、新しい家が建ちません。まず施設を増やしてください。'; act = ['施設を建てる', 'group:build']; }
    else if (resD > 0.4 && stock < 6) { advice = `住みたい世帯（月 ${Math.round(st.pentUp)} 世帯）がいるのに、建てられる住宅地が ${stock} 区画しかありません。区画整理で住宅地をつくると人口が伸びます。`; act = ['区画整理で住宅地をつくる', 'tool:devarea:1']; }
    else if (resD > 0.4) { advice = `住宅地は ${stock} 区画あり、民間の着工を待っています（建設中 ${building} 棟）。`; }
    else if (shopD > 0.5 && shopStock < 2) { advice = '市内で買物できる店が足りません。住宅の近くの道路沿いを商業に指定してください。'; act = ['商業を指定する', 'tool:zone:4']; }
    else if (jobD > 0.5) { advice = '市内の職が少なく、多くの人が市外へ通っています。企業を誘致したり業務・工業の用途を指定すると税収が増え、職を求める世帯の転入も増えます。'; act = ['企業を誘致する', 'group:build']; }
    else advice = '住宅の需要は落ち着いています。人口を伸ばすなら、子育て世帯転入支援や知名度を上げる施設が効きます。';
    return { growth: st.pop - pop0, pop0, resD, shopD, jobD, stock, shopStock, building, starts, advice, act };
  }
  private meter(label: string, v: number, text?: string): string {
    return `<div class="meter"><span>${label}</span><div class="bar"><i class="${v >= 0.7 ? 'good' : v >= 0.55 ? 'warn' : 'bad'}" style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div><b>${text ?? pct(v)}</b></div>`;
  }
  private need(title: string, demand: number, cap: number, unit: string, note: string, layer = ''): string {
    const ok = cap >= demand, r = demand > 0 ? Math.min(1, cap / demand) : 1;
    return `<div class="need"><b>${title} <span class="tag ${cls(ok, r > 0.9)}">${ok ? '足りている' : r > 0.9 ? 'やや不足' : '不足'}</span></b><span class="v num">${n0(demand)} / ${n0(cap)} ${unit}</span><div class="cap"><i style="width:${Math.round(r * 100)}%;background:var(--${ok ? 'good' : r > 0.9 ? 'warn' : 'bad'})"></i></div><small>${note}${layer ? ` <button class="btn small" data-act="layer" data-arg="${layer}">地図で見る</button>` : ''}</small></div>`;
  }
  private pHome(): string {
    const s = this.s, st = s.stats, kept = pledgeStatus(s);
    const hist = s.history;
    const sp = (vals: number[], id: string, fmt: (v: number) => string) => chartSvg({ id, series: [{ name: id === 'hpop' ? '人口' : '満足度', color: 'var(--c1)', values: vals }], fmt, xLabel: i => dateStr(hist[Math.min(hist.length - 1, i)].month) }, 336, 96);
    const g = this.game, alog = g.autoLog.slice(-12).reverse();
    const o = s.mode === 'term' && s.goals.length ? electionOutlook(s) : null, d0 = this.dev();
    const quick = `<section class="quick"><h2>街のいま <small title="${esc(dataSource().note)}">${REAL ? '配置は実データ・数値は推計' : 'ゲーム上の仮定'}</small></h2><div class="qgrid">
      <div><small>人口</small><b>${n0(st.pop)}<i>人</i></b><em class="${d0.growth >= 0 ? 'up' : 'down'}">${d0.growth >= 0 ? '▲' : '▼'}${n0(Math.abs(d0.growth))}（1 年）</em></div>
      <div><small>暮らしの満足</small><b style="color:var(--${st.sat >= 0.7 ? 'good' : st.sat >= 0.6 ? 'warn' : 'bad'})">${Math.round(st.sat * 100)}<i>%</i></b></div>
      ${o ? `<div><small>再選の見込み</small><b style="color:var(--${o.win >= 0.6 ? 'good' : o.win >= 0.4 ? 'warn' : 'bad'})">${Math.round(o.win * 100)}<i>%</i></b><em>支持率 ${pct(s.approval)}</em></div>` : ''}
      <div><small>毎月の収支</small><b style="color:var(--${monthlyBudget(s).operating >= 0 ? 'good' : 'bad'})">${yen(monthlyBudget(s).operating, true)}</b></div></div>
      ${this.realNote()}
      <div class="btnrow"><button class="btn small" data-act="stats">📈 推移をグラフで見る</button><button class="btn small" data-act="people">👥 住民に会う</button></div>
      <p class="note">下の項目は、見出しを押すと開きます。</p></section>`;
    const body = `
    ${s.plan ? (() => { const pt = planText(s); return `<section><h2>都市計画 <small>${g.auto ? 'オートの市長' : '前回のオート'}・${Math.floor(s.plan.made / 12) + 1} 年目に策定</small></h2>${pt.vision ? `<p><b>ビジョン</b>：${esc(pt.vision)}</p>` : ''}<table class="t">${pt.districts.map(d => `<tr><td><span class="sw" style="background:${d.color}"></span>${esc(d.name)}</td><td><b>${esc(d.role)}</b><br><small>${esc(d.motto)}</small></td></tr>`).join('')}</table><p class="note">オートは、この計画に沿って用途を決め、迷惑施設は産業の地区（住宅から離れた所）に、寺社や城・ランドマークは観光の地区に置きます。10 年ごとに見直します。</p></section>`; })() : ''}
    ${1 ? `<section><h2>オートプレイ <small>${g.auto ? 'CPU が運営中' : '停止中'}</small></h2><div class="btnrow"><button class="btn small ${g.auto ? '' : 'primary'}" data-act="auto">${g.auto ? '手動に戻す' : 'オートを再開'}</button></div></section><section><h2>オートへの作戦 <small>${AUTO_ORDERS[s.autoOrder ?? 1].short}</small></h2><div class="btnrow">${AUTO_ORDERS.map((o, k) => `<button class="btn small ${(s.autoOrder ?? 1) === k ? 'primary' : ''}" title="${o.note}" data-act="aorder" data-arg="${k}" aria-pressed="${(s.autoOrder ?? 1) === k}">${o.icon} ${o.name}</button>`).join('')}</div><p class="note">${AUTO_ORDERS[s.autoOrder ?? 1].note}。</p>${alog.length ? `<table class="t"><tr><th>月</th><th>判断</th></tr>${alog.map(n => `<tr><td class="num">${dateStr(n.month)}</td><td>${esc(n.text)}</td></tr>`).join('')}</table>` : '<p class="note">まだ判断はありません。</p>'}<p class="note">CPU は、足りないもの（水道・保育・学校・渋滞・住宅・医療など）を順に埋め、赤字が続けば政策や税を見直します。いつでも手で操作でき、［オート］をもう一度押すと手動に戻ります。</p></section>` : ''}
    ${(() => { const d = this.dev(), bar = (n: string, v: number, c: string) => `<div class="dbar"><span>${n}</span><div><i style="height:${Math.round(v * 100)}%;background:${c}"></i></div></div>`; return `<section><h2>街の発展 <small>人口 前年比 ${d.growth >= 0 ? '+' : '−'}${n0(Math.abs(d.growth))} 人（${d.pop0 ? (d.growth / d.pop0 * 100).toFixed(1) : '0'}%）</small></h2>
      <div class="devwrap"><div class="dbars">${bar('住宅', d.resD, '#58b368')}${bar('商業', d.shopD, '#3f9bd1')}${bar('職', d.jobD, '#e8a33a')}</div>
      <div class="rows" style="flex:1"><span>住みたいのに入れない世帯</span><b>${st.pentUp.toFixed(1)}<i>世帯/月</i></b><span>空き住戸</span><b>${(st.vacancy * 100).toFixed(1)}<i>%</i></b><span>住宅地の空き区画（未着工）</span><b>${d.stock}<i>区画</i></b><span>建設中の住宅</span><b>${d.building}<i>棟</i></b><span>商業の空き区画</span><b>${d.shopStock}<i>区画</i></b><span title="市内の職が働き手の 55% を超えると、働く世帯の転入希望が増えます（最大 2.35 倍）">職の引力（転入希望）</span><b>×${(1 + 0.9 * Math.max(0, Math.min(1.5, (st.localJobs - 0.55 * st.workers) / Math.max(1, st.workers)))).toFixed(2)}</b></div></div>
      <p class="note">${d.advice}</p>${d.act ? `<div class="btnrow"><button class="btn small primary" data-act="${d.act[1].startsWith('group') ? 'group' : 'tool'}" data-arg="${d.act[1].replace(/^(group|tool):/, '')}">${d.act[0]}</button></div>` : ''}${(() => { const rp = this.redevPlan(); return rp ? `<p class="note">住宅の裏などに、道路に面していない空き地があります。区画整理で生活道路を ${rp.road.length} 区間通すと ${rp.gain} 区画が使えるようになります${rp.buy.length ? `（入口をふさぐ住宅 ${rp.buy.length} 軒を買い取り）` : ''}。</p><div class="btnrow"><button class="btn small" data-act="redevshow">場所を見る</button><button class="btn small primary" data-act="redevelop">区画整理する（${yenT(rp.cost)}）</button></div>` : ''; })()}</section>`; })()}
    ${s.mode === 'term' && s.goals.length ? (() => { const o = electionOutlook(s); return `<section><h2>公約と再選の見込み <small><button class="btn small" data-act="tab" data-arg="term">任期の詳細</button></small></h2>
      <div class="rows"><span>いま選挙なら当選する確率</span><b style="color:var(--${o.win >= 0.6 ? 'good' : o.win >= 0.4 ? 'warn' : 'bad'})">${Math.round(o.win * 100)}<i>%</i></b><span>支持率</span><b>${pct(s.approval)}</b></div>
      ${s.goals.map((g, i) => { const def = GOALS.find(o => o.id === g.id)!, pr = goalProgress(s, g); return `<div class="pledge"><span class="tag ${kept[i] ? 'good' : 'warn'}">${kept[i] ? '達成中' : Math.round(pr.p * 100) + '%'}</span><span>${def.desc(g.target)}</span></div>`; }).join('')}</section>`; })() : ''}
    <section><h2>人口と世帯 <small>推計</small></h2>
      <div class="rows"><span>人口</span><b>${n0(st.pop)}<i>人</i></b><span>世帯 / 住戸</span><b>${n0(st.households)} / ${n0(st.units)}<i>戸</i></b><span>空き住戸</span><b>${(st.vacancy * 100).toFixed(1)}<i>%</i></b><span>入居できない転入希望</span><b>${st.pentUp.toFixed(1)}<i>世帯/月</i></b></div>
      ${hist.length > 2 ? `<div class="chartbox"><h4>人口の推移 <small>人</small></h4>${sp(hist.map(h => h.pop), 'hpop', v => n0(v))}</div>` : ''}
      <table class="t"><tr><th>世帯類型</th><th>世帯</th><th>満足度</th></tr>${HH_NAMES.map((n, t) => `<tr><td>${n}</td><td>${n0(st.hhByType[t])}</td><td>${pct(st.satType[t])}</td></tr>`).join('')}</table>
      <p class="note">住民は建物ごとの世帯類型別の集計で計算しています。画面を歩く人や車は演出で、人数は人口と一致しません。</p></section>
    ${s.climate ? (() => { const c = s.climate!, cm = (s.month % 12 + 3) % 12, sf = c.store >= 0.4 ? 1 : 0.55 + c.store * 1.125; return `<section><h2>天気と暮らし <small>${cm + 1} 月</small></h2>
      <div class="rows"><span>今月の雨</span><b>${n0(c.rain)}<i>mm（平年の ${Math.round(c.ratio * 100)}%）</i></b><span>水がめの貯水率</span><b style="color:var(--${c.store < 0.2 ? 'bad' : c.store < 0.4 ? 'warn' : 'good'})">${pct(c.store)}</b>
        <span>水道</span><b style="color:var(--${sf < 0.8 ? 'bad' : sf < 1 ? 'warn' : 'good'})">${sf >= 1 ? 'ふつう' : sf < 0.75 ? '断水に近い' : '給水制限'}</b><span>作柄</span><b style="color:var(--${c.crop < 0.6 ? 'bad' : c.crop < 0.85 ? 'warn' : 'good'})">${c.crop >= 0.97 ? '平年並み' : pct(c.crop)}</b>
        <span>大雪</span><b>${c.snow ? '大雪（道路の流れ 2 割減・除雪費）' : 'なし'}</b><span>ダム</span><b>${s.buildings.filter(b => b.kind === 'dam' && b.status === 'operating').length} か所</b></div>
      <p class="note">雨が少ない月が続くと水がめが減り、4 割を切ると給水制限（浄水場が送れる水が減る）になります。雨が多すぎる月や台風は、作柄を下げ、浸水を起こします。ダムは水を蓄えて給水制限と洪水を減らし、水路（放水路）や雨水調整池は浸水を減らします。</p></section>`; })() : ''}
    <section><h2>人の一生と社会の問題 <small>この 1 か月</small></h2>
      <div class="rows"><span>生まれた子ども</span><b>${n0(st.births ?? 0)}<i>人</i></b><span>亡くなった人</span><b>${n0(st.deaths ?? 0)}<i>人</i></b>
        <span>斎場で見送れる数</span><b style="color:var(--${(st.cremShort ?? 0) > 0.2 ? 'bad' : 'good'})">${n0(st.cremCap ?? 0)}<i>件/月</i></b><span>隣の市に頼んだ火葬</span><b>${n0(Math.max(0, (st.deaths ?? 0) - (st.cremCap ?? 0)))}<i>件</i></b>
        <span>治療が必要な人</span><b style="color:var(--${(st.sick ?? 0) > st.pop * 0.03 ? 'warn' : 'good'})">${n0(st.sick ?? 0)}<i>人</i></b><span>高齢化率</span><b>${pct(st.aging ?? 0)}</b>
        <span>見守りが届かない高齢者</span><b>${n0(st.lonely ?? 0)}<i>世帯</i></b><span>迷惑施設の近くの世帯</span><b style="color:var(--${(st.nimbyHH ?? 0) > 200 ? 'bad' : (st.nimbyHH ?? 0) > 40 ? 'warn' : 'good'})">${n0(st.nimbyHH ?? 0)}<i>世帯</i></b></div>
      <p class="note">医療（病院・診療所）が届かない地区ほど、病人と亡くなる人が増えます。亡くなった人は斎場（火葬場）で見送ります。足りない分は隣の市に頼むので費用がかかり、福祉の満足が下がります。ごみ処理場・工場・空港・火葬場・発電所・刑務所などが近い住宅は、空気と暮らしの満足が下がります。</p></section>
    ${this.pEcon()}
    <section><h2>施設の過不足 <small>需要 / 実効容量</small></h2>
      ${this.need('保育', st.careDemand, st.careCap, '人', `待機 ${n0(st.waitlist)} 人。未就学児 ${n0(st.preschool)} 人の ${pct(P.careUseRate)} が利用を希望`, 'care')}
      ${this.need('小学校', st.schoolKids, st.schoolCap, '人', st.schoolKids > st.schoolCap ? '定員を超えると過密になり、子育て（就学）世帯の満足が下がります' : '通学圏は道路で 1.5km')}
      ${this.need('水道', st.waterDemand, st.waterCap, '世帯', st.waterCap < st.waterDemand * 1.02 ? '余力がなく、新しい住宅が着工できません' : '余力がなくなると住宅の着工が止まります', 'age')}
      ${this.need('下水処理', st.sewageDemand, st.sewageCap, '世帯', st.sewageCap < st.sewageDemand ? '処理しきれず川が汚れ、新しい住宅が着工できません' : '下水処理場の能力（市外の流域下水道への接続分を含む）')}
      ${this.need('電力', st.powerDemand, st.powerCap, '世帯分', st.powerCap < st.powerDemand * 1.05 ? '余裕がなく、新しい住宅や企業が来られません。変電所の増設を要望するか発電所を' : '市外からの供給と市内の発電の合計')}
      ${this.need('都市ガス', st.gasDemand, st.gasCap, '世帯', st.gasCap < st.gasDemand ? '届かない世帯はプロパンになり、住居費が上がります' : 'ガス会社の供給能力')}
      ${st.telDemand ? this.need('通信（携帯・光回線）', st.telDemand, st.telCap ?? 0, '世帯相当', (st.telCap ?? 0) < st.telDemand ? '夜に混み合って、在宅勤務と IT 企業が困っています。基地局か通信ビルを' : '使う量は年 3% ずつ増えます') : ''}
      ${this.need('ごみ処理', st.wasteDemand, st.wasteCap, '世帯', '収集・処理の能力')}
      ${this.need('中学校', st.jhsKids, st.jhsCap, '人', st.jhsCap < st.jhsKids ? '入れない生徒は遠くの学校へ通います' : '通学圏は道路で 2.1km')}
      ${this.need('高齢者の介護', st.elderNeed, st.elderCap, '人', '特別養護老人ホームの定員')}
      ${this.meter('消防の到達', st.fireCover)}
      ${this.meter('市内での買物', st.shopLevel / 0.85, pct(st.shopLevel))}</section>
    <section><h2>暮らしの観点 <small>世帯で重みづけた水準</small></h2>
      ${(['ライフライン', '医療', '治安', '環境（空気）', '文化・スポーツ', '福祉', '教育', '防災'] as const).map((n, k) => this.meter(n, st.lv[k] ?? 0)).join('')}
      <div class="btnrow"><button class="btn small" data-act="layer" data-arg="sat">満足度を地図で見る</button><button class="btn small" data-act="layer" data-arg="env">空気を見る</button><button class="btn small" data-act="layer" data-arg="disaster">防災を見る</button></div>
      <div class="rows"><span>知名度</span><b>${n0(s.fame)}<i>/100</i></b><span>来訪者</span><b>${n0(st.visitors)}<i>人/月</i></b><span>企業の職</span><b>${n0(st.bizJobs)}<i>人</i></b><span>避難所・備蓄</span><b>${n0(st.shelterCap)}<i>人分</i></b><span>浸水のおそれがある世帯</span><b>${n0(st.floodHH)}<i>世帯</i></b>${hasSea(s) ? (() => { const dp = tsunamiDepth(s, designWave(s)); let hh = 0; for (const b of s.buildings) if (isRes(b.kind) && dp[idx(b.x, b.y)] > 0.05) hh += sumHH(b); return `<span>津波（想定 ${designWave(s)}m）で浸水する世帯</span><b style="color:var(--${hh > 0 ? 'warn' : 'good'})">${n0(hh)}<i>世帯</i></b>`; })() : ''}</div></section>
    <section><h2>交通 <small>朝の通勤時間帯</small></h2>
      <div class="rows"><span>市道の最大混雑率</span><b>${pct(st.maxVc)}</b><span>通勤の所要時間（空いているとき比）</span><b>${st.avgDelay.toFixed(2)}<i>倍</i></b><span>就業者 / 市内の職</span><b>${n0(st.workers)} / ${n0(st.localJobs)}<i>人</i></b></div>
      <div class="btnrow"><button class="btn small" data-act="layer" data-arg="traffic">混雑を地図で見る</button><button class="btn small" data-act="layer" data-arg="conn">道路接続を見る</button></div></section>
    <section><h2>満足度 <small>地区別</small></h2>
      ${DISTRICTS.map((n, d) => (st.popDistrict[d] > 1 ? this.meter(`${n} <small class="num">${n0(st.popDistrict[d])}人</small>`, st.satDistrict[d]) : `<div class="meter"><span>${n}</span><span class="note">まだ住民がいません</span><b></b></div>`)).join('')}
      ${hist.length > 2 ? `<div class="chartbox"><h4>満足度の推移 <small>%</small></h4>${sp(hist.map(h => h.sat * 100), 'hsat', v => v.toFixed(0))}</div>` : ''}</section>`;
    return this.pEngage() + this.pMissions() + `    ${this.pIssues()}${(() => { const list = this.needs(), bad = list.filter(n => n.r < 0.97); return bad.length ? this.fold('needs-more', `<section><h2>施設・サービスの過不足 <small>${bad.length} 件（足りない順）</small></h2><div class="needs">${bad.map(n => `<div class="nrow"><span class="nn">${n.name}</span><div class="nb"><i style="width:${Math.round(n.r * 100)}%;background:var(--${n.r >= 0.97 ? 'good' : n.r >= 0.85 ? 'warn' : 'bad'})"></i></div><small>${n.text}</small>${n.btn && n.r < 0.97 ? `<button class="btn small" data-act="${n.btn[0]}" data-arg="${n.btn[1]}">${n.btn[2]}</button>` : ''}</div>`).join('')}</div></section>`, 'sub') : ''; })()}` + quick + this.foldAll(body, ['都市計画', '街の発展', '公約と再選', '人口と世帯', '天気と暮らし', '人の一生', '経済・財政', '施設の過不足', '暮らしの観点', '交通', '満足度']);
  }
  /** 任期：公約・ビジョン・支持率・再選の見込み・市長の取り組み・隣の市町 */
  /** 施設の成長：レベル（増築・増設の補助）・改修オプション・外観・移設 */
  private growthHtml(b: Building): string {
    const s = this.s, d = DEFS[b.kind], mx = maxLv(b.kind);
    if (!mx && !optionsFor(b.kind).length) return '';
    const lv = lvOf(b), stars = mx ? `<span class="stars">${'★'.repeat(lv)}${'☆'.repeat(mx - lv)}</span>` : '';
    let h = `<div class="growth"><h4>施設を育てる ${stars}${lv > 1 ? ` <small>${stageName(b.kind, lv)}</small>` : ''}</h4>`;
    if (mx && lv < mx) {
      if (d.build === 'invite') { const c = expandCost(s, b); h += `<div class="btnrow"><button class="btn primary" data-act="expand" data-arg="${b.id}" ${b.status !== 'operating' || s.cash < c ? 'disabled' : ''}>増設を補助してレベル ${lv + 1}「${stageName(b.kind, lv + 1)}」に（${yenT(c)}）</button></div><p class="note">企業の増設に市が補助を出します（6 か月）。雇用と税が 2 割ずつ増えます。景気がよいと、企業が自分で増設することもあります。</p>`; }
      else { const c = upgradeCost(b, s), why = upgradeBlock(s, b); h += `<div class="btnrow"><button class="btn primary" data-act="upgrade" data-arg="${b.id}" ${why || s.cash < c ? 'disabled' : ''}>増築してレベル ${lv + 1}「${stageName(b.kind, lv + 1)}」に（${yenT(c)}）</button></div><p class="note">${why ? `<b>${why}</b>。` : ''}${d.capacity > 1 ? `定員・処理能力が ${Math.round(LV_CAP[lv] * 100)}% に、` : `来訪者・使用料・雇用などの効果が ${Math.round((1 + 0.2 * lv) * 100)}% に、`}利用圏も少し広がります。維持費と職員も増えます。レベル 4 は市長レベル 3、レベル 5 は市長レベル 5 から。</p>`; }
    } else if (mx) h += `<p class="note">最高レベルです。</p>`;
    const ops = optionsFor(b.kind);
    if (ops.length) {
      const cur = b.opts ?? [], slots = optSlots(b);
      h += `<h4>改修メニュー <small>${cur.length} / ${slots}（レベル 4 で 3 つ）</small></h4><div class="opts">${ops.map(o => { const on = cur.includes(o.id), c = optCost(b, o);
        return `<div class="opt2 ${on ? 'on' : ''}"><b>${o.name}${o.id === 'naming' && on ? `<small>「${sponsorOf(b)}${d.name}」</small>` : ''}</b><small>${o.desc}${o.income ? `・収入 月 ${o.income} 万円` : ''}${o.upkeep ? `・維持費 月 ${o.upkeep} 万円` : ''}</small>
          <button class="btn small ${on ? '' : 'primary'}" data-act="opt" data-arg="${b.id}:${o.id}:${on ? 0 : 1}" ${!on && (cur.length >= slots || b.status !== 'operating' || s.cash < c) ? 'disabled' : ''}>${on ? 'やめる' : c ? `付ける（${yenT(c)}）` : '付ける'}</button></div>`; }).join('')}</div>`;
    }
    if (!isRes(b.kind) && !isShop(b.kind) && d.build !== 'none') h += `<h4>外観 <small>${STYLES[b.style ?? 0]}</small></h4><div class="btnrow">${STYLES.map((n, k) => `<button class="seg" data-act="style" data-arg="${b.id}:${k}" aria-pressed="${(b.style ?? 0) === k}">${n.replace(/（.*）/, '')}</button>`).join('')}</div><p class="note">外観を変えるのは ${yenT(STYLE_COST)}。見た目だけですが、街並みに気を配ると暮らしの満足がほんの少し上がります。</p>`;
    if (isCity(b.kind) && b.status === 'operating' && !REAL) h += `<div class="btnrow"><button class="btn" data-act="movestart" data-arg="${b.id}">別の場所へ移設する（${yenT(moveCost(s, b))}）</button></div>`;
    return h + '</div>';
  }
  /** 記念カード：いまの景色に、街の名前・年・市長レベル・人口・順位・勲章を重ねた 1200×630 の画像 */
  async makeCard(): Promise<string> {
    const s = this.game.state, src = this.view.capture(), img = new Image();
    await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); img.src = src; });
    const W2 = 1200, H2 = 630, cv = document.createElement('canvas'); cv.width = W2; cv.height = H2; const x = cv.getContext('2d')!;
    if (img.width) { const k = Math.max(W2 / img.width, H2 / img.height), w = img.width * k, h = img.height * k; x.drawImage(img, (W2 - w) / 2, (H2 - h) / 2, w, h); } else { x.fillStyle = '#1d3557'; x.fillRect(0, 0, W2, H2); }
    const gr = x.createLinearGradient(0, H2 * 0.35, 0, H2); gr.addColorStop(0, 'rgba(10,20,40,0)'); gr.addColorStop(1, 'rgba(10,20,40,0.88)'); x.fillStyle = gr; x.fillRect(0, 0, W2, H2);
    const F = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif', M = s.mayor, lv = M ? levelOf(M.pts) : 1, rk = M?.ranks.at(-1);
    x.fillStyle = '#fff'; x.font = `700 64px ${F}`; x.fillText(s.cityName ?? 'スムシティ', 48, H2 - 170);
    x.font = `500 28px ${F}`; x.fillText(`${dateStr(s.month)}・市長 Lv${lv}「${LEVELS[lv - 1].title}」`, 50, H2 - 122);
    const items: [string, string][] = [['人口', `${n0(s.stats.pop)} 人`], ['暮らしの満足', `${Math.round(s.stats.sat * 100)}%`], ['全国ランキング', rk ? `${n0(rk.total)} 位` : '—'], ['勲章', `${M ? Object.keys(M.medals).length : 0} 個`]];
    items.forEach(([k, v], i) => { const X = 50 + i * 280; x.font = `500 20px ${F}`; x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillText(k, X, H2 - 72); x.font = `700 36px ${F}`; x.fillStyle = '#ffd86a'; x.fillText(v, X, H2 - 30); });
    x.font = `700 22px ${F}`; x.fillStyle = 'rgba(255,255,255,0.85)'; x.textAlign = 'right'; x.fillText('スムシティ', W2 - 36, 46);
    if (s.challenge?.done === 'win') { x.fillStyle = '#ffd86a'; x.fillText(`🏆 挑戦「${CH[s.challenge.id]?.name ?? ''}」達成`, W2 - 36, 80); }
    return cv.toDataURL('image/png');
  }
  doUndo(): void { const r = this.game.undo(); this.toast(r.msg, !r.ok); if (r.ok) { this.sel = null; this.view.setGhost(null); this.view.setCursor([]); this.refresh(); this.view.refreshOverlay(); } }
  /** 市政：議会と予算・選挙戦・メディア・国や県・季節の行事・人口動態 */
  /** 治安の脅威（公安・警察の情報）：暴力団・闇の組織・カルト・過激派・右翼団体・テロ・地域の宗教団体 */
  pThreats(): string {
    const T = (this.s.econ as any)?.threat; if (!T) return '';
    const rows = THREATS.map(t => { const v = T[t.id] ?? 0, c = !t.bad ? 'ink' : v > 0.35 ? 'bad' : v > 0.18 ? 'warn' : 'good', w = v > 0.35 ? '強い' : v > 0.18 ? 'ふつう' : '弱い';
      return `<div class="thr" title="${t.why}"><div style="display:flex;justify-content:space-between;gap:8px"><span>${t.name}</span><b style="color:var(--${c})">${w}</b></div><div class="bar"><i style="width:${Math.round(v * 100)}%;background:var(--${c === 'ink' ? 'sign-blue' : c})"></i></div><p class="note" style="margin:2px 0 8px">${t.why}</p></div>`; }).join('');
    return this.fold('threat', `<section><h2>🕵 治安の脅威 <small>公安・警察の情報</small></h2>${rows}<p class="note">強いほど治安が悪くなり、事件が起きやすくなります。［政策］のテロ対策・公安との情報共有・消費生活センター・見守りネットワーク・客引き防止条例で弱められます。</p></section>`, 'sub');
  }
  private pCity(): string {
    const s = this.s, p = s.pol; if (!p) return '<p class="note">時間を 1 か月進めると、議会や市政の情報が出ます。</p>';
    const cm = calMonth(s.month), tot = p.seats.reduce((a, b) => a + b, 0), fc = voteForecast(s, p.plan), ys = fc.yes.reduce((a, b) => a + b, 0);
    const toMarch = (3 - cm + 12) % 12 || 12;
    let h = '';
    if (p.pet) h += `<section class="pet"><h2>📮 陳情 <small>${dateStr(p.pet.m)}・あと ${Math.max(0, 3 - (s.month - p.pet.m))} か月で無回答に</small></h2><p><b>${esc(p.pet.who)}</b>から「${esc(p.pet.ask)}」</p><div class="btnrow"><button class="btn small primary" data-act="pol" data-arg="pet:yes">応える（${yenT(p.pet.cost)}）</button><button class="btn small" data-act="pol" data-arg="pet:no">断る</button></div></section>`;
    { const cur = STYLES_M.find(x => x.id === p.mstyle), can = !p.mstyle || s.month - s.termStart < 6;
      h += `<section><h2>🎭 市長のタイプ <small>${cur ? cur.name : 'まだ決めていません'}</small></h2><div class="plans">${STYLES_M.map(d => `<button class="plan ${p.mstyle === d.id ? 'on' : ''}" data-act="pol" data-arg="mstyle:${d.id}" ${can || p.mstyle === d.id ? '' : 'disabled'}><b>${d.name}</b><small>得意：${d.good}</small><small>苦手：${d.bad}</small></button>`).join('')}</div><p class="note">タイプは任期のはじめ（6 か月まで）に変えられます。</p></section>`; }
    if (p.rec) { const r = p.rec, pl = REC_PLANS.find(x => x.id === r.plan);
      h += `<section class="rec"><h2>🏗 災害からの復興 <small>${dateStr(r.m)}の被害・避難 約 ${n0(r.lost)} 世帯${r.gekijin ? '・激甚災害' : ''}</small></h2>
        ${pl ? `<p>計画「<b>${pl.name}</b>」で進めています。</p><div class="bar big"><i style="width:${Math.round(Math.min(1, (s.month - (r.until! - pl.months)) / pl.months) * 100)}%"></i></div><p class="note">完了まで ${Math.max(0, r.until! - s.month)} か月。仮設住宅は、復興が終わると片づきます。</p>`
        : `<p class="note">避難した人の多くは、復興の見通しが立てば戻ってきます。進め方を選んでください（1 年決めないと、自然に戻るのを待つことになります）。</p><div class="plans">${REC_PLANS.map(d => `<button class="plan" data-act="pol" data-arg="recover:${d.id}"><b>${d.name}</b><small>${d.desc}</small><small class="vf">${n0(Math.round(d.cost * (r.gekijin ? 0.5 : 1)))} 万円・${d.months} か月</small></button>`).join('')}</div>`}</section>`; }
    h += `<section><h2>🏛 市議会と予算 <small>定数 ${tot}・3 月議会まで ${toMarch} か月</small></h2>
      <div class="seats">${p.seats.map((n, k) => `<i style="flex:${n};background:${FACTIONS[k].color}" title="${FACTIONS[k].name} ${n} 人"></i>`).join('')}<b style="left:50%"></b></div>
      <table class="t"><tr><th>会派</th><th>議席</th><th>関係</th><th>賛成見込み</th><th></th></tr>${FACTIONS.map((f, k) => { const wait = s.month - p.lobby[k] < 3; return `<tr><td><span class="dotc" style="background:${f.color}"></span>${f.short}<br><small>${f.name}</small></td><td class="num">${p.seats[k]}</td><td class="num">${Math.round(p.rel[k] * 100)}</td><td class="num">${fc.yes[k]}</td><td><button class="btn small" data-act="pol" data-arg="lobby::${k}" ${wait ? 'disabled' : ''} title="${f.desc}">意見交換<br><small>${LOBBY_COST} 万円</small></button></td></tr>`; }).join('')}</table>
      <p>次の予算案の賛成見込み：<b style="color:var(--${ys >= fc.need + 2 ? 'good' : ys >= fc.need ? 'warn' : 'bad'})">${ys} / ${tot}</b>（可決に ${fc.need}）${p.prov !== undefined ? `　<b style="color:var(--bad)">暫定予算中（${p.prov - s.month} か月後に再採決）</b>` : ''}</p>
      <div class="plans">${PLANS.map(d => { const f = voteForecast(s, d.id), y = f.yes.reduce((a, b) => a + b, 0); return `<button class="plan ${p.plan === d.id ? 'on' : ''}" data-act="pol" data-arg="plan:${d.id}"><b>${d.name}</b><small>${d.desc}</small><small class="vf" style="color:var(--${y >= f.need + 2 ? 'good' : y >= f.need ? 'warn' : 'bad'})">賛成見込み ${y}/${f.total}</small></button>`; }).join('')}</div>
      ${p.vote ? `<p class="note">前回の採決（${dateStr(p.vote.m)}）：「${PLANS.find(x => x.id === p.vote!.plan)?.name}」は${p.vote.pass ? '<b style="color:var(--good)">可決</b>' : '<b style="color:var(--bad)">否決</b>'}（${p.vote.yes.map((v, k) => `${FACTIONS[k].short} ${v}`).join('・')}）</p>` : ''}
      <p class="note">毎年 3 月の議会で、新年度の予算を採決します。賛成は、支持率・会派との関係・予算の中身で決まります。否決されると 3 か月は暫定予算になり、支持率が下がります。市議会議員の選挙は市長の任期の 2 年目にあり、支持率が高いと与党が伸びます。</p></section>`;
    // 鉄道と街づくり
    { const ss = stationStats(s), r = (p as any).rail ?? { freq: 0 }, tot = ss.reduce((a, x) => a + x.riders, 0);
      h += `<section><h2>🚃 鉄道と街づくり <small>駅 ${ss.length}・1 日 ${n0(tot)} 人が乗り降り</small></h2>
        ${ss.length ? `<table class="t"><tr><th>駅</th><th>乗降客数</th><th>駅勢圏</th><th>朝の混雑率</th></tr>${ss.map(x => `<tr><td>${esc(x.name)}</td><td class="num">${n0(x.riders)}<i>人/日</i></td><td><small>${n0(x.hh)} 世帯・職 ${n0(x.jobs)}</small></td><td class="num" style="color:var(--${x.crowd > 180 ? 'bad' : x.crowd > 140 ? 'warn' : 'good'})">${x.crowd}%</td></tr>`).join('')}</table>` : '<p class="note">駅がありません。［施設を建てる］の交通から駅を置けます。</p>'}
        <div class="rows"><span>車両基地</span><b>${hasOp(s, 'railDepot') ? 'あり（本数 2 割増）' : 'なし'}</b><span>新幹線</span><b>${s.buildings.some(b => b.kind === 'station' && b.shin !== undefined && s.month >= b.shin) ? '停車' : 'なし'}</b><span>リニア</span><b>${hasOp(s, 'maglevStation') ? '駅あり' : 'なし'}</b><span>地下鉄の新線</span><b>${r.subway ? (r.subway.done ? '開業' : `工事中（あと ${Math.max(0, 60 - (s.month - r.subway.start))} か月）`) : 'なし'}</b></div>
        <p>運行本数：<select data-act="railfreq">${FREQS.map((f, i) => `<option value="${i}" ${i === r.freq ? 'selected' : ''}>${f}</option>`).join('')}</select></p>
        <div class="btnrow"><button class="btn small ${r.tod ? 'primary' : ''}" data-act="pol" data-arg="tod">${r.tod ? '✅ ' : ''}駅を中心にした街づくり（TOD）</button><button class="btn small" data-act="pol" data-arg="homedoor" ${r.door ? 'disabled' : ''}>${r.door ? 'ホームドア設置済み' : `ホームドア（${yenT(DOOR_COST)}）`}</button><button class="btn small" data-act="pol" data-arg="subway" ${r.subway || s.stats.pop < 70000 ? 'disabled' : ''}>🚇 地下鉄の新線（${yenT(SUBWAY_COST / 2)}・人口 7 万人から）</button></div>
        <p class="note">駅から 800m（駅勢圏）に住む人と働く人が電車を使います。駅に近いほど地価が上がり、TOD で駅前に住む人が増えます。混雑率が 180% を超えると満員電車の不満が出ます。増発・車両基地・複線で解消できます。乗る人が多い駅のまわりでは、鉄道会社が沿線の住宅開発をすることもあります。地上の線路を高架や地下にすると踏切がなくなります（［道路を引く］の線路）。</p></section>`; }
    // 国際大会・万博の誘致
    { const bs = (p as any).bids ?? {};
      h += `<section><h2>🏟 国際大会・万博の誘致 <small>選ばれる見込み ${Math.round(bidChance(s) * 100)}%</small></h2><div class="plans">${BIDS.map(d => { const b = bs[d.id], why = d.need(s), st = !b ? '' : b.stage === 'bid' ? `選考中（あと ${Math.max(0, 12 - (s.month - b.m))} か月）` : b.stage === 'won' ? `開催決定・あと ${Math.max(0, (b.host ?? 0) - s.month)} か月${d.venue(s) ? `（${d.venue(s)}が必要）` : '（準備よし）'}` : b.stage === 'held' ? '開催済み' : '落選・辞退';
        return `<div class="plan ${b?.stage === 'won' || b?.stage === 'held' ? 'on' : ''}"><b>${d.name}</b><small>${d.desc}</small>${st ? `<small class="vf">${st}</small>` : ''}${why ? `<small style="color:var(--warn)">${why}</small>` : ''}<button class="btn small" data-act="pol" data-arg="bid:${d.id}" ${why || (b && b.stage !== 'lost') ? 'disabled' : ''}>立候補（${yenT(d.cost)}）</button></div>`; }).join('')}</div></section>`; }
    { const st = (p as any).stars as { name: string; job: string; m: number }[] | undefined; if (st?.length) h += `<section><h2>🌟 移り住んだ有名人 <small>${st.length} 人（架空の人物）</small></h2><ul class="chron">${st.map(x => `<li><i>${dateStr(x.m)}</i>${esc(x.job)}の${esc(x.name)}さん</li>`).join('')}</ul></section>`; }
    // 人事
    { const ex = execOf(s);
      h += `<section><h2>🧑‍💼 市役所の人事 <small>幹部の給与 月 ${n0(ex.reduce((a, o) => a + (o?.salary ?? 0), 0))} 万円</small></h2><div class="posts">${POSTS.map((pd, k) => { const o = ex[k], lock = o && s.month - o.since < 12, open = this.openK.has('post-' + k);
        return `<div class="post"><div class="ph"><b>${pd.name}</b><span>${o ? `${esc(o.name)}（${o.age}）<small>${o.from}</small>` : '空席'}</span><i class="stars">${'★'.repeat(o?.skill ?? 0)}${'☆'.repeat(5 - (o?.skill ?? 0))}</i><button class="btn small" data-act="postopen" data-arg="${k}" ${lock ? 'disabled' : ''}>${lock ? `あと ${12 - (s.month - o!.since)} か月` : open ? '閉じる' : '入れかえる'}</button></div><small>${pd.desc}</small>
          ${open && !lock ? `<div class="cands">${candidates(s, k).map((c, ci) => `<button class="cand" data-act="pol" data-arg="appoint:${ci}:${k}"><b>${esc(c.name)}（${c.age}）</b><i class="stars">${'★'.repeat(c.skill)}${'☆'.repeat(5 - c.skill)}</i><small>${c.from}${c.salary ? `・月 ${c.salary} 万円` : '・追加の給与なし'}</small></button>`).join('')}</div>` : ''}</div>`; }).join('')}</div>
        <p class="note">手腕は ★2 が基準で、★3 以上だと効果があり、★1 だと少し悪くなります。県や国からの出向者は手腕が高めで、県・国との関係もよくなります。民間からの登用は給与が高めです。候補は毎年 4 月に入れかわります。副市長の選任には議会の同意が要ります。</p></section>`; }
    // バス路線
    { const rs = p.routes ?? [], st = routeStats(s).v, stops = s.busStops ?? [], d = getMap(s.seed).district;
      const nm = (t: number) => { const near = s.buildings.filter(b => b.status === 'operating' && !isRes(b.kind)).sort((a, b) => Math.abs(a.x - t % W) + Math.abs(a.y - Math.floor(t / W)) - (Math.abs(b.x - t % W) + Math.abs(b.y - Math.floor(t / W))))[0]; return `${DISTRICTS[d[t]] ?? ''}${near ? `・${DEFS[near.kind].name}前` : ''}`; };
      h += `<section><h2>🚌 バス路線 <small>${rs.length} / ${MAX_ROUTES} 路線・赤字 月 ${n0(Math.max(0, st.reduce((a, r) => a + r.cost - r.fare, 0)))} 万円</small></h2>
        ${rs.length ? `<table class="t"><tr><th>路線</th><th>利用</th><th>収支</th><th></th></tr>${rs.map((r, k) => { const x = st[k]; return `<tr><td><b>${esc(r.name)}</b><br><small>${r.stops.length} 停留所・${(r.path.length * 0.03).toFixed(1)}km・沿線 ${n0(x?.cover ?? 0)} 世帯</small><br><select data-act="busfreq" data-arg="${k}">${FREQ.map((f, i) => `<option value="${i}" ${i === r.freq ? 'selected' : ''}>${f}</option>`).join('')}</select></td><td class="num">${n0(x?.riders ?? 0)}<i>人/月</i></td><td class="num" style="color:var(--${(x?.fare ?? 0) >= (x?.cost ?? 0) ? 'good' : 'bad'})">${yen((x?.fare ?? 0) - (x?.cost ?? 0))}</td><td><button class="btn small" data-act="pol" data-arg="unroute:${k}">廃止</button></td></tr>`; }).join('')}</table>` : ''}
        ${stops.length >= 2 ? `<div class="newroute"><label>起点 <select id="rt-a">${stops.map(t => `<option value="${t}">${nm(t)}</option>`).join('')}</select></label><label>終点 <select id="rt-b">${stops.map((t, i) => `<option value="${t}" ${i === stops.length - 1 ? 'selected' : ''}>${nm(t)}</option>`).join('')}</select></label><label>本数 <select id="rt-f">${FREQ.map((f, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${f}</option>`).join('')}</select></label><button class="btn small primary" data-act="newroute" ${rs.length >= MAX_ROUTES ? 'disabled' : ''}>路線を開く（300 万円）</button></div>` : `<p class="note">路線を開くには、バス停が 2 つ以上要ります（［道路を引く］→［バス停を置く］）。</p>`}
        <p class="note">起点から終点まで道路をたどり、途中のバス停にも止まります。本数が多いほど沿線の人が車を使わなくなり（渋滞が減る）、高齢世帯の満足が上がりますが、運行費もかさみます。地図の表示［バス］で路線と沿線が見られます。</p></section>`; }
    // 地価
    { const L = landOf(s); if (L) { const v = landPrices(s); let mx = 0, mi = -1; for (let i = 0; i < v.length; i++) if (v[i] > mx) { mx = v[i]; mi = i; }
      h += `<section><h2>🏠 地価と固定資産税 <small>住宅地の平均 ${L.avg} 万円/㎡</small></h2>
        <div class="rows"><span>いちばん高い地点</span><b>${mx.toFixed(1)}<i>万円/㎡（${DISTRICTS[getMap(s.seed).district[mi]] ?? ''}）</i></b><span>次の評価替え</span><b>${Math.max(0, 36 - (s.month - L.at))}<i>か月後（3 年ごと）</i></b>
        ${L.dk.map((k, i) => `<span>${DISTRICTS[i] ?? ''}の評価</span><b style="color:var(--${k >= 1.05 ? 'good' : k <= 0.95 ? 'bad' : 'ink'})">${Math.round(k * 100)}<i>%（最初を 100）</i></b>`).join('')}</div>
        ${L.hist.length > 1 ? `<p class="note">平均地価の推移：${L.hist.slice(-8).map(x => `${x.y} 年目 ${x.avg}`).join(' → ')}</p>` : ''}
        <p class="note">地価は、駅に近い・店や会社が多い・暮らしの満足が高い・人口が多いほど高く、急な斜面や津波で浸水する土地は安くなります。固定資産税は 3 年ごとの評価替えで地価に合わせて見直されます（1 回の上げ下げは 15% まで）。地図の表示［地価］で見られます。</p></section>`; } }
    // 選挙戦
    { const left = monthsToElection(s), open = campaignOpen(s), c = p.camp && p.camp.term === s.term ? p.camp : undefined, r = p.rival && p.rival.term === s.term ? p.rival : undefined, o = electionOutlook(s);
      h += `<section><h2>📣 選挙戦 <small>${s.mode === 'term' ? `市長選まで ${left} か月` : '任期のない遊び方'}</small></h2>
        ${r ? `<div class="rival"><b>対立候補：${esc(r.name)}（${r.age}）</b><small>${esc(r.job)}・争点「${esc(r.focus)}」</small></div>` : `<p class="note">選挙の 6 か月前に、対立候補が名乗りを上げます。</p>`}
        ${s.mode === 'term' ? `<p>当選の見込み：<b style="color:var(--${o.win >= 0.6 ? 'good' : o.win >= 0.4 ? 'warn' : 'bad'})">${Math.round(o.win * 100)}%</b>（得票の見込み ${voteText(o.vote)}%）</p>` : ''}
        <div class="btnrow"><button class="btn small" data-act="pol" data-arg="speech" ${open && (c?.speech ?? 0) < 6 ? '' : 'disabled'}>🎤 街頭演説（${SPEECH_COST} 万円・${c?.speech ?? 0}/6）</button><button class="btn small" data-act="pol" data-arg="ads" ${open && (c?.ads ?? 0) < 2 ? '' : 'disabled'}>📺 広報・SNS 広告（${ADS_COST} 万円・${c?.ads ?? 0}/2）</button><button class="btn small" data-act="pol" data-arg="debate" ${open && c?.debate === undefined ? '' : 'disabled'}>🗣 公開討論会${c?.debate !== undefined ? `（${c.debate > 0 ? '+' : ''}${c.debate}）` : ''}</button></div>
        <p class="note">演説は回数を重ねるほど効き目が小さくなります。討論会は 1 回だけで、公約の達成と暮らしの満足が評価されます（苦しいと逆効果）。</p></section>`; }
    // メディアと SNS
    h += `<section><h2>📱 メディアと SNS <small>${p.buzz > 0.15 ? '好意的' : p.buzz < -0.15 ? '批判的' : 'ふつう'}</small></h2>
      ${p.flame ? `<div class="flame"><b>🔥 炎上中</b><p>${esc(p.flame.text)}</p><div class="btnrow">${PRESS.map(x => `<button class="btn small ${x.id === 'apologize' ? 'primary' : ''}" data-act="pol" data-arg="press:${x.id}" title="${x.desc}">${x.name}</button>`).join('')}</div><small>${PRESS.map(x => `${x.name}：${x.desc}`).join('<br>')}<br>放っておくと 2 か月で「静観」になります。</small></div>` : ''}
      <ul class="tl">${[...p.posts].reverse().map(x => `<li class="${x.tone}"><b>${esc(x.who)}</b><small>${dateStr(x.m)}</small><p>${esc(x.text)}</p></li>`).join('') || '<li>まだ投稿はありません</li>'}</ul>
      <p class="note">待機児童・渋滞・増税・災害への対応で炎上することがあります。行事や新しい名所が話題になると、知名度と来訪者が伸びます。テレビ局があると、よい話題は広がりやすく、炎上は起きにくくなります。</p></section>`;
    // 国・県
    h += `<section><h2>🏢 国・県との交渉 <small>関係 ${Math.round(p.pref * 100)}・採択の見込み ${Math.round(grantChance(s) * 100)}%</small></h2>
      <div class="btnrow"><button class="btn small" data-act="pol" data-arg="petition" ${p.petition !== undefined && s.month - p.petition < 6 ? 'disabled' : ''}>県庁・省庁へ要望活動（${PETITION_COST} 万円・6 か月に 1 回）</button></div>
      <table class="t"><tr><th>補助金・交付金</th><th>額</th><th></th></tr>${GRANTS.map(g => { const why = g.need(s), app = p.apps.find(a => a.id === g.id), last = p.grants[g.id], cool = last !== undefined && s.month - last < GRANT_COOL; return `<tr><td><b>${g.name}</b><br><small>${g.who}・${g.desc}</small>${why ? `<br><small style="color:var(--warn)">${why}</small>` : ''}</td><td class="num">${yen(g.amount)}</td><td>${app ? `<small>審査中<br>あと ${3 - (s.month - app.m)} か月</small>` : `<button class="btn small" data-act="pol" data-arg="grant:${g.id}" ${why || cool ? 'disabled' : ''}>申請<br><small>${APPLY_COST} 万円</small></button>`}</td></tr>`; }).join('')}</table>
      <p class="note">申請から 3 か月で結果が出ます。県・国との関係、市長レベル、知名度が高いほど通りやすくなります。同じ補助金は 3 年に 1 回です。</p></section>`;
    // 季節の行事
    h += `<section><h2>🎆 季節の行事 <small>いま ${cm} 月</small></h2><div class="fests">${[...FESTS].sort((a, b) => ((a.cal - cm + 12) % 12) - ((b.cal - cm + 12) % 12)).map(f => { const on = p.fests.includes(f.id), why = f.need?.(s); return `<div class="fest ${on ? 'on' : ''}"><b>${f.cal} 月　${f.name}</b><small>${f.desc}　1 回 ${yenT(f.cost)}</small><button class="btn small ${on ? '' : 'primary'}" data-act="pol" data-arg="fest:${f.id}:${on ? 0 : 1}" ${!on && why ? `disabled title="${why}"` : ''}>${on ? 'やめる' : '毎年ひらく'}</button></div>`; }).join('')}</div></section>`;
    // 人口動態
    { const py = pyramid(s), mx = Math.max(1, ...py), pr = projection(s), hist = p.demoHist.slice(-6).reverse(), d = p.demo, mon = (s.month % 12) || 12;
      h += `<section><h2>👪 人口動態 <small>いまの人口 ${n0(s.stats.pop)} 人</small></h2>
        <div class="pyr">${py.map((v, k) => `<div><span>${k === 9 ? '90〜' : `${k * 10}〜`}</span><i style="width:${Math.round((v / mx) * 100)}%;background:${k >= 6 ? '#c9902a' : k <= 1 ? '#5a9bd4' : '#5b9e78'}"></i><small>${n0(v)}</small></div>`).join('')}</div>
        <table class="t"><tr><th>年度</th><th>結婚</th><th>出生</th><th>入学</th><th>独立</th><th>退職</th><th>死亡</th><th>転入</th><th>転出</th></tr>
          <tr><td>今年（${mon} か月）</td>${[d.marry, d.birth, d.school, d.leave, d.retire, d.death, d.inHH, d.outHH].map(v => `<td class="num">${n0(v)}</td>`).join('')}</tr>
          ${hist.map(x => `<tr><td>${x.y} 年目</td>${[x.marry, x.birth, x.school, x.leave, x.retire, x.death, x.inHH, x.outHH].map(v => `<td class="num">${n0(v)}</td>`).join('')}</tr>`).join('')}</table>
        <p class="note">結婚・入学（子が小学生に）・独立（子が家を出る）・退職（高齢世帯へ）・転入・転出は世帯の数、出生と死亡は人の数です。</p>
        <table class="t"><tr><th>将来の推計</th><th>転入・転出がないと</th><th>高齢化率</th><th>いまの流れが続くと</th></tr>${pr.map(x => `<tr><td>${x.y} 年後</td><td class="num">${n0(x.pop)}<i>人</i></td><td class="num">${pct(x.aging)}</td><td class="num">${n0(x.popFlow)}<i>人</i></td></tr>`).join('')}</table></section>`; }
    // 長いので、見出しで折りたたむ。いま大事なもの（炎上・選挙戦・暫定予算）は開いておく
    if (!this.cityFoldInit) { this.cityFoldInit = true; this.openK.add('home-🏛 市議会と予算'); }
    if (p.flame) this.openK.add('home-📱 メディアと SNS');
    if (campaignOpen(s)) this.openK.add('home-📣 選挙戦');
    return this.foldAll(h, ['🚃 鉄道と街づくり', '🏟 国際大会・万博の誘致', '🌟 移り住んだ有名人', '🎭 市長のタイプ', '🏛 市議会と予算', '🧑‍💼 市役所の人事', '🚌 バス路線', '🏠 地価と固定資産税', '📣 選挙戦', '📱 メディアと SNS', '🏢 国・県との交渉', '🎆 季節の行事', '👪 人口動態']);
  }
  private pMayor(): string {
    const s = this.s, M = s.mayor;
    if (!M) return '<section><p>市長の記録は、1 か月たつと始まります。</p></section>';
    const l = levelOf(M.pts), L = LEVELS[l - 1], nx = LEVELS[l], base = L.pts, prog = nx ? (M.pts - base) / (nx.pts - base) : 1;
    const got = MEDALS.filter(m => M.medals[m.id] !== undefined).length;
    const tierC = ['', 'bronze', 'silver', 'gold'];
    let h = `<div class="btnrow"><button class="btn small" data-act="card">📸 記念カードをつくる</button><button class="btn small" data-act="album">📔 アルバム</button><button class="btn small" data-act="tl" ${timelineCount(s) ? '' : 'disabled title="毎年 4 月に記録します"'}>🎞 街の成長を振り返る</button><button class="btn small" data-act="tl" data-arg="rec" ${timelineCount(s) ? '' : 'disabled'}>🎬 動画で保存</button></div><section><h2>市長レベル</h2><div class="lvrow"><div class="lvbig">Lv<b>${l}</b><span>${L.title}</span></div><div style="flex:1"><div class="bar"><i style="width:${Math.round(prog * 100)}%"></i></div><small>市長ポイント ${n0(M.pts)}${nx ? `／次の「${nx.title}」まで あと ${n0(nx.pts - M.pts)}` : '（最高レベル）'}</small></div></div>
      <details><summary>レベルと特典</summary><ul class="lvlist">${LEVELS.map((x, k) => `<li class="${k + 1 <= l ? 'on' : ''}"><b>Lv${k + 1} ${x.title}</b> <small>${n0(x.pts)} pt</small>${x.perk ? `<br><small>${x.perk}</small>` : ''}</li>`).join('')}</ul><p class="note">特典は重ねて効きます。ポイントは勲章と、毎年 3 月の全国市区町村ランキング（順位と表彰）でたまります。難易度「${diffOf(s).name}」：${mayorDiff(s).text}。</p></details></section>`;
    if (s.challenge) { const ch = s.challenge, c = CH[ch.id]; if (c) { const p = Math.max(0, Math.min(1, c.progress(s, ch.base))); h += `<section><h2>挑戦「${c.name}」 <small>${ch.done === 'win' ? '達成' : ch.done === 'lose' ? '期限切れ' : `あと ${Math.max(0, ch.until - s.month)} か月`}</small></h2><p>${c.goal}</p><div class="lvrow"><div style="flex:1"><div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div><small>進み具合 ${Math.round(p * 100)}%</small></div></div></section>`; } }
    if (s.unlocked) {
      const cand = annexable(s);
      h += `<section><h2>市の区域 <small>${s.unlocked.length} / ${BX * BY} 区域</small></h2><p class="note">黄色い線の外（暗い所）は、まだ市の区域ではありません。道路・用途・施設はつくれません。レベルが上がるたびに、となりの区域を 1 つ編入できます（全国 10 位以内の大賞でも +1）。</p>
        <p>編入できる回数：<b>${M.annex}</b> 回</p>
        ${cand.length ? `<div class="annex">${cand.map(b => `<div class="arow"><span>${blockName(b)}</span><button class="btn small" data-act="seeblock" data-arg="${b}">地図で見る</button><button class="btn small primary" data-act="annex" data-arg="${b}" ${M.annex > 0 ? '' : 'disabled'}>編入する</button></div>`).join('')}</div>` : '<p class="note">すべての区域が市の区域です。</p>'}</section>`;
    }
    { const cr = loadCareer(), why = canRun(s); h += `<section><h2>市長の経歴 <small>最高 Lv${Math.max(cr.lv, l)}・${cr.cities.length} の街</small></h2><p class="note">経歴のレベルが上がると、新しい街を始めるときに選べる地形（内陸・田園・大河・湖・山あい・都会・島）が増えます。市長レベル 4 で 1 回再選すると、別の街に立候補できます（いまの街は「前の街」として残り、市長ポイントの 3 割を持って移ります）。</p>
      <div class="btnrow"><button class="btn ${this.confirmRun ? 'danger' : ''}" data-act="run" ${why ? 'disabled' : ''}>${this.confirmRun ? '本当に別の街へ（もう一度押す）' : '🗳 別の街の市長選に立候補する'}</button></div>${why ? `<p class="note">${why}</p>` : ''}</section>`; }
    { const ct = (s.pol as any)?.contest as { week: number; start: number } | undefined; if (ct) { const left = Math.max(0, 120 - (s.month - ct.start)), rows = contestList();
      h += `<section class="contestsec"><h2>🏁 今週の大会 <small>${left ? `残り ${Math.floor(left / 12)} 年 ${left % 12} か月` : '終了（最終の成績を送ってください）'}</small></h2><p>いまの成績：<b>${n0(scoreOf(s))} 点</b>（人口 ${n0(s.stats.pop)}）${left ? '' : '　この先の成績は大会に入りません'}</p>
        ${rows.length ? `<table class="t"><tr><th>順位</th><th>市長</th><th>点</th><th>人口</th></tr>${rows.map((r, k) => `<tr class="${r.me ? 'me' : ''}"><td class="num">${k + 1}</td><td>${esc(r.name ?? '市長')}${r.me ? '（あなた）' : ''}<br><small>${r.years} 年目</small></td><td class="num">${n0(r.score)}</td><td class="num">${n0(r.pop)}</td></tr>`).join('')}</table>` : '<p class="note">［成績を送る］か［順位を見る］で、ほかの市長の成績が出ます。</p>'}
        <div class="btnrow"><button class="btn small primary" data-act="ctsend" ${s.month - ct.start <= 120 + 1 ? '' : 'disabled'}>成績を送る</button><button class="btn small" data-act="ctload">順位を見る</button></div></section>`; } }
    { const o = onlineState(); h += `<section><h2>🌐 オンラインランキング <small>${o.rows.length} 人の市長</small></h2>
        ${o.rows.length ? `<table class="t"><tr><th>順位</th><th>市長・街</th><th>人口</th><th>点</th></tr>${o.rows.map((r, k) => `<tr class="${r.me ? 'me' : ''}"><td class="num">${k + 1}</td><td><b>${esc(r.name ?? '市長')}${r.me ? '（あなた）' : ''}</b><br><small>${esc(r.city)}・${esc(r.terrain)}・Lv${r.lv}・${r.years} 年目</small></td><td class="num">${n0(r.pop)}</td><td class="num">${n0(r.score)}</td></tr>`).join('')}</table>` : `<p class="note">${!o.started ? '［ランキングを読み込む］を押すと、このページを共有した人どうしの順位が出ます' : o.ready ? (o.err || 'まだだれも参加していません。最初の市長になりましょう') : '読み込み中…'}</p>`}
        <div class="btnrow"><button class="btn small primary" data-act="olsend" ${o.can ? '' : 'disabled'}>いまの成績を送る（${n0(scoreOf(s))} 点）</button>${o.started ? `<button class="btn small" data-act="olrefresh" ${o.can ? '' : 'disabled'}>更新</button>` : '<button class="btn small" data-act="olstart">ランキングを読み込む</button>'}</div>
        ${o.started ? `<h3>🏙 みんなの街 <small>${sharedCities().length} 件</small></h3>${sharedCities().length ? `<div class="shared">${sharedCities().map(c => `<div class="sc"><b>${esc(c.city)}</b><small>${esc(c.name ?? '市長')}${c.me ? '（あなた）' : ''}・${esc(c.terrain)}・人口 ${n0(c.pop)}・${c.years} 年目・Lv${c.lv}</small>${c.me ? '' : `<button class="btn small" data-act="olload" data-arg="${esc(c.id)}">${this.confirmLoad === c.id ? '本当に読み込む（もう一度押す）' : 'この街で遊ぶ'}</button>`}</div>`).join('')}</div>` : '<p class="note">まだ共有された街はありません。</p>'}
        <div class="btnrow"><button class="btn small" data-act="olshare" ${o.can ? '' : 'disabled'}>🏙 いまの街を共有する</button></div><p class="note">共有した街は、このページを共有した人が「この街で遊ぶ」で引き継げます（あなたの街は変わりません）。読み込む前に、いまの街は自動保存の枠に保存されます。</p>` : ''}
        <p class="note">このページを共有された人どうしで競えます（1 人 1 件、送るたびに上書き）。点は人口（100 人で 1 点）＋市長ポイント＋勲章（1 つ 10 点）。閲覧だけで共有された人は、見ることはできますが送れません。</p></section>`; }
    { const mine = s.sisters ?? [];
      h += `<section><h2>国際交流・姉妹都市 <small>${mine.length} / ${MAX_SISTERS}</small></h2><p class="note">海外の都市と姉妹都市になり、交流を重ねると関係が深まって効果が大きくなります（交流がないと少しずつ冷めます）。相手に知ってもらうには知名度が要ります。</p>
        ${mine.map(p => { const d = SIS[p.id]; if (!d) return ''; const wait = p.last !== undefined && s.month - p.last < 6; return `<div class="sis on"><b>🤝 ${d.name} <small>${d.country}・${d.theme}</small></b><div class="bar"><i style="width:${Math.round(p.rel * 100)}%"></i></div><small>関係 ${Math.round(p.rel * 100)}%・${d.desc}</small>
          <div class="btnrow">${EXCHANGES.map(x => `<button class="btn small" data-act="sis" data-arg="${p.id}:${x.id}" ${wait || s.cash < x.cost ? 'disabled' : ''} title="${x.desc}">${x.name}（${yenT(x.cost)}）</button>`).join('')}<button class="btn small" data-act="sis" data-arg="${p.id}:end">解消</button></div>${wait ? `<small>次の交流まで ${6 - (s.month - (p.last ?? 0))} か月</small>` : ''}</div>`; }).join('')}
        ${mine.length < MAX_SISTERS ? `<details class="fold sub" data-k="sis-new" ${this.openK.has('sis-new') ? 'open' : ''}><summary><h2>新しく提携する</h2></summary>${SISTERS.filter(d => !mine.some(p => p.id === d.id)).map(d => `<div class="sis"><b>${d.name} <small>${d.country}・${d.theme}</small></b><small>${d.desc}（知名度 ${d.fame} 以上・${yenT(d.cost)}）</small><div class="btnrow"><button class="btn small primary" data-act="sis" data-arg="${d.id}:join" ${(s.fame ?? 0) < d.fame || s.cash < d.cost ? 'disabled' : ''}>提携する</button></div></div>`).join('')}</details>` : ''}</section>`; }
    h += `<section><h2>勲章 <small>${got} / ${MEDALS.length}</small></h2><div class="medals">${MEDALS.map(m => { const on = M.medals[m.id] !== undefined; return `<div class="medal ${on ? tierC[m.tier] : 'off'}" title="${esc(m.desc)}"><i>${on ? '🏅' : '・'}</i><b>${m.name}</b><small>${on ? `${dateStr(M.medals[m.id])}` : m.desc}・${m.pts} pt</small></div>`; }).join('')}</div></section>`;
    h += `<section><h2>全国市区町村ランキング</h2>${M.ranks.length ? `<table class="ranks hist"><tr><th>年度</th><th>総合</th>${RANK_CATS.map(c => `<th>${c.name}</th>`).join('')}</tr>${M.ranks.slice(-10).reverse().map(r => `<tr><td>${r.year}</td><td><b>${n0(r.total)}</b>${r.awards.length ? ' 🏆' : ''}</td>${RANK_CATS.map(c => `<td class="${r.cats[c.id] <= 10 ? 'top' : ''}">${n0(r.cats[c.id])}</td>`).join('')}</tr>`).join('')}</table>` : '<p class="note">毎年 3 月に発表されます（全国 1,741 市区町村の中の順位。ゲームの中のランキングです）。</p>'}</section>`;
    { const ch = s.pol?.chron ?? []; h += `<section><h2>📜 街の年表 <small>${ch.length} 件</small></h2>${ch.length ? `<ul class="chron">${[...ch].reverse().slice(0, 60).map(c => `<li><i>${dateStr(c.m)}</i>${esc(c.t)}</li>`).join('')}</ul>` : '<p class="note">選挙・議会・災害・人口の節目などが、ここに残ります。</p>'}</section>`; }
    return this.foldAll(h, ['📜 街の年表', '市の区域', '市長の経歴', '🌐 オンラインランキング', '国際交流・姉妹都市', '勲章', '全国市区町村ランキング']);
  }
  private pTerm(): string {
    const s = this.s, st = s.stats;
    const left = s.termLength - (s.month - s.termStart);
    let h = '';
    if (s.mode === 'term') {
      const o = electionOutlook(s);
      h += `<section><h2>再選の見込み <small>任期 ${s.term} 期目・残り ${left} か月</small></h2>
        <div class="vote"><b style="color:var(--${o.win >= 0.6 ? 'good' : o.win >= 0.4 ? 'warn' : 'bad'})">${Math.round(o.win * 100)}<span style="font-size:18px">%</span></b><span>いま選挙なら当選する確率（得票の見込み ${voteText(o.vote)}%。当日の風向きで最大 ±${(o.sd * 3).toFixed(1)}、ふつうは ±${o.sd.toFixed(1)} ほどぶれます）</span></div>
        <table class="t"><tr><th>得票の内訳</th><th>影響</th></tr><tr><td>基準</td><td>50.0</td></tr>${o.parts.map(p => `<tr><td>${p.label}</td><td style="color:var(--${p.v >= 0 ? 'good' : 'bad'})">${p.v >= 0 ? '+' : '−'}${Math.abs(p.v).toFixed(1)}</td></tr>`).join('')}</table>
        <p class="note">得票率 ${WIN_VOTE}% 以上で当選です（ちょうど ${WIN_VOTE}% も当選）。当選する確率は、当日の抽選と同じ計算から出しています。暮らしの満足がいちばん大きく、次に公約です。難しい公約ほど達成したときに票が伸び、届かないと減ります。</p>
        ${s.stats.satDrag ? (() => { const top = SAT_PARTS.map((n, k) => ({ n, k, d: s.stats.satDrag![k], v: s.stats.satParts![k] })).sort((a, b) => b.d - a.d).slice(0, 4); const hint: Record<string, string> = { 住宅負担: '税（特に住民税・固定資産税）を標準以下に／住宅地の在庫を増やして空き住戸を 3〜5% に／住宅改修支援', 通勤: '混む道路を幹線に／市内に職（業務・工業・大企業）／自転車道・AI 信号・自動運転バス', 保育: '待機のある地区に保育園／保育人材支援', 買物: '住宅地の近くを商業に', 公園: '公園の遠い地区に公園', 治安: '交番・警察署', 医療: '診療所・病院', 環境: '公園・緑、工場を住宅から離す', '文化・スポーツ': '図書館・体育館・文化施設' }; return `<h3>満足を下げているもの（満点との差 × 重み）</h3><table class="t">${top.map(p => `<tr><td>${p.n} <small>${Math.round(p.v * 100)}%</small></td><td style="color:var(--bad)">−${(p.d * 100).toFixed(1)}</td><td><small>${hint[p.n] ?? ''}</small></td></tr>`).join('')}</table>`; })() : ''}</section>`;
      h += `<section><h2>公約 <small>任期の初めに選んだ 3 つ</small></h2>${s.goals.length ? s.goals.map(g => {
        const def = GOALS.find(o => o.id === g.id)!, pr = goalProgress(s, g);
        return `<div class="card"><h3>${def.name}<em>${'★'.repeat(g.diff)}</em></h3><p>${def.desc(g.target)}</p>${this.meter(pr.ok ? '達成' : '進み具合', pr.p, `${n0(pr.v)}${def.unit === '%' ? '%' : ' ' + def.unit}`)}<p class="note">選んだとき ${n0(g.base)}${def.unit === '%' ? '%' : ' ' + def.unit} → 目標 ${g.id === 'fiscal' ? '平均 0 以上' : n0(g.target) + (def.unit === '%' ? '%' : ' ' + def.unit) + (def.lower ? ' 以下' : ' 以上')}</p>${g.id === 'fiscal' ? (() => { const w = fiscalWatch(s); return `<p class="note">${w.waiting ? '評価待ち：まだ 1 か月も収支の記録がありません' : `観測 ${w.months}/12 か月の平均 ${n0(w.avg)} 万円/月${w.months < 12 ? '（12 か月たつまでは、ある分の平均で判定）' : ''}`}・一時借入 ${w.temp > 0 ? n0(w.temp) + ' 万円（残高があるあいだは未達成）' : 'なし'}</p>`; })() : ''}</div>`;
      }).join('') : '<p class="note">まだ公約を選んでいません。</p>'}</section>`;
    }
    if (s.mode === 'sandbox' && s.elections.length && !s.elections.at(-1)!.win) {
      const why = rerunCheck(s), o = electionOutlook(s, true), RR = rerunRules(s);
      h += `<section><h2>もう一度立候補する <small>落選からの返り咲き</small></h2>
        <p>落選後も街づくりを続け、街を立て直せば、次の選挙に立候補できます。次の 4 つをすべて満たすと立候補できます。</p>
        <table class="t"><tr><th>条件</th><th>必要</th><th>いま</th><th></th></tr>${RR.map(r => `<tr><td>${r.label}</td><td>${r.need}</td><td>${r.now}</td><td style="color:var(--${r.ok ? 'good' : 'warn'})">${r.ok ? '✓ 満たす' : '✗ まだ'}</td></tr>`).join('')}</table>
        ${why ? `<p class="note" style="color:var(--warn)">${esc(why)}</p>` : `<p><b>立候補できます。</b>いま選挙なら得票の見込みは ${voteText(o.vote)}%、当選する確率は ${Math.round(o.win * 100)}% です（返り咲きへの期待 +${RERUN.bonus} を含み、公約の加点・減点はありません）。</p>`}
        <div class="btnrow"><button class="btn ${why ? '' : 'primary'}" data-act="rerun" ${why ? 'disabled' : ''}>立候補する</button></div>
        <p class="note">当選すると経営モードに戻り、新しい任期（公約選びから）が始まります。直接配置した建物はそのまま残ります。落選したらまた 12 か月後に挑戦できます。</p></section>`;
    }
    const vis = VISIONS.find(v => v.id === s.vision);
    if (vis) h += `<section><h2>ビジョン <small>${dateStr(s.visionStart)}から・中長期の目標</small></h2><div class="card"><h3>${vis.name}</h3><p>${vis.desc}</p>${this.meter('進み具合', visionProgress(s))}${(() => { const pk = VISION_PERKS[vis.id]; if (!pk) return ''; const has = s.buildings.some(b => b.kind === pk.kind && b.status === 'operating'); return `<div class="rows"><span>このビジョンの特典</span><b style="font-weight:600;font-size:12.5px">${pk.text}</b><span>専用施設「${DEFS[pk.kind].name}」</span><b style="font-weight:600;font-size:12.5px;color:var(--${has ? 'good' : 'ink-3'})">${has ? pk.kindText : `未建設（［施設を建てる］から。${pk.kindText}）`}</b></div>`; })()}<p class="note">関係する指標：${vis.goals.map(id => GOALS.find(g => g.id === id)!.name).join('・')}。進み具合は選挙の得票にも少し効きます。3 期（12 年）続けて実現を目指しましょう。</p></div></section>`;
    if (s.polls.length > 2) h += `<section><h2>支持率の推移</h2><div class="chartbox"><h4>支持率 <small>%</small></h4>${chartSvg({ id: 'polls', series: [{ name: '支持率', color: 'var(--c1)', values: s.polls.map(v => v * 100) }], fmt: v => v.toFixed(0), xLabel: i => `${s.polls.length - 1 - i} か月前`, ref: { v: 50, label: '50%' } }, 336, 110)}</div><p class="note">支持率は、暮らしの満足・税・できごとへの対応で毎月少しずつ動きます。</p></section>`;
    h += `<section><h2>プロスポーツ <small>チームを誘致・設立する</small></h2>${(['soccer', 'baseball', 'basket'] as const).map(sp => {
      const d = SPORTS[sp], t = (s.teams ?? []).find(o => o.sport === sp);
      if (t) { const v = teamVenue(s, sp); return `<div class="card"><h3>${esc(t.name)}<em>${d.league}</em></h3><div class="rows"><span>本拠地</span><b>${v ? DEFS[v.kind].name : '<span style="color:var(--bad)">使えない</span>'}</b><span>人気</span><b>${pct(t.fans)}</b><span>戦力</span><b>${Math.round((t.power ?? 0.35) * 100)}</b><span>景気への効果</span><b>${v ? '+' + (2 * t.fans * (0.5 + (t.power ?? 0.35))).toFixed(1) + '%' : '—'}</b><span>前のシーズン</span><b>${t.rank ? `${d.size} チーム中 ${t.rank} 位` : 'まだ'}</b><span>優勝</span><b>${t.titles}<i>回</i></b><span>市の支援</span><b>${d.support}<i>万円/月</i></b></div><div class="btnrow"><button class="btn small danger" data-act="team" data-arg="${sp}:0">支援をやめる（撤退）</button></div></div>`; }
      const why = teamCheck(s, sp);
      return `<div class="card"><h3>${d.name}<em>出資 ${yenT(d.cost)}</em></h3><p>${d.desc} 来訪者 月 ${n0(d.visitors)} 人ほど・知名度・雇用 ${d.jobs} 人・税収。市の支援は月 ${d.support} 万円。毎年 12 月に順位が決まり、優勝すると知名度と支持率が上がります。</p>${why ? `<p class="note" style="color:var(--warn)">${esc(why)}</p>` : ''}<div class="btnrow"><button class="btn small ${why ? '' : 'primary'}" data-act="team" data-arg="${sp}:1" ${why || d.cost > s.cash ? 'disabled' : ''}>チームをつくる</button></div></div>`;
    }).join('')}<p class="note">本拠地：サッカーはスタジアム、野球は野球場、バスケットボールはアリーナか体育館（どれも［施設を建てる］→［ランドマーク・大型施設］や［公園・スポーツ］）。チーム名・リーグはゲーム用の架空のものです。<br>順位は人気と戦力と運で決まります。優勝すると 12 か月、景気 +3%・来訪者 +10%・グッズや放映の収入、上位なら景気と来訪者が少し上向き、下位だと人気が下がります。人気と戦力の高いチームは、いつも景気を押し上げます（最大 +3% ほど）。戦力は「スター選手の獲得」などのできごとで上がり、補強しないと少しずつ平均へ戻ります。</p></section>`;
    const cats = [...new Set(CIVIC.map(c => c.cat))];
    h += `<section><h2>市長の取り組み <small>視察・交流・防災・広域連携</small></h2>${cats.map(cat => `<h3 style="margin:6px 0 2px;font-size:13px">${cat}</h3>` + CIVIC.filter(c => c.cat === cat).map(c => {
      const last = s.acts[c.id], wait = last === undefined ? 0 : c.once ? Infinity : Math.max(0, c.cool - (s.month - last));
      const nd = wait ? null : c.need?.(s) ?? null;
      return `<div class="card"><h3>${c.name}<em>${c.cost ? yenT(c.cost) : '費用なし'}</em></h3><p>${c.desc}</p>${nd ? `<p class="note" style="color:var(--warn)">${nd}</p>` : ''}<div class="btnrow"><button class="btn small ${wait || nd ? '' : 'primary'}" data-act="civic" data-arg="${c.id}" ${wait || nd || c.cost > s.cash ? 'disabled' : ''}>${wait === Infinity ? '実施済み' : wait ? `あと ${wait} か月` : '行う'}</button></div></div>`;
    }).join('')).join('')}</section>`;
    h += `<section><h2>隣の市町 <small>転入・転出や買物を取り合う相手</small></h2><table class="t"><tr><th>市町</th><th>人口</th><th>住みやすさ</th><th>税</th><th>関係</th></tr>${s.neighbors.map(n => `<tr><td>${n.name}<br><small class="note">${n.trait}</small></td><td>${n0(n.pop)}</td><td>${pct(n.appeal)}</td><td>${pct(n.tax)}</td><td>${pct(n.rel)}</td></tr>`).join('')}</table>
      <p class="note">この市の住みやすさ（満足度 ${pct(st.sat)}）、税、知名度が隣より高いと転入が増え、低いと転出が増えます。隣町の大型店や広域連携の話などのできごとも起きます。市町はゲーム用の架空のものです。</p></section>`;
    return h;
  }
  private pVoice(): string {
    const s = this.s;
    const h = (t: string) => { let a = 7; for (let i = 0; i < t.length; i++) a = (a * 31 + t.charCodeAt(i)) >>> 0; return a; };
    const v = s.voices.map((x, vi) => `<div class="card voice ${x.tone}${x.key.startsWith('thanks') ? ' thanks' : ''}"><span class="who"><span class="av" style="background:hsl(${h(x.who) % 360} 55% 55%)">${x.who.slice(0, 1)}</span>${x.who}${x.district >= 0 ? '・' + DISTRICTS[x.district] : ''} <span class="handle">@sumino_${(h(x.who + x.key) % 9000 + 1000)}</span>${x.key.startsWith('thanks') ? '<span class="tag good">解消</span>' : ''}</span><q data-act="vsel" data-arg="${vi}" title="押すと、この人の住む地区へ移動して、詳しいことを出します">${x.text}</q><span class="likes">♡ ${Math.round((h(x.key) % 40 + 5) * (1 + s.stats.pop / 8000) * (x.tone === 'bad' ? 2 : 1))}</span><details open><summary>なぜ起きているか</summary><p>${x.cause}</p></details><div class="btnrow"><button class="btn small ${this.vsel === vi ? 'primary' : ''}" data-act="vsel" data-arg="${vi}" aria-expanded="${this.vsel === vi}">${this.vsel === vi ? '詳しいことを閉じる' : '詳しく（住む地区・指標・効く施策）'}</button>${x.tile >= 0 || x.layer !== 'none' ? `<button class="btn small" data-act="focus" data-arg="${x.tile}:${x.layer}">地図で場所を見る</button>` : ''}</div>${this.vsel === vi ? voiceDetail(s, x, vi) : ''}</div>`).join('');
    const st = s.stats, L = s.ledger.at(-1);
    const diff = (a: number, b: number, unit: string, lowerBetter: boolean, f = (v: number) => n0(v)) => { const d = b - a; if (Math.abs(d) < 1e-9) return `${f(a)}${unit}（変化なし）`; return `${f(a)} → <b>${f(b)}</b>${unit}（<span style="color:var(--${(d < 0) === lowerBetter ? 'good' : 'bad'})">${d > 0 ? '+' : '−'}${f(Math.abs(d))}</span>）`; };
    const log = [...s.events.log].reverse().slice(0, 12).map(e => `<div class="card"><h3>${e.title}<em>${dateStr(e.month)}</em></h3><p>選んだこと：${e.choice}</p>${e.before ? `<details><summary>選んだ時 → いま（${s.month - e.month} か月後）</summary><div class="rows" style="font-size:12.5px"><span>保育の待機</span><b>${diff(e.before.wait, st.waitlist, '人', true)}</b><span>最大混雑率</span><b>${diff(e.before.maxVc * 100, st.maxVc * 100, '%', true)}</b><span>資金</span><b>${diff(e.before.cash, s.cash, '万円', false)}</b><span>毎月の収支</span><b>${diff(e.before.op, L?.operating ?? 0, '万円', false)}</b>${DISTRICTS.map((n, d) => `<span>${n}の満足度</span><b>${diff(e.before!.sat[d] * 100, st.satDistrict[d] * 100, '%', false)}</b>`).join('')}</div><p class="note">差には、この選択以外のできごと（入居、工事の完成、ほかの政策）の影響も含まれます。</p></details>` : ''}</div>`).join('');
    return `<div class="btnrow"><button class="btn small primary" data-act="people">👥 住民に会う（ひとりひとり）</button></div><section><h2>住民の声 <small>いま実際に起きている不足から</small></h2>${v || '<p class="note">目立った不満は届いていません。</p>'}</section>
      <section><h2>これまでのできごと <small>選んだ時との比較つき</small></h2>${log || '<p class="note">まだありません。</p>'}</section>`;
  }
  private pMoney(): string {
    const s = this.s, L = monthlyBudget(s), st = s.stats;
    const bond = s.loans.filter(l => l.kind === 'bond').reduce((a, l) => a + l.remaining, 0), temp = s.loans.filter(l => l.kind === 'temp').reduce((a, l) => a + l.remaining, 0);
    const repay = s.loans.reduce((a, l) => a + Math.min(l.remaining, l.principal / l.months), 0);
    const led = s.ledger.slice(-36);
    const row = (n: string, v: number) => `<span>${n}</span><b>${yen(v)}</b>`;
    const cap = s.pending.capital + s.pending.other;
    return `<section><h2>今月の見込み <small>万円/月</small></h2><div class="rows">
        ${row('住民税相当', L.taxResident)}${row('固定資産税相当', L.taxProperty)}${row('事業課税相当（店舗・企業）', L.taxBusiness)}${L.taxStay ? row('宿泊税', L.taxStay) : ''}${L.fees ? row('施設の収入（売電・入場料など）', L.fees) : ''}${row('基礎的移転収入', L.transfer)}
        <span class="sum">歳入 計</span><b class="sum">${yen(L.taxResident + L.taxProperty + L.taxBusiness + L.transfer + (L.fees ?? 0) + (L.taxStay ?? 0))}</b>
        ${row('基礎行政費', L.admin)}${row('施設の維持費', L.upkeep)}${row('職員の人件費', L.wages)}${row('私立保育園への補助', L.subsidy)}${row('道路の維持費', L.roads)}${row('政策・臨時対応', L.policy)}${row('借入の利子', L.interest)}
        <span class="sum">経常歳出 計</span><b class="sum">${yen(L.admin + L.upkeep + L.wages + L.subsidy + L.roads + L.policy + L.interest)}</b>
        <span class="sum">毎月の収支</span><b class="sum" style="color:var(--${L.operating >= 0 ? 'good' : 'bad'})">${yen(L.operating, true)}</b>
        ${row('借入の元金返済', repay)}${cap ? row('今月すでに支出した建設費など', cap) : ''}</div></section>
      ${this.taxBox()}
      ${s.ledger.length ? (() => { const L = s.ledger.at(-1)!, gap = ledgerGap(L); const r = (n: string, v: number) => `<span>${n}</span><b>${v >= 0 ? '+' : '−'}${yen(Math.abs(v))}</b>`; return `<section><h2>先月の現金の動き <small>${dateStr(L.month)}</small></h2><div class="rows"><span>月初の資金</span><b>${yen(L.cashStart ?? NaN)}</b>${r('毎月の収支（歳入 − 経常歳出）', L.operating)}${r('借入（市債・一時借入）', L.borrowed)}${r('借入の元金返済', -L.repay)}${r('建設・更新・撤去（返金は差し引き）', -L.capital)}${r('イベントなどの支出', -L.other)}<span class="sum">月末の資金</span><b class="sum">${yen(L.cashEnd)}</b></div>${Number.isFinite(gap) && Math.abs(gap) > 0.5 ? '<p class="note" style="color:var(--bad)">台帳の計算が合いません。</p>' : ''}</section>`; })() : ''}
      <section><h2>残高</h2><div class="rows"><span>市の資金（貯金。建設費はここから払う）</span><b>${yen(s.cash)}</b><span>市債の残高（上限 ${yenT(bondCap(s))}）</span><b>${yen(bond)}</b>${temp ? `<span style="color:var(--bad)">一時借入（年利 ${P.tempRate * 100}%）</span><b style="color:var(--bad)">${yen(temp)}</b>` : ''}<span>今後 60 か月の更新負担</span><b>${yen(st.renewal60)}</b></div>
        <div class="btnrow"><button class="btn" data-act="borrow" data-arg="${P.bondUnit}" ${bond + P.bondUnit > bondCap(s) ? 'disabled' : ''}>市債を ${yenT(P.bondUnit)} 発行</button>${tempDebt(s) > 0 ? `<button class="btn small" data-act="repaytemp" title="一時借入は年利が高く、残っていると選挙で不利です" ${s.cash < 1 ? 'disabled' : ''}>一時借入を返す（残り ${yenT(tempDebt(s))}）</button>` : ''}<button class="btn small" data-act="layer" data-arg="age">老朽化を地図で見る</button></div>
        <p class="note">市債は ${P.bondMonths} か月の元金均等返済、年利 ${P.bondRate * 100}%。施設を撤去しても返済は続きます。更新負担は、60 か月以内に老朽度 80 に達する施設の更新費と、70 に達する市道の補修費の合計です。</p></section>
      ${led.length > 1 ? `<section><h2>推移</h2>
        <div class="chartbox"><h4>毎月の収支 <small>万円/月</small></h4>${chartSvg({ id: 'lop', series: [{ name: '毎月の収支', color: 'var(--c1)', values: led.map(l => l.operating) }], fmt: v => n0(v), xLabel: i => dateStr(led[Math.min(led.length - 1, i)].month + 1), zero: true, ref: { v: 0, label: '収支 0' } })}</div>
        <div class="chartbox"><h4>資金 <small>万円</small></h4>${chartSvg({ id: 'lcash', series: [{ name: '資金', color: 'var(--c1)', values: led.map(l => l.cashEnd) }], fmt: v => n0(v), xLabel: i => dateStr(led[Math.min(led.length - 1, i)].month + 1), zero: true })}</div></section>` : ''}
      <p class="note">税や移転収入は実際の制度ではなく、人口・所得・事業活動に連動させたゲーム独自の近似です。金額・税率は全てゲーム用の仮定です。</p>`;
  }
  /** 税率の調整 */
  private taxBox(): string {
    const s = this.s, t = s.tax, hotel = s.buildings.some(b => b.kind === 'hotel' && b.status === 'operating');
    const ln = (k: 'res' | 'prop' | 'biz', n: string, eff: string) => {
      const last = s.acts['tax:' + k], wait = last === undefined ? 0 : Math.max(0, 6 - (s.month - last));
      return `<div class="card"><h3>${n}<em>標準の ${Math.round(t[k] * 100)}%</em></h3><p>${eff}</p><div class="btnrow"><button class="btn small" data-act="tax" data-arg="${k}:-0.05" ${wait || t[k] <= 0.851 ? 'disabled' : ''}>5% 下げる</button><button class="btn small" data-act="tax" data-arg="${k}:0.05" ${wait || t[k] >= 1.149 ? 'disabled' : ''}>5% 上げる</button>${wait ? `<span class="note">次に変えられるのは ${wait} か月後</span>` : ''}</div></div>`;
    };
    return `<section><h2>税率 <small>標準の 85〜115%・半年に 1 回まで</small></h2>
      ${ln('res', '住民税', '上げると税収が増えますが、支持率が下がり、転出が増え転入が減ります。下げるとその逆です。')}
      ${ln('prop', '固定資産税', '住宅の戸数と企業の土地にかかります。上げると支持率が少し下がり、企業も来にくくなります。')}
      ${ln('biz', '法人の税（事業所）', '店舗と企業から入ります。下げると企業誘致の見込みが上がり、店も開きやすくなります。')}
      <div class="card"><h3>宿泊税<em>${t.stay ? '実施中' : 'なし'}</em></h3><p>市内のホテルに泊まる来訪者から 1 泊 200 円。${hotel ? '' : 'いまは市内にホテルがないので収入になりません。'}</p><div class="btnrow"><button class="btn small" data-act="tax" data-arg="stay:${t.stay ? 0 : 1}">${t.stay ? 'やめる' : '設ける'}</button></div></div>
      <p class="note">税率はゲーム用の簡略化です。実際は条例で税率を決め、超過課税や減税には制約があります。</p></section>`;
  }
  private pPolicy(): string {
    const s = this.s;
    return `<section><h2>政策 <small>効果は時間をかけて出ます</small></h2>${POLICIES.map(p => {
      const st = s.policies[p.id], on = !!st?.on, f = on ? Math.min(1, (s.month - st.since) / p.ramp) : 0;
      return policyCard(s, p, on, f, this.ptrial?.id === p.id ? this.ptrial : null); // v90：費用・効き始め・対象・期待効果・副作用・不確実性・権限主体を同じ並びで
    }).join('')}</section>
    ${s.modifiers.length ? `<section><h2>実施中の臨時対応</h2><table class="t"><tr><th>内容</th><th>月額</th><th>終了</th></tr>${s.modifiers.map(m => `<tr><td>${m.src}</td><td>${m.cost ? n0(m.cost) + ' 万円' : '—'}</td><td>${m.until < 0 ? '継続' : dateStr(m.until)}</td></tr>`).join('')}</table></section>` : ''}`;
  }
  /** 計画案の各操作が、いつ・どこに効くか */
  private describeAction(a: Action): string {
    const sum = (t: number[]) => new Set(t).size;
    switch (a.type) {
      case 'build': { const d = DEFS[a.kind]; return `<b>${d.name}を建設</b>：着工時に ${yenT(d.cost)} を支出し、${d.months} か月後に完成。${d.staffReq && d.wage ? `完成時の職員は 3 割で、${d.staffKind}を月 ${d.hire} 人ずつ採用しながら受け入れが増えます（保育人材支援で速くなる）。` : '完成した月から効きます。'}`; }
      case 'road': return `<b>${ROAD_NAMES[a.road]} ${sum(a.tiles)} 区画</b>：すぐ道路網に入り、接続と混雑は次の再計算から変わります。沿道に用途を指定すると民間の着工につながります。`;
      case 'unroad': return `<b>道路の撤去 ${sum(a.tiles)} 区画</b>：すぐに接続が切れる場合があります。未接続の住宅は翌月から転出が進みます。`;
      case 'repair': return `<b>道路の補修 ${sum(a.tiles)} 区画</b>：すぐ老朽度が 0 に戻り、容量の低下がなくなります。`;
      case 'zone': return `<b>用途の指定 ${sum(a.tiles)} 区画</b>：需要と水道の余力があれば民間が着工します（戸建て 2 か月、集合住宅 4 か月、マンション 8 か月）。いつ建つかは需要と乱数しだいです。`;
      case 'policy': { const p = POLICIES.find(o => o.id === a.id)!; return `<b>「${p.name}」を${a.on ? '開始' : '終了'}</b>：${a.on ? `月 ${yenT(policyCost(this.s, p))}。効果は ${p.ramp} か月かけて満額になります。` : '翌月から費用も効果もなくなります。'}`; }
      case 'repayTemp': return `<b>一時借入の繰り上げ返済</b>：手元の資金で一時借入を返します。`;
      case 'airportUp': return '<b>空港の拡張</b>：国・県と工事をし、完成すると国際線が飛べるようになります。';
      case 'airRoute': return a.on ? '<b>路線の誘致</b>：半年分の補助を前払いし、翌月から就航します。' : '<b>路線からの撤退</b>：補助をやめると、その便はなくなります。';
      case 'area': return '<b>線引き・立地適正化</b>：無料。次の月から住宅の建ちやすさが変わります。';
      case 'busStop': return '<b>バス停</b>：すぐに路線バスが停まります。';
      case 'levee': return '<b>堤防</b>：すぐ完成し、うしろの浸水が減ります。';
      case 'stationUp': return a.what === 'shin' ? '<b>新幹線の新駅の誘致</b>：地元が負担し、6 年後に開業します。' : '<b>駅の拡張</b>：鉄道事業者と駅ビル・ターミナルにします。';
      case 'borrow': return `<b>市債 ${yenT(a.amount)}</b>：すぐ資金が増え、${P.bondMonths} か月かけて返済します（年利 ${P.bondRate * 100}%）。`;
      case 'renew': return `<b>施設の更新</b>：着工時に更新費を支出。工事中は能力が下がり、完了すると老朽度が 0 に戻ります。`;
      case 'upgrade': return `<b>施設の増築</b>：着工時に増築費を支出。工事中は能力が下がり、完成すると能力が上がります。`;
      case 'tax': return `<b>税率の変更</b>：翌月の収支から反映し、支持率と転入・転出に効きます。`;
      case 'civic': return `<b>${CIVIC.find(c => c.id === a.id)?.name ?? '取り組み'}</b>：すぐに費用を払い、効果は期限つきで続きます。`;
      default: return `<b>${a.type}</b>`;
    }
  }
  private pForecast(): string {
    const g = this.game, fc = this.fc, fb = fc?.base ?? null, fd = fc?.draft ?? null;
    const metric = this.fcMetric, M: Record<string, [string, string, (r: any) => number]> = { pop: ['人口', '人', r => r.pop], wait: ['保育の待機', '人', r => r.wait], cash: ['資金（一時借入を引いた額）', '万円', r => r.cash], renewal: ['今後 60 か月の更新負担', '万円', r => r.renewal] };
    let body = '';
    const stale = !!fc && fc.rev !== g.rev;
    if (this.fcBusy) body = `<div class="card"><p id="fcprog" role="status">計算中… ${Math.round(this.fcBusy * 100)}%</p><div class="meter" style="grid-template-columns:1fr"><div class="bar"><i id="fcbar" style="width:${Math.round(this.fcBusy * 100)}%"></i></div></div><div class="btnrow"><button class="btn small" data-act="fccancel">中止する</button></div><p class="note">計算中に街を変えると、この計算は中止します（古い結果を新しい状態の結果として出さないため）。</p></div>`;
    else if (!fb) body = `<p class="note">まだ試算していません。</p>`;
    else {
      const [name, unit, get] = M[metric];
      const mk = (set: ForecastSet[], label: string, color: string): Series => ({ name: label, color, values: set[1].rows.map(get), lo: set[1].rows.map((_, i) => Math.min(get(set[0].rows[i]), get(set[2].rows[i]))), hi: set[1].rows.map((_, i) => Math.max(get(set[0].rows[i]), get(set[2].rows[i]))) });
      const series = [mk(fb, '現在のまま', 'var(--c1)')]; if (fd) series.push(mk(fd, '計画案', 'var(--c2)'));
      const m0 = fc!.month;
      const tbl = (set: ForecastSet[], title: string) => `<table class="t"><tr><th>${title}</th><th>現在</th><th>12 か月後</th><th>60 か月後</th></tr>${set.map(sc => `<tr><td>${sc.label}（転入 ×${sc.factor}）</td><td>${n0(get(sc.rows[0]))}</td><td>${n0(get(sc.rows[12]))}</td><td>${n0(get(sc.rows[60]))}</td></tr>`).join('')}</table>`;
      const R: [string, string, (r: any) => number][] = [['人口', '人', r => r.pop], ['保育需要', '人', r => r.careDemand], ['保育の実効定員', '人', r => r.careCap], ['保育の待機', '人', r => r.wait], ['最大混雑率', '%', r => r.maxVc * 100], ['満足度', '%', r => r.sat * 100], ['資金（一時借入を除く）', '万円', r => r.cash], ['毎月の収支', '万円/月', r => r.operating], ['借入残高', '万円', r => r.debt], ['今後 60 か月の更新負担', '万円', r => r.renewal]];
      const cmp = R.map(([n, u, f]) => `<tr><td>${n}（${u}）</td><td>${n0(f(fb[1].rows[12]))}</td><td>${n0(f(fb[1].rows[60]))}</td>${fd ? `<td>${n0(f(fd[1].rows[12]))}</td><td>${n0(f(fd[1].rows[60]))}</td>` : ''}</tr>`).join('');
      let timing = '';
      if (fd) {
        const first = (f: (r: any) => number, thr: number) => { for (let k = 1; k <= 60; k++) if (Math.abs(f(fd[1].rows[k]) - f(fb[1].rows[k])) >= thr) return k; return -1; };
        const line = (n: string, u: string, f: (r: any) => number, thr: number, lowerBetter: boolean) => {
          const k = first(f, thr); if (k < 0) return `<li>${n}：60 か月以内に目立った差は出ません</li>`;
          const d12 = f(fd[1].rows[12]) - f(fb[1].rows[12]), d60 = f(fd[1].rows[60]) - f(fb[1].rows[60]);
          const good = (d60 < 0) === lowerBetter;
          return `<li>${n}：<b>${k} か月後</b>から差が出ます（12 か月後 ${d12 >= 0 ? '+' : '−'}${n0(Math.abs(d12))}${u}、60 か月後 <span style="color:var(--${good ? 'good' : 'bad'})">${d60 >= 0 ? '+' : '−'}${n0(Math.abs(d60))}${u}</span>）</li>`;
        };
        timing = `<section><h2>計画案の効果が出る時期 <small>基準シナリオ同士の比較</small></h2>
          <ul style="margin:0;padding-left:1.2em;display:flex;flex-direction:column;gap:4px">${fc!.actions.map(a => `<li>${this.describeAction(a)}</li>`).join('')}</ul>
          <ul style="margin:0;padding-left:1.2em;display:flex;flex-direction:column;gap:3px">${line('保育の待機', ' 人', r => r.wait, 3, true)}${line('最大混雑率', '%', r => r.maxVc * 100, 3, true)}${line('人口', ' 人', r => r.pop, 30, false)}${line('資金', ' 万円', r => r.cash, 500, false)}${line('満足度', '%', r => r.sat * 100, 0.5, false)}</ul></section>`;
      }
      body = `${stale ? `<div class="card voice warn"><b>この結果は ${dateStr(m0)} 時点の試算です</b><p>その後に街が変わったので、いまの状態の予測ではありません。もう一度「試算する」を押してください。</p></div>` : ''}
        <div style="${stale ? 'opacity:.45' : ''}">
        <p class="note">基準：${dateStr(m0)} 時点の状態（0 か月）から 60 か月先まで。計算 ${(fc!.ms / 1000).toFixed(1)} 秒（${fc!.mode}）。</p>
        <div class="btnrow">${Object.entries(M).map(([k, v]) => `<button class="seg" data-act="fcmetric" data-arg="${k}" aria-pressed="${metric === k}">${v[0].split('（')[0]}</button>`).join('')}</div>
        <div class="chartbox"><h4>${name} <small>${unit}</small></h4>${chartSvg({ id: 'fc', series, fmt: v => n0(v), xLabel: i => (i === 0 ? '現在' : `${i} か月後`), zero: metric !== 'pop' }, 336, 150)}${legendHtml(series, '楽観〜慎重の幅')}</div>
        ${timing}
        <h2 style="margin-top:4px">基準シナリオの比較 <small>転入 ×1.0</small></h2>
        <table class="t"><tr><th></th><th>12 か月</th><th>60 か月</th>${fd ? '<th>案 12 か月</th><th>案 60 か月</th>' : ''}</tr>${cmp}</table>
        <h2 style="margin-top:4px">${name}の 3 シナリオ <small>${unit}</small></h2>
        ${tbl(fb, '現在のまま')}${fd ? tbl(fd, '計画案') : ''}</div>`;
    }
    return `<section><h2>将来予測 <small>ゲーム内の試算</small></h2>
      <div class="btnrow"><button class="btn primary" data-act="fcrun" ${this.fcBusy ? 'disabled' : ''}>${g.draft ? '予測を更新（現在と計画案）' : stale ? 'いまの状態で試算し直す' : '試算する（60 か月先まで）'}</button>${g.draft ? '' : `<button class="btn" data-act="draft" ${g.state.events.active.length || g.state.pendingElection || this.fcBusy ? 'disabled' : ''}>計画案をつくる</button>`}</div>
      ${body}
      <p class="note">いまの状態を複製し、複製の上で月次計算を進めた結果です。本番の状態・資金・乱数・工事・イベントには影響しません。転入の強さを 楽観 ×1.2／基準 ×1.0／慎重 ×0.8 に変えた 3 本を計算します。民間の着工や開業には乱数が入り、イベントは発生させていないので、実際の展開とはずれます。現実の都市の予測ではありません。</p>
      <p class="note">「計画案をつくる」を押すと試算モードになり、建設・道路・用途・政策を本番に反映せずに試せます。「この計画を実行」は、すべての操作が通るときだけ本番に反映します（1 件でも通らなければ何も変えず、計画案を残します）。実行はまとめて 1 回で取り消せます。</p></section>`;
  }
  private pFac(): string {
    const s = this.s;
    const row = (b: Building) => {
      const d = DEFS[b.kind], st = b.status === 'construction' ? `<span class="tag">工事中 残り ${b.remain} か月</span>` : b.status === 'renewing' ? `<span class="tag warn">更新工事 残り ${b.remain} か月</span>` : b.status === 'suspended' ? `<span class="tag bad">${b.age >= 100 ? '使用停止' : '休止'}</span>` : !b.connected ? `<span class="tag bad">道路未接続</span>` : `<span class="tag ${b.age > 80 ? 'bad' : b.age > 60 ? 'warn' : 'good'}">老朽度 ${Math.round(b.age)}</span>`;
      const cap = isBiz(b.kind) ? `雇用 ${n0(d.jobs ?? 0)} 人` : d.capacity > 1 ? (fam(b.kind) === 'fire' ? `到達 ${n0(b.effCap * 30)}m` : fam(b.kind) === 'park' ? `周辺 ${n0(b.used)} 世帯` : `${n0(b.used)} / ${n0(b.effCap)} ${d.capUnit}`) : '';
      return `<button class="item" data-act="selb" data-arg="${b.id}"><b>${bname(b)} <small class="note">${DISTRICTS[getMap(s.seed).district[idx(b.x, b.y)]]}</small></b><em>${cap}</em><small>${st}${d.staffReq ? ` ${d.staffKind} ${(b.staff ?? 0).toFixed(1)} / ${n0(staffReq(s, b))} 人` : ''}</small></button>`;
    };
    const city = s.buildings.filter(b => isCity(b.kind)), other = s.buildings.filter(b => !isCity(b.kind) && !isRes(b.kind) && !isShop(b.kind));
    const shops = s.buildings.filter(b => isShop(b.kind));
    return `<section><h2>市の施設 <small>利用 / 実効容量</small></h2>${city.map(row).join('')}</section>
      <section><h2>市以外が運営する施設</h2>${other.map(row).join('')}<p class="note">駅は鉄道事業者、交番は県、診療所と私立保育園は民間の運営です。市は協議や補助で関わりますが、建設や職員配置は決められません。</p></section>
      <section><h2>店舗 <small>${shops.length} 店・民間</small></h2><table class="t"><tr><th>店</th><th>月売上</th><th>採算</th></tr>${shops.map(b => { const d = DEFS[b.kind], be = d.fixed! / P.margin; return `<tr><td><button class="btn small" data-act="selb" data-arg="${b.id}">${bname(b)}</button></td><td>${b.status === 'construction' ? '開業準備' : n0(b.revenue) + ' 万円'}</td><td>${b.status === 'construction' ? '—' : b.revenue >= be ? '黒字' : `赤字 ${b.lossStreak} か月`}</td></tr>`; }).join('')}</table></section>`;
  }

  // ---- 選択中の情報
  renderInfo(): void {
    const el = $('info'), s = this.s, sel = this.sel;
    if (!sel || this.photo) { el.hidden = true; return; }
    el.hidden = false;
    const m = getMap(s.seed), close = `<button data-act="closeinfo" aria-label="閉じる">×</button>`;
    if (sel.tile !== undefined) {
      const i = sel.tile, x = i % W, y = (i / W) | 0;
      if (s.road[i]) {
        const t = s.road[i], cap = roadCapacity(s, i);
        el.innerHTML = `<h3>${ROAD_NAMES[t]}${close}</h3><p class="own">管理：${t === 3 ? '国（市は撤去・拡幅できず、維持費も負担しません）' : '市'}・${DISTRICTS[m.district[i]]}</p>
          <div class="rows"><span>朝の交通量 / 容量</span><b>${n0(s.vc[i] * cap)} / ${n0(cap)}<i>台/時</i></b><span>混雑率</span><b style="color:var(--${s.vc[i] > 1 ? 'bad' : 'ink'})">${pct(s.vc[i])}</b>${t !== 3 ? `<span>老朽度</span><b>${Math.round(s.roadAge[i])}</b><span>維持費</span><b>${P.roadUpkeep[t]}<i>万円/月</i></b>` : ''}</div>
          ${s.roadBoost[i] ? `<p class="note">交差点改良済み（容量 ×${s.roadBoost[i].toFixed(2)}）</p>` : ''}${s.roadAge[i] > 70 && t !== 3 ? `<p class="note">老朽度 70 超のため容量が 15% 落ちています。［道路を引く］→［補修］で直せます。</p>` : ''}`;
      } else {
        const lr = landReason(m, i);
        const td = hasSea(s) ? tsunamiDepth(s, designWave(s))[i] : 0, elv = `<p class="note elev">⛰ 海抜 ${altitude(s, i).toFixed(1)}m${hasSea(s) ? `・想定の津波（${designWave(s)}m）で${td > 0.05 ? `<b style="color:var(--bad)">浸水 ${td.toFixed(1)}m</b>` : '浸水しない'}` : ''}${liquefyRisk(s, i) ? '・<b style="color:var(--warn)">液状化のおそれ</b>' : ''}</p>`;
        el.innerHTML = `<h3>${lr ? '開発できない土地' : s.zone[i] ? ZONE_NAMES[s.zone[i]] + 'の空き区画' : REAL ? '計算上の住宅がない区画' : '空き地'}${close}</h3>${elv}<p class="own">${DISTRICTS[m.district[i]]}（${x}, ${y}）</p><p class="note">${lr || (s.zone[i] ? '道路が市外までつながり、需要と水道の余力があれば、民間が建てます。' : (REAL ? '地図に建物があっても、店・事務所・工場など、または建物データがない所は住宅として数えていません（見た目の家並みは推計）。' : '') + '用途の指定がありません。［土地の用途］で指定するか、［施設を建てる］で市の施設を建てられます。')}</p>`;
      }
      return;
    }
    const b = s.buildings.find(o => o.id === sel.b)!, d = DEFS[b.kind];
    const al = authorityLabel(b.kind), auth = `${al.name}（${al.actor}）— ${al.how}${al.why ? '。' + al.why : ''}`; // v90：5 つの行動種別
    let h = `<h3>${b.name ? `${bname(b)} <small class="note">${d.name}</small>` : d.name}${b.sandbox ? ' <span class="tag">直接配置</span>' : ''}${close}</h3><p class="own">所有・運営：${localize(d.owner)}<br>市の権限：${auth}</p>${b.osm ? '<p class="note">地図の建物から推計した街区です（30m 四方の区画ごと）。戸数・世帯構成はゲームの推計で、実際の値ではありません。</p>' : REAL && !b.name ? `<p class="note">ゲームで置いた${isRes(b.kind) ? '住宅' : '施設'}です（実在の${isRes(b.kind) ? '建物' : '施設'}ではありません）。${isRes(b.kind) ? '戸数・世帯' : '定員・職員・老朽度・費用'}などは推計（ゲーム上の仮定）です。地形・道路・鉄道は実データ（出典：${esc(dataSource().credits || 'OpenStreetMap')}${dataSource().date ? `、取得日 ${esc(dataSource().date)}` : ''}）。</p>` : b.name ? '<p class="note">名前と位置は OpenStreetMap（実データ）。定員・職員・老朽度・費用などはゲーム上の仮定で、実際の施設の値ではありません。</p>' : ''}`;
    { const ai = idx(b.x, b.y), td = hasSea(s) ? tsunamiDepth(s, designWave(s))[ai] : 0; h += `<p class="note elev">⛰ 海抜 ${altitude(s, ai).toFixed(1)}m${hasSea(s) ? `・海から ${n0(Math.max(0, seaDist(s, ai)) * 30)}m・想定の津波（${designWave(s)}m）で${td > 0.05 ? `<b style="color:var(--bad)">浸水 ${td.toFixed(1)}m</b>` : '浸水しない'}` : ''}${liquefyRisk(s, ai) ? '・<b style="color:var(--warn)">液状化のおそれ</b>' : ''}</p>`; }
    if (b.status === 'construction') h += `<p><span class="tag">工事中</span> 残り ${b.remain} か月（工期 ${b.total} か月）</p>`;
    else if (b.status === 'renewing') h += `<p><span class="tag warn">更新工事中</span> 残り ${b.remain} か月。工事中の能力は ${pct(d.renewFactor)}</p>`;
    else if (b.status === 'suspended') h += `<p><span class="tag bad">${b.age >= 100 ? '老朽化で使用停止' : '休止中'}</span></p>`;
    if (!b.connected && b.status !== 'construction') h += `<p><span class="tag bad">道路未接続</span> ${b.acc < 0 ? '道路に接していません。' : '接する道路が市外（国道）までつながっていません。'}${isRes(b.kind) ? '転出が進みます。' : '稼働できません。'}</p>`;
    if (isRes(b.kind) && b.status === 'operating') {
      const tot = sumHH(b);
      h += `<div class="rows"><span>入居 / 住戸</span><b>${n0(tot)} / ${b.units}<i>戸</i></b><span>保育に入れない子</span><b>${b.unmet.toFixed(1)}<i>人</i></b></div>
        <table class="t"><tr><th>世帯類型</th><th>世帯</th><th>満足度</th></tr>${HH_NAMES.map((n, t) => `<tr><td>${n}</td><td>${b.hh![t].toFixed(1)}</td><td>${b.hh![t] > 0.05 ? pct(b.sat[t]) : '—'}</td></tr>`).join('')}</table>
        ${(() => { const fs = familiesOf(s, b, 6); return fs.length ? `<details class="fold sub" data-k="res-${b.id}" ${this.openK.has('res-' + b.id) ? 'open' : ''}><summary><h2>住んでいる人 <small>${fs.length < Math.round(sumHH(b)) ? `${Math.round(sumHH(b))} 世帯のうち ${fs.length} 世帯` : `${fs.length} 世帯`}</small></h2></summary>${fs.map(f => this.famHtml(f, false)).join('')}</details>` : ''; })()}
        ${SV_NAMES.map((n, k) => (b.sv[k] === undefined ? '' : this.meter(n, b.sv[k]))).join('')}
        ${(() => { if (b.acc < 0) return ''; this.view.setRoute(b.acc); const r = [...this.view.routeSet]; if (r.length < 2) return ''; const worst = r.reduce((a, i) => Math.max(a, s.vc[i] || 0), 0), jam = r.filter(i => (s.vc[i] || 0) > 1).length; return `<div class="rows"><span>通勤の道筋（駅・市外まで）</span><b>${(r.length * TILE / 1000).toFixed(1)}<i>km</i></b><span>道筋でいちばん混む所</span><b style="color:var(--${worst > 1 ? 'bad' : worst > 0.8 ? 'warn' : 'good'})">${pct(worst)}</b>${jam ? `<span>容量を超える区間</span><b>${jam}<i>区間</i></b>` : ''}</div><div class="btnrow"><button class="btn small" data-act="layer" data-arg="traffic">道筋を地図で見る（水色）</button></div>`; })()}
        <p class="note">各水準は、この建物から道路をたどった距離と、施設の実効容量から計算しています。満足度は世帯類型ごとに重みが違います（例：${HH_NAMES[2]}は保育 ${pct(SAT_W[2][2])}、${HH_NAMES[4]}は買物 ${pct(SAT_W[4][5])}）。</p>`;
    } else if (isBiz(b.kind) || (!d.capacity && (d.jobs || d.visitors || d.fame))) {
      h += `<div class="rows"><span>雇用</span><b>${n0(d.jobs ?? 0)}<i>人</i></b><span>市の税収</span><b>${n0(d.bizTax ?? 0)}<i>万円/月（標準税率）</i></b>${d.use ? `<span>電力</span><b>${n0(d.use)}<i>世帯分</i></b>` : ''}${d.visitors ? `<span>来訪者</span><b>${n0(d.visitors)}<i>人/月</i></b>` : ''}</div>
        ${b.status === 'construction' ? `<p><span class="tag">誘致の交渉中</span> 残り ${b.remain} か月。開業するかは、そのときの条件（道路・電力・知名度・法人の税）しだいです${b.tries ? `（これまで ${b.tries} 回見送られました）` : ''}。</p>` : ''}
        ${(d.pollution ?? 0) >= 1 ? '<p class="note">周りの空気が悪くなり、近くの住宅の環境の満足が下がります。</p>' : ''}`;
    } else if (isShop(b.kind) && b.status === 'operating') {
      const be = d.fixed! / P.margin;
      h += `<div class="rows"><span>月売上</span><b>${man(b.revenue)}</b><span>採算に必要な売上</span><b>${man(be)}</b><span>雇用</span><b>${d.jobs}<i>人</i></b></div>
        <p>${b.revenue >= be ? '<span class="tag good">黒字</span>' : `<span class="tag bad">赤字 ${b.lossStreak} か月</span> ${b.sandbox ? '直接配置した店は閉店しませんが、売上も税収も増えません。' : b.name ? '地図にある既存の店は、赤字でも閉店しない扱いです（ゲームの仮定）。' : `${P.closeStreak} か月続くと閉店します。`}`}</p>
        <p class="note">売上は、道路で ${d.range! * 30}m 以内の世帯の買物支出を、近さと店の集客力で市内の店・市外と分け合った結果です。</p>`;
    } else if (d.capacity > 1 && b.status !== 'construction') {
      const req = staffReq(s, b), dc = designCap(s, b);
      const why: string[] = [];
      if (req > 0 && (b.staff ?? 0) < req * 0.995) why.push(`${d.staffKind}が ${(b.staff ?? 0).toFixed(1)} / ${n0(req)} 人`);
      if (b.age >= 60) why.push(`老朽度 ${Math.round(b.age)}（60 超で能力低下）`);
      if (b.status === 'renewing') why.push('更新工事中');
      if (!b.connected) why.push('道路未接続');
      const isF = fam(b.kind) === 'fire';
      h += `<div class="rows">${d.capacity > 1 && maxLv(b.kind) ? `<span>レベル</span><b>${lvOf(b)}<i> / ${maxLv(b.kind)}（能力 ${Math.round(LV_CAP[lvOf(b) - 1] * 100)}%）</i></b>` : ''}<span>設計容量</span><b>${isF ? n0(dc * 30) + '<i>m</i>' : n0(dc) + `<i>${d.capUnit}</i>`}</b><span>実効容量</span><b>${isF ? n0(b.effCap * 30) + '<i>m</i>' : n0(b.effCap) + `<i>${d.capUnit}</i>`}</b>${!isF ? `<span>${fam(b.kind) === 'park' ? '周辺の世帯' : '利用量'}</span><b>${n0(b.used)}<i>${d.capUnit}</i></b>` : ''}<span>老朽度</span><b>${Math.round(b.age)}<i>/100</i></b>${isCity(b.kind) ? `<span>維持費</span><b>${yen(upkeepOf(b), false, '/月')}</b>` : ''}${d.wage ? `<span>人件費</span><b>${yen((b.staff ?? 0) * d.wage, false, '/月')}</b>` : ''}</div>
        ${why.length ? `<p class="note"><b>実効容量が設計より小さい理由：</b>${why.join('、')}</p>` : ''}`;
      if (req > 0) {
        if (isCity(b.kind) && d.wage) h += `<div class="stepper"><span>${d.staffKind}の目標</span><button class="btn small" data-act="staff" data-arg="-1" aria-label="目標を 1 人減らす">−</button><b class="num">${b.staffTarget} 人</b><button class="btn small" data-act="staff" data-arg="1" aria-label="目標を 1 人増やす">＋</button><span class="note">現在 ${(b.staff ?? 0).toFixed(1)} 人</span></div><p class="note">採用は市全体で月 ${(d.hire * modMul(s, 'hire:' + d.staffKind)).toFixed(1)} 人まで（同じ職種の施設で分け合います）。1 人あたり月 ${d.wage} 万円。</p>`;
        else h += `<p class="note">${d.staffKind} ${(b.staff ?? 0).toFixed(1)} / ${n0(req)} 人。${b.kind === 'school' ? '県が配置します。' : '運営法人が採用します。'}市は人数を決められません。</p>`;
      }
    } else if (b.status !== 'construction' && isCity(b.kind)) {
      h += `<div class="rows">${d.visitors ? `<span>来訪者</span><b>${n0(d.visitors)}<i>人/月</i></b>` : ''}${d.fame ? `<span>知名度</span><b>+${d.fame}</b>` : ''}${d.income ? `<span>収入</span><b>${yen(d.income, false, '/月')}</b>` : ''}<span>老朽度</span><b>${Math.round(b.age)}<i>/100</i></b><span>維持費</span><b>${yen(upkeepOf(b), false, '/月')}</b>${d.wage ? `<span>人件費</span><b>${yen((b.staff ?? 0) * d.wage, false, '/月')}</b>` : ''}</div>`;
    }
    h += `<p class="note">${d.note}</p>`;
    if (b.kind === 'station' && b.status !== 'construction') {
      const lv = lvOf(b), names = ['', '駅舎', '駅ビル', '大型ターミナル'], why = stationUpCheck(s, b), sw = shinCheck(s, b);
      const cost = Math.round(P.stationUpCost[Math.min(2, lv)] * diffOf(s).cost / 100) * 100;
      h += `<div class="rows"><span>駅の規模</span><b>${names[lv]}（レベル ${lv}）</b>${b.upAt !== undefined ? `<span>拡張工事</span><b>あと ${b.upAt - s.month} か月</b>` : ''}<span>新幹線</span><b>${b.shin === undefined ? 'なし' : s.month >= b.shin ? '停車中' : `整備中（あと ${b.shin - s.month} か月）`}</b><span>朝の利用</span><b>${n0(b.used)} / ${n0(b.effCap)}<i>人</i></b></div>`;
      if (lv < 3) h += `<div class="btnrow"><button class="btn primary" data-act="stationup" data-arg="${b.id}" ${why || s.cash < cost ? 'disabled' : ''}>${lv === 1 ? '駅ビル化する' : '大型ターミナルにする'}（${yenT(cost)}・${P.stationUpMonths[lv]} か月）</button></div><p class="note">${why ?? (lv === 1 ? '駅ビルに店と事務所が入り（職 +450）、来訪者と知名度が増え、ホームが広がります（朝の利用の上限 1.4 倍）。' : 'ホテルと商業施設を合わせた駅（職 +1,100）。来訪者と知名度がさらに増え、ホームは 1.8 倍に。')}</p>`;
      if (b.shin === undefined) h += `<div class="btnrow"><button class="btn" data-act="shinkansen" data-arg="${b.id}" ${sw || s.cash < P.shinCost ? 'disabled' : ''}>新幹線の駅を誘致する（地元負担 ${yenT(P.shinCost)}・${P.shinMonths / 12} 年）</button></div><p class="note">${sw ?? '開業すると、来訪者 +2 万人/月・知名度 +12・職 +600・転入 1.12 倍・景気 +4%。オフィスやホテルが来やすくなります。'}</p>`;
      if (s.rail) h += `<p class="note">地下化：［道路を引く］→［線路の高さ］で駅の前後の線路を地下にすると、地下の駅になります。駅の増設：［施設を建てる］→［交通・広域］の「新しい駅」を線路の横に置きます。</p>`;
    }
    if (b.kind === 'airport' && b.status !== 'construction') {
      const lv = lvOf(b), names = ['', '地方空港（国内線）', '滑走路 2,500m（国際線）', '国際線ターミナル（24 時間）'], why = airportUpCheck(s, b), cost = P.airportUpCost[Math.min(3, lv + 1)] ?? 0;
      const on = new Set((s.airRoutes ?? []).map(r => r.id));
      h += `<div class="rows"><span>空港の規模</span><b>${names[lv]}</b>${b.upAt !== undefined ? `<span>拡張工事</span><b>あと ${b.upAt - s.month} か月</b>` : ''}<span>就航している路線</span><b>${on.size}<i>路線</i></b></div>`;
      if (lv < 3 && b.upAt === undefined) h += `<div class="btnrow"><button class="btn primary" data-act="airportup" data-arg="${b.id}" ${why || s.cash < cost ? 'disabled' : ''}>${lv === 1 ? '滑走路を延ばす（国際線が就航できる）' : '国際線ターミナルをつくる'}（市の負担 ${yenT(cost)}）</button></div><p class="note">${why ?? (lv === 1 ? '国・県と一緒に滑走路を 2,500m に延ばします（3 年）。海外の路線を誘致できるようになります。' : '国際線ターミナルと 24 時間の運用（2 年半）。アジアの遠い都市やハワイへの路線を誘致できます。')}</p>`;
      h += `<h4 style="margin:10px 0 4px">路線の誘致 <small>航空会社に補助を出して便を飛ばしてもらう</small></h4><table class="t"><tr><th>行き先</th><th>航空会社</th><th>補助</th><th></th></tr>${AIR_ROUTES.map(r => { const has = on.has(r.id), w = has ? null : airRouteCheck(s, r.id); return `<tr><td>${r.dest}${r.intl ? ' <span class="tag">国際</span>' : ''}</td><td>${r.airline}${r.lcc ? '（LCC）' : ''}</td><td>月 ${yenT(r.subsidy)}</td><td>${has ? `<button class="btn small" data-act="airroute" data-arg="${r.id}:0">撤退</button>` : `<button class="btn small primary" data-act="airroute" data-arg="${r.id}:1" ${w ? `disabled title="${w}"` : ''}>誘致</button>`}</td></tr>`; }).join('')}</table>
        <p class="note">誘致すると、来訪者（海外からは円安ほど多い）・知名度・空港と航空会社の職が増えます。補助は毎月かかり、就航から 1 年かけてお客さんが増えます。誘致のときに半年分の補助を前払いします。</p>`;
    }
    h += this.growthHtml(b);
    if (isRes(b.kind) && b.status !== 'construction' && !(s.mode === 'sandbox')) { const bc = buyoutCost(s, b); h += `<div class="btnrow"><button class="btn danger" data-act="buyout" data-arg="${b.id}" ${s.cash < bc ? 'disabled' : ''}>用地を買収して撤去（${yenT(bc)}）</button></div><p class="note">民間の住宅なので、土地代と補償を払って買い取ります。住んでいる世帯は転居し、支持率が少し下がります。跡地は空き地（用途の指定なし）になります。</p>`; }
    if (isCity(b.kind)) {
      h += `<div class="btnrow">${b.status === 'operating' || b.status === 'suspended' ? `<button class="btn" data-act="renew" data-arg="${b.id}" ${s.cash < renewCostOf(b) ? 'disabled' : ''}>更新する（${yenT(renewCostOf(b))}・${d.renewMonths} か月）</button>` : ''}${b.status === 'operating' ? `<button class="btn" data-act="suspend" data-arg="${b.id}">休止</button>` : b.status === 'suspended' && b.age < 100 ? `<button class="btn" data-act="suspend" data-arg="${b.id}">再開</button>` : ''}<button class="btn danger" data-act="demolish" data-arg="${b.id}">${b.status === 'construction' ? '工事を中止（未施工分の半額返金）' : `撤去（${yenT(d.cost * P.demolishRate)}）`}</button></div>`;
    } else if (s.mode === 'sandbox' && (isRes(b.kind) || isShop(b.kind))) h += `<div class="btnrow"><button class="btn danger" data-act="demolish" data-arg="${b.id}">撤去（サンドボックス）</button></div>`;
    el.innerHTML = h;
  }

  renderDraftbar(): void {
    const g = this.game, el = $('draftbar');
    const ev = g.state.events.active[0];
    if (g.draft) { el.hidden = false; const ds = g.draftSummary()!, f = this.draftFail && this.draftFail.index < g.draft.actions.length ? this.draftFail : null;
      // 確定の前に、総費用・毎月の維持費の増え方・完成の時期を出す。失敗した操作があれば、その操作と理由を出して、外せるようにする
      el.innerHTML = `<b>試算モード</b><span>操作 ${ds.n} 件は、まだ本番に反映されていません（時間は止まっています）。${ds.n ? `費用の合計 <b>${yenT(ds.cost)}</b>（実行後の資金 ${ds.cashAfter < 0 ? `<b style="color:var(--bad)">${yenT(ds.cashAfter)}：足りません</b>` : yenT(ds.cashAfter)}）・維持費 <b>${yenT(ds.upkeep, true, '/月')}</b>${ds.months ? `・完成まで最長 <b>${ds.months} か月</b>` : ''}` : ''}</span>${f ? `<span style="color:var(--bad)">実行できません：${f.index + 1} 件目「${esc(f.name)}」— ${esc(f.msg)}</span><button class="btn small" data-act="draftdrop" data-arg="${f.index}">この操作を外す</button>` : ''}<button class="btn small" data-act="fcrun">予測を更新</button><button class="btn small primary" data-act="draftcommit" ${ds.n ? '' : 'disabled'}>この計画を実行</button><button class="btn small" data-act="draftdiscard">破棄</button>`; }
    else if (ev && this.eventHidden) { el.hidden = false; el.innerHTML = `<b>対応待ち</b><span>${eventDef(ev.id).title}</span><button class="btn small primary" data-act="eventhide">選択肢を開く</button>`; }
    else el.hidden = true;
  }
  refreshTutorial(force = false): void {
    const st = this.game.state, el = $('tutorial'), t = st.tutorial;
    if (t.done || this.photo) { el.hidden = true; return; }
    let advanced = false;
    while (t.step < tut().length && tut()[t.step].done && tut()[t.step].done!(st, this)) { t.step++; advanced = true; }
    if (t.step >= tut().length) { t.done = true; el.hidden = true; return; }
    const key = String(t.step);
    if (!force && !advanced && el.dataset.k === key && !el.hidden) return;
    el.dataset.k = key; el.hidden = false;
    const step = tut()[t.step];
    const stepText = (tx: string) => (!REAL && t.step === 0 && terrainOf(this.s.seed).id !== 'coast' ? `${this.s.cityName}の市長に就任しました。${terrainOf(this.s.seed).desc}まず街を眺めてみましょう。左ドラッグで移動、右ドラッグで回転、ホイールで拡大です。` : tx);
    el.innerHTML = `<h3>${step.title}<small>${t.step + 1} / ${tut().length}</small></h3><p>${coarse() ? stepText(step.text).replace('左ドラッグで移動、右ドラッグで回転、ホイールで拡大です', '1 本指でなぞると移動、2 本指でつまむと拡大です。回転は右上の ◐ から').replace('（スペースキーで一時停止）', '').replace('左下の［🗺 地図の表示・カメラ］を開いて［保育］', '右上の ◐ を開いて、地図の［保育］') : stepText(step.text)}</p><div class="btnrow">${step.done ? '' : `<button class="btn small primary" data-act="tutnext">${t.step === tut().length - 1 ? '閉じる' : '次へ'}</button>`}<button class="btn small" data-act="tutskip">案内を終える</button>${step.done ? '<button class="btn small" data-act="tutnext">この手順を飛ばす</button>' : ''}</div>`;
    if (advanced) this.toast(`案内：${step.title}`);
  }
  renderPhoto(): void {
    const el = $('photobar');
    el.hidden = !this.photo;
    if (this.photo) el.innerHTML = `<div class="vrow"><span>フォト</span><span>時刻</span><input id="phour" type="range" min="0" max="23.9" step="0.1" value="${this.view.hour.toFixed(1)}" aria-label="時刻"><span>画角</span><input id="fov" type="range" min="18" max="75" step="1" value="${this.view.fov}" aria-label="画角"><button class="seg" data-act="cam" data-arg="${this.view.mode === 'orbit' ? 'ground' : 'orbit'}">${this.view.mode === 'orbit' ? '地上へ' : '俯瞰へ'}</button><span>天気</span><select id="pwx" aria-label="天気">${[['', 'いまの天気'], ['clear', '晴れ'], ['cloudy', 'くもり'], ['rain', '雨'], ['storm', '雷雨'], ['snow', '雪'], ['fog', '霧']].map(([v, n]) => `<option value="${v}" ${this.view.weatherForce === v ? 'selected' : ''}>${n}</option>`).join('')}</select><label class="chk"><input type="checkbox" id="pmini" ${this.mini ? 'checked' : ''}> ミニチュア風</label><label class="chk"><input type="checkbox" id="pdof" ${this.view.dof ? 'checked' : ''}> 背景ぼかし</label><span>色</span><select id="pfilter" aria-label="写真の色">${Object.entries(PFILTERS).map(([v, f]) => `<option value="${v}" ${this.pfilter === v ? 'selected' : ''}>${f[0]}</option>`).join('')}</select><label class="chk"><input type="checkbox" id="pstamp" ${this.pstamp ? 'checked' : ''}> 日付を入れる</label><button class="btn small primary" data-act="shoot">撮影</button><button class="btn small" data-act="photoend">終了</button></div>`;
  }
  /** v90：課題の導線・政策の試算・声の詳細・年次報告 */
  confirmPlay = false;
  /** v90：遊び方の入口（経営・自由建築・撮影・街歩き） */
  private playStyles(): string {
    const s = this.game.state, sb = s.mode === 'sandbox';
    const c = (icon: string, name: string, text: string, btn: string) => `<div class="f90-play-c"><b>${icon} ${name}</b><small>${text}</small>${btn}</div>`;
    return `<section class="f90-play"><h3>遊び方</h3><div class="f90-play-g">
      ${c('🏛', '経営', '市長として予算・選挙・公約の中で街をやりくりします。費用と土地の持ち主の制約があります。', sb ? '<small>いまは自由建築です</small>' : '<span class="tag good">いまの遊び方</span>')}
      ${c('🧱', '自由建築', '費用・土地の持ち主・選挙を気にせず、建物を直接置いて街をつくります（「直」の道具）。', sb ? '<span class="tag good">いまの遊び方</span>' : `<button class="btn small ${this.confirmPlay ? 'danger' : ''}" data-act="play" data-arg="sandbox">${this.confirmPlay ? '本当に切り替える（もう一度押す）' : '自由建築にする'}</button>`)}
      ${c('📷', '撮影', '時刻・天気・ぼかしを決めて、街の写真を撮ります。街の計算は止まりません。', '<button class="btn small" data-act="play" data-arg="photo">撮影をはじめる</button>')}
      ${c('🚶', '街歩き', '地上の目線で、自分のつくった街を歩きます。', '<button class="btn small" data-act="play" data-arg="ground">街を歩く</button>')}
      </div>${!sb && this.confirmPlay ? '<p class="note">自由建築にすると、この街の選挙・公約・年次報告はなくなり、この街は経営に戻せません。経営の続きを残したいときは、先に「保存・読込」でファイルに保存してください。</p>' : ''}</section>`;
  }
  ix: IssueFlow | null = null; ptrial: PolicyTrial | null = null; vsel = -1; reportOpen: AnnualReport | null = null;
  newsOpen = false; confirmRun = false; statsOpen = false; statsRange = 0;
  menuTab: 'set' | 'save' = 'save';
  fontSize: 's' | 'm' | 'l' = (() => { try { const v = localStorage.getItem('sumu-fs'); return v === 's' || v === 'l' ? v : 'm'; } catch { return 'm'; } })();
  /** お知らせのベル：まだ見ていない数 */
  applyFont(): void { document.body.classList.remove('fs-s', 'fs-m', 'fs-l'); document.body.classList.add('fs-' + this.fontSize); try { document.body.classList.toggle('explain', localStorage.getItem('sumu-explain') === '1'); } catch { /* なし */ } }
  renderBell(): void {
    const b = document.querySelector('.bellbtn'); if (!b) return;
    const s = this.game.state, n = Math.max(0, (s.news?.length ?? 0) - (s.newsSeen ?? 0));
    b.innerHTML = `🔔${n ? `<span class="bdot">${n > 99 ? '99+' : n}</span>` : ''}`; b.setAttribute('aria-label', `お知らせ${n ? `（未読 ${n} 件）` : ''}`);
  }
  private newsHtml(): string {
    const s = this.game.state, news = (s.news ?? []).slice().reverse(), seen = s.newsSeen ?? 0, N = s.news?.length ?? 0;
    const evs = s.events.log.slice(-20).reverse();
    const icon = (t: string) => /^🏅|^⭐|^📊/.test(t) ? '' : /誘致|来ません|来てくれ|開業|進出/.test(t) ? '🏢 ' : /初仕事/.test(t) ? '🎯 ' : '・';
    return `<div class="dialog news" role="dialog" aria-modal="true" aria-label="お知らせ"><header><small>勲章・ランキング・誘致の結果・市長の初仕事など</small><h2>🔔 お知らせ</h2></header><div class="body">
      ${news.length ? `<ul class="newslist">${news.map((x, k) => `<li class="${N - k > seen ? 'new' : ''}"><small>${dateStr(x.m)}</small><span>${icon(x.t)}${esc(x.t)}${x.at !== undefined ? ` <button class="btn small" data-act="newsgo" data-arg="${x.at}">📍 地図で見る</button>` : ''}</span></li>`).join('')}</ul>` : '<p class="note">まだお知らせはありません。時間を進めると、誘致の結果や勲章などがここに残ります。</p>'}
      ${evs.length ? `<h3>できごとの記録</h3><ul class="newslist">${evs.map(e => `<li><small>${dateStr(e.month)}</small><span><b>${esc(e.title)}</b>${e.choice ? `：${esc(e.choice)}` : ''}</span></li>`).join('')}</ul>` : ''}
      <div class="btnrow"><button class="btn primary" data-act="news">閉じる</button></div></div></div>`;
  }
  tlBusy = false; cityFoldInit = false; confirmLoad = '';
  peopleOpen = false; countAt: number | null = null; countFor = -1; countDone = -1; callShown = -1;
  private famHtml(f: Family, withHome: boolean): string {
    return `<div class="fam"><b>${moodIcon(f.sat)} ${esc(famTitle(f))}${withHome ? ` <small>${esc(famWhere(this.s, f))}・${esc(DEFS[f.home.kind].name)}</small>` : ''}</b>
      <ul>${f.people.map(p => `<li>${esc(p.name)}（${p.age}）<small>${esc(p.role)}</small></li>`).join('')}</ul><p class="say">「${esc(f.note)}」</p>${withHome ? `<button class="btn small" data-act="famhome" data-arg="${f.home.id}">🏠 家を見る</button>` : ''}</div>`;
  }
  albumOpen = false;
  /** 実績のアルバム：写真・記念カード、勲章、称号、これまでの街、年表のおもな出来事 */
  private albumHtml(): string {
    const s = this.game.state, M = s.mayor, ph = albumList(), cr = loadCareer();
    return `<div class="dialog wide album" role="dialog" aria-modal="true" aria-label="アルバム"><header><small>市長としての歩み</small><h2>📔 アルバム</h2></header><div class="body">
      <h3>写真と記念カード <small>${ph.length} 枚（最大 16 枚。古いものから入れかわります）</small></h3>${ph.length ? `<div class="pgrid">${ph.map((p, k) => `<figure><img src="${p.u}" alt="${esc(p.t)}"><figcaption>${esc(p.t)}<button class="x" data-act="albumdel" data-arg="${k}" aria-label="消す">×</button></figcaption></figure>`).join('')}</div>` : '<p class="note">写真モードで撮った写真と、記念カードがここに残ります。</p>'}
      <h3>称号</h3><div class="titles">${REAL ? '' : cityTitles(s).map(t => `<span>🏅 ${t}</span>`).join('')}</div>
      <h3>勲章 <small>${M ? Object.keys(M.medals).length : 0} / ${MEDALS.length}</small></h3><div class="mrow">${M ? MEDALS.filter(m => M.medals[m.id] !== undefined).map(m => `<span title="${esc(m.desc)}">🏅 ${m.name}</span>`).join('') || '<small>まだありません</small>' : ''}</div>
      <h3>これまでの街</h3>${cr.cities.length ? `<table class="t">${cr.cities.slice().reverse().map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.terrain)}</td><td>${c.years} 年目</td><td>人口 ${n0(c.pop)}</td><td>Lv${c.lv}</td></tr>`).join('')}</table>` : '<p class="note">この街が最初の街です。</p>'}
      <h3>おもな出来事</h3><ul class="chron">${(s.pol?.chron ?? []).filter(c => /^(🗳|🎉|🏆|⚠|🏗)/u.test(c.t)).slice(-20).reverse().map(c => `<li><i>${dateStr(c.m)}</i>${esc(c.t)}</li>`).join('') || '<li>まだありません</li>'}</ul>
      <div class="btnrow"><button class="btn primary" data-act="album">閉じる</button></div></div></div>`;
  }
  private peopleHtml(): string {
    const s = this.game.state, list = featured(s, 10);
    return `<div class="dialog people" role="dialog" aria-modal="true" aria-label="住民に会う"><header><small>${dateStr(s.month)}・毎月ちがう人に会えます</small><h2>👥 住民に会う</h2></header><div class="body">
      <p class="note">住民は世帯の数と構成から計算していますが、ひとりひとりに名前・年齢・家族・勤め先・通う園や学校があり、同じ家ではいつも同じ人です（年月がたつと年をとります）。家を選ぶと、そこに住む人が見られます。</p>
      <h3>📒 追いかけている住民 <small>${CIT_N} 人</small></h3><p class="note">この ${CIT_N} 人は、毎月それぞれが判断して暮らしています（就職・結婚・出産・定年・住みかえ・転出）。暮らしに不満が続くと、よりよい家へ移ったり、市外へ出て行ったりします。去った人の代わりに、新しく引っ越してきた人を追います。</p>
      <div class="cits">${(() => { const byId = new Map(s.buildings.map(b => [b.id, b])); return [...citsOf(s)].sort((a, b) => (a.gone ? 1 : 0) - (b.gone ? 1 : 0) || (b.log.at(-1)?.m ?? 0) - (a.log.at(-1)?.m ?? 0)).slice(0, 24).map(c => { const h = byId.get(c.home), j = c.job >= 0 ? byId.get(c.job) : undefined; return `<div class="cit ${c.gone ? 'gone' : ''}"><b>${c.mood >= 0.72 ? '😊' : c.mood >= 0.6 ? '🙂' : c.mood >= 0.52 ? '😐' : '😟'} ${esc(c.name)}（${Math.floor(c.age)}）</b><small>${c.gone ? esc(c.gone) : `${h ? DEFS[h.kind].name : ''}・${j ? `${DEFS[j.kind].name}で働く` : c.age >= 65 ? '引退' : c.age < 18 ? '学生' : '仕事を探している'}${c.mar ? '・既婚' : ''}${c.kids ? `・子 ${c.kids} 人` : ''}`}</small><ul>${[...c.log].reverse().slice(0, 3).map(l => `<li><i>${dateStr(l.m)}</i> ${esc(l.t)}</li>`).join('')}</ul>${!c.gone && h ? `<div class="btnrow"><button class="btn small" data-act="famhome" data-arg="${h.id}">🏠 家を見る</button>${s.pol?.hero === c.id ? '<small>⭐ 主人公</small>' : `<button class="btn small" data-act="hero" data-arg="${c.id}">⭐ 主人公にする</button>`}</div>` : ''}</div>`; }).join(''); })()}</div>
      <h3>👨‍👩‍👧 今月の住民 <small>世帯の数から</small></h3>
      <div class="famgrid">${list.map(f => this.famHtml(f, true)).join('') || '<p class="note">まだ住民がいません。</p>'}</div>
      <div class="btnrow"><button class="btn primary" data-act="people">閉じる</button></div></div></div>`;
  }
  /** 統計のグラフ（人口・資金・収支・満足・待機・混雑・全国順位） */
  private statsHtml(): string {
    const s = this.game.state, H0 = s.history, R = this.statsRange, h = R ? H0.slice(-R) : H0;
    const ch = (id: string, title: string, unit: string, vals: number[], fmt: (v: number) => string, color = 'var(--c1)', zero = false) =>
      `<div class="chartbox"><h4>${title} <small>${unit}</small></h4>${chartSvg({ id, series: [{ name: title, color, values: vals }], fmt, zero, xLabel: i => dateStr(h[Math.min(h.length - 1, i)].month) }, 340, 120)}</div>`;
    const rk = s.mayor?.ranks ?? [];
    return `<div class="dialog stats" role="dialog" aria-modal="true" aria-label="統計"><header><small>${dateStr(h[0]?.month ?? 0)} 〜 ${dateStr(s.month)}</small><h2>📈 街の統計</h2></header><div class="body">
      <div class="btnrow">${([[0, 'ぜんぶ'], [120, '10 年'], [60, '5 年'], [24, '2 年']] as const).map(([n, t]) => `<button class="seg" data-act="statsrange" data-arg="${n}" aria-pressed="${R === n}">${t}</button>`).join('')}</div>
      ${h.length < 3 ? '<p class="note">時間を進めると、ここに推移が出ます。</p>' : `<div class="chartgrid">
        ${ch('st-pop', '人口', '人', h.map(x => x.pop), v => n0(v))}
        ${ch('st-cash', '市の資金', '万円', h.map(x => x.cash), v => n0(v), 'var(--c2)')}
        ${ch('st-op', '毎月の収支', '万円/月', h.map(x => x.op), v => n0(v), '#6b8e23', true)}
        ${ch('st-sat', '暮らしの満足', '%', h.map(x => x.sat * 100), v => v.toFixed(0), '#2e8b57')}
        ${ch('st-wait', '保育の待機', '人', h.map(x => x.wait), v => n0(v), '#c0392b', true)}
        ${ch('st-vc', '朝の最大混雑率', '%', h.map(x => x.maxVc * 100), v => v.toFixed(0), '#8e44ad')}
        ${rk.length >= 2 ? `<div class="chartbox"><h4>全国ランキング（総合） <small>位・上ほど良い</small></h4>${chartSvg({ id: 'st-rank', series: [{ name: '総合順位', color: 'var(--c1)', values: rk.map(r => -r.total) }], fmt: v => n0(-v), xLabel: i => `${rk[Math.min(rk.length - 1, i)].year} 年度` }, 340, 120)}</div>` : ''}
      </div>`}
      <div class="btnrow"><button class="btn primary" data-act="stats">閉じる</button></div></div></div>`;
  }
  /** 画面の中の窓（公約の選択など）を描き直す。同じ窓なら、読んでいた位置（スクロール）を保つ */
  renderModal(): void {
    const el = document.getElementById('modal'), b0 = el?.querySelector('.dialog .body') as HTMLElement | null, key = el?.querySelector('.dialog')?.getAttribute('aria-label') ?? '', top = b0?.scrollTop ?? 0, dtop = (el?.querySelector('.dialog') as HTMLElement | null)?.scrollTop ?? 0, mtop = el?.scrollTop ?? 0;
    this.renderModal0();
    const d1 = el?.querySelector('.dialog') as HTMLElement | null;
    if (d1 && key && d1.getAttribute('aria-label') === key) { const b1 = d1.querySelector('.body') as HTMLElement | null; if (b1) b1.scrollTop = top; d1.scrollTop = dtop; el!.scrollTop = mtop; }
  }
  private renderModal0(): void {
    const el = $('modal'), g = this.game, s = g.state;
    const ev = s.events.active[0], er = s.pendingElection;
    if (this.reportOpen) { el.hidden = false; el.innerHTML = reportHtml(this.reportOpen); return; }
    if (this.newsOpen) { el.hidden = false; el.innerHTML = this.newsHtml(); return; }
    if (this.peopleOpen) { el.hidden = false; el.innerHTML = this.peopleHtml(); return; }
    if (this.albumOpen) { el.hidden = false; el.innerHTML = this.albumHtml(); return; }
    if (this.statsOpen) { el.hidden = false; el.innerHTML = this.statsHtml(); return; }
    if (this.shot) {
      el.hidden = false;
      el.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="撮影した写真"><header><small>フォトモード</small><h2>撮影しました</h2></header><div class="body"><img src="${this.shot}" alt="撮影した街の写真" style="width:100%;border-radius:6px"><p class="note">保存が始まらないときは、画像を右クリック（スマートフォンは長押し）して保存してください。</p><div class="btnrow"><button class="btn primary" data-act="shotclose">閉じる</button></div></div></div>`;
    } else if (this.menu) {
      el.hidden = false;
      const saveHtml = `

        ${g.saveFail ? `<div class="savefail" role="alert"><b>未保存</b>　${esc(g.saveFail.where)}に失敗しました（${dateStr(g.saveFail.month)}）。${esc(g.saveFail.msg)}<div class="btnrow"><button class="btn primary" data-act="savefile">ファイルに保存する</button><button class="btn" data-act="saveretry">もう一度保存する</button></div></div>` : ''}
        <p class="note">${g.lastOk ? `最後に保存できたのは ${dateStr(g.lastOk.month)}（${esc(g.lastOk.where)}・${new Date(g.lastOk.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）です。` : 'この回は、まだ保存していません。'}</p>
        <div class="btnrow"><button class="btn primary" data-act="save">このブラウザに保存</button><button class="btn" data-act="savefile">ファイルに保存</button><button class="btn" data-act="load" ${g.hasLocal() ? '' : 'disabled'}>ブラウザの保存を読み込む</button></div>
        <table class="t slots"><tr><th>保存の枠</th><th>中身</th><th></th></tr>${([1, 2, 3, 'auto', 'prev'] as const).map(n => { const inf = g.slotInfo(n); return `<tr><td>${n === 'auto' ? '自動（毎年 4 月）' : n === 'prev' ? 'ひとつ前の自動保存' : `枠 ${n}`}</td><td>${inf ? `${esc(inf.text)}<br><small>${new Date(inf.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>` : '<small>空き</small>'}</td><td class="slotbtn">${n === 'auto' || n === 'prev' ? '' : `<button class="btn small" data-act="slotsave" data-arg="${n}">保存</button>`}<button class="btn small" data-act="slotload" data-arg="${n}" ${inf ? '' : 'disabled'}>読み込む</button></td></tr>`; }).join('')}</table>
        <div class="btnrow"><button class="btn small" data-act="cloudsave">☁ クラウドに保存</button><button class="btn small" data-act="cloudload">☁ クラウドから読み込む</button></div><p class="note">クラウドの保存は、claude.ai の公開ページで開いたときだけ使えます（あなただけが読めます）。別の端末で同じページを開けば続きから遊べます。</p>
        <p class="note">保存はこのブラウザの中だけに残ります。別の端末へ移すときは、下の「書き出す」で出たテキストを保管し、移した先で貼り付けて「貼り付けたテキストを読み込む」を押してください。</p>
        <textarea id="iotext" class="io" aria-label="保存データのテキスト" placeholder="ここに保存データのテキストが出ます。読み込むときはここに貼り付けます。"></textarea>
        <div class="btnrow"><button class="btn" data-act="export">書き出す</button><button class="btn" data-act="import">貼り付けたテキストを読み込む</button><label class="btn" style="cursor:pointer">ファイルから読み込む<input id="loadfile" type="file" accept=".json,application/json,text/plain" hidden></label></div>
        <hr style="width:100%;border:0;border-top:1px solid var(--line)">
        <div class="btnrow"><button class="btn ${this.confirmNew === 'full' ? 'danger' : ''}" data-act="new" data-arg="full">${this.confirmNew === 'full' ? 'いまの街を消して始める（もう一度押す）' : '新しく始める（任期 48 か月）'}</button><button class="btn ${this.confirmNew === 'short' ? 'danger' : ''}" data-act="new" data-arg="short">${this.confirmNew === 'short' ? 'いまの街を消して始める（もう一度押す）' : '体験版で始める（任期 24 か月）'}</button></div>
        <h3 style="margin:4px 0 0;font-size:14px">タイトル（地図を選ぶ画面）へ戻る</h3>
        <div class="btnrow"><button class="btn primary" data-act="titlesave">保存してタイトルへ</button><button class="btn ${this.confirmNew === 'title' ? 'danger' : ''}" data-act="title">${this.confirmNew === 'title' ? '保存していない進み具合は消えます。タイトルへ（もう一度押す）' : '保存せずにタイトルへ'}</button></div>
        <p class="note">保存した街は、タイトルでその地図の「続きから」で再開できます。左上の街の名前を押しても、このメニューが開きます。</p>
`;
      const setHtml = `
        <div class="btnrow"><span>文字の大きさ</span>${(['s', 'm', 'l'] as const).map(k => `<button class="seg" data-act="fontsize" data-arg="${k}" aria-pressed="${this.fontSize === k}">${({ s: '小', m: '中', l: '大' })[k]}</button>`).join('')}</div>
        <p class="note">資料・道具の一覧・お知らせなどの文字の大きさです（地図の上の名札は変わりません）。</p>
        <div class="btnrow"><span>難易度</span>${(['easy', 'normal', 'hard'] as const).map(k => `<button class="seg" data-act="diff" data-arg="${k}" aria-pressed="${(s.difficulty ?? 'normal') === k}">${DIFFS[k].name}</button>`).join('')}</div>
        <p class="note">${diffOf(s).desc}。市長レベル：${mayorDiff(s).text}。途中で変えても、それまでの街はそのままです。</p>
        <div class="btnrow"><span>音</span><button class="seg" data-act="sound" aria-pressed="${sound.set.on}">${sound.set.on ? '🔊 音あり' : '🔇 消音'}</button>${(['bgm', 'env', 'sfx', 'voice'] as const).map(k => `<button class="seg" data-act="sndset" data-arg="${k}" aria-pressed="${sound.set[k]}">${({ bgm: 'BGM', env: '街の音', sfx: '効果音', voice: '人の声（読み上げ）' })[k]}</button>`).join('')}</div>
        <label class="switch">音量 <input type="range" id="sndvol" min="0" max="1" step="0.05" value="${sound.set.vol}"></label>
        <p class="note">音はすべてその場で合成しています。iPhone はマナーモード（消音スイッチ）だと鳴りません。人の声は端末の読み上げ機能を使います。</p>
        <div class="btnrow"><span>軽量表示</span><button class="seg" data-act="lite" aria-pressed="${this.view.lite}">${this.view.lite ? 'オン（スマホ向け）' : 'オフ'}</button></div>
        <p class="note">空き地の田畑や木立を減らし、人と車を少なくして、影を軽くします。スマホではふだんオンです。</p>
        <label class="switch">描画の品質 <select id="quality"><option value="high" ${this.view.quality === 'high' ? 'selected' : ''}>高（影 2048・高解像度）</option><option value="mid" ${this.view.quality === 'mid' ? 'selected' : ''}>中</option><option value="low" ${this.view.quality === 'low' ? 'selected' : ''}>低（影なし）</option></select></label>
        <details><summary>操作のしかた</summary><p class="note">左ドラッグ：移動（道具を選んでいるときは範囲指定）／右ドラッグ：回転／ホイール：拡大縮小／W A S D・矢印：移動／Q E：回転／R F：拡大縮小／スペース：一時停止／1 2 3：速度／Esc：道具をやめる。タッチでは 1 本指で移動、2 本指で拡大縮小です。</p></details>
`;
      el.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="メニュー"><header><small>スムシティ Phase 1</small><h2>保存・設定</h2></header><div class="body">
        <div class="btnrow mtabs"><button class="seg" data-act="menutab" data-arg="set" aria-pressed="${this.menuTab === 'set'}">⚙ 設定</button><button class="seg" data-act="menutab" data-arg="save" aria-pressed="${this.menuTab === 'save'}">💾 保存・読込・はじめから</button></div>
        ${this.menuMsg ? `<p role="status"><b>${this.menuMsg}</b></p>` : ''}
        ${this.menuTab === 'set' ? this.playStyles() : ''}
        ${this.menuTab === 'save' ? saveHtml : setHtml}
        <div class="btnrow"><button class="btn primary" data-act="menu">閉じる</button></div></div></div>`;
    } else if (s.over && !this.overSeen) {
      // 街の終わり：人口が 0 になった。どこまで育ったかと、終わりに向かった理由の手がかり
      el.hidden = false;
      const yrs = Math.floor(s.month / 12) + 1, pm = s.peakMonth ?? 0, last = s.ledger.at(-1);
      const susp = s.buildings.filter(b => b.status === 'suspended').length, debt = s.loans.reduce((a, l) => a + l.remaining, 0);
      el.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="ゲームオーバー"><header><small>${dateStr(s.over.month)}</small><h2>ゲームオーバー：${esc(s.over.reason)}</h2></header><div class="body">
        <p>${esc(s.cityName)}は ${yrs} 年目に、住む人がいなくなりました。</p>
        <table class="t"><tr><th>街の記録</th><th></th></tr>
          <tr><td>いちばん多かった人口</td><td class="num">${n0(s.peakPop ?? 0)} 人（${Math.floor(pm / 12) + 1} 年目）</td></tr>
          <tr><td>市長の任期</td><td class="num">${s.term} 期・選挙 ${s.elections.filter(e => e.win).length} 勝 ${s.elections.filter(e => !e.win).length} 敗</td></tr>
          <tr><td>終わりの借入残高</td><td class="num">${yenT(debt)}</td></tr>
          <tr><td>止まっていた施設</td><td class="num">${susp} か所</td></tr>
          <tr><td>最後の月の収支</td><td class="num">${last ? yenT(last.operating) : '—'}</td></tr></table>
        <p class="note">人が減り始めたら、税を上げすぎていないか、水道や保育などの施設が老朽化で止まっていないか、まず確かめましょう。人が減ると税収が減り、施設を直せなくなって、さらに人が減ります。</p>
        <div class="btnrow"><button class="btn primary" data-act="overnew">新しく始める</button><button class="btn" data-act="overtitle">タイトルへ</button><button class="btn" data-act="overlook">街を眺める（時間は進みません）</button></div></div></div>`;
    } else if (er && this.countDone !== er.month) {
      // 開票速報：開票率が上がるにつれて票が伸び、当選確実が出る（約 7 秒）
      el.hidden = false;
      if (this.countAt === null || this.countFor !== er.month) { this.countAt = performance.now(); this.countFor = er.month; }
      const t = Math.min(1, (performance.now() - this.countAt) / 7000), rate = Math.round(100 * (1 - Math.pow(1 - t, 1.6)));
      const rival = s.pol?.rival && s.pol.rival.term === er.term ? s.pol.rival.name : '新人候補', total = Math.round(s.stats.pop * 0.78 * 0.52);
      const wob = (1 - t) * 6 * Math.sin(t * 17), me = Math.max(5, Math.min(95, er.vote + wob)), call = t >= 0.62 || (Math.abs(er.vote - WIN_VOTE) > 9 && t >= 0.35);
      const meV = Math.round(total * rate / 100 * me / 100), opV = Math.round(total * rate / 100 * (100 - me) / 100), mx = Math.max(meV, opV, 1);
      el.innerHTML = `<div class="dialog count" role="dialog" aria-modal="true" aria-label="開票速報"><header class="tv"><small>📺 ${esc(s.cityName)}長選挙</small><h2>開票速報 <span class="rate">開票率 ${rate}%</span></h2></header><div class="body">
        ${[['現職', '市長（あなた）', meV, er.win], ['新人', rival, opV, !er.win]].map(([tag, nm, v, w]) => `<div class="cand-row ${call && w ? 'win' : ''}"><div class="cn"><small>${tag}</small><b>${esc(String(nm))}</b></div><div class="cb"><i style="width:${Math.round((Number(v) / mx) * 100)}%"></i></div><div class="cv">${n0(Number(v))}<small>票</small></div>${call && w ? `<span class="kakujitsu ${this.callShown === er.month ? '' : 'pop'}">当選確実</span>` : ''}</div>`).join('')}
        <p class="note">${t < 1 ? '開票作業が進んでいます…' : '開票が終わりました。'}</p>
        <div class="btnrow">${t < 1 ? '<button class="btn" data-act="countskip">結果へ進む</button>' : '<button class="btn primary" data-act="countskip">結果の内訳を見る</button>'}</div></div></div>`;
      if (call) this.callShown = er.month;
      if (t < 1) setTimeout(() => { if (this.countFor === er.month && this.countDone !== er.month) this.renderModal(); }, 120);
    } else if (er) {
      el.hidden = false;
      el.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="選挙結果"><header><small>${dateStr(er.month)}・${er.term} 期目の任期満了</small><h2>${(er as any).comeback ? (er.win ? '当選しました（返り咲き）' : '届きませんでした') : er.win ? '再選されました' : '落選しました'}</h2></header><div class="body">
        <div class="vote"><b>${voteText(er.vote)}<span style="font-size:18px">%</span></b><span>得票率（簡略化した計算）</span></div>
        <table class="t"><tr><th>評価の内訳</th><th>得票への影響</th></tr><tr><td>基準</td><td>50.0</td></tr>${er.parts.map(p => `<tr><td>${p.label}</td><td>${p.v >= 0 ? '+' : '−'}${Math.abs(p.v).toFixed(1)}</td></tr>`).join('')}</table>
        ${s.goals.length ? `<table class="t"><tr><th>公約</th><th>結果</th></tr>${s.goals.map((g, i) => `<tr><td>${GOALS.find(o => o.id === g.id)?.desc(g.target) ?? g.id}</td><td>${er.pledgesKept[i] ? '達成' : '未達'}</td></tr>`).join('')}</table>` : ''}
        <table class="t"><tr><th>世帯類型</th><th>満足度</th></tr>${HH_NAMES.map((n, t) => `<tr><td>${n}</td><td>${pct(er.typeSupport[t])}</td></tr>`).join('')}</table>
        <p class="note">暮らしの満足（投票率で重みづけ）、公約、支持率、財政、選挙戦、当日の風向き（乱数）から得票率を出しています。</p>
        <p>${er.win ? '次の任期（' + s.termLength + ' か月）が始まります。次の任期の公約を選びます。' : ((er as any).comeback ? 'サンドボックスのまま街づくりを続けられます。12 か月後にまた立候補できます。' : '任期は終わりましたが、サンドボックスとして街づくりを続けられます。左に［直接配置］が加わります。街を立て直せば、12 か月後から［任期］タブで再び立候補できます。')}</p>
        <div class="btnrow"><button class="btn primary" data-act="election">${er.win ? ((er as any).comeback ? '新しい任期へ' : '次の任期へ') : 'サンドボックスで続ける'}</button></div></div></div>`;
    } else if (s.mode === 'term' && s.goalPick && !g.draft) {
      // 公約（任期の目標）を 3 つ選ぶ。初めての任期ではビジョンも
      const sel = new Set(this.gp);
      el.hidden = false;
      el.innerHTML = `<div class="dialog wide" role="dialog" aria-modal="true" aria-label="公約を選ぶ"><header><small>${s.term} 期目の任期（${s.termLength} か月）のはじめに</small><h2>公約を 3 つ掲げてください</h2></header><div class="body">
        <p>任期の終わりの選挙では、暮らしの満足に加えて、公約をどれだけ果たしたかで得票が変わります。<b>★が多い公約ほど難しく、達成すれば票が大きく伸び、届かないと減ります</b>。目標の値は、いまの街の状態から決まります。</p>
        ${s.term === 1 && !s.vision ? `<h3 style="margin:6px 0 0">難易度 <small class="note">あとから［保存・設定］で変えられます</small></h3>
        <div class="goalgrid">${(['easy', 'normal', 'hard'] as const).map(k => `<button class="opt" data-act="diff" data-arg="${k}" aria-pressed="${(s.difficulty ?? 'normal') === k}"><b>${(s.difficulty ?? 'normal') === k ? '✓ ' : ''}${DIFFS[k].name}</b><small>${DIFFS[k].desc}</small><small class="mdiff">市長レベル：${MAYOR_DIFF[k].text}</small></button>`).join('')}</div>` : ''}
        ${s.term === 1 && s.month === 0 ? `<h3 style="margin:6px 0 0">挑戦モード <small class="note">任意。目標つきの遊び方で、達成すると市長ポイントが入ります。任期を始めるまでは選び直せます（もう一度押すと取り消し）。始めたあとは変えられません</small></h3>
        <div class="goalgrid">${CHALLENGES.map(c => `<button class="opt" data-act="challenge" data-arg="${c.id}" aria-pressed="${(s.challenge?.id ?? this.gc) === c.id}" ${s.challenge && s.challenge.id !== c.id ? 'disabled' : ''}><b>${(s.challenge?.id ?? this.gc) === c.id ? '✓ ' : ''}${c.name}</b><small>${c.desc}</small><small class="perk">目標：${c.goal}（+${c.pts} pt）</small></button>`).join('')}</div>` : ''}
        ${!s.vision ? `<h3 style="margin:6px 0 0">中長期のビジョン <small class="note">3 期（12 年）かけて目指す街の姿。選ぶと関係する公約が入ります。選び直すと公約も入れ替わります（任期を始めたあとは変えられません）</small></h3>
        <div class="goalgrid">${VISIONS.map(v => `<button class="opt" data-act="gvision" data-arg="${v.id}" aria-pressed="${this.gv === v.id}"><b>${this.gv === v.id ? '✓ ' : ''}${v.name}</b><small>${v.desc}</small>${VISION_PERKS[v.id] ? `<small class="perk">特典：${VISION_PERKS[v.id].text}。専用施設「${DEFS[VISION_PERKS[v.id].kind].name}」</small>` : ''}</button>`).join('')}</div>` : `<p class="note">ビジョン：<b>${VISIONS.find(v => v.id === s.vision)?.name ?? ''}</b>（進み具合 ${Math.round(visionProgress(s) * 100)}%）</p>`}
        <h3 style="margin:6px 0 0">公約 <small class="note">${sel.size} / 3 を選択中</small></h3>
        <div class="goalgrid">${GOALS.map(gd => { const on = sel.has(gd.id), t = gd.target(s), v = gd.value(s); const met = gd.id !== 'fiscal' && (gd.lower ? v <= t : v >= t); return `<button class="opt" data-act="gpick" data-arg="${gd.id}" aria-pressed="${on}"><b>${on ? '✓ ' : ''}${gd.name} <span style="color:var(--warn)">${'★'.repeat(met ? 1 : gd.diff)}</span>${met ? ' <span class="tag good">いま達成・維持</span>' : ''}</b><small>${gd.desc(t)}。いま ${gd.id === 'fiscal' ? (v >= 0 ? '黒字' : '赤字') : n0(v) + (gd.unit === '%' ? '%' : ' ' + gd.unit)}</small></button>`; }).join('')}</div>
        <div class="btnrow"><button class="btn primary" data-act="gok" ${sel.size === 3 ? '' : 'disabled'}>この公約で任期を始める</button><button class="btn" data-act="auto">CPU にまかせる（オートプレイ）</button></div><p class="note">オートプレイでは、CPU が公約を選び、毎月の建設・できごとへの対応・税を判断します。右上の［オート］でいつでも手動に戻せます。</p></div></div>`;
    } else if (ev && !this.eventHidden && !g.draft) {
      const d = eventDef(ev.id);
      const teamVen = ev.id.startsWith('team') && ev.target >= 0 && ev.target <= 2 ? s.buildings.find(o => SPORTS[(['soccer', 'baseball', 'basket'] as const)[ev.target]].venue.includes(o.kind)) : undefined; // プロチームのできごとは本拠地を映す
      const tile = teamVen ? idx(teamVen.x, teamVen.y) : ev.target >= 0 && ev.target < W * H && !s.buildings.some(b => b.id === ev.target) ? ev.target : (() => { const b = s.buildings.find(o => o.id === ev.target); return b ? idx(b.x, b.y) : -1; })();
      el.hidden = false;
      el.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="${d.title}"><header><small>${dateStr(ev.start)}・対応が必要です（${d.expire} か月放置すると最後の選択肢になります）</small><h2>${d.title}</h2></header><div class="body">
        <p>${ev.detail}</p>
        ${d.options.map((o, i) => `<button class="opt" data-act="event" data-arg="${ev.id}:${i}"><b>${o.label}</b><em>${o.cost ? yenT(o.cost) : ''}</em><small>${o.desc}${o.cost > s.cash ? `<br><span style="color:var(--bad)">資金が足りないため、不足分 ${yenT(Math.ceil((o.cost - Math.max(0, s.cash)) / 100) * 100)} は一時借入（年利 ${P.tempRate * 100}%）になります</span>` : ''}</small></button>`).join('')}
        <div class="btnrow"><button class="btn small" data-act="eventhide">いったん閉じて街を見る</button>${d.options.some(o => o.cost > s.cash) ? `<button class="btn small" data-act="borrow" data-arg="${P.bondUnit}" ${s.loans.filter(l => l.kind === 'bond').reduce((a, l) => a + l.remaining, 0) + P.bondUnit > P.bondLimit ? 'disabled' : ''}>先に市債を ${yenT(P.bondUnit)} 発行（年利 ${P.bondRate * 100}%）</button>` : ''}${tile >= 0 ? `<button class="btn small" data-act="focus" data-arg="${tile}:none" data-also="hide">場所を見る</button>` : ''}</div></div></div>`;
    } else if (s.challenge?.done && !s.challenge.seen && !g.draft) {
      const c = CH[s.challenge.id], win = s.challenge.done === 'win';
      el.hidden = false;
      el.innerHTML = `<div class="dialog award" role="dialog" aria-modal="true" aria-label="挑戦の結果"><header><small>挑戦モード・${dateStr(s.challenge.at ?? s.month)}</small><h2>${win ? '🏆 挑戦達成！' : '挑戦の期限'}「${c?.name ?? ''}」</h2></header><div class="body">
        <p>${win ? `目標「${c?.goal}」を達成しました。市長ポイントが大きく入り、知名度も上がりました。` : `目標「${c?.goal}」には届きませんでした。`}</p><p class="note">街づくりはこのまま続けられます。</p>
        <div class="btnrow"><button class="btn primary" data-act="chseen">閉じる</button></div></div></div>`;
    } else if (s.mayor && levelOf(s.mayor.pts) > s.mayor.seenLv && !g.draft) {
      const l = levelOf(s.mayor.pts), L = LEVELS[l - 1], nx = LEVELS[l];
      el.hidden = false;
      el.innerHTML = `<div class="dialog award" role="dialog" aria-modal="true" aria-label="市長レベルが上がりました"><header><small>市長ポイント ${n0(s.mayor.pts)}</small><h2>⭐ 市長レベル ${l}「${L.title}」</h2></header><div class="body">
        <div class="lvbig">Lv<b>${l}</b><span>${L.title}</span></div>
        <p>特典：<b>${L.perk}</b>${s.unlocked ? '。［市長］の資料から、となりの区域を選んで編入できます（黄色い線の外）。' : '。'}</p>
        ${nx ? `<p class="note">次のレベル「${nx.title}」まで あと ${n0(nx.pts - s.mayor.pts)} ポイント。勲章と全国ランキングでたまります。</p>` : '<p class="note">最高のレベルです。</p>'}
        <div class="btnrow">${s.unlocked && s.mayor.annex > 0 ? '<button class="btn primary" data-act="lvseen" data-arg="mayor">区域を編入する</button><button class="btn" data-act="lvseen">閉じる</button>' : '<button class="btn primary" data-act="lvseen">閉じる</button>'}</div></div></div>`;
    } else if (s.mayor && s.mayor.ranks.length && s.mayor.seenRank < s.mayor.ranks.at(-1)!.month && !g.draft) {
      const r = s.mayor.ranks.at(-1)!, prev = s.mayor.ranks.at(-2);
      const arrow = (a: number, b?: number) => (b === undefined ? '' : a < b ? `<span class="up">▲${n0(b - a)}</span>` : a > b ? `<span class="down">▼${n0(a - b)}</span>` : '<span>→</span>');
      el.hidden = false;
      el.innerHTML = `<div class="dialog award" role="dialog" aria-modal="true" aria-label="全国市区町村ランキング"><header><small>${r.year} 年度・全国 ${n0(N_CITIES)} 市区町村（ゲームの中のランキング）</small><h2>📊 全国市区町村ランキング発表</h2></header><div class="body">
        <div class="rankbig"><small>総合</small><b>${n0(r.total)}</b><span>位</span> ${arrow(r.total, prev?.total)}</div>
        <table class="ranks">${RANK_CATS.map(c => `<tr class="${r.cats[c.id] <= 10 ? 'top' : ''}"><th>${c.name}<small>${c.note}</small></th><td><b>${n0(r.cats[c.id])}</b> 位</td><td>${arrow(r.cats[c.id], prev?.cats[c.id])}</td></tr>`).join('')}</table>
        ${r.awards.length ? `<h3>🏆 表彰</h3><ul class="awards">${r.awards.map(a => `<li>${esc(a)}</li>`).join('')}</ul><p class="note">総合 ${mayorDiff(s).top} 位以内：副賞 1 億円・知名度 +5・支持率 +3 ポイント（1 年）・区域の編入 1。${mayorDiff(s).good} 位以内：副賞 3,000 万円・知名度 +2・支持率 +1.5 ポイント。部門 ${mayorDiff(s).cat} 位以内：部門ごとの特典（転入・来訪者・満足・副賞など、1 年）。</p>` : `<p class="note">今年は表彰に届きませんでした。総合 ${mayorDiff(s).good} 位以内か、部門 ${mayorDiff(s).cat} 位以内で表彰されます（難易度「${diffOf(s).name}」）。</p>`}
        <p>市長ポイント <b>+${n0(r.pts ?? 0)}</b></p>
        <div class="btnrow"><button class="btn primary" data-act="rankseen">閉じる</button><button class="btn" data-act="rankseen" data-arg="mayor">市長の記録を見る</button><button class="btn" data-act="card">📸 記念カード</button></div></div></div>`;
    } else el.hidden = true;
  }
}

const NEWS_RE = /^(🔥|🗳|🏆)/u;
/** 画面に短く出す知らせ（大事なもの・すぐ動くもの）。ほかはベルにだけ残す */
const TOAST_RE = /^(⚠|🏗|📮|🌟|✨|🎉|🎯|市長の初仕事|挑戦)/u;
/** data URL を Blob に */
function dataUrlBlob(u: string): Blob { const [h, b] = u.split(','), mime = /data:([^;]+)/.exec(h)?.[1] ?? 'application/octet-stream', bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }
/** ミニチュア風（ティルトシフト）：上下をぼかし、色を少し鮮やかに */
/** 写真の色（画面には CSS で、保存する画像には同じ指定で焼き込む） */
const PFILTERS: Record<string, [string, string]> = {
  '': ['そのまま', ''], film: ['フィルム', 'contrast(1.05) saturate(0.85) sepia(0.18) brightness(1.04)'], vivid: ['あざやか', 'saturate(1.45) contrast(1.1)'],
  mono: ['モノクロ', 'grayscale(1) contrast(1.15)'], sepia: ['セピア', 'sepia(0.75) contrast(1.05) brightness(1.02)'], cool: ['青い朝', 'saturate(0.9) hue-rotate(-12deg) brightness(1.05) contrast(1.05)'],
};
/** 撮った写真の仕上げ：色を焼き込み、周辺を少し落とし、右下に街の名前と日付（写真のプリントのような橙色の数字） */
async function finishPhoto(u: string, f: string, cap: string): Promise<string> {
  const flt = PFILTERS[f]?.[1] ?? ''; if (!flt && !cap) return u;
  const img = new Image(); img.src = u; await img.decode().catch(() => undefined);
  const w = img.naturalWidth || 1280, h = img.naturalHeight || 800, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!;
  x.filter = flt || 'none'; x.drawImage(img, 0, 0); x.filter = 'none';
  if (f === 'film') { const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,10,0,0.35)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  if (cap) { const fs = Math.round(h / 30); x.font = `700 ${fs}px "Zen Kaku Gothic New","Noto Sans JP",sans-serif`; x.textAlign = 'right'; x.textBaseline = 'bottom'; x.fillStyle = 'rgba(255,150,40,0.92)'; x.shadowColor = 'rgba(255,90,0,0.6)'; x.shadowBlur = fs * 0.4; x.fillText(cap, w - fs, h - fs * 0.8); }
  return c.toDataURL('image/png');
}
async function tiltShift(u: string): Promise<string> {
  const img = new Image(); img.src = u; await img.decode().catch(() => undefined);
  const w = img.naturalWidth || 1280, h = img.naturalHeight || 800, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!;
  x.filter = 'saturate(1.35) contrast(1.08)'; x.drawImage(img, 0, 0);
  const blur = document.createElement('canvas'); blur.width = w; blur.height = h; const bx = blur.getContext('2d')!; bx.filter = `blur(${Math.round(w / 220)}px) saturate(1.35)`; bx.drawImage(img, 0, 0);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.32, 'rgba(0,0,0,0)'); g.addColorStop(0.62, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  const m = document.createElement('canvas'); m.width = w; m.height = h; const mx = m.getContext('2d')!; mx.drawImage(blur, 0, 0); mx.globalCompositeOperation = 'destination-in'; mx.fillStyle = g; mx.fillRect(0, 0, w, h);
  x.filter = 'none'; x.drawImage(m, 0, 0); return c.toDataURL('image/png');
}

/** アルバムの写真（端末に小さくして残す） */
function albumList(): { u: string; t: string; at: number }[] { try { const v = JSON.parse(localStorage.getItem('sumu-album') ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function albumDel(k: number): void { const a = albumList(); a.splice(k, 1); try { localStorage.setItem('sumu-album', JSON.stringify(a)); } catch { /* なし */ } }
function albumAdd(u: string, t: string): void {
  const img = new Image(); img.onload = () => { const w = 360, h = Math.round(img.height * w / img.width), c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const a = albumList(); a.unshift({ u: c.toDataURL('image/jpeg', 0.72), t, at: Date.now() }); while (a.length > 16) a.pop(); for (let n = a.length; n > 0; n--) { try { localStorage.setItem('sumu-album', JSON.stringify(a.slice(0, n))); break; } catch { /* 容量いっぱい：減らして再挑戦 */ } } };
  img.src = u;
}
