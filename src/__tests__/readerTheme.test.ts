import { describe, expect, it } from "vitest";
import { BG, makeThemeCSS } from "../readerTheme";

describe("makeThemeCSS", () => {
  // ── Link colour ────────────────────────────────────────────────────────────

  it("keeps ordinary anchors from inheriting link color while preserving footnote link styling", () => {
    const css = makeThemeCSS("light", 18);

    expect(css).toContain("a { color: inherit !important; }");
    expect(css).not.toContain("a { color: #1a73e8 !important; }");
    expect(css).toContain('a[epub\\:type~="noteref"]');
    expect(css).toContain('a[role~="doc-noteref"]');
    expect(css).toContain("a.ref_mi");
    expect(css).toContain("color: #1a73e8");
  });

  // ── Theme colours ──────────────────────────────────────────────────────────

  it("applies correct background colour for each theme", () => {
    expect(makeThemeCSS("light", 16)).toContain(`background: ${BG.light}`);
    expect(makeThemeCSS("sepia", 16)).toContain(`background: ${BG.sepia}`);
    expect(makeThemeCSS("dark",  16)).toContain(`background: ${BG.dark}`);
  });

  it("applies correct link colour for sepia and dark themes", () => {
    expect(makeThemeCSS("sepia", 16)).toContain("color: #7a5c00");
    expect(makeThemeCSS("dark",  16)).toContain("color: #7eb8f7");
  });

  // ── Font size ──────────────────────────────────────────────────────────────

  it("injects the requested font-size", () => {
    expect(makeThemeCSS("light", 20)).toContain("font-size: 20px");
    expect(makeThemeCSS("light", 14)).toContain("font-size: 14px");
  });

  // ── Font style ────────────────────────────────────────────────────────────

  it("defaults to serif font family", () => {
    const css = makeThemeCSS("light", 16);
    expect(css).toContain("Source Han Serif SC");
    expect(css).not.toContain("Source Han Sans SC");
  });

  it("uses sans-serif font family when fontStyle is 'sans'", () => {
    const css = makeThemeCSS("light", 16, "", "sans");
    expect(css).toContain("Source Han Sans SC");
    expect(css).not.toContain("Source Han Serif SC");
  });

  // ── fontBase / @font-face injection ──────────────────────────────────────

  it("omits @font-face declarations when fontBase is empty", () => {
    const css = makeThemeCSS("light", 16);
    expect(css).not.toContain("@font-face");
  });

  it("injects @font-face with correct URLs when fontBase is provided", () => {
    const css = makeThemeCSS("light", 16, "https://localhost:1420");
    expect(css).toContain("@font-face");
    expect(css).toContain("https://localhost:1420/fonts/SourceHanSerifSC-Regular.woff2");
    expect(css).toContain("https://localhost:1420/fonts/SourceHanSerifSC-SemiBold.woff2");
    expect(css).toContain("https://localhost:1420/fonts/SourceHanSansSC-Regular.woff2");
    expect(css).toContain("https://localhost:1420/fonts/SourceHanSansSC-Medium.woff2");
  });

  // ── Writing mode ──────────────────────────────────────────────────────────

  it("omits writing-mode declaration when writingMode is null", () => {
    const css = makeThemeCSS("light", 16);
    expect(css).not.toContain("writing-mode");
  });

  it("sets horizontal-tb and horizontal layout for writingMode 'horizontal'", () => {
    const css = makeThemeCSS("light", 16, "", "serif", "horizontal");
    expect(css).toContain("writing-mode: horizontal-tb");
    expect(css).toContain("line-height: 1.85");
    expect(css).toContain("max-width: 700px");
    expect(css).toContain("text-align: justify");
  });

  it("sets vertical-rl and vertical layout for writingMode 'vertical'", () => {
    const css = makeThemeCSS("light", 16, "", "serif", "vertical");
    expect(css).toContain("writing-mode: vertical-rl");
    expect(css).toContain("line-height: 2.0");
    expect(css).not.toContain("max-width: 700px");
    expect(css).not.toContain("text-align: justify");
  });
});
