import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BookOpen, LoaderCircle, Plus, Search } from "lucide-react";
import { BookCard } from "./BookCard";
import { FolderSidebar } from "./FolderSidebar";
import { filterBooks } from "../lib/utils";
import type { Book, Library } from "../lib/utils";

export function Bookshelf() {
  const [library, setLibrary] = useState<Library>({ books: [], folders: [] });
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<Library>("get_library").then(setLibrary).catch(console.error);
  }, []);

  const handleAddFolder = useCallback(async () => {
    setError(null);
    const folderPath = await invoke<string | null>("pick_folder");
    if (!folderPath) return;
    setImporting(true);
    try {
      const updated = await invoke<Library>("import_folder", { folderPath });
      setLibrary(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  }, []);

  const handleOpenBook = useCallback(async (book: Book) => {
    try {
      await invoke("open_reader_window", {
        bookId: book.id,
        title: book.title,
      });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const handleRemoveFolder = useCallback(
    async (folderPath: string) => {
      const updated = await invoke<Library>("remove_folder", { folderPath });
      setLibrary(updated);
      if (selectedFolder === folderPath) setSelectedFolder(null);
    },
    [selectedFolder]
  );

  const handleRefreshFolder = useCallback(async (folderPath: string) => {
    setLoading(true);
    try {
      const updated = await invoke<Library>("refresh_folder", { folderPath });
      setLibrary(updated);
    } finally {
      setLoading(false);
    }
  }, []);

  const visibleBooks = filterBooks(library.books, selectedFolder, search);

  return (
    <div className="app">
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-drag" data-tauri-drag-region />
        <div className="titlebar-search">
          <Search className="search-icon" aria-hidden="true" />
          <input
            className="search-input"
            placeholder="搜索书籍…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="add-btn" onClick={handleAddFolder} disabled={importing}>
          {importing ? (
            <LoaderCircle className="button-icon button-icon--spin" aria-hidden="true" />
          ) : (
            <Plus className="button-icon" aria-hidden="true" />
          )}
          <span>{importing ? "导入中…" : "添加文件夹"}</span>
        </button>
      </div>

      <div className="main-layout">
        <FolderSidebar
          folders={library.folders}
          selectedFolder={selectedFolder}
          onSelect={setSelectedFolder}
          onRemove={handleRemoveFolder}
          onRefresh={handleRefreshFolder}
        />

        <div className="content">
          {error && (
            <div className="error-banner" onClick={() => setError(null)}>
              {error}
            </div>
          )}
          {loading && <div className="loading-bar" />}

          {visibleBooks.length === 0 ? (
            <div className="empty-state">
              <BookOpen className="empty-icon" aria-hidden="true" />
              <p className="empty-title">
                {library.books.length === 0 ? "书库是空的" : "没有找到书籍"}
              </p>
              <p className="empty-sub">
                {library.books.length === 0
                  ? "点击「添加文件夹」导入 EPUB 文件"
                  : "尝试更改搜索词或选择其他文件夹"}
              </p>
              {library.books.length === 0 && (
                <button
                  className="empty-add-btn"
                  onClick={handleAddFolder}
                  disabled={importing}
                >
                  {importing ? (
                    <LoaderCircle className="button-icon button-icon--spin" aria-hidden="true" />
                  ) : (
                    <Plus className="button-icon" aria-hidden="true" />
                  )}
                  <span>{importing ? "导入中…" : "添加文件夹"}</span>
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="hint-text">双击书籍打开阅读</p>
              <div className="book-grid">
                {visibleBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onOpen={handleOpenBook}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
