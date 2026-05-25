# TTS 朗读功能实现计划

## 架构

- **Rust 后端**：使用 `msedge-tts` crate（封装逆向的 Microsoft Edge TTS WebSocket API），Tauri command `tts_synthesize` 返回 base64 MP3
- **前端 Hook** `useTTS`：管理分句队列、invoke 调用、`<audio>` 元素播放
- **浮窗** `TTSPanel`：控制播放状态和设置，样式与 `ReaderSettings` 统一

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src-tauri/Cargo.toml` | 新增 `msedge-tts` 依赖 |
| `src-tauri/src/lib.rs` | 新增 `tts_synthesize` command |
| `src/reader/hooks/useTTS.ts` | 新建 |
| `src/reader/TTSPanel.tsx` | 新建 |
| `src/reader/Reader.tsx` | 添加 TTS 按钮 + 集成 Hook |
| `src/reader/Reader.css` | 添加 TTS 相关样式 |

## Rust 后端

```toml
# Cargo.toml
msedge-tts = { version = "0.3", features = ["tokio-runtime"] }
```

```rust
// lib.rs — 新增 command
#[tauri::command]
async fn tts_synthesize(text: String, voice: String, rate: i32, pitch: i32) -> Result<String, String> {
    use msedge_tts::tts::SpeechConfig;
    let config = SpeechConfig {
        voice_name: voice,
        audio_format: "audio-24khz-48kbitrate-mono-mp3".to_string(),
        pitch,
        rate,
        volume: 0,
    };
    let mut client = msedge_tts::tts::client::connect_async()
        .await.map_err(|e| e.to_string())?;
    let audio = client.synthesize(&[text.as_str()], &config)
        .await.map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&audio.audio_bytes))
}
```

## 前端 useTTS Hook

```typescript
export type TTSStatus = "idle" | "loading" | "playing" | "paused" | "error";

export const TTS_VOICES = [
  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓" },
  { id: "zh-CN-YunxiNeural",    label: "云希" },
  { id: "zh-CN-XiaoyiNeural",   label: "晓伊" },
  { id: "zh-TW-HsiaoChenNeural",label: "曉臻" },
  { id: "zh-TW-YunJheNeural",   label: "雲哲" },
];
```

分句策略：按 `。！？…\n.!?` 分句，合并至不超过 400 字符/句。

播放流水线：合成第一句 → 播放 → 同时预取第二句 → 无缝衔接。

## TTSPanel UI

```
● 状态文字
[ ▶ 播放/⏸ 暂停 ]  [ ⏹ 停止 ]
────
音色：晓晓 云希 晓伊 曉臻 雲哲
────
语速：[ − ]  1.0x  [ + ]
```

位置：`top: 58px; right: 60px; width: 260px`（AA 面板左侧）

## 速度映射

| 显示  | rate 值 | 
|-------|---------|
| 0.5x  |  -50    |
| 0.75x |  -25    |
| 1.0x  |    0    |
| 1.25x |  +25    |
| 1.5x  |  +50    |
| 2.0x  | +100    |

公式：`displayX = (100 + rate) / 100`
