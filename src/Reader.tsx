import { useEffect, useRef, useState, useCallback } from "react";
import ePub from "epubjs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ALargeSmall,
  ChevronLeft,
  ChevronRight,
  TableOfContents,
} from "lucide-react";
import "./Reader.css";

export type Theme = "light" | "sepia" | "dark";

interface NavItem {
  id: string;
  href: string;
  label: string;
  subitems?: NavItem[];
  parent?: string;
}

interface Props {
  bookId: string;
  bookTitle: string;
}

const BG: Record<Theme, string> = {
  light: "#faf9f6",
  sepia: "#f6f0e6",
  dark: "#1c1c1e",
};

export function makeThemeCSS(theme: Theme, fontSize: number): string {
  const text = { light: "#1a1a1a", sepia: "#3b2d1f", dark: "#dcdcdc" }[theme];
  const link = { light: "#1a73e8", sepia: "#7a5c00", dark: "#7eb8f7" }[theme];
  const scrollThumb = {
    light: "rgba(0,0,0,0.18)",
    sepia: "rgba(80,50,20,0.2)",
    dark: "rgba(255,255,255,0.18)",
  }[theme];
  const scrollThumbHover = {
    light: "rgba(0,0,0,0.32)",
    sepia: "rgba(80,50,20,0.36)",
    dark: "rgba(255,255,255,0.32)",
  }[theme];
  return `
    html, body { background: ${BG[theme]} !important; color: ${text} !important; }
    body {
      font-size: ${fontSize}px !important;
      font-family: -apple-system, 'PingFang SC', 'Noto Sans CJK SC', Georgia, serif !important;
      line-height: 1.85 !important;
      max-width: 700px !important;
      margin: 0 auto !important;
      padding: 48px 32px 80px !important;
      word-break: break-word !important;
    }
    a { color: inherit !important; }
    a[epub\\:type~="noteref"],
    a[epub\\:type~="footnote"],
    a[role~="doc-noteref"],
    a[role~="doc-footnote"],
    a.noteref,
    a.footnote,
    a.ref_mi,
    a[class*="noteref" i],
    a[class*="footnote" i],
    a[href^="#fn"],
    a[href^="#footnote"],
    a[href*="#fn"],
    a[href*="#footnote"],
    a[href*="footnote"],
    a[href*="noteref"] {
      color: ${link} !important;
    }
    img { max-width: 100% !important; height: auto !important; }
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: ${scrollThumb};
      border-radius: 3px;
      transition: background 0.2s;
    }
    ::-webkit-scrollbar-thumb:hover { background: ${scrollThumbHover}; }
  `;
}

function TocRow({
  item,
  depth,
  activeHref,
  onNavigate,
}: {
  item: NavItem;
  depth: number;
  activeHref: string;
  onNavigate: (href: string) => void;
}) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Book = ReturnType<typeof ePub>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rendition = ReturnType<Book["renderTo"]>;

