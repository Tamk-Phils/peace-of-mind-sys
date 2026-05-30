export type SensorName = "Motion Detector" | "Gas Sensor" | "Smoke Sensor" | "Door Lock";

export interface SensorSpec {
  min: number;
  max: number;
  decimals: number;
}

export const SENSOR_SPECS: Record<string, SensorSpec> = {
  "Motion Detector": { min: 0, max: 100, decimals: 0 },
  "Gas Sensor": { min: 0, max: 1000, decimals: 0 },
  "Smoke Sensor": { min: 0, max: 500, decimals: 0 },
  "Door Lock": { min: 0, max: 1, decimals: 0 },
};

/**
 * Generate a simulated reading for a sensor.
 * ~10% chance to produce a "spike" above the threshold to simulate an event.
 */
export function simulateReading(name: string, threshold: number): number {
  const spec = SENSOR_SPECS[name] ?? { min: 0, max: 100, decimals: 0 };
  const spike = Math.random() < 0.1;

  if (name === "Door Lock") {
    return spike ? 1 : 0;
  }

  let value: number;
  if (spike) {
    // value above threshold
    value = threshold + Math.random() * (spec.max - threshold) * 0.8 + 1;
  } else {
    // value safely below threshold
    value = Math.random() * threshold * 0.85;
  }
  value = Math.max(spec.min, Math.min(spec.max, value));
  const f = Math.pow(10, spec.decimals);
  return Math.round(value * f) / f;
}

export function severityFor(value: number, threshold: number): "SAFE" | "WARNING" | "DANGER" {
  if (value < threshold) return "SAFE";
  if (value < threshold * 1.25) return "WARNING";
  return "DANGER";
}
