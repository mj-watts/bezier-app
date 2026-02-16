import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Expand, MousePointer2, PenTool, Plus, Redo2, Trash2, Undo2 } from 'lucide-react';

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
  fill: string;
  stroke: string;
  strokeWidth: number;
  closed: boolean;
};

type Tool = 'select' | 'pen' | 'scale';
type Snapshot = {
  shapes: PathShape[];
  selectedPath: number;
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
      startPos: Vec;
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

const width = 900;
const height = 560;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const WORLD_LIMIT = 100000;
const ZOOM_RECENTER_BLEND = 0.32;
const MERGE_MAX_STEP_DISTANCE = 18;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const uid = () => Math.random().toString(36).slice(2, 9);

const makePoint = (x: number, y: number): Point => ({
  id: uid(),
  p: { x, y },
  in: { x: x - 40, y },
  out: { x: x + 40, y },
});

const defaultPath = (name: string): PathShape => ({
  id: uid(),
  name,
  points: [
    makePoint(170, 280),
    makePoint(300, 140),
    makePoint(520, 160),
    makePoint(700, 320),
    makePoint(500, 430),
    makePoint(260, 390),
  ],
  fill: '#58a6ff55',
  stroke: '#79c0ff',
  strokeWidth: 3,
  closed: true,
});

const mirrorHandle = (anchor: Vec, handle: Vec): Vec => ({ x: anchor.x * 2 - handle.x, y: anchor.y * 2 - handle.y });

const sampleBezier = (a: Vec, c1: Vec, c2: Vec, b: Vec, t: number): Vec => {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x,
    y: mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y,
  };
};

const pathData = (points: Point[], closed: boolean): string => {
  if (!points.length) return '';
  let d = `M ${points[0].p.x.toFixed(1)} ${points[0].p.y.toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const c1 = prev.out ?? prev.p;
    const c2 = curr.in ?? curr.p;
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${curr.p.x.toFixed(1)} ${curr.p.y.toFixed(1)}`;
  }
  if (closed && points.length > 1) {
    const last = points[points.length - 1];
    const first = points[0];
    const c1 = last.out ?? last.p;
    const c2 = first.in ?? first.p;
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${first.p.x.toFixed(1)} ${first.p.y.toFixed(1)} Z`;
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

  const norm = (x: number, y: number) => {
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l, l };
  };

  for (let i = 0; i < n; i += 1) {
    const curr = points[i];
    const prev = path.closed ? points[(i - 1 + n) % n] : points[Math.max(0, i - 1)];
    const next = path.closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)];

    if (!path.closed && i === 0) {
      curr.in = curr.in ?? null;
      continue;
    }

    if (!path.closed && i === n - 1) {
      curr.out = curr.out ?? null;
      continue;
    }

    const vin = norm(curr.p.x - prev.p.x, curr.p.y - prev.p.y);
    const vout = norm(next.p.x - curr.p.x, next.p.y - curr.p.y);
    const dot = clamp(vin.x * vout.x + vin.y * vout.y, -1, 1);
    const cornerDeg = (Math.acos(-dot) * 180) / Math.PI; // 180=straight, lower=sharper
    if (cornerDeg > 150) continue; // already smooth-ish; leave as-is

    const tx = vin.x + vout.x;
    const ty = vin.y + vout.y;
    const tn = norm(tx, ty);

    // Sharper corner => a bit longer handles; bounded to preserve local shape.
    const sharpness = clamp((150 - cornerDeg) / 120, 0.12, 0.75);
    const base = Math.min(vin.l, vout.l);
    const h = Math.min(36, base * 0.35 * sharpness);

    curr.in = { x: curr.p.x - tn.x * h, y: curr.p.y - tn.y * h };
    curr.out = { x: curr.p.x + tn.x * h, y: curr.p.y + tn.y * h };
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

const serializeSvg = (shapes: PathShape[]) => {
  const lines = shapes
    .map((shape) => {
      const d = pathData(shape.points, shape.closed);
      return `  <path d="${d}" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" />`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">\n${lines}\n</svg>`;
};

const attr = (text: string, name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quoted = text.match(new RegExp(`${escaped}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  if (quoted) return quoted[2];
  const unquoted = text.match(new RegExp(`${escaped}\\s*=\\s*([^\\s>]+)`, 'i'));
  return unquoted ? unquoted[1] : null;
};

