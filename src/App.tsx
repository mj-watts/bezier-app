import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Diamond, Square, Triangle } from 'lucide-react';
import MuiSlider from '@mui/material/Slider';
import { HexAlphaColorPicker } from 'react-colorful';
import AboutModal from './components/AboutModal';
import CodePane from './components/CodePane';
import ControlsBar from './components/ControlsBar';
import ToolDock from './components/ToolDock';
import TopBar from './components/TopBar';

type Vec = { x: number; y: number };

type Point = {
  id: string;
  p: Vec;
  in: Vec | null;
  out: Vec | null;
};

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
  opacity: number;
  fillExplicit: boolean;
  strokeExplicit: boolean;
  strokeWidthExplicit: boolean;
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
  const k = 0.5522847498;
  const rk = radius * k;
  return [
    {
      id: uid(),
      p: { x: cx, y: cy - radius },
      in: { x: cx - rk, y: cy - radius },
      out: { x: cx + rk, y: cy - radius },
    },
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
  ] satisfies Point[];
};

const createPresetPath = (name: string, preset: ShapePreset, cx: number, cy: number): PathShape => {
  const radius = 90;
  const points =
    preset === 'circle'
      ? createCirclePoints(cx, cy, radius)
      : preset === 'roundedSquare'
        ? createCurvedPolygonPoints(cx, cy, radius, 4, -Math.PI / 4, 0.14)
        : preset === 'roundedDiamond'
          ? createCurvedPolygonPoints(cx, cy, radius, 4, 0, 0.12)
          : createCurvedPolygonPoints(cx, cy, radius, 3, -Math.PI / 2, 0.16);

  return {
    id: uid(),
    name,
    points,
    uiRotation: 0,
    svgId: '',
    svgClass: '',
    sourceD: null,
    geometryDirty: true,
    fill: '#58a6ff55',
    stroke: '#79c0ff',
    strokeWidth: 3,
    opacity: 1,
    fillExplicit: true,
    strokeExplicit: true,
    strokeWidthExplicit: true,
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
  shapes.map((shape) => ({
    ...shape,
    points: shape.points.map((pt) => ({
      ...pt,
      p: mapPointToViewBox(pt.p, vb),
      in: pt.in ? mapPointToViewBox(pt.in, vb) : null,
      out: pt.out ? mapPointToViewBox(pt.out, vb) : null,
    })),
  }));

const serializeSvg = (shapes: PathShape[], vb: ViewBox) => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const exportShapes = mapShapesToViewBox(shapes, vb);
  const lines = shapes
    .map((shape, i) => {
      const exportShape = exportShapes[i];
      if (!exportShape) return '';
      const d = !shape.geometryDirty && shape.sourceD ? shape.sourceD : pathData(exportShape.points, exportShape.closed);
      const attrs: string[] = [`d="${d}"`];
      if (shape.svgId.trim()) attrs.push(`id="${esc(shape.svgId.trim())}"`);
      if (shape.svgClass.trim()) attrs.push(`class="${esc(shape.svgClass.trim())}"`);
      if (shape.fillExplicit) attrs.push(`fill="${shape.fill}"`);
      if (shape.opacityExplicit) attrs.push(`opacity="${Number(shape.opacity.toFixed(4))}"`);
      const shouldExportStroke = shape.strokeWidth > 0;
      if (shouldExportStroke && shape.strokeExplicit) attrs.push(`stroke="${shape.stroke}"`);
      if (shouldExportStroke && shape.strokeWidthExplicit) attrs.push(`stroke-width="${shape.strokeWidth}"`);
      return `  <path ${attrs.join(' ')} />`;
    })
    .filter(Boolean)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.minX} ${vb.minY} ${vb.vbW} ${vb.vbH}">\n${lines}\n</svg>`;
};

