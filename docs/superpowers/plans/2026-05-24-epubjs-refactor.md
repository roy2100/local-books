# epub.js 渲染重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 epub.js 替换手写 iframe + postMessage EPUB 渲染方案，提升复杂 EPUB 的兼容性，同时删除 Rust 侧不再需要的内容解析和脚本注入逻辑。

**Architecture:** epub.js 通过 `fetch("epub://localhost/{id}/book.epub")` 拉取完整 EPUB binary，JSZip 内部解压后用 blob URL 提供资源；Rust 的 `serve_epub_protocol` 精简为只返回完整 binary；Reader.tsx 改用 epub.js `rendition` 管理 iframe、主题和导航。CSP 为 null，不需要额外配置。

**Tech Stack:** epubjs 0.3.x (npm), React 19, TypeScript, Tauri 2 Rust backend, Vitest

---

## File Map

| 文件 | 操作 |
|---|---|
| `package.json` | 修改：添加 `epubjs` 依赖 |
| `src-tauri/src/lib.rs` | 修改：删除 12 个死代码项，精简 `serve_epub_protocol` |
| `src/__tests__/readerTheme.test.ts` | 不动：`makeThemeCSS` 保留不变，测试继续有效 |
| `src/Reader.tsx` | 修改：全面重写渲染逻辑，保留 UI chrome |
| `src/Reader.css` | 修改：`.reader-frame` 改为 div 容器样式 |

---

## Task 1: 安装 epubjs

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 epubjs**

```bash
cd /Users/lielienan/Project/local_books
npm install epubjs
```

Expected output: `added 1 package` 或类似；`package.json` 的 `dependencies` 中出现 `"epubjs"`。

- [ ] **Step 2: 验证 TypeScript 导入可解析**

在终端运行一次 tsc 类型检查：

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 无与 epubjs 相关的 `Cannot find module` 错误（epubjs 0.3.x 内置类型定义）。若出现类型缺失，在 `src/vite-env.d.ts` 末尾添加：

```typescript
declare module 'epubjs'
```

- [ ] **Step 3: 运行现有测试确认基线通过**

```bash
npm test
```

Expected: 所有测试 PASS（readerTheme + filterBooks，共约 12 个）。

- [ ] **Step 4: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: 安装 epubjs"
```

---

## Task 2: 精简 Rust 后端

删除所有与逐文件服务、脚本注入、内容解析相关的代码；精简 `serve_epub_protocol` 为只返回完整 binary。

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 删除 6 个 URI 解析单元测试**

在 `lib.rs` 的 `#[cfg(test)] mod tests` 块中，删除以下 6 个 test 函数（保留 library、metadata、folder scanning 相关的测试）：

```
book_id_extracted_with_epub_suffix
book_id_extracted_bare
book_id_extracted_trailing_slash
book_id_empty_when_root_only
file_path_extracted
book_id_query_param_ignored
```

- [ ] **Step 2: 删除 `READER_SCRIPT` 常量和 `inject_reader_script` 函数**

删除从 `const READER_SCRIPT: &str = r#"` 到对应 `#;` 的整段（约 28 行），以及：

```rust
fn inject_reader_script(buf: Vec<u8>) -> Vec<u8> {
    ...
}
```

- [ ] **Step 3: 删除 `parse_epub_uri` 和 `mime_type_for` 函数**

删除：
```rust
fn parse_epub_uri(uri: &str) -> (&str, &str) { ... }
fn mime_type_for(path: &str) -> &'static str { ... }
```

- [ ] **Step 4: 删除 SpineItem / TocEntry / BookContents 类型及相关函数**

删除以下类型定义：
```rust
pub struct SpineItem { ... }
pub struct TocEntry { ... }
pub struct BookContents { ... }
```

删除以下函数：
```rust
fn nav_point_to_toc_entry(np: &epub::doc::NavPoint) -> TocEntry { ... }
fn parse_epub_contents(epub_path: &Path) -> Option<BookContents> { ... }
```

- [ ] **Step 5: 删除 `get_book_contents` 命令**