const parsePathD = (d: string) => {
  const tokens = (d.match(/[MLCZmlcz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []).map((t) => t.trim());
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
    if (/^[MLCZmlcz]$/.test(tokens[i])) {
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

const mapPointFromViewBox = (p: Vec, vb: { minX: number; minY: number; vbW: number; vbH: number }): Vec => ({
  x: ((p.x - vb.minX) / vb.vbW) * width,
  y: ((p.y - vb.minY) / vb.vbH) * height,
});

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

const parseSvg = (input: string): PathShape[] | null => {
  const pathMatches = [...input.matchAll(/<path\b[^>]*>/gi)].map((m) => m[0]);
  if (!pathMatches.length) return null;

  const shapes: PathShape[] = [];

  for (let k = 0; k < pathMatches.length; k += 1) {
    const p = pathMatches[k];
    const d = attr(p, 'd');
    if (!d) continue;
    const parsed = parsePathD(d);
    if (!parsed) continue;

    const fill = attr(p, 'fill') ?? '#58a6ff55';
    const stroke = attr(p, 'stroke') ?? '#79c0ff';
    const sw = Number(attr(p, 'stroke-width') ?? '3');

    shapes.push({
      id: uid(),
      name: `Path ${k + 1}`,
      points: parsed.points,
      closed: parsed.closed,
      fill,
      stroke,
      strokeWidth: Number.isFinite(sw) ? sw : 3,
    });
  }

  if (!shapes.length) return null;

  const vb = parseViewBox(input);
  const mapped = vb ? mapShapesFromViewBox(shapes, vb) : shapes;
  return autoFitShapesToViewport(mapped);
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');

const highlightSelectedPathHtml = (code: string, selectedPath: number) => {
  const re = /<path\b[^>]*>/gi;
  const matches = [...code.matchAll(re)];
  if (!matches.length || selectedPath < 0 || selectedPath >= matches.length) return escapeHtml(code);

  const m = matches[selectedPath];
  if (m.index === undefined) return escapeHtml(code);

  const start = m.index;
  const end = start + m[0].length;
  return `${escapeHtml(code.slice(0, start))}<span class="selected-code">${escapeHtml(code.slice(start, end))}</span>${escapeHtml(code.slice(end))}`;
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
  const [shapes, setShapes] = useState<PathShape[]>([defaultPath('Path 1')]);
  const [selectedPath, setSelectedPath] = useState(0);
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
  const [copied, setCopied] = useState(false);
  const codeOverlayRef = useRef<HTMLPreElement | null>(null);
  const codeDebounceRef = useRef<number | null>(null);

  const activePath = shapes[selectedPath];
  const transformPoints = useMemo(
    () => (transformAllPaths ? shapes.flatMap((shape) => shape.points) : activePath?.points ?? []),
    [transformAllPaths, shapes, activePath],
  );
  const transformBounds = useMemo(() => getPathBounds(transformPoints), [transformPoints]);
  const selectedPathBounds = useMemo(
    () => (pathSelected ? getPathBounds(activePath?.points ?? []) : null),
    [activePath, pathSelected],
  );
  const highlightedCodeHtml = useMemo(
    () => highlightSelectedPathHtml(codeText, pathSelected ? selectedPath : -1),
    [codeText, selectedPath, pathSelected],
  );

  useEffect(() => {
    setCodeText(serializeSvg(shapes));
  }, [shapes]);

  const snapshotCurrent = (): Snapshot => ({
    shapes: cloneShapes(shapes),
    selectedPath,
    selectedPoint,
    selectedPoints,
    transformAllPaths,
    codeText,
  });

  const applySnapshot = (shot: Snapshot) => {
    setShapes(cloneShapes(shot.shapes));
    setSelectedPath(shot.selectedPath);
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
      if (key === 's') {
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
  }, []);

  const updatePath = (pathIndex: number, mutator: (path: PathShape) => PathShape) => {
    setShapes((curr) => curr.map((path, i) => (i === pathIndex ? mutator(path) : path)));
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

  const toLocal = (clientX: number, clientY: number, target: SVGSVGElement): Vec => {
    const rect = target.getBoundingClientRect();
    const vw = width / zoom;
    const vh = height / zoom;
    return {
      x: viewOrigin.x + ((clientX - rect.left) / rect.width) * vw,
      y: viewOrigin.y + ((clientY - rect.top) / rect.height) * vh,
    };
  };

  const pathDs = useMemo(() => shapes.map((shape) => pathData(shape.points, shape.closed)), [shapes]);

  const addPath = () => {
    pushUndo();
    setShapes((curr) => [...curr, defaultPath(`Path ${curr.length + 1}`)]);
    setSelectedPath(shapes.length);
    setPathSelected(true);
    setSelectedPoint(0);
    setSelectedPoints([0]);
  };

  const deletePath = () => {
    pushUndo();
    setShapes((curr) => {
      if (curr.length <= 1) return curr;
      const next = curr.filter((_, i) => i !== selectedPath);
      setSelectedPath(clamp(selectedPath - 1, 0, next.length - 1));
      setPathSelected(true);
      setSelectedPoint(0);
      setSelectedPoints([0]);
      return next;
    });
  };

  const addPointOnSegment = (pathIndex: number, segmentIndex: number, pos: Vec) => {
    pushUndo();
    updatePath(pathIndex, (path) => {
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
    updatePath(pathIndex, (path) => {
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
    const sorted = [...new Set(selectedPoints)].sort((a, b) => a - b);

    const groups: number[][] = [];
    let currGroup: number[] = [];
    for (const idx of sorted) {
      if (!currGroup.length || idx === currGroup[currGroup.length - 1] + 1) currGroup.push(idx);
      else {
        groups.push(currGroup);
        currGroup = [idx];
      }
    }
    if (currGroup.length) groups.push(currGroup);

    pushUndo();
    updatePath(selectedPath, (path) => {
      let points = [...path.points];
      const mergedAt: number[] = [];

      for (const g of [...groups].reverse()) {
        if (g.length < 2) continue;
        const start = g[0];
        const end = g[g.length - 1];
        const pts = points.slice(start, end + 1);
        if (pts.length < 2) continue;

        let near = true;
        for (let i = 1; i < pts.length; i += 1) {
          if (dist(pts[i - 1].p, pts[i].p) > MERGE_MAX_STEP_DISTANCE) {
            near = false;
            break;
          }
        }
        if (!near) continue;

        const cx = pts.reduce((s, p) => s + p.p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.p.y, 0) / pts.length;
        const anchor = { x: cx, y: cy };

        const first = pts[0];
        const last = pts[pts.length - 1];
        const mergedBase = mergePointPair(first, last);
        const ax = anchor.x - mergedBase.p.x;
        const ay = anchor.y - mergedBase.p.y;
        const merged: Point = {
          ...mergedBase,
          p: anchor,
          in: mergedBase.in ? { x: mergedBase.in.x + ax, y: mergedBase.in.y + ay } : null,
          out: mergedBase.out ? { x: mergedBase.out.x + ax, y: mergedBase.out.y + ay } : null,
        };
        points = [...points.slice(0, start), merged, ...points.slice(end + 1)];
        mergedAt.push(start);
      }

      if (!mergedAt.length) return path;
      const nextSel = [...mergedAt].sort((a, b) => a - b);
      setSelectedPoints(nextSel);
      setSelectedPoint(nextSel[0]);
      return { ...path, points };
    });
  };

  const simplifyPathOrSvg = () => {
    pushUndo();
    if (pathSelected) {
      updatePath(selectedPath, (path) => simplifyPathByThreshold(path, simplifyThreshold));
      setSelectedPoint(0);
      setSelectedPoints([0]);
      return;
    }
    setShapes((curr) => curr.map((path) => simplifyPathByThreshold(path, simplifyThreshold)));
  };

  const smoothPathOrSvg = () => {
    pushUndo();
    if (pathSelected) {
      updatePath(selectedPath, (path) => smoothSharpCorners(path));
      setSelectedPoint(0);
      setSelectedPoints([0]);
      return;
    }
    setShapes((curr) => curr.map((path) => smoothSharpCorners(path)));
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

        const sx = uniformMode ? clamp(Math.max(rawSx, rawSy), 0.05, 20) : clamp(rawSx, 0.05, 20);
        const sy = uniformMode ? sx : clamp(rawSy, 0.05, 20);

        const map = (v: Vec): Vec => ({
          x: origin.x + (v.x - origin.x) * sx,
          y: origin.y + (v.y - origin.y) * sy,
        });

        return drag.baseShapes.map((shape, i) => {
          if (!drag.affectAll && i !== drag.pathIndex) return shape;
          return {
            ...shape,
            points: shape.points.map((pt) => ({
              ...pt,
              p: map(pt.p),
              in: pt.in ? map(pt.in) : null,
              out: pt.out ? map(pt.out) : null,
            })),
          };
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
          if (!drag.affectAll && i !== drag.pathIndex) return shape;
          return {
            ...shape,
            points: shape.points.map((pt) => ({
              ...pt,
              p: map(pt.p),
              in: pt.in ? map(pt.in) : null,
              out: pt.out ? map(pt.out) : null,
            })),
          };
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

        return { ...path, points };
      }),
    );
  };

  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (spaceDown) return;
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
      if (fromUser) setCodeError('Unable to parse SVG. Use <path> tags with M/L/C/Z commands.');
      return;
    }
    if (fromUser) pushUndo();
    setCodeError('');
    setShapes(parsed);
    setSelectedPath(0);
    setPathSelected(true);
    setSelectedPoint(0);
    setSelectedPoints([0]);
  };

  const updateActiveStyle = (patch: Partial<Pick<PathShape, 'fill' | 'stroke' | 'strokeWidth' | 'closed'>>) => {
    pushUndo();
    updatePath(selectedPath, (path) => ({ ...path, ...patch }));
  };

  const syncSelectionFromCodeCursor = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? 0;
    const idx = pathIndexAtCaret(codeText, caret);
    if (idx === null) return;
    if (idx < 0 || idx >= shapes.length) return;
    if (idx === selectedPath) return;
    setPathSelected(true);
    setSelectedPath(idx);
    setSelectedPoint(0);
    setSelectedPoints([0]);
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>SVG Editor</h1>
        <div className="path-tabs">
          {shapes.map((shape, i) => (
            <button
              key={shape.id}
              className={i === selectedPath ? 'tab active' : 'tab'}
              onClick={() => {
                setPathSelected(true);
                setSelectedPath(i);
                setSelectedPoint(0);
                setSelectedPoints([0]);
              }}
            >
              {shape.name}
            </button>
          ))}
          <button className="icon-btn" onClick={addPath} title="Add Path">
            <Plus />
          </button>
          <button className="icon-btn" onClick={deletePath} title="Delete Path">
            <Trash2 />
          </button>
        </div>
      </header>

      <div
        className="workspace"
        style={{ '--code-pane-width': `${codePaneWidth}px` } as CSSProperties}
      >
        <aside className="tool-dock">
          <button
            className={tool === 'select' ? 'tool active' : 'tool'}
            onClick={() => {
              setTool('select');
              setPenHover(null);
            }}
            title="Select Tool"
          >
            <MousePointer2 />
          </button>
          <button className={tool === 'pen' ? 'tool active' : 'tool'} onClick={() => setTool('pen')} title="Pen Tool">
            <PenTool />
          </button>
          <button
            className={tool === 'scale' ? 'tool active' : 'tool'}
            onClick={() => {
              setTool('scale');
              setPenHover(null);
            }}
            title="Scale Tool"
          >
            <Expand />
          </button>
        </aside>

        <section className="left-pane">
          <div className="controls-row">
            <label>
              Fill
              <input type="color" value={activePath.fill} onChange={(e) => updateActiveStyle({ fill: e.target.value })} />
            </label>
            <label>
              Stroke
              <input type="color" value={activePath.stroke} onChange={(e) => updateActiveStyle({ stroke: e.target.value })} />
            </label>
            <label>
              Width
              <input
                type="range"
                min={0}
                max={24}
                value={activePath.strokeWidth}
                onChange={(e) => updateActiveStyle({ strokeWidth: Number(e.target.value) })}
              />
              <strong>{activePath.strokeWidth}px</strong>
            </label>
            <label>
              Closed
              <input
                type="checkbox"
                checked={activePath.closed}
                onChange={(e) => updateActiveStyle({ closed: e.target.checked })}
              />
            </label>
            {tool === 'scale' ? (
              <label>
                All Paths
                <input
                  type="checkbox"
                  checked={transformAllPaths}
                  onChange={(e) => setTransformAllPaths(e.target.checked)}
                />
              </label>
            ) : null}
            <div className="controls-actions">
              <label className="zoom-group">
                Simplify
                <input
                  type="range"
                  min={2}
                  max={40}
                  value={simplifyThreshold}
                  onChange={(e) => setSimplifyThreshold(Number(e.target.value))}
                />
                <strong className="zoom-readout">{simplifyThreshold}px</strong>
                <button className="control-btn" type="button" onClick={simplifyPathOrSvg}>
                  {pathSelected ? 'Simplify Path' : 'Simplify SVG'}
                </button>
              </label>
              <button className="control-btn" type="button" onClick={smoothPathOrSvg}>
                {pathSelected ? 'Smooth Path' : 'Smooth SVG'}
              </button>
              <button
                className="control-btn"
                onClick={mergeSelectedAnchors}
                disabled={!pathSelected || selectedPoints.length < 2}
                title="Merge contiguous, close selected points"
              >
                Merge Points
              </button>
              <label className="zoom-group">
                Zoom
                <button
                  className="control-btn"
                  type="button"
                  onClick={() => {
                    if (selectedPathBounds) {
                      zoomByFactorCenteredOnWorld(1 / 1.2, selectedPathBounds.cx, selectedPathBounds.cy);
                    } else {
                      const { nx, ny } = zoomFocusFromSelection();
                      zoomByFactorAt(1 / 1.2, nx, ny);
                    }
                  }}
                  title="Zoom Out"
                >
                  -
                </button>
                <strong className="zoom-readout">{Math.round(zoom * 100)}%</strong>
                <button
                  className="control-btn"
                  type="button"
                  onClick={() => {
                    const { nx, ny } = zoomFocusFromSelection();
                    zoomByFactorAt(1.2, nx, ny);
                  }}
                  title="Zoom In"
                >
                  +
                </button>
                <button className="control-btn" type="button" onClick={resetView} title="Reset View">
                  100%
                </button>
              </label>
              <button className="control-btn icon-only" onClick={undo} disabled={!undoStack.length} title="Undo (Cmd/Ctrl+Z)">
                <Undo2 />
              </button>
              <button
                className="control-btn icon-only"
                onClick={redo}
                disabled={!redoStack.length}
                title="Redo (Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y)"
              >
                <Redo2 />
              </button>
            </div>
          </div>

          <svg
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
            onWheel={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
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
            }}
            onClick={onCanvasClick}
          >
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              className="grid-bg"
              onPointerDown={(e) => {
                if (spaceDown) return;
                e.stopPropagation();
                setPathSelected(false);
                setSelectedPoints([]);
              }}
            />

            {shapes.map((shape, i) => (
              <path
                key={shape.id}
                d={pathDs[i]}
                fill={shape.fill}
                stroke={shape.stroke}
                strokeWidth={shape.strokeWidth}
                opacity={i === selectedPath ? 1 : 0.5}
                onPointerDown={() => {
                  if (!spaceDown && (tool === 'select' || tool === 'scale')) {
                    setPathSelected(true);
                    setSelectedPath(i);
                    setSelectedPoint(0);
                    setSelectedPoints([0]);
                  }
                }}
              />
            ))}
            {pathSelected && activePath ? (
              <path
                d={pathDs[selectedPath]}
                fill="none"
                stroke="#ff9a00"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                opacity={1}
                pointerEvents="none"
              />
            ) : null}

            {pathSelected &&
              activePath.points.map((pt, i) => (
              <g key={pt.id}>
                {tool === 'select' && i === selectedPoint && pt.in && (
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

                {tool === 'select' && i === selectedPoint && pt.out && (
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
                  x={pt.p.x - (i === selectedPoint ? 2.5 : 2) / zoom}
                  y={pt.p.y - (i === selectedPoint ? 2.5 : 2) / zoom}
                  width={(i === selectedPoint ? 5 : 4) / zoom}
                  height={(i === selectedPoint ? 5 : 4) / zoom}
                  className={
                    penHover?.kind === 'anchor' && penHover.pointIndex === i
                      ? 'anchor pen-delete'
                      : selectedPoints.includes(i)
                        ? 'anchor selected'
                        : 'anchor'
                  }
                  style={{ strokeWidth: (i === selectedPoint ? 1.4 : 1.1) / zoom }}
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

            {tool === 'scale' && transformBounds ? (
              <>
                <rect
                  x={transformBounds.minX}
                  y={transformBounds.minY}
                  width={Math.max(1, transformBounds.maxX - transformBounds.minX)}
                  height={Math.max(1, transformBounds.maxY - transformBounds.minY)}
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
                      affectAll: transformAllPaths,
                      startPos,
                      baseShapes: cloneShapes(shapes),
                    });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
                <rect
                  x={transformBounds.minX}
                  y={transformBounds.minY}
                  width={Math.max(1, transformBounds.maxX - transformBounds.minX)}
                  height={Math.max(1, transformBounds.maxY - transformBounds.minY)}
                  className="scale-box"
                />
                {(
                  [
                    {
                      corner: 'nw',
                      x: transformBounds.minX,
                      y: transformBounds.minY,
                      ox: transformBounds.maxX,
                      oy: transformBounds.maxY,
                      cx: transformBounds.cx,
                      cy: transformBounds.cy,
                    },
                    {
                      corner: 'ne',
                      x: transformBounds.maxX,
                      y: transformBounds.minY,
                      ox: transformBounds.minX,
                      oy: transformBounds.maxY,
                      cx: transformBounds.cx,
                      cy: transformBounds.cy,
                    },
                    {
                      corner: 'se',
                      x: transformBounds.maxX,
                      y: transformBounds.maxY,
                      ox: transformBounds.minX,
                      oy: transformBounds.minY,
                      cx: transformBounds.cx,
                      cy: transformBounds.cy,
                    },
                    {
                      corner: 'sw',
                      x: transformBounds.minX,
                      y: transformBounds.maxY,
                      ox: transformBounds.maxX,
                      oy: transformBounds.minY,
                      cx: transformBounds.cx,
                      cy: transformBounds.cy,
                    },
                  ] as const
                ).map((h) => (
                  <rect
                    key={h.corner}
                    x={h.x - 5}
                    y={h.y - 5}
                    width={10}
                    height={10}
                    className={`scale-handle ${h.corner}`}
                    onPointerDown={(e) => {
                      if (spaceDown) return;
                      e.stopPropagation();
                      pushUndo();
                      setDrag({
                        kind: 'scale',
                        pathIndex: selectedPath,
                        affectAll: transformAllPaths,
                        originOpp: { x: h.ox, y: h.oy },
                        originCenter: { x: h.cx, y: h.cy },
                        startVecOpp: { x: h.x - h.ox, y: h.y - h.oy },
                        startVecCenter: { x: h.x - h.cx, y: h.y - h.cy },
                        baseShapes: cloneShapes(shapes),
                      });
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                  />
                ))}
                <circle cx={transformBounds.cx} cy={transformBounds.cy} r={3.2} className="scale-pivot" />
                <line
                  x1={transformBounds.cx - 8}
                  y1={transformBounds.cy}
                  x2={transformBounds.cx + 8}
                  y2={transformBounds.cy}
                  className="scale-pivot-line"
                />
                <line
                  x1={transformBounds.cx}
                  y1={transformBounds.cy - 8}
                  x2={transformBounds.cx}
                  y2={transformBounds.cy + 8}
                  className="scale-pivot-line"
                />
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
          </svg>
          <p className="hint">
            {tool === 'pen'
              ? 'Pen tool: hover anchor to delete point, hover segment to add point, then click. Hold Space to pan.'
              : tool === 'scale'
                ? 'Scale tool: drag inside box to move, drag corners to scale. Shift = uniform, Alt/Option = center scale. Hold Space to pan.'
                : 'Select tool: drag anchors/handles to edit curvature. Hold Space to pan.'}
          </p>
        </section>

        <div
          className="pane-splitter"
          onPointerDown={(e) => {
            setPaneDrag({ startX: e.clientX, startWidth: codePaneWidth });
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!paneDrag) return;
            const dx = e.clientX - paneDrag.startX;
            setCodePaneWidth(clamp(paneDrag.startWidth - dx, 260, 860));
          }}
          onPointerUp={() => setPaneDrag(null)}
          onPointerCancel={() => setPaneDrag(null)}
        />

        <aside className="right-pane">
          <div className="code-header">
            <h2>Live SVG</h2>
            <button className="control-btn icon-only" onClick={copySvgCode} title={copied ? 'Copied' : 'Copy SVG'}>
              <Copy />
            </button>
          </div>
          <div className="code-wrap">
            <pre
              ref={codeOverlayRef}
              className="code-overlay"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: `${highlightedCodeHtml}\n` }}
            />
            <textarea
              value={codeText}
              onChange={(e) => {
                const next = e.target.value;
                setCodeText(next);
                setCodeError('');
                if (codeDebounceRef.current) window.clearTimeout(codeDebounceRef.current);
                codeDebounceRef.current = window.setTimeout(() => {
                  applyCodeText(next);
                }, 280);
              }}
              onClick={(e) => syncSelectionFromCodeCursor(e.currentTarget)}
              onKeyUp={(e) => syncSelectionFromCodeCursor(e.currentTarget)}
              onSelect={(e) => syncSelectionFromCodeCursor(e.currentTarget)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                const parsed = parseSvg(pasted);
                if (parsed) {
                  e.preventDefault();
                  pushUndo();
                  setShapes(parsed);
                  setSelectedPath(0);
                  setSelectedPoint(0);
                  setSelectedPoints([0]);
                  setCodeError('');
                }
              }}
              onScroll={(e) => {
                if (!codeOverlayRef.current) return;
                codeOverlayRef.current.scrollTop = e.currentTarget.scrollTop;
                codeOverlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
              }}
              spellCheck={false}
            />
          </div>
          {codeError ? <p className="error">{codeError}</p> : null}
        </aside>
      </div>
    </div>
  );
};

export default App;
