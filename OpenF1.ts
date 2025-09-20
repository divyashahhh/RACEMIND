export type OpenF1Lap = {
  lap_number: number;
  driver_number: number;
  session_key?: number;
  duration_sector_1?: number;
  duration_sector_2?: number;
  duration_sector_3?: number;
  duration?: number; // seconds
  tyre?: string;
};

const OPENF1_BASE = "https://api.openf1.org";

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`OpenF1 error ${resp.status}`);
  return (await resp.json()) as T;
}

export async function getRaceSessions(year: number) {
  const url = `${OPENF1_BASE}/v1/sessions?year=${year}&session_name=RACE`;
  return fetchJson<any[]>(url);
}

export async function getLaps(session_key: number, driverNumber?: number) {
  const dn = driverNumber ? `&driver_number=${driverNumber}` : "";
  const url = `${OPENF1_BASE}/v1/laps?session_key=${session_key}${dn}`;
  return fetchJson<OpenF1Lap[]>(url);
}

export async function getDrivers(session_key: number) {
  const url = `${OPENF1_BASE}/v1/drivers?session_key=${session_key}`;
  return fetchJson<any[]>(url);
}

export async function inferPitLossFromLaps(laps: OpenF1Lap[]): number | null {
  // Heuristic: pit lap usually has very large duration vs median; estimate pit loss as (pit lap - median flying lap)
  if (!laps.length) return null;
  const durations = laps
    .map(l => l.duration)
    .filter((x): x is number => typeof x === "number")
    .filter(x => x > 30 && x < 200);
  if (durations.length < 10) return null;
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  const pitLoss = Math.max(15, Math.min(30, max - median));
  return pitLoss;
}

export function inferDegradationFromLaps(laps: OpenF1Lap[]): Record<string, number> | null {
  // Group by tyre label and compute slope via simple linear regression of duration ~ lap_number
  const byTyre = new Map<string, OpenF1Lap[]>();
  for (const l of laps) {
    const t = (l.tyre || '').toUpperCase();
    if (!t || !l.duration || !l.lap_number) continue;
    if (!byTyre.has(t)) byTyre.set(t, []);
    byTyre.get(t)!.push(l);
  }
  if (byTyre.size === 0) return null;
  const result: Record<string, number> = {};
  byTyre.forEach((arr, tyre) => {
    const xs = arr.map(l => l.lap_number);
    const ys = arr.map(l => l.duration!);
    const n = xs.length;
    if (n < 12) return; // need enough points
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0; let den = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      num += dx * (ys[i] - meanY);
      den += dx * dx;
    }
    if (den <= 0) return;
    const slope = num / den; // seconds per lap increase
    // Clamp to plausible ranges
    const clamped = Math.max(0.03, Math.min(0.25, slope));
    result[tyre] = clamped;
  });
  return Object.keys(result).length ? result : null;
}


