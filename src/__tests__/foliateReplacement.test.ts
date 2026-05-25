import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import useFoliateSource from "../reader/hooks/useFoliate.ts?raw";

describe("foliate-js replacement", () => {
  it("uses the vendored foliate-js view instead of epubjs", () => {
    const pkg = packageJson as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(useFoliateSource).toContain("../../../vendor/foliate-js/view.js");
    expect(useFoliateSource).not.toContain('"epubjs"');
    expect(pkg.dependencies).not.toHaveProperty("epubjs");
    expect(pkg.devDependencies).not.toHaveProperty("epubjs");
  });
});
