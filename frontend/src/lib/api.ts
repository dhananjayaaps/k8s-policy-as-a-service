// API Service Layer
// This module provides a unified interface for data fetching.
// It can switch between mock data and real REST endpoints via config.

import { API_CONFIG, getApiUrl } from './config';
import type { 
  Cluster, 
  Policy, 
  AuditLog, 
  ComplianceMetric, 
  User, 
  LoginRequest, 
  SignupRequest, 
  AuthResponse,
  SSHConnectRequest,
  SSHConnectResponse,
  ClusterSetupRequest,
  ClusterSetupResponse,
  ClusterConnectRequest,
  ClusterConnectResponse,
  TokenConnectRequest,
  KyvernoStatus,
  NamespaceListResponse,
  HelmChart,
  HelmRelease,
} from '../types';

// Import mock data
import mockClusters from '../data/mock/clusters.json';
import mockPolicies from '../data/mock/policies.json';
import mockAuditLogs from '../data/mock/audit-logs.json';
import mockComplianceMetrics from '../data/mock/compliance-metrics.json';

// Generic API response type
export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
  status: number;
};

// Get token from localStorage (client-side only)
function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth_token');
  }
  return null;
}

// Simulate network delay for mock data (makes UI feel more realistic)
const simulateDelay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

// Generic fetch wrapper with error handling
async function fetchApi<T>(endpoint: string, options?: RequestInit, customToken?: string): Promise<ApiResponse<T>> {
  try {
    const token = customToken || getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    };
    
    // Add Authorization header if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(getApiUrl(endpoint), {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `HTTP Error: ${response.status} ${response.statusText}`;
      
      // Try to parse error response
      try {
        const errorData = await response.json();
        // Handle FastAPI validation errors (array of error objects)
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map((err: any) => err.msg).join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (typeof errorData.detail === 'object' && errorData.detail !== null) {
          // Handle structured error objects with errors array (e.g. validation errors)
          if (errorData.detail.message && Array.isArray(errorData.detail.errors) && errorData.detail.errors.length > 0) {
            errorMessage = errorData.detail.message + '\n' + errorData.detail.errors.join('\n');
          } else {
            errorMessage = errorData.detail.message || JSON.stringify(errorData.detail);
          }
        }
      } catch {
        // Ignore parse errors
      }
      
      return {
        data: null,
        error: errorMessage,
        status: response.status,
      };
    }

    // 204 No Content (e.g. DELETE) — no body to parse
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return { data: null, error: null, status: response.status };
    }

    const data = await response.json();
    return { data, error: null, status: response.status };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
      status: 500,
    };
  }
}

// ============== Authentication API ==============

export async function login(credentials: LoginRequest): Promise<ApiResponse<AuthResponse>> {
  // Auth endpoints always use real API, never mock
  try {
    const response = await fetch(getApiUrl('/auth/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      let errorMessage = 'Login failed';
      try {
        const errorData = await response.json();
        // Handle FastAPI validation errors (array of error objects)
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map((err: any) => err.msg).join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        }
      } catch {
        // Ignore parse errors
      }
      return {
        data: null,
        error: errorMessage,
        status: response.status,
      };
    }

    const data = await response.json();
    return { data, error: null, status: response.status };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Login failed',
      status: 500,
    };
  }
}

export async function signup(data: SignupRequest): Promise<ApiResponse<User>> {
  // Auth endpoints always use real API, never mock
  try {
    const response = await fetch(getApiUrl('/auth/signup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      let errorMessage = 'Signup failed';
      try {
        const errorData = await response.json();
        // Handle FastAPI validation errors (array of error objects)
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map((err: any) => err.msg).join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        }
      } catch {
        // Ignore parse errors
      }
      return {
        data: null,
        error: errorMessage,
        status: response.status,
      };
    }

    const userData = await response.json();
    return { data: userData, error: null, status: response.status };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Signup failed',
      status: 500,
    };
  }
}

export async function getCurrentUser(token: string): Promise<ApiResponse<User>> {
  // Auth endpoints always use real API, never mock
  return fetchApi<User>('/auth/me', {}, token);
}

