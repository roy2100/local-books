import { useState, useEffect, useRef, useCallback } from "react";

export function useAutoHideUI(panelsOpen: boolean) {
  const [showUI, setShowUI] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (panelsOpen) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setShowUI(true);
    }
  }, [panelsOpen]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const bumpUI = useCallback(() => {
    setShowUI(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowUI(false), 3000);
  }, []);

  return { showUI, bumpUI };
}
