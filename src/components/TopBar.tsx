import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

type Props = {
  onOpenAbout: () => void;
  onOpenSvg: () => void;
  onSaveSvg: () => void;
  onCopySvg: () => void;
  onClearSvg: () => void;
  copied: boolean;
};

const TopBar = ({ onOpenAbout, onOpenSvg, onSaveSvg, onCopySvg, onClearSvg, copied }: Props) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      }

      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === 'o') {
        e.preventDefault();
        onOpenSvg();
      }
      if ((e.metaKey || e.ctrlKey) && key === 's') {
        e.preventDefault();
        onSaveSvg();
      }
    };

    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [onOpenSvg, onSaveSvg]);

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
          ref={openButtonRef}
          type="button"
          className="control-btn text-sm"
          onClick={onOpenSvg}
          title="Open SVG file"
        >
          Open
        </button>
        <button
          ref={saveButtonRef}
          className="control-btn text-sm"
          type="button"
          onClick={onSaveSvg}
          title="Save SVG file"
        >
          Save
        </button>
        <button className="control-btn text-sm" type="button" onClick={onCopySvg} title={copied ? 'Copied' : 'Copy SVG code'}>
          {copied ? 'Copied' : 'Copy SVG'}
        </button>
        <div className="topbar-confirm-slot">
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
      </div>
    </header>
  );
};

export default TopBar;
