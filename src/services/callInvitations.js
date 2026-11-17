export const RING_WINDOW_MS=45000;

export function ringingTimeLeft(call,now=Date.now()) {
  const started=Date.parse(call?.created_at);
  if(call?.status!=='ringing'||!Number.isFinite(started))return 0;
  return Math.max(0,Math.min(RING_WINDOW_MS,started+RING_WINDOW_MS-now));
}
