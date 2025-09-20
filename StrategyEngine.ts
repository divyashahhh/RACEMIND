export type TyreCompound = "SOFT" | "MEDIUM" | "HARD";

export type StaticTrackData = {
  laps: number;
  pit_loss_seconds: number;
  base_lap_time_seconds: number;
  degradation_per_lap_seconds: Record<TyreCompound, number>;
};

export type TrackDictionary = Record<string, StaticTrackData>;

export type StrategyStint = {
  compound: TyreCompound;
  laps: number;
};

export type StrategyPlan = {
  stints: StrategyStint[];
  totalTimeSeconds: number;
  numStops: number;
  notes?: string;
};

export type StrategyEngineInput = {
  trackName: string;
  raceYear: number;
  driverName?: string;
  rainProbabilityPct?: number; // 0-100
  mode?: "A" | "B" | "C";
  tracksData?: TrackDictionary;
};

const tyresOrder: TyreCompound[] = ["SOFT", "MEDIUM", "HARD"];

function computeStintTimeSeconds(
  baseLap: number,
  degPerLap: number,
  laps: number,
  fuelPenaltyPerLap = 0.015
): number {
  // Simple model: time for lap i = base + i*deg + (remainingFuelLaps)*fuelPenalty
  // Approximate with arithmetic progression sums
  const degradationSum = degPerLap * (laps * (laps + 1)) / 2;
  const fuelSum = fuelPenaltyPerLap * (laps * (laps - 1)) / 2;
  return laps * baseLap + degradationSum + fuelSum;
}

function enumeratePartitions(totalLaps: number, maxStints: number): number[][] {
  // Generate all sequences of positive integers summing to totalLaps, up to maxStints stints
  const results: number[][] = [];
  function backtrack(remaining: number, stintsLeft: number, path: number[]) {
    if (stintsLeft === 1) {
      if (remaining > 0) results.push([...path, remaining]);
      return;
    }
    for (let x = 1; x <= remaining - (stintsLeft - 1); x++) {
      path.push(x);
      backtrack(remaining - x, stintsLeft - 1, path);
      path.pop();
    }
  }
  for (let s = 1; s <= maxStints; s++) {
    backtrack(totalLaps, s, []);
  }
  return results;
}

function assignCompounds(numStints: number): TyreCompound[][] {
  // Enumerate compound assignments obeying FIA rule: at least two different dry compounds if dry race
  const assignments: TyreCompound[][] = [];
  const compounds = tyresOrder;
  const recurse = (idx: number, path: TyreCompound[]) => {
    if (idx === numStints) {
      const unique = new Set(path);
      if (unique.size >= 2) assignments.push([...path]);
      return;
    }
    for (const c of compounds) {
      path.push(c);
      recurse(idx + 1, path);
      path.pop();
    }
  };
  recurse(0, []);
  return assignments;
}

function generateCandidateStints(totalLaps: number): number[][] {
  const candidates: number[][] = [];
  // 1 stop (2 stints): halves +/- 3 laps
  for (let delta = -3; delta <= 3; delta++) {
    const a = Math.max(1, Math.floor(totalLaps / 2) + delta);
    const b = totalLaps - a;
    if (b > 0) candidates.push([a, b]);
  }
  // 2 stops (3 stints): thirds +/- 3 laps distributed
  for (let d1 = -3; d1 <= 3; d1++) {
    for (let d2 = -3; d2 <= 3; d2++) {
      const a = Math.max(1, Math.floor(totalLaps / 3) + d1);
      const b = Math.max(1, Math.floor(totalLaps / 3) + d2);
      const c = totalLaps - a - b;
      if (c > 0) candidates.push([a, b, c]);
    }
  }
  // 3 stops (4 stints): quarters baseline
  const q = Math.max(1, Math.floor(totalLaps / 4));
  candidates.push([q, q, q, totalLaps - 3 * q]);
  // Single stint (no stop) allowed at Monaco-like tracks
  candidates.push([totalLaps]);
  // Deduplicate by string key
  const uniq = new Map<string, number[]>();
  for (const seq of candidates) {
    const key = seq.join('-');
    uniq.set(key, seq);
  }
  return Array.from(uniq.values());
}

export async function predictBestStrategy(input: StrategyEngineInput): Promise<StrategyPlan> {
  const { trackName, tracksData } = input;
  if (!tracksData) throw new Error("tracksData required for modes A/B");
  const track = tracksData[trackName];
  if (!track) throw new Error(`Unknown track: ${trackName}`);

  let best: StrategyPlan | null = null;
  const partitions = generateCandidateStints(track.laps);
  for (const lapsPerStint of partitions) {
    const compoundChoices = assignCompounds(lapsPerStint.length);
    // Prefer fewer stops by biasing search order
    const sortedCompounds = compoundChoices.sort((a, b) => (lapsPerStint.length - 1) - (lapsPerStint.length - 1));
    for (const compounds of sortedCompounds) {
      let total = 0;
      for (let i = 0; i < lapsPerStint.length; i++) {
        const compound = compounds[i];
        const laps = lapsPerStint[i];
        const deg = track.degradation_per_lap_seconds[compound];
        total += computeStintTimeSeconds(track.base_lap_time_seconds, deg, laps);
      }
      const numStops = lapsPerStint.length - 1;
      total += numStops * track.pit_loss_seconds;

      const plan: StrategyPlan = {
        stints: compounds.map((c, i) => ({ compound: c, laps: lapsPerStint[i] })),
        totalTimeSeconds: total,
        numStops,
      };
      if (!best || plan.totalTimeSeconds < best.totalTimeSeconds) best = plan;
      // Early pruning: if current numStops > best.numStops by 2 and time isn't better by 5s, skip rest
      if (best && (plan.numStops > best.numStops + 1)) break;
    }
  }

  if (!best) throw new Error("Failed to compute strategy");
  return best;
}

export async function loadStaticTracks(): Promise<TrackDictionary> {
  // Dynamic import reads JSON bundled in assets
  const tracks = await import("./assets/data/tracks.json");
  return tracks as unknown as TrackDictionary;
}

export function formatPlan(plan: StrategyPlan): string {
  const stints = plan.stints
    .map((s, idx) => `Stint ${idx + 1}: ${s.compound} x ${s.laps} laps`)
    .join(" | ");
  return `${stints} • Stops: ${plan.numStops} • Total: ${formatSeconds(plan.totalTimeSeconds)}`;
}

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const mm = String(minutes);
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');
  return `${mm}:${ss}.${mmm}`;
}


