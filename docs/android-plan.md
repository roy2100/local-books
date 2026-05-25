# Android 最小化支持计划

## 障碍分析

| 障碍 | 说明 | 影响 |
|------|------|------|
| **多窗口** | `open_reader_window` 创建新 WebviewWindow，Android 不支持 | 最大改动 |
| **文件夹选择** | `pick_folder` 依赖桌面文件系统语义，Android 无法选择文件夹 | 导入流程重写 |
| **macOS 专属 UI** | `titleBarStyle: Overlay`、窗口拖拽、hover 交互 | 条件适配 |

---

## Phase 0 — 环境准备（约 0.5 天）

```bash
brew install --cask android-studio   # Android SDK + NDK
npm run tauri android init           # 生成 gen/android/ 骨架
```

产出：能让 `npm run tauri android dev` 跑起来（即使功能不完整）

---

## Phase 1 — Rust 后端平台条件编译（约 1 天）

### 1.1 新增 Android 文件导入命令

Android 选择单个/多个 `.epub` 文件 → 复制到 `app_data_dir/books/` → 调用现有 `extract_epub_metadata`

```rust
#[cfg(target_os = "android")]
#[tauri::command]
async fn import_epub_files(app: AppHandle, file_paths: Vec<String>) -> Result<Library, String>
```

### 1.3 `open_reader_window` 平台分支

Android 上不创建新窗口，改为返回 book_id 让前端自行切换视图：

```rust
#[cfg(target_os = "android")]
async fn open_reader_window(...) -> Result<String, String> {
    Ok(book_id)  // 前端接到后自行导航
}
```

---

## Phase 2 — Tauri 配置适配（约 0.5 天）

### 2.1 新增 Android capabilities

`src-tauri/capabilities/android.json` — 去掉 `core:window:allow-start-dragging`，保留文件选择权限，加 `tauri-plugin-fs` 读取权限。

### 2.2 `tauri.conf.json` 清理

去掉 `minWidth`/`minHeight`（移动端无意义）。`titleBarStyle` Tauri 2 在移动端会自动忽略，无需特殊处理。

---

## Phase 3 — 前端单窗口架构（约 1.5 天，最核心改动）

**当前流程：** `BookCard 双击` → `invoke("open_reader_window")` → 新 WebviewWindow

**Android 流程：** `BookCard 点击` → `invoke("open_reader_window")` → 前端状态切换视图

### 3.1 `App.tsx` 添加路由状态

```tsx
const isMobile = await platform() === 'android';

const [view, setView] = useState<'shelf' | 'reader'>('shelf');
const [readerBookId, setReaderBookId] = useState<string | null>(null);
```

### 3.2 `Bookshelf.tsx` 中的 `openBook` 函数

```tsx
const openBook = async (book: Book) => {
  if (isMobile) {
    setReaderBookId(book.id);
    setView('reader');
  } else {
    await invoke("open_reader_window", { bookId: book.id });
  }
};
```

### 3.3 Reader 组件复用

`Reader.tsx` 已通过 `window.__READER_BOOK_ID__` 获取 bookId，改为也接受 props 传入的 bookId，两种模式均可工作。

---

## Phase 4 — 触摸交互适配（约 1 天）

### 4.1 阅读器翻页手势

在 `useFoliate.ts` 或 `Reader.tsx` 添加 touch 事件：

```tsx
// swipe left → next, swipe right → prev
onTouchStart / onTouchEnd  差值判断方向
```

foliate-js 的 `view.prev()` / `view.next()` 直接复用。

### 4.2 UI 控制栏显示方式

- 当前：鼠标移动触发 `useAutoHideUI`
- Android：改为点击页面中央区域切换显示/隐藏（tap 而非 hover）

### 4.3 书架导入按钮

Android 上隐藏"添加文件夹"按钮，改为"选择 EPUB 文件"按钮（调用新的 `import_epub_files` 命令）。

---

## Phase 5 — Android 系统集成（约 0.5 天）

- **返回键**：监听 Tauri 的 `back-requested` 事件，阅读器内按返回键回到书架
- **安全区域**：CSS `env(safe-area-inset-*)` 处理刘海屏和底部导航栏
- **应用图标**：补充 Android 所需尺寸图标（`mipmap-*` 系列）

---

## 功能范围

| 功能 | Android | 说明 |
|------|---------|------|
| 浏览书架 | ✅ | 完整保留 |
| 导入 EPUB | ✅ | 文件选择替代文件夹选择 |
| 阅读 EPUB | ✅ | foliate-js 完整保留 |
| TOC / 进度 | ✅ | 完整保留 |
| 主题 / 字体 | ✅ | 完整保留 |
| 繁简搜索 | ✅ | 完整保留 |
| TTS 朗读 | ✅ | msedge-tts 纯网络调用，Android 可用 |
| 多窗口阅读 | ❌ | 改为单窗口内导航 |
| 文件夹监控 | ❌ | Android 无持久化文件夹访问 |

---

## 总工作量

约 **4.5 天**，主要风险在 Phase 3（单窗口架构重构）。建议按阶段推进，每个 Phase 独立可验证。