const attr = (text: string, name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quoted = text.match(new RegExp(`${escaped}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  if (quoted) return quoted[2];
  const unquoted = text.match(new RegExp(`${escaped}\\s*=\\s*([^\\s>]+)`, 'i'));
  return unquoted ? unquoted[1] : null;
};

const parsePathD = (d: string) => {
  const tokens = (d.match(/[MLHVCZmlhvcz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []).map((t) => t.trim());
  if (!tokens.length) return null;

  const pts: Point[] = [];
  let i = 0;
  let cmd = '';
  let rel = false;
  let cursor = { x: 0, y: 0 };
  let closed = false;

  const readNum = (): number | null => {
    if (i >= tokens.length) return null;
    const n = Number(tokens[i]);
    i += 1;
    return Number.isFinite(n) ? n : null;
  };

  while (i < tokens.length) {
    if (/^[MLHVCZmlhvcz]$/.test(tokens[i])) {
      const rawCmd = tokens[i];
      cmd = rawCmd.toUpperCase();
      rel = rawCmd !== cmd;
      i += 1;
      if (cmd === 'Z') {
        closed = true;
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
      cmd = 'L';
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
      continue;
    }

    if (cmd === 'H') {
      const x0 = readNum();
      if (x0 === null) break;
      const x = rel ? cursor.x + x0 : x0;
      const y = cursor.y;
      pts.push({ id: uid(), p: { x, y }, in: null, out: null });
      cursor = { x, y };
      continue;
    }

    if (cmd === 'V') {
      const y0 = readNum();
      if (y0 === null) break;
      const x = cursor.x;
      const y = rel ? cursor.y + y0 : y0;
      pts.push({ id: uid(), p: { x, y }, in: null, out: null });
      cursor = { x, y };
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
      continue;
    }

    break;
  }

  if (pts.length < 2) return null;
  if (closed && pts.length > 2) {
    const first = pts[0].p;
    const last = pts[pts.length - 1].p;
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.001) {
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
      opacity: null as string | null,
    };
  }
  return {
    fill: attr(svgOpen, 'fill'),
    stroke: attr(svgOpen, 'stroke'),
    strokeWidth: attr(svgOpen, 'stroke-width'),
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
  shapes.map((shape) => ({
    ...shape,
    points: shape.points.map((pt) => ({
      ...pt,
      p: mapPointFromViewBox(pt.p, vb),
      in: pt.in ? mapPointFromViewBox(pt.in, vb) : null,
      out: pt.out ? mapPointFromViewBox(pt.out, vb) : null,
    })),
  }));

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
  const pathMatches = [...input.matchAll(/<path\b[^>]*>/gi)].map((m) => m[0]);
  if (!pathMatches.length) return null;
  const rootDefaults = parseSvgRootStyleDefaults(input);

  const shapes: PathShape[] = [];

  for (let k = 0; k < pathMatches.length; k += 1) {
    const p = pathMatches[k];
    const d = attr(p, 'd');
    if (!d) continue;
    const parsed = parsePathD(d);
    if (!parsed) continue;

    const fillAttr = attr(p, 'fill') ?? rootDefaults.fill;
    const strokeAttr = attr(p, 'stroke') ?? rootDefaults.stroke;
    const swAttr = attr(p, 'stroke-width') ?? rootDefaults.strokeWidth;
    const sw = Number(swAttr ?? '1');
    const opacityAttr = attr(p, 'opacity') ?? rootDefaults.opacity;
    const opacity = clamp(Number(opacityAttr ?? '1'), 0, 1);
    const svgId = attr(p, 'id') ?? '';
    const svgClass = attr(p, 'class') ?? '';
    const fill = fillAttr ?? '#000000';
    const stroke = strokeAttr ?? '#000000';
    const fillExplicit = fillAttr !== null;
    const strokeExplicit = strokeAttr !== null;
    const strokeWidthExplicit = swAttr !== null;

    shapes.push({
      id: uid(),
      name: `Path ${k + 1}`,
      points: parsed.points,
      uiRotation: 0,
      svgId,
      svgClass,
      sourceD: d,
      geometryDirty: false,
      closed: parsed.closed,
      fill,
      stroke,
      strokeWidth: Number.isFinite(sw) ? sw : 3,
      opacity: Number.isFinite(opacity) ? opacity : 1,
      fillExplicit,
      strokeExplicit,
      strokeWidthExplicit,
      opacityExplicit: opacityAttr !== null,
    });
  }

  if (!shapes.length) return null;

  const vb = parseViewBox(input);
  const mapped = vb ? mapShapesFromViewBox(shapes, vb) : shapes;
  return { shapes: vb ? mapped : autoFitShapesToViewport(mapped), viewBox: vb ?? INTERNAL_VIEWBOX };
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');

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
  if (!ranges.length) return escapeHtml(text);
  const clean = ranges
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const r of clean) {
    const start = clamp(r.start, 0, text.length);
    const end = clamp(r.end, start, text.length);
    if (start > cursor) out += escapeHtml(text.slice(cursor, start));
    out += `<span class="${cls}">${escapeHtml(text.slice(start, end))}</span>`;
    cursor = end;
  }
  if (cursor < text.length) out += escapeHtml(text.slice(cursor));
  return out;
};

const highlightSelectedPathHtml = (code: string, selectedPath: number, selectedPoints: number[]) => {
  const re = /<path\b[^>]*>/gi;
  const matches = [...code.matchAll(re)];
  if (!matches.length || selectedPath < 0 || selectedPath >= matches.length) return escapeHtml(code);

  const m = matches[selectedPath];
  if (m.index === undefined) return escapeHtml(code);

  const start = m.index;
  const end = start + m[0].length;
  const tag = code.slice(start, end);
  const dMatch = /d\s*=\s*(['"])([\s\S]*?)\1/i.exec(tag);
  let tagHtml = escapeHtml(tag);

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

  return `${escapeHtml(code.slice(0, start))}<span class="selected-code">${tagHtml}</span>${escapeHtml(code.slice(end))}`;
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

const App = () => {
  const [tool, setTool] = useState<Tool>('select');
  const [drag, setDrag] = useState<DragTarget>(null);
  const [shapes, setShapes] = useState<PathShape[]>([createPresetPath('Path 1', 'roundedDiamond', width / 2, height / 2)]);
  const [selectedPath, setSelectedPath] = useState(0);
  const [selectedPaths, setSelectedPaths] = useState<number[]>([0]);
  const [pathSelected, setPathSelected] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState(0);
  const [selectedPoints, setSelectedPoints] = useState<number[]>([0]);
  const [penHover, setPenHover] = useState<PenHover>(null);
  const [transformAllPaths, setTransformAllPaths] = useState(false);
  const [codePaneWidth, setCodePaneWidth] = useState(420);
  const [paneDrag, setPaneDrag] = useState<{ startX: number; startWidth: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewOrigin, setViewOrigin] = useState<Vec>({ x: 0, y: 0 });
  const [cursorZoomFocus, setCursorZoomFocus] = useState<{ nx: number; ny: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [simplifyThreshold, setSimplifyThreshold] = useState(10);
  const [codeText, setCodeText] = useState('');
  const [codeError, setCodeError] = useState('');
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const [marquee, setMarquee] = useState<{ start: Vec; current: Vec } | null>(null);
  const [docViewBox, setDocViewBox] = useState<ViewBox>(INTERNAL_VIEWBOX);
  const [copied, setCopied] = useState(false);
  const [pathMetaMenu, setPathMetaMenu] = useState<{
    pathIndex: number;
    x: number;
    y: number;
    idValue: string;
    classValue: string;
  } | null>(null);
  const [styleMenu, setStyleMenu] = useState<{ kind: StylePanel; x: number; y: number } | null>(null);
  const [shapeMenu, setShapeMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmDeletePath, setConfirmDeletePath] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showViewBox, setShowViewBox] = useState(false);
  const codeOverlayRef = useRef<HTMLPreElement | null>(null);
  const editorSvgRef = useRef<SVGSVGElement | null>(null);
  const codeDebounceRef = useRef<number | null>(null);
  const lastShapesUpdateFromCodeRef = useRef(false);
  const shapeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const styleTriggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pathMetaMenuRef = useRef<HTMLFormElement | null>(null);
  const shapeMenuRef = useRef<HTMLDivElement | null>(null);
  const styleMenuRef = useRef<HTMLDivElement | null>(null);

  const activePath = shapes[selectedPath];
  const transformTargetIndices = useMemo(() => {
    if (transformAllPaths) return shapes.map((_, i) => i);
    if (selectedPaths.length > 1) return [...selectedPaths].sort((a, b) => a - b);
    return [selectedPath];
  }, [transformAllPaths, shapes, selectedPaths, selectedPath]);
  const transformPoints = useMemo(
    () => transformTargetIndices.flatMap((i) => shapes[i]?.points ?? []),
    [transformTargetIndices, shapes],
  );
  const transformBounds = useMemo(() => getPathBounds(transformPoints), [transformPoints]);
  const transformPivot = useMemo(() => {
    if (!transformPoints.length) return transformBounds ? { x: transformBounds.cx, y: transformBounds.cy } : { x: 0, y: 0 };
    const sx = transformPoints.reduce((sum, p) => sum + p.p.x, 0);
    const sy = transformPoints.reduce((sum, p) => sum + p.p.y, 0);
    return { x: sx / transformPoints.length, y: sy / transformPoints.length };
  }, [transformPoints, transformBounds]);
  const selectedPathBounds = useMemo(
    () => (pathSelected ? getPathBounds(activePath?.points ?? []) : null),
    [activePath, pathSelected],
  );
  const transformUiAngleRad = useMemo(() => {
    if (!pathSelected || transformAllPaths || !activePath || transformTargetIndices.length !== 1) return 0;
    return ((activePath?.uiRotation ?? 0) * Math.PI) / 180;
  }, [pathSelected, transformAllPaths, activePath, transformTargetIndices]);
  const transformFrame = useMemo(() => {
    if (!transformBounds) return null;
    const c = drag?.kind === 'rotate' ? { ...drag.originCenter } : { x: transformPivot.x, y: transformPivot.y };
    if (!pathSelected || transformAllPaths || transformTargetIndices.length !== 1 || Math.abs(transformUiAngleRad) < 0.0001 || !activePath) {
      return { ...transformBounds, cx: c.x, cy: c.y, angle: 0 };
    }
    const unrot = activePath.points.map((pt) => rotateAround(pt.p, c, -transformUiAngleRad));
    if (!unrot.length) return { ...transformBounds, cx: c.x, cy: c.y, angle: transformUiAngleRad };
    const minX = Math.min(...unrot.map((p) => p.x));
    const minY = Math.min(...unrot.map((p) => p.y));
    const maxX = Math.max(...unrot.map((p) => p.x));
    const maxY = Math.max(...unrot.map((p) => p.y));
    return {
      minX,
      minY,
      maxX,
      maxY,
      cx: c.x,
      cy: c.y,
      angle: transformUiAngleRad,
    };
  }, [transformBounds, transformPivot, pathSelected, transformAllPaths, transformUiAngleRad, activePath, transformTargetIndices, drag]);
  const highlightedCodeHtml = useMemo(
    () => highlightSelectedPathHtml(codeText, pathSelected ? selectedPath : -1, pathSelected ? selectedPoints : []),
    [codeText, selectedPath, pathSelected, selectedPoints],
  );

  useEffect(() => {
    if (lastShapesUpdateFromCodeRef.current) {
      lastShapesUpdateFromCodeRef.current = false;
      return;
    }
    setCodeText(serializeSvg(shapes, docViewBox));
  }, [shapes, docViewBox]);

  const snapshotCurrent = (): Snapshot => ({
    shapes: cloneShapes(shapes),
    selectedPath,
    selectedPaths,
    selectedPoint,
    selectedPoints,
    transformAllPaths,
    codeText,
  });

  const applySnapshot = (shot: Snapshot) => {
    setShapes(cloneShapes(shot.shapes));
    setSelectedPath(shot.selectedPath);
    setSelectedPaths(shot.selectedPaths);
    setSelectedPoint(shot.selectedPoint);
    setSelectedPoints(shot.selectedPoints);
    setTransformAllPaths(shot.transformAllPaths);
    setCodeText(shot.codeText);
    setCodeError('');
  };

  const pushUndo = (clearRedo = true) => {
    const shot = snapshotCurrent();
    setUndoStack((prev) => [...prev.slice(-99), shot]);
    if (clearRedo) setRedoStack([]);
  };

  const undo = () => {
    setUndoStack((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      const current = snapshotCurrent();
      setRedoStack((rs) => [...rs.slice(-99), current]);
      applySnapshot(last);
      return prev.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      const current = snapshotCurrent();
      setUndoStack((us) => [...us.slice(-99), current]);
      applySnapshot(last);
      return prev.slice(0, -1);
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName;
          if (!(target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) {
            e.preventDefault();
            setSpaceDown(true);
          }
        }
      }

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      if (key === 'v') {
        e.preventDefault();
        setTool('select');
        setPenHover(null);
      }
      if (key === 'p') {
        e.preventDefault();
        setTool('pen');
      }
      if (key === 't') {
        e.preventDefault();
        setTool('scale');
        setPenHover(null);
      }
      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.metaKey || e.ctrlKey) && key === 'y') {
        e.preventDefault();
        redo();
      }
      if ((e.metaKey || e.ctrlKey) && key === 'a') {
        e.preventDefault();
        if (!shapes.length) return;
        const all = shapes[0]?.points.map((_, i) => i) ?? [0];
        setPathSelected(true);
        setSelectedPaths(shapes.map((_, i) => i));
        setSelectedPath(0);
        setSelectedPoint(all[0] ?? 0);
        setSelectedPoints(all.length ? all : [0]);
      }
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        if (!pathSelected || shapes.length <= 1) return;
        pushUndo();
        const targets = new Set(selectedPaths.length ? selectedPaths : [selectedPath]);
        setShapes((curr) => {
          if (curr.length <= 1) return curr;
          const next = curr.filter((_, i) => !targets.has(i));
          if (!next.length) return curr;
          const nextSel = clamp(selectedPath - 1, 0, next.length - 1);
          const all = next[nextSel]?.points.map((_, i) => i) ?? [0];
          setSelectedPath(nextSel);
          setSelectedPaths([nextSel]);
          setPathSelected(true);
          setSelectedPoint(all[0] ?? 0);
          setSelectedPoints(all.length ? all : [0]);
          return next;
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    const onBlur = () => setSpaceDown(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [shapes, pathSelected, selectedPath, selectedPaths]);

  const updatePath = (pathIndex: number, mutator: (path: PathShape) => PathShape) => {
    setShapes((curr) => curr.map((path, i) => (i === pathIndex ? mutator(path) : path)));
  };

  const markGeometryDirty = (path: PathShape): PathShape =>
    path.geometryDirty ? path : { ...path, geometryDirty: true };

  const updatePathGeometry = (pathIndex: number, mutator: (path: PathShape) => PathShape) => {
    updatePath(pathIndex, (path) => markGeometryDirty(mutator(path)));
  };

  const clampOriginForZoom = (origin: Vec, z: number): Vec => {
    const vw = width / z;
    const vh = height / z;
    const minX = -WORLD_LIMIT;
    const minY = -WORLD_LIMIT;
    const maxX = WORLD_LIMIT - vw;
    const maxY = WORLD_LIMIT - vh;
    return {
      x: clamp(origin.x, minX, maxX),
      y: clamp(origin.y, minY, maxY),
    };
  };

  const zoomByFactorAt = (factor: number, nx = 0.5, ny = 0.5) => {
    setZoom((curr) => {
      const next = clamp(curr * factor, MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(next - curr) < 0.0001) return curr;
      setViewOrigin((origin) => {
        const currW = width / curr;
        const currH = height / curr;
        const worldX = origin.x + nx * currW;
        const worldY = origin.y + ny * currH;
        const nextW = width / next;
        const nextH = height / next;
        return clampOriginForZoom(
          {
            x: worldX - nx * nextW,
            y: worldY - ny * nextH,
          },
          next,
        );
      });
      return next;
    });
  };

  const zoomByFactorCenteredOnWorld = (factor: number, worldX: number, worldY: number) => {
    setZoom((curr) => {
      const next = clamp(curr * factor, MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(next - curr) < 0.0001) return curr;
      const nextW = width / next;
      const nextH = height / next;
      const target = clampOriginForZoom(
        {
          x: worldX - nextW / 2,
          y: worldY - nextH / 2,
        },
        next,
      );
      setViewOrigin((origin) => ({
        x: origin.x + (target.x - origin.x) * ZOOM_RECENTER_BLEND,
        y: origin.y + (target.y - origin.y) * ZOOM_RECENTER_BLEND,
      }));
      return next;
    });
  };

  const resetView = () => {
    setZoom(1);
    setViewOrigin({ x: 0, y: 0 });
  };

  const zoomFocusFromSelection = () => {
    const focusX =
      selectedPathBounds?.cx ??
      (cursorZoomFocus ? viewOrigin.x + cursorZoomFocus.nx * (width / zoom) : width / 2);
    const focusY =
      selectedPathBounds?.cy ??
      (cursorZoomFocus ? viewOrigin.y + cursorZoomFocus.ny * (height / zoom) : height / 2);
    return {
      nx: clamp((focusX - viewOrigin.x) / (width / zoom), 0, 1),
      ny: clamp((focusY - viewOrigin.y) / (height / zoom), 0, 1),
    };
  };

  useEffect(() => {
    const target = editorSvgRef.current;
    if (!target) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = target.getBoundingClientRect();
      const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      setCursorZoomFocus({ nx, ny });
      const factor = Math.exp(-e.deltaY * 0.0015);
      if (factor < 1 && selectedPathBounds) {
        zoomByFactorCenteredOnWorld(factor, selectedPathBounds.cx, selectedPathBounds.cy);
      } else {
        const focus = zoomFocusFromSelection();
        zoomByFactorAt(factor, focus.nx, focus.ny);
      }
    };

    target.addEventListener('wheel', handleWheel, { passive: false });
    return () => target.removeEventListener('wheel', handleWheel);
  }, [selectedPathBounds, zoom, viewOrigin, cursorZoomFocus]);

  const toLocal = (clientX: number, clientY: number, target: SVGSVGElement): Vec => {
    const ctm = target.getScreenCTM();
    if (ctm) {
      const pt = target.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const local = pt.matrixTransform(ctm.inverse());
      return { x: local.x, y: local.y };
    }

    const rect = target.getBoundingClientRect();
    const vw = width / zoom;
    const vh = height / zoom;
    const nx = clamp((clientX - rect.left) / rect.width, 0, 1);
    const ny = clamp((clientY - rect.top) / rect.height, 0, 1);
    return { x: viewOrigin.x + nx * vw, y: viewOrigin.y + ny * vh };
  };

  const pathDs = useMemo(() => shapes.map((shape) => pathData(shape.points, shape.closed)), [shapes]);

  const addPresetPath = (preset: ShapePreset) => {
    pushUndo();
    const centerX = viewOrigin.x + width / (2 * zoom);
    const centerY = viewOrigin.y + height / (2 * zoom);
    setShapes((curr) => {
      const created = createPresetPath(`Path ${curr.length + 1}`, preset, centerX, centerY);
      const next = [...curr, created];
      const idx = next.length - 1;
      setSelectedPath(idx);
      setSelectedPaths([idx]);
      setPathSelected(true);
      setSelectedPoint(0);
      setSelectedPoints([0]);
      return next;
    });
    setShapeMenu(null);
  };

  const deletePath = () => {
    if (!pathSelected || shapes.length <= 1) return;
    pushUndo();
    const targets = new Set(selectedPaths.length ? selectedPaths : [selectedPath]);
    setShapes((curr) => {
      if (curr.length <= 1) return curr;
      const next = curr.filter((_, i) => !targets.has(i));
      if (!next.length) return curr;
      const nextSel = clamp(selectedPath - 1, 0, next.length - 1);
      const all = next[nextSel]?.points.map((_, i) => i) ?? [0];
      setSelectedPath(nextSel);
      setSelectedPaths([nextSel]);
      setPathSelected(true);
      setSelectedPoint(all[0] ?? 0);
      setSelectedPoints(all.length ? all : [0]);
      return next;
    });
  };

  const addPointOnSegment = (pathIndex: number, segmentIndex: number, pos: Vec) => {
    pushUndo();
    updatePathGeometry(pathIndex, (path) => {
      const created = makePoint(pos.x, pos.y);
      const idx = segmentIndex + 1;
      const points = [...path.points.slice(0, idx), created, ...path.points.slice(idx)];
      setPathSelected(true);
      setSelectedPoint(idx);
      setSelectedPoints([idx]);
      return { ...path, points };
    });
  };

  const deletePoint = (pathIndex: number, pointIndex: number) => {
    pushUndo();
    updatePathGeometry(pathIndex, (path) => {
      if (path.points.length <= 2) return path;
      const points = path.points.filter((_, i) => i !== pointIndex);
      const nextSelected = clamp(pointIndex - 1, 0, points.length - 1);
      setPathSelected(true);
      setSelectedPoint(nextSelected);
      setSelectedPoints([nextSelected]);
      return { ...path, points };
    });
  };

  const mergeSelectedAnchors = () => {
    if (!activePath || selectedPoints.length < 2) return;
    const mergeDistance = Math.max(MERGE_MAX_STEP_DISTANCE, simplifyThreshold);

    pushUndo();
    updatePathGeometry(selectedPath, (path) => {
      let points = [...path.points];
      let selected = [...new Set(selectedPoints)].sort((a, b) => a - b).filter((i) => i >= 0 && i < points.length);
      const mergedAt: number[] = [];
      let didMerge = false;

      while (selected.length > 1) {
        let bestI = -1;
        let bestJ = -1;
        let bestD = Number.POSITIVE_INFINITY;

        for (let i = 0; i < selected.length - 1; i += 1) {
          for (let j = i + 1; j < selected.length; j += 1) {
            const ai = selected[i];
            const aj = selected[j];
            const d = dist(points[ai].p, points[aj].p);
            if (d < bestD) {
              bestD = d;
              bestI = i;
              bestJ = j;
            }
          }
        }

        if (bestI < 0 || bestJ < 0) break;
        // If only two points are selected, allow one merge even when slightly farther apart.
        if (bestD > mergeDistance && !(selected.length === 2 && !didMerge)) break;

        const a = selected[bestI];
        const b = selected[bestJ];
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        const merged = mergePointPair(points[start], points[end]);

        points = [...points.slice(0, start), merged, ...points.slice(start + 1, end), ...points.slice(end + 1)];
        mergedAt.push(start);
        didMerge = true;

        selected = selected
          .filter((idx) => idx !== start && idx !== end)
          .map((idx) => (idx > end ? idx - 1 : idx))
          .sort((x, y) => x - y);
        selected.push(start);
        selected.sort((x, y) => x - y);
      }

      if (!mergedAt.length) return path;
      const nextSel = [...new Set(mergedAt)].sort((a, b) => a - b);
      setSelectedPoints(nextSel);
      setSelectedPoint(nextSel[0]);
      return { ...path, points };
    });
  };

  const simplifyPathOrSvg = () => {
    pushUndo();
    if (pathSelected) {
      updatePathGeometry(selectedPath, (path) => simplifyPathByThreshold(path, simplifyThreshold));
      setSelectedPoint(0);
      setSelectedPoints([0]);
      return;
    }
    setShapes((curr) => curr.map((path) => markGeometryDirty(simplifyPathByThreshold(path, simplifyThreshold))));
  };

  const smoothPathOrSvg = () => {
    pushUndo();
    if (pathSelected) {
      updatePathGeometry(selectedPath, (path) => smoothSharpCorners(path));
      setSelectedPoint(0);
      setSelectedPoints([0]);
      return;
    }
    setShapes((curr) => curr.map((path) => markGeometryDirty(smoothSharpCorners(path))));
  };

  const onCanvasMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const pos = toLocal(e.clientX, e.clientY, e.currentTarget);
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    setCursorZoomFocus({ nx, ny });
    const anchorHit = 6 / zoom;
    const segmentHit = 10 / zoom;

    if (tool === 'pen' && activePath) {
      const anchorIndex = activePath.points.findIndex((pt) => dist(pt.p, pos) < anchorHit);
      if (anchorIndex >= 0) {
        setPenHover({ kind: 'anchor', pointIndex: anchorIndex });
      } else {
        const seg = closestSegment(activePath, pos);
        setPenHover(seg && seg.distance < segmentHit ? { kind: 'segment', segmentIndex: seg.segmentIndex } : null);
      }
    }

    if (marquee) {
      setMarquee((m) => (m ? { ...m, current: pos } : m));
      return;
    }

    if (!drag) return;

    if (drag.kind === 'viewportPan') {
      const dx = (e.clientX - drag.startClient.x) / zoom;
      const dy = (e.clientY - drag.startClient.y) / zoom;
      setViewOrigin(clampOriginForZoom({ x: drag.startOrigin.x - dx, y: drag.startOrigin.y - dy }, zoom));
      return;
    }

    if (drag.kind === 'scale') {
      setShapes(() => {
        const centerMode = e.altKey;
        const uniformMode = e.shiftKey;
        const origin = centerMode ? drag.originCenter : drag.originOpp;
        const startVec = centerMode ? drag.startVecCenter : drag.startVecOpp;
        const svx = Math.abs(startVec.x) < 0.001 ? 0.001 : startVec.x;
        const svy = Math.abs(startVec.y) < 0.001 ? 0.001 : startVec.y;
        const rawSx = Math.abs((pos.x - origin.x) / svx);
        const rawSy = Math.abs((pos.y - origin.y) / svy);

        let sx = uniformMode ? clamp(Math.max(rawSx, rawSy), 0.05, 20) : clamp(rawSx, 0.05, 20);
        let sy = uniformMode ? sx : clamp(rawSy, 0.05, 20);
        if (drag.axis === 'x') sy = 1;
        if (drag.axis === 'y') sx = 1;

        const map = (v: Vec): Vec => ({
          x: origin.x + (v.x - origin.x) * sx,
          y: origin.y + (v.y - origin.y) * sy,
        });

        return drag.baseShapes.map((shape, i) => {
          if (!drag.targetPathIndices.includes(i)) return shape;
          return markGeometryDirty({
            ...shape,
            points: shape.points.map((pt) => ({
              ...pt,
              p: map(pt.p),
              in: pt.in ? map(pt.in) : null,
              out: pt.out ? map(pt.out) : null,
            })),
          });
        });
      });
      return;
    }

    if (drag.kind === 'move') {
      setShapes(() => {
        const dx = pos.x - drag.startPos.x;
        const dy = pos.y - drag.startPos.y;
        const map = (v: Vec): Vec => ({ x: v.x + dx, y: v.y + dy });

        return drag.baseShapes.map((shape, i) => {
          if (!drag.targetPathIndices.includes(i)) return shape;
          return markGeometryDirty({
            ...shape,
            points: shape.points.map((pt) => ({
              ...pt,
              p: map(pt.p),
              in: pt.in ? map(pt.in) : null,
              out: pt.out ? map(pt.out) : null,
            })),
          });
        });
      });
      return;
    }

    if (drag.kind === 'rotate') {
      setShapes(() => {
        const currentAngle = Math.atan2(pos.y - drag.originCenter.y, pos.x - drag.originCenter.x);
        const delta = currentAngle - drag.startAngle;
        const deltaDeg = (delta * 180) / Math.PI;
        const cos = Math.cos(delta);
        const sin = Math.sin(delta);
        const map = (v: Vec): Vec => {
          const dx = v.x - drag.originCenter.x;
          const dy = v.y - drag.originCenter.y;
          return {
            x: drag.originCenter.x + dx * cos - dy * sin,
            y: drag.originCenter.y + dx * sin + dy * cos,
          };
        };

        return drag.baseShapes.map((shape, i) => {
          if (!drag.targetPathIndices.includes(i)) return shape;
          return markGeometryDirty({
            ...shape,
            uiRotation: shape.uiRotation + deltaDeg,
            points: shape.points.map((pt) => ({
              ...pt,
              p: map(pt.p),
              in: pt.in ? map(pt.in) : null,
              out: pt.out ? map(pt.out) : null,
            })),
          });
        });
      });
      return;
    }

    setShapes((curr) =>
      curr.map((path, i) => {
        if (i !== drag.pathIndex) return path;

        const points = clonePoints(path.points);

        const pt = points[drag.pointIndex];
        if (!pt) return path;

        if (drag.kind === 'anchor') {
          const dx = pos.x - drag.startPos.x;
          const dy = pos.y - drag.startPos.y;
          pt.p = { x: drag.base.p.x + dx, y: drag.base.p.y + dy };
          if (drag.base.in) pt.in = { x: drag.base.in.x + dx, y: drag.base.in.y + dy };
          if (drag.base.out) pt.out = { x: drag.base.out.x + dx, y: drag.base.out.y + dy };
        }

        if (drag.kind === 'in') {
          const dx = pos.x - drag.startPos.x;
          const dy = pos.y - drag.startPos.y;
          if (!drag.base.in) return path;
          pt.in = { x: drag.base.in.x + dx, y: drag.base.in.y + dy };
          if (pt.out) pt.out = mirrorHandle(pt.p, pt.in);
        }

        if (drag.kind === 'out') {
          const dx = pos.x - drag.startPos.x;
          const dy = pos.y - drag.startPos.y;
          if (!drag.base.out) return path;
          pt.out = { x: drag.base.out.x + dx, y: drag.base.out.y + dy };
          if (pt.in) pt.in = mirrorHandle(pt.p, pt.out);
        }

        return markGeometryDirty({ ...path, points });
      }),
    );
  };

  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (spaceDown) return;
    if (marquee) return;
    if (tool !== 'pen' || !activePath) return;
    const pos = toLocal(e.clientX, e.clientY, e.currentTarget);

    if (penHover?.kind === 'anchor') {
      deletePoint(selectedPath, penHover.pointIndex);
      return;
    }

    if (penHover?.kind === 'segment') {
      addPointOnSegment(selectedPath, penHover.segmentIndex, pos);
    }
  };

  const applyCodeText = (text: string, fromUser = false) => {
    const parsed = parseSvg(text);
    if (!parsed) {
      if (fromUser) setCodeError('Unable to parse SVG. Use <path> tags with M/L/H/V/C/Z commands.');
      return;
    }
    if (fromUser) pushUndo();
    lastShapesUpdateFromCodeRef.current = true;
    setCodeError('');
    setDocViewBox(parsed.viewBox);
    setShapes(parsed.shapes);
    setSelectedPath(0);
    setSelectedPaths([0]);
    setPathSelected(true);
    setSelectedPoint(0);
    setSelectedPoints([0]);
  };

  const updateActiveStyle = (patch: Partial<Pick<PathShape, 'fill' | 'stroke' | 'strokeWidth' | 'opacity' | 'closed'>>) => {
    pushUndo();
    const targets = pathSelected && selectedPaths.length ? new Set(selectedPaths) : new Set([selectedPath]);
    setShapes((curr) =>
      curr.map((path, i) => {
        if (!targets.has(i)) return path;
        return {
          ...path,
          ...patch,
          geometryDirty: patch.closed !== undefined ? true : path.geometryDirty,
          fillExplicit: patch.fill !== undefined ? true : path.fillExplicit,
          strokeExplicit: patch.stroke !== undefined ? true : path.strokeExplicit,
          strokeWidthExplicit: patch.strokeWidth !== undefined ? true : path.strokeWidthExplicit,
          opacityExplicit: patch.opacity !== undefined ? true : path.opacityExplicit,
        };
      }),
    );
  };

  const activeFill = useMemo(() => parseColorToRgba(activePath.fill, { r: 88, g: 166, b: 255, a: 0.33 }), [activePath.fill]);
  const activeStroke = useMemo(
    () => parseColorToRgba(activePath.stroke, { r: 121, g: 192, b: 255, a: 1 }),
    [activePath.stroke],
  );

  const strokeControlDisabled =
    pathSelected && selectedPaths.length
      ? selectedPaths.every((i) => (shapes[i]?.strokeWidth ?? 0) <= 0)
      : activePath.strokeWidth <= 0;
  const canDeletePath = pathSelected && shapes.length > 1;

  const allPointIndicesForPath = (pathIndex: number) => {
    const all = shapes[pathIndex]?.points.map((_, i) => i) ?? [];
    return all.length ? all : [0];
  };

  const syncSelectionFromCodeCursor = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? 0;
    const idx = pathIndexAtCaret(codeText, caret);
    if (idx === null) return;
    if (idx < 0 || idx >= shapes.length) return;
    if (idx === selectedPath) return;
    const all = allPointIndicesForPath(idx);
    setPathSelected(true);
    setSelectedPath(idx);
    setSelectedPaths([idx]);
    setSelectedPoint(all[0]);
    setSelectedPoints(all);
  };

  const copySvgCode = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1100);
    } catch {
      setCopied(false);
    }
  };

  const openPathMetaMenu = (pathIndex: number, rect: DOMRect) => {
    const path = shapes[pathIndex];
    if (!path) return;
    const menuW = 260;
    const menuH = 168;
    const pad = 8;
    const x = clamp(rect.left, pad, Math.max(pad, window.innerWidth - menuW - pad));
    const y = clamp(rect.bottom + 6, pad, Math.max(pad, window.innerHeight - menuH - pad));
    setPathMetaMenu({
      pathIndex,
      x,
      y,
      idValue: path.svgId,
      classValue: path.svgClass,
    });
    setShapeMenu(null);
    setStyleMenu(null);
  };

  const applyPathMetaMenu = () => {
    if (!pathMetaMenu) return;
    pushUndo();
    setShapes((curr) =>
      curr.map((path, i) =>
        i === pathMetaMenu.pathIndex
          ? { ...path, svgId: pathMetaMenu.idValue.trim(), svgClass: pathMetaMenu.classValue.trim() }
          : path,
      ),
    );
    setPathMetaMenu(null);
  };

  const openStyleMenu = (kind: StylePanel, rect: DOMRect) => {
    const menuW = 250;
    const menuH = kind === 'stroke' ? 198 : kind === 'opacity' ? 120 : 164;
    const pad = 8;
    const x = clamp(rect.right + 8, pad, Math.max(pad, window.innerWidth - menuW - pad));
    const y = clamp(rect.top, pad, Math.max(pad, window.innerHeight - menuH - pad));
    setStyleMenu({ kind, x, y });
    setShapeMenu(null);
    setPathMetaMenu(null);
  };

  useEffect(() => {
    if (!canDeletePath && confirmDeletePath) setConfirmDeletePath(false);
  }, [canDeletePath, confirmDeletePath]);

  useEffect(() => {
    if (!aboutOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAboutOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aboutOpen]);

  useEffect(() => {
    if (!pathMetaMenu && !shapeMenu && !styleMenu) return;
    const onWindowPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const inPathMeta = !!pathMetaMenuRef.current?.contains(target);
      const inShapeMenu = !!shapeMenuRef.current?.contains(target);
      const inStyleMenu = !!styleMenuRef.current?.contains(target);
      const inShapeTrigger = !!shapeTriggerRef.current?.contains(target);
      const inStyleTrigger = styleTriggerRefs.current.some((el) => !!el?.contains(target));
      if (inPathMeta || inShapeMenu || inStyleMenu || inShapeTrigger || inStyleTrigger) return;
      setPathMetaMenu(null);
      setShapeMenu(null);
      setStyleMenu(null);
      setConfirmDeletePath(false);
    };
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    return () => window.removeEventListener('pointerdown', onWindowPointerDown, true);
  }, [pathMetaMenu, shapeMenu, styleMenu]);

  return (
    <div
      className="app-shell"
      onPointerDown={() => {
        setPathMetaMenu(null);
        setShapeMenu(null);
        setStyleMenu(null);
        setConfirmDeletePath(false);
      }}
    >
      <TopBar
        shapes={shapes.map((shape) => ({ id: shape.id, name: shape.name, svgId: shape.svgId }))}
        pathSelected={pathSelected}
        selectedPath={selectedPath}
        pathMetaMenuPathIndex={pathMetaMenu?.pathIndex ?? null}
        onOpenAbout={() => setAboutOpen(true)}
        onPathDoubleClick={(pathIndex, rect) => openPathMetaMenu(pathIndex, rect)}
        onPathClick={(pathIndex) => {
          const all = allPointIndicesForPath(pathIndex);
          setPathSelected(true);
          setSelectedPath(pathIndex);
          setSelectedPaths([pathIndex]);
          setSelectedPoint(all[0]);
          setSelectedPoints(all);
        }}
        shapeTriggerRef={shapeTriggerRef}
        onOpenShapeMenu={(rect) => {
          const menuW = 208;
          const menuH = 58;
          const pad = 8;
          const x = clamp(rect.left, pad, Math.max(pad, window.innerWidth - menuW - pad));
          const y = clamp(rect.bottom + 6, pad, Math.max(pad, window.innerHeight - menuH - pad));
          setShapeMenu({ x, y });
          setStyleMenu(null);
          setPathMetaMenu(null);
        }}
        confirmDeletePath={confirmDeletePath}
        canDeletePath={canDeletePath}
        onRequestDelete={() => {
          if (!canDeletePath) return;
          setConfirmDeletePath(true);
        }}
        onConfirmDelete={() => {
          deletePath();
          setConfirmDeletePath(false);
        }}
        onCancelDelete={() => setConfirmDeletePath(false)}
      />

      <div
        className="workspace"
        style={{ '--code-pane-width': `${codePaneWidth}px` } as CSSProperties}
      >
        <ToolDock
          tool={tool}
          styleMenuKind={styleMenu?.kind ?? null}
          setStyleTriggerRef={(index, el) => {
            styleTriggerRefs.current[index] = el;
          }}
          onSelectTool={() => {
            setTool('select');
            setPenHover(null);
          }}
          onPenTool={() => setTool('pen')}
          onScaleTool={() => {
            setTool('scale');
            setPenHover(null);
          }}
          onToggleStyleMenu={(kind, rect) => {
            if (styleMenu?.kind === kind) setStyleMenu(null);
            else openStyleMenu(kind, rect);
          }}
          onSmooth={smoothPathOrSvg}
          onMerge={mergeSelectedAnchors}
          canMerge={pathSelected && selectedPoints.length >= 2}
          pathSelected={pathSelected}
        />

        <section className="left-pane">
          <ControlsBar
            closed={activePath.closed}
            onToggleClosed={() => updateActiveStyle({ closed: !activePath.closed })}
            onSimplify={simplifyPathOrSvg}
            pathSelected={pathSelected}
            tool={tool}
            transformAllPaths={transformAllPaths}
            onToggleTransformAllPaths={setTransformAllPaths}
            showViewBox={showViewBox}
            onToggleShowViewBox={() => setShowViewBox((v) => !v)}
            zoom={zoom}
            onZoomOut={() => {
              if (selectedPathBounds) {
                zoomByFactorCenteredOnWorld(1 / 1.2, selectedPathBounds.cx, selectedPathBounds.cy);
              } else {
                const { nx, ny } = zoomFocusFromSelection();
                zoomByFactorAt(1 / 1.2, nx, ny);
              }
            }}
            onZoomIn={() => {
              const { nx, ny } = zoomFocusFromSelection();
              zoomByFactorAt(1.2, nx, ny);
            }}
            onResetView={resetView}
            onUndo={undo}
            onRedo={redo}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            renderThresholdControl={
              <SliderInline
                label="Simplify threshold"
                min={2}
                max={40}
                value={simplifyThreshold}
                onChange={(v) => setSimplifyThreshold(Math.round(v))}
              />
            }
          />

          <svg
            ref={editorSvgRef}
            className={spaceDown ? 'editor pan' : tool === 'pen' ? 'editor pen' : tool === 'scale' ? 'editor scale' : 'editor'}
            viewBox={`${viewOrigin.x} ${viewOrigin.y} ${width / zoom} ${height / zoom}`}
            onPointerDown={(e) => {
              if (!spaceDown) return;
              e.preventDefault();
              setDrag({
                kind: 'viewportPan',
                startClient: { x: e.clientX, y: e.clientY },
                startOrigin: { ...viewOrigin },
              });
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={onCanvasMove}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => {
              setDrag(null);
              setCursorZoomFocus(null);
              if (tool === 'pen') setPenHover(null);
            }}
            onClick={onCanvasClick}
          >
            <defs>
              <pattern id="grid-small" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              </pattern>
              <pattern id="grid-large" width="120" height="120" patternUnits="userSpaceOnUse">
                <rect width="120" height="120" fill="url(#grid-small)" />
                <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect
              x={-WORLD_LIMIT}
              y={-WORLD_LIMIT}
              width={WORLD_LIMIT * 2}
              height={WORLD_LIMIT * 2}
              className="grid-bg"
              fill="url(#grid-large)"
              onPointerDown={(e) => {
                if (spaceDown) return;
                e.stopPropagation();
                if (tool !== 'select') return;
                const svg = e.currentTarget.ownerSVGElement;
                if (!svg) return;
                const start = toLocal(e.clientX, e.clientY, svg);
                setMarquee({ start, current: start });
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!marquee) return;
                const svg = e.currentTarget.ownerSVGElement;
                if (!svg) return;
                const current = toLocal(e.clientX, e.clientY, svg);
                setMarquee((m) => (m ? { ...m, current } : m));
              }}
              onPointerUp={() => {
                if (!marquee) return;
                const minX = Math.min(marquee.start.x, marquee.current.x);
                const maxX = Math.max(marquee.start.x, marquee.current.x);
                const minY = Math.min(marquee.start.y, marquee.current.y);
                const maxY = Math.max(marquee.start.y, marquee.current.y);
                const w = maxX - minX;
                const h = maxY - minY;

                if (w < 2 && h < 2) {
                  setMarquee(null);
                  return;
                }

                // Point-marquee selection should work whether or not a path was preselected.
                const pointHitsByPath = shapes
                  .map((shape, pathIndex) => ({
                    pathIndex,
                    points: shape.points
                      .map((pt, i) => ({ i, pt }))
                      .filter(({ pt }) => pt.p.x >= minX && pt.p.x <= maxX && pt.p.y >= minY && pt.p.y <= maxY)
                      .map(({ i }) => i),
                  }))
                  .filter((hit) => hit.points.length > 0);

                if (pointHitsByPath.length) {
                  const preferred = pointHitsByPath.find((h) => h.pathIndex === selectedPath);
                  const best =
                    preferred ??
                    pointHitsByPath.reduce((acc, curr) =>
                      curr.points.length > acc.points.length ? curr : curr.points.length === acc.points.length && curr.pathIndex < acc.pathIndex ? curr : acc,
                    );
                  setPathSelected(true);
                  setSelectedPaths([best.pathIndex]);
                  setSelectedPath(best.pathIndex);
                  setSelectedPoints(best.points);
                  setSelectedPoint(best.points[0]);
                  setMarquee(null);
                  return;
                }

                const hits = shapes
                  .map((shape, i) => ({ i, b: getPathBounds(shape.points) }))
                  .filter(({ b }) => b !== null)
                  .filter(({ b }) => {
                    if (!b) return false;
                    return !(b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY);
                  })
                  .map(({ i }) => i);

                if (hits.length) {
                  const all = allPointIndicesForPath(hits[0]);
                  setPathSelected(true);
                  setSelectedPaths(hits);
                  setSelectedPath(hits[0]);
                  setSelectedPoint(all[0]);
                  setSelectedPoints(all);
                }
                setMarquee(null);
              }}
            />
            {showViewBox ? (
              <>
                <rect
                  x={docViewBox.minX}
                  y={docViewBox.minY}
                  width={docViewBox.vbW}
                  height={docViewBox.vbH}
                  className="viewbox-overlay"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                <text
                  x={docViewBox.minX + 8 / zoom}
                  y={docViewBox.minY + 16 / zoom}
                  className="viewbox-label"
                  style={{ fontSize: `${11 / zoom}px` }}
                  pointerEvents="none"
                >
                  {`viewBox ${docViewBox.minX.toFixed(2)} ${docViewBox.minY.toFixed(2)} ${docViewBox.vbW.toFixed(2)} ${docViewBox.vbH.toFixed(2)}`}
                </text>
              </>
            ) : null}

            {shapes.map((shape, i) => (
              <path
                key={shape.id}
                d={pathDs[i]}
                fill={shape.fillExplicit ? shape.fill : '#000000'}
                stroke={shape.strokeExplicit ? shape.stroke : 'none'}
                strokeWidth={shape.strokeWidthExplicit ? shape.strokeWidth : undefined}
                opacity={(shape.opacityExplicit ? shape.opacity : 1) * (!pathSelected ? 1 : selectedPaths.includes(i) ? 1 : 0.5)}
                onPointerDown={(e) => {
                  if (!spaceDown && (tool === 'select' || tool === 'scale')) {
                    setPathSelected(true);
                    if (e.shiftKey) {
                      setSelectedPaths((curr) => {
                        const exists = curr.includes(i);
                        const next = exists ? curr.filter((v) => v !== i) : [...curr, i].sort((a, b) => a - b);
                        const safe = next.length ? next : [i];
                        const all = allPointIndicesForPath(safe[0]);
                        setSelectedPath(safe[0]);
                        setSelectedPoint(all[0]);
                        setSelectedPoints(all);
                        return safe;
                      });
                    } else {
                      const all = allPointIndicesForPath(i);
                      setSelectedPaths([i]);
                      setSelectedPath(i);
                      setSelectedPoint(all[0]);
                      setSelectedPoints(all);
                    }
                  }
                }}
              />
            ))}
            {pathSelected
              ? selectedPaths.map((idx) => (
                  <path
                    key={`sel-${shapes[idx]?.id ?? idx}`}
                    d={pathDs[idx]}
                    fill="none"
                    stroke="#ff9a00"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    opacity={1}
                    pointerEvents="none"
                  />
                ))
              : null}

            {pathSelected &&
              selectedPaths.length === 1 &&
              activePath.points.map((pt, i) => (
              <g key={pt.id}>
                {tool === 'select' && selectedPoints.length === 1 && i === selectedPoint && pt.in && (
                  <>
                    <line
                      x1={pt.p.x}
                      y1={pt.p.y}
                      x2={pt.in.x}
                      y2={pt.in.y}
                      className="guide"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={pt.in.x}
                      cy={pt.in.y}
                      r={2 / zoom}
                      className="handle in"
                      onPointerDown={(e) => {
                        if (tool !== 'select' || spaceDown) return;
                        e.stopPropagation();
                        pushUndo();
                        const svg = e.currentTarget.ownerSVGElement;
                        if (!svg) return;
                        const startPos = toLocal(e.clientX, e.clientY, svg);
                        setSelectedPoint(i);
                        setSelectedPoints([i]);
                        setDrag({ kind: 'in', pathIndex: selectedPath, pointIndex: i, startPos, base: clonePoint(pt) });
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                    />
                  </>
                )}

                {tool === 'select' && selectedPoints.length === 1 && i === selectedPoint && pt.out && (
                  <>
                    <line
                      x1={pt.p.x}
                      y1={pt.p.y}
                      x2={pt.out.x}
                      y2={pt.out.y}
                      className="guide"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={pt.out.x}
                      cy={pt.out.y}
                      r={2 / zoom}
                      className="handle out"
                      onPointerDown={(e) => {
                        if (tool !== 'select' || spaceDown) return;
                        e.stopPropagation();
                        pushUndo();
                        const svg = e.currentTarget.ownerSVGElement;
                        if (!svg) return;
                        const startPos = toLocal(e.clientX, e.clientY, svg);
                        setSelectedPoint(i);
                        setSelectedPoints([i]);
                        setDrag({ kind: 'out', pathIndex: selectedPath, pointIndex: i, startPos, base: clonePoint(pt) });
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                    />
                  </>
                )}

                <rect
                  x={pt.p.x - (selectedPoints.length === 1 && i === selectedPoint ? 2.5 : 2) / zoom}
                  y={pt.p.y - (selectedPoints.length === 1 && i === selectedPoint ? 2.5 : 2) / zoom}
                  width={(selectedPoints.length === 1 && i === selectedPoint ? 5 : 4) / zoom}
                  height={(selectedPoints.length === 1 && i === selectedPoint ? 5 : 4) / zoom}
                  className={
                    penHover?.kind === 'anchor' && penHover.pointIndex === i
                      ? 'anchor pen-delete'
                      : selectedPoints.includes(i)
                        ? 'anchor selected'
                        : 'anchor'
                  }
                  style={{ strokeWidth: (selectedPoints.length === 1 && i === selectedPoint ? 1.4 : 1.1) / zoom }}
                  onPointerDown={(e) => {
                    if (tool !== 'select' || spaceDown) return;
                    e.stopPropagation();
                    if (e.shiftKey) {
                      setSelectedPoints((currSel) => {
                        const exists = currSel.includes(i);
                        const next = exists ? currSel.filter((v) => v !== i) : [...currSel, i].sort((a, b) => a - b);
                        const safe = next.length ? next : [i];
                        setSelectedPoint(safe[safe.length - 1]);
                        return safe;
                      });
                      return;
                    }
                    pushUndo();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    setSelectedPoint(i);
                    setSelectedPoints([i]);
                    setDrag({ kind: 'anchor', pathIndex: selectedPath, pointIndex: i, startPos, base: clonePoint(pt) });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
              </g>
            ))}

            {tool === 'scale' && transformFrame ? (
              <>
                {(() => {
                  const b = transformFrame;
                  const c = { x: b.cx, y: b.cy };
                  const rot = (p: Vec) => rotateAround(p, c, b.angle);
                  const tl = rot({ x: b.minX, y: b.minY });
                  const tr = rot({ x: b.maxX, y: b.minY });
                  const br = rot({ x: b.maxX, y: b.maxY });
                  const bl = rot({ x: b.minX, y: b.maxY });
                  const topMid = rot({ x: b.cx, y: b.minY });
                  const rotArmEnd = rot({ x: b.cx, y: b.minY - 18 / zoom });
                  const rotHandle = rot({ x: b.cx, y: b.minY - 22 / zoom });
                  const axisX1 = rot({ x: b.cx - 8 / zoom, y: b.cy });
                  const axisX2 = rot({ x: b.cx + 8 / zoom, y: b.cy });
                  const axisY1 = rot({ x: b.cx, y: b.cy - 8 / zoom });
                  const axisY2 = rot({ x: b.cx, y: b.cy + 8 / zoom });
                  return (
                    <>
                <path
                  d={`M ${tl.x} ${tl.y} L ${tr.x} ${tr.y} L ${br.x} ${br.y} L ${bl.x} ${bl.y} Z`}
                  className="scale-move-hit"
                  onPointerDown={(e) => {
                    if (spaceDown) return;
                    e.stopPropagation();
                    pushUndo();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    setDrag({
                      kind: 'move',
                      pathIndex: selectedPath,
                      affectAll: transformAllPaths || selectedPaths.length > 1,
                      targetPathIndices: transformTargetIndices,
                      startPos,
                      baseShapes: cloneShapes(shapes),
                    });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
                <path
                  d={`M ${tl.x} ${tl.y} L ${tr.x} ${tr.y} L ${br.x} ${br.y} L ${bl.x} ${bl.y} Z`}
                  className="scale-box"
                  vectorEffect="non-scaling-stroke"
                />
                {(
                  [
                    {
                      corner: 'nw',
                      x: b.minX,
                      y: b.minY,
                      ox: b.maxX,
                      oy: b.maxY,
                      cx: b.cx,
                      cy: b.cy,
                    },
                    {
                      corner: 'ne',
                      x: b.maxX,
                      y: b.minY,
                      ox: b.minX,
                      oy: b.maxY,
                      cx: b.cx,
                      cy: b.cy,
                    },
                    {
                      corner: 'se',
                      x: b.maxX,
                      y: b.maxY,
                      ox: b.minX,
                      oy: b.minY,
                      cx: b.cx,
                      cy: b.cy,
                    },
                    {
                      corner: 'sw',
                      x: b.minX,
                      y: b.maxY,
                      ox: b.maxX,
                      oy: b.minY,
                      cx: b.cx,
                      cy: b.cy,
                    },
                  ] as const
                ).map((h) => (
                  (() => {
                    const rp = rot({ x: h.x, y: h.y });
                    const ro = rot({ x: h.ox, y: h.oy });
                    const rc = rot({ x: h.cx, y: h.cy });
                    return (
                  <rect
                    key={h.corner}
                    x={rp.x - 2 / zoom}
                    y={rp.y - 2 / zoom}
                    width={4 / zoom}
                    height={4 / zoom}
                    className={`scale-handle ${h.corner}${drag?.kind === 'scale' ? ' active' : ''}`}
                    style={{ strokeWidth: 1.1 / zoom }}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(e) => {
                      if (spaceDown) return;
                      e.stopPropagation();
                      pushUndo();
                      setDrag({
                        kind: 'scale',
                        pathIndex: selectedPath,
                        affectAll: transformAllPaths || selectedPaths.length > 1,
                        targetPathIndices: transformTargetIndices,
                        axis: 'both',
                        originOpp: ro,
                        originCenter: rc,
                        startVecOpp: { x: rp.x - ro.x, y: rp.y - ro.y },
                        startVecCenter: { x: rp.x - rc.x, y: rp.y - rc.y },
                        baseShapes: cloneShapes(shapes),
                      });
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                  />
                    );
                  })()
                ))}
                {(
                  [
                    {
                      edge: 'n',
                      x: b.cx,
                      y: b.minY,
                      ox: b.cx,
                      oy: b.maxY,
                      cx: b.cx,
                      cy: b.cy,
                      axis: 'y' as const,
                    },
                    {
                      edge: 'e',
                      x: b.maxX,
                      y: b.cy,
                      ox: b.minX,
                      oy: b.cy,
                      cx: b.cx,
                      cy: b.cy,
                      axis: 'x' as const,
                    },
                    {
                      edge: 's',
                      x: b.cx,
                      y: b.maxY,
                      ox: b.cx,
                      oy: b.minY,
                      cx: b.cx,
                      cy: b.cy,
                      axis: 'y' as const,
                    },
                    {
                      edge: 'w',
                      x: b.minX,
                      y: b.cy,
                      ox: b.maxX,
                      oy: b.cy,
                      cx: b.cx,
                      cy: b.cy,
                      axis: 'x' as const,
                    },
                  ] as const
                ).map((h) => (
                  (() => {
                    const rp = rot({ x: h.x, y: h.y });
                    const ro = rot({ x: h.ox, y: h.oy });
                    const rc = rot({ x: h.cx, y: h.cy });
                    return (
                  <rect
                    key={h.edge}
                    x={rp.x - 2 / zoom}
                    y={rp.y - 2 / zoom}
                    width={4 / zoom}
                    height={4 / zoom}
                    className={`scale-handle ${h.edge}${drag?.kind === 'scale' ? ' active' : ''}`}
                    style={{ strokeWidth: 1.1 / zoom }}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(e) => {
                      if (spaceDown) return;
                      e.stopPropagation();
                      pushUndo();
                      setDrag({
                        kind: 'scale',
                        pathIndex: selectedPath,
                        affectAll: transformAllPaths || selectedPaths.length > 1,
                        targetPathIndices: transformTargetIndices,
                        axis: h.axis,
                        originOpp: ro,
                        originCenter: rc,
                        startVecOpp: { x: rp.x - ro.x, y: rp.y - ro.y },
                        startVecCenter: { x: rp.x - rc.x, y: rp.y - rc.y },
                        baseShapes: cloneShapes(shapes),
                      });
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                  />
                    );
                  })()
                ))}
                <line
                  x1={topMid.x}
                  y1={topMid.y}
                  x2={rotArmEnd.x}
                  y2={rotArmEnd.y}
                  className="scale-rotate-arm"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={rotHandle.x}
                  cy={rotHandle.y}
                  r={3 / zoom}
                  className={`scale-rotate-handle${drag?.kind === 'rotate' ? ' active' : ''}`}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => {
                    if (spaceDown) return;
                    e.stopPropagation();
                    pushUndo();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const startPos = toLocal(e.clientX, e.clientY, svg);
                    setDrag({
                      kind: 'rotate',
                      pathIndex: selectedPath,
                      affectAll: transformAllPaths || selectedPaths.length > 1,
                      targetPathIndices: transformTargetIndices,
                      originCenter: { x: b.cx, y: b.cy },
                      startAngle: Math.atan2(startPos.y - b.cy, startPos.x - b.cx),
                      baseShapes: cloneShapes(shapes),
                    });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
                <circle cx={b.cx} cy={b.cy} r={3.2 / zoom} className="scale-pivot" vectorEffect="non-scaling-stroke" />
                <line
                  x1={axisX1.x}
                  y1={axisX1.y}
                  x2={axisX2.x}
                  y2={axisX2.y}
                  className="scale-pivot-line"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={axisY1.x}
                  y1={axisY1.y}
                  x2={axisY2.x}
                  y2={axisY2.y}
                  className="scale-pivot-line"
                  vectorEffect="non-scaling-stroke"
                />
                    </>
                  );
                })()}
              </>
            ) : null}

            {tool === 'pen' && penHover?.kind === 'segment' ? (
              <rect
                x={
                  sampleBezier(
                    activePath.points[penHover.segmentIndex].p,
                    activePath.points[penHover.segmentIndex].out ?? activePath.points[penHover.segmentIndex].p,
                    activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].in ??
                      activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].p,
                    activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].p,
                    0.5,
                  ).x - 3 / zoom
                }
                y={
                  sampleBezier(
                    activePath.points[penHover.segmentIndex].p,
                    activePath.points[penHover.segmentIndex].out ?? activePath.points[penHover.segmentIndex].p,
                    activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].in ??
                      activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].p,
                    activePath.points[(penHover.segmentIndex + 1) % activePath.points.length].p,
                    0.5,
                  ).y - 3 / zoom
                }
                width={6 / zoom}
                height={6 / zoom}
                className="pen-add"
              />
            ) : null}

            {marquee ? (
              <rect
                x={Math.min(marquee.start.x, marquee.current.x)}
                y={Math.min(marquee.start.y, marquee.current.y)}
                width={Math.abs(marquee.current.x - marquee.start.x)}
                height={Math.abs(marquee.current.y - marquee.start.y)}
                fill="none"
                stroke="#ff9a00"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.8}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ) : null}
          </svg>
          <p className="hint">
            {tool === 'pen'
              ? 'Pen tool: hover anchor to delete point, hover segment to add point, then click. Hold Space to pan.'
              : tool === 'scale'
                ? 'Scale tool: drag inside box to move, drag corners to scale. Shift = uniform, Alt/Option = center scale. Hold Space to pan.'
                : 'Select tool: drag anchors/handles to edit curvature. Hold Space to pan.'}
          </p>
        </section>

        <CodePane
          copied={copied}
          onCopy={copySvgCode}
          codeOverlayRef={codeOverlayRef}
          highlightedCodeHtml={highlightedCodeHtml}
          codeText={codeText}
          codeError={codeError}
          onCodeChange={(next) => {
            setCodeText(next);
            setCodeError('');
            if (codeDebounceRef.current) window.clearTimeout(codeDebounceRef.current);
            codeDebounceRef.current = window.setTimeout(() => {
              applyCodeText(next, true);
            }, 280);
          }}
          onCodeClick={(el) => syncSelectionFromCodeCursor(el)}
          onCodeKeyUp={(el) => syncSelectionFromCodeCursor(el)}
          onCodeSelect={(el) => syncSelectionFromCodeCursor(el)}
          onCodePaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            const parsed = parseSvg(pasted);
            if (parsed) {
              e.preventDefault();
              setCodeText(pasted);
              applyCodeText(pasted, true);
            }
          }}
          onCodeScroll={(el) => {
            if (!codeOverlayRef.current) return;
            codeOverlayRef.current.scrollTop = el.scrollTop;
            codeOverlayRef.current.scrollLeft = el.scrollLeft;
          }}
          paneDrag={paneDrag}
          onPaneDragStart={(startX, splitter, pointerId) => {
            setPaneDrag({ startX, startWidth: codePaneWidth });
            splitter.setPointerCapture(pointerId);
          }}
          onPaneDragMove={(x) => {
            if (!paneDrag) return;
            const dx = x - paneDrag.startX;
            setCodePaneWidth(clamp(paneDrag.startWidth - dx, 260, 860));
          }}
          onPaneDragEnd={() => setPaneDrag(null)}
        />
      </div>
      {pathMetaMenu ? (
        <form
          ref={pathMetaMenuRef}
          className="path-meta-menu"
          style={{ left: `${pathMetaMenu.x}px`, top: `${pathMetaMenu.y}px` }}
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            applyPathMetaMenu();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setPathMetaMenu(null);
            }
          }}
        >
          <h3>Path Attributes</h3>
          <label>
            ID
            <input
              value={pathMetaMenu.idValue}
              onChange={(e) => setPathMetaMenu((m) => (m ? { ...m, idValue: e.target.value } : m))}
              placeholder="optional"
            />
          </label>
          <label>
            Class
            <input
              value={pathMetaMenu.classValue}
              onChange={(e) => setPathMetaMenu((m) => (m ? { ...m, classValue: e.target.value } : m))}
              placeholder="optional"
            />
          </label>
          <div className="path-meta-actions">
            <button className="control-btn" type="button" onClick={() => setPathMetaMenu(null)}>
              Cancel
            </button>
            <button className="control-btn" type="submit">
              Save
            </button>
          </div>
        </form>
      ) : null}
      {shapeMenu ? (
        <div
          ref={shapeMenuRef}
          className="shape-menu"
          style={{ left: `${shapeMenu.x}px`, top: `${shapeMenu.y}px` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button className="shape-preset-btn" title="Circle" onClick={() => addPresetPath('circle')}>
            <Circle />
          </button>
          <button className="shape-preset-btn" title="Curved Square" onClick={() => addPresetPath('roundedSquare')}>
            <Square />
          </button>
          <button className="shape-preset-btn" title="Curved Diamond" onClick={() => addPresetPath('roundedDiamond')}>
            <Diamond />
          </button>
          <button className="shape-preset-btn" title="Curved Triangle" onClick={() => addPresetPath('roundedTriangle')}>
            <Triangle />
          </button>
        </div>
      ) : null}
      {styleMenu ? (
        <div
          ref={styleMenuRef}
          className="style-menu"
          style={{ left: `${styleMenu.x}px`, top: `${styleMenu.y}px` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {styleMenu.kind !== 'opacity' ? <h3>{styleMenu.kind === 'fill' ? 'Fill' : 'Stroke'}</h3> : null}
          {styleMenu.kind === 'fill' ? (
            <>
              <label>
                <HexAlphaColorPicker
                  color={rgbaToHexAlpha(activeFill)}
                  onChange={(hex) =>
                    updateActiveStyle({
                      fill: rgbaToCss(parseColorToRgba(hex, activeFill)),
                    })
                  }
                />
              </label>
            </>
          ) : null}
          {styleMenu.kind === 'stroke' ? (
            <>
              <label>
                <div className={strokeControlDisabled ? 'picker-wrap disabled-stroke' : 'picker-wrap'}>
                  <HexAlphaColorPicker
                    color={rgbaToHexAlpha(activeStroke)}
                    onChange={(hex) =>
                      updateActiveStyle({
                        stroke: rgbaToCss(parseColorToRgba(hex, activeStroke)),
                      })
                    }
                  />
                </div>
              </label>
              <label>
                <SliderInline
                  label="Width"
                  min={0}
                  max={24}
                  value={activePath.strokeWidth}
                  unit="px"
                  onChange={(v) => updateActiveStyle({ strokeWidth: Math.round(v) })}
                />
              </label>
            </>
          ) : null}
          {styleMenu.kind === 'opacity' ? (
            <label>
              <SliderInline
                label="Opacity"
                min={0}
                max={100}
                value={Math.round((activePath.opacityExplicit ? activePath.opacity : 1) * 100)}
                unit="%"
                onChange={(v) => updateActiveStyle({ opacity: clamp(Math.round(v) / 100, 0, 1) })}
              />
            </label>
          ) : null}
        </div>
      ) : null}
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
};

export default App;
export { highlightSelectedPathHtml, parseSvg, pathIndexAtCaret, serializeSvg };
