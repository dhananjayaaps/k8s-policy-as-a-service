// API Service Layer
// This module provides a unified interface for data fetching.
// It can switch between mock data and real REST endpoints via config.

import { API_CONFIG, getApiUrl } from './config';
import type { Cluster, Policy, AuditLog, ComplianceMetric, User, LoginRequest, SignupRequest, AuthResponse } from '../types';

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

// ============== Clusters API ==============

export async function getClusters(): Promise<ApiResponse<Cluster[]>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    return { data: mockClusters as Cluster[], error: null, status: 200 };
  }
  return fetchApi<Cluster[]>('/clusters');
}

export async function getClusterById(id: string): Promise<ApiResponse<Cluster | null>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    const cluster = (mockClusters as Cluster[]).find(c => c.id === id) || null;
    return { data: cluster, error: null, status: cluster ? 200 : 404 };
  }
  return fetchApi<Cluster>(`/clusters/${id}`);
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
  return fetchApi(`/policies/quick-deploy/${policyId}/cluster/${clusterId}`, {
    method: 'POST',
    body: JSON.stringify({ namespace }),
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

// ============== Audit Logs API ==============

export async function getAuditLogs(options?: {
  limit?: number;
  orderBy?: 'timestamp';
  order?: 'asc' | 'desc';
}): Promise<ApiResponse<AuditLog[]>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    let logs = [...(mockAuditLogs as any)] as AuditLog[];
    
    // Sort by timestamp (mock data uses 'timestamp', real API uses 'created_at')
    if (options?.orderBy === 'timestamp') {
      logs.sort((a: any, b: any) => {
        const comparison = new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime();
        return options.order === 'asc' ? comparison : -comparison;
      });
    }
    
    // Apply limit
    if (options?.limit) {
      logs = logs.slice(0, options.limit);
    }
    
    return { data: logs, error: null, status: 200 };
  }
  
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.orderBy) params.append('orderBy', options.orderBy);
  if (options?.order) params.append('order', options.order);
  
  return fetchApi<AuditLog[]>(`/policies/audit-logs?${params.toString()}`);
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
