# Liquid Glass UI — 设计规格

**日期**: 2026-05-24  
**范围**: App（书架）+ Reader（阅读器）

---

## 目标

将 local_books 的 UI 迁移到 Liquid Glass 风格，参考 macOS 26 Apple Books 的设计语言。  
采用轻度方案：**仅侧边栏和浮层面板应用毛玻璃效果**，主内容区和阅读器主体不动。  
深浅模式均支持，跟随系统 `prefers-color-scheme`。

---

## 受影响的组件

### 1. 侧边栏（`App.css` → `.sidebar`）

**目标**: 悬浮圆角毛玻璃面板，视觉上脱离窗口边缘。

布局调整：
- `position: relative`（伪元素高光线依赖定位上下文）
- `margin: 8px 0 8px 8px`（顶/底/左各留 8px 间距）
- `border-radius: 12px`
- 移除 `border-right: 1px solid var(--border)`（右边框由投影代替）

玻璃效果：
- `backdrop-filter: blur(28px) saturate(160%)`
- 浅色：`background: rgba(255, 255, 255, 0.55)`
- 深色：`background: rgba(40, 40, 44, 0.60)`
- 浅色 border：`1px solid rgba(255, 255, 255, 0.70)`
- 深色 border：`1px solid rgba(255, 255, 255, 0.10)`
- `box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)`

顶部高光线（伪元素）：
```css
.sidebar::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 12px 12px 0 0;
}
```

Active 状态调整：
- 从实心橙色背景改为 `background: rgba(255, 159, 10, 0.15); color: #ff9f0a`
- 与玻璃面板搭配更协调

内容区补偿：
- `.content` 的 `padding-left` 维持现有值（侧边栏仍在 flex 流中，不变）

---

### 2. 右键菜单（`App.css` → `.context-menu`）

**目标**: 毛玻璃弹出菜单，替换当前的实色背景。

- `backdrop-filter: blur(24px) saturate(150%)`
- 浅色：`background: rgba(255, 255, 255, 0.65)`
- 深色：`background: rgba(36, 36, 40, 0.75)`
- 浅色 border：`1px solid rgba(255, 255, 255, 0.55)`
- 深色 border：`1px solid rgba(255, 255, 255, 0.12)`
- `border-radius: 12px`（从 10px 微调）
- `box-shadow: 0 12px 40px rgba(0,0,0,0.20)`
- 顶部 1px 高光线（同侧边栏）

hover 行为：
- 浅色：`background: rgba(0, 0, 0, 0.06)`
- 深色：`background: rgba(255, 255, 255, 0.08)`

---

### 3. 阅读器·目录面板（`Reader.css` → `.toc-panel`）

**目标**: 增强现有的玻璃效果。

- `backdrop-filter: blur(32px) saturate(160%)`（从无 blur 升级）
- 浅色（`.toc-panel--light`）：`background: rgba(250, 248, 244, 0.75)`，border `rgba(255,255,255,0.65)`
- 米色（`.toc-panel--sepia`）：`background: rgba(246, 240, 230, 0.75)`，border `rgba(255,255,255,0.60)`
- 深色（`.toc-panel--dark`）：`background: rgba(36, 36, 40, 0.78)`，border `rgba(255,255,255,0.10)`
- 顶部 1px 高光线（`::before` 伪元素，仅浅色/米色主题用白色高光，深色用 `rgba(255,255,255,0.15)`）

---

### 4. 阅读器·设置面板（`Reader.css` → `.reader-settings`）

**目标**: 同目录面板，增强玻璃效果。

- `backdrop-filter: blur(28px) saturate(160%)`
- 浅色/米色（`.reader-settings--light/.reader-settings--sepia`）：`background: rgba(252, 250, 246, 0.78)`
- 深色（`.reader-settings--dark`）：`background: rgba(38, 38, 42, 0.80)`
- border 和高光线同上

---

## 不变的部分

| 组件 | 原因 |
|------|------|
| 标题栏 | 当前实色符合 macOS overlay title bar 规范 |
| 书架主内容区 | 保持干净，书封面是视觉焦点 |
| 书卡（BookCard） | 不变，保持书封面的视觉纯粹性 |
| 阅读器主体 | 阅读区域追求纯净，不引入干扰 |

---

## CSS 变量策略

不引入新变量，复用现有 `--bg`, `--border`, `--bg-secondary`。  
玻璃效果用内联 `rgba()` 值直接写，通过 `@media (prefers-color-scheme: dark)` 块覆盖。

---

## 实现范围

- 修改文件：`src/App.css`、`src/Reader.css`  
- 不涉及 Rust、tauri.conf.json、任何 JS/TSX 逻辑变更  
- 窗口保持不透明（无需 `transparent: true`），`backdrop-filter` 在 Tauri WebKit 中原生支持
