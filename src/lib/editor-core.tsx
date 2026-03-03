import MuiSlider from '@mui/material/Slider';

type Vec = { x: number; y: number };

type Point = {
  id: string;
  p: Vec;
  in: Vec | null;
  out: Vec | null;
};

type StrokeLinecap = 'butt' | 'round' | 'square' | 'inherit';
type StrokeLinejoin = 'miter' | 'round' | 'bevel' | 'inherit';

type PathShape = {
  id: string;
  name: string;
  points: Point[];
  uiRotation: number;
  svgId: string;
  svgClass: string;
  sourceD: string | null;
  geometryDirty: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: StrokeLinecap;
  strokeLinejoin: StrokeLinejoin;
  opacity: number;
  fillExplicit: boolean;
  strokeExplicit: boolean;
  strokeWidthExplicit: boolean;
  strokeLinecapExplicit: boolean;
  strokeLinejoinExplicit: boolean;
  opacityExplicit: boolean;
  closed: boolean;
};

type Tool = 'select' | 'pen' | 'scale';
type Snapshot = {
  shapes: PathShape[];
  selectedPath: number;
  selectedPaths: number[];
  selectedPoint: number;
  selectedPoints: number[];
  transformAllPaths: boolean;
  codeText: string;
};

type DragTarget =
  | { kind: 'anchor'; pathIndex: number; pointIndex: number; startPos: Vec; base: Point }
  | { kind: 'in'; pathIndex: number; pointIndex: number; startPos: Vec; base: Point }
  | { kind: 'out'; pathIndex: number; pointIndex: number; startPos: Vec; base: Point }
  | {
      kind: 'scale';
      pathIndex: number;
      affectAll: boolean;
      targetPathIndices: number[];
      axis: 'both' | 'x' | 'y';
      originOpp: Vec;
      originCenter: Vec;
      startVecOpp: Vec;
      startVecCenter: Vec;
      baseShapes: PathShape[];
    }
  | {
      kind: 'move';
      pathIndex: number;
      affectAll: boolean;
      targetPathIndices: number[];
      startPos: Vec;
      baseShapes: PathShape[];
    }
  | {
      kind: 'rotate';
      pathIndex: number;
      affectAll: boolean;
      targetPathIndices: number[];
      originCenter: Vec;
      startAngle: number;
      baseShapes: PathShape[];
    }
  | {
      kind: 'viewportPan';
      startClient: Vec;
      startOrigin: Vec;
    }
  | null;

type PenHover =
  | { kind: 'anchor'; pointIndex: number }
  | { kind: 'segment'; segmentIndex: number }
  | null;

type ViewBox = { minX: number; minY: number; vbW: number; vbH: number };
type ShapePreset = 'circle' | 'roundedSquare' | 'roundedDiamond' | 'roundedTriangle';
type StylePanel = 'fill' | 'stroke' | 'opacity';
type SliderInlineProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (next: number) => void;
};

const width = 900;
const height = 560;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const WORLD_LIMIT = 100000;
const ZOOM_RECENTER_BLEND = 0.32;
const MERGE_MAX_STEP_DISTANCE = 18;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const clamp255 = (n: number) => clamp(Math.round(n), 0, 255);
const uid = () => Math.random().toString(36).slice(2, 9);
const INTERNAL_VIEWBOX: ViewBox = { minX: 0, minY: 0, vbW: width, vbH: height };
type Rgba = { r: number; g: number; b: number; a: number };

const parseHexColor = (s: string): Rgba | null => {
  const hex = s.trim().toLowerCase();
  if (!hex.startsWith('#')) return null;
  const raw = hex.slice(1);
  if (![3, 4, 6, 8].includes(raw.length)) return null;
  const expand = (v: string) => (v.length === 1 ? `${v}${v}` : v);
  if (raw.length === 3 || raw.length === 4) {
    const r = Number.parseInt(expand(raw[0]), 16);
    const g = Number.parseInt(expand(raw[1]), 16);
    const b = Number.parseInt(expand(raw[2]), 16);
    const a = raw.length === 4 ? Number.parseInt(expand(raw[3]), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const a = raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
};

const parseRgbColor = (s: string): Rgba | null => {
  const m = s
    .trim()
    .match(/^rgba?\(\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))(?:\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*)?\)$/i);
  if (!m) return null;
  const r = clamp255(Number(m[1]));
  const g = clamp255(Number(m[2]));
  const b = clamp255(Number(m[3]));
  const a = m[4] === undefined ? 1 : clamp(Number(m[4]), 0, 1);
  return { r, g, b, a };
};

const parseColorToRgba = (s: string, fallback: Rgba): Rgba => parseHexColor(s) ?? parseRgbColor(s) ?? fallback;

const rgbaToHexAlpha = ({ r, g, b, a }: Rgba) =>
  `#${clamp255(r).toString(16).padStart(2, '0')}${clamp255(g).toString(16).padStart(2, '0')}${clamp255(b).toString(16).padStart(2, '0')}${clamp255(
    a * 255,
  )
    .toString(16)
    .padStart(2, '0')}`;

const rgbaToCss = ({ r, g, b, a }: Rgba) =>
  `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${Number(clamp(a, 0, 1).toFixed(3))})`;

const parseStrokeLinecap = (v: string | null): StrokeLinecap | null => {
  if (!v) return null;
  const n = v.trim().toLowerCase();
  return n === 'butt' || n === 'round' || n === 'square' || n === 'inherit' ? n : null;
};

const parseStrokeLinejoin = (v: string | null): StrokeLinejoin | null => {
  if (!v) return null;
  const n = v.trim().toLowerCase();
  return n === 'miter' || n === 'round' || n === 'bevel' || n === 'inherit' ? n : null;
};

const SliderInline = ({ label, value, min, max, step = 1, unit = '', disabled, onChange }: SliderInlineProps) => {
  const safe = clamp(value, min, max);
  return (
    <div className={`slider-inline${disabled ? ' disabled' : ''}`}>
      <span className="slider-inline-label">{label}:</span>
      <MuiSlider
        min={min}
        max={max}
        step={step}
        value={safe}
        disabled={disabled}
        onChange={(_, v: number | number[]) => onChange(Array.isArray(v) ? Number(v[0]) : Number(v))}
        size="small"
        sx={{
          color: '#ff9a00',
          height: 4,
          '& .MuiSlider-track': { border: 'none' },
          '& .MuiSlider-rail': { backgroundColor: '#344152', opacity: 1 },
          '& .MuiSlider-thumb': {
            width: 14,
            height: 14,
            backgroundColor: '#ff9a00',
            border: '2px solid #ffe1b0',
            boxShadow: '0 0 0 1px rgba(255,154,0,0.35)',
          },
        }}
      />
      <input
        className="slider-inline-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={safe}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isFinite(next)) return;
          onChange(clamp(next, min, max));
        }}
      />
      {unit ? <span className="slider-inline-unit">{unit}</span> : null}
    </div>
  );
};

const makePoint = (x: number, y: number): Point => ({
  id: uid(),
  p: { x, y },
  in: { x: x - 40, y },
  out: { x: x + 40, y },
});

const createCurvedPolygonPoints = (cx: number, cy: number, radius: number, sides: number, rotation: number, roundness: number) => {
  const anchors: Vec[] = Array.from({ length: sides }, (_, i) => {
    const a = rotation + (Math.PI * 2 * i) / sides;
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
  });
  const points: Point[] = [];

  for (let i = 0; i < sides; i += 1) {
    const prev = anchors[(i - 1 + sides) % sides];
    const curr = anchors[i];
    const next = anchors[(i + 1) % sides];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    const ux = tx / tLen;
    const uy = ty / tLen;
    const dPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dNext = Math.hypot(next.x - curr.x, next.y - curr.y);
    const h = Math.min(dPrev, dNext) * roundness;
    points.push({
      id: uid(),
      p: { x: curr.x, y: curr.y },
      in: { x: curr.x - ux * h, y: curr.y - uy * h },
      out: { x: curr.x + ux * h, y: curr.y + uy * h },
    });
  }

  return points;
};

