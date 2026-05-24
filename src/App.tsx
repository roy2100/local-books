import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface Book {
  id: string;
  title: string;
  author: string;
  path: string;
  cover: string | null;
  added_at: number;
  source_folder: string | null;
}

interface Library {
  books: Book[];
  folders: string[];
}

function BookCard({ book, onRemove }: { book: Book; onRemove: (id: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="book-card" onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}>
      <div className="book-cover">
        {book.cover ? (
          <img src={book.cover} alt={book.title} />
        ) : (
          <div className="book-cover-placeholder">
            <span className="book-cover-letter">{book.title.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <div className="book-spine" />
      </div>
      <div className="book-info">
        <p className="book-title">{book.title}</p>
        <p className="book-author">{book.author}</p>
      </div>
      {menuOpen && (
        <>
          <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="context-menu">
            <button onClick={() => { onRemove(book.id); setMenuOpen(false); }}>
              从书库移除
            </button>
          </div>
        </>
      )}
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
  const folderName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <p className="sidebar-label">书库</p>
        <button
          className={`sidebar-item ${selectedFolder === null ? "active" : ""}`}
          onClick={() => onSelect(null)}
        >
          <span className="sidebar-icon">📚</span>
          所有图书
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
                <span className="sidebar-icon">📁</span>
                <span className="sidebar-folder-name">{folderName(folder)}</span>
              </button>
              <div className="sidebar-folder-actions">
                <button
                  className="icon-btn"
                  onClick={() => onRefresh(folder)}
                  title="刷新"
                >↻</button>
                <button
                  className="icon-btn icon-btn-danger"
                  onClick={() => onRemove(folder)}
                  title="移除文件夹"
                >×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
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

  const handleRemoveBook = useCallback(async (bookId: string) => {
    const updated = await invoke<Library>("remove_book", { bookId });
    setLibrary(updated);
  }, []);

  const handleRemoveFolder = useCallback(async (folderPath: string) => {
    const updated = await invoke<Library>("remove_folder", { folderPath });
    setLibrary(updated);
    if (selectedFolder === folderPath) setSelectedFolder(null);
  }, [selectedFolder]);

  const handleRefreshFolder = useCallback(async (folderPath: string) => {
    setLoading(true);
    try {
      const updated = await invoke<Library>("refresh_folder", { folderPath });
      setLibrary(updated);
    } finally {
      setLoading(false);
    }
  }, []);

  const visibleBooks = library.books.filter((b) => {
    const inFolder = selectedFolder === null || b.source_folder === selectedFolder;
    const matchSearch =
      search === "" ||
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase());
    return inFolder && matchSearch;
  });

  return (
    <div className="app">
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-controls" />
        <div className="titlebar-search">
          <input
            className="search-input"
            placeholder="搜索书籍…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className="add-btn"
          onClick={handleAddFolder}
          disabled={importing}
        >
          {importing ? "导入中…" : "+ 添加文件夹"}
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
              <div className="empty-icon">📖</div>
              <p className="empty-title">
                {library.books.length === 0 ? "书库是空的" : "没有找到书籍"}
              </p>
              <p className="empty-sub">
                {library.books.length === 0
                  ? "点击「添加文件夹」导入 EPUB 文件"
                  : "尝试更改搜索词或选择其他文件夹"}
              </p>
              {library.books.length === 0 && (
                <button className="empty-add-btn" onClick={handleAddFolder} disabled={importing}>
                  {importing ? "导入中…" : "添加文件夹"}
                </button>
              )}
            </div>
          ) : (
            <div className="book-grid">
              {visibleBooks.map((book) => (
                <BookCard key={book.id} book={book} onRemove={handleRemoveBook} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
