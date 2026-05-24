import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./Reader.css";

type Theme = "light" | "sepia" | "dark";

interface SpineItem { href: string; id: string; }
interface TocEntry { label: string; href: string; children: TocEntry[]; }
interface BookContents { spine: SpineItem[]; toc: TocEntry[]; }

interface Props {
  bookId: string;
  bookTitle: string;
}

const BG: Record<Theme, string> = {
  light: "#faf9f6",
  sepia: "#f6f0e6",
  dark: "#1c1c1e",
};

function makeThemeCSS(theme: Theme, fontSize: number): string {
  const text = { light: "#1a1a1a", sepia: "#3b2d1f", dark: "#dcdcdc" }[theme];
  const link = { light: "#1a73e8", sepia: "#7a5c00", dark: "#7eb8f7" }[theme];
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
    a { color: ${link} !important; }
    img { max-width: 100% !important; height: auto !important; }
    * { box-sizing: border-box; }
  `;
}

function TocRow({
  item,
  depth,
  activeHref,
  onNavigate,
}: {
  item: TocEntry;
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
      {item.children?.map((sub, i) => (
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

export default function Reader({ bookId, bookTitle }: Props) {
  const [contents, setContents] = useState<BookContents | null>(null);
  const [spineIndex, setSpineIndex] = useState(0);
  const [pendingAnchor, setPendingAnchor] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [fontSize, setFontSize] = useState(18);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Keep a ref so postMessage callbacks always see current values
  const themeRef = useRef({ theme, fontSize });
  useEffect(() => { themeRef.current = { theme, fontSize }; }, [theme, fontSize]);

  // Load spine + TOC from Rust
  useEffect(() => {
    setLoading(true);
    invoke<BookContents>("get_book_contents", { bookId })
      .then((c) => { setContents(c); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [bookId]);

  // Apply theme CSS into the iframe via postMessage
  const applyTheme = useCallback(() => {
    const { theme, fontSize } = themeRef.current;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "epub-theme", css: makeThemeCSS(theme, fontSize) },
      "*"
    );
  }, []);

  useEffect(() => { applyTheme(); }, [theme, fontSize, applyTheme]);

  // Listen for messages from the injected script inside the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.type === "epub-ready") { applyTheme(); return; }
      if (e.data.type !== "epub-navigate") return;

      const raw: string = e.data.href ?? "";
      try {
        const url = new URL(raw);
        // pathname = "/{bookId}/{filePath}"
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length < 2) return;
        const filePath = parts.slice(1).join("/");
        const anchor = url.hash.slice(1);

        setContents((prev) => {
          if (!prev) return prev;
          const idx = prev.spine.findIndex((s) => s.href === filePath);
          if (idx >= 0) {
            setPendingAnchor(anchor);
            setSpineIndex(idx);
          }
          return prev;
        });
      } catch {
        // ignore malformed URLs
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [applyTheme]);

  // Keyboard navigation
  useEffect(() => {
    const total = contents?.spine.length ?? 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setPendingAnchor("");
        setSpineIndex((i) => Math.min(i + 1, total - 1));
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setPendingAnchor("");
        setSpineIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Escape") { setShowToc(false); setShowSettings(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contents]);

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
    setPendingAnchor("");
    setSpineIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleNext = useCallback(() => {
    setPendingAnchor("");
    setSpineIndex((i) => Math.min(i + 1, (contents?.spine.length ?? 1) - 1));
  }, [contents]);

  const navigateTo = useCallback((href: string) => {
    const [hrefBase, anchor] = href.split("#");
    setContents((prev) => {
      if (!prev) return prev;
      const idx = prev.spine.findIndex((s) => s.href === hrefBase);
      if (idx >= 0) {
        setPendingAnchor(anchor ?? "");
        setSpineIndex(idx);
      }
      return prev;
    });
    setShowToc(false);
  }, []);

  const currentItem = contents?.spine[spineIndex];
  const iframeSrc = currentItem
    ? `epub://localhost/${bookId}/${currentItem.href}${pendingAnchor ? `#${pendingAnchor}` : ""}`
    : undefined;
  const progress =
    contents && contents.spine.length > 1
      ? Math.round((spineIndex / (contents.spine.length - 1)) * 100)
      : 0;

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
        <button className="reader-close-btn" onClick={() => window.close()} title="关闭">
          ‹
        </button>
        {(contents?.toc.length ?? 0) > 0 && (
          <button
            className={`reader-toc-btn ${showToc ? "active" : ""}`}
            onClick={(e) => { e.stopPropagation(); setShowToc((s) => !s); setShowSettings(false); }}
            title="目录"
          >
            <TocIcon />
          </button>
        )}
        <span className="reader-book-title" data-tauri-drag-region>{bookTitle}</span>
        <button
          className="reader-aa-btn"
          onClick={(e) => { e.stopPropagation(); setShowSettings((s) => !s); setShowToc(false); }}
        >
          Aa
        </button>
      </div>

      {/* TOC panel */}
      <div className={`toc-panel toc-panel--${theme} ${showToc ? "open" : ""}`}>
        <div className="toc-header">目录</div>
        <div className="toc-list">
          {contents?.toc.map((item, i) => (
            <TocRow
              key={i}
              item={item}
              depth={0}
              activeHref={currentItem?.href ?? ""}
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
        disabled={spineIndex === 0}
      >‹</button>

      {/* Chapter iframe */}
      <div className="reader-stage">
        {loading && <div className="reader-loading">加载中…</div>}
        {iframeSrc && (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            onLoad={applyTheme}
            className="reader-frame"
            title={bookTitle}
          />
        )}
      </div>

      {/* Next chapter */}
      <button
        className={`page-nav page-nav--next ${showUI ? "visible" : ""}`}
        onClick={handleNext}
        aria-label="下一章"
        disabled={spineIndex === (contents?.spine.length ?? 1) - 1}
      >›</button>

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
