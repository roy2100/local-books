import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export type TTSStatus = "idle" | "loading" | "playing" | "paused" | "error";

export const TTS_VOICES = [
  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓" },
  { id: "zh-CN-YunxiNeural",    label: "云希" },
  { id: "zh-CN-XiaoyiNeural",   label: "晓伊" },
  { id: "zh-TW-HsiaoChenNeural",label: "曉臻" },
  { id: "zh-TW-YunJheNeural",   label: "雲哲" },
] as const;

export interface UseTTSResult {
  status: TTSStatus;
  voice: string;
  setVoice: (v: string) => void;
  rate: number;
  setRate: (r: number) => void;
  play: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

// Split text into chunks at sentence boundaries, merging short pieces up to maxLen.
function splitChunks(text: string, maxLen = 400): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  // Split at Chinese/English sentence-ending punctuation
  const parts = cleaned.split(/(?<=[。！？…\n.!?])\s*/);
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    if (!part.trim()) continue;
    if (current.length + part.length > maxLen && current) {
      chunks.push(current.trim());
      current = part;
    } else {
      current += part;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function useTTS(): UseTTSResult {
  const [status, setStatus] = useState<TTSStatus>("idle");
  const [voice, setVoice] = useState("zh-CN-XiaoxiaoNeural");
  const [rate, setRate] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const nextBlobUrlRef = useRef<string | null>(null);
  const nextFetchRef = useRef<Promise<string | null> | null>(null);
  const voiceRef = useRef(voice);
  const rateRef = useRef(rate);
  const statusRef = useRef<TTSStatus>("idle");

  useEffect(() => { voiceRef.current = voice; }, [voice]);
  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  const synthesizeChunk = useCallback(async (text: string): Promise<string | null> => {
    try {
      const b64 = await invoke<string>("tts_synthesize", {
        text,
        voice: voiceRef.current,
        rate: rateRef.current,
        pitch: 0,
      });
      const blob = base64ToBlob(b64, "audio/mpeg");
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, []);

  const playNext = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    // Revoke previous blob URL to free memory
    if (audio.src.startsWith("blob:")) {
      URL.revokeObjectURL(audio.src);
    }

    let blobUrl: string | null = null;

    // Use pre-fetched URL if available
    if (nextBlobUrlRef.current) {
      blobUrl = nextBlobUrlRef.current;
      nextBlobUrlRef.current = null;
    } else if (nextFetchRef.current) {
      blobUrl = await nextFetchRef.current;
      nextFetchRef.current = null;
    } else if (queueRef.current.length > 0) {
      const chunk = queueRef.current.shift()!;
      setStatus("loading");
      blobUrl = await synthesizeChunk(chunk);
    }

    if (!blobUrl || statusRef.current === "idle") {
      setStatus("idle");
      return;
    }

    // Pre-fetch next chunk
    if (queueRef.current.length > 0) {
      const nextChunk = queueRef.current.shift()!;
      nextFetchRef.current = synthesizeChunk(nextChunk);
    }

    audio.src = blobUrl;
    audio.onloadeddata = () => {
      if (statusRef.current !== "idle") setStatus("playing");
    };
    audio.onended = () => {
      playNext();
    };
    audio.onerror = () => {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    };

    try {
      await audio.play();
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [synthesizeChunk]);

  const play = useCallback(async (text: string) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Stop any current playback
    audio.pause();
    if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
    audio.src = "";
    nextBlobUrlRef.current = null;
    nextFetchRef.current = null;

    const chunks = splitChunks(text);
    if (!chunks.length) return;

    setStatus("loading");
    queueRef.current = chunks.slice(1); // first chunk synthesized immediately

    const firstUrl = await synthesizeChunk(chunks[0]);
    if (!firstUrl || statusRef.current === "idle") {
      setStatus("idle");
      return;
    }

    // Pre-fetch second chunk while first is playing
    if (queueRef.current.length > 0) {
      const nextChunk = queueRef.current.shift()!;
      nextFetchRef.current = synthesizeChunk(nextChunk);
    }

    audio.src = firstUrl;
    audio.onloadeddata = () => {
      if (statusRef.current !== "idle") setStatus("playing");
    };
    audio.onended = () => {
      playNext();
    };
    audio.onerror = () => {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    };

    try {
      await audio.play();
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [synthesizeChunk, playNext]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => setStatus("error"));
    setStatus("playing");
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
    audio.src = "";
    queueRef.current = [];
    nextBlobUrlRef.current = null;
    nextFetchRef.current = null;
    setStatus("idle");
  }, []);

  return { status, voice, setVoice, rate, setRate, play, pause, resume, stop };
}
