// Sensor simulation engine aligned with the dissertation specification
// (Section 3.7): Box-Muller Gaussian noise + stochastic spike injection.

export type Severity = "SAFE" | "WARNING" | "DANGER";

export interface SensorParams {
  name: string;
  baseline: number;
  noise_amplitude: number;
  spike_magnitude: number;
  spike_probability: number;
  min_value: number;
  max_value: number;
  threshold: number;
}

// Defaults from Dissertation Table 3.4 — used as a fallback when the
// sensors row does not yet carry the simulation-parameter columns.
const DEFAULTS: Record<string, Omit<SensorParams, "name" | "threshold">> = {
  "Motion Detector": { baseline: 30,  noise_amplitude: 10, spike_magnitude: 55,  spike_probability: 0.10, min_value: 0, max_value: 100 },
  "Gas Sensor":      { baseline: 200, noise_amplitude: 30, spike_magnitude: 600, spike_probability: 0.10, min_value: 0, max_value: 1000 },
  "Smoke Sensor":    { baseline: 80,  noise_amplitude: 15, spike_magnitude: 330, spike_probability: 0.10, min_value: 0, max_value: 500 },
  "Door Lock":       { baseline: 0,   noise_amplitude: 0,  spike_magnitude: 1,   spike_probability: 0.10, min_value: 0, max_value: 1 },
};

export function resolveParams(s: Partial<SensorParams> & { name: string; threshold: number }): SensorParams {
  const d = DEFAULTS[s.name] ?? { baseline: 0, noise_amplitude: 10, spike_magnitude: 50, spike_probability: 0.1, min_value: 0, max_value: 100 };
  return {
    name: s.name,
    threshold: Number(s.threshold),
    baseline: Number(s.baseline ?? d.baseline),
    noise_amplitude: Number(s.noise_amplitude ?? d.noise_amplitude),
    spike_magnitude: Number(s.spike_magnitude ?? d.spike_magnitude),
    spike_probability: Number(s.spike_probability ?? d.spike_probability),
    min_value: Number(s.min_value ?? d.min_value),
    max_value: Number(s.max_value ?? d.max_value),
  };
}

/** Box-Muller transform: standard normal N(0,1). */
function gaussianStandard(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Generate a simulated reading using Gaussian noise on the baseline,
 * plus stochastic spike injection (Dissertation §3.7).
 */
export function simulateReadingWithParams(p: SensorParams): number {
  // Door Lock is binary: locked (0) or unlocked spike (1).
  if (p.name === "Door Lock") {
    return Math.random() < p.spike_probability ? 1 : 0;
  }
  const noise = gaussianStandard() * p.noise_amplitude;
  let value = p.baseline + noise;
  if (Math.random() < p.spike_probability) {
    value += p.spike_magnitude;
  }
  value = Math.max(p.min_value, Math.min(p.max_value, value));
  return Math.round(value * 100) / 100;
}

/** Backward-compatible helper used by older call sites. */
export function simulateReading(name: string, threshold: number): number {
  return simulateReadingWithParams(resolveParams({ name, threshold }));
}

/**
 * Severity classification per Dissertation §3.5:
 *  - WARNING: threshold ≤ value < threshold + 20% of sensor range
 *  - DANGER:  value ≥ threshold + 20% of sensor range
 */
export function severityForParams(value: number, p: SensorParams): Severity {
  if (value < p.threshold) return "SAFE";
  const range = p.max_value - p.min_value;
  const dangerCut = p.threshold + 0.2 * range;
  return value >= dangerCut ? "DANGER" : "WARNING";
}

export function severityFor(value: number, threshold: number, name = ""): Severity {
  return severityForParams(value, resolveParams({ name, threshold }));
}
