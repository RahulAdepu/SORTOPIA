/**
 * Liquid geometry. Pure math (no Phaser) so it is unit-testable.
 *
 * Liquid volume is modelled as polygon area inside the container's interior.
 * For any tilt angle the free surface stays horizontal in world space: we
 * clip the interior polygon against a half-plane perpendicular to gravity and
 * binary-search the surface height that yields the requested area. This
 * makes tilting, pouring and sloshing physically plausible.
 */
export interface Pt {
  x: number;
  y: number;
}

export interface BottleGeometry {
  W: number;
  H: number;
  wall: number;
  lipH: number;
  lipW: number;
  innerW: number;
  innerTop: number;
  innerBottom: number;
  radius: number;
  /** Interior polygon, local coords (origin = bottle centre, y down). */
  interior: Pt[];
  /** Y of the "full" line: capacity units fill up to here when upright. */
  fillTop: number;
  /** Area of the interior below fillTop: the volume of `capacity` units. */
  fullArea: number;
  mouthLeft: Pt;
  mouthRight: Pt;
}

export function bottleGeometry(W: number, H: number): BottleGeometry {
  const wall = Math.max(2, W * 0.075);
  const lipH = W * 0.16;
  const lipW = W * 1.12;
  const innerW = W - wall * 2;
  const innerTop = -H / 2 + lipH * 0.45;
  const innerBottom = H / 2 - wall;
  const radius = innerW * 0.48;
  const left = -innerW / 2;
  const right = innerW / 2;
  const interior: Pt[] = [];
  interior.push({ x: left, y: innerTop });
  interior.push({ x: left, y: innerBottom - radius });
  const segs = 12;
  for (let i = 1; i < segs; i++) {
    const a = Math.PI - (i / segs) * Math.PI; // left → right along the bottom
    interior.push({ x: Math.cos(a) * radius * (innerW / 2 / radius), y: innerBottom - radius + Math.sin(a) * radius });
  }
  interior.push({ x: right, y: innerBottom - radius });
  interior.push({ x: right, y: innerTop });
  const innerH = innerBottom - innerTop;
  const fillTop = innerTop + innerH * 0.1;
  const fullArea = polygonArea(clipHalfPlane(interior, { x: 0, y: -1 }, -fillTop));
  return {
    W,
    H,
    wall,
    lipH,
    lipW,
    innerW,
    innerTop,
    innerBottom,
    radius,
    interior,
    fillTop,
    fullArea,
    mouthLeft: { x: left, y: innerTop },
    mouthRight: { x: right, y: innerTop },
  };
}

export function polygonArea(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return Math.abs(a / 2);
}

/**
 * Sutherland–Hodgman clip keeping points p with dot(p, n) <= d.
 * The interior polygon is convex, so results are convex too.
 */
export function clipHalfPlane(pts: readonly Pt[], n: Pt, d: number): Pt[] {
  const out: Pt[] = [];
  const len = pts.length;
  for (let i = 0; i < len; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % len];
    const da = a.x * n.x + a.y * n.y - d;
    const db = b.x * n.x + b.y * n.y - d;
    const ina = da <= 0;
    const inb = db <= 0;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** World "up" expressed in the bottle's local frame for a rotation `angle` (radians). */
export function upVector(angle: number): Pt {
  return { x: -Math.sin(angle), y: -Math.cos(angle) };
}

function heightRange(pts: readonly Pt[], up: Pt): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const h = p.x * up.x + p.y * up.y;
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return [lo, hi];
}

/** Area of liquid below height `level` (measured along `up`). */
export function areaBelow(interior: readonly Pt[], up: Pt, level: number): number {
  // Points with dot(p, up) <= level are "below" the surface.
  return polygonArea(clipHalfPlane(interior, up, level));
}

/** Surface height (along `up`) that holds exactly `area`. */
export function levelForArea(interior: readonly Pt[], up: Pt, area: number): number {
  const [lo, hi] = heightRange(interior, up);
  if (area <= 0) return lo;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 26; i++) {
    const m = (a + b) / 2;
    if (areaBelow(interior, up, m) < area) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** Polygon for the band of liquid between two surface heights. */
export function bandPolygon(interior: readonly Pt[], up: Pt, lowLevel: number, highLevel: number): Pt[] {
  const below = clipHalfPlane(interior, up, highLevel);
  // keep dot(p, up) >= lowLevel  ⇔  dot(p, -up) <= -lowLevel
  return clipHalfPlane(below, { x: -up.x, y: -up.y }, -lowLevel);
}

/**
 * Tilt angle (radians, ≥ 0, tilting so the right mouth goes down) at which a
 * liquid of `area` just reaches the right lip. Used to drive the pour tilt.
 */
export function pourAngleFor(geo: BottleGeometry, area: number, maxAngle = 2.05): number {
  const mouth = geo.mouthRight;
  const f = (ang: number) => {
    const up = upVector(ang);
    const level = levelForArea(geo.interior, up, area);
    return level - (mouth.x * up.x + mouth.y * up.y);
  };
  // f < 0 → surface below lip (no flow yet). Find the root.
  if (f(maxAngle) < 0) return maxAngle;
  let a = 0;
  let b = maxAngle;
  for (let i = 0; i < 22; i++) {
    const m = (a + b) / 2;
    if (f(m) < 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}
