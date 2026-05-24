# Liquid Glass UI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将侧边栏、右键菜单、阅读器目录面板和设置面板迁移为 Liquid Glass 毛玻璃风格，支持深浅模式跟随系统。

**Architecture:** 纯 CSS 改动，不涉及任何 JS/TSX/Rust 变更。`backdrop-filter` 在 Tauri 的 macOS WebKit 渲染器中原生支持。深色模式用 `@media (prefers-color-scheme: dark)` 块覆盖，不引入新 CSS 变量。

**Tech Stack:** CSS (`backdrop-filter`, `rgba`, `::before` 伪元素), Tauri 2 / macOS WebKit

---

## 文件清单

| 文件 | 变更 |
|------|------|
| `src/App.css` | 修改 `.sidebar`、`.sidebar-item.active`、`.context-menu`、`.context-menu button:hover`；新增 `::before` 高光线；新增 dark-mode 覆盖块 |
| `src/Reader.css` | 修改 `.toc-panel`、`.toc-panel--light/sepia/dark`、`.reader-settings`、`.reader-settings--light/sepia/dark`；新增 `::before` 高光线 |

---

## Task 1: 侧边栏毛玻璃（App.css）

**Files:**
- Modify: `src/App.css` — `.sidebar` 区块（约 161–169 行）及 `.sidebar-item.active`（约 206–210 行）

- [ ] **Step 1: 替换 `.sidebar` 规则**

将 `src/App.css` 中的 `.sidebar` 整块替换为：

```css
/* Sidebar */
.sidebar {
  width: var(--sidebar-width);
  position: relative;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.70);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
  padding: 16px 8px;
  overflow-y: auto;
  flex-shrink: 0;
  margin: 8px 0 8px 8px;
}

.sidebar::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 12px 12px 0 0;
  pointer-events: none;
}
```

- [ ] **Step 2: 替换 `.sidebar-item.active` 规则**

将当前：
```css
.sidebar-item.active {
  background: var(--accent);
  color: #000;
  font-weight: 600;
}
```
替换为：
```css
.sidebar-item.active {
  background: rgba(255, 159, 10, 0.15);
  color: #ff9f0a;
  font-weight: 600;
}
```

- [ ] **Step 3: 在 `@media (prefers-color-scheme: light)` 之后、Scrollbar 规则之前，添加深色覆盖块**

在 `src/App.css` 末尾的 `/* Scrollbar */` 区块**之前**插入：

```css
/* ── Dark mode: sidebar glass ─────────────────────────────── */
@media (prefers-color-scheme: dark) {
  .sidebar {
    background: rgba(40, 40, 44, 0.60);
    border-color: rgba(255, 255, 255, 0.10);
    box-shadow: 0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.18);
  }
  .sidebar::before {
    background: rgba(255, 255, 255, 0.10);
  }
}
```

- [ ] **Step 4: 视觉验证**

运行：
```bash
npm run dev
```
在 `http://localhost:1420` 打开浏览器（UI-only，无需 Rust）：
- 浅色系统模式：侧边栏应呈半透明白色毛玻璃，圆角，有轻微投影，不贴窗口左边缘
- 深色系统模式：侧边栏应呈深色半透明，边框几乎不可见
- 当前选中项应为橙色文字 + 淡橙色背景，而非实心橙底黑字

- [ ] **Step 5: 提交**

```bash
git add src/App.css
git commit -m "style: 侧边栏 Liquid Glass 悬浮面板效果"
```

---

## Task 2: 右键菜单毛玻璃（App.css）

**Files:**
- Modify: `src/App.css` — `.context-menu` 及 `.context-menu button:hover`

- [ ] **Step 1: 替换 `.context-menu` 规则**

将当前 `.context-menu` 整块替换为：

```css
.context-menu {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.20);
  overflow: hidden;
  z-index: 101;
  min-width: 160px;
}

.context-menu::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.90);
  border-radius: 12px 12px 0 0;
  pointer-events: none;
  z-index: 1;
}
```

- [ ] **Step 2: 替换 `.context-menu button:hover`**

将当前：
```css
.context-menu button:hover {
  background: var(--bg-tertiary);
}
```
替换为：
```css
.context-menu button:hover {
  background: rgba(0, 0, 0, 0.06);
}
```

- [ ] **Step 3: 追加深色覆盖到已有 dark sidebar 块中**

将 Task 1 Step 3 中新增的 dark 媒体查询块**扩展**为：

```css
/* ── Dark mode: glass panels ──────────────────────────────── */
@media (prefers-color-scheme: dark) {
  .sidebar {
    background: rgba(40, 40, 44, 0.60);
    border-color: rgba(255, 255, 255, 0.10);
    box-shadow: 0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.18);
  }
  .sidebar::before {
    background: rgba(255, 255, 255, 0.10);
  }
  .context-menu {
    background: rgba(36, 36, 40, 0.75);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 12px 40px rgba(0,0,0,0.45);
  }
  .context-menu::before {
    background: rgba(255, 255, 255, 0.12);
  }
  .context-menu button:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}
```

（替换 Task 1 Step 3 写入的旧 dark 块，而不是追加第二个。）

- [ ] **Step 4: 视觉验证**

