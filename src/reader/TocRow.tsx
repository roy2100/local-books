import type { NavItem } from "../types/foliate";

interface Props {
  item: NavItem;
  depth: number;
  activeHref: string;
  onNavigate: (href: string) => void;
}

export function TocRow({ item, depth, activeHref, onNavigate }: Props) {
  const isActive = item.href.split("#")[0] === activeHref;
  return (
    <>
      <button
        className={`toc-item ${isActive ? "toc-item--active" : ""}`}
        style={{ paddingLeft: `${20 + depth * 18}px` }}
        onClick={() => onNavigate(item.href)}
        title={item.label.trim()}
      >
        <span className="toc-label">{item.label.trim()}</span>
      </button>
      {item.subitems?.map((sub, i) => (
        <TocRow
          key={i}
          item={sub}
          depth={depth + 1}
          activeHref={activeHref}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}