删除整个函数：
```rust
#[tauri::command]
async fn get_book_contents(app: AppHandle, book_id: String) -> Result<BookContents, String> {
    ...
}
```

从 `tauri::generate_handler![...]` 中移除 `get_book_contents`，结果如下：

```rust
.invoke_handler(tauri::generate_handler![
    pick_folder,
    import_folder,
    get_library,
    remove_book,
    remove_folder,
    refresh_folder,
    open_reader_window,
])
```

- [ ] **Step 6: 精简 `serve_epub_protocol`**

将整个 `serve_epub_protocol` 函数替换为：

```rust
fn serve_epub_protocol(
    ctx: tauri::UriSchemeContext<'_, impl tauri::Runtime>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let app = ctx.app_handle();
    let err = |status: u16, msg: &'static str| {
        tauri::http::Response::builder()
            .status(status)
            .header("Access-Control-Allow-Origin", "*")
            .body(msg.as_bytes().to_vec())
            .unwrap()
    };

    let uri = request.uri().to_string();
    let book_id = uri
        .trim_start_matches("epub://localhost/")
        .split('/')
        .next()
        .unwrap_or("");

    if book_id.is_empty() {
        return err(400, "missing book id");
    }

    let library = load_library(app);
    let Some(book) = library.books.iter().find(|b| b.id == book_id) else {
        return err(404, "book not found");
    };

    match fs::read(&book.path) {
        Ok(bytes) => tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", "application/epub+zip")
            .header("Access-Control-Allow-Origin", "*")
            .body(bytes)
            .unwrap(),
        Err(_) => err(500, "failed to read epub"),
    }
}
```

- [ ] **Step 7: 验证 Rust 编译和测试**

```bash
cd src-tauri && cargo test --lib 2>&1
```

Expected: 编译成功，剩余测试全部 PASS（应剩约 12 个，无 URI 解析相关）。若有 unused import 警告，删除 `lib.rs` 顶部不再使用的 `use` 行（可能包括 `zip`、`std::io::Read` 相关）。

- [ ] **Step 8: 提交**

```bash
cd ..
git add src-tauri/src/lib.rs
git commit -m "refactor: 精简 Rust 后端，删除 epub 内容解析和脚本注入逻辑"
```

---

## Task 3: 更新 Reader.tsx 的类型和状态声明

**Files:**
- Modify: `src/Reader.tsx`

- [ ] **Step 1: 替换导入块顶部**

将：
```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
```

改为：
```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import ePub from "epubjs";
import type { Book, Rendition } from "epubjs";
```

（`invoke` 不再需要；`Book`、`Rendition` 类型来自 epubjs。若 epubjs 不导出这些类型名称，改用 `import ePub from "epubjs"` 并用 `ReturnType<typeof ePub>` 替代类型注解。）

- [ ] **Step 2: 删除旧类型，添加 NavItem**

删除：
```typescript
interface SpineItem { href: string; id: string; }
interface TocEntry { label: string; href: string; children: TocEntry[]; }
interface BookContents { spine: SpineItem[]; toc: TocEntry[]; }
```

添加：
```typescript
interface NavItem {
  id: string;
  href: string;
  label: string;
  subitems?: NavItem[];
  parent?: string;
}
```

- [ ] **Step 3: 更新组件状态声明**

在 `export default function Reader` 内，将旧状态：
```typescript
const [contents, setContents] = useState<BookContents | null>(null);
const [spineIndex, setSpineIndex] = useState(0);
const [pendingAnchor, setPendingAnchor] = useState("");
```

替换为：
```typescript
const [toc, setToc] = useState<NavItem[]>([]);
const [currentHref, setCurrentHref] = useState("");
const [progress, setProgress] = useState(0);
```

保留不变的状态：`theme`, `fontSize`, `showSettings`, `showToc`, `showUI`, `loading`, `error`。

- [ ] **Step 4: 更新 ref 声明**

将：
```typescript
const iframeRef = useRef<HTMLIFrameElement>(null);
const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
const themeRef = useRef({ theme, fontSize });
useEffect(() => { themeRef.current = { theme, fontSize }; }, [theme, fontSize]);
```