export default function Reader({ bookId, bookTitle }: Props) {
  const [toc, setToc] = useState<NavItem[]>([]);
  const [currentHref, setCurrentHref] = useState("");
  const [progress, setProgress] = useState(0);
  const [theme, setTheme] = useState<Theme>("light");
  const [fontSize, setFontSize] = useState(18);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const prevBlobUrlRef = useRef<string>("");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // themeRef 让 init effect 读取最新主题，同时不把 theme/fontSize 加入 [bookId] deps
  const themeRef = useRef({ theme, fontSize });
  useEffect(() => { themeRef.current = { theme, fontSize }; }, [theme, fontSize]);

  // epub.js initialization
  useEffect(() => {
    if (!containerRef.current) return;
    setLoading(true);
    setError(null);
    setToc([]);
    setProgress(0);
    setCurrentHref("");

    const book = ePub(`epub://localhost/${bookId}/book.epub`);
    bookRef.current = book;

    const rendition = book.renderTo(containerRef.current, {
      flow: "scrolled-continuous",
      width: "100%",
      height: "100%",
    });
    renditionRef.current = rendition;

    // 立即应用初始主题（applyTheme 的 useEffect 触发时 renditionRef 可能还是 null）
    const { theme: t0, fontSize: fs0 } = themeRef.current;
    const initCss = makeThemeCSS(t0, fs0);
    const initBlob = new Blob([initCss], { type: "text/css" });
    const initUrl = URL.createObjectURL(initBlob);
    prevBlobUrlRef.current = initUrl;
    rendition.themes.register("reader", initUrl);
    rendition.themes.select("reader");

    rendition.display().then(() => {
      setLoading(false);
    }).catch((e: unknown) => {
      setError(String(e));
      setLoading(false);
    });

    book.ready.then(async () => {
      setToc(book.navigation.toc as NavItem[]);
      await book.locations.generate(1600);
    }).catch(() => {
      // TOC/locations 失败不影响阅读，忽略
    });

    rendition.on("relocated", (loc: { start: { href: string; percentage: number; cfi: string } }) => {
      setCurrentHref(loc.start.href);
      setProgress(Math.round((loc.start.percentage ?? 0) * 100));
    });

    book.on("openFailed", (e: unknown) => {
      setError(`无法打开书籍：${String(e)}`);
      setLoading(false);
    });

    return () => {
      if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
      book.destroy();
      bookRef.current = null;
      renditionRef.current = null;
    };
  }, [bookId]);

  // Apply theme CSS via rendition.themes
  const applyTheme = useCallback(() => {
    if (!renditionRef.current) return;
    if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
    const css = makeThemeCSS(theme, fontSize);
    const blob = new Blob([css], { type: "text/css" });
    const url = URL.createObjectURL(blob);
    prevBlobUrlRef.current = url;
    renditionRef.current.themes.register("reader", url);
    renditionRef.current.themes.select("reader");
  }, [theme, fontSize]);

  useEffect(() => { applyTheme(); }, [theme, fontSize, applyTheme]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        renditionRef.current?.next();
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        renditionRef.current?.prev();
      }
      if (e.key === "Escape") { setShowToc(false); setShowSettings(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-hide UI chrome
  const bumpUI = useCallback(() => {
    setShowUI(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowUI(false), 3000);
  }, []);

  useEffect(() => {
    if (showSettings || showToc) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setShowUI(true);
    }
  }, [showSettings, showToc]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const handlePrev = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const handleNext = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const navigateTo = useCallback((href: string) => {
    renditionRef.current?.display(href);
    setShowToc(false);
  }, []);

  return (
    <div
      className={`reader reader--${theme}`}
      style={{ background: BG[theme] }}
      onMouseMove={bumpUI}
    >
      {/* Drag strip — above iframe so startDragging() works */}
      <div
        className="reader-drag-strip"
        onMouseDown={(e) => {
          if (e.button === 0) getCurrentWindow().startDragging();
        }}
      />

      {/* Top bar */}
      <div className={`reader-topbar ${showUI ? "visible" : ""}`} data-tauri-drag-region>
        {toc.length > 0 && (
          <button
            className={`reader-toc-btn ${showToc ? "active" : ""}`}
            onClick={(e) => { e.stopPropagation(); setShowToc((s) => !s); setShowSettings(false); }}
            title="目录"
          >
            <TableOfContents aria-hidden="true" />
          </button>
        )}
        <span className="reader-book-title" data-tauri-drag-region>{bookTitle}</span>
        <button
          className="reader-aa-btn"
          onClick={(e) => { e.stopPropagation(); setShowSettings((s) => !s); setShowToc(false); }}
          title="阅读设置"
        >
          <ALargeSmall aria-hidden="true" />
        </button>
      </div>

      {/* TOC panel */}
      <div className={`toc-panel toc-panel--${theme} ${showToc ? "open" : ""}`}>
        <div className="toc-header">目录</div>
        <div className="toc-list">
          {toc.map((item, i) => (
            <TocRow
              key={i}
              item={item}
              depth={0}
              activeHref={currentHref}
              onNavigate={navigateTo}
            />
          ))}
        </div>
      </div>
      {showToc && <div className="toc-backdrop" onClick={() => setShowToc(false)} />}

      {/* Settings panel */}
      {showSettings && (
        <>
          <div className="settings-backdrop" onClick={() => setShowSettings(false)} />
          <div className={`reader-settings reader-settings--${theme}`}>
            <div className="settings-row">
              <span className="settings-label">字体大小</span>
              <div className="settings-stepper">
                <button onClick={() => setFontSize((s) => Math.max(12, s - 2))} className="stepper-btn">A−</button>
                <span className="stepper-val">{fontSize}</span>
                <button onClick={() => setFontSize((s) => Math.min(36, s + 2))} className="stepper-btn">A+</button>
              </div>
            </div>
            <div className="settings-divider" />
            <div className="settings-row">
              <span className="settings-label">主题</span>
              <div className="theme-chips">
                {(["light", "sepia", "dark"] as Theme[]).map((t) => (
                  <button
                    key={t}
                    className={`theme-chip theme-chip--${t} ${theme === t ? "active" : ""}`}
                    onClick={() => setTheme(t)}
                    title={t === "light" ? "白色" : t === "sepia" ? "米色" : "深色"}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Prev chapter */}
      <button
        className={`page-nav page-nav--prev ${showUI ? "visible" : ""}`}
        onClick={handlePrev}
        aria-label="上一章"
      >
        <ChevronLeft aria-hidden="true" />
      </button>

      {/* Chapter container */}
      <div className="reader-stage">
        {loading && <div className="reader-loading">加载中…</div>}
        <div ref={containerRef} className="reader-frame" />
      </div>

      {/* Next chapter */}
      <button
        className={`page-nav page-nav--next ${showUI ? "visible" : ""}`}
        onClick={handleNext}
        aria-label="下一章"
      >
        <ChevronRight aria-hidden="true" />
      </button>

      {/* Progress bar */}
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
