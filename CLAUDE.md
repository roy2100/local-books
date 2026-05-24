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

# Run all tests
npm test                               # frontend (Vitest, pure-logic only)
cd src-tauri && cargo test --lib       # Rust unit tests (16 tests)

## Architecture

This is a **Tauri 2** desktop app (macOS-only target) with a React/TypeScript frontend and a Rust backend.

### Data flow

All business logic lives in Rust. The frontend calls Rust commands via `invoke()` from `@tauri-apps/api/core` and receives serialized data back — there is no direct filesystem access from JS.

```
Frontend (React)  →  invoke("command_name", args)  →  Rust command  →  filesystem
                  ←  serialized struct (JSON)       ←
```

### Rust backend (`src-tauri/src/lib.rs`)

Single file — all logic is here. Key types:

- `Book` — id (uuid), title, author, path, cover (base64 data URL), added_at (unix secs), source_folder
- `Library` — `books: Vec<Book>` + `folders: Vec<String>`

Persistence: `Library` is serialized to `~/Library/Application Support/com.lielienan.local-books/library.json` via `app.path().app_data_dir()`.

EPUB parsing pipeline (`extract_epub_metadata`):
1. Open `.epub` as a ZIP archive
2. Read `META-INF/container.xml` → find OPF file path
3. Parse OPF XML with `roxmltree` → extract `<title>`, `<creator>`, cover image path
4. Cover discovery: first tries `<meta name="cover">` → manifest item lookup; falls back to manifest item with `properties="cover-image"`
5. Read cover bytes from ZIP, base64-encode as data URL

Exposed Tauri commands: `pick_folder`, `import_folder`, `get_library`, `remove_book`, `remove_folder`, `refresh_folder`.

### Frontend (`src/`)

Single-component app in `App.tsx` + `App.css`. No routing, no state management library.

- `App` — root, owns `Library` state, handles all `invoke` calls
- `BookCard` — renders one book with cover/placeholder and right-click context menu
- `FolderSidebar` — left panel listing watched folders with refresh/remove actions

Styling: plain CSS with CSS custom properties for theming. Automatically follows `prefers-color-scheme` (dark/light). No CSS framework or preprocessor.

### Tauri configuration

- `src-tauri/tauri.conf.json` — window title "Local Books", 1200×800, `titleBarStyle: "Overlay"` (macOS traffic-light buttons overlay the content; the titlebar div has 80px left padding to avoid them)
- `src-tauri/capabilities/default.json` — grants `dialog:default` + `dialog:allow-open` permissions required for the folder picker

### Adding a new Rust command

1. Write the `async fn` in `lib.rs`, annotated `#[tauri::command]`
2. Register it in `tauri::generate_handler![...]` inside `run()`
3. Call it from the frontend with `invoke<ReturnType>("command_name", { argName })`
