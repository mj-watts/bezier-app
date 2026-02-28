import { type StylePanel, type Vec } from '../lib/editor-core';

export type PaneDrag = { startX: number; startWidth: number };
export type CursorZoomFocus = { nx: number; ny: number };
export type MarqueeState = { start: Vec; current: Vec };

export type PathMetaMenuState = {
  pathIndex: number;
  x: number;
  y: number;
  idValue: string;
  classValue: string;
};

export type StyleMenuState = { kind: StylePanel; x: number; y: number };
export type ShapeMenuState = { x: number; y: number };
export type CurrentColorMenuState = { x: number; y: number };

export type TransformFrame = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  angle: number;
};
