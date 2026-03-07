import { type RefObject } from 'react';
import { type GroupMetaMenuState } from '../../types/app-types';

type Props = {
  menu: GroupMetaMenuState | null;
  menuRef: RefObject<HTMLFormElement | null>;
  onClose: () => void;
  onApply: () => void;
  onIdValueChange: (next: string) => void;
};

const GroupMetaMenu = ({ menu, menuRef, onClose, onApply, onIdValueChange }: Props) => {
  if (!menu) return null;

  return (
    <form
      ref={menuRef}
      className="path-meta-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <h3>Group Attributes</h3>
      <label>
        ID
        <input autoFocus value={menu.idValue} onChange={(e) => onIdValueChange(e.target.value)} placeholder="group id" />
      </label>
      <div className="path-meta-actions">
        <button className="control-btn" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="control-btn" type="submit">
          Save
        </button>
      </div>
    </form>
  );
};

export default GroupMetaMenu;
