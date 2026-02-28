type Props = {
  onOpenAbout: () => void;
};

const TopBar = ({ onOpenAbout }: Props) => {
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
    </header>
  );
};

export default TopBar;
