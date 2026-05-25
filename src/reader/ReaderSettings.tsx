import type { Theme, FontStyle, WritingMode } from "./readerTheme";

interface Props {
  theme: Theme;
  setTheme: (t: Theme) => void;
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  flow: "scrolled" | "paginated";
  setFlow: (f: "scrolled" | "paginated") => void;
  fontStyle: FontStyle;
  setFontStyle: (s: FontStyle) => void;
  writingMode: WritingMode | null;
  setWritingMode: (m: WritingMode | null) => void;
  t2sEnabled: boolean;
  setT2SEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ReaderSettings({
  theme, setTheme,
  fontSize, setFontSize,
  flow, setFlow,
  fontStyle, setFontStyle,
  writingMode, setWritingMode,
  t2sEnabled, setT2SEnabled,
}: Props) {
  return (
    <div className={`reader-settings reader-settings--${theme}`}>
      <div className="settings-row">
        <span className="settings-label">字体大小</span>
        <div className="settings-stepper">
          <button onClick={() => setFontSize((s) => Math.max(12, s - 2))} className="stepper-btn">A−</button>
          <span className="stepper-val">{fontSize}</span>
          <button onClick={() => setFontSize((s) => Math.min(36, s + 2))} className="stepper-btn">A+</button>
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-row">
        <span className="settings-label">主题</span>
        <div className="theme-chips">
          {(["light", "sepia", "dark"] as Theme[]).map((t) => (
            <button
              key={t}
              className={`theme-chip theme-chip--${t} ${theme === t ? "active" : ""}`}
              onClick={() => setTheme(t)}
              title={t === "light" ? "白色" : t === "sepia" ? "米色" : "深色"}
            />
          ))}
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-row">
        <span className="settings-label">翻页方式</span>
        <div className="flow-chips">
          <button
            className={`flow-chip ${flow === "scrolled" ? "active" : ""}`}
            onClick={() => setFlow("scrolled")}
            title="滚动"
          >滚动</button>
          <button
            className={`flow-chip ${flow === "paginated" ? "active" : ""}`}
            onClick={() => setFlow("paginated")}
            title="翻页"
          >翻页</button>
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-row">
        <span className="settings-label">字体</span>
        <div className="flow-chips">
          <button
            className={`flow-chip ${fontStyle === "serif" ? "active" : ""}`}
            onClick={() => setFontStyle("serif")}
            title="思源宋体"
          >宋体</button>
          <button
            className={`flow-chip ${fontStyle === "sans" ? "active" : ""}`}
            onClick={() => setFontStyle("sans")}
            title="思源黑体"
          >黑体</button>
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-row">
        <span className="settings-label">排版方向</span>
        <div className="flow-chips">
          <button
            className={`flow-chip ${writingMode === null ? "active" : ""}`}
            onClick={() => setWritingMode(null)}
            title="跟随书籍原始排版"
          >自动</button>
          <button
            className={`flow-chip ${writingMode === "horizontal" ? "active" : ""}`}
            onClick={() => setWritingMode("horizontal")}
            title="横排"
          >横排</button>
          <button
            className={`flow-chip ${writingMode === "vertical" ? "active" : ""}`}
            onClick={() => setWritingMode("vertical")}
            title="竖排"
          >竖排</button>
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-row">
        <span className="settings-label">繁简转换</span>
        <div className="flow-chips">
          <button
            className={`flow-chip ${t2sEnabled ? "active" : ""}`}
            onClick={() => setT2SEnabled(s => !s)}
            title="繁体转简体"
          >繁→简</button>
        </div>
      </div>
    </div>
  );
}