const createCirclePoints = (cx: number, cy: number, radius: number) => {
  // Keep preset circles aligned with the same primitive conversion used by SVG imports.
  const parsed = parseCirclePoints(`<circle cx="${cx}" cy="${cy}" r="${radius}" />`);
  if (parsed) return parsed;
  const rk = radius * 0.5522847498307936;
  return [
    {
      id: uid(),
      p: { x: cx + radius, y: cy },
      in: { x: cx + radius, y: cy - rk },
      out: { x: cx + radius, y: cy + rk },
    },
    {
      id: uid(),
      p: { x: cx, y: cy + radius },
      in: { x: cx + rk, y: cy + radius },
      out: { x: cx - rk, y: cy + radius },
    },
    {
      id: uid(),
      p: { x: cx - radius, y: cy },
      in: { x: cx - radius, y: cy + rk },
      out: { x: cx - radius, y: cy - rk },
    },
    {
      id: uid(),
      p: { x: cx, y: cy - radius },
      in: { x: cx - rk, y: cy - radius },
      out: { x: cx + rk, y: cy - radius },
    },
  ] satisfies Point[];
};

const createRectPoints = (x: number, y: number, w: number, h: number) => {
  const parsed = parseRectPoints(`<rect x="${x}" y="${y}" width="${w}" height="${h}" />`);
  if (parsed) return parsed;
  return [
    { id: uid(), p: { x, y }, in: null, out: null },
    { id: uid(), p: { x: x + w, y }, in: null, out: null },
    { id: uid(), p: { x: x + w, y: y + h }, in: null, out: null },
    { id: uid(), p: { x, y: y + h }, in: null, out: null },
  ] satisfies Point[];
};

const createPresetPath = (name: string, preset: ShapePreset, cx: number, cy: number): PathShape => {
  const radius = 90;
  const side = radius * 2;
  const rectX = cx - radius;
  const rectY = cy - radius;
  const points =
    preset === 'circle'
      ? createCirclePoints(cx, cy, radius)
      : preset === 'roundedSquare'
        ? createRectPoints(rectX, rectY, side, side)
        : preset === 'roundedDiamond'
          ? createCurvedPolygonPoints(cx, cy, radius, 4, 0, 0.12)
          : createCurvedPolygonPoints(cx, cy, radius, 3, -Math.PI / 2, 0.16);
  const sourceD =
    preset === 'circle'
      ? `<circle cx="${cx}" cy="${cy}" r="${radius}" />`
      : preset === 'roundedSquare'
        ? `<rect x="${rectX}" y="${rectY}" width="${side}" height="${side}" />`
        : null;

  return {
    id: uid(),
    name,
    points,
    uiRotation: 0,
    svgId: '',
    svgClass: '',
    sourceD,
    geometryDirty: sourceD ? false : true,
    fill: 'currentColor',
    stroke: 'currentColor',
    strokeWidth: 3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    opacity: 1,
    fillExplicit: true,
    strokeExplicit: true,
    strokeWidthExplicit: true,
    strokeLinecapExplicit: false,
    strokeLinejoinExplicit: false,
    opacityExplicit: false,
    closed: true,
  };
};

const mirrorHandle = (anchor: Vec, handle: Vec): Vec => ({ x: anchor.x * 2 - handle.x, y: anchor.y * 2 - handle.y });
const rotateAround = (p: Vec, c: Vec, ang: number): Vec => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
};

const sampleBezier = (a: Vec, c1: Vec, c2: Vec, b: Vec, t: number): Vec => {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x,
    y: mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y,
  };
};

