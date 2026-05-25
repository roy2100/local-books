import { useEffect, useRef, useState, useCallback } from "react";
import {
  ALargeSmall,
  ChevronLeft,
  ChevronRight,
  TableOfContents,
} from "lucide-react";
// @ts-ignore foliate-js ships plain JavaScript modules without TypeScript declarations.
import "../vendor/foliate-js/view.js";
// @ts-ignore
import { FootnoteHandler } from "../vendor/foliate-js/footnotes.js";
import { FootnotePopup } from "./FootnotePopup";
import { BG, makeThemeCSS, type Theme, type FontStyle, type WritingMode } from "./readerTheme";
import { convertDoc } from "./t2s";
import "./Reader.css";

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

interface FoliateRenderer extends HTMLElement {
  setStyles?: (styles: string | string[]) => void;
  prev?: (distance?: number) => Promise<void>;
  next?: (distance?: number) => Promise<void>;
  reloadSection?: () => Promise<void>;
  getContents?: () => Array<{ doc: Document; index: number }>;
  readonly vertical?: boolean;
  flow?: string;
}

interface FootnoteBeforeRenderDetail {
  view: FoliateViewElement;
}

interface FootnoteRenderDetail {
  view: FoliateViewElement;
  contentHeight: number;
  href: string;
  type: string | null;
  hidden: boolean;
}

interface FoliateLinkDetail {
  a: Element;
  href: string;
}

interface FoliateBook {
  toc?: NavItem[];
}

interface FoliateViewElement extends HTMLElement {
  book?: FoliateBook;
  renderer?: FoliateRenderer;
  open: (book: string | Blob | object) => Promise<void>;
  close: () => void;
  goTo: (target: string | number | object) => Promise<unknown>;
  goLeft: () => Promise<void>;
  goRight: () => Promise<void>;
  prev: (distance?: number) => Promise<void>;
  next: (distance?: number) => Promise<void>;
}

interface FoliateRelocateDetail {
  fraction?: number;
  location?: { current?: number; total?: number };
  tocItem?: { href?: string; label?: string };
}

