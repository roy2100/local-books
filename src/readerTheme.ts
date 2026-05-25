export type Theme = "light" | "sepia" | "dark";
export type FontStyle = "serif" | "sans";
export type WritingMode = "horizontal" | "vertical";

export const BG: Record<Theme, string> = {
  light: "#faf9f6",
  sepia: "#f6f0e6",
  dark: "#1c1c1e",
};

export function makeThemeCSS(theme: Theme, fontSize: number, fontBase: string = "", fontStyle: FontStyle = "serif", writingMode: WritingMode | null = null): string {
  const vertical = writingMode === "vertical";
  const fontFaceCSS = fontBase ? `
    @font-face {
      font-family: 'Source Han Serif SC';
      src: url('${fontBase}/fonts/SourceHanSerifSC-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: block;
    }
    @font-face {
      font-family: 'Source Han Serif SC';
      src: url('${fontBase}/fonts/SourceHanSerifSC-SemiBold.woff2') format('woff2');
      font-weight: 600 700;
      font-style: normal;
      font-display: block;
    }
    @font-face {
      font-family: 'Source Han Sans SC';
      src: url('${fontBase}/fonts/SourceHanSansSC-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: block;
    }
    @font-face {
      font-family: 'Source Han Sans SC';
      src: url('${fontBase}/fonts/SourceHanSansSC-Medium.woff2') format('woff2');
      font-weight: 500 700;
      font-style: normal;
      font-display: block;
    }
  ` : "";
  const fontFamily = fontStyle === "serif"
    ? "'Source Han Serif SC', 'PingFang SC', Georgia, serif"
    : "'Source Han Sans SC', 'PingFang SC', -apple-system, sans-serif";
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
  return `${fontFaceCSS}
    html, body { background: ${BG[theme]} !important; color: ${text} !important; }
    body {
      font-size: ${fontSize}px !important;
      font-family: ${fontFamily} !important;
      ${writingMode ? `writing-mode: ${vertical ? "vertical-rl" : "horizontal-tb"} !important;` : ""}
      line-height: ${vertical ? "2.0" : "1.85"} !important;
      ${vertical ? "" : "max-width: 700px !important; margin: 0 auto !important; padding: 48px 32px 80px !important;"}
      word-break: break-word !important;
      ${vertical ? "" : "text-align: justify !important;"}
      -webkit-font-smoothing: antialiased !important;
      text-rendering: optimizeLegibility !important;
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
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: ${scrollThumb};
      border-radius: 2px;
    }
    ::-webkit-scrollbar-thumb:hover { background: ${scrollThumbHover}; }
  `;
}