const pathData = (points: Point[], closed: boolean): string => {
  if (!points.length) return '';
  const fmt = (n: number) => Number(n.toFixed(4)).toString();
  let d = `M ${fmt(points[0].p.x)} ${fmt(points[0].p.y)}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const c1 = prev.out ?? prev.p;
    const c2 = curr.in ?? curr.p;
    d += ` C ${fmt(c1.x)} ${fmt(c1.y)}, ${fmt(c2.x)} ${fmt(c2.y)}, ${fmt(curr.p.x)} ${fmt(curr.p.y)}`;
  }
  if (closed && points.length > 1) {
    const last = points[points.length - 1];
    const first = points[0];
    const c1 = last.out ?? last.p;
    const c2 = first.in ?? first.p;
    d += ` C ${fmt(c1.x)} ${fmt(c1.y)}, ${fmt(c2.x)} ${fmt(c2.y)}, ${fmt(first.p.x)} ${fmt(first.p.y)} Z`;
  }
  return d;
};

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

const clonePoints = (points: Point[]) =>
  points.map((pt) => ({
    ...pt,
    p: { ...pt.p },
    in: pt.in ? { ...pt.in } : null,
    out: pt.out ? { ...pt.out } : null,
  }));

const cloneShapes = (shapes: PathShape[]) =>
  shapes.map((shape) => ({
    ...shape,
    points: clonePoints(shape.points),
  }));

const clonePoint = (pt: Point): Point => ({
  ...pt,
  p: { ...pt.p },
  in: pt.in ? { ...pt.in } : null,
  out: pt.out ? { ...pt.out } : null,
});

const mergePointPair = (left: Point, right: Point): Point => {
  const anchor = {
    x: (left.p.x + right.p.x) / 2,
    y: (left.p.y + right.p.y) / 2,
  };
  const inSource = left.in ?? left.out ?? right.in ?? null;
  const outSource = right.out ?? right.in ?? left.out ?? null;
  const inOwner = left.in || left.out ? left.p : right.p;
  const outOwner = right.out || right.in ? right.p : left.p;
  const inHandle = inSource
    ? { x: inSource.x + (anchor.x - inOwner.x), y: inSource.y + (anchor.y - inOwner.y) }
    : null;
  const outHandle = outSource
    ? { x: outSource.x + (anchor.x - outOwner.x), y: outSource.y + (anchor.y - outOwner.y) }
    : null;

  return { id: uid(), p: anchor, in: inHandle, out: outHandle };
};

const simplifyPathByThreshold = (path: PathShape, threshold: number): PathShape => {
  let points = [...path.points];
  if (points.length < 2) return path;

  let changed = true;
  while (changed && points.length > 2) {
    changed = false;

    for (let i = 0; i < points.length - 1; i += 1) {
      if (dist(points[i].p, points[i + 1].p) <= threshold) {
        const merged = mergePointPair(points[i], points[i + 1]);
        points = [...points.slice(0, i), merged, ...points.slice(i + 2)];
        changed = true;
        break;
      }
    }

    if (!changed && path.closed && points.length > 2 && dist(points[points.length - 1].p, points[0].p) <= threshold) {
      const merged = mergePointPair(points[points.length - 1], points[0]);
      points = [merged, ...points.slice(1, points.length - 1)];
      changed = true;
    }
  }

  return { ...path, points };
};

const smoothSharpCorners = (path: PathShape): PathShape => {
  const n = path.points.length;
  if (n < 2) return path;

  const points = path.points.map((pt) => ({
    ...pt,
    p: { ...pt.p },
    in: pt.in ? { ...pt.in } : null,
    out: pt.out ? { ...pt.out } : null,
  }));

  for (let i = 0; i < n; i += 1) {
    const curr = points[i];
    // Keep endpoints unchanged on open paths to avoid shape drift.
    if (!path.closed && (i === 0 || i === n - 1)) continue;
    if (!curr.in || !curr.out) continue;

    // Preserve lengths and anchor position; only align tangent direction.
    const inVec = { x: curr.p.x - curr.in.x, y: curr.p.y - curr.in.y }; // into-anchor direction
    const outVec = { x: curr.out.x - curr.p.x, y: curr.out.y - curr.p.y }; // out-of-anchor direction
    const inLen = Math.hypot(inVec.x, inVec.y);
    const outLen = Math.hypot(outVec.x, outVec.y);
    if (inLen < 0.0001 || outLen < 0.0001) continue;

    const uIn = { x: inVec.x / inLen, y: inVec.y / inLen };
    const uOut = { x: outVec.x / outLen, y: outVec.y / outLen };
    const tan = { x: uIn.x + uOut.x, y: uIn.y + uOut.y };
    const tanLen = Math.hypot(tan.x, tan.y);
    if (tanLen < 0.0001) continue;

    const t = { x: tan.x / tanLen, y: tan.y / tanLen };
    curr.in = { x: curr.p.x - t.x * inLen, y: curr.p.y - t.y * inLen };
    curr.out = { x: curr.p.x + t.x * outLen, y: curr.p.y + t.y * outLen };
  }

  return { ...path, points };
};

const getPathBounds = (points: Point[]) => {
  if (!points.length) return null;
  const xs = points.map((pt) => pt.p.x);
  const ys = points.map((pt) => pt.p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { minX, minY, maxX, maxY, cx, cy };
};

const closestSegment = (path: PathShape, pos: Vec) => {
  if (path.points.length < 2) return null;
  let best = { segmentIndex: 0, distance: Number.POSITIVE_INFINITY };

  const segmentCount = path.closed ? path.points.length : path.points.length - 1;

  for (let i = 0; i < segmentCount; i += 1) {
    const j = (i + 1) % path.points.length;
    const a = path.points[i];
    const b = path.points[j];
    const c1 = a.out ?? a.p;
    const c2 = b.in ?? b.p;

    let minD = Number.POSITIVE_INFINITY;
    for (let s = 1; s <= 20; s += 1) {
      const t = s / 20;
      const p = sampleBezier(a.p, c1, c2, b.p, t);
      minD = Math.min(minD, dist(pos, p));
    }

    if (minD < best.distance) best = { segmentIndex: i, distance: minD };
  }

  return best;
};

const getContainMap = (vb: ViewBox) => {
  const s = Math.min(width / vb.vbW, height / vb.vbH);
  const ox = (width - vb.vbW * s) / 2;
  const oy = (height - vb.vbH * s) / 2;
  return { s, ox, oy };
};

const mapPointToViewBox = (p: Vec, vb: ViewBox): Vec => {
  const { s, ox, oy } = getContainMap(vb);
  return {
    x: vb.minX + (p.x - ox) / s,
    y: vb.minY + (p.y - oy) / s,
  };
};

const mapShapesToViewBox = (shapes: PathShape[], vb: ViewBox) =>
  shapes.map((shape) => {
    const { s } = getContainMap(vb);
    return {
      ...shape,
      strokeWidth: shape.strokeWidth / s,
      points: shape.points.map((pt) => ({
        ...pt,
        p: mapPointToViewBox(pt.p, vb),
        in: pt.in ? mapPointToViewBox(pt.in, vb) : null,
        out: pt.out ? mapPointToViewBox(pt.out, vb) : null,
      })),
    };
  });

const mapPathDFromViewBox = (d: string, vb: ViewBox): string => {
  const tokens = (d.match(/[AaCcHhLlMmQqSsTtVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []).map((t) => t.trim());
  if (!tokens.length) return d;
  const { s, ox, oy } = getContainMap(vb);
  const fmt = (n: number) => Number(n.toFixed(4)).toString();
  const mapX = (x: number, rel: boolean) => (rel ? x * s : (x - vb.minX) * s + ox);
  const mapY = (y: number, rel: boolean) => (rel ? y * s : (y - vb.minY) * s + oy);

  const out: string[] = [];
  let i = 0;
  let cmd = '';
  let rel = false;
  const isCmd = (t: string) => /^[AaCcHhLlMmQqSsTtVvZz]$/.test(t);
  const isNum = (t: string) => /^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(t);
  const nextNum = () => {
    if (i >= tokens.length || !isNum(tokens[i])) return null;
    const n = Number(tokens[i]);
    i += 1;
    return Number.isFinite(n) ? n : null;
  };

  while (i < tokens.length) {
    if (isCmd(tokens[i])) {
      const raw = tokens[i];
      cmd = raw.toUpperCase();
      rel = raw !== cmd;
      i += 1;
      if (cmd === 'Z') out.push(raw);
      continue;
    }
    if (!cmd) break;

    if (cmd === 'M') {
      const x = nextNum();
      const y = nextNum();
      if (x === null || y === null) break;
      out.push(`${rel ? 'm' : 'M'} ${fmt(mapX(x, rel))} ${fmt(mapY(y, rel))}`);
      while (i < tokens.length && isNum(tokens[i])) {
        const lx = nextNum();
        const ly = nextNum();
        if (lx === null || ly === null) break;
        out.push(`${rel ? 'l' : 'L'} ${fmt(mapX(lx, rel))} ${fmt(mapY(ly, rel))}`);
      }
      continue;
    }

    if (cmd === 'L' || cmd === 'T') {
      while (i < tokens.length && isNum(tokens[i])) {
        const x = nextNum();
        const y = nextNum();
        if (x === null || y === null) break;
        out.push(`${rel ? cmd.toLowerCase() : cmd} ${fmt(mapX(x, rel))} ${fmt(mapY(y, rel))}`);
      }
      continue;
    }

    if (cmd === 'H') {
      while (i < tokens.length && isNum(tokens[i])) {
        const x = nextNum();
        if (x === null) break;
        out.push(`${rel ? 'h' : 'H'} ${fmt(mapX(x, rel))}`);
      }
      continue;
    }

    if (cmd === 'V') {
      while (i < tokens.length && isNum(tokens[i])) {
        const y = nextNum();
        if (y === null) break;
        out.push(`${rel ? 'v' : 'V'} ${fmt(mapY(y, rel))}`);
      }
      continue;
    }

    if (cmd === 'C') {
      while (i < tokens.length && isNum(tokens[i])) {
        const x1 = nextNum();
        const y1 = nextNum();
        const x2 = nextNum();
        const y2 = nextNum();
        const x = nextNum();
        const y = nextNum();
        if (x1 === null || y1 === null || x2 === null || y2 === null || x === null || y === null) break;
        out.push(
          `${rel ? 'c' : 'C'} ${fmt(mapX(x1, rel))} ${fmt(mapY(y1, rel))} ${fmt(mapX(x2, rel))} ${fmt(mapY(y2, rel))} ${fmt(
            mapX(x, rel),
          )} ${fmt(mapY(y, rel))}`,
        );
      }
      continue;
    }

    if (cmd === 'S' || cmd === 'Q') {
      while (i < tokens.length && isNum(tokens[i])) {
        const x1 = nextNum();
        const y1 = nextNum();
        const x = nextNum();
        const y = nextNum();
        if (x1 === null || y1 === null || x === null || y === null) break;
        out.push(
          `${rel ? cmd.toLowerCase() : cmd} ${fmt(mapX(x1, rel))} ${fmt(mapY(y1, rel))} ${fmt(mapX(x, rel))} ${fmt(mapY(y, rel))}`,
        );
      }
      continue;
    }

    if (cmd === 'A') {
      while (i < tokens.length && isNum(tokens[i])) {
        const rx = nextNum();
        const ry = nextNum();
        const angle = nextNum();
        const large = nextNum();
        const sweep = nextNum();
        const x = nextNum();
        const y = nextNum();
        if (rx === null || ry === null || angle === null || large === null || sweep === null || x === null || y === null) break;
        out.push(
          `${rel ? 'a' : 'A'} ${fmt(rx * s)} ${fmt(ry * s)} ${fmt(angle)} ${Math.round(large)} ${Math.round(sweep)} ${fmt(
            mapX(x, rel),
          )} ${fmt(mapY(y, rel))}`,
        );
      }
      continue;
    }

    break;
  }

  return out.join(' ');
};

const serializeSvg = (shapes: PathShape[], vb: ViewBox) => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const exportShapes = mapShapesToViewBox(shapes, vb);
  const lines = shapes
    .map((shape, i) => {
      const exportShape = exportShapes[i];
      if (!exportShape) return '';
      const commonAttrs: string[] = [];
      if (shape.svgId.trim()) commonAttrs.push(`id="${esc(shape.svgId.trim())}"`);
      if (shape.svgClass.trim()) commonAttrs.push(`class="${esc(shape.svgClass.trim())}"`);
      if (shape.fillExplicit) commonAttrs.push(`fill="${shape.fill}"`);
      if (shape.opacityExplicit) commonAttrs.push(`opacity="${Number(shape.opacity.toFixed(4))}"`);
      const shouldExportStroke = exportShape.strokeWidth > 0;
      if (shouldExportStroke && shape.strokeExplicit) commonAttrs.push(`stroke="${shape.stroke}"`);
      if (shouldExportStroke && shape.strokeWidthExplicit) commonAttrs.push(`stroke-width="${Number(exportShape.strokeWidth.toFixed(4))}"`);
      if (shouldExportStroke && shape.strokeLinecapExplicit) commonAttrs.push(`stroke-linecap="${shape.strokeLinecap}"`);
      if (shouldExportStroke && shape.strokeLinejoinExplicit) commonAttrs.push(`stroke-linejoin="${shape.strokeLinejoin}"`);

      if (!shape.geometryDirty && shape.sourceD?.startsWith('<circle')) {
        const b = getPathBounds(exportShape.points);
        if (b) {
          const r = Math.max(0, Math.min(b.maxX - b.minX, b.maxY - b.minY) / 2);
          return `  <circle cx="${Number(b.cx.toFixed(4))}" cy="${Number(b.cy.toFixed(4))}" r="${Number(r.toFixed(4))}" ${commonAttrs.join(' ')} />`;
        }
      }
      if (!shape.geometryDirty && shape.sourceD?.startsWith('<rect')) {
        const b = getPathBounds(exportShape.points);
        if (b) {
          return `  <rect x="${Number(b.minX.toFixed(4))}" y="${Number(b.minY.toFixed(4))}" width="${Number((b.maxX - b.minX).toFixed(4))}" height="${Number((b.maxY - b.minY).toFixed(4))}" ${commonAttrs.join(' ')} />`;
        }
      }

      const d = !shape.geometryDirty && shape.sourceD && !shape.sourceD.startsWith('<') ? shape.sourceD : pathData(exportShape.points, exportShape.closed);
      const attrs: string[] = [`d="${d}"`, ...commonAttrs];
      return `  <path ${attrs.join(' ')} />`;
    })
    .filter(Boolean)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.minX} ${vb.minY} ${vb.vbW} ${vb.vbH}">\n${lines}\n</svg>`;
};

