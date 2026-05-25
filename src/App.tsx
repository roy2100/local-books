import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BookOpen,
  Folder,
  LibraryBig,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X as XIcon,
} from "lucide-react";
import "./App.css";
import Reader from "./Reader";
import { filterBooks } from "./utils";
import type { Book, Library } from "./utils";

// Reader window detection — injected by open_reader_window via initialization_script
const READER_BOOK_ID = (window as any).__READER_BOOK_ID__ as string | undefined;
const READER_BOOK_TITLE = (window as any).__READER_BOOK_TITLE__ as string | undefined;

function BookCard({
  book,
  onOpen,
}: {
  book: Book;
  onOpen: (book: Book) => void;
}) {
  return (
    <div
      className="book-card"
      onDoubleClick={() => onOpen(book)}
    >
      <div className="book-cover">
        {book.cover ? (
          <img src={book.cover} alt={book.title} />
        ) : (
          <div className="book-cover-placeholder">
            <span className="book-cover-letter">
              {book.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="book-spine" />
      </div>
      <div className="book-info">
        <p className="book-title">{book.title}</p>
        <p className="book-author">{book.author}</p>
      </div>
    </div>
  );
}

function FolderSidebar({
  folders,
  selectedFolder,
  onSelect,
  onRemove,
  onRefresh,
}: {
  folders: string[];
  selectedFolder: string | null;
  onSelect: (folder: string | null) => void;
  onRemove: (folder: string) => void;
  onRefresh: (folder: string) => void;
}) {
  const folderName = (path: string) =>
    path.split("/").filter(Boolean).pop() ?? path;

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <p className="sidebar-label">书库</p>
        <button
          className={`sidebar-item ${selectedFolder === null ? "active" : ""}`}
          onClick={() => onSelect(null)}
        >
          <LibraryBig className="sidebar-icon" aria-hidden="true" />
          <span>所有图书</span>
        </button>
      </div>
      {folders.length > 0 && (
        <div className="sidebar-section">
          <p className="sidebar-label">文件夹</p>
          {folders.map((folder) => (
            <div key={folder} className="sidebar-folder-row">
              <button
                className={`sidebar-item ${selectedFolder === folder ? "active" : ""}`}
                onClick={() => onSelect(folder)}
                title={folder}
              >
                <Folder className="sidebar-icon" aria-hidden="true" />
                <span className="sidebar-folder-name">{folderName(folder)}</span>
              </button>
              <div className="sidebar-folder-actions">
                <button
                  className="icon-btn"
                  onClick={() => onRefresh(folder)}
                  title="刷新"
                >
                  <RefreshCw aria-hidden="true" />
                </button>
                <button
                  className="icon-btn icon-btn-danger"
                  onClick={() => onRemove(folder)}
                  title="移除文件夹"
                >
                  <XIcon aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bookshelf() {
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

export default function App() {
  if (READER_BOOK_ID && READER_BOOK_TITLE) {
    return <Reader bookId={READER_BOOK_ID} bookTitle={READER_BOOK_TITLE} />;
  }
  return <Bookshelf />;
}
