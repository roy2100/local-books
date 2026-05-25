import { Play, Pause, Square } from "lucide-react";
import { TTS_VOICES, type TTSStatus } from "./hooks/useTTS";
import type { Theme } from "./readerTheme";

interface Props {
  theme: Theme;
  status: TTSStatus;
  voice: string;
  setVoice: (v: string) => void;
  rate: number;
  setRate: (r: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

// rate 值对应倍速: (100 + rate) / 100 = 0.5/0.75/0.9/1.0/1.25/1.5/1.75/2.0
const SPEED_RATES = [-50, -25, -10, 0, 25, 50, 75, 100];

const STATUS_LABEL: Record<TTSStatus, string> = {
  idle:    "就绪",
  loading: "合成中…",
  playing: "正在播放",
  paused:  "已暂停",
  error:   "出错",
};

export function TTSPanel({
  theme, status, voice, setVoice, rate, setRate,
  onPlay, onPause, onResume, onStop,
}: Props) {
  const isPlaying = status === "playing";
  const isLoading = status === "loading";
  const canStop   = status !== "idle" && status !== "error";

  const displayRate = ((100 + rate) / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "x";

  const handlePlayPause = () => {
    if (isPlaying) onPause();
    else if (status === "paused") onResume();
    else onPlay();
  };

  return (
    <div className={`tts-panel tts-panel--${theme}`}>
      {/* Status row */}
      <div className="tts-status-row">
        <span className={`tts-status-dot tts-status-dot--${status}`} />
        <span className="tts-status-label">{STATUS_LABEL[status]}</span>
      </div>

      {/* Playback controls */}
      <div className="tts-controls">
        <button
          className="tts-ctrl-btn"
          onClick={handlePlayPause}
          disabled={isLoading}
          title={isPlaying ? "暂停" : status === "paused" ? "继续" : "播放"}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          className="tts-ctrl-btn"
          onClick={onStop}
          disabled={!canStop}
          title="停止"
        >
          <Square size={16} />
        </button>
      </div>

      <div className="settings-divider" />

      {/* Voice selection */}
      <div className="settings-row">
        <span className="settings-label">音色</span>
      </div>
      <div className="tts-voice-chips">
        {TTS_VOICES.map((v) => (
          <button
            key={v.id}
            className={`flow-chip ${voice === v.id ? "active" : ""}`}
            onClick={() => setVoice(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="settings-divider" />

      {/* Speed control */}
      <div className="settings-row">
        <span className="settings-label">语速</span>
        <div className="settings-stepper">
          <button
            className="stepper-btn"
            onClick={() => { const i = SPEED_RATES.indexOf(rate); if (i > 0) setRate(SPEED_RATES[i - 1]); }}
            disabled={rate <= SPEED_RATES[0]}
          >−</button>
          <span className="stepper-val">{displayRate}</span>
          <button
            className="stepper-btn"
            onClick={() => { const i = SPEED_RATES.indexOf(rate); if (i < SPEED_RATES.length - 1) setRate(SPEED_RATES[i + 1]); }}
            disabled={rate >= SPEED_RATES[SPEED_RATES.length - 1]}
          >+</button>
        </div>
      </div>
    </div>
  );
}