const formatSvgCode = (input: string): string => {
  const compact = input
    .replace(/>\s+</g, '><')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!compact) return '';

  const tokens = compact.match(/<[^>]+>|[^<]+/g) ?? [];
  const lines: string[] = [];
  let indent = 0;
  const pad = (n: number) => '  '.repeat(Math.max(0, n));

  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;

    if (/^<\//.test(token)) {
      indent = Math.max(0, indent - 1);
      lines.push(`${pad(indent)}${token}`);
      continue;
    }

    if (/^<[^!?][^>]*\/>$/.test(token)) {
      lines.push(`${pad(indent)}${token}`);
      continue;
    }

    if (/^<[^!?][^>]*>$/.test(token)) {
      lines.push(`${pad(indent)}${token}`);
      indent += 1;
      continue;
    }

    lines.push(`${pad(indent)}${token}`);
  }

  return lines.join('\n');
};

const attr = (text: string, name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quoted = text.match(new RegExp(`${escaped}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  if (quoted) return quoted[2];
  const unquoted = text.match(new RegExp(`${escaped}\\s*=\\s*([^\\s>]+)`, 'i'));
  return unquoted ? unquoted[1] : null;
};

const arcToCubicSegments = (
  x1: number,
  y1: number,
  rxInput: number,
  ryInput: number,
  angleDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number,
  y2: number,
): Array<{ c1: Vec; c2: Vec; p: Vec }> => {
  let rx = Math.abs(rxInput);
  let ry = Math.abs(ryInput);
  if (rx < 1e-9 || ry < 1e-9 || (Math.abs(x1 - x2) < 1e-9 && Math.abs(y1 - y2) < 1e-9)) {
    return [];
  }

  const phi = (angleDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;
  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const num = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
  const den = rx2 * y1p2 + ry2 * x1p2;
  const coef = den === 0 ? 0 : sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angleBetween = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (len === 0) return 0;
    const q = clamp(dot / len, -1, 1);
    const ang = Math.acos(q);
    return ux * vy - uy * vx < 0 ? -ang : ang;
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  let theta1 = angleBetween(1, 0, ux, uy);
  let dTheta = angleBetween(ux, uy, vx, vy);
  if (!sweepFlag && dTheta > 0) dTheta -= Math.PI * 2;
  if (sweepFlag && dTheta < 0) dTheta += Math.PI * 2;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const step = dTheta / segments;
  const out: Array<{ c1: Vec; c2: Vec; p: Vec }> = [];
  const map = (x: number, y: number): Vec => ({
    x: cx + rx * (cosPhi * x - sinPhi * y),
    y: cy + ry * (sinPhi * x + cosPhi * y),
  });

  for (let s = 0; s < segments; s += 1) {
    const t1 = theta1;
    const t2 = t1 + step;
    const dt = t2 - t1;
    const alpha = (4 / 3) * Math.tan(dt / 4);
    const x1u = Math.cos(t1);
    const y1u = Math.sin(t1);
    const x2u = Math.cos(t2);
    const y2u = Math.sin(t2);
    const c1u = { x: x1u - alpha * y1u, y: y1u + alpha * x1u };
    const c2u = { x: x2u + alpha * y2u, y: y2u - alpha * x2u };

    out.push({
      c1: map(c1u.x, c1u.y),
      c2: map(c2u.x, c2u.y),
      p: map(x2u, y2u),
    });
    theta1 = t2;
  }

  return out;
};

const parsePathD = (d: string) => {
  const commandsOnly = d.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, ' ');
  const hasUnsupportedCommand = (commandsOnly.match(/[A-Za-z]/g) ?? []).some((ch) => !'AaCcHhLlMmQqSsTtVvZz'.includes(ch));
  if (hasUnsupportedCommand) return null;
  const tokens = (d.match(/[AaCcHhLlMmQqSsTtVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []).map((t) => t.trim());
  if (!tokens.length) return null;

  const pts: Point[] = [];
  let i = 0;
  let cmd = '';
  let rel = false;
  let cursor = { x: 0, y: 0 };
  let subpathStart: Vec | null = null;
  let closed = false;
  let prevCmd = '';
  let lastCubicControl: Vec | null = null;
  let lastQuadraticControl: Vec | null = null;

  const readNum = (): number | null => {
    if (i >= tokens.length) return null;
    const n = Number(tokens[i]);
    i += 1;
    return Number.isFinite(n) ? n : null;
  };

  while (i < tokens.length) {
    if (/^[AaCcHhLlMmQqSsTtVvZz]$/.test(tokens[i])) {
      const rawCmd = tokens[i];
      cmd = rawCmd.toUpperCase();
      rel = rawCmd !== cmd;
      i += 1;
      if (cmd === 'Z') {
        closed = true;
        if (subpathStart) cursor = { ...subpathStart };
        prevCmd = 'Z';
        lastCubicControl = null;
        lastQuadraticControl = null;
      }
      continue;
    }

    if (cmd === 'M') {
      const x0 = readNum();
      const y0 = readNum();
      if (x0 === null || y0 === null) break;
      const x = rel ? cursor.x + x0 : x0;
      const y = rel ? cursor.y + y0 : y0;
      pts.push({ id: uid(), p: { x, y }, in: null, out: null });
      cursor = { x, y };
      subpathStart = { x, y };
      cmd = 'L';
      prevCmd = 'M';
      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    if (cmd === 'L') {
      const x0 = readNum();
      const y0 = readNum();
      if (x0 === null || y0 === null) break;
      const x = rel ? cursor.x + x0 : x0;
      const y = rel ? cursor.y + y0 : y0;
      pts.push({ id: uid(), p: { x, y }, in: null, out: null });
      cursor = { x, y };
      prevCmd = 'L';
      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    if (cmd === 'H') {
      const x0 = readNum();
      if (x0 === null) break;
      const x = rel ? cursor.x + x0 : x0;
      const y = cursor.y;
      pts.push({ id: uid(), p: { x, y }, in: null, out: null });
      cursor = { x, y };
      prevCmd = 'H';
      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    if (cmd === 'V') {
      const y0 = readNum();
      if (y0 === null) break;
      const x = cursor.x;
      const y = rel ? cursor.y + y0 : y0;
      pts.push({ id: uid(), p: { x, y }, in: null, out: null });
      cursor = { x, y };
      prevCmd = 'V';
      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    if (cmd === 'C' && pts.length > 0) {
      const x10 = readNum();
      const y10 = readNum();
      const x20 = readNum();
      const y20 = readNum();
      const x0 = readNum();
      const y0 = readNum();
      if (x10 === null || y10 === null || x20 === null || y20 === null || x0 === null || y0 === null) break;
      const x1 = rel ? cursor.x + x10 : x10;
      const y1 = rel ? cursor.y + y10 : y10;
      const x2 = rel ? cursor.x + x20 : x20;
      const y2 = rel ? cursor.y + y20 : y20;
      const x = rel ? cursor.x + x0 : x0;
      const y = rel ? cursor.y + y0 : y0;
      const prev = pts[pts.length - 1];
      prev.out = { x: x1, y: y1 };
      pts.push({ id: uid(), p: { x, y }, in: { x: x2, y: y2 }, out: null });
      cursor = { x, y };
      prevCmd = 'C';
      lastCubicControl = { x: x2, y: y2 };
      lastQuadraticControl = null;
      continue;
    }

    if (cmd === 'S' && pts.length > 0) {
      const x20 = readNum();
      const y20 = readNum();
      const x0 = readNum();
      const y0 = readNum();
      if (x20 === null || y20 === null || x0 === null || y0 === null) break;
      const x2 = rel ? cursor.x + x20 : x20;
      const y2 = rel ? cursor.y + y20 : y20;
      const x = rel ? cursor.x + x0 : x0;
      const y = rel ? cursor.y + y0 : y0;
      const x1 = prevCmd === 'C' || prevCmd === 'S' ? 2 * cursor.x - (lastCubicControl?.x ?? cursor.x) : cursor.x;
      const y1 = prevCmd === 'C' || prevCmd === 'S' ? 2 * cursor.y - (lastCubicControl?.y ?? cursor.y) : cursor.y;
      const prev = pts[pts.length - 1];
      prev.out = { x: x1, y: y1 };
      pts.push({ id: uid(), p: { x, y }, in: { x: x2, y: y2 }, out: null });
      cursor = { x, y };
      prevCmd = 'S';
      lastCubicControl = { x: x2, y: y2 };
      lastQuadraticControl = null;
      continue;
    }

    if (cmd === 'Q' && pts.length > 0) {
      const x10 = readNum();
      const y10 = readNum();
      const x0 = readNum();
      const y0 = readNum();
      if (x10 === null || y10 === null || x0 === null || y0 === null) break;
      const qx = rel ? cursor.x + x10 : x10;
      const qy = rel ? cursor.y + y10 : y10;
      const x = rel ? cursor.x + x0 : x0;
      const y = rel ? cursor.y + y0 : y0;
      const c1 = { x: cursor.x + (2 / 3) * (qx - cursor.x), y: cursor.y + (2 / 3) * (qy - cursor.y) };
      const c2 = { x: x + (2 / 3) * (qx - x), y: y + (2 / 3) * (qy - y) };
      const prev = pts[pts.length - 1];
      prev.out = c1;
      pts.push({ id: uid(), p: { x, y }, in: c2, out: null });
      cursor = { x, y };
      prevCmd = 'Q';
      lastCubicControl = null;
      lastQuadraticControl = { x: qx, y: qy };
      continue;
    }

    if (cmd === 'T' && pts.length > 0) {
      const x0 = readNum();
      const y0 = readNum();
      if (x0 === null || y0 === null) break;
      const x = rel ? cursor.x + x0 : x0;
      const y = rel ? cursor.y + y0 : y0;
      const q: Vec =
        prevCmd === 'Q' || prevCmd === 'T'
          ? { x: 2 * cursor.x - (lastQuadraticControl?.x ?? cursor.x), y: 2 * cursor.y - (lastQuadraticControl?.y ?? cursor.y) }
          : { ...cursor };
      const c1 = { x: cursor.x + (2 / 3) * (q.x - cursor.x), y: cursor.y + (2 / 3) * (q.y - cursor.y) };
      const c2 = { x: x + (2 / 3) * (q.x - x), y: y + (2 / 3) * (q.y - y) };
      const prev = pts[pts.length - 1];
      prev.out = c1;
      pts.push({ id: uid(), p: { x, y }, in: c2, out: null });
      cursor = { x, y };
      prevCmd = 'T';
      lastCubicControl = null;
      lastQuadraticControl = q;
      continue;
    }

    if (cmd === 'A' && pts.length > 0) {
      const rx = readNum();
      const ry = readNum();
      const angle = readNum();
      const largeArcFlag = readNum();
      const sweepFlag = readNum();
      const x0 = readNum();
      const y0 = readNum();
      if (
        rx === null ||
        ry === null ||
        angle === null ||
        largeArcFlag === null ||
        sweepFlag === null ||
        x0 === null ||
        y0 === null
      ) {
        break;
      }
      const x = rel ? cursor.x + x0 : x0;
      const y = rel ? cursor.y + y0 : y0;
      const segs = arcToCubicSegments(cursor.x, cursor.y, rx, ry, angle, largeArcFlag ? 1 : 0, sweepFlag ? 1 : 0, x, y);
      if (!segs.length) {
        pts.push({ id: uid(), p: { x, y }, in: null, out: null });
      } else {
        for (let si = 0; si < segs.length; si += 1) {
          const seg = segs[si];
          const prev = pts[pts.length - 1];
          prev.out = { ...seg.c1 };
          pts.push({ id: uid(), p: { ...seg.p }, in: { ...seg.c2 }, out: null });
        }
      }
      cursor = { x, y };
      prevCmd = 'A';
      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    if (cmd && !['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z'].includes(cmd)) {
      return null;
    }

    break;
  }

  if (pts.length < 2) return null;
  if (closed && pts.length > 2) {
    const first = pts[0].p;
    const last = pts[pts.length - 1];
    if (Math.hypot(first.x - last.p.x, first.y - last.p.y) < 0.001) {
      // Preserve closing-curve handles before dropping duplicate end anchor.
      if (last.in && !pts[0].in) pts[0].in = { ...last.in };
      if (last.out && !pts[0].out) pts[0].out = { ...last.out };
      pts.pop();
    }
  }
  const hasInvalid = pts.some(
    (pt) =>
      !Number.isFinite(pt.p.x) ||
      !Number.isFinite(pt.p.y) ||
      (pt.in !== null && (!Number.isFinite(pt.in.x) || !Number.isFinite(pt.in.y))) ||
      (pt.out !== null && (!Number.isFinite(pt.out.x) || !Number.isFinite(pt.out.y))),
  );
  if (hasInvalid) return null;
  return { points: pts, closed };
};

const parseCirclePoints = (circleTag: string): Point[] | null => {
  const cx = Number(attr(circleTag, 'cx') ?? '0');
  const cy = Number(attr(circleTag, 'cy') ?? '0');
  const r = Number(attr(circleTag, 'r'));
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r <= 0) return null;

  const k = r * 0.5522847498307936; // Cubic-bezier approximation constant for circular arcs.
  return [
    {
      id: uid(),
      p: { x: cx + r, y: cy },
      in: { x: cx + r, y: cy - k },
      out: { x: cx + r, y: cy + k },
    },
    {
      id: uid(),
      p: { x: cx, y: cy + r },
      in: { x: cx + k, y: cy + r },
      out: { x: cx - k, y: cy + r },
    },
    {
      id: uid(),
      p: { x: cx - r, y: cy },
      in: { x: cx - r, y: cy + k },
      out: { x: cx - r, y: cy - k },
    },
    {
      id: uid(),
      p: { x: cx, y: cy - r },
      in: { x: cx - k, y: cy - r },
      out: { x: cx + k, y: cy - r },
    },
  ];
};

const parseEllipsePoints = (ellipseTag: string): Point[] | null => {
  const cx = Number(attr(ellipseTag, 'cx') ?? '0');
  const cy = Number(attr(ellipseTag, 'cy') ?? '0');
  const rx = Number(attr(ellipseTag, 'rx'));
  const ry = Number(attr(ellipseTag, 'ry'));
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) {
    return null;
  }
  const k = 0.5522847498307936;
  const kx = rx * k;
  const ky = ry * k;
  return [
    {
      id: uid(),
      p: { x: cx + rx, y: cy },
      in: { x: cx + rx, y: cy - ky },
      out: { x: cx + rx, y: cy + ky },
    },
    {
      id: uid(),
      p: { x: cx, y: cy + ry },
      in: { x: cx + kx, y: cy + ry },
      out: { x: cx - kx, y: cy + ry },
    },
    {
      id: uid(),
      p: { x: cx - rx, y: cy },
      in: { x: cx - rx, y: cy + ky },
      out: { x: cx - rx, y: cy - ky },
    },
    {
      id: uid(),
      p: { x: cx, y: cy - ry },
      in: { x: cx - kx, y: cy - ry },
      out: { x: cx + kx, y: cy - ry },
    },
  ];
};

const parseRectPoints = (rectTag: string): Point[] | null => {
  const x = Number(attr(rectTag, 'x') ?? '0');
  const y = Number(attr(rectTag, 'y') ?? '0');
  const w = Number(attr(rectTag, 'width'));
  const h = Number(attr(rectTag, 'height'));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;

  const rxAttr = attr(rectTag, 'rx');
  const ryAttr = attr(rectTag, 'ry');
  let rx = Number(rxAttr ?? ryAttr ?? '0');
  let ry = Number(ryAttr ?? rxAttr ?? '0');
  if (!Number.isFinite(rx) || rx < 0) rx = 0;
  if (!Number.isFinite(ry) || ry < 0) ry = 0;
  rx = clamp(rx, 0, w / 2);
  ry = clamp(ry, 0, h / 2);

  if (rx <= 0 || ry <= 0) {
    return [
      { id: uid(), p: { x, y }, in: null, out: null },
      { id: uid(), p: { x: x + w, y }, in: null, out: null },
      { id: uid(), p: { x: x + w, y: y + h }, in: null, out: null },
      { id: uid(), p: { x, y: y + h }, in: null, out: null },
    ];
  }

  const d = `M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
  return parsePathD(d)?.points ?? null;
};

const parseLinePoints = (lineTag: string): Point[] | null => {
  const x1 = Number(attr(lineTag, 'x1') ?? '0');
  const y1 = Number(attr(lineTag, 'y1') ?? '0');
  const x2 = Number(attr(lineTag, 'x2') ?? '0');
  const y2 = Number(attr(lineTag, 'y2') ?? '0');
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  if (Math.hypot(x2 - x1, y2 - y1) < 0.000001) return null;
  return [
    { id: uid(), p: { x: x1, y: y1 }, in: null, out: null },
    { id: uid(), p: { x: x2, y: y2 }, in: null, out: null },
  ];
};

const parsePointsAttribute = (tag: string): Point[] | null => {
  const raw = attr(tag, 'points');
  if (!raw) return null;
  const nums = (raw.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  if (nums.length < 4 || nums.length % 2 !== 0 || nums.some((n) => !Number.isFinite(n))) return null;
  const out: Point[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    out.push({ id: uid(), p: { x: nums[i], y: nums[i + 1] }, in: null, out: null });
  }
  return out;
};

const parseViewBox = (input: string) => {
  const svgOpen = input.match(/<svg\b[^>]*>/i)?.[0];
  if (!svgOpen) return null;
  const viewBox = attr(svgOpen, 'viewBox');
  if (!viewBox) return null;
  const nums = (viewBox.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  if (nums.length < 4 || nums.slice(0, 4).some((n) => !Number.isFinite(n))) return null;
  const [minX, minY, vbW, vbH] = nums;
  if (vbW <= 0 || vbH <= 0) return null;
  return { minX, minY, vbW, vbH };
};

const parseSvgRootStyleDefaults = (input: string) => {
  const svgOpen = input.match(/<svg\b[^>]*>/i)?.[0];
  if (!svgOpen) {
    return {
      fill: null as string | null,
      stroke: null as string | null,
      strokeWidth: null as string | null,
      strokeLinecap: null as string | null,
      strokeLinejoin: null as string | null,
      opacity: null as string | null,
    };
  }
  return {
    fill: attr(svgOpen, 'fill'),
    stroke: attr(svgOpen, 'stroke'),
    strokeWidth: attr(svgOpen, 'stroke-width'),
    strokeLinecap: attr(svgOpen, 'stroke-linecap'),
    strokeLinejoin: attr(svgOpen, 'stroke-linejoin'),
    opacity: attr(svgOpen, 'opacity'),
  };
};

const mapPointFromViewBox = (p: Vec, vb: { minX: number; minY: number; vbW: number; vbH: number }): Vec => {
  const { s, ox, oy } = getContainMap(vb);
  return {
    x: (p.x - vb.minX) * s + ox,
    y: (p.y - vb.minY) * s + oy,
  };
};

const mapShapesFromViewBox = (shapes: PathShape[], vb: { minX: number; minY: number; vbW: number; vbH: number }) =>
  shapes.map((shape) => {
    const { s } = getContainMap(vb);
    return {
      ...shape,
      strokeWidth: shape.strokeWidth * s,
      points: shape.points.map((pt) => ({
        ...pt,
        p: mapPointFromViewBox(pt.p, vb),
        in: pt.in ? mapPointFromViewBox(pt.in, vb) : null,
        out: pt.out ? mapPointFromViewBox(pt.out, vb) : null,
      })),
    };
  });

const autoFitShapesToViewport = (shapes: PathShape[]) => {
  const all = shapes.flatMap((shape) => shape.points.map((pt) => pt.p));
  if (!all.length) return shapes;

  const minX = Math.min(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxX = Math.max(...all.map((p) => p.x));
  const maxY = Math.max(...all.map((p) => p.y));

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;

  const outCount = all.filter((p) => p.x < 0 || p.x > width || p.y < 0 || p.y > height).length;
  const outRatio = outCount / all.length;
  const shouldFit = outRatio > 0.25 || bw > width * 1.25 || bh > height * 1.25;
  if (!shouldFit) return shapes;

  const pad = 24;
  const sx = (width - pad * 2) / bw;
  const sy = (height - pad * 2) / bh;
  const s = Math.max(0.0001, Math.min(sx, sy));
  const ox = (width - bw * s) / 2 - minX * s;
  const oy = (height - bh * s) / 2 - minY * s;
  const map = (p: Vec): Vec => ({ x: p.x * s + ox, y: p.y * s + oy });

  return shapes.map((shape) => ({
    ...shape,
    points: shape.points.map((pt) => ({
      ...pt,
      p: map(pt.p),
      in: pt.in ? map(pt.in) : null,
      out: pt.out ? map(pt.out) : null,
    })),
  }));
};

const parseSvg = (input: string): { shapes: PathShape[]; viewBox: ViewBox } | null => {
  const geometryMatches = [...input.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b[^>]*>/gi)].map((m) => m[0]);
  if (!geometryMatches.length) return null;
  const rootDefaults = parseSvgRootStyleDefaults(input);

  const shapes: PathShape[] = [];

  for (let k = 0; k < geometryMatches.length; k += 1) {
    const tag = geometryMatches[k];
    const tagName = /^<([a-z]+)/i.exec(tag)?.[1]?.toLowerCase();
    if (!tagName) continue;

    let points: Point[] | null = null;
    let sourceD: string | null = null;
    let closed = false;
    if (tagName === 'path') {
      const d = attr(tag, 'd');
      if (!d) continue;
      const parsed = parsePathD(d);
      if (!parsed) continue;
      points = parsed.points;
      sourceD = d;
      closed = parsed.closed;
    } else if (tagName === 'circle') {
      points = parseCirclePoints(tag);
      if (!points) continue;
      closed = true;
    } else if (tagName === 'ellipse') {
      points = parseEllipsePoints(tag);
      if (!points) continue;
      closed = true;
    } else if (tagName === 'rect') {
      points = parseRectPoints(tag);
      if (!points) continue;
      closed = true;
    } else if (tagName === 'line') {
      points = parseLinePoints(tag);
      if (!points) continue;
      closed = false;
    } else if (tagName === 'polyline') {
      points = parsePointsAttribute(tag);
      if (!points || points.length < 2) continue;
      closed = false;
    } else if (tagName === 'polygon') {
      points = parsePointsAttribute(tag);
      if (!points || points.length < 2) continue;
      const first = points[0].p;
      const last = points[points.length - 1].p;
      if (Math.hypot(first.x - last.x, first.y - last.y) < 0.001 && points.length > 2) points.pop();
      closed = true;
    } else {
      continue;
    }

    const fillAttr = attr(tag, 'fill') ?? rootDefaults.fill;
    const strokeAttr = attr(tag, 'stroke') ?? rootDefaults.stroke;
    const swAttr = attr(tag, 'stroke-width') ?? rootDefaults.strokeWidth;
    const sw = Number(swAttr ?? '1');
    const slcAttr = attr(tag, 'stroke-linecap') ?? rootDefaults.strokeLinecap;
    const sljAttr = attr(tag, 'stroke-linejoin') ?? rootDefaults.strokeLinejoin;
    const opacityAttr = attr(tag, 'opacity') ?? rootDefaults.opacity;
    const opacity = clamp(Number(opacityAttr ?? '1'), 0, 1);
    const svgId = attr(tag, 'id') ?? '';
    const svgClass = attr(tag, 'class') ?? '';
    const fill = fillAttr ?? 'currentColor';
    const stroke = strokeAttr ?? 'currentColor';
    const strokeLinecap = parseStrokeLinecap(slcAttr) ?? 'round';
    const strokeLinejoin = parseStrokeLinejoin(sljAttr) ?? 'round';
    const fillExplicit = fillAttr !== null;
    const strokeExplicit = strokeAttr !== null;
    const strokeWidthExplicit = swAttr !== null;
    const strokeLinecapExplicit = slcAttr !== null;
    const strokeLinejoinExplicit = sljAttr !== null;

    shapes.push({
      id: uid(),
      name: `Path ${k + 1}`,
      points,
      uiRotation: 0,
      svgId,
      svgClass,
      sourceD,
      geometryDirty: false,
      closed,
      fill,
      stroke,
      strokeWidth: Number.isFinite(sw) ? sw : 3,
      strokeLinecap,
      strokeLinejoin,
      opacity: Number.isFinite(opacity) ? opacity : 1,
      fillExplicit,
      strokeExplicit,
      strokeWidthExplicit,
      strokeLinecapExplicit,
      strokeLinejoinExplicit,
      opacityExplicit: opacityAttr !== null,
    });
  }

  if (!shapes.length) return null;

  const vb = parseViewBox(input);
  const mapped = vb ? mapShapesFromViewBox(shapes, vb) : shapes;
  return { shapes: vb ? mapped : autoFitShapesToViewport(mapped), viewBox: vb ?? INTERNAL_VIEWBOX };
};

const DEFAULT_BLANK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 21">
  <path d="M20.5096 14.5098C20.5096 15.6098 19.6096 16.5098 18.5096 16.5098H5.33961C4.80961 16.5098 4.29961 16.7198 3.92961 17.0998L1.72961 19.2998C1.44961 19.5798 0.999614 19.5798 0.729614 19.2998C0.599614 19.1698 0.519614 18.9898 0.519614 18.7998V2.50977C0.509614 1.40977 1.40961 0.509766 2.50961 0.509766H18.5096C19.6096 0.509766 20.5096 1.40977 20.5096 2.50977V14.5098Z" id="SpeechBubble" fill="none" stroke="#FFC366" stroke-width="1.03" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M10.76 5.06006C10.76 5.40006 10.89 5.75006 11.11 5.98006L12.61 7.61006C12.66 7.68006 12.73 7.73006 12.81 7.77006C12.94 7.82006 13.08 7.82006 13.2 7.77006C13.28 7.73006 13.35 7.68006 13.4 7.61006L14.9 5.98006C15.13 5.73006 15.25 5.40006 15.25 5.06006C15.25 4.37006 14.69 3.81006 14 3.81006C13.61 3.81006 13.24 4.00006 13 4.31006C12.59 3.76006 11.8 3.65006 11.25 4.06006C10.94 4.30006 10.75 4.67006 10.75 5.06006" id="Heart" fill="#EE2855" />
  <path d="M6.00023 13.6898V7.7998H8.36023C8.79023 7.7998 9.15023 7.8598 9.44023 7.9898C9.73023 8.1198 9.95023 8.2998 10.0902 8.5198C10.2402 8.7498 10.3102 9.0098 10.3102 9.2998C10.3102 9.5298 10.2602 9.7298 10.1702 9.9098C10.0802 10.0798 9.95023 10.2298 9.79023 10.3398C9.63023 10.4498 9.45023 10.5298 9.24023 10.5698V10.6298C9.46023 10.6298 9.67023 10.6998 9.87023 10.8198C10.0702 10.9398 10.2302 11.0998 10.3502 11.3098C10.4702 11.5198 10.5302 11.7698 10.5302 12.0598C10.5302 12.3698 10.4502 12.6498 10.3002 12.8998C10.1502 13.1398 9.92023 13.3398 9.62023 13.4798C9.32023 13.6198 8.95023 13.6898 8.51023 13.6898H5.99023H6.00023ZM7.25023 10.2698H8.17023C8.34023 10.2698 8.49023 10.2398 8.63023 10.1798C8.76023 10.1198 8.87023 10.0298 8.95023 9.9198C9.03023 9.8098 9.07023 9.6798 9.07023 9.5198C9.07023 9.3098 8.99023 9.1398 8.84023 9.0098C8.69023 8.8798 8.48023 8.8098 8.20023 8.8098H7.25023V10.2698ZM7.25023 12.6798H8.27024C8.62024 12.6798 8.87023 12.6098 9.03023 12.4798C9.19023 12.3498 9.27024 12.1698 9.27024 11.9498C9.27024 11.7898 9.23023 11.6398 9.15023 11.5198C9.07023 11.3998 8.96024 11.2998 8.81024 11.2298C8.67024 11.1598 8.49023 11.1198 8.29023 11.1198H7.25023V12.6798Z" id="B" fill="#FF9A00" />
  <path d="M11.3098 13.69V12.96L13.4698 10.28V10.25H11.3798V9.27002H14.9398V10.07L12.9098 12.68V12.71H15.0098V13.69H11.2998H11.3098Z" id="z" fill="#FFC366" />
</svg>`;

const DEFAULT_DOCUMENT = (() => {
  const parsed = parseSvg(DEFAULT_BLANK_SVG);
  if (parsed) {
    if (parsed.shapes.length === 2) {
      const shapes = parsed.shapes.map((shape, i) => {
        if (i === 0) return { ...shape, name: 'Heart', svgId: 'Heart' };
        if (i === 1) return { ...shape, name: 'SpeechBubble', svgId: 'SpeechBubble' };
        return shape;
      });
      return { ...parsed, shapes };
    }
    return parsed;
  }
  return {
    shapes: [createPresetPath('Path 1', 'roundedDiamond', width / 2, height / 2)],
    viewBox: INTERNAL_VIEWBOX,
  };
})();

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');

const highlightSvgTagHtml = (tag: string): string => {
  const tagMatch = tag.match(/^<\s*(\/?)\s*([^\s/>]+)([\s\S]*?)(\/?)\s*>$/);
  if (!tagMatch) return escapeHtml(tag);

  const [, closeSlash, name, restRaw, selfClose] = tagMatch;
  const rest = restRaw ?? '';
  let out = `<span class="tok-punc">&lt;</span>`;
  if (closeSlash) out += `<span class="tok-punc">/</span>`;
  out += `<span class="tok-tag">${escapeHtml(name)}</span>`;

  const attrRe = /([:\w-]+)(\s*=\s*)(['"])([\s\S]*?)\3|([:\w-]+)(\s*=\s*)([^\s"'=<>`]+)/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(rest))) {
    if (m.index > cursor) out += escapeHtml(rest.slice(cursor, m.index));
    if (m[1]) {
      out += `<span class="tok-attr">${escapeHtml(m[1])}</span>`;
      out += `<span class="tok-punc">${escapeHtml(m[2] ?? '=')}</span>`;
      const q = m[3];
      const v = m[4] ?? '';
      out += `<span class="tok-string">${escapeHtml(q)}${escapeHtml(v)}${escapeHtml(q)}</span>`;
    } else {
      out += `<span class="tok-attr">${escapeHtml(m[5] ?? '')}</span>`;
      out += `<span class="tok-punc">${escapeHtml(m[6] ?? '=')}</span>`;
      out += `<span class="tok-number">${escapeHtml(m[7] ?? '')}</span>`;
    }
    cursor = attrRe.lastIndex;
  }
  if (cursor < rest.length) out += escapeHtml(rest.slice(cursor));

  if (selfClose) out += `<span class="tok-punc">/</span>`;
  out += `<span class="tok-punc">&gt;</span>`;
  return out;
};

