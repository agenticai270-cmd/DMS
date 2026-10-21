import type { DisasterType, Severity, Urgency } from '../types/domain.js';
import { assessmentConfig, type AssessmentConfig } from './assessmentConfig.js';

export interface AssessmentInput {
  disasterType: DisasterType;
  description: string;
  peopleAffected: number;
  urgency: Urgency;
  location?: { address?: string; latitude?: number; longitude?: number };
  /** Optional explicit flags a caller can set instead of relying on text parsing. */
  flags?: {
    medicalEmergency?: boolean;
    infrastructureDamage?: boolean;
    hazardousMaterials?: boolean;
  };
  /** Report time — used for the "after dark" response-difficulty modifier. */
  occurredAt?: Date;
}

export interface ScoreBreakdownEntry {
  label: string;
  points: number;
  detail: string;
}

export interface AssessmentResult {
  severity: Severity;
  score: number;
  riskFactors: string[];
  recommendedResources: string[];
  recommendedActions: string[];
  breakdown: ScoreBreakdownEntry[];
  engineVersion: string;
  matchedSignals: string[];
}

const round = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Dedupe while preserving insertion order. */
const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

/**
 * Deterministic disaster severity assessment.
 *
 * Produces a 0–100 score from five independently-weighted factors, plus the
 * risk factors, resources and actions implied by those factors. This is the
 * authoritative assessment: the AI layer only ever annotates its output.
 */
export function assessDisaster(
  input: AssessmentInput,
  config: AssessmentConfig = assessmentConfig,
): AssessmentResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  const riskFactors: string[] = [];
  const resources: string[] = [...(config.baseResources[input.disasterType] ?? [])];
  const actions: string[] = [...(config.baseActions[input.disasterType] ?? [])];

  // ── 1. Intrinsic hazard of the disaster type ────────────────────────────
  const hazard = config.hazardIndex[input.disasterType] ?? 0.5;
  const typePoints = round(hazard * config.weights.disasterType);
  breakdown.push({
    label: 'Disaster type',
    points: typePoints,
    detail: `${humanise(input.disasterType)} carries a hazard index of ${hazard.toFixed(2)}`,
  });
  if (hazard >= 0.85) riskFactors.push(`High-hazard event type (${humanise(input.disasterType)})`);

  // ── 2. Reported urgency ─────────────────────────────────────────────────
  const urgencyFactor = config.urgencyIndex[input.urgency] ?? 0.5;
  const urgencyPoints = round(urgencyFactor * config.weights.urgency);
  breakdown.push({
    label: 'Reported urgency',
    points: urgencyPoints,
    detail: `Reporter marked this ${input.urgency.toLowerCase()} urgency`,
  });
  if (input.urgency === 'CRITICAL') riskFactors.push('Critical urgency declared by reporter');
  else if (input.urgency === 'HIGH') riskFactors.push('High urgency declared by reporter');

  // ── 3. Affected population ──────────────────────────────────────────────
  const affected = Number.isFinite(input.peopleAffected) ? Math.max(0, input.peopleAffected) : 0;
  const band =
    config.populationBands.find((b) => affected >= b.min) ??
    config.populationBands[config.populationBands.length - 1];
  const populationPoints = round(band.factor * config.weights.peopleAffected);
  breakdown.push({
    label: 'People affected',
    points: populationPoints,
    detail: `${affected.toLocaleString()} reported affected`,
  });
  if (band.factor >= 0.55) riskFactors.push(band.label);

  // ── 4. Signals extracted from the description ───────────────────────────
  const text = input.description ?? '';
  const matched = config.signals.filter((signal) => signal.patterns.some((p) => p.test(text)));

  // Explicit caller flags act as if the matching signal fired.
  const forced = new Set<string>();
  if (input.flags?.medicalEmergency) forced.add('injuries');
  if (input.flags?.infrastructureDamage) forced.add('infrastructure');
  if (input.flags?.hazardousMaterials) forced.add('hazmat');
  for (const id of forced) {
    const signal = config.signals.find((s) => s.id === id);
    if (signal && !matched.includes(signal)) matched.push(signal);
  }

  const rawSignalPoints = matched.reduce((sum, s) => sum + s.points, 0);
  const maxSignalPoints = config.signals.reduce((sum, s) => sum + s.points, 0);
  // Normalise so adding new signals to the config never inflates past the weight.
  const signalPoints = round(
    (Math.min(rawSignalPoints, maxSignalPoints) / maxSignalPoints) * config.weights.descriptionSignals,
  );
  breakdown.push({
    label: 'Situation indicators',
    points: signalPoints,
    detail: matched.length
      ? `${matched.length} indicator${matched.length === 1 ? '' : 's'} detected in the report`
      : 'No severity indicators detected in the description',
  });
  for (const signal of matched) {
    riskFactors.push(signal.label);
    resources.push(...(signal.resources ?? []));
    actions.push(...(signal.actions ?? []));
  }

  // ── 5. Context modifiers ────────────────────────────────────────────────
  let contextFactor = 0;
  const contextNotes: string[] = [];

  const hour = (input.occurredAt ?? new Date()).getHours();
  if (hour >= 20 || hour < 6) {
    contextFactor += 0.5;
    contextNotes.push('after dark');
    riskFactors.push('Night-time incident — reduced visibility for responders');
  }

  const hasCoordinates =
    typeof input.location?.latitude === 'number' && typeof input.location?.longitude === 'number';
  if (!hasCoordinates) {
    contextFactor += 0.25;
    contextNotes.push('no precise coordinates');
    riskFactors.push('Imprecise location — responders may need to search for the site');
  }

  // A very short description gives responders little to plan with.
  if (text.trim().length < 40) {
    contextFactor += 0.25;
    contextNotes.push('limited detail');
    riskFactors.push('Limited detail in report — verification required');
    actions.push('Contact the reporter to obtain more detail before committing resources');
  }

  const contextPoints = round(clamp(contextFactor, 0, 1) * config.weights.contextModifiers);
  breakdown.push({
    label: 'Response context',
    points: contextPoints,
    detail: contextNotes.length ? `Complicating factors: ${contextNotes.join(', ')}` : 'No complicating context factors',
  });

  // ── Total ───────────────────────────────────────────────────────────────
  const score = clamp(
    Math.round(typePoints + urgencyPoints + populationPoints + signalPoints + contextPoints),
    0,
    100,
  );
  const severity = classifySeverity(score, config);

  // Severity-driven escalation actions.
  if (severity === 'CRITICAL') {
    actions.unshift('Activate the emergency operations centre and notify district authorities');
    resources.push('Incident command unit');
  } else if (severity === 'HIGH') {
    actions.unshift('Assign a response team and establish on-site command');
  }
  if (affected >= 250) resources.push('Mass-care and relief coordination');

  return {
    severity,
    score,
    riskFactors: unique(riskFactors),
    recommendedResources: unique(resources),
    recommendedActions: unique(actions),
    breakdown,
    engineVersion: config.version,
    matchedSignals: matched.map((s) => s.id),
  };
}

export function classifySeverity(score: number, config: AssessmentConfig = assessmentConfig): Severity {
  const bounded = clamp(score, 0, 100);
  for (const t of config.thresholds) {
    if (bounded <= t.max) return t.severity;
  }
  return config.thresholds[config.thresholds.length - 1].severity;
}

const humanise = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
