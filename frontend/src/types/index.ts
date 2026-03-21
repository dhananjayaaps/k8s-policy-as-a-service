// Type definitions for the application
// These types mirror the data structure and can be used with any backend

export type User = {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
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
  email?: string;
  full_name?: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
};

export type Cluster = {
  id: number;
  name: string;
  host: string | null;
  server_url?: string | null;
  kubeconfig_content: string | null;
  context: string | null;
  description: string | null;
  is_active: boolean;
  verify_ssl?: boolean;
  ca_cert_data?: string | null;
  created_at: string;
  updated_at: string;
};

// Cluster Setup & Connection Types
export type SSHConnectRequest = {
  host: string;
  username: string;
  pem_key_content?: string;
  password?: string;
  port?: number;
};

export type SSHConnectResponse = {
  success: boolean;
  message: string;
  session_id: string;
  host?: string;
};

export type ClusterSetupRequest = {
  session_id: string;
  cluster_name: string;
  cluster_description?: string;
  service_account_name?: string;
  namespace?: string;
  role_type?: string;
  install_kyverno?: boolean;
  kyverno_namespace?: string;
  verify_ssl?: boolean;
  public_api_url?: string;
  api_port?: number;
};

export type ClusterSetupResponse = {
  success: boolean;
  message: string;
  cluster_id: number;
  cluster_name: string;
  host: string;
  server_url: string;
  service_account_id: number;
  service_account_name: string;
  token: string;
  kyverno_installed: boolean;
  kyverno_message?: string;
};

export type ClusterConnectRequest = {
  kubeconfig_content: string;
  context?: string;
};

export type TokenConnectRequest = {
  server_url: string;
  token: string;
  ca_cert_data?: string;
};

export type ClusterConnectResponse = {
  success: boolean;
  message: string;
  cluster_info?: any;
  namespaces?: string[];
};

export type KyvernoStatus = {
  installed: boolean;
  version?: string;
  namespace?: string;
  deployment_status?: any;
  helm_release?: any;
  api_resources_available?: boolean;
  webhooks_configured?: boolean;
};

export type NamespaceListResponse = {
  namespaces: string[];
  count: number;
};

export type Policy = {
  id: string | number;
  name: string;           // internal identifier (e.g. "disallow-latest-tag")
  category: string;
  title: string;
  description: string;
  yaml_template: string | null;
  is_active: boolean;
  severity: string;
  parameters?: Record<string, any> | null;
  created_at: string;
  updated_at?: string;
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
