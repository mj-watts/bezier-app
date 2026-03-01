import { Circle, Diamond, Square, Triangle } from 'lucide-react';
import { type RefObject } from 'react';
import { type ShapePreset } from '../../lib/editor-core';
import { type ShapeMenuState } from '../../types/app-types';

type Props = {
  menu: ShapeMenuState | null;
  menuRef: RefObject<HTMLDivElement | null>;
  onAddPreset: (preset: ShapePreset) => void;
};

const ShapeMenu = ({ menu, menuRef, onAddPreset }: Props) => {
  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="shape-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button className="shape-preset-btn" title="Circle" onClick={() => onAddPreset('circle')}>
        <Circle />
      </button>
      <button className="shape-preset-btn" title="Square" onClick={() => onAddPreset('roundedSquare')}>
        <Square />
      </button>
      <button className="shape-preset-btn" title="Curved Diamond" onClick={() => onAddPreset('roundedDiamond')}>
        <Diamond />
      </button>
      <button className="shape-preset-btn" title="Curved Triangle" onClick={() => onAddPreset('roundedTriangle')}>
        <Triangle />
      </button>
    </div>
  );
};

export default ShapeMenu;
