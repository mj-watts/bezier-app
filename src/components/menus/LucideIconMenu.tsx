import { useEffect, useMemo, useState, type RefObject } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { lucideIconNames } from '../../lib/lucide-icons';
import { type LucideMenuState } from '../../types/app-types';

type Props = {
  menu: LucideMenuState | null;
  menuRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSelectIcon: (iconName: string) => void;
};

const MAX_VISIBLE_RESULTS = 120;

const toLabel = (name: string) =>
  name
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

const LucideIconMenu = ({ menu, menuRef, onClose, onSelectIcon }: Props) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!menu) return;
    setQuery('');
  }, [menu]);

  const normalized = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalized) return lucideIconNames;
    const q = normalized.replace(/\s+/g, '-');
    return lucideIconNames.filter((name) => name.includes(q));
  }, [normalized]);
  const visible = matches.slice(0, MAX_VISIBLE_RESULTS);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="lucide-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <input
        autoFocus
        className="lucide-menu-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons..."
      />
      <div className="lucide-menu-meta">{`${matches.length} result${matches.length === 1 ? '' : 's'}`}</div>
      <div className="lucide-menu-list">
        {visible.map((name) => (
          <button key={name} className="lucide-menu-item" onClick={() => onSelectIcon(name)} title={name}>
            <span>{toLabel(name)}</span>
            <DynamicIcon name={name} size={20} aria-hidden="true" />
          </button>
        ))}
        {!visible.length ? <div className="lucide-menu-empty">No icons found.</div> : null}
      </div>
    </div>
  );
};

export default LucideIconMenu;