export async function getAllUsers(token: string): Promise<ApiResponse<User[]>> {
  // Admin only - always use real API
  return fetchApi<User[]>('/auth/users', {}, token);
}

export async function updateProfile(data: { email?: string; full_name?: string }): Promise<ApiResponse<User>> {
  return fetchApi<User>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return fetchApi('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export async function addUser(data: { username: string; password: string; role: string; email?: string; full_name?: string }): Promise<ApiResponse<User>> {
  return fetchApi<User>('/auth/add-user', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(userId: number): Promise<ApiResponse<void>> {
  return fetchApi(`/auth/users/${userId}`, {
    method: 'DELETE',
  });
}

export async function adminUpdateUser(userId: number, data: { role?: string; is_active?: boolean; email?: string; full_name?: string }): Promise<ApiResponse<User>> {
  return fetchApi<User>(`/auth/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ============== Clusters API ==============

export async function getClusters(): Promise<ApiResponse<Cluster[]>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    // Transform mock data to match new Cluster type
    const transformedClusters = (mockClusters as any[]).map(c => ({
      ...c,
      id: parseInt(c.id, 10),
      host: c.api_endpoint || null,
      server_url: c.api_endpoint || null,
      kubeconfig_content: null,
      context: null,
      description: null,
      is_active: c.status === 'active',
    }));
    return { data: transformedClusters as Cluster[], error: null, status: 200 };
  }
  return fetchApi<Cluster[]>('/clusters');
}

export async function getClusterById(id: string): Promise<ApiResponse<Cluster | null>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    const numericId = parseInt(id, 10);
    const cluster = (mockClusters as any[]).find(c => parseInt(c.id, 10) === numericId);
    if (!cluster) {
      return { data: null, error: null, status: 404 };
    }
    const transformedCluster = {
      ...cluster,
      id: numericId,
      host: cluster.api_endpoint || null,
      server_url: cluster.api_endpoint || null,
      kubeconfig_content: null,
      context: null,
      description: null,
      is_active: cluster.status === 'active',
    };
    return { data: transformedCluster as Cluster, error: null, status: 200 };
  }
  return fetchApi<Cluster>(`/clusters/${id}`);
}

export async function createCluster(cluster: {
  name: string;
  host?: string;
  kubeconfig_content?: string;
  context?: string;
  description?: string;
}): Promise<ApiResponse<Cluster>> {
  return fetchApi<Cluster>('/clusters/', {
    method: 'POST',
    body: JSON.stringify(cluster),
  });
}

export async function updateCluster(id: number, updates: {
  name?: string;
  host?: string;
  kubeconfig_content?: string;
  context?: string;
  description?: string;
  is_active?: boolean;
}): Promise<ApiResponse<Cluster>> {
  return fetchApi<Cluster>(`/clusters/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteCluster(id: number): Promise<ApiResponse<{ message: string }>> {
  return fetchApi<{ message: string }>(`/clusters/${id}`, {
    method: 'DELETE',
  });
}

export async function connectClusterViaKubeconfig(request: {
  kubeconfig_content: string;
  context?: string;
}): Promise<ApiResponse<{
  success: boolean;
  message: string;
  cluster_info?: any;
  namespaces?: string[];
}>> {
  return fetchApi('/clusters/connect', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function connectClusterViaToken(request: {
  server_url: string;
  token: string;
  ca_cert_data?: string;
}): Promise<ApiResponse<{
  success: boolean;
  message: string;
  cluster_info?: any;
  namespaces?: string[];
}>> {
  return fetchApi('/clusters/connect-with-token', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function sshConnect(request: {
  host: string;
  username: string;
  pem_key_content?: string;
  password?: string;
  port?: number;
}): Promise<ApiResponse<{
  success: boolean;
  message: string;
  session_id: string;
  host?: string;
}>> {
  return fetchApi('/clusters/ssh/connect', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function sshDisconnect(sessionId: string): Promise<ApiResponse<{ message: string }>> {
  return fetchApi(`/clusters/ssh/disconnect?session_id=${sessionId}`, {
    method: 'POST',
  });
}

export async function setupCluster(request: {
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
}): Promise<ApiResponse<{
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
}>> {
  return fetchApi('/clusters/setup', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getKyvernoStatus(clusterId: number): Promise<ApiResponse<{
  installed: boolean;
  version?: string;
  namespace?: string;
  deployment_status?: any;
  helm_release?: any;
  api_resources_available?: boolean;
  webhooks_configured?: boolean;
}>> {
  return fetchApi(`/clusters/${clusterId}/kyverno/status`);
}

export async function getClusterNamespaces(clusterId: number): Promise<ApiResponse<{
  namespaces: string[];
  count: number;
}>> {
  return fetchApi(`/clusters/${clusterId}/namespaces`);
}

export async function getClusterInfo(clusterId: number): Promise<ApiResponse<any>> {
  return fetchApi(`/clusters/${clusterId}/info`);
}

export async function installKyverno(clusterId: number, request: {
  service_account_id?: number;
  namespace?: string;
  release_name?: string;
  create_namespace?: boolean;
}): Promise<ApiResponse<{
  success: boolean;
  message: string;
  release_name?: string;
  namespace?: string;
  output?: string;
}>> {
  return fetchApi(`/clusters/${clusterId}/install-kyverno`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// ============== Policies API ==============

export async function getPolicies(): Promise<ApiResponse<Policy[]>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    return { data: mockPolicies as Policy[], error: null, status: 200 };
  }
  return fetchApi<Policy[]>('/policies');
}

export async function getPolicyById(id: string): Promise<ApiResponse<Policy | null>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    const policy = (mockPolicies as Policy[]).find(p => p.id === id) || null;
    return { data: policy, error: null, status: policy ? 200 : 404 };
  }
  return fetchApi<Policy>(`/policies/${id}`);
}

export async function updatePolicy(id: string, updates: Partial<Policy>): Promise<ApiResponse<Policy | null>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    const policyIndex = (mockPolicies as Policy[]).findIndex(p => p.id === id);
    if (policyIndex === -1) {
      return { data: null, error: 'Policy not found', status: 404 };
    }
    // In mock mode, we update the in-memory data
    const updatedPolicy = { ...(mockPolicies as Policy[])[policyIndex], ...updates };
    (mockPolicies as Policy[])[policyIndex] = updatedPolicy;
    return { data: updatedPolicy, error: null, status: 200 };
  }
  return fetchApi<Policy>(`/policies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function togglePolicyStatus(id: string, isActive: boolean): Promise<ApiResponse<Policy | null>> {
  return updatePolicy(id, { is_active: isActive });
}

export async function checkDeploymentStatus(
  policyId: string,
  clusterId: string
): Promise<ApiResponse<{
  deployed: boolean;
  can_quick_deploy: boolean;
  requires_config: boolean;
  has_previous_config: boolean;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    has_default: boolean;
    description: string;
  }>;
  deployment_info: {
    deployment_id: number;
    namespace: string;
    deployed_at: string;
    status: string;
    parameters: any;
  } | null;
  namespace_deployments: Array<{
    deployment_id: number;
    namespace: string;
    deployed_at: string;
    status: string;
    parameters: any;
  }>;
}>> {
  return fetchApi(`/policies/deployment-status/${policyId}/cluster/${clusterId}`);
}

export async function quickDeployPolicy(
  policyId: string,
  clusterId: string,
  namespace: string = 'default'
): Promise<ApiResponse<{
  success: boolean;
  message: string;
  deployment_id?: number;
}>> {
  const params = new URLSearchParams({ namespace });
  return fetchApi(`/policies/quick-deploy/${policyId}/cluster/${clusterId}?${params.toString()}`, {
    method: 'POST',
  });
}

export async function quickUndeployPolicy(
  policyId: string,
  clusterId: string
): Promise<ApiResponse<{
  success: boolean;
  message: string;
}>> {
  return fetchApi(`/policies/quick-undeploy/${policyId}/cluster/${clusterId}`, {
    method: 'POST',
  });
}

export async function validatePolicy(yamlContent: string): Promise<ApiResponse<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: Record<string, any>;
}>> {
  return fetchApi('/policies/validate', {
    method: 'POST',
    body: JSON.stringify({ yaml_content: yamlContent }),
  });
}

export async function renderPolicyTemplate(
  yamlTemplate: string,
  parameters: Record<string, any>
): Promise<ApiResponse<{
  success: boolean;
  rendered_yaml: string | null;
  error: string | null;
}>> {
  return fetchApi('/policies/render', {
    method: 'POST',
    body: JSON.stringify({
      yaml_template: yamlTemplate,
      parameters,
    }),
  });
}

export async function testPolicyAgainstResource(
  policyYaml: string,
  resourceYaml: string
): Promise<ApiResponse<{
  success: boolean;
  policy_valid: boolean;
  resource_valid: boolean;
  policy_errors: string[];
  resource_errors: string[];
  results: Array<{
    rule_name: string;
    matched: boolean;
    status: 'pass' | 'fail' | 'skip' | 'warn';
    message: string;
    action_type: string | null;
  }>;
  summary: { pass: number; fail: number; skip: number; warn: number };
}>> {
  return fetchApi('/policies/test-resource', {
    method: 'POST',
    body: JSON.stringify({
      policy_yaml: policyYaml,
      resource_yaml: resourceYaml,
    }),
  });
}

export async function deployPolicy(request: {
  policy_id: number;
  cluster_id?: number;
  namespace: string;
  parameters?: Record<string, any>;
}): Promise<ApiResponse<{
  success: boolean;
  message: string;
  deployment_id?: number;
  deployed_yaml?: string;
}>> {
  return fetchApi('/policies/deploy', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function deployPolicyMulti(request: {
  policy_id: number;
  cluster_id: number;
  namespace_configs: Array<{
    namespace: string;
    parameters?: Record<string, any>;
  }>;
}): Promise<ApiResponse<{
  success: boolean;
  message: string;
  results: Array<{
    namespace: string;
    success: boolean;
    message: string;
    deployment_id?: number;
  }>;
}>> {
  return fetchApi('/policies/deploy-multi', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function createPolicy(data: {
  name: string;
  title?: string;
  category?: string;
  description?: string;
  severity?: string;
  yaml_template: string;
  parameters?: Record<string, any> | null;
  is_active?: boolean;
}): Promise<ApiResponse<Policy>> {
  return fetchApi<Policy>('/policies/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePolicyById(
  id: number,
  data: {
    name?: string;
    title?: string;
    category?: string;
    description?: string;
    severity?: string;
    yaml_template?: string;
    parameters?: Record<string, any> | null;
    is_active?: boolean;
  }
): Promise<ApiResponse<Policy>> {
  return fetchApi<Policy>(`/policies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePolicyById(id: number): Promise<ApiResponse<{ message: string }>> {
  return fetchApi<{ message: string }>(`/policies/${id}`, {
    method: 'DELETE',
  });
}

// ============== Audit Logs API ==============

export async function getAuditLogs(options?: {
  action?: string;
  resource_type?: string;
  status?: string;
  search?: string;
  skip?: number;
  limit?: number;
}): Promise<ApiResponse<AuditLog[]>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    let logs = [...(mockAuditLogs as any)] as AuditLog[];
    if (options?.limit) {
      logs = logs.slice(0, options.limit);
    }
    return { data: logs, error: null, status: 200 };
  }
  
  const params = new URLSearchParams();
  if (options?.action) params.append('action', options.action);
  if (options?.resource_type) params.append('resource_type', options.resource_type);
  if (options?.status) params.append('status', options.status);
  if (options?.search) params.append('search', options.search);
  if (options?.skip !== undefined) params.append('skip', options.skip.toString());
  if (options?.limit) params.append('limit', options.limit.toString());
  
  return fetchApi<AuditLog[]>(`/policies/audit-logs?${params.toString()}`);
}

export async function getAuditLogStats(): Promise<ApiResponse<{
  total: number;
  success_count: number;
  failure_count: number;
  actions: Record<string, number>;
  resource_types: Record<string, number>;
}>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    return { data: { total: 0, success_count: 0, failure_count: 0, actions: {}, resource_types: {} }, error: null, status: 200 };
  }
  return fetchApi('/policies/audit-logs/stats');
}

export async function getAuditLogsByCluster(clusterId: string): Promise<ApiResponse<AuditLog[]>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    const logs = (mockAuditLogs as any[]).filter((log: any) => log.cluster_id === clusterId) as AuditLog[];
    return { data: logs, error: null, status: 200 };
  }
  return fetchApi<AuditLog[]>(`/clusters/${clusterId}/audit-logs`);
}

// ============== Compliance Metrics API ==============

export async function getComplianceMetrics(): Promise<ApiResponse<ComplianceMetric[]>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    return { data: mockComplianceMetrics as ComplianceMetric[], error: null, status: 200 };
  }
  return fetchApi<ComplianceMetric[]>('/compliance-metrics');
}

export async function getLatestComplianceMetric(): Promise<ApiResponse<ComplianceMetric | null>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    const metrics = mockComplianceMetrics as ComplianceMetric[];
    // Sort by recorded_at descending and get the first one
    const sorted = [...metrics].sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );
    return { data: sorted[0] || null, error: null, status: 200 };
  }
  return fetchApi<ComplianceMetric>('/compliance-metrics/latest');
}

