import { Folder, LibraryBig, RefreshCw, X as XIcon } from "lucide-react";

interface Props {
  folders: string[];
  selectedFolder: string | null;
  onSelect: (folder: string | null) => void;
  onRemove: (folder: string) => void;
  onRefresh: (folder: string) => void;
}

export function FolderSidebar({ folders, selectedFolder, onSelect, onRemove, onRefresh }: Props) {
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
