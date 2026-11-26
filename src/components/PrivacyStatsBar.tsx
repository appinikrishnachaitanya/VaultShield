import { useEffect, useRef, useState } from "react";
import { Lock, Shield, FileText, TrendingUp } from "lucide-react";
import { getStats, onStatsChange } from "../lib/privacyStats";
import { t } from "../lib/i18n";

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function AnimatedNum({ value, label }: { value: string; label: string }) {
  const prevRef = useRef(value);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setTick((t) => t + 1);
    }
  }, [value]);

  return (
    <span>
      <strong key={tick} className={tick > 0 ? "stat-num-pop" : ""}>
        {value}
      </strong>
      <small>{label}</small>
    </span>
  );
}

export default function PrivacyStatsBar() {
  const [stats, setStats] = useState(getStats());

  useEffect(() => {
    return onStatsChange(() => setStats(getStats()));
  }, []);

  if (stats.checksRun === 0 && stats.documentsScanned === 0) return null;

  return (
    <div className="privacy-stats-bar">
      <div className="stats-bar-label">
        <TrendingUp size={11} />
        {t("THIS SESSION")}
      </div>
      <div className="stats-bar-grid">
        <div className="stat-cell">
          <Lock size={14} />
          <AnimatedNum value={fmt(stats.identifiersMasked)} label={t("masked")} />
        </div>
        <div className="stat-cell">
          <Shield size={14} />
          <AnimatedNum value={fmtBytes(stats.bytesSaved)} label={t("protected")} />
        </div>
        <div className="stat-cell">
          <FileText size={14} />
          <AnimatedNum value={String(stats.checksRun + stats.documentsScanned)} label={t("checks")} />
        </div>
      </div>
    </div>
  );
}