const syntaxHighlightSvgHtml = (code: string): string => {
  const tags = [...code.matchAll(/<[^>]+>/g)];
  if (!tags.length) return `<span class="tok-text">${escapeHtml(code)}</span>`;
  let out = '';
  let cursor = 0;
  for (const m of tags) {
    if (m.index === undefined) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (start > cursor) out += `<span class="tok-text">${escapeHtml(code.slice(cursor, start))}</span>`;
    out += highlightSvgTagHtml(m[0]);
    cursor = end;
  }
  if (cursor < code.length) out += `<span class="tok-text">${escapeHtml(code.slice(cursor))}</span>`;
  return out;
};

const extractSvgFromClipboard = (data: DataTransfer | null | undefined): string => {
  if (!data) return '';
  const candidates = [data.getData('image/svg+xml'), data.getData('text/plain'), data.getData('text'), data.getData('text/html')].filter(
    (v) => !!v && !!v.trim(),
  );
  for (const raw of candidates) {
    const text = raw.trim();
    const direct = text.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0];
    if (direct) return direct.trim();

    const decoded = text
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&');
    const decodedMatch = decoded.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0];
    if (decodedMatch) return decodedMatch.trim();

    if (/^<\?xml[\s\S]*<svg\b/i.test(text) || /^<svg\b/i.test(text)) return text;
  }
  return '';
};

