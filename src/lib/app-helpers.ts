import {
  WORLD_LIMIT,
  clamp,
  formatSvgCode,
  getPathBounds,
  height,
  type PathShape,
  type StylePanel,
  type Vec,
  width,
} from './editor-core';
import {
  type CurrentColorMenuState,
  type CursorZoomFocus,
  type PathMetaMenuState,
  type ShapeMenuState,
  type StyleMenuState,
} from '../types/app-types';

const MENU_PAD = 8;

export const markGeometryDirty = (path: PathShape): PathShape =>
  path.geometryDirty ? path : { ...path, geometryDirty: true };

export const clampOriginForZoom = (origin: Vec, z: number): Vec => {
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

export const getCenteredOriginForShapes = (shapes: PathShape[], z: number): Vec => {
  const bounds = getPathBounds(shapes.flatMap((shape) => shape.points));
  const cx = bounds?.cx ?? width / 2;
  const cy = bounds?.cy ?? height / 2;
  return clampOriginForZoom(
    {
      x: cx - width / (2 * z),
      y: cy - height / (2 * z),
    },
    z,
  );
};

type ZoomFocusArgs = {
  selectedPathBounds: { cx: number; cy: number } | null;
  cursorZoomFocus: CursorZoomFocus | null;
  viewOrigin: Vec;
  zoom: number;
};

export const computeZoomFocusFromSelection = ({ selectedPathBounds, cursorZoomFocus, viewOrigin, zoom }: ZoomFocusArgs): CursorZoomFocus => {
  const focusX = selectedPathBounds?.cx ?? (cursorZoomFocus ? viewOrigin.x + cursorZoomFocus.nx * (width / zoom) : width / 2);
  const focusY = selectedPathBounds?.cy ?? (cursorZoomFocus ? viewOrigin.y + cursorZoomFocus.ny * (height / zoom) : height / 2);
  return {
    nx: clamp((focusX - viewOrigin.x) / (width / zoom), 0, 1),
    ny: clamp((focusY - viewOrigin.y) / (height / zoom), 0, 1),
  };
};

export const toLocalPoint = (clientX: number, clientY: number, target: SVGSVGElement, viewOrigin: Vec, zoom: number): Vec => {
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

const clampMenuX = (x: number, menuW: number, viewportWidth: number) =>
  clamp(x, MENU_PAD, Math.max(MENU_PAD, viewportWidth - menuW - MENU_PAD));

const clampMenuY = (y: number, menuH: number, viewportHeight: number) =>
  clamp(y, MENU_PAD, Math.max(MENU_PAD, viewportHeight - menuH - MENU_PAD));

type ViewportSize = { width: number; height: number };

export const createPathMetaMenuState = (
  pathIndex: number,
  path: Pick<PathShape, 'svgId' | 'svgClass'>,
  rect: DOMRect,
  viewport: ViewportSize,
): PathMetaMenuState => ({
  pathIndex,
  x: clampMenuX(rect.left, 260, viewport.width),
  y: clampMenuY(rect.bottom + 6, 168, viewport.height),
  idValue: path.svgId,
  classValue: path.svgClass,
});

export const createStyleMenuState = (kind: StylePanel, rect: DOMRect, viewport: ViewportSize): StyleMenuState => ({
  kind,
  x: clampMenuX(rect.right + 8, 250, viewport.width),
  y: clampMenuY(rect.top, kind === 'stroke' ? 198 : kind === 'opacity' ? 120 : 164, viewport.height),
});

export const createCurrentColorMenuState = (rect: DOMRect, viewport: ViewportSize): CurrentColorMenuState => ({
  x: clampMenuX(rect.left, 250, viewport.width),
  y: clampMenuY(rect.bottom + 6, 198, viewport.height),
});

export const createShapeMenuState = (rect: DOMRect, viewport: ViewportSize): ShapeMenuState => ({
  x: clampMenuX(rect.left, 208, viewport.width),
  y: clampMenuY(rect.bottom + 6, 58, viewport.height),
});

export const saveSvgFile = (codeText: string, filename: string) => {
  const content = formatSvgCode(codeText) || codeText;
  if (!content.trim()) return;

  const trimmed = filename.trim() || 'drawing.svg';
  const safeName = /\.svg$/i.test(trimmed) ? trimmed : `${trimmed}.svg`;
  const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
