/** Shared client-side shapes for the RESQ API. */

export type Severity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type IncidentStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'RESPONSE_ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REJECTED';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  error?: unknown;
}

export interface IncidentSummary {
  id: string;
  reportCode: string;
  disasterType: string;
  location: string;
  severity: Severity;
  score: number;
  status: IncidentStatus;
  createdAt: string;
}

export interface DashboardStats {
  activeIncidents: number;
  criticalIncidents: number;
  peopleAffected: number;
  resourcesAvailable: number;
}
