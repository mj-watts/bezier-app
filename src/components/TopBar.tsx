import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

type Props = {
  onOpenAbout: () => void;
  onSaveSvg: (filename: string) => void;
  onCopySvg: () => void;
  onClearSvg: () => void;
  copied: boolean;
};

const TopBar = ({ onOpenAbout, onSaveSvg, onCopySvg, onClearSvg, copied }: Props) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const [saveMenu, setSaveMenu] = useState<{ x: number; y: number; fileName: string } | null>(null);
  const saveTriggerRef = useRef<HTMLButtonElement | null>(null);
  const saveMenuRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!saveMenu) return;
    const onWindowPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (saveMenuRef.current?.contains(target) || saveTriggerRef.current?.contains(target)) return;
      setSaveMenu(null);
    };
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSaveMenu(null);
    };
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onWindowPointerDown, true);
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [saveMenu]);

  return (
    <header className="topbar">
      <button className="brand-trigger" type="button" onClick={onOpenAbout} title="About Bz">
        <span className="brand-mark">
          <span className="brand-b">B</span>
          <span className="brand-insert">é</span>
          <span className="brand-z">z</span>
          <span className="brand-tail">ier</span>
        </span>
      </button>
      <div className="topbar-actions">
        <button
          ref={saveTriggerRef}
          className={`control-btn text-sm${saveMenu ? ' active' : ''}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (saveMenu) {
              setSaveMenu(null);
              return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            const menuW = 260;
            const menuH = 120;
            const pad = 8;
            const x = Math.max(pad, Math.min(rect.left, window.innerWidth - menuW - pad));
            const y = Math.max(pad, Math.min(rect.bottom + 6, window.innerHeight - menuH - pad));
            setSaveMenu({ x, y, fileName: 'drawing.svg' });
          }}
          title="Save SVG file"
        >
          Save
        </button>
        <button className="control-btn text-sm" type="button" onClick={onCopySvg} title={copied ? 'Copied' : 'Copy SVG code'}>
          {copied ? 'Copied' : 'Copy SVG'}
        </button>
        {!confirmClear ? (
          <button className="control-btn text-sm confirm-text" type="button" onClick={() => setConfirmClear(true)} title="Clear document">
            Clear
          </button>
        ) : (
          <div className="topbar-inline-confirm" role="group" aria-label="Confirm clear">
            <button
              className="icon-btn confirm-text"
              type="button"
              onClick={() => {
                onClearSvg();
                setConfirmClear(false);
              }}
              title="Confirm clear"
            >
              <Check />
            </button>
            <button className="icon-btn confirm-no" type="button" onClick={() => setConfirmClear(false)} title="Cancel clear">
              <X />
            </button>
          </div>
        )}
      </div>
      {saveMenu ? (
        <form
          ref={saveMenuRef}
          className="save-menu"
          style={{ left: `${saveMenu.x}px`, top: `${saveMenu.y}px` }}
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            onSaveSvg(saveMenu.fileName.trim() || 'drawing.svg');
            setSaveMenu(null);
          }}
        >
          <h3>Save SVG</h3>
          <label>
            File name
            <input
              value={saveMenu.fileName}
              onChange={(e) => setSaveMenu((m) => (m ? { ...m, fileName: e.target.value } : m))}
              placeholder="drawing.svg"
              autoFocus
            />
          </label>
          <div className="path-meta-actions">
            <button className="control-btn" type="submit">
              Save
            </button>
          </div>
        </form>
      ) : null}
    </header>
  );
};

export default TopBar;
