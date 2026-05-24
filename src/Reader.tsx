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

interface Props {
  bookId: string;
  bookTitle: string;
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
  const [error, setError] = useState<string | null>(null);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const bumpUI = useCallback(() => {
    setShowUI(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setShowUI(false);
    }, 3000);
  }, []);

  // Keep UI visible while settings panel is open
  useEffect(() => {
    if (showSettings) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setShowUI(true);
    }
  }, [showSettings]);

  // Init epub.js
  useEffect(() => {
    if (!containerRef.current) return;

    const book = ePub(`epub://localhost/${bookId}`);
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

    rendition.on("relocated", (location: any) => {
      if (!location?.start?.cfi) return;
      book.locations.generate(1200).then(() => {
        const pct = book.locations.percentageFromCfi(location.start.cfi) ?? 0;
        setProgress(Math.round(pct * 100));
      });
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handlePrev = useCallback(() => rendRef.current?.prev(), []);
  const handleNext = useCallback(() => rendRef.current?.next(), []);

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
        <span className="reader-book-title" data-tauri-drag-region>
          {bookTitle}
        </span>
        <button
          className="reader-aa-btn"
          onClick={(e) => {
            e.stopPropagation();
            setShowSettings((s) => !s);
          }}
        >
          Aa
        </button>
      </div>

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
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
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
