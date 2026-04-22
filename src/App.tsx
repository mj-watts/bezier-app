import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import AboutModal from './components/AboutModal';
import CodePane from './components/CodePane';
import ControlsBar from './components/ControlsBar';
import EditorCanvas from './components/editor/EditorCanvas';
import PathPane, { type PathPaneRow } from './components/PathPane';
import ToolDock from './components/ToolDock';
import TopBar from './components/TopBar';
import CurrentColorMenu from './components/menus/CurrentColorMenu';
import GroupMetaMenu from './components/menus/GroupMetaMenu';
import LucideIconMenu from './components/menus/LucideIconMenu';
import PathMetaMenu from './components/menus/PathMetaMenu';
import ShapeMenu from './components/menus/ShapeMenu';
import StyleMenu from './components/menus/StyleMenu';
import {
  type CurrentColorMenuState,
  type CursorZoomFocus,
  type GroupMetaMenuState,
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
  createGroupMetaMenuState,
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
const MAX_GROUP_NESTING = 3;

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
  const [groupMetaMenu, setGroupMetaMenu] = useState<GroupMetaMenuState | null>(null);
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
  const groupMetaMenuRef = useRef<HTMLFormElement | null>(null);
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

  const sortUniquePathIndices = (indices: number[]) =>
    [...new Set(indices)].filter((idx) => idx >= 0 && idx < shapes.length).sort((a, b) => a - b);

  const sameIndexSet = (a: number[], b: number[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  const hasChainPrefix = (chain: string[], prefix: string[]) => {
    if (prefix.length > chain.length) return false;
    for (let i = 0; i < prefix.length; i += 1) {
      if (chain[i] !== prefix[i]) return false;
    }
    return true;
  };

  const groupMembersForPrefix = (prefix: string[]) =>
    sortUniquePathIndices(shapes.map((shape, i) => (hasChainPrefix(shape.groupChain ?? [], prefix) ? i : -1)).filter((i) => i >= 0));

  const groupPrefixAtDepth = (pathIndex: number, depthFromNearest: number): string[] | null => {
    const chain = shapes[pathIndex]?.groupChain ?? [];
    if (!chain.length) return null;
    const level = chain.length - 1 - depthFromNearest;
    if (level < 0 || level >= chain.length) return null;
    return chain.slice(0, level + 1);
  };

  const groupMembersAtDepth = (pathIndex: number, depthFromNearest: number): number[] | null => {
    const base = shapes[pathIndex];
    if (!base) return null;
    const chain = base.groupChain ?? [];
    if (!chain.length) return null;
    const level = chain.length - 1 - depthFromNearest;
    if (level < 0 || level >= chain.length) return null;
    const groupId = chain[level];
    const prefix = chain.slice(0, level + 1);
    const members = shapes
      .map((shape, i) => ({ shape, i }))
      .filter(({ shape }) => {
        if ((shape.groupChain?.length ?? 0) <= level) return false;
        if (shape.groupChain[level] !== groupId) return false;
        for (let k = 0; k <= level; k += 1) {
          if (shape.groupChain[k] !== prefix[k]) return false;
        }
        return true;
      })
      .map(({ i }) => i);
    return members.length ? sortUniquePathIndices(members) : null;
  };

  const currentGroupDepthFromSelection = (pathIndex: number) => {
    const chainLen = shapes[pathIndex]?.groupChain?.length ?? 0;
    if (!chainLen) return -1;
    const selected = sortUniquePathIndices(selectedPaths.length ? selectedPaths : [pathIndex]);
    let matched = -1;
    for (let depth = 0; depth < chainLen; depth += 1) {
      const members = groupMembersAtDepth(pathIndex, depth);
      if (!members) continue;
      if (sameIndexSet(selected, members)) matched = depth;
    }
    return matched;
  };

  const selectGroupAtDepth = (pathIndex: number, depthFromNearest: number) => {
    const members = groupMembersAtDepth(pathIndex, depthFromNearest);
    if (!members || !members.length) return false;
    const anchorPath = members.includes(pathIndex) ? pathIndex : members[0];
    const all = allPointIndicesForPath(anchorPath);
    setPathSelected(true);
    setSelectedPath(anchorPath);
    setSelectedPaths(members);
    setSelectedPoint(all[0]);
    setSelectedPoints(all);
    enterTransformMode();
    return true;
  };

  const selectNextGroupForPath = (pathIndex: number) => {
    const chainLen = shapes[pathIndex]?.groupChain?.length ?? 0;
    if (!chainLen) return false;
    const currentDepth = currentGroupDepthFromSelection(pathIndex);
    const nextDepth = currentDepth + 1;
    if (nextDepth < 0 || nextDepth >= chainLen) return false;
    return selectGroupAtDepth(pathIndex, nextDepth);
  };

  const ungroupSelection = () => {
    if (!pathSelected || !shapes.length) return false;
    const basePathIndex = selectedPath;
    const chain = shapes[basePathIndex]?.groupChain ?? [];
    if (!chain.length) return false;

    const sortedSelection = sortUniquePathIndices(selectedPaths.length ? selectedPaths : [basePathIndex]);
    const exactDepth = currentGroupDepthFromSelection(basePathIndex);
    const targetPrefix = exactDepth >= 0 ? groupPrefixAtDepth(basePathIndex, exactDepth) : groupPrefixAtDepth(basePathIndex, 0);
    if (!targetPrefix?.length) return false;

    const removeAt = targetPrefix.length - 1;
    const targetMembers = groupMembersForPrefix(targetPrefix);
    if (!targetMembers.length) return false;
    const memberSet = new Set(targetMembers);

    pushUndo();
    setShapes((curr) =>
      curr.map((shape, i) => {
        if (!memberSet.has(i)) return shape;
        const currentChain = shape.groupChain ?? [];
        const currentClassChain = shape.groupClassChain ?? [];
        if (!hasChainPrefix(currentChain, targetPrefix)) return shape;
        if (removeAt >= currentChain.length) return shape;
        return {
          ...shape,
          groupChain: [...currentChain.slice(0, removeAt), ...currentChain.slice(removeAt + 1)],
          groupClassChain: [...currentClassChain.slice(0, removeAt), ...currentClassChain.slice(removeAt + 1)],
        };
      }),
    );

    const nextSelection = exactDepth >= 0 ? targetMembers : sortedSelection;
    const nextPrimary = nextSelection.includes(basePathIndex) ? basePathIndex : nextSelection[0];
    const all = allPointIndicesForPath(nextPrimary);
    setPathSelected(true);
    setSelectedPath(nextPrimary);
    setSelectedPaths(nextSelection);
    setSelectedPoint(all[0]);
    setSelectedPoints(all);
    enterTransformMode();
    return true;
  };

  const movePath = (
    fromPathIndex: number,
    toPathIndex: number,
    placement: 'before' | 'after',
    nextGroupChain: string[],
    nextGroupClassChain: string[],
  ) => {
    if (fromPathIndex < 0 || toPathIndex < 0 || fromPathIndex >= shapes.length || toPathIndex >= shapes.length) return;

    const original = shapes.map((_, i) => i);
    const moved = original[fromPathIndex];
    if (moved === undefined) return;
    const without = original.filter((i) => i !== moved);
    let insertAt = placement === 'before' ? toPathIndex : toPathIndex + 1;
    if (fromPathIndex < insertAt) insertAt -= 1;
    insertAt = clamp(insertAt, 0, without.length);
    without.splice(insertAt, 0, moved);

    const oldToNew = new Map<number, number>();
    for (let newIndex = 0; newIndex < without.length; newIndex += 1) {
      oldToNew.set(without[newIndex], newIndex);
    }

    pushUndo();
    setShapes((curr) => {
      const nextCurr = curr.map((shape, i) =>
        i === fromPathIndex ? { ...shape, groupChain: [...nextGroupChain], groupClassChain: [...nextGroupClassChain] } : shape,
      );
      return without.map((oldIndex) => nextCurr[oldIndex]).filter((shape): shape is PathShape => !!shape);
    });
    setSelectedPath((prev) => oldToNew.get(prev) ?? prev);
    setSelectedPaths((prev) => [...new Set(prev.map((i) => oldToNew.get(i) ?? i))].sort((a, b) => a - b));
    setPathMetaMenu((menu) => (menu ? { ...menu, pathIndex: oldToNew.get(menu.pathIndex) ?? menu.pathIndex } : menu));
    setGroupMetaMenu((menu) => (menu ? { ...menu, pathIndex: oldToNew.get(menu.pathIndex) ?? menu.pathIndex } : menu));
  };

  const reorderPaths = (fromPathIndex: number, toPathIndex: number, placement: 'before' | 'after') => {
    const targetParent = [...(shapes[toPathIndex]?.groupChain ?? [])];
    const targetParentClass = [...(shapes[toPathIndex]?.groupClassChain ?? [])];
    movePath(fromPathIndex, toPathIndex, placement, targetParent, targetParentClass);
  };

  const dropPathOnGroup = (fromPathIndex: number, targetPathIndex: number, groupDepth: number) => {
    const chain = shapes[targetPathIndex]?.groupChain ?? [];
    if (groupDepth < 0 || groupDepth >= chain.length) return;
    const targetPrefix = chain.slice(0, groupDepth + 1);
    const targetClassPrefix = (shapes[targetPathIndex]?.groupClassChain ?? []).slice(0, groupDepth + 1);
    const groupMembers = shapes
      .map((shape, i) => (hasChainPrefix(shape.groupChain ?? [], targetPrefix) ? i : -1))
      .filter((i) => i >= 0 && i !== fromPathIndex);
    const anchor = groupMembers.length ? groupMembers[groupMembers.length - 1] : targetPathIndex;
    movePath(fromPathIndex, anchor, 'after', targetPrefix, targetClassPrefix);
  };

  const dropPathOnUngrouped = (fromPathIndex: number) => {
    if (fromPathIndex < 0 || fromPathIndex >= shapes.length) return;
    const ungrouped = shapes.map((shape, i) => (!(shape.groupChain?.length ?? 0) ? i : -1)).filter((i) => i >= 0 && i !== fromPathIndex);
    if (ungrouped.length) {
      movePath(fromPathIndex, ungrouped[0], 'before', [], []);
      return;
    }
    const anchor = clamp(fromPathIndex, 0, shapes.length - 1);
    movePath(fromPathIndex, anchor, 'after', [], []);
  };

  const groupSelectedPaths = () => {
    const baseSelection = sortUniquePathIndices(pathSelected && selectedPaths.length ? selectedPaths : [selectedPath]);
    if (baseSelection.length < 2) return false;

    const selectedSet = new Set(baseSelection);
    const chains = baseSelection.map((idx) => shapes[idx]?.groupChain ?? []);
    const firstChain = chains[0] ?? [];
    let prefixLen = firstChain.length;
    for (let c = 1; c < chains.length; c += 1) {
      prefixLen = Math.min(prefixLen, chains[c].length);
      for (let i = 0; i < prefixLen; i += 1) {
        if (chains[c][i] !== firstChain[i]) {
          prefixLen = i;
          break;
        }
      }
    }
    const parentPrefix = firstChain.slice(0, prefixLen);
    if (parentPrefix.length >= MAX_GROUP_NESTING) return false;
    const exceedsNestingLimit = baseSelection.some((idx) => (shapes[idx]?.groupChain?.length ?? 0) + 1 > MAX_GROUP_NESTING);
    if (exceedsNestingLimit) return false;

    // Prevent redundant nested groups when the exact selection is already one group.
    const seen = new Set<string>();
    for (const shape of shapes) {
      const chain = shape.groupChain ?? [];
      for (let depth = 0; depth < chain.length; depth += 1) {
        const prefix = chain.slice(0, depth + 1);
        const key = prefix.join('\u0001');
        if (seen.has(key)) continue;
        seen.add(key);
        const members = groupMembersForPrefix(prefix);
        if (sameIndexSet(members, baseSelection)) return false;
      }
    }

    const usedGroupIds = new Set(shapes.flatMap((shape) => shape.groupChain ?? []));
    let nextGroupIndex = 1;
    let groupId = `group-${nextGroupIndex}`;
    while (usedGroupIds.has(groupId)) {
      nextGroupIndex += 1;
      groupId = `group-${nextGroupIndex}`;
    }

    pushUndo();
    setShapes((curr) => {
      const insertAt = parentPrefix.length;
      const mapped = curr.map((shape, i) => {
        if (!selectedSet.has(i)) return shape;
        const chain = shape.groupChain ?? [];
        const classChain = shape.groupClassChain ?? [];
        return {
          ...shape,
          groupChain: [...chain.slice(0, insertAt), groupId, ...chain.slice(insertAt)],
          groupClassChain: [...classChain.slice(0, insertAt), '', ...classChain.slice(insertAt)],
        };
      });

      // Make grouped siblings contiguous so serializer emits a single <g id="..."> block.
      const inScope = mapped
        .map((shape, i) => (hasChainPrefix(shape.groupChain ?? [], parentPrefix) ? i : -1))
        .filter((i) => i >= 0);
      const selectedScope = inScope.filter((i) => selectedSet.has(i));
      const unselectedScope = inScope.filter((i) => !selectedSet.has(i));
      const reorderedScope = [...selectedScope, ...unselectedScope];
      const next = [...mapped];
      const oldToNew = new Map<number, number>();
      for (let i = 0; i < inScope.length; i += 1) {
        const targetIndex = inScope[i];
        const sourceIndex = reorderedScope[i];
        next[targetIndex] = mapped[sourceIndex];
        oldToNew.set(sourceIndex, targetIndex);
      }

      const remappedSelection = [...new Set(baseSelection.map((i) => oldToNew.get(i) ?? i))].sort((a, b) => a - b);
      const nextPrimary = oldToNew.get(baseSelection[0]) ?? baseSelection[0];
      const all = next[nextPrimary]?.points.map((_, i) => i) ?? [0];
      setPathSelected(true);
      setSelectedPath(nextPrimary);
      setSelectedPaths(remappedSelection);
      setSelectedPoint(all[0]);
      setSelectedPoints(all);
      return next;
    });
    enterTransformMode();
    return true;
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
      if (key === 'v' && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
      if ((e.metaKey || e.ctrlKey) && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelectedPaths();
      }
      if (key === 'enter') {
        if (!pathSelected) return;
        e.preventDefault();
        selectNextGroupForPath(selectedPath);
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
    setGroupMetaMenu(null);
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

  const openGroupMetaMenu = (pathIndex: number, depth: number, rect: DOMRect) => {
    const path = shapes[pathIndex];
    if (!path || !path.groupChain?.[depth]) return;
    setGroupMetaMenu(createGroupMetaMenuState(pathIndex, depth, path, rect, { width: window.innerWidth, height: window.innerHeight }));
    setPathMetaMenu(null);
    setShapeMenu(null);
    setLucideMenu(null);
    setStyleMenu(null);
    setCurrentColorMenu(null);
  };

  const applyGroupMetaMenu = () => {
    if (!groupMetaMenu) return;
    const sourceShape = shapes[groupMetaMenu.pathIndex];
    const chain = sourceShape?.groupChain ?? [];
    const classChain = sourceShape?.groupClassChain ?? [];
    const oldId = chain[groupMetaMenu.depth];
    const oldClass = classChain[groupMetaMenu.depth] ?? '';
    const newId = groupMetaMenu.idValue.trim();
    const newClass = groupMetaMenu.classValue.trim();
    if (!oldId || !newId || (oldId === newId && oldClass === newClass)) {
      setGroupMetaMenu(null);
      return;
    }
    const prefix = chain.slice(0, groupMetaMenu.depth);
    pushUndo();
    setShapes((curr) =>
      curr.map((shape) => {
        const nextChain = shape.groupChain ?? [];
        const nextClassChain = shape.groupClassChain ?? [];
        if ((nextChain.length ?? 0) <= groupMetaMenu.depth) return shape;
        if (!hasChainPrefix(nextChain, prefix)) return shape;
        if (nextChain[groupMetaMenu.depth] !== oldId) return shape;
        if ((nextClassChain[groupMetaMenu.depth] ?? '') !== oldClass) return shape;
        const replaced = [...nextChain];
        const replacedClasses = [...nextClassChain];
        replaced[groupMetaMenu.depth] = newId;
        replacedClasses[groupMetaMenu.depth] = newClass;
        return { ...shape, groupChain: replaced, groupClassChain: replacedClasses };
      }),
    );
    setGroupMetaMenu(null);
  };

  const selectGroupAtAbsoluteDepth = (pathIndex: number, groupDepth: number) => {
    const chainLen = shapes[pathIndex]?.groupChain?.length ?? 0;
    if (!chainLen) return false;
    if (groupDepth < 0 || groupDepth >= chainLen) return false;
    return selectGroupAtDepth(pathIndex, chainLen - 1 - groupDepth);
  };

  const pathPaneRows = useMemo<PathPaneRow[]>(() => {
    const rows: PathPaneRow[] = [];
    const selectedSetSorted = pathSelected ? sortUniquePathIndices(selectedPaths.length ? selectedPaths : [selectedPath]) : [];
    const groupedIndices = shapes
      .map((shape, i) => (shape.groupChain?.length ? i : -1))
      .filter((i) => i >= 0)
      .reverse();
    const ungroupedIndices = shapes
      .map((shape, i) => (!(shape.groupChain?.length ?? 0) ? i : -1))
      .filter((i) => i >= 0)
      .reverse();

    const appendRows = (indices: number[], includeGroups: boolean) => {
      const openGroups: string[] = [];
      for (const i of indices) {
        const shape = shapes[i];
        if (!shape) continue;
        const chain = shape.groupChain ?? [];

        if (includeGroups) {
          let common = 0;
          while (common < openGroups.length && common < chain.length && openGroups[common] === chain[common]) common += 1;
          openGroups.length = common;

          for (let depth = common; depth < chain.length; depth += 1) {
            const prefix = chain.slice(0, depth + 1);
            const members = groupMembersForPrefix(prefix);
            rows.push({
              key: `group:${prefix.join('\u0001')}`,
              kind: 'group',
              depth,
              label: chain[depth],
              pathIndex: i,
              groupDepth: depth,
              selected: pathSelected && sameIndexSet(selectedSetSorted, members),
            });
            openGroups.push(chain[depth]);
          }
        }

        rows.push({
          key: `path:${shape.id}`,
          kind: 'path',
          depth: includeGroups ? chain.length : 0,
          pathIndex: i,
          label: shape.svgId.trim() || shape.name,
          selected: pathSelected && (selectedPath === i || selectedPaths.includes(i)),
          menuOpen: pathMetaMenu?.pathIndex === i,
        });
      }
    };

    appendRows(groupedIndices, true);
    if (groupedIndices.length && ungroupedIndices.length) {
      rows.push({ key: 'divider:grouped-ungrouped', kind: 'divider' });
    }
    appendRows(ungroupedIndices, false);

    return rows;
  }, [shapes, pathSelected, selectedPaths, selectedPath, pathMetaMenu]);

  const openStyleMenu = (kind: StylePanel, rect: DOMRect) => {
    setStyleMenu(createStyleMenuState(kind, rect, { width: window.innerWidth, height: window.innerHeight }));
    setShapeMenu(null);
    setLucideMenu(null);
    setPathMetaMenu(null);
    setGroupMetaMenu(null);
    setCurrentColorMenu(null);
  };

  const openCurrentColorMenu = (rect: DOMRect) => {
    setCurrentColorMenu(createCurrentColorMenuState(rect, { width: window.innerWidth, height: window.innerHeight }));
    setShapeMenu(null);
    setLucideMenu(null);
    setStyleMenu(null);
    setPathMetaMenu(null);
    setGroupMetaMenu(null);
  };

  const openLucideMenu = (rect: DOMRect) => {
    setLucideMenu(createLucideMenuState(rect, { width: window.innerWidth, height: window.innerHeight }));
    setShapeMenu(null);
    setStyleMenu(null);
    setPathMetaMenu(null);
    setGroupMetaMenu(null);
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
    if (!pathMetaMenu && !groupMetaMenu && !shapeMenu && !lucideMenu && !styleMenu && !currentColorMenu) return;
    const onWindowPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const inPathMeta = !!pathMetaMenuRef.current?.contains(target);
      const inGroupMeta = !!groupMetaMenuRef.current?.contains(target);
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
        inGroupMeta ||
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
      setGroupMetaMenu(null);
      setShapeMenu(null);
      setLucideMenu(null);
      setStyleMenu(null);
      setCurrentColorMenu(null);
      setConfirmDeletePath(false);
    };
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    return () => window.removeEventListener('pointerdown', onWindowPointerDown, true);
  }, [pathMetaMenu, groupMetaMenu, shapeMenu, lucideMenu, styleMenu, currentColorMenu]);

  return (
    <div
      ref={appShellRef}
      className="app-shell"
      onPointerDown={() => {
        setPathMetaMenu(null);
        setGroupMetaMenu(null);
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
            setGroupMetaMenu(null);
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
            onPathDoubleClick={(pathIndex) => {
              selectNextGroupForPath(pathIndex);
            }}
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
          rows={pathPaneRows}
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
          onGroupRenameClick={(pathIndex, groupDepth, rect) => openGroupMetaMenu(pathIndex, groupDepth, rect)}
          onGroupDoubleClick={(pathIndex, groupDepth) => {
            selectGroupAtAbsoluteDepth(pathIndex, groupDepth);
          }}
          onReorderPath={reorderPaths}
          onDropPathOnGroup={dropPathOnGroup}
          onDropPathOnUngrouped={dropPathOnUngrouped}
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
      <GroupMetaMenu
        menu={groupMetaMenu}
        menuRef={groupMetaMenuRef}
        onClose={() => setGroupMetaMenu(null)}
        onApply={applyGroupMetaMenu}
        onIdValueChange={(next) => setGroupMetaMenu((m) => (m ? { ...m, idValue: next } : m))}
        onClassValueChange={(next) => setGroupMetaMenu((m) => (m ? { ...m, classValue: next } : m))}
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
