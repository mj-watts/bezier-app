import { type RefObject } from 'react';
import { SliderInline } from '../../lib/editor-core';

type Props = {
  menu: { x: number; y: number } | null;
  menuRef: RefObject<HTMLDivElement | null>;
  threshold: number;
  onThresholdChange: (value: number) => void;
  pathSelected: boolean;
  onSmooth: () => void;
  onSimplify: () => void;
  onClose: () => void;
};

export default function SmoothMenu({ menu, menuRef, threshold, onThresholdChange, pathSelected, onSmooth, onSimplify, onClose }: Props) {
  if (!menu) return null;
  return (
    <div ref={menuRef} className="smooth-menu" role="dialog" aria-label="Smooth and simplify"
      style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
      <button autoFocus className="control-btn text-sm" onClick={onSmooth}>{pathSelected ? 'Smooth Path' : 'Smooth SVG'}</button>
      <SliderInline label="Simplify threshold" min={2} max={40} value={threshold} onChange={onThresholdChange} />
      <button className="control-btn text-sm" onClick={onSimplify}>{pathSelected ? 'Simplify Path' : 'Simplify SVG'}</button>
    </div>
  );
}