export async function getComplianceMetricsByCluster(clusterId: string): Promise<ApiResponse<ComplianceMetric[]>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    const metrics = (mockComplianceMetrics as ComplianceMetric[]).filter(m => m.cluster_id === clusterId);
    return { data: metrics, error: null, status: 200 };
  }
  return fetchApi<ComplianceMetric[]>(`/clusters/${clusterId}/compliance-metrics`);
}

// ============== Dashboard API (combined data) ==============

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

export async function getDashboardData(clusterId: string): Promise<ApiResponse<DashboardData>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay(400);
    
    const metrics = (mockComplianceMetrics as ComplianceMetric[])
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0] || null;
    
    const recentLogs = [...(mockAuditLogs as any[])]
      .sort((a: any, b: any) => new Date(b.timestamp || b.created_at).getTime() - new Date(a.timestamp || a.created_at).getTime())
      .slice(0, 3) as AuditLog[];
    
    const activePoliciesCount = (mockPolicies as Policy[]).filter(p => p.is_active).length;
    const violationsCount = (mockAuditLogs as any[]).filter((log: any) => {
      const logDate = new Date(log.timestamp || log.created_at);
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      return logDate >= oneDayAgo;
    }).length;
    
    return {
      data: {
        cluster_id: parseInt(clusterId, 10),
        cluster_name: 'Mock Cluster',
        activePoliciesCount,
        deployedPoliciesCount: activePoliciesCount - 2,
        totalDeployments: activePoliciesCount + 5,
        failedDeploymentsCount: 2,
        enforcementRate: 85.5,
        overallScore: metrics?.overall_score || 85,
        securityScore: metrics?.security_score || 90,
        costScore: metrics?.cost_score || 75,
        reliabilityScore: metrics?.reliability_score || 88,
        violationsCount,
        violations24h: violationsCount,
        violations7d: violationsCount * 7,
        violationTrend: 'stable',
        totalLogs24h: recentLogs.length,
        successCount24h: recentLogs.filter(l => l.status === 'success').length,
        successRate: 92.5,
        resourcesScanned: 127,
        recentLogs,
        generatedAt: new Date().toISOString(),
      },
      error: null,
      status: 200,
    };
  }
  
  // Get cluster stats from the policies API endpoint
  const statsResponse = await fetchApi<any>(`/policies/cluster/${clusterId}/stats`);
  
  if (statsResponse.error || !statsResponse.data) {
    return {
      data: null,
      error: statsResponse.error || 'Failed to fetch dashboard data',
      status: statsResponse.status,
    };
  }
  
  const stats = statsResponse.data;
  
  // Map API response to DashboardData (all values calculated in backend)
  return {
    data: {
      cluster_id: stats.cluster_id,
      cluster_name: stats.cluster_name,
      activePoliciesCount: stats.active_policies_count || 0,
      deployedPoliciesCount: stats.deployed_policies_count || 0,
      totalDeployments: stats.total_deployments || 0,
      failedDeploymentsCount: stats.failed_deployments_count || 0,
      enforcementRate: stats.enforcement_rate || 0,
      overallScore: stats.overall_score || 0,
      securityScore: stats.security_score || 0,
      costScore: stats.cost_score || 0,
      reliabilityScore: stats.reliability_score || 0,
      violationsCount: stats.violations_count || 0,
      violations24h: stats.violations_24h || 0,
      violations7d: stats.violations_7d || 0,
      violationTrend: stats.violation_trend || 'stable',
      totalLogs24h: stats.total_logs_24h || 0,
      successCount24h: stats.success_count_24h || 0,
      successRate: stats.success_rate || 0,
      resourcesScanned: stats.resources_scanned || 0,
      recentLogs: stats.recent_logs || [],
      generatedAt: stats.generated_at,
    },
    error: null,
    status: 200,
  };
}

