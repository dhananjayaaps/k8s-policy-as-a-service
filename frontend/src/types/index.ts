// Type definitions for the application
// These types mirror the data structure and can be used with any backend

export type User = {
  id: number;
  username: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type SignupRequest = {
  username: string;
  password: string;
  role?: 'admin' | 'user';
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
};

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
  id: number;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  details: any | null;  // Can be object or string
  status: string;  // "success" or "failure"
  error_message: string | null;
  created_at: string;
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

export type DashboardData = {
  // Cluster info
  cluster_id: number;
  cluster_name: string;
  
  // Policy statistics
  activePoliciesCount: number;
  deployedPoliciesCount: number;
  totalDeployments: number;
  failedDeploymentsCount: number;
  enforcementRate: number;
  
  // Compliance scores (calculated from real data)
  overallScore: number;
  securityScore: number;
  costScore: number;
  reliabilityScore: number;
  
  // Violation statistics
  violationsCount: number;
  violations24h: number;
  violations7d: number;
  violationTrend: 'increasing' | 'decreasing' | 'stable';
  
  // Activity metrics
  totalLogs24h: number;
  successCount24h: number;
  successRate: number;
  resourcesScanned: number;
  
  // Recent activity
  recentLogs: AuditLog[];
  
  // Metadata
  generatedAt: string;
};
