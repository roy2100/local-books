import { useEffect, useRef, useState } from "react";
// @ts-ignore foliate-js ships plain JavaScript modules without TypeScript declarations.
import "../../../vendor/foliate-js/view.js";
// @ts-ignore
import { FootnoteHandler } from "../../../vendor/foliate-js/footnotes.js";
import { makeThemeCSS } from "../readerTheme";
import { convertDoc } from "../../lib/t2s";
import type {
  NavItem,
  FoliateViewElement,
  FootnoteBeforeRenderDetail,
  FootnoteRenderDetail,
  FoliateLinkDetail,
  FoliateRelocateDetail,
} from "../../types/foliate";
import type { Theme, FontStyle, WritingMode } from "../readerTheme";

interface ThemeState {
  theme: Theme;
  fontSize: number;
  fontStyle: FontStyle;
  writingMode: WritingMode | null;
}

interface UseFoliateProps {
  bookId: string;
  themeRef: { current: ThemeState };
  flowRef: { current: "scrolled" | "paginated" };
  t2sRef: { current: boolean };
}

export function useFoliate({ bookId, themeRef, flowRef, t2sRef }: UseFoliateProps) {
  const [toc, setToc] = useState<NavItem[]>([]);
  const [currentHref, setCurrentHref] = useState("");
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fnVisible, setFnVisible] = useState(false);
  const [fnAnchorRect, setFnAnchorRect] = useState<DOMRect | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<FoliateViewElement | null>(null);
  const fnPopupRef = useRef<HTMLDivElement | null>(null);
  const fnViewRef = useRef<FoliateViewElement | null>(null);
  const pendingAnchorRef = useRef<DOMRect | null>(null);

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

    const handleFnBeforeRender = (e: Event) => {
      const { view: fnView } = (e as CustomEvent<FootnoteBeforeRenderDetail>).detail;
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
    };

    const handleFnRender = (e: Event) => {
      const { contentHeight } = (e as CustomEvent<FootnoteRenderDetail>).detail;
      if (contentHeight > 0 && fnPopupRef.current) {
        fnPopupRef.current.style.height = `${Math.max(40, Math.min(200, contentHeight))}px`;
      }
      // Set anchor AFTER height is in DOM so Floating UI measures the correct size on first update()
      setFnAnchorRect(pendingAnchorRef.current);
      setFnVisible(true);
    };

    fnHandler.addEventListener('before-render', handleFnBeforeRender);
    fnHandler.addEventListener('render', handleFnRender);

    const handleLink = (e: Event) => {
      const { a } = (e as CustomEvent<FoliateLinkDetail>).detail;
      if (a) {
        const frame = a.ownerDocument?.defaultView?.frameElement;
        const frameRect = frame?.getBoundingClientRect() ?? new DOMRect();
        const aRect = a.getBoundingClientRect();
        // Store rect; actual setFnAnchorRect is deferred to handleFnRender after height is set
        pendingAnchorRef.current = new DOMRect(
          frameRect.left + aRect.left,
          frameRect.top + aRect.top,
          aRect.width,
          aRect.height,
        );
      } else {
        pendingAnchorRef.current = null;
      }
      fnHandler.handle(view.book, e);
    };
    view.addEventListener('link', handleLink);

    const openBook = async () => {
      try {
        await view.open(`epub://localhost/${bookId}/book.epub`);
        if (cancelled) return;
        if (view.renderer) view.renderer.flow = flowRef.current;
        setToc(view.book?.toc ?? []);
        const { theme, fontSize, fontStyle, writingMode } = themeRef.current;
        view.renderer?.setStyles?.(makeThemeCSS(theme, fontSize, window.location.origin, fontStyle, writingMode));
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
      view.removeEventListener("link", handleLink);
      fnHandler.removeEventListener("before-render", handleFnBeforeRender);
      fnHandler.removeEventListener("render", handleFnRender);
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

  return {
    viewRef,
    containerRef,
    fnPopupRef,
    fnViewRef,
    toc,
    currentHref,
    progress,
    loading,
    error,
    fnVisible,
    setFnVisible,
    fnAnchorRect,
    setFnAnchorRect,
  };
}