// ============== Helm Charts API ==============

export async function getHelmCharts(): Promise<ApiResponse<HelmChart[]>> {
  return fetchApi<HelmChart[]>('/helm/charts');
}

export async function getHelmChartById(id: number): Promise<ApiResponse<HelmChart>> {
  return fetchApi<HelmChart>(`/helm/charts/${id}`);
}

export async function createHelmChart(data: {
  name: string;
  repo_url?: string;
  chart_yaml: string;
  values_yaml?: string;
  description?: string;
  version?: string;
  app_version?: string;
  icon?: string;
  is_active?: boolean;
}): Promise<ApiResponse<HelmChart>> {
  return fetchApi<HelmChart>('/helm/charts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateHelmChart(
  id: number,
  data: {
    name?: string;
    repo_url?: string;
    chart_yaml?: string;
    values_yaml?: string;
    description?: string;
    version?: string;
    app_version?: string;
    icon?: string;
    is_active?: boolean;
  }
): Promise<ApiResponse<HelmChart>> {
  return fetchApi<HelmChart>(`/helm/charts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteHelmChart(id: number): Promise<ApiResponse<{ message: string }>> {
  return fetchApi<{ message: string }>(`/helm/charts/${id}`, {
    method: 'DELETE',
  });
}

export async function validateHelmYaml(yamlContent: string): Promise<ApiResponse<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}>> {
  return fetchApi('/helm/validate', {
    method: 'POST',
    body: JSON.stringify({ yaml_content: yamlContent }),
  });
}

// ============== Helm Releases API ==============

export async function getHelmReleases(options?: {
  cluster_id?: number;
  chart_id?: number;
}): Promise<ApiResponse<HelmRelease[]>> {
  const params = new URLSearchParams();
  if (options?.cluster_id) params.append('cluster_id', options.cluster_id.toString());
  if (options?.chart_id) params.append('chart_id', options.chart_id.toString());
  const qs = params.toString();
  return fetchApi<HelmRelease[]>(`/helm/releases${qs ? `?${qs}` : ''}`);
}

export async function getHelmReleaseById(id: number): Promise<ApiResponse<HelmRelease>> {
  return fetchApi<HelmRelease>(`/helm/releases/${id}`);
}

export async function updateHelmRelease(
  id: number,
  data: { release_name?: string; namespace?: string; values_yaml?: string; status?: string }
): Promise<ApiResponse<HelmRelease>> {
  return fetchApi<HelmRelease>(`/helm/releases/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deployHelmChart(req: {
  chart_id: number;
  cluster_id: number;
  release_name: string;
  namespace?: string;
  values_yaml?: string;
}): Promise<ApiResponse<{ success: boolean; message: string; release_id?: number }>> {
  return fetchApi('/helm/deploy', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function deployHelmChartMulti(req: {
  chart_id: number;
  cluster_id: number;
  releases: Array<{ release_name: string; namespace: string; values_yaml?: string }>;
}): Promise<ApiResponse<{ success: boolean; message: string; results: any[] }>> {
  return fetchApi('/helm/deploy-multi', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function uninstallHelmRelease(
  releaseId: number
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return fetchApi('/helm/uninstall', {
    method: 'POST',
    body: JSON.stringify({ release_id: releaseId }),
  });
}

export async function deleteHelmRelease(
  releaseId: number
): Promise<ApiResponse<{ message: string }>> {
  return fetchApi<{ message: string }>(`/helm/releases/${releaseId}`, {
    method: 'DELETE',
  });
}
