"use client";

import { useEffect, useState, useCallback } from "react";
import { getMintPhase, PhaseInfo } from "@/lib/api";

export interface CountdownState {
  phaseInfo: PhaseInfo | null;
  /** 0–1: fraction of phase duration that has ELAPSED */
  progress: number;
  /** seconds remaining */
  secondsLeft: number;
  /** formatted string, e.g. "02:34:11" */
  timeLeft: string;
  /** formatted elapsed string */
  timeElapsed: string;
  /** "active" | "upcoming" | "none" */
  mode: "active" | "upcoming" | "none";
}

function fmt(secs: number): string {
  const s = Math.max(0, secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function compute(info: PhaseInfo | null): CountdownState {
  if (!info) {
    return { phaseInfo: null, progress: 0, secondsLeft: 0, timeLeft: "--:--", timeElapsed: "--:--", mode: "none" };
  }

  const now = Math.floor(Date.now() / 1000);
  const { startTime, endTime, active } = info;

  if (active && endTime > now) {
    const total = endTime - startTime;
    const elapsed = now - startTime;
    const remaining = endTime - now;
    const progress = total > 0 ? Math.min(1, elapsed / total) : 0;
    return {
      phaseInfo: info,
      progress,
      secondsLeft: remaining,
      timeLeft: fmt(remaining),
      timeElapsed: fmt(elapsed),
      mode: "active",
    };
  }

  if (!active && startTime > now) {
    const total = startTime - (startTime - 86400); // treat 24h window before as "upcoming" period
    const remaining = startTime - now;
    const elapsed = Math.max(0, 86400 - remaining);
    const progress = Math.min(1, elapsed / 86400);
    return {
      phaseInfo: info,
      progress,
      secondsLeft: remaining,
      timeLeft: fmt(remaining),
      timeElapsed: fmt(elapsed),
      mode: "upcoming",
    };
  }

  return { phaseInfo: info, progress: 1, secondsLeft: 0, timeLeft: "00:00", timeElapsed: "--:--", mode: "none" };
}

export function useCountdown(): CountdownState {
  const [phaseInfo, setPhaseInfo] = useState<PhaseInfo | null>(null);
  const [state, setState] = useState<CountdownState>(compute(null));

  const fetchPhase = useCallback(async () => {
    try {
      const info = await getMintPhase();
      setPhaseInfo(info);
    } catch {
      // silently ignore — UI degrades gracefully
    }
  }, []);

  // Fetch once on mount, then every 30s
  useEffect(() => {
    fetchPhase();
    const poll = setInterval(fetchPhase, 30_000);
    return () => clearInterval(poll);
  }, [fetchPhase]);

  // Tick every second
  useEffect(() => {
    setState(compute(phaseInfo));
    const tick = setInterval(() => setState(compute(phaseInfo)), 1_000);
    return () => clearInterval(tick);
  }, [phaseInfo]);

  return state;
}
