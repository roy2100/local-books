import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import readerSource from "../Reader.tsx?raw";

describe("foliate-js replacement", () => {
  it("uses the vendored foliate-js view instead of epubjs", () => {
    const pkg = packageJson as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(readerSource).toContain("../vendor/foliate-js/view.js");
    expect(readerSource).not.toContain('"epubjs"');
    expect(pkg.dependencies).not.toHaveProperty("epubjs");
    expect(pkg.devDependencies).not.toHaveProperty("epubjs");
  });
});
