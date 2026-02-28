import { HexAlphaColorPicker } from 'react-colorful';
import { type RefObject } from 'react';
import { type CurrentColorMenuState } from '../../types/app-types';

type Props = {
  menu: CurrentColorMenuState | null;
  menuRef: RefObject<HTMLDivElement | null>;
  colorHex: string;
  onColorChange: (hex: string) => void;
};

const CurrentColorMenu = ({ menu, menuRef, colorHex, onColorChange }: Props) => {
  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="style-menu current-color-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <h3>currentColor</h3>
      <label>
        <HexAlphaColorPicker color={colorHex} onChange={onColorChange} />
      </label>
    </div>
  );
};

export default CurrentColorMenu;