function applyFoliateTheme(
  view: FoliateViewElement | null,
  theme: Theme,
  fontSize: number,
  fontStyle: FontStyle,
  writingMode: WritingMode | null,
) {
  view?.renderer?.setStyles?.(makeThemeCSS(theme, fontSize, window.location.origin, fontStyle, writingMode));
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

export default function Reader({ bookId, bookTitle }: Props) {
  const [toc, setToc] = useState<NavItem[]>([]);
  const [currentHref, setCurrentHref] = useState("");
  const [progress, setProgress] = useState(0);
  const [theme, setTheme] = useState<Theme>("light");
  const [fontSize, setFontSize] = useState(18);
  const [flow, setFlow] = useState<"scrolled" | "paginated">("paginated");
  const [fontStyle, setFontStyle] = useState<FontStyle>("serif");
  const [writingMode, setWritingMode] = useState<WritingMode | null>("horizontal");
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [t2sEnabled, setT2SEnabled] = useState(false);

  const [fnVisible, setFnVisible] = useState(false);
  const [fnAnchorRect, setFnAnchorRect] = useState<DOMRect | null>(null);
  const fnPopupRef = useRef<HTMLDivElement>(null);
  const fnViewRef = useRef<FoliateViewElement | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateViewElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const themeRef = useRef({ theme, fontSize, fontStyle, writingMode });
  useEffect(() => { themeRef.current = { theme, fontSize, fontStyle, writingMode }; }, [theme, fontSize, fontStyle, writingMode]);
  const flowRef = useRef(flow);
  useEffect(() => { flowRef.current = flow; }, [flow]);
  const t2sRef = useRef(false);
  useEffect(() => { t2sRef.current = t2sEnabled; }, [t2sEnabled]);

  // foliate-js initialization
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(null);
    setToc([]);
    setProgress(0);
    setCurrentHref("");

    let cancelled = false;

    const view = document.createElement("foliate-view") as FoliateViewElement;
    view.className = "foliate-reader-view";
    container.replaceChildren(view);
    viewRef.current = view;

    const handleRelocate = (event: Event) => {
      const detail = (event as CustomEvent<FoliateRelocateDetail>).detail;
      if (typeof detail.fraction === "number") {
        setProgress(Math.max(0, Math.min(100, Math.round(detail.fraction * 100))));
      } else if (
        typeof detail.location?.current === "number" &&
        typeof detail.location?.total === "number" &&
        detail.location.total > 0
      ) {
        setProgress(Math.round((detail.location.current / detail.location.total) * 100));
      }
      setCurrentHref(detail.tocItem?.href ?? "");
    };

    view.addEventListener("relocate", handleRelocate);

    const handleLoad = (event: Event) => {
      if (!t2sRef.current) return;
      const doc = (event as CustomEvent<{ doc: Document }>).detail?.doc;
      if (doc?.body) convertDoc(doc);
    };
    view.addEventListener("load", handleLoad);

    const fnHandler = new FootnoteHandler();
    fnHandler.addEventListener('before-render', (e: Event) => {
      const { view: fnView } = (e as CustomEvent<FootnoteBeforeRenderDetail>).detail;
      // Close previous footnote view
      if (fnViewRef.current) {
        fnViewRef.current.close();
        fnViewRef.current.remove();
        fnViewRef.current = null;
      }
      setFnVisible(false);
      if (fnPopupRef.current) fnPopupRef.current.style.height = '';
      // Must attach to DOM before goTo() — WKWebView won't load iframe.src on detached elements
      fnViewRef.current = fnView;
      fnPopupRef.current?.appendChild(fnView);
      if (fnView.renderer) fnView.renderer.flow = 'scrolled';
      const { theme: t, fontSize: fs, fontStyle: fst } = themeRef.current;
      const baseCSS = makeThemeCSS(t, fs, window.location.origin, fst, 'horizontal');
      // Override padding/background for compact popup; transparent lets glass effect show through
      const fnCSS = `html,body{background:transparent!important;padding:10px 16px!important;margin:0!important;max-width:none!important;font-size:13px!important;}p,li,dt,dd,blockquote,td,th{font-size:1em!important;}::-webkit-scrollbar{display:none!important;}`;
      fnView.renderer?.setStyles?.([baseCSS, fnCSS]);
    });
    fnHandler.addEventListener('render', (e: Event) => {
      const { contentHeight } = (e as CustomEvent<FootnoteRenderDetail>).detail;
      if (contentHeight > 0 && fnPopupRef.current) {
        fnPopupRef.current.style.height = `${Math.max(40, Math.min(200, contentHeight))}px`;
      }
      setFnVisible(true);
    });
    view.addEventListener('link', (e: Event) => {
      const { a } = (e as CustomEvent<FoliateLinkDetail>).detail;
      if (a) {
        const frame = a.ownerDocument?.defaultView?.frameElement;
        const frameRect = frame?.getBoundingClientRect() ?? new DOMRect();
        const aRect = a.getBoundingClientRect();
        setFnAnchorRect(new DOMRect(
          frameRect.left + aRect.left,
          frameRect.top + aRect.top,
          aRect.width,
          aRect.height,
        ));
      }
      fnHandler.handle(view.book, e);
    });

    const openBook = async () => {
      try {
        await view.open(`epub://localhost/${bookId}/book.epub`);
        if (cancelled) return;
        if (view.renderer) view.renderer.flow = flowRef.current;
        setToc(view.book?.toc ?? []);
        const { theme: nextTheme, fontSize: nextFontSize, fontStyle: nextFontStyle, writingMode: nextWritingMode } = themeRef.current;
        applyFoliateTheme(view, nextTheme, nextFontSize, nextFontStyle, nextWritingMode);
        await view.next();
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(`无法打开书籍：${String(e)}`);
          setLoading(false);
        }
      }
    };

    void openBook();

    return () => {
      cancelled = true;
      view.removeEventListener("relocate", handleRelocate);
      view.removeEventListener("load", handleLoad);
      view.close();
      view.remove();
      if (viewRef.current === view) viewRef.current = null;
      if (fnViewRef.current) {
        fnViewRef.current?.close();
        fnViewRef.current.remove();
        fnViewRef.current = null;
      }
      setFnVisible(false);
      setFnAnchorRect(null);
    };
  }, [bookId]);

  // Apply theme/font CSS through foliate-js renderer styles.
  const applyTheme = useCallback(() => {
    applyFoliateTheme(viewRef.current, theme, fontSize, fontStyle, writingMode);
  }, [theme, fontSize, fontStyle, writingMode]);

  useEffect(() => { applyTheme(); }, [theme, fontSize, fontStyle, writingMode, applyTheme]);

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

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { writingMode } = themeRef.current;
      // vertical layout: left = next (columns flow right→left), right = prev
      // horizontal layout forced: always LTR, bypass book.dir
      // auto: trust renderer's detected writing-mode
      const rendererVertical = viewRef.current?.renderer?.vertical === true;
      const isVertical = writingMode === "vertical" || (writingMode !== "horizontal" && rendererVertical);
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
    const { writingMode } = themeRef.current;
    const rendererVertical = viewRef.current?.renderer?.vertical === true;
    const isVertical = writingMode === "vertical" || (writingMode !== "horizontal" && rendererVertical);
    // 竖排：左=向前(next)；横排：左=向后(prev)。用 next/prev 而非 goLeft/goRight，
    // 避免 foliate-js 用书籍原始 RTL 元数据覆盖强制横排时的方向判断。
    void (isVertical ? viewRef.current?.next() : viewRef.current?.prev());
  }, []);

  const handleNext = useCallback(() => {
    const { writingMode } = themeRef.current;
    const rendererVertical = viewRef.current?.renderer?.vertical === true;
    const isVertical = writingMode === "vertical" || (writingMode !== "horizontal" && rendererVertical);
    void (isVertical ? viewRef.current?.prev() : viewRef.current?.next());
  }, []);

  const navigateTo = useCallback((href: string) => {
    viewRef.current?.goTo(href).catch(() => {});
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
            <div className="settings-divider" />
            <div className="settings-row">
              <span className="settings-label">翻页方式</span>
              <div className="flow-chips">
                <button
                  className={`flow-chip ${flow === "scrolled" ? "active" : ""}`}
                  onClick={() => setFlow("scrolled")}
                  title="滚动"
                >滚动</button>
                <button
                  className={`flow-chip ${flow === "paginated" ? "active" : ""}`}
                  onClick={() => setFlow("paginated")}
                  title="翻页"
                >翻页</button>
              </div>
            </div>
            <div className="settings-divider" />
            <div className="settings-row">
              <span className="settings-label">字体</span>
              <div className="flow-chips">
                <button
                  className={`flow-chip ${fontStyle === "serif" ? "active" : ""}`}
                  onClick={() => setFontStyle("serif")}
                  title="思源宋体"
                >宋体</button>
                <button
                  className={`flow-chip ${fontStyle === "sans" ? "active" : ""}`}
                  onClick={() => setFontStyle("sans")}
                  title="思源黑体"
                >黑体</button>
              </div>
            </div>
            <div className="settings-divider" />
            <div className="settings-row">
              <span className="settings-label">排版方向</span>
              <div className="flow-chips">
                <button
                  className={`flow-chip ${writingMode === null ? "active" : ""}`}
                  onClick={() => setWritingMode(null)}
                  title="跟随书籍原始排版"
                >自动</button>
                <button
                  className={`flow-chip ${writingMode === "horizontal" ? "active" : ""}`}
                  onClick={() => setWritingMode("horizontal")}
                  title="横排"
                >横排</button>
                <button
                  className={`flow-chip ${writingMode === "vertical" ? "active" : ""}`}
                  onClick={() => setWritingMode("vertical")}
                  title="竖排"
                >竖排</button>
              </div>
            </div>
            <div className="settings-divider" />
            <div className="settings-row">
              <span className="settings-label">繁简转换</span>
              <div className="flow-chips">
                <button
                  className={`flow-chip ${t2sEnabled ? "active" : ""}`}
                  onClick={() => setT2SEnabled(s => !s)}
                  title="繁体转简体"
                >繁→简</button>
              </div>
            </div>
          </div>
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
