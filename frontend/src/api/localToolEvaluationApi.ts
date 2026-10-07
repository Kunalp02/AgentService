
import { apiClient } from './client';

export type MetricStatus = 'pass' | 'warn' | 'fail';

export interface GenerateSchemaResponse {
  parametersSchemaJson: string;
  functionName: string | null;
  parameterCount: number;
}
export interface EvalMetric {
  key: string;
  label: string;
  status: MetricStatus;
  score: number;
  detail: string;
}
export interface EvalFinding {
  category: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  line: number | null;
  message: string;
  remediation: string | null;
  blocking: boolean;
}
export interface EvalCapabilities {
  network: boolean;
  filesystem: boolean;
  subprocess: boolean;
}
export interface EvaluationResult {
  decision: 'ALLOW' | 'REVIEW' | 'BLOCK';
  passed: boolean;
  riskScore: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  summary: string;
  functionName: string | null;
  capabilities: EvalCapabilities;
  imports: string[];
  metrics: EvalMetric[];
  findings: EvalFinding[];
}
export interface EvalTestCase {
  name: string;
  argumentsJson: string;
  expectSuccess: boolean;
  rationale: string;
}

const BASE = '/local-tool-evaluation';

export const localToolEvaluationApi = {
  generateSchema: (p: { modelId: string; pythonCode: string }) =>
    apiClient.post<GenerateSchemaResponse>(`${BASE}/schema`, p),
  evaluate: (p: { modelId: string; pythonCode: string; parametersSchemaJson?: string | null }) =>
    apiClient.post<EvaluationResult>(`${BASE}/evaluate`, p),
  generateTestCases: (p: { modelId: string; pythonCode: string; parametersSchemaJson?: string | null }) =>
    apiClient.post<{ cases: EvalTestCase[] }>(`${BASE}/test-cases`, p),
};