替换为：
```typescript
const containerRef = useRef<HTMLDivElement>(null);
const bookRef = useRef<Book | null>(null);
const renditionRef = useRef<Rendition | null>(null);
const prevBlobUrlRef = useRef<string>("");
const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
// themeRef 让 init effect 读取最新主题，同时不把 theme/fontSize 加入 [bookId] deps
const themeRef = useRef({ theme, fontSize });
useEffect(() => { themeRef.current = { theme, fontSize }; }, [theme, fontSize]);
```

- [ ] **Step 5: 运行 tsc 检查**

```bash
npx tsc --noEmit 2>&1 | head -30
```

预期此步骤会有错误（尚未更新 effects 和 JSX），记录错误类型，继续后续任务。

---

## Task 4: epub.js 初始化 Effect

**Files:**
- Modify: `src/Reader.tsx`

- [ ] **Step 1: 删除旧的 `get_book_contents` effect**

删除：
```typescript
useEffect(() => {
  setLoading(true);
  invoke<BookContents>("get_book_contents", { bookId })
    .then((c) => { setContents(c); setLoading(false); })
    .catch((e) => { setError(String(e)); setLoading(false); });
}, [bookId]);
```

- [ ] **Step 2: 添加 epub.js 初始化 effect**

在删除的位置插入：