const getSelectedAnchorRangesInD = (d: string, selectedPoints: number[]) => {
  const selected = new Set(selectedPoints);
  const tokens: Array<{ text: string; index: number; cmd: boolean }> = [];
  const re = /[MLHVCZmlhvcz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const text = m[0];
    const index = m.index;
    tokens.push({ text, index, cmd: /^[MLCZmlcz]$/.test(text) });
  }

  const out: Array<{ start: number; end: number }> = [];
  let i = 0;
  let cmd = '';
  let pointIndex = -1;

  const isNum = (k: number) => k < tokens.length && !tokens[k].cmd;

  while (i < tokens.length) {
    if (tokens[i].cmd) {
      cmd = tokens[i].text.toUpperCase();
      i += 1;
      continue;
    }
    if (!cmd) break;

    if (cmd === 'M') {
      if (!(isNum(i) && isNum(i + 1))) break;
      pointIndex += 1;
      if (selected.has(pointIndex)) {
        out.push({ start: tokens[i].index, end: tokens[i].index + tokens[i].text.length });
        out.push({ start: tokens[i + 1].index, end: tokens[i + 1].index + tokens[i + 1].text.length });
      }
      i += 2;
      cmd = 'L';
      continue;
    }

    if (cmd === 'L') {
      if (!(isNum(i) && isNum(i + 1))) break;
      pointIndex += 1;
      if (selected.has(pointIndex)) {
        out.push({ start: tokens[i].index, end: tokens[i].index + tokens[i].text.length });
        out.push({ start: tokens[i + 1].index, end: tokens[i + 1].index + tokens[i + 1].text.length });
      }
      i += 2;
      continue;
    }

    if (cmd === 'H') {
      if (!isNum(i)) break;
      pointIndex += 1;
      if (selected.has(pointIndex)) {
        out.push({ start: tokens[i].index, end: tokens[i].index + tokens[i].text.length });
      }
      i += 1;
      continue;
    }

    if (cmd === 'V') {
      if (!isNum(i)) break;
      pointIndex += 1;
      if (selected.has(pointIndex)) {
        out.push({ start: tokens[i].index, end: tokens[i].index + tokens[i].text.length });
      }
      i += 1;
      continue;
    }

    if (cmd === 'C') {
      if (!(isNum(i) && isNum(i + 1) && isNum(i + 2) && isNum(i + 3) && isNum(i + 4) && isNum(i + 5))) break;
      pointIndex += 1;
      if (selected.has(pointIndex)) {
        out.push({ start: tokens[i + 4].index, end: tokens[i + 4].index + tokens[i + 4].text.length });
        out.push({ start: tokens[i + 5].index, end: tokens[i + 5].index + tokens[i + 5].text.length });
      }
      i += 6;
      continue;
    }

    break;
  }

  return out.sort((a, b) => a.start - b.start);
};

