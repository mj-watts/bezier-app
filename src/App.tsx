import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import AboutModal from './components/AboutModal';
import CodePane from './components/CodePane';
import ControlsBar from './components/ControlsBar';
import EditorCanvas from './components/editor/EditorCanvas';
import PathPane from './components/PathPane';
import ToolDock from './components/ToolDock';
import TopBar from './components/TopBar';
import CurrentColorMenu from './components/menus/CurrentColorMenu';
import LucideIconMenu from './components/menus/LucideIconMenu';
import PathMetaMenu from './components/menus/PathMetaMenu';
import ShapeMenu from './components/menus/ShapeMenu';
import StyleMenu from './components/menus/StyleMenu';
import {
  type CurrentColorMenuState,
  type CursorZoomFocus,
  type LucideMenuState,
  type MarqueeState,
  type PaneDrag,
  type PathMetaMenuState,
  type ShapeMenuState,
  type StyleMenuState,
} from './types/app-types';
import {
  type DragTarget,
  type PathShape,
  type PenHover,
  type ShapePreset,
  type Snapshot,
  type StylePanel,
  type Tool,
  type Vec,
  type ViewBox,
  DEFAULT_DOCUMENT,
  MAX_ZOOM,
  MERGE_MAX_STEP_DISTANCE,
  MIN_ZOOM,
  SliderInline,
  ZOOM_RECENTER_BLEND,
  clamp,
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
  mapPathDFromViewBox,
  mapPointFromViewBox,
  mergePointPair,
  mirrorHandle,
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
  translatePathD,
  height,
  width,
} from './lib/editor-core';
import { loadLucideIconSvg } from './lib/lucide-icons';
import {
  clampOriginForZoom,
  computeZoomFocusFromSelection,
  createCurrentColorMenuState,
  createLucideMenuState,
  createPathMetaMenuState,
  createShapeMenuState,
  createStyleMenuState,
  getCenteredOriginForShapes,
  markGeometryDirty,
  toLocalPoint,
} from './lib/app-helpers';
import { openSvgFile as openSvgTextFromFile, saveSvgFile as saveSvgCodeToFile } from './lib/file-io';

const DEFAULT_ZOOM = 0.5;

