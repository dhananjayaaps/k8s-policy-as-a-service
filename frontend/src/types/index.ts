// Type definitions for the application
// These types mirror the data structure and can be used with any backend

export type Cluster = {
  id: string;
  name: string;
  api_endpoint: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Policy = {
  id: string;
  category: string;
  title: string;
  description: string;
  yaml_template: string | null;
  is_active: boolean;
  severity: string;
  created_at: string;
};

export type AuditLog = {
  id: string;
  cluster_id: string;
  resource_name: string;
  policy_violated: string;
  action_taken: string;
  details: string | null;
  timestamp: string;
};

export type ComplianceMetric = {
  id: string;
  cluster_id: string;
  overall_score: number;
  security_score: number;
  cost_score: number;
  reliability_score: number;
  recorded_at: string;
};
