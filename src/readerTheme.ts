export type Theme = "light" | "sepia" | "dark";

export const BG: Record<Theme, string> = {
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