const App = () => {
  const [tool, setTool] = useState<Tool>('select');
  const [drag, setDrag] = useState<DragTarget>(null);
  const [shapes, setShapes] = useState<PathShape[]>(() => cloneShapes(DEFAULT_DOCUMENT.shapes));
  const [selectedPath, setSelectedPath] = useState(0);
  const [selectedPaths, setSelectedPaths] = useState<number[]>([0]);
  const [pathSelected, setPathSelected] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState(0);
  const [selectedPoints, setSelectedPoints] = useState<number[]>([0]);
  const [penHover, setPenHover] = useState<PenHover>(null);
  const [transformAllPaths, setTransformAllPaths] = useState(false);
  const [codePaneWidth, setCodePaneWidth] = useState(420);
  const [paneDrag, setPaneDrag] = useState<PaneDrag | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [viewOrigin, setViewOrigin] = useState<Vec>(() => getCenteredOriginForShapes(DEFAULT_DOCUMENT.shapes, DEFAULT_ZOOM));
  const [cursorZoomFocus, setCursorZoomFocus] = useState<CursorZoomFocus | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [simplifyThreshold, setSimplifyThreshold] = useState(10);
  const [codeText, setCodeText] = useState('');
  const [codeError, setCodeError] = useState('');
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [docViewBox, setDocViewBox] = useState<ViewBox>(DEFAULT_DOCUMENT.viewBox);
  const [copied, setCopied] = useState(false);
  const [pathMetaMenu, setPathMetaMenu] = useState<PathMetaMenuState | null>(null);
  const [styleMenu, setStyleMenu] = useState<StyleMenuState | null>(null);
  const [shapeMenu, setShapeMenu] = useState<ShapeMenuState | null>(null);
  const [lucideMenu, setLucideMenu] = useState<LucideMenuState | null>(null);
  const [currentColorMenu, setCurrentColorMenu] = useState<CurrentColorMenuState | null>(null);
  const [confirmDeletePath, setConfirmDeletePath] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showViewBox, setShowViewBox] = useState(false);
  const [currentColorValue, setCurrentColorValue] = useState('#ffffff');
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const codeOverlayRef = useRef<HTMLPreElement | null>(null);
  const codeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorSvgRef = useRef<SVGSVGElement | null>(null);
  const codeDebounceRef = useRef<number | null>(null);
  const lastShapesUpdateFromCodeRef = useRef(false);
  const shapeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const lucideTriggerRef = useRef<HTMLButtonElement | null>(null);
  const styleTriggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentColorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pathMetaMenuRef = useRef<HTMLFormElement | null>(null);
  const shapeMenuRef = useRef<HTMLDivElement | null>(null);
  const lucideMenuRef = useRef<HTMLDivElement | null>(null);
  const styleMenuRef = useRef<HTMLDivElement | null>(null);
  const currentColorMenuRef = useRef<HTMLDivElement | null>(null);

  const activePath = shapes[selectedPath] ?? DEFAULT_DOCUMENT.shapes[0];
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
    if (!transformBounds) return { x: 0, y: 0 };
    return { x: transformBounds.cx, y: transformBounds.cy };
  }, [transformBounds]);
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
  const highlightedCodeHtml = useMemo(() => syntaxHighlightSvgHtml(codeText), [codeText]);
  const editorDocViewBox = useMemo(() => {
    const topLeft = mapPointFromViewBox({ x: docViewBox.minX, y: docViewBox.minY }, docViewBox);
    const bottomRight = mapPointFromViewBox({ x: docViewBox.minX + docViewBox.vbW, y: docViewBox.minY + docViewBox.vbH }, docViewBox);
    return {
      minX: topLeft.x,
      minY: topLeft.y,
      vbW: Math.max(0, bottomRight.x - topLeft.x),
      vbH: Math.max(0, bottomRight.y - topLeft.y),
    };
  }, [docViewBox]);

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
        enterTransformMode();
      }
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        deletePath();
        setConfirmDeletePath(false);
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

  const updatePathGeometry = (pathIndex: number, mutator: (path: PathShape) => PathShape) => {
    updatePath(pathIndex, (path) => markGeometryDirty(mutator(path)));
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

  const zoomFocusFromSelection = () =>
    computeZoomFocusFromSelection({
      selectedPathBounds,
      cursorZoomFocus,
      viewOrigin,
      zoom,
    });

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

  const toLocal = (clientX: number, clientY: number, target: SVGSVGElement): Vec =>
    toLocalPoint(clientX, clientY, target, viewOrigin, zoom);

  const pathDs = useMemo(
    () =>
      shapes.map((shape) =>
        !shape.geometryDirty && shape.sourceD && !shape.sourceD.startsWith('<')
          ? mapPathDFromViewBox(shape.sourceD, docViewBox)
          : pathData(shape.points, shape.closed),
      ),
    [docViewBox, shapes],
  );
  const defaultDocCode = useMemo(() => serializeSvg(DEFAULT_DOCUMENT.shapes, DEFAULT_DOCUMENT.viewBox), []);
  const hasDefaultViewBox =
    docViewBox.minX === DEFAULT_DOCUMENT.viewBox.minX &&
    docViewBox.minY === DEFAULT_DOCUMENT.viewBox.minY &&
    docViewBox.vbW === DEFAULT_DOCUMENT.viewBox.vbW &&
    docViewBox.vbH === DEFAULT_DOCUMENT.viewBox.vbH;
  const isInitialDocument = hasDefaultViewBox && serializeSvg(shapes, DEFAULT_DOCUMENT.viewBox) === defaultDocCode;
  const toIconLabel = (name: string) =>
    name
      .split('-')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');

  const addPresetPath = (preset: ShapePreset) => {
    pushUndo();
    const centerX = viewOrigin.x + width / (2 * zoom);
    const centerY = viewOrigin.y + height / (2 * zoom);
    const replaceInitial = isInitialDocument;
    setShapes((curr) => {
      const base = replaceInitial ? [] : curr;
      const created = createPresetPath(`Path ${base.length + 1}`, preset, centerX, centerY);
      const next = [...base, created];
      const idx = next.length - 1;
      setSelectedPath(idx);
      setSelectedPaths([idx]);
      setPathSelected(true);
      setSelectedPoint(0);
      setSelectedPoints([0]);
      return next;
    });
    setShapeMenu(null);
    enterTransformMode();
  };

  const addLucideIcon = async (iconName: string) => {
    const svg = await loadLucideIconSvg(iconName);
    if (!svg) return;
    const parsed = parseSvg(svg);
    if (!parsed || !parsed.shapes.length) return;

    const sourceBounds = getPathBounds(parsed.shapes.flatMap((shape) => shape.points));
    if (!sourceBounds) return;

    const centerX = viewOrigin.x + width / (2 * zoom);
    const centerY = viewOrigin.y + height / (2 * zoom);
    const dx = centerX - sourceBounds.cx;
    const dy = centerY - sourceBounds.cy;
    const label = toIconLabel(iconName);
    const replaceInitial = isInitialDocument;

    pushUndo();
    setShapes((curr) => {
      const base = replaceInitial ? [] : curr;
      const startIndex = base.length;
      const created = parsed.shapes.map((shape, idx) => ({
        ...shape,
        name: parsed.shapes.length === 1 ? label : `${label} ${idx + 1}`,
        sourceD: null,
        geometryDirty: true,
        points: shape.points.map((pt) => ({
          ...pt,
          p: { x: pt.p.x + dx, y: pt.p.y + dy },
          in: pt.in ? { x: pt.in.x + dx, y: pt.in.y + dy } : null,
          out: pt.out ? { x: pt.out.x + dx, y: pt.out.y + dy } : null,
        })),
      }));
      const next = [...base, ...created];
      const inserted = created.map((_, idx) => startIndex + idx);
      const all = next[startIndex]?.points.map((_, i) => i) ?? [0];
      setPathSelected(true);
      setSelectedPath(startIndex);
      setSelectedPaths(inserted);
      setSelectedPoint(all[0] ?? 0);
      setSelectedPoints(all.length ? all : [0]);
      return next;
    });
    setTool('select');
    setPenHover(null);
    setLucideMenu(null);
    enterTransformMode();
  };

  const deletePath = () => {
    if (!pathSelected || shapes.length === 0) return;
    pushUndo();
    const targets = new Set(selectedPaths.length ? selectedPaths : [selectedPath]);
    setShapes((curr) => {
      const next = curr.filter((_, i) => !targets.has(i));
      if (!next.length) {
        setSelectedPath(0);
        setSelectedPaths([]);
        setPathSelected(false);
        setSelectedPoint(0);
        setSelectedPoints([]);
        setTransformAllPaths(false);
        setPenHover(null);
        return next;
      }
      const nextSelBase = targets.has(selectedPath) ? selectedPath - 1 : selectedPath;
      const nextSel = clamp(nextSelBase, 0, next.length - 1);
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
    const scaleX = rect.width / (width / zoom);
    const scaleY = rect.height / (height / zoom);
    const screenScale = Math.max(0.0001, Math.min(scaleX, scaleY));
    const worldUnitsPerPx = 1 / screenScale;
    const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    setCursorZoomFocus({ nx, ny });
    const anchorHit = 6 / zoom;
    const segmentHit = 10 / zoom;

    if (!drag) {
      let nextCursor = '';
      if (spaceDown) {
        nextCursor = 'grab';
      } else if (tool === 'pen') {
        nextCursor = 'crosshair';
      } else if (tool === 'scale') {
        nextCursor = 'move';
      } else if (tool === 'select' && pathSelected) {
        const selectedAnchorHit = 4 * worldUnitsPerPx;
        const activeSelectedPoint = activePath?.points[selectedPoint];
        const overAnchorPoint =
          selectedPaths.length === 1 && !!activePath && activePath.points.some((pt) => dist(pt.p, pos) <= selectedAnchorHit);
        const overBezierHandle =
          selectedPaths.length === 1 &&
          !!activeSelectedPoint &&
          ((activeSelectedPoint.in && dist(activeSelectedPoint.in, pos) <= selectedAnchorHit) ||
            (activeSelectedPoint.out && dist(activeSelectedPoint.out, pos) <= selectedAnchorHit));
        const overPivot = !!transformFrame && dist(pos, { x: transformFrame.cx, y: transformFrame.cy }) <= 8 / zoom;
        const overFill = isOverSelectedFill(pos);
        const overStroke = transformTargetIndices.some((idx) => {
          const shape = shapes[idx];
          if (!shape) return false;
          const seg = closestSegment(shape, pos);
          if (!seg) return false;
          const strokeW = shape.strokeWidthExplicit ? Math.max(0, shape.strokeWidth) : 0;
          const threshold = Math.max(8 / zoom, strokeW / 2 + 2 / zoom);
          return seg.distance <= threshold;
        });
        const insideTransform = !!transformFrame && (() => {
          const unrot = rotateAround(pos, { x: transformFrame.cx, y: transformFrame.cy }, -transformFrame.angle);
          const eps = 0.0001;
          return (
            unrot.x >= transformFrame.minX - eps &&
            unrot.x <= transformFrame.maxX + eps &&
            unrot.y >= transformFrame.minY - eps &&
            unrot.y <= transformFrame.maxY + eps
          );
        })();
        if (overAnchorPoint || overBezierHandle) nextCursor = 'default';
        else if (overPivot || (insideTransform && (overStroke || overFill))) nextCursor = 'move';
        else nextCursor = 'default';
      }
      e.currentTarget.style.cursor = nextCursor;
    }

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
        const s = Math.min(width / docViewBox.vbW, height / docViewBox.vbH);
        const dxVb = s === 0 ? 0 : dx / s;
        const dyVb = s === 0 ? 0 : dy / s;
        const map = (v: Vec): Vec => ({ x: v.x + dx, y: v.y + dy });

        return drag.baseShapes.map((shape, i) => {
          if (!drag.targetPathIndices.includes(i)) return shape;
          const moved = {
            ...shape,
            points: shape.points.map((pt) => ({
              ...pt,
              p: map(pt.p),
              in: pt.in ? map(pt.in) : null,
              out: pt.out ? map(pt.out) : null,
            })),
          };
          if (!shape.geometryDirty && shape.sourceD && !shape.sourceD.startsWith('<')) {
            return {
              ...moved,
              sourceD: translatePathD(shape.sourceD, dxVb, dyVb),
            };
          }
          return markGeometryDirty(moved);
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

  const applyCodeText = (text: string, fromUser = false): boolean => {
    const parsed = parseSvg(text);
    if (!parsed) {
      if (fromUser) setCodeError('Unable to parse SVG. Supported tags: <path>, <circle>, <ellipse>, <rect>, <line>, <polyline>, <polygon>.');
      return false;
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
    enterTransformMode();
    return true;
  };

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const isEditable = target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        if (isEditable && target !== codeTextareaRef.current) return;
      }
      const pasted = extractSvgFromClipboard(e.clipboardData);
      if (!pasted) return;
      if (!importPastedSvg(pasted)) return;
      e.preventDefault();
    };
    document.addEventListener('paste', onWindowPaste, true);
    return () => document.removeEventListener('paste', onWindowPaste, true);
  }, [importPastedSvg]);

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

  const activeFill = useMemo(() => parseColorToRgba(activePath.fill, { r: 88, g: 166, b: 255, a: 1 }), [activePath.fill]);
  const activeStroke = useMemo(
    () => parseColorToRgba(activePath.stroke, { r: 121, g: 192, b: 255, a: 1 }),
    [activePath.stroke],
  );
  const activeCurrentColor = useMemo(
    () => parseColorToRgba(currentColorValue, { r: 255, g: 255, b: 255, a: 1 }),
    [currentColorValue],
  );

  const strokeControlDisabled =
    pathSelected && selectedPaths.length
      ? selectedPaths.every((i) => (shapes[i]?.strokeWidth ?? 0) <= 0)
      : activePath.strokeWidth <= 0;
  const canDeletePath = pathSelected && shapes.length > 0;

  const allPointIndicesForPath = (pathIndex: number) => {
    const all = shapes[pathIndex]?.points.map((_, i) => i) ?? [];
    return all.length ? all : [0];
  };

  const enterTransformMode = () => {
    setPenHover(null);
  };

  const clearSelection = () => {
    setPathSelected(false);
    setSelectedPaths([]);
    setSelectedPoints([]);
    setPenHover(null);
  };

  const isInsideTransformFrame = (pos: Vec) => {
    if (!transformFrame) return false;
    const unrot = rotateAround(pos, { x: transformFrame.cx, y: transformFrame.cy }, -transformFrame.angle);
    const eps = 0.0001;
    return (
      unrot.x >= transformFrame.minX - eps &&
      unrot.x <= transformFrame.maxX + eps &&
      unrot.y >= transformFrame.minY - eps &&
      unrot.y <= transformFrame.maxY + eps
    );
  };

  const isOverSelectedStroke = (pos: Vec) => {
    if (!pathSelected) return false;
    const baseThreshold = 8 / zoom;
    return transformTargetIndices.some((idx) => {
      const shape = shapes[idx];
      if (!shape) return false;
      const seg = closestSegment(shape, pos);
      if (!seg) return false;
      const strokeW = shape.strokeWidthExplicit ? Math.max(0, shape.strokeWidth) : 0;
      const threshold = Math.max(baseThreshold, strokeW / 2 + 2 / zoom);
      return seg.distance <= threshold;
    });
  };

  const shapeHasVisibleFill = (shape: PathShape) => {
    if (shape.opacityExplicit && shape.opacity <= 0) return false;
    const fillValue = shape.fillExplicit ? shape.fill : 'currentColor';
    const fillLower = fillValue.trim().toLowerCase();
    if (!fillLower || fillLower === 'none' || fillLower === 'transparent') return false;
    const parsed = parseColorToRgba(fillValue, { r: 0, g: 0, b: 0, a: 1 });
    return parsed.a > 0.001;
  };

  const isPointInPolygon = (p: Vec, vertices: Vec[]) => {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
      const xi = vertices[i].x;
      const yi = vertices[i].y;
      const xj = vertices[j].x;
      const yj = vertices[j].y;
      const intersects = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + Number.EPSILON) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  };

  const isOverSelectedFill = (pos: Vec) => {
    if (!pathSelected) return false;
    return transformTargetIndices.some((idx) => {
      const shape = shapes[idx];
      if (!shape || !shapeHasVisibleFill(shape)) return false;
      if (shape.points.length < 3) return false;
      const bounds = getPathBounds(shape.points);
      if (!bounds) return false;
      if (pos.x < bounds.minX || pos.x > bounds.maxX || pos.y < bounds.minY || pos.y > bounds.maxY) return false;

      const segmentCount = shape.closed ? shape.points.length : shape.points.length - 1;
      if (segmentCount < 2) return false;

      const polygon: Vec[] = [];
      for (let seg = 0; seg < segmentCount; seg += 1) {
        const a = shape.points[seg];
        const b = shape.points[(seg + 1) % shape.points.length];
        if (!a || !b) continue;
        if (seg === 0) polygon.push(a.p);
        const c1 = a.out ?? a.p;
        const c2 = b.in ?? b.p;
        if (a.out || b.in) {
          for (let s = 1; s <= 12; s += 1) {
            polygon.push(sampleBezier(a.p, c1, c2, b.p, s / 12));
          }
        } else {
          polygon.push(b.p);
        }
      }

      if (!shape.closed) polygon.push(shape.points[0].p);
      if (polygon.length < 3) return false;
      return isPointInPolygon(pos, polygon);
    });
  };

  const startMoveDrag = (startPos: Vec, pointerId: number, target: SVGGeometryElement) => {
    pushUndo();
    setDrag({
      kind: 'move',
      pathIndex: selectedPath,
      affectAll: transformAllPaths || selectedPaths.length > 1,
      targetPathIndices: transformTargetIndices,
      startPos,
      baseShapes: cloneShapes(shapes),
    });
    target.setPointerCapture(pointerId);
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
    enterTransformMode();
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

  const saveSvgFile = async () => {
    await saveSvgCodeToFile(codeText, 'drawing.svg');
  };

  const openSvg = async () => {
    const svgText = await openSvgTextFromFile();
    if (!svgText) return;
    applyCodeText(svgText, true);
  };

  const clearDocument = () => {
    pushUndo();
    const defaults = cloneShapes(DEFAULT_DOCUMENT.shapes);
    setShapes(defaults);
    setSelectedPath(0);
    setSelectedPaths([0]);
    setPathSelected(true);
    setSelectedPoint(0);
    setSelectedPoints([0]);
    setTransformAllPaths(false);
    setDocViewBox(DEFAULT_DOCUMENT.viewBox);
    setZoom(DEFAULT_ZOOM);
    setViewOrigin(getCenteredOriginForShapes(defaults, DEFAULT_ZOOM));
    setCodeError('');
    setTool('select');
    setPenHover(null);
  };

  const formatCodeInPane = () => {
    const formatted = formatSvgCode(codeText);
    if (!formatted) return;
    setCodeText(formatted);
    applyCodeText(formatted, true);
  };

  function importPastedSvg(pasted: string): boolean {
    if (!pasted) return false;
    if (!applyCodeText(pasted, true)) return false;
    setCodeText(pasted);
    if (codeTextareaRef.current) {
      codeTextareaRef.current.focus();
      const pos = pasted.length;
      codeTextareaRef.current.setSelectionRange(pos, pos);
    }
    return true;
  }

  const openPathMetaMenu = (pathIndex: number, rect: DOMRect) => {
    const path = shapes[pathIndex];
    if (!path) return;
    setPathMetaMenu(createPathMetaMenuState(pathIndex, path, rect, { width: window.innerWidth, height: window.innerHeight }));
    setShapeMenu(null);
    setLucideMenu(null);
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
    setStyleMenu(createStyleMenuState(kind, rect, { width: window.innerWidth, height: window.innerHeight }));
    setShapeMenu(null);
    setLucideMenu(null);
    setPathMetaMenu(null);
    setCurrentColorMenu(null);
  };

  const openCurrentColorMenu = (rect: DOMRect) => {
    setCurrentColorMenu(createCurrentColorMenuState(rect, { width: window.innerWidth, height: window.innerHeight }));
    setShapeMenu(null);
    setLucideMenu(null);
    setStyleMenu(null);
    setPathMetaMenu(null);
  };

  const openLucideMenu = (rect: DOMRect) => {
    setLucideMenu(createLucideMenuState(rect, { width: window.innerWidth, height: window.innerHeight }));
    setShapeMenu(null);
    setStyleMenu(null);
    setPathMetaMenu(null);
    setCurrentColorMenu(null);
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
    if (!pathMetaMenu && !shapeMenu && !lucideMenu && !styleMenu && !currentColorMenu) return;
    const onWindowPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const inPathMeta = !!pathMetaMenuRef.current?.contains(target);
      const inShapeMenu = !!shapeMenuRef.current?.contains(target);
      const inLucideMenu = !!lucideMenuRef.current?.contains(target);
      const inStyleMenu = !!styleMenuRef.current?.contains(target);
      const inCurrentColorMenu = !!currentColorMenuRef.current?.contains(target);
      const inShapeTrigger = !!shapeTriggerRef.current?.contains(target);
      const inLucideTrigger = !!lucideTriggerRef.current?.contains(target);
      const inStyleTrigger = styleTriggerRefs.current.some((el) => !!el?.contains(target));
      const inCurrentColorTrigger = !!currentColorTriggerRef.current?.contains(target);
      if (
        inPathMeta ||
        inShapeMenu ||
        inLucideMenu ||
        inStyleMenu ||
        inCurrentColorMenu ||
        inShapeTrigger ||
        inLucideTrigger ||
        inStyleTrigger ||
        inCurrentColorTrigger
      ) {
        return;
      }
      setPathMetaMenu(null);
      setShapeMenu(null);
      setLucideMenu(null);
      setStyleMenu(null);
      setCurrentColorMenu(null);
      setConfirmDeletePath(false);
    };
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    return () => window.removeEventListener('pointerdown', onWindowPointerDown, true);
  }, [pathMetaMenu, shapeMenu, lucideMenu, styleMenu, currentColorMenu]);

  return (
    <div
      ref={appShellRef}
      className="app-shell"
      onPointerDown={() => {
        setPathMetaMenu(null);
        setShapeMenu(null);
        setLucideMenu(null);
        setStyleMenu(null);
        setCurrentColorMenu(null);
        setConfirmDeletePath(false);
      }}
    >
      <TopBar
        onOpenAbout={() => setAboutOpen(true)}
        onOpenSvg={() => {
          void openSvg();
        }}
        onSaveSvg={() => {
          void saveSvgFile();
        }}
        onCopySvg={copySvgCode}
        onClearSvg={clearDocument}
        copied={copied}
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
          shapeTriggerRef={shapeTriggerRef}
          lucideTriggerRef={lucideTriggerRef}
          onOpenShapeMenu={(rect) => {
            setShapeMenu(createShapeMenuState(rect, { width: window.innerWidth, height: window.innerHeight }));
            setLucideMenu(null);
            setStyleMenu(null);
            setPathMetaMenu(null);
            setCurrentColorMenu(null);
          }}
          onOpenLucideMenu={openLucideMenu}
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
            renderCurrentColorControl={
              <button
                ref={currentColorTriggerRef}
                className={`control-btn text-sm current-color-btn${currentColorMenu ? ' active' : ''}`}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentColorMenu) setCurrentColorMenu(null);
                  else openCurrentColorMenu(e.currentTarget.getBoundingClientRect());
                }}
              >
                <span className="current-color-swatch" style={{ background: currentColorValue }} />
                <span>currentColor</span>
              </button>
            }
          />

          <EditorCanvas
            editorSvgRef={editorSvgRef}
            spaceDown={spaceDown}
            tool={tool}
            viewOrigin={viewOrigin}
            zoom={zoom}
            currentColorValue={currentColorValue}
            setDrag={setDrag}
            onCanvasMove={onCanvasMove}
            setCursorZoomFocus={setCursorZoomFocus}
            setPenHover={setPenHover}
            onCanvasClick={onCanvasClick}
            clearSelection={clearSelection}
            toLocal={toLocal}
            marquee={marquee}
            setMarquee={setMarquee}
            shapes={shapes}
            allPointIndicesForPath={allPointIndicesForPath}
            setPathSelected={setPathSelected}
            setSelectedPaths={setSelectedPaths}
            setSelectedPath={setSelectedPath}
            setSelectedPoint={setSelectedPoint}
            setSelectedPoints={setSelectedPoints}
            enterTransformMode={enterTransformMode}
            showViewBox={showViewBox}
            editorDocViewBox={editorDocViewBox}
            docViewBox={docViewBox}
            pathDs={pathDs}
            pathSelected={pathSelected}
            selectedPaths={selectedPaths}
            activePath={activePath}
            selectedPoints={selectedPoints}
            selectedPoint={selectedPoint}
            penHover={penHover}
            pushUndo={pushUndo}
            selectedPath={selectedPath}
            transformFrame={transformFrame}
            transformAllPaths={transformAllPaths}
            transformTargetIndices={transformTargetIndices}
            isInsideTransformFrame={isInsideTransformFrame}
            isOverSelectedStroke={isOverSelectedStroke}
            isOverSelectedFill={isOverSelectedFill}
            startMoveDrag={startMoveDrag}
            drag={drag}
          />
        </section>

        <CodePane
          copied={copied}
          onCopy={copySvgCode}
          onFormatCode={formatCodeInPane}
          codeOverlayRef={codeOverlayRef}
          codeTextareaRef={codeTextareaRef}
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
            const pasted = extractSvgFromClipboard(e.clipboardData);
            if (importPastedSvg(pasted)) {
              e.preventDefault();
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

        <PathPane
          shapes={shapes.map((shape) => ({ id: shape.id, name: shape.name, svgId: shape.svgId }))}
          pathSelected={pathSelected}
          selectedPath={selectedPath}
          pathMetaMenuPathIndex={pathMetaMenu?.pathIndex ?? null}
          onPathDoubleClick={(pathIndex, rect) => openPathMetaMenu(pathIndex, rect)}
          onPathClick={(pathIndex) => {
            const all = allPointIndicesForPath(pathIndex);
            setPathSelected(true);
            setSelectedPath(pathIndex);
            setSelectedPaths([pathIndex]);
            setSelectedPoint(all[0]);
            setSelectedPoints(all);
            enterTransformMode();
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
      </div>
      <PathMetaMenu
        menu={pathMetaMenu}
        menuRef={pathMetaMenuRef}
        onClose={() => setPathMetaMenu(null)}
        onApply={applyPathMetaMenu}
        onIdValueChange={(next) => setPathMetaMenu((m) => (m ? { ...m, idValue: next } : m))}
        onClassValueChange={(next) => setPathMetaMenu((m) => (m ? { ...m, classValue: next } : m))}
      />
      <ShapeMenu menu={shapeMenu} menuRef={shapeMenuRef} onAddPreset={addPresetPath} />
      <LucideIconMenu menu={lucideMenu} menuRef={lucideMenuRef} onClose={() => setLucideMenu(null)} onSelectIcon={addLucideIcon} />
      <StyleMenu
        menu={styleMenu}
        menuRef={styleMenuRef}
        activeFillHex={rgbaToHexAlpha(activeFill)}
        activeStrokeHex={rgbaToHexAlpha(activeStroke)}
        strokeWidth={activePath.strokeWidth}
        opacityPercent={Math.round((activePath.opacityExplicit ? activePath.opacity : 1) * 100)}
        strokeControlDisabled={strokeControlDisabled}
        onFillChange={(hex) =>
          updateActiveStyle({
            fill: rgbaToCss(parseColorToRgba(hex, activeFill)),
          })
        }
        onSetFillCurrentColor={() => updateActiveStyle({ fill: 'currentColor' })}
        onStrokeChange={(hex) =>
          updateActiveStyle({
            stroke: rgbaToCss(parseColorToRgba(hex, activeStroke)),
          })
        }
        onStrokeWidthChange={(next) => updateActiveStyle({ strokeWidth: Math.round(next) })}
        onSetStrokeCurrentColor={() => updateActiveStyle({ stroke: 'currentColor' })}
        onOpacityChange={(next) => updateActiveStyle({ opacity: clamp(Math.round(next) / 100, 0, 1) })}
      />
      <CurrentColorMenu
        menu={currentColorMenu}
        menuRef={currentColorMenuRef}
        colorHex={rgbaToHexAlpha(activeCurrentColor)}
        onColorChange={(hex) => setCurrentColorValue(rgbaToCss(parseColorToRgba(hex, activeCurrentColor)))}
      />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
};

export default App;
export { highlightSelectedPathHtml, parseSvg, pathIndexAtCaret, serializeSvg };
