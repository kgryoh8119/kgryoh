// v91：実在マップ（まちづくり版）のラベル：権限の主体を都道府県の名前で、出典・取得日を読める
import { describe, it, expect } from 'vitest';
import mapText from '../public/maps/hodogaya.json?raw';
import { deformMap } from '../src/mapgen/deform';
import { setMap, dataSource } from '../src/sim/index';
import { authorityLabel, prefOf } from '../src/sim/authority';

describe('v91 実在マップのラベル', () => {
  it('保土ケ谷のまちづくり版：警察は神奈川県警察、出典がある', () => {
    const { map } = deformMap(JSON.parse(mapText), { id: 'hodogaya-d' });
    setMap('hodogaya-d', map);
    expect(prefOf()).toBe('神奈川県');
    expect(authorityLabel('police').actor).toContain('神奈川県警察');
    expect(authorityLabel('koban').actor).not.toContain('都道府県');
    const ds = dataSource();
    expect(ds.real).toBe(true);
    expect(ds.credits.length).toBeGreaterThan(0);
  });
});
