import { useEffect, useRef, useState, useCallback } from "react";
import ePub from "epubjs";
import "./Reader.css";

type Theme = "light" | "sepia" | "dark";

const THEMES: Record<Theme, Record<string, Record<string, string>>> = {
  light: {
    body: {
      background: "#faf9f6",
      color: "#1a1a1a",
      "font-family": "-apple-system, 'Helvetica Neue', serif",
      "line-height": "1.85",
    },
  },
  sepia: {
    body: {
      background: "#f6f0e6",
      color: "#3b2d1f",
      "font-family": "-apple-system, 'Helvetica Neue', serif",
      "line-height": "1.85",
    },
  },
  dark: {
    body: {
      background: "#1c1c1e",
      color: "#dcdcdc",
      "font-family": "-apple-system, 'Helvetica Neue', serif",
      "line-height": "1.85",
    },
  },
};

const BG: Record<Theme, string> = {
  light: "#f0ede6",
  sepia: "#e8dfc8",
  dark: "#111113",
};

interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

interface Props {
  bookId: string;
  bookTitle: string;
}

// Strip fragment (#anchor) and resolve to basename for comparison
function hrefBase(href: string): string {
  return href.split("#")[0].split("/").pop() ?? href.split("#")[0];
}

function TocRow({
  item,
  depth,
  activeBase,
  onNavigate,
}: {
  item: TocItem;
  depth: number;
  activeBase: string;
  onNavigate: (href: string) => void;
}) {
  const isActive = hrefBase(item.href) === activeBase;
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
      {item.subitems?.map((sub) => (
        <TocRow
          key={sub.id || sub.href}
          item={sub}
          depth={depth + 1}
          activeBase={activeBase}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

export default function Reader({ bookId, bookTitle }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendRef = useRef<any>(null);
  const bookRef = useRef<any>(null);

  const [progress, setProgress] = useState(0);
  const [showUI, setShowUI] = useState(true);
  const [theme, setTheme] = useState<Theme>("light");
  const [fontSize, setFontSize] = useState(18);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeHrefBase, setActiveHrefBase] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const bumpUI = useCallback(() => {
    setShowUI(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setShowUI(false);
    }, 3000);
  }, []);

  // Keep UI visible while panels are open
  useEffect(() => {
    if (showSettings || showToc) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setShowUI(true);
    }
  }, [showSettings, showToc]);

  // Init epub.js
  useEffect(() => {
    if (!containerRef.current) return;

    // Append .epub so epub.js's determineType() treats this as a binary download
    // (without extension it falls back to "directory" mode and makes individual file requests)
    const book = ePub(`epub://localhost/${bookId}/book.epub`);
    bookRef.current = book;

    const rendition = book.renderTo(containerRef.current, {
      flow: "paginated",
      spread: "none",
      width: "100%",
      height: "100%",
    });
    rendRef.current = rendition;

    rendition.themes.register("theme", THEMES[theme]);
    rendition.themes.select("theme");
    rendition.themes.fontSize(`${fontSize}px`);

    rendition.display().catch((e: any) => {
      setError(`无法打开书籍：${e?.message ?? e}`);
    });

    // Load TOC after navigation data is ready
    (book as any).loaded.navigation.then((nav: any) => {
      if (nav?.toc) setToc(nav.toc);
    });

    rendition.on("relocated", (location: any) => {
      if (!location?.start) return;

      // Track active TOC entry
      if (location.start.href) {
        setActiveHrefBase(hrefBase(location.start.href));
      }

      // Update progress
      if (location.start.cfi) {
        book.locations.generate(1200).then(() => {
          const pct = book.locations.percentageFromCfi(location.start.cfi) ?? 0;
          setProgress(Math.round(pct * 100));
        });
      }
    });

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      book.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // Theme change
  useEffect(() => {
    const rend = rendRef.current;
    if (!rend) return;
    rend.themes.register("theme", THEMES[theme]);
    rend.themes.select("theme");
  }, [theme]);

  // Font size change
  useEffect(() => {
    rendRef.current?.themes.fontSize(`${fontSize}px`);
  }, [fontSize]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!rendRef.current) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        rendRef.current.next();
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        rendRef.current.prev();
      }
      if (e.key === "Escape") {
        setShowToc(false);
        setShowSettings(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handlePrev = useCallback(() => rendRef.current?.prev(), []);
  const handleNext = useCallback(() => rendRef.current?.next(), []);

  const navigateTo = useCallback((href: string) => {
    rendRef.current?.display(href);
    setShowToc(false);
  }, []);

  const toggleToc = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowToc((s) => !s);
    setShowSettings(false);
  }, []);

  const toggleSettings = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSettings((s) => !s);
    setShowToc(false);
  }, []);

  return (
    <div
      className={`reader reader--${theme}`}
      style={{ background: BG[theme] }}
      onMouseMove={bumpUI}
    >
      {/* Top overlay bar */}
      <div
        className={`reader-topbar ${showUI ? "visible" : ""}`}
        data-tauri-drag-region
      >
        <button
          className="reader-close-btn"
          onClick={() => window.close()}
          title="关闭"
        >
          ‹
        </button>

        {toc.length > 0 && (
          <button
            className={`reader-toc-btn ${showToc ? "active" : ""}`}
            onClick={toggleToc}
            title="目录"
          >
            <TocIcon />
          </button>
        )}

        <span className="reader-book-title" data-tauri-drag-region>
          {bookTitle}
        </span>

        <button className="reader-aa-btn" onClick={toggleSettings}>
          Aa
        </button>
      </div>

      {/* TOC panel */}
      <div className={`toc-panel toc-panel--${theme} ${showToc ? "open" : ""}`}>
        <div className="toc-header">目录</div>
        <div className="toc-list">
          {toc.map((item) => (
            <TocRow
              key={item.id || item.href}
              item={item}
              depth={0}
              activeBase={activeHrefBase}
              onNavigate={navigateTo}
            />
          ))}
        </div>
      </div>
      {showToc && (
        <div className="toc-backdrop" onClick={() => setShowToc(false)} />
      )}

      {/* Settings panel */}
      {showSettings && (
        <>
          <div
            className="settings-backdrop"
            onClick={() => setShowSettings(false)}
          />
          <div className={`reader-settings reader-settings--${theme}`}>
            <div className="settings-row">
              <span className="settings-label">字体大小</span>
              <div className="settings-stepper">
                <button
                  onClick={() => setFontSize((s) => Math.max(12, s - 2))}
                  className="stepper-btn"
                >
                  A−
                </button>
                <span className="stepper-val">{fontSize}</span>
                <button
                  onClick={() => setFontSize((s) => Math.min(36, s + 2))}
                  className="stepper-btn"
                >
                  A+
                </button>
              </div>
            </div>
            <div className="settings-divider" />
            <div className="settings-row">
              <span className="settings-label">主题</span>
              <div className="theme-chips">
                {(["light", "sepia", "dark"] as Theme[]).map((t) => (
                  <button
                    key={t}
                    className={`theme-chip theme-chip--${t} ${
                      theme === t ? "active" : ""
                    }`}
                    onClick={() => setTheme(t)}
                    title={
                      t === "light" ? "白色" : t === "sepia" ? "米色" : "深色"
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Page nav — left zone */}
      <button
        className={`page-nav page-nav--prev ${showUI ? "visible" : ""}`}
        onClick={handlePrev}
        aria-label="上一页"
      >
        ‹
      </button>

      {/* epub.js render target */}
      <div className="reader-stage">
        <div ref={containerRef} className="reader-content" />
      </div>

      {/* Page nav — right zone */}
      <button
        className={`page-nav page-nav--next ${showUI ? "visible" : ""}`}
        onClick={handleNext}
        aria-label="下一页"
      >
        ›
      </button>

      {/* Bottom bar */}
      <div className={`reader-bottombar ${showUI ? "visible" : ""}`}>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-label">{progress}%</span>
      </div>

      {error && (
        <div className="reader-error">
          <p>{error}</p>
          <button onClick={() => window.close()}>关闭</button>
        </div>
      )}
    </div>
  );
}

function TocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="2.5" width="5" height="1.5" rx="0.75" />
      <rect x="1" y="7.25" width="5" height="1.5" rx="0.75" />
      <rect x="1" y="12" width="5" height="1.5" rx="0.75" />
      <rect x="8" y="2.5" width="7" height="1.5" rx="0.75" />
      <rect x="8" y="7.25" width="7" height="1.5" rx="0.75" />
      <rect x="8" y="12" width="7" height="1.5" rx="0.75" />
    </svg>
  );
}