const wrapEscapedRanges = (text: string, ranges: Array<{ start: number; end: number }>, cls: string) => {
  if (!ranges.length) return syntaxHighlightSvgHtml(text);
  const clean = ranges
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const r of clean) {
    const start = clamp(r.start, 0, text.length);
    const end = clamp(r.end, start, text.length);
    if (start > cursor) out += syntaxHighlightSvgHtml(text.slice(cursor, start));
    out += `<span class="${cls}">${syntaxHighlightSvgHtml(text.slice(start, end))}</span>`;
    cursor = end;
  }
  if (cursor < text.length) out += syntaxHighlightSvgHtml(text.slice(cursor));
  return out;
};

const highlightSelectedPathHtml = (code: string, selectedPath: number, selectedPoints: number[]) => {
  const re = /<path\b[^>]*>/gi;
  const matches = [...code.matchAll(re)];
  if (!matches.length || selectedPath < 0 || selectedPath >= matches.length) return syntaxHighlightSvgHtml(code);

  const m = matches[selectedPath];
  if (m.index === undefined) return syntaxHighlightSvgHtml(code);

  const start = m.index;
  const end = start + m[0].length;
  const tag = code.slice(start, end);
  const dMatch = /d\s*=\s*(['"])([\s\S]*?)\1/i.exec(tag);
  let tagHtml = syntaxHighlightSvgHtml(tag);

  if (dMatch && selectedPoints.length) {
    const value = dMatch[2];
    const inMatch = dMatch[0].indexOf(value);
    const valueStart = dMatch.index + (inMatch >= 0 ? inMatch : 0);
    const valueRanges = getSelectedAnchorRangesInD(value, selectedPoints).map((r) => ({
      start: valueStart + r.start,
      end: valueStart + r.end,
    }));
    tagHtml = wrapEscapedRanges(tag, valueRanges, 'selected-point-code');
  }

  return `${syntaxHighlightSvgHtml(code.slice(0, start))}<span class="selected-code">${tagHtml}</span>${syntaxHighlightSvgHtml(code.slice(end))}`;
};

const pathIndexAtCaret = (code: string, caret: number): number | null => {
  const re = /<path\b[^>]*>/gi;
  const matches = [...code.matchAll(re)];
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    if (m.index === undefined) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (caret >= start && caret <= end) return i;
  }
  return null;
};

export type { DragTarget, PathShape, PenHover, Point, ShapePreset, Snapshot, StylePanel, Tool, Vec, ViewBox };
export {
  DEFAULT_DOCUMENT,
  MAX_ZOOM,
  MERGE_MAX_STEP_DISTANCE,
  MIN_ZOOM,
  SliderInline,
  height,
  WORLD_LIMIT,
  ZOOM_RECENTER_BLEND,
  clamp,
  clonePoint,
  clonePoints,
  cloneShapes,
  closestSegment,
  createPresetPath,
  dist,
  extractSvgFromClipboard,
  formatSvgCode,
  getPathBounds,
  highlightSelectedPathHtml,
  makePoint,
  mapPointFromViewBox,
  mergePointPair,
  mirrorHandle,
  mapPathDFromViewBox,
  parseColorToRgba,
  parseSvg,
  pathData,
  pathIndexAtCaret,
  rgbaToCss,
  rgbaToHexAlpha,
  rotateAround,
  sampleBezier,
  serializeSvg,
  simplifyPathByThreshold,
  smoothSharpCorners,
  syntaxHighlightSvgHtml,
  width,
};
