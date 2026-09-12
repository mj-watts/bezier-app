import { Circle, Cross, Diamond, Moon, Square, Star, Triangle } from 'lucide-react';
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
      <button className="shape-preset-btn" title="Square" onClick={() => onAddPreset('square')}>
        <Square />
      </button>
      <button className="shape-preset-btn" title="Diamond" onClick={() => onAddPreset('diamond')}>
        <Diamond />
      </button>
      <button className="shape-preset-btn" title="Triangle" onClick={() => onAddPreset('triangle')}>
        <Triangle />
      </button>
      <button className="shape-preset-btn" title="Cross" onClick={() => onAddPreset('cross')}><Cross /></button>
      <button className="shape-preset-btn" title="Moon" onClick={() => onAddPreset('moon')}><Moon /></button>
      <button className="shape-preset-btn" title="Star" onClick={() => onAddPreset('star')}><Star /></button>
    </div>
  );
};

export default ShapeMenu;
