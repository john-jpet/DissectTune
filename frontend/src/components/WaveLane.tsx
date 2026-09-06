"use client";
import { useEffect, useRef } from "react";
export default function WaveLane({ buffer, color }: { buffer?: AudioBuffer; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const width = canvas.clientWidth, height = 52, ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio; canvas.height = height * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color; ctx.globalAlpha = 0.2;
      ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
      if (!buffer) return;
      const samples = buffer.getChannelData(0), bars = Math.max(1, Math.floor(width / 3));
      ctx.fillStyle = color; ctx.globalAlpha = 0.85;
      for (let i = 0; i < bars; i++) {
        const start = Math.floor(i * samples.length / bars), end = Math.floor((i + 1) * samples.length / bars);
        let peak = 0;
        for (let j = start; j < end; j += Math.max(1, Math.floor((end - start) / 100))) peak = Math.max(peak, Math.abs(samples[j]));
        const h = Math.max(1, peak * 44);
        ctx.fillRect(i * 3, (height - h) / 2, 2, h);
      }
    };
    const observer = new ResizeObserver(draw); observer.observe(canvas); draw();
    return () => observer.disconnect();
  }, [buffer, color]);
  return <canvas ref={ref} className="wave-canvas" aria-label={buffer ? "Audio waveform" : "Waveform loading"} role="img" />;
}
