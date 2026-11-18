// v90：行政権限。施設ごとの「市の関わり方」（5 つの行動種別）と、プレイヤーの役（市長・特別区長・行政区の区長・町長・知事）でできることの違い。
// 施設の定義（DEFS の build / owner / authority）から種別を決め、例外だけをこのファイルのデータで持つ。
// 種別ごとの手続き：直接整備＝市が建てる（建設費は市の負担）／補助＝法人が建て、建設費の欄は市の補助額／誘致＝企業が決める（確率と待ち）／
// 協議＝相手（国・県・都道府県警察・鉄道事業者など）が決める（確率と待ち、断られることがある）／広域共同＝近隣と共同で設置し、建設費の欄は市の負担金。
import { DEFS, fam } from './config';
import type { Kind } from './types';
import { MAP_ID } from './real';
import { mapEntry } from '../maps/registry';

export type ActKind = 'direct' | 'subsidy' | 'invite' | 'consult' | 'joint' | 'private';

export const ACT_NAME: Record<ActKind, string> = {
  direct: '直接整備', subsidy: '補助', invite: '誘致', consult: '協議', joint: '広域共同事業', private: '民間（用途指定）',
};
/** 種別ごとの手続きの説明（建設メニュー・施設の詳細に出す） */
export const ACT_HOW: Record<ActKind, string> = {
  direct: '市が建てて運営します。建設費と維持費は市の負担です',
  subsidy: '法人（社会福祉法人・医療法人・学校法人など）が建てて運営し、市は整備費の一部を補助します。建設費の欄は市の補助額です。建つかどうかと時期は法人しだいです',
  invite: '企業が建てるかを決めます。市は用地の整備や優遇で働きかけます（決まるまで時間がかかり、来ないこともあります）',
  consult: '市は要望と負担金を出し、相手が決めます。時間がかかり、断られることがあります',
  joint: '近隣の市町と一部事務組合・広域連合で共同で設置・運営します。建設費の欄は市の負担金（共同の整備費のうち市の分）です',
  private: '市は建てません。用途地域の指定に応じて民間が建てます',
};

/** 定義から決まらない施設の種別と主体（例外のデータ） */
const ACT_OVERRIDE: Partial<Record<Kind, { act: ActKind; actor?: string }>> = {
  elderly: { act: 'subsidy', actor: '社会福祉法人' },
  privNursery: { act: 'subsidy', actor: '社会福祉法人・株式会社（認可保育園）' },
  psychHospital: { act: 'subsidy', actor: '医療法人' }, rehabHospital: { act: 'subsidy', actor: '医療法人' }, ryoyo: { act: 'subsidy', actor: '医療法人' }, hospice: { act: 'subsidy', actor: '医療法人' },
  univHospital: { act: 'invite', actor: '大学法人（国立大学法人・学校法人）' },
  privHigh: { act: 'subsidy', actor: '学校法人（私学助成は主に県）' },
  koban: { act: 'consult', actor: '都道府県警察' }, police: { act: 'consult', actor: '都道府県警察' },
  station: { act: 'consult', actor: '鉄道事業者' },
  racecourse: { act: 'joint', actor: '地方競馬の組合（自治体の一部事務組合）' }, boatRace: { act: 'joint', actor: '競艇の施行者（自治体の組合）' }, keirin: { act: 'joint', actor: '競輪の施行者（自治体の組合）' },
};

export function actKind(kind: Kind): ActKind {
  const o = ACT_OVERRIDE[kind]; if (o) return o.act;
  const d = DEFS[kind]; if (!d) return 'private';
  if (d.build === 'city') return 'direct';
  if (d.build === 'invite') return 'invite';
  if (d.build === 'request') return /組合/.test(d.owner) ? 'joint' : /社会福祉法人/.test(d.owner) ? 'subsidy' : 'consult';
  return fam(kind) === 'privCare' ? 'subsidy' : 'private';
}