```typescript
useEffect(() => {
  if (!containerRef.current) return;
  setLoading(true);
  setError(null);
  setToc([]);
  setProgress(0);
  setCurrentHref("");

  const book = ePub(`epub://localhost/${bookId}/book.epub`);
  bookRef.current = book;

  const rendition = book.renderTo(containerRef.current, {
    flow: "scrolled-continuous",
    width: "100%",
    height: "100%",
  });
  renditionRef.current = rendition;

  // 立即应用初始主题（applyTheme 的 useEffect 触发时 renditionRef 可能还是 null）
  const { theme: t0, fontSize: fs0 } = themeRef.current;
  const initCss = makeThemeCSS(t0, fs0);
  const initBlob = new Blob([initCss], { type: "text/css" });
  const initUrl = URL.createObjectURL(initBlob);
  prevBlobUrlRef.current = initUrl;
  rendition.themes.register("reader", initUrl);
  rendition.themes.select("reader");

  rendition.display().then(() => {
    setLoading(false);
  }).catch((e: unknown) => {
    setError(String(e));
    setLoading(false);
  });

  book.ready.then(async () => {
    setToc(book.navigation.toc as NavItem[]);
    await book.locations.generate(1600);
  }).catch(() => {
    // TOC/locations 失败不影响阅读，忽略
  });

  rendition.on("relocated", (loc: { start: { href: string; percentage: number; cfi: string } }) => {
    setCurrentHref(loc.start.href);
    setProgress(Math.round((loc.start.percentage ?? 0) * 100));
  });

  book.on("openFailed", (e: unknown) => {
    setError(`无法打开书籍：${String(e)}`);
    setLoading(false);
  });

  return () => {
    if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
    book.destroy();
    bookRef.current = null;
    renditionRef.current = null;
  };
}, [bookId]);
```

- [ ] **Step 3: 删除旧的 postMessage 消息监听 effect**

删除：
```typescript
useEffect(() => {
  const handler = (e: MessageEvent) => {
    if (!e.data) return;
    if (e.data.type === "epub-ready") { applyTheme(); return; }
    if (e.data.type !== "epub-navigate") return;
    ...
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}, [applyTheme]);
```

---

## Task 5: 主题注入（rendition.themes）

**Files:**
- Modify: `src/Reader.tsx`

- [ ] **Step 1: 替换 `applyTheme` callback**

删除：
```typescript
const applyTheme = useCallback(() => {
  const { theme, fontSize } = themeRef.current;
  iframeRef.current?.contentWindow?.postMessage(
    { type: "epub-theme", css: makeThemeCSS(theme, fontSize) },
    "*"
  );
}, []);

useEffect(() => { applyTheme(); }, [theme, fontSize, applyTheme]);
```

替换为：
```typescript
const applyTheme = useCallback(() => {
  if (!renditionRef.current) return;
  if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
  const css = makeThemeCSS(theme, fontSize);
  const blob = new Blob([css], { type: "text/css" });
  const url = URL.createObjectURL(blob);
  prevBlobUrlRef.current = url;
  renditionRef.current.themes.register("reader", url);
  renditionRef.current.themes.select("reader");
}, [theme, fontSize]);

useEffect(() => { applyTheme(); }, [theme, fontSize, applyTheme]);
```

注意：`makeThemeCSS` 函数体**保持不变**，`src/__tests__/readerTheme.test.ts` 中的测试继续有效。

- [ ] **Step 2: 运行前端测试确认 makeThemeCSS 测试仍通过**

```bash
npm test
```

Expected: `readerTheme` 的 1 个测试 PASS，`filterBooks` 的所有测试 PASS。

---

## Task 6: 导航 Handlers

**Files:**
- Modify: `src/Reader.tsx`

- [ ] **Step 1: 替换 handlePrev / handleNext**

删除：
```typescript
const handlePrev = useCallback(() => {
  setPendingAnchor("");
  setSpineIndex((i) => Math.max(i - 1, 0));
}, []);

const handleNext = useCallback(() => {
  setPendingAnchor("");
  setSpineIndex((i) => Math.min(i + 1, (contents?.spine.length ?? 1) - 1));
}, [contents]);
```

替换为：
```typescript
const handlePrev = useCallback(() => {
  renditionRef.current?.prev();
}, []);

const handleNext = useCallback(() => {
  renditionRef.current?.next();
}, []);
```

- [ ] **Step 2: 替换 navigateTo**

删除：
```typescript
const navigateTo = useCallback((href: string) => {
  const [hrefBase, anchor] = href.split("#");
  setContents((prev) => {
    if (!prev) return prev;
    const idx = prev.spine.findIndex((s) => s.href === hrefBase);
    if (idx >= 0) {
      setPendingAnchor(anchor ?? "");
      setSpineIndex(idx);
    }
    return prev;
  });
  setShowToc(false);
}, []);
```

替换为：
```typescript
const navigateTo = useCallback((href: string) => {
  renditionRef.current?.display(href);
  setShowToc(false);
}, []);
```

- [ ] **Step 3: 替换键盘导航 effect**

删除：
```typescript
useEffect(() => {
  const total = contents?.spine.length ?? 1;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      setPendingAnchor("");
      setSpineIndex((i) => Math.min(i + 1, total - 1));
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setPendingAnchor("");
      setSpineIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Escape") { setShowToc(false); setShowSettings(false); }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [contents]);
```

替换为：
```typescript
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      renditionRef.current?.next();
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      renditionRef.current?.prev();
    }
    if (e.key === "Escape") { setShowToc(false); setShowSettings(false); }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

---

## Task 7: 更新 TOC 组件和 JSX

**Files:**
- Modify: `src/Reader.tsx`

- [ ] **Step 1: 更新 TocRow 组件签名**

将 `TocRow` 组件的 props 类型从 `TocEntry` 改为 `NavItem`：

```typescript
function TocRow({
  item,
  depth,
  activeHref,
  onNavigate,
}: {
  item: NavItem;          // 原来是 TocEntry
  depth: number;
  activeHref: string;
  onNavigate: (href: string) => void;
})
```

- [ ] **Step 2: 更新 TocRow 内部的 children → subitems**

将：
```typescript
{item.children?.map((sub, i) => (
  <TocRow
    key={i}
    item={sub}
    depth={depth + 1}
    activeHref={activeHref}
    onNavigate={onNavigate}
  />
))}
```

改为：
```typescript
{item.subitems?.map((sub, i) => (
  <TocRow
    key={i}
    item={sub}
    depth={depth + 1}
    activeHref={activeHref}
    onNavigate={onNavigate}
  />
))}
```

- [ ] **Step 3: 更新 JSX 中的动态变量**

在 `return (...)` 块中：

① 删除：
```typescript
const currentItem = contents?.spine[spineIndex];
const iframeSrc = currentItem
  ? `epub://localhost/${bookId}/${currentItem.href}${pendingAnchor ? `#${pendingAnchor}` : ""}`
  : undefined;
const progress =
  contents && contents.spine.length > 1
    ? Math.round((spineIndex / (contents.spine.length - 1)) * 100)
    : 0;
```

（`progress` 已由 relocated event 维护，`iframeSrc` 不再需要。）

② 更新 TOC 列表渲染，将 `contents?.toc.map` 改为 `toc.map`，`currentItem?.href` 改为 `currentHref`：

```tsx
{toc.map((item, i) => (
  <TocRow
    key={i}
    item={item}
    depth={0}
    activeHref={currentHref}
    onNavigate={navigateTo}
  />
))}
```

③ 更新 TOC 按钮显示条件，将 `(contents?.toc.length ?? 0) > 0` 改为 `toc.length > 0`。

④ 更新导航按钮的 `disabled` 属性（epub.js 管理边界，前端不再追踪 index）：

```tsx
<button
  className={`page-nav page-nav--prev ${showUI ? "visible" : ""}`}
  onClick={handlePrev}
  aria-label="上一章"
>
```

```tsx
<button
  className={`page-nav page-nav--next ${showUI ? "visible" : ""}`}
  onClick={handleNext}
  aria-label="下一章"
>
```

（删除 `disabled` prop；epub.js 在书首/尾时 prev()/next() 无操作。）

- [ ] **Step 4: 替换 iframe 为 div 容器**

将：
```tsx
<div className="reader-stage">
  {loading && <div className="reader-loading">加载中…</div>}
  {iframeSrc && (
    <iframe
      ref={iframeRef}
      src={iframeSrc}
      onLoad={applyTheme}
      className="reader-frame"
      title={bookTitle}
    />
  )}
</div>
```

替换为：
```tsx
<div className="reader-stage">
  {loading && <div className="reader-loading">加载中…</div>}
  <div ref={containerRef} className="reader-frame" />
</div>
```

- [ ] **Step 5: 运行 tsc 确认无类型错误**

```bash
npx tsc --noEmit 2>&1
```

Expected: 0 errors。若有残余错误，按报错逐一修复（常见：未使用的变量、类型断言）。

---

## Task 8: 更新 Reader.css

**Files:**
- Modify: `src/Reader.css`

- [ ] **Step 1: 找到 `.reader-frame` 的 CSS 规则**

在 `Reader.css` 中找到 `.reader-frame` 相关规则（原来针对 `<iframe>`）。

- [ ] **Step 2: 更新 `.reader-frame` 样式**

将 `.reader-frame` 的样式改为适合 epub.js div 容器的版本。epub.js 会在这个 div 内部创建并管理 iframe：

```css
.reader-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;  /* epub.js 在 scrolled 模式下内部处理滚动 */
  position: relative;
}
```

若原样式中有 `border: none` 或其他 iframe 专属属性，删除。确保 `.reader-stage` 是 `display: flex; flex-direction: column; flex: 1; overflow: hidden`（让容器占满剩余空间）。

---

## Task 9: 整体验证与提交

- [ ] **Step 1: 运行所有前端测试**

```bash
npm test
```

Expected: 所有测试 PASS（makeThemeCSS + filterBooks）。

- [ ] **Step 2: 运行 Rust 测试**

```bash
cd src-tauri && cargo test --lib 2>&1
```

Expected: 所有保留的 Rust 测试 PASS，无编译警告。

- [ ] **Step 3: 启动开发服务器，手动验证**

```bash
cd .. && npm run tauri dev
```

打开书架，双击一本 EPUB 书籍，验证：
- [ ] 书籍内容正常显示（文字、图片）
- [ ] 滚动正常（不截断，没有双滚动条）
- [ ] 目录面板打开后条目正确，点击跳转有效
- [ ] 主题切换（亮色/米色/深色）生效
- [ ] 字号调大/调小生效
- [ ] 进度条显示合理数值
- [ ] 键盘方向键可翻章节

- [ ] **Step 4: 提交所有变更**

```bash
git add src/Reader.tsx src/Reader.css
git commit -m "feat: 用 epub.js 替换 iframe+postMessage EPUB 渲染，提升复杂 EPUB 兼容性"
```
