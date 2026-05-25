import { describe, it, expect } from "vitest";
import { filterBooks } from "../lib/utils";
import type { Book } from "../lib/utils";

const book = (overrides: Partial<Book> = {}): Book => ({
  id: "1",
  title: "Default Title",
  author: "Default Author",
  path: "/a.epub",
  cover: null,
  added_at: 0,
  source_folder: "/folder",
  ...overrides,
});

describe("filterBooks", () => {
  // ── No filters ───────────────────────────────────────────────────────────

  it("returns all books when folder is null and search is empty", () => {
    const books = [book({ id: "1" }), book({ id: "2" })];
    expect(filterBooks(books, null, "")).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(filterBooks([], null, "")).toHaveLength(0);
  });

  // ── Folder filter ─────────────────────────────────────────────────────────

  it("keeps only books from the selected folder", () => {
    const books = [
      book({ id: "1", source_folder: "/a" }),
      book({ id: "2", source_folder: "/b" }),
      book({ id: "3", source_folder: "/a" }),
    ];
    const result = filterBooks(books, "/a", "");
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.id)).toEqual(["1", "3"]);
  });

  it("shows all books when selectedFolder is null regardless of source_folder", () => {
    const books = [
      book({ id: "1", source_folder: "/a" }),
      book({ id: "2", source_folder: "/b" }),
    ];
    expect(filterBooks(books, null, "")).toHaveLength(2);
  });

  it("returns empty when no books belong to selected folder", () => {
    const books = [book({ source_folder: "/a" })];
    expect(filterBooks(books, "/z", "")).toHaveLength(0);
  });

  // ── Search filter ─────────────────────────────────────────────────────────

  it("filters by title substring (case-insensitive)", () => {
    const books = [
      book({ id: "1", title: "Rust Programming" }),
      book({ id: "2", title: "JavaScript Basics" }),
    ];
    expect(filterBooks(books, null, "rust")).toHaveLength(1);
    expect(filterBooks(books, null, "RUST")).toHaveLength(1);
    expect(filterBooks(books, null, "Rust")).toHaveLength(1);
  });

  it("filters by author substring (case-insensitive)", () => {
    const books = [
      book({ id: "1", author: "Jane Doe" }),
      book({ id: "2", author: "John Smith" }),
    ];
    expect(filterBooks(books, null, "jane")).toHaveLength(1);
    expect(filterBooks(books, null, "SMITH")).toHaveLength(1);
  });

  it("matches both title and author in a single query", () => {
    const books = [
      book({ id: "1", title: "Python", author: "Alice" }),
      book({ id: "2", title: "Rust",   author: "Alice" }),
    ];
    // "alice" matches both books via author
    expect(filterBooks(books, null, "alice")).toHaveLength(2);
    // "rust" matches only book 2 via title
    expect(filterBooks(books, null, "rust")).toHaveLength(1);
  });

  it("returns nothing when search matches neither title nor author", () => {
    const books = [book({ title: "Rust", author: "Alice" })];
    expect(filterBooks(books, null, "python")).toHaveLength(0);
  });

  it("matches Traditional title with Simplified query", () => {
    const books = [book({ title: "繁體中文小說" })];
    expect(filterBooks(books, null, "繁体中文")).toHaveLength(1);
  });

  it("matches Simplified title with Traditional query", () => {
    const books = [book({ title: "繁体中文小说" })];
    expect(filterBooks(books, null, "繁體中文")).toHaveLength(1);
  });

  // ── Combined filters ──────────────────────────────────────────────────────

  it("applies folder and search together", () => {
    const books = [
      book({ id: "1", title: "Rust", source_folder: "/a" }),
      book({ id: "2", title: "Rust", source_folder: "/b" }),
      book({ id: "3", title: "Python", source_folder: "/a" }),
    ];
    const result = filterBooks(books, "/a", "rust");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns nothing when folder matches but search does not", () => {
    const books = [book({ title: "Rust", source_folder: "/a" })];
    expect(filterBooks(books, "/a", "python")).toHaveLength(0);
  });

  it("returns nothing when search matches but folder does not", () => {
    const books = [book({ title: "Rust", source_folder: "/a" })];
    expect(filterBooks(books, "/b", "rust")).toHaveLength(0);
  });
});
