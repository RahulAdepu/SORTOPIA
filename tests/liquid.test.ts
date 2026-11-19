import { describe, expect, it } from 'vitest';
import { areaBelow, bandPolygon, bottleGeometry, levelForArea, polygonArea, pourAngleFor, upVector } from '../src/entities/Liquid';

describe('liquid geometry', () => {
  const geo = bottleGeometry(60, 220);

  it('has a positive full volume smaller than the interior', () => {
    expect(geo.fullArea).toBeGreaterThan(0);
    expect(geo.fullArea).toBeLessThan(polygonArea(geo.interior));
  });

  it('levelForArea inverts areaBelow at any tilt', () => {
    for (const ang of [0, 0.4, 1.1, 1.8]) {
      const up = upVector(ang);
      for (const frac of [0.1, 0.5, 0.9]) {
        const target = geo.fullArea * frac;
        const lvl = levelForArea(geo.interior, up, target);
        expect(areaBelow(geo.interior, up, lvl)).toBeCloseTo(target, 0);
      }
    }
  });

  it('bands for equal volumes have equal areas', () => {
    const up = upVector(0);
    const unit = geo.fullArea / 4;
    const l1 = levelForArea(geo.interior, up, unit);
    const l2 = levelForArea(geo.interior, up, unit * 2);
    const l0 = levelForArea(geo.interior, up, 0);
    expect(polygonArea(bandPolygon(geo.interior, up, l0, l1))).toBeCloseTo(unit, 0);
    expect(polygonArea(bandPolygon(geo.interior, up, l1, l2))).toBeCloseTo(unit, 0);
  });

  it('pour angle increases as the container empties', () => {
    const full = pourAngleFor(geo, geo.fullArea);
    const half = pourAngleFor(geo, geo.fullArea / 2);
    const little = pourAngleFor(geo, geo.fullArea / 8);
    expect(full).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(full);
    expect(little).toBeGreaterThan(half);
  });
});
