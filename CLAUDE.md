# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run tauri dev          # Start dev server (Vite + Rust hot-reload)

# Build
npm run tauri build        # Production build (outputs to src-tauri/target/release/bundle/)

# Frontend only
npm run dev                # Vite dev server at localhost:1420 (no Rust, UI-only iteration)
npm run build              # tsc + vite build (type-check + bundle)

# Rust only
cd src-tauri && cargo check          # Fast type/borrow check without linking
cd src-tauri && cargo clippy         # Lint Rust code
```

## Tests

```bash
npm test                               # frontend (Vitest, pure-logic only)
cd src-tauri && cargo test --lib       # Rust unit tests
```

## Architecture

This is a **Tauri 2** desktop app (macOS-only target) with a React/TypeScript frontend and a Rust backend.

### Data flow

All business logic lives in Rust. The frontend calls Rust commands via `invoke()` from `@tauri-apps/api/core` and receives serialized data back — there is no direct filesystem access from JS.

EPUB rendering uses **foliate-js** (vendored at `vendor/foliate-js/`). The reader opens the book via a custom `epub://` URI scheme that serves the raw `.epub` binary — foliate-js handles all parsing internally.

#### 导入书籍流程

```mermaid
flowchart LR
    A[用户选择文件夹] --> B["pick_folder()"]
    B --> C["import_folder()"]
    C --> D["scan_folder_for_epubs()"]
    D --> E["extract_epub_metadata()"]
    E --> F["解析 OPF\ntitle / author / cover"]
    F --> G["保存 library.json"]
    G --> H["书架 UI 刷新"]
```

#### 阅读器核心流程

```mermaid
flowchart TD
    A[双击书籍] --> B["open_reader_window()\n新建 WebviewWindow"]
    B --> C["Reader.tsx\n挂载 &lt;foliate-view&gt;"]

    C --> D["view.open('epub://localhost/{id}/book.epub')"]

    subgraph epub_protocol ["epub:// 协议处理器 (Rust)"]
        D --> E["读取 library.json\n找到 book.path"]
        E --> F["返回完整 .epub 二进制\nContent-Type: application/epub+zip"]
    end

    F --> G["foliate-js 内部解析 EPUB\n提取 TOC、spine、内容"]

    subgraph foliate_events ["foliate-js DOM 事件"]
        G -->|relocate| H["更新进度 + currentHref"]
    end

    C -->|"view.renderer.setStyles(css)"| G
```

### Rust backend (`src-tauri/src/lib.rs`)

Single file — all logic is here. Key types:

- `Book` — id (uuid), title, author, path, cover (base64 data URL), added_at (unix secs), source_folder
- `Library` — `books: Vec<Book>` + `folders: Vec<String>`

Persistence: `Library` is serialized to `~/Library/Application Support/com.lielienan.local-books/library.json` via `app.path().app_data_dir()`.

**EPUB metadata pipeline** (`extract_epub_metadata`):
1. Open `.epub` as ZIP → read `META-INF/container.xml` → find OPF path
2. Parse OPF with `roxmltree` → extract title, creator, cover image path
3. Base64-encode cover as data URL

**epub:// protocol handler** (`serve_epub_protocol`):
- `epub://localhost/{book_id}/book.epub` → looks up `book.path` in library, returns the raw `.epub` file as `application/epub+zip`
- foliate-js in the frontend handles all EPUB parsing from this binary

Exposed Tauri commands: `pick_folder`, `import_folder`, `get_library`, `remove_book`, `remove_folder`, `refresh_folder`, `open_reader_window`.

### Frontend (`src/`)

- `App.tsx` — bookshelf root; owns `Library` state; detects reader window via `window.__READER_BOOK_ID__`
- `BookCard` — cover card (no right-click menu; drag region handled via `data-tauri-drag-region`)
- `FolderSidebar` — watched folders panel
- `Reader.tsx` — EPUB reader powered by foliate-js
- `Reader.css` — reader-specific styles
- `readerTheme.ts` — `Theme` type, `BG` color map, `makeThemeCSS(theme, fontSize)` for foliate-js `setStyles`
- `utils.ts` — shared `Book`/`Library` interfaces, `filterBooks()` helper

**Reader architecture** (foliate-js):

```
Reader mounts <foliate-view> web component (vendor/foliate-js/view.js)
view.open("epub://localhost/{bookId}/book.epub")  ← Rust serves raw .epub
foliate-js parses EPUB internally, exposes view.book.toc
view.renderer.setStyles(css)  ← applies theme + font-size
view emits "relocate" DOM event → Reader updates progress + currentHref
```

- Navigation: `view.prev()` / `view.next()` / `view.goTo(href)` — no spine index needed
- Theme/font-size applied via `view.renderer.setStyles()` (no reload needed)
- Progress from `relocate` event `detail.fraction` (0–1) or `detail.location.current/total`
- TOC loaded from `view.book.toc` (foliate-js NavItem tree)

Styling: plain CSS, no framework. `prefers-color-scheme` handled by the bookshelf; reader has explicit light/sepia/dark themes.

### Tauri configuration

- `src-tauri/tauri.conf.json` — 1200×800 main window, `titleBarStyle: "Overlay"`
- `src-tauri/capabilities/default.json` — main window: `core:default`, `core:window:allow-start-dragging`, `dialog:*`, `opener:default`
- `src-tauri/capabilities/reader.json` — reader windows (`reader-*`): `core:default`, `core:window:allow-start-dragging`

### Adding a new Rust command

1. Write `async fn` in `lib.rs`, annotated `#[tauri::command]`
2. Register in `tauri::generate_handler![...]` inside `run()`
3. Call from frontend: `invoke<ReturnType>("command_name", { argName })`

## UI Design Style

**Liquid Glass (macOS 26 style)** — only panels use frosted glass; main content areas stay solid.

Glass components: sidebar (floating, `margin: 8px 0 8px 8px`, `border-radius: 12px`), context menu, reader TOC panel, reader settings panel.
No glass: titlebar, book grid/cards, reader body.

Blur hierarchy: TOC panel `blur(32px)` > sidebar/settings `blur(28px)` > context menu `blur(24px)`, all with `saturate(160%/150%)`.
Always pair `-webkit-backdrop-filter` with `backdrop-filter`.

Dark mode: bookshelf uses `@media (prefers-color-scheme: dark)` in App.css; reader uses JS-controlled classes (`.toc-panel--dark`, `.reader-settings--dark`).

## CSS Gotchas

**`overflow-y: auto` + `::before` highlight line** — the pseudo-element scrolls away with content. Use non-uniform `border-top` (brighter) instead of `::before`.
`overflow: hidden` is safe (static clip) — `::before { top: 0 }` won't be clipped.

**foliate-js scrollbar + reader styles** — pass all reader CSS (including `::-webkit-scrollbar` rules) via `view.renderer.setStyles(css)` through `makeThemeCSS()` in `readerTheme.ts`. This is the single source of truth for the reader's visual appearance; do not inject styles by other means.
