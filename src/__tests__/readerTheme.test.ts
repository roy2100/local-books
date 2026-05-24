import { describe, expect, it } from "vitest";
import { makeThemeCSS } from "../Reader";

describe("makeThemeCSS", () => {
  it("keeps ordinary anchors from inheriting link color while preserving footnote link styling", () => {
    const css = makeThemeCSS("light", 18);

    expect(css).toContain("a { color: inherit !important; }");
    expect(css).not.toContain("a { color: #1a73e8 !important; }");
    expect(css).toContain('a[epub\\:type~="noteref"]');
    expect(css).toContain('a[role~="doc-noteref"]');
    expect(css).toContain("a.ref_mi");
    expect(css).toContain("color: #1a73e8");
  });
});
