import { useEffect, useRef } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";
import type { DiaryAnalysisResult } from "../lib/firebase/ai";

interface Props {
  date: string;
  result: DiaryAnalysisResult;
  onContinue: () => void;
}

function sceneType(moodScore: number): "rain" | "cloud" | "sun" {
  if (moodScore <= 2) return "rain";
  if (moodScore <= 3) return "cloud";
  return "sun";
}

function drawScene(canvas: HTMLCanvasElement, scene: "rain" | "cloud" | "sun") {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (scene === "rain") {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#1e3a5f");
    grad.addColorStop(1, "#2d5a8e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(147,197,253,0.4)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 14);
      ctx.stroke();
    }
    const lgrd = ctx.createRadialGradient(W * 0.7, H * 0.5, 2, W * 0.7, H * 0.5, 70);
    lgrd.addColorStop(0, "rgba(253,224,71,0.9)");
    lgrd.addColorStop(1, "rgba(253,224,71,0)");
    ctx.fillStyle = lgrd;
    ctx.beginPath();
    ctx.arc(W * 0.7, H * 0.5, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.arc(W * 0.7, H * 0.44, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(W * 0.7 - 6, H * 0.44 + 11, 12, 24);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W * 0.7, H * 0.35, 22, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W * 0.7, H * 0.35);
    ctx.lineTo(W * 0.7, H * 0.44 + 11);
    ctx.stroke();
  } else if (scene === "cloud") {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#7c4d1e");
    grad.addColorStop(1, "#f59e0b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const sgrd = ctx.createRadialGradient(W * 0.5, H * 0.25, 4, W * 0.5, H * 0.25, 70);
    sgrd.addColorStop(0, "rgba(253,224,71,0.95)");
    sgrd.addColorStop(1, "rgba(251,191,36,0)");
    ctx.fillStyle = sgrd;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.25, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    [[W * 0.3, H * 0.2, 60], [W * 0.6, H * 0.28, 44], [W * 0.15, H * 0.32, 36]].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0f766e");
    grad.addColorStop(1, "#34d399");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const sgrd = ctx.createRadialGradient(W * 0.5, H * 0.3, 6, W * 0.5, H * 0.3, 60);
    sgrd.addColorStop(0, "rgba(253,224,71,1)");
    sgrd.addColorStop(0.4, "rgba(251,191,36,0.6)");
    sgrd.addColorStop(1, "rgba(251,191,36,0)");
    ctx.fillStyle = sgrd;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.3, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(253,224,71,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(W * 0.5 + Math.cos(angle) * 28, H * 0.3 + Math.sin(angle) * 28);
      ctx.lineTo(W * 0.5 + Math.cos(angle) * 55, H * 0.3 + Math.sin(angle) * 55);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,100,60,0.4)";
    ctx.beginPath();
    ctx.ellipse(W * 0.3, H, 100, 65, 0, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(W * 0.72, H, 85, 56, 0, Math.PI, 0);
    ctx.fill();
  }
}

const MEMORY_ICONS: Record<string, string> = {
  rain: "📋",
  cloud: "⚡",
  sun: "🎯",
};
const MEMORY_ICONS2: Record<string, string> = { rain: "🤝", cloud: "💡", sun: "☎️" };
const MEMORY_ICONS3: Record<string, string> = { rain: "✍️", cloud: "🌙", sun: "🌅" };

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function DayMemoryCard({ date, result, onContinue }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = sceneType(result.moodScore);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    drawScene(canvas, scene);
  }, [scene]);

  const icons = [MEMORY_ICONS[scene], MEMORY_ICONS2[scene], MEMORY_ICONS3[scene]];

  const memories = result.memories.length > 0 ? result.memories : result.actionItems.slice(0, 3);

  return (
    <div className="day-memory-overlay">
      <div className="day-memory-card">
        <canvas ref={canvasRef} className="day-memory-canvas" aria-hidden="true" />

        <div className="day-memory-body">
          <div className="day-memory-date-label">{formatDate(date)}</div>

          {memories.length > 0 && (
            <div className="day-memory-moments">
              {memories.map((m, i) => (
                <div key={i} className="day-memory-moment">
                  <span className="day-memory-moment-icon">{icons[i] ?? "•"}</span>
                  <span>{m}</span>
                </div>
              ))}
            </div>
          )}

          {result.personalMessage && (
            <div className="day-memory-message">
              <Sparkles size={14} className="day-memory-sparkle" />
              {result.personalMessage}
            </div>
          )}

          <div className="day-memory-privacy">
            <LockKeyhole size={12} />
            {result.source === "ON_DEVICE"
              ? "Reflected on-device — your words never left"
              : "AI saw only privacy tokens — your words stayed here"}
          </div>

          <button className="day-memory-continue" onClick={onContinue}>
            See my entry →
          </button>
        </div>
      </div>
    </div>
  );
}
