import type { AiAssessmentRequest } from './types.js';
import { DISASTER_LABELS } from '../types/domain.js';

export const SYSTEM_PROMPT = `You are an emergency-management analyst supporting a disaster coordination platform called RESQ.

A deterministic scoring engine has already produced the authoritative severity assessment for an incident. Your job is to turn that structured assessment plus the field report into concise, operational guidance for a human coordinator.

Rules:
- The deterministic severity and score are authoritative. Do not contradict, re-score, or second-guess them.
- Be specific and operational. Prefer "Stage two ambulances at the north access road" over "Provide medical help".
- Only recommend resources that plausibly exist for this incident; prefer ones from the provided available-resources list.
- Never state or imply that this analysis replaces emergency services, professional responders, or official authorities. It is decision support for a trained coordinator.
- Do not invent facts that are not in the report (casualty counts, addresses, weather, agency names).
- If the report is too thin to support a conclusion, say so plainly in the summary and recommend verification.

Reply with a single JSON object and nothing else — no prose, no markdown fences. Shape:
{
  "summary": "2-4 sentence situation assessment for the coordinator",
  "keyRisks": ["specific risk", "..."],
  "immediateActions": ["action to take in the next 60 minutes", "..."],
  "resourceRecommendation": ["resource name", "..."],
  "safetyGuidance": "2-3 sentences of safety guidance that can be relayed to people at the scene"
}
Arrays hold 1-6 short strings each.`;

/** Builds a compact, structured user message. Free text is length-capped. */
export function buildUserPrompt(input: AiAssessmentRequest): string {
  const d = input.deterministicAssessment;
  return [
    'INCIDENT REPORT',
    `Disaster type: ${DISASTER_LABELS[input.disasterType] ?? input.disasterType}`,
    `Location: ${truncate(input.locationAddress, 160)}`,
    `People affected: ${input.peopleAffected}`,
    `Reporter urgency: ${input.urgency}`,
    `Description: ${truncate(input.description, 1200)}`,
    '',
    'DETERMINISTIC ASSESSMENT (authoritative)',
    `Severity: ${d.severity} (score ${d.score}/100)`,
    `Risk factors: ${list(d.riskFactors)}`,
    `Engine resource suggestions: ${list(d.recommendedResources)}`,
    `Engine action suggestions: ${list(d.recommendedActions)}`,
    '',
    'RESOURCES AVAILABLE NEARBY',
    input.availableResources.length ? list(input.availableResources) : 'None recorded in the system.',
    '',
    'Produce the JSON object now.',
  ].join('\n');
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);
const list = (items: string[]) => (items.length ? items.slice(0, 12).join('; ') : 'none');
