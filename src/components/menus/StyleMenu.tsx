import { HexAlphaColorPicker } from 'react-colorful';
import { type RefObject } from 'react';
import { SliderInline } from '../../lib/editor-core';
import { type StyleMenuState } from '../../types/app-types';

type Props = {
  menu: StyleMenuState | null;
  menuRef: RefObject<HTMLDivElement | null>;
  activeFillHex: string;
  activeStrokeHex: string;
  strokeWidth: number;
  opacityPercent: number;
  strokeControlDisabled: boolean;
  onFillChange: (hex: string) => void;
  onSetFillCurrentColor: () => void;
  onStrokeChange: (hex: string) => void;
  onStrokeWidthChange: (next: number) => void;
  onSetStrokeCurrentColor: () => void;
  onOpacityChange: (next: number) => void;
};

const StyleMenu = ({
  menu,
  menuRef,
  activeFillHex,
  activeStrokeHex,
  strokeWidth,
  opacityPercent,
  strokeControlDisabled,
  onFillChange,
  onSetFillCurrentColor,
  onStrokeChange,
  onStrokeWidthChange,
  onSetStrokeCurrentColor,
  onOpacityChange,
}: Props) => {
  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="style-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {menu.kind !== 'opacity' ? <h3>{menu.kind === 'fill' ? 'Fill' : 'Stroke'}</h3> : null}

      {menu.kind === 'fill' ? (
        <>
          <label>
            <HexAlphaColorPicker color={activeFillHex} onChange={onFillChange} />
          </label>
          <button className="control-btn text-sm style-menu-current-color-btn" type="button" onClick={onSetFillCurrentColor}>
            set as currentColor
          </button>
        </>
      ) : null}

      {menu.kind === 'stroke' ? (
        <>
          <label>
            <div className={strokeControlDisabled ? 'picker-wrap disabled-stroke' : 'picker-wrap'}>
              <HexAlphaColorPicker color={activeStrokeHex} onChange={onStrokeChange} />
            </div>
          </label>
          <label>
            <SliderInline label="Width" min={0} max={50} value={strokeWidth} unit="px" onChange={onStrokeWidthChange} />
          </label>
          <button className="control-btn text-sm style-menu-current-color-btn" type="button" onClick={onSetStrokeCurrentColor}>
            set as currentColor
          </button>
        </>
      ) : null}

      {menu.kind === 'opacity' ? (
        <label>
          <SliderInline label="Opacity" min={0} max={100} value={opacityPercent} unit="%" onChange={onOpacityChange} />
        </label>
      ) : null}
    </div>
  );
};

export default StyleMenu;
