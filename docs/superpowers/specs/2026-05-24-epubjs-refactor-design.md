# epub.js 渲染重构设计

**日期**：2026-05-24  
**动机**：当前手写 iframe + postMessage 方案对复杂 EPUB（复杂 CSS/布局）兼容性不足；epub.js 接管内容解析与渲染，Rust 侧只保留文件服务。  
**渲染模式**：Continuous（滚动），与现在一致，不引入翻页动画。

---

## 架构分工

| 层 | 之前 | 之后 |
|---|---|---|
| Rust — 元数据提取 | `extract_epub_metadata` | 不变 |
| Rust — 内容解析 | `parse_epub_contents` → spine + TOC | **删除**，epub.js 接管 |
| Rust — 文件服务 | epub:// 逐文件提取 + 脚本注入 | **精简**：仅保留 `book.epub` 全量 binary 端点 |
| Rust — 命令 | `get_book_contents` | **删除** |
| Frontend — 渲染 | `<iframe>` + postMessage + spine 索引 | epub.js `rendition` 管理的 div 容器 |
| Frontend — TOC | Rust 返回的 `TocEntry[]` | `book.navigation.toc`（epub.js 原生） |
| Frontend — 主题 | postMessage 注入 CSS | `rendition.themes.register` + `select` |
| Frontend — 进度 | spine index / total | epub.js CFI locations |

## 数据流

```
打开书籍
  → open_reader_window（不变）
  → Reader.tsx 挂载
  → ePub("epub://localhost/{id}/book.epub")
      epub.js 通过 fetch() 拉取全量 binary
      内部 JSZip 解压，用 blob URL 提供图片/CSS
  → book.renderTo(containerDiv, { flow: "scrolled" })
  → book.ready
      → setToc(book.navigation.toc)
      → book.locations.generate(1600)
  → rendition.on("relocated") → 更新 currentCfi / progress
  → 主题/字号变化 → rendition.themes.register + select
```

---

## Rust 变化

### 删除
- `SpineItem` / `TocEntry` / `BookContents` 类型
- `nav_point_to_toc_entry`
- `parse_epub_contents`
- `inject_reader_script`
- `READER_SCRIPT` 常量
- `get_book_contents` 命令（从 `generate_handler!` 移除）
- `serve_epub_protocol` 中逐文件提取分支（ZipArchive 相关代码）
- `parse_epub_uri`
- `mime_type_for`

### 保留/精简后的 `serve_epub_protocol`

只保留全量 binary 端点：

```rust
fn serve_epub_protocol(ctx, request) -> Response {
    let (book_id, _) = parse_epub_uri(&uri);   // 只取 book_id
    let book = library.books.iter().find(|b| b.id == book_id)?;
    match fs::read(&book.path) {
        Ok(bytes) => Response { status: 200, Content-Type: "application/epub+zip", body: bytes }
        Err(_)    => Response { status: 500 }
    }
}
```

注：`parse_epub_uri` 整个函数删除，直接内联为：`let book_id = uri.trim_start_matches("epub://localhost/").split('/').next().unwrap_or("")`。

### 保留不变
- Library 管理命令（`import_folder` / `get_library` / `remove_book` / `remove_folder` / `refresh_folder`）
- `extract_epub_metadata`
- `open_reader_window`
- 与 Library 和元数据相关的单元测试
- `scan_folder_for_epubs`

### 删除的单元测试
- `book_id_extracted_with_epub_suffix` / `book_id_extracted_bare` 等 URI 解析测试
- `file_path_extracted` 测试

---

## Frontend 变化（Reader.tsx）

### 新增依赖

```
npm install epubjs
npm install --save-dev @types/epubjs
```

### 删除
- `SpineItem` / `TocEntry` / `BookContents` 类型及 `invoke("get_book_contents")`
- `iframeRef` / `spineIndex` / `pendingAnchor` 状态
- `applyTheme` callback 及所有 postMessage 收发逻辑
- `<iframe>` 元素
- `handlePrev` / `handleNext` 中对 `spineIndex` 的直接操作
- `makeThemeCSS` 函数（CSS 字符串生成逻辑保留，改名或内联）

### 新增状态

```typescript
const bookRef = useRef<Book | null>(null)
const renditionRef = useRef<Rendition | null>(null)
const containerRef = useRef<HTMLDivElement>(null)
const [toc, setToc] = useState<NavItem[]>([])
const [currentCfi, setCurrentCfi] = useState("")
const [progress, setProgress] = useState(0)
```

### 初始化（useEffect on bookId）

```typescript
const book = ePub(`epub://localhost/${bookId}/book.epub`)
bookRef.current = book

const rendition = book.renderTo(containerRef.current!, {
  flow: "scrolled",
  width: "100%",
  height: "100%",
  allowScriptedContent: false,
})
renditionRef.current = rendition

rendition.display()

book.ready.then(async () => {
  setToc(book.navigation.toc)
  await book.locations.generate(1600)
})

rendition.on("relocated", (loc: Location) => {
  setCurrentCfi(loc.start.cfi)
  setProgress(Math.round(book.locations.percentageFromCfi(loc.start.cfi) * 100))
})

// 初始主题
applyTheme()

return () => { book.destroy() }
```

### 主题注入

```typescript
const applyTheme = useCallback(() => {
  renditionRef.current?.themes.register("reader", { "body": { ... } })
  renditionRef.current?.themes.select("reader")
}, [theme, fontSize])

useEffect(() => { applyTheme() }, [theme, fontSize])
```

主题 CSS 以 epub.js themes 格式（对象 or 字符串均支持）注入，无需 postMessage。

### 导航

```typescript
const handlePrev = () => renditionRef.current?.prev()
const handleNext = () => renditionRef.current?.next()
const navigateTo = (href: string) => {
  renditionRef.current?.display(href)
  setShowToc(false)
}
```

键盘事件：ArrowRight/ArrowDown/Space → `rendition.next()`，ArrowLeft/ArrowUp → `rendition.prev()`。

### TOC 组件适配

`TocRow` 中 `item.children` 改为 `item.subitems`（epub.js `NavItem` 字段名）；`activeHref` 对比逻辑改为与 `currentCfi` 比较或保持 href 比较（epub.js `NavItem.href` 仍是文件路径）。

### Reader 容器

```tsx
<div className="reader-stage">
  <div ref={containerRef} className="reader-frame" />
</div>
```

`reader-frame` CSS 改为 `width: 100%; height: 100%; overflow: auto`，epub.js 在其内部创建并管理 iframe。

---

## 保留不变的 UI

- Liquid Glass TOC 面板、设置面板、顶栏、底栏进度条
- 主题切换（light / sepia / dark）、字号调节
- 拖拽条、Auto-hide UI chrome
- Reader.css 整体不改

---

## 风险与处理

| 风险 | 处理 |
|---|---|
| Tauri 2 webview 的 fetch() 无法访问 `epub://` 自定义 scheme | 启动时验证；若失败，切换到方案 B（Tauri command 返回 ArrayBuffer） |
| epub.js themes API 与 CSS 字符串不兼容 | epub.js 同时支持对象和字符串格式，优先用对象格式以保证类型安全 |
| `book.locations.generate` 对大书耗时 | 异步执行，生成完成前 progress 显示 0%，不阻塞渲染 |
| `@types/epubjs` 类型不完整 | 缺失类型用 `// @ts-ignore` 或局部 `.d.ts` 补充 |
