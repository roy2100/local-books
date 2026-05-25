import { useEffect, useRef, useState, useCallback } from "react";
import {
  ALargeSmall,
  ChevronLeft,
  ChevronRight,
  TableOfContents,
} from "lucide-react";
import { FootnotePopup } from "./FootnotePopup";
import { ReaderSettings } from "./ReaderSettings";
import { TocRow } from "./TocRow";
import { BG, makeThemeCSS, type Theme, type FontStyle, type WritingMode } from "./readerTheme";
import { useFoliate } from "./hooks/useFoliate";
import { useAutoHideUI } from "./hooks/useAutoHideUI";
import { convertDoc } from "../lib/t2s";
import "./Reader.css";

interface Props {
  bookId: string;
  bookTitle: string;
}

export default function Reader({ bookId, bookTitle }: Props) {
  const [theme, setTheme] = useState<Theme>("light");
  const [fontSize, setFontSize] = useState(18);
  const [flow, setFlow] = useState<"scrolled" | "paginated">("paginated");
  const [fontStyle, setFontStyle] = useState<FontStyle>("serif");
  const [writingMode, setWritingMode] = useState<WritingMode | null>("horizontal");
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [t2sEnabled, setT2SEnabled] = useState(false);

  const themeRef = useRef({ theme, fontSize, fontStyle, writingMode });
  useEffect(() => { themeRef.current = { theme, fontSize, fontStyle, writingMode }; }, [theme, fontSize, fontStyle, writingMode]);
  const flowRef = useRef(flow);
  useEffect(() => { flowRef.current = flow; }, [flow]);
  const t2sRef = useRef(false);
  useEffect(() => { t2sRef.current = t2sEnabled; }, [t2sEnabled]);

  const {
    viewRef, containerRef, fnPopupRef, fnViewRef,
    toc, currentHref, progress, loading, error,
    fnVisible, setFnVisible, fnAnchorRect, setFnAnchorRect,
  } = useFoliate({ bookId, themeRef, flowRef, t2sRef });

  const { showUI, bumpUI } = useAutoHideUI(showSettings || showToc);

  // Apply theme/font CSS through foliate-js renderer styles.
  useEffect(() => {
    viewRef.current?.renderer?.setStyles?.(
      makeThemeCSS(theme, fontSize, window.location.origin, fontStyle, writingMode)
    );
  }, [theme, fontSize, fontStyle, writingMode]);

  // writing-mode changes require reloading the current section for foliate-js to re-detect direction.
  useEffect(() => {
    if (viewRef.current?.renderer?.reloadSection) {
      void viewRef.current.renderer.reloadSection();
    }
  }, [writingMode]);

  // Apply flow mode change without reloading the book.
  useEffect(() => {
    const r = viewRef.current?.renderer;
    if (r) r.flow = flow;
  }, [flow]);

  // Apply or remove t2s on the currently displayed section when the toggle changes.
  useEffect(() => {
    const renderer = viewRef.current?.renderer;
    if (!renderer) return;
    if (t2sEnabled) {
      // Convert current section's DOM directly — load event won't fire for same-section reload.
      const contents = renderer.getContents?.() ?? [];
      for (const { doc } of contents) {
        if (doc?.body) convertDoc(doc);
      }
    } else {
      // Reload from blob URL to restore original content.
      void renderer.reloadSection?.();
    }
  }, [t2sEnabled]);

  // vertical layout: left=next (columns flow right→left), right=prev; horizontal: always LTR
  const getIsVertical = useCallback(() => {
    const { writingMode } = themeRef.current;
    const rendererVertical = viewRef.current?.renderer?.vertical === true;
    return writingMode === "vertical" || (writingMode !== "horizontal" && rendererVertical);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isVertical = getIsVertical();
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        void (isVertical ? viewRef.current?.prev() : viewRef.current?.next());
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        void (isVertical ? viewRef.current?.next() : viewRef.current?.prev());
      }
      if (e.key === "Escape") { setShowToc(false); setShowSettings(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [getIsVertical]);

  const handlePrev = useCallback(() => {
    // 竖排：左=向前(next)；横排：左=向后(prev)。用 next/prev 而非 goLeft/goRight，
    // 避免 foliate-js 用书籍原始 RTL 元数据覆盖强制横排时的方向判断。
    void (getIsVertical() ? viewRef.current?.next() : viewRef.current?.prev());
  }, [getIsVertical]);

  const handleNext = useCallback(() => {
    void (getIsVertical() ? viewRef.current?.prev() : viewRef.current?.next());
  }, [getIsVertical]);

  const navigateTo = useCallback((href: string) => {
    viewRef.current?.goTo(href).catch((e) => console.error('[Reader] goTo failed:', e));
    setShowToc(false);
  }, []);

  return (
    <div
      className={`reader reader--${theme}`}
      style={{ background: BG[theme] }}
      onMouseMove={bumpUI}
    >
      {/* Drag strip — above iframe, data-tauri-drag-region handled natively */}
      <div className="reader-drag-strip" data-tauri-drag-region />

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
          <ReaderSettings
            theme={theme} setTheme={setTheme}
            fontSize={fontSize} setFontSize={setFontSize}
            flow={flow} setFlow={setFlow}
            fontStyle={fontStyle} setFontStyle={setFontStyle}
            writingMode={writingMode} setWritingMode={setWritingMode}
            t2sEnabled={t2sEnabled} setT2SEnabled={setT2SEnabled}
          />
        </>
      )}

      {/* Prev chapter */}
      <button
        className={`page-nav page-nav--prev ${showUI ? "visible" : ""}`}
        onClick={handlePrev}
        aria-label="上一页"
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
        aria-label="下一页"
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

      {/* Footnote popup */}
      <FootnotePopup
        anchorRect={fnAnchorRect}
        visible={fnVisible}
        theme={theme}
        contentRef={fnPopupRef}
        onClose={() => {
          if (fnViewRef.current) {
            fnViewRef.current?.close();
            fnViewRef.current.remove();
            fnViewRef.current = null;
          }
          setFnVisible(false);
          setFnAnchorRect(null);
        }}
      />

      {error && (
        <div className="reader-error">
          <p>{error}</p>
          <button onClick={() => window.close()}>关闭</button>
        </div>
      )}
    </div>
  );
}