/** プレイヤーの役 */
export type Office = 'mayor' | 'town' | 'tokuku' | 'gyoseiku' | 'governor';
export interface OfficePower {
  name: string;
  /** できることの説明（UI） */
  note: string;
  /** この役では主体が変わる施設の系統（例：特別区の消防は東京都） */
  famActor?: Partial<Record<string, { act: ActKind; actor: string; why: string }>>;
  /** この役ではできない操作（'tax' 税率の変更・'bond' 市債・'build:direct' 直接整備）と理由 */
  deny?: Partial<Record<string, string>>;
}
export const OFFICE: Record<Office, OfficePower> = {
  mayor: { name: '市長', note: '市の予算・条例・施設の整備を決められます（議会の議決が要るものは議会と調整）。警察・県道・国道・鉄道・国の機関は相手との協議です。' },
  town: { name: '町長', note: '市長とほぼ同じですが、消防やごみ処理を近隣と共同（一部事務組合・事務委託）で行う町が多くあります。' },
  tokuku: {
    name: '特別区長', note: '東京都の特別区。消防（東京消防庁）と上下水道（東京都水道局・下水道局）は都の事務で、区は要望します。固定資産税・法人住民税は都が集め、都区財政調整で配られます（このゲームでは単純化）。',
    famActor: {
      fire: { act: 'consult', actor: '東京都（東京消防庁）', why: '特別区の消防は東京都の事務です' },
      water: { act: 'consult', actor: '東京都水道局', why: '特別区の水道は東京都の事務です' },
      sewage: { act: 'consult', actor: '東京都下水道局', why: '特別区の下水道は東京都の事務です' },
    },
  },
  gyoseiku: {
    name: '行政区の区長', note: '政令指定都市の区長は市長が任命する職員で、予算・条例・税率は市が決めます。区でできるのは窓口・地域の事業と、市への要望です。',
    deny: { tax: '行政区の区長は税率を決められません（市の条例で決まります）', bond: '行政区の区長は市債を出せません（市の予算で決まります）' },
  },
  governor: { name: '知事', note: '（予定）都道府県の事務：県立高校・県道・警察・広域の防災。今回は未実装です。' },
};
/** 地域固有の例外（地図 ID ごと。ゲームの前提として持つ設定データ） */
export const LOCAL_ACTOR: Record<string, Partial<Record<string, { act: ActKind; actor: string; why: string }>>> = {
  kichijoji: { fire: { act: 'joint', actor: '東京都（東京消防庁への事務委託）', why: '武蔵野市は消防の事務を東京都に委託しています' } },
};

export function officeOf(role: string, area = ''): Office {
  if (/知事$/.test(role)) return 'governor';
  if (/区長$/.test(role)) return /東京都/.test(area) ? 'tokuku' : 'gyoseiku';
  if (/[町村]長$/.test(role)) return 'town';
  return 'mayor';
}
/** いまの地図の役 */
export function currentOffice(): { office: Office; role: string; power: OfficePower } {
  const e = mapEntry(MAP_ID), role = e?.role ?? '市長', office = officeOf(role, e?.area ?? '');
  return { office, role, power: OFFICE[office] };
}
/** この役でできない操作なら理由を返す */
export function officeDeny(what: string): string | null {
  return currentOffice().power.deny?.[what] ?? null;
}

/** 表示用のラベル：種別・主体・手続き。地図の役と地域の例外を反映する */
export function authorityLabel(kind: Kind): { act: ActKind; name: string; actor: string; how: string; why?: string } {
  const d = DEFS[kind], f = fam(kind) as string;
  const loc = LOCAL_ACTOR[MAP_ID]?.[f] ?? currentOffice().power.famActor?.[f];
  if (loc) return { act: loc.act, name: ACT_NAME[loc.act], actor: localize(loc.actor), how: ACT_HOW[loc.act], why: loc.why };
  const act = actKind(kind);
  const actor = ACT_OVERRIDE[kind]?.actor ?? (act === 'direct' ? (d?.owner ?? '市') : d?.owner ?? '民間');
  return { act, name: ACT_NAME[act], actor: localize(actor), how: ACT_HOW[act] };
}
/** v91：実在マップの都道府県（例：神奈川県）。架空の街は空 */
export function prefOf(): string {
  const area = (mapEntry(MAP_ID) ?? mapEntry(MAP_ID.replace(/-d$/, '')))?.area ?? '';
  return /^(東京都|北海道|京都府|大阪府|\S+?県)/.exec(area)?.[1] ?? '';
}
/** v91：実在マップでは「都道府県警察」を「神奈川県警察」のように、その地図の都道府県の名前で書く */
export function localize(actor: string): string {
  const p = prefOf(); if (!p) return actor;
  return actor.replace(/都道府県警察/g, p === '東京都' ? '警視庁' : `${p}警察`).replace(/^都道府県$/, p);
}
