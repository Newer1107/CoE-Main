"use client";

import { useEffect, useMemo, useState } from 'react';

type CountdownTimerProps = {
  targetISO: string;
  prefix?: string;
  className?: string;
};

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  return `${hours}h ${minutes}m ${seconds}s`;
};

export default function CountdownTimer({ targetISO, prefix = 'Time left', className = '' }: CountdownTimerProps) {
  const target = useMemo(() => new Date(targetISO).getTime(), [targetISO]);
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(target - Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [target]);

  if (!Number.isFinite(target)) return null;

  const done = remaining <= 0;
  return (
    <p className={className}>
      {done ? `${prefix}: Closed` : `${prefix}: ${formatDuration(remaining)}`}
    </p>
  );
}
