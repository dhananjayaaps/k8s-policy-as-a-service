// API Service Layer
// This module provides a unified interface for data fetching.
// It can switch between mock data and real REST endpoints via config.

import { API_CONFIG, getApiUrl } from './config';
import type { Cluster, Policy, AuditLog, ComplianceMetric } from '../types';

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

// Simulate network delay for mock data (makes UI feel more realistic)
const simulateDelay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

// Generic fetch wrapper with error handling
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(getApiUrl(endpoint), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      return {
        data: null,
        error: `HTTP Error: ${response.status} ${response.statusText}`,
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

// ============== Audit Logs API ==============

export async function getAuditLogs(options?: {
  limit?: number;
  orderBy?: 'timestamp';
  order?: 'asc' | 'desc';
}): Promise<ApiResponse<AuditLog[]>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    let logs = [...(mockAuditLogs as AuditLog[])];
    
    // Sort by timestamp
    if (options?.orderBy === 'timestamp') {
      logs.sort((a, b) => {
        const comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
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
  
  return fetchApi<AuditLog[]>(`/audit-logs?${params.toString()}`);
}

export async function getAuditLogsByCluster(clusterId: string): Promise<ApiResponse<AuditLog[]>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay();
    const logs = (mockAuditLogs as AuditLog[]).filter(log => log.cluster_id === clusterId);
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
  metrics: ComplianceMetric | null;
  recentLogs: AuditLog[];
  activePoliciesCount: number;
  violationsCount: number;
  resourcesScanned: number;
};

export async function getDashboardData(): Promise<ApiResponse<DashboardData>> {
  if (API_CONFIG.useMockData) {
    await simulateDelay(400);
    
    const metrics = (mockComplianceMetrics as ComplianceMetric[])
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0] || null;
    
    const recentLogs = [...(mockAuditLogs as AuditLog[])]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 3);
    
    const activePoliciesCount = (mockPolicies as Policy[]).filter(p => p.is_active).length;
    const violationsCount = (mockAuditLogs as AuditLog[]).filter(log => {
      const logDate = new Date(log.timestamp);
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      return logDate >= oneDayAgo;
    }).length;
    
    return {
      data: {
        metrics,
        recentLogs,
        activePoliciesCount,
        violationsCount,
        resourcesScanned: 127, // Mock value
      },
      error: null,
      status: 200,
    };
  }
  
  return fetchApi<DashboardData>('/dashboard');
}