在 `http://localhost:1420` 右键点击任意书卡：
- 浅色：菜单呈半透明白色毛玻璃，圆角更大，背景书架隐约透过
- 深色：菜单呈深色半透明，无边框感
- hover 行为正常

- [ ] **Step 5: 提交**

```bash
git add src/App.css
git commit -m "style: 右键菜单 Liquid Glass 效果"
```

---

## Task 3: 阅读器目录面板毛玻璃（Reader.css）

**Files:**
- Modify: `src/Reader.css` — `.toc-panel`、`.toc-panel--light`、`.toc-panel--sepia`、`.toc-panel--dark`

- [ ] **Step 1: 给 `.toc-panel` 基础规则加上 `backdrop-filter` 和 `position: relative`**

找到 `.toc-panel` 规则（约 384–401 行），添加两行：

```css
.toc-panel {
  position: fixed;
  top: 48px;
  left: 12px;
  width: 272px;
  max-height: calc(100vh - 60px);
  border-radius: 12px;
  z-index: 45;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: translateX(calc(-100% - 24px));
  opacity: 0;
  transition: transform 0.26s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease;
  pointer-events: none;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(32px) saturate(160%);
  -webkit-backdrop-filter: blur(32px) saturate(160%);
}
```

（与原规则相同，仅在末尾追加 `backdrop-filter` 和 `-webkit-backdrop-filter` 两行。）

- [ ] **Step 2: 更新三个主题变体的背景和边框**

将当前三个主题块整体替换：

```css
/* Theme variants */
.toc-panel--light {
  background: rgba(250, 248, 244, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.65);
  color: #1a1a1a;
}

.toc-panel--sepia {
  background: rgba(246, 240, 230, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.60);
  color: #3b2d1f;
}

.toc-panel--dark {
  background: rgba(36, 36, 40, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #e0e0e0;
}
```

- [ ] **Step 3: 在 Reader.css 末尾追加目录面板高光线**

```css
/* ── TOC panel highlight line ────────────────────────────── */
.toc-panel--light::before,
.toc-panel--sepia::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.80);
  border-radius: 12px 12px 0 0;
  pointer-events: none;
}

.toc-panel--dark::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12px 12px 0 0;
  pointer-events: none;
}
```

- [ ] **Step 4: 视觉验证**

运行 `npm run tauri dev`，打开任意书籍进入阅读器，点击目录按钮：
- 浅色主题：目录面板应半透明，阅读内容隐约透过，顶部有白色高光线
- 深色主题：深色半透明玻璃，高光线极淡
- 动画进出效果正常

- [ ] **Step 5: 提交**

```bash
git add src/Reader.css
git commit -m "style: 阅读器目录面板 Liquid Glass 增强"
```

---

## Task 4: 阅读器设置面板毛玻璃（Reader.css）

**Files:**
- Modify: `src/Reader.css` — `.reader-settings`、`.reader-settings--light`、`.reader-settings--sepia`、`.reader-settings--dark`

- [ ] **Step 1: 更新 `.reader-settings--light` / `.reader-settings--sepia` 共用规则**

将当前：
```css
.reader-settings--light,
.reader-settings--sepia {
  background: rgba(252, 250, 246, 0.96);
  border: 1px solid rgba(0, 0, 0, 0.09);
  color: #1a1a1a;
  backdrop-filter: blur(24px);
}
```
替换为：
```css
.reader-settings--light,
.reader-settings--sepia {
  background: rgba(252, 250, 246, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.65);
  color: #1a1a1a;
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
}
```

- [ ] **Step 2: 更新 `.reader-settings--dark`**

将当前：
```css
.reader-settings--dark {
  background: rgba(38, 38, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e5e5e5;
  backdrop-filter: blur(24px);
}
```
替换为：
```css
.reader-settings--dark {
  background: rgba(38, 38, 42, 0.80);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #e5e5e5;
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
}
```

- [ ] **Step 3: 在 Reader.css 末尾追加设置面板高光线**

（接着 Task 3 Step 3 新增的块之后：）

```css
/* ── Settings panel highlight line ──────────────────────── */
.reader-settings--light::before,
.reader-settings--sepia::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.80);
  border-radius: 14px 14px 0 0;
  pointer-events: none;
}

.reader-settings--dark::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 14px 14px 0 0;
  pointer-events: none;
}
```

- [ ] **Step 4: 视觉验证**

在阅读器中点击右上角 "AA" 按钮打开设置面板：
- 浅色/米色主题：面板背景更通透，阅读器内容隐约透过，顶部高光线可见
- 深色主题：深色半透明，高光线极淡
- 主题切换（浅/米色/深色）、字号调节功能正常

- [ ] **Step 5: 最终提交**

```bash
git add src/Reader.css
git commit -m "style: 阅读器设置面板 Liquid Glass 增强"
```

---

## 完成标准

- [ ] `npm run dev` 无编译错误
- [ ] 浅色系统模式下，侧边栏和三个浮层面板均呈半透明毛玻璃
- [ ] 深色系统模式下，所有面板均有对应深色半透明效果
- [ ] 书架主内容区、书卡、标题栏、阅读器主体外观不变
- [ ] 所有浮层的功能（目录跳转、主题切换、右键菜单操作）正常
