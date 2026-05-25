import {
  useFloating,
  flip,
  shift,
  offset,
  arrow,
  FloatingArrow,
  FloatingPortal,
} from "@floating-ui/react";
import { useRef, useLayoutEffect, useCallback, type RefObject } from "react";
import type { Theme } from "./readerTheme";

interface Props {
  anchorRect: DOMRect | null;
  visible: boolean;
  theme: Theme;
  contentRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export function FootnotePopup({ anchorRect, visible, theme, contentRef, onClose }: Props) {
  const arrowRef = useRef<SVGSVGElement>(null);

  const { refs, floatingStyles, context, update } = useFloating({
    placement: "top",
    middleware: [
      offset(8),
      flip({ fallbackPlacements: ["bottom"] }),
      shift({ padding: 12 }),
      arrow({ element: arrowRef }),
    ],
  });

  // useLayoutEffect: runs synchronously after DOM mutations but before browser paint,
  // so floatingStyles are correct on the very first frame the popup becomes visible.
  // anchorRect is set only after the popup height is already written to the DOM
  // (see handleFnRender in useFoliate), so update() reads the real size here.
  useLayoutEffect(() => {
    refs.setReference(anchorRect ? { getBoundingClientRect: () => anchorRect } : null);
    if (anchorRect) update();
  }, [anchorRect, refs, update]);

  const setOuterRef = useCallback(
    (node: HTMLDivElement | null) => { refs.setFloating(node); },
    [refs],
  );

  const setContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      (contentRef as { current: HTMLDivElement | null }).current = node;
    },
    [contentRef],
  );

  return (
    <FloatingPortal>
      {visible && <div className="footnote-backdrop" onClick={onClose} />}
      {/* Outer: Floating UI anchor; overflow:visible so FloatingArrow can extend outside */}
      <div
        ref={setOuterRef}
        style={{ ...floatingStyles, overflow: "visible" }}
        className={`footnote-popup-outer${visible ? " footnote-popup-outer--visible" : ""}`}
      >
        {/* Inner: visual popup box with clipping — foliate-view is appended here imperatively */}
        <div
          ref={setContentRef}
          className={`footnote-popup footnote-popup--${theme}`}
        />
        <FloatingArrow
          ref={arrowRef}
          context={context}
          className={`footnote-arrow footnote-arrow--${theme}`}
          width={14}
          height={8}
        />
      </div>
    </FloatingPortal>
  );
}
