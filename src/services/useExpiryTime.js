import { useEffect, useState } from 'react';

export function useExpiryTime(deadlines) {
  const [now, setNow] = useState(Date.now);
  const next = Math.min(...deadlines.map(value => Date.parse(value)).filter(value => Number.isFinite(value) && value > now), Infinity);
  useEffect(() => {
    const check = () => setNow(Date.now());
    const timer = Number.isFinite(next) ? setTimeout(check, Math.min(Math.max(next - Date.now() + 1, 1), 2147483647)) : null;
    document.addEventListener('visibilitychange', check);
    return () => { if (timer !== null) clearTimeout(timer); document.removeEventListener('visibilitychange', check); };
  }, [next, now]);
  return now;
}
