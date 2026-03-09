'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus, Server, Shield, DollarSign, Activity } from 'lucide-react';
import { getDashboardData } from '../lib/api';
import { useCluster } from '../contexts/ClusterContext';
import type { AuditLog, DashboardData } from '../types';

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { clusters, selectedClusterId, setSelectedClusterId, loading: loadingClusters } = useCluster();

  useEffect(() => {
    async function fetchData() {
      if (!selectedClusterId) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      const response = await getDashboardData(selectedClusterId);
      
      if (response.data) {
        setDashboardData(response.data);
      }
      setLoading(false);
    }
    
    fetchData();
  }, [selectedClusterId]);

  const scoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-600';
    if (score >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  const scoreBg = (score: number) => {
    if (score >= 90) return 'bg-emerald-50 border-emerald-200';
    if (score >= 75) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'increasing') return <TrendingUp className="w-4 h-4 text-red-500" />;
    if (trend === 'decreasing') return <TrendingDown className="w-4 h-4 text-green-500" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  const getTrendColor = (trend: string) => {
    if (trend === 'increasing') return 'text-red-600 bg-red-50';
    if (trend === 'decreasing') return 'text-green-600 bg-green-50';
    return 'text-slate-600 bg-slate-50';
  };

  if (loadingClusters) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Policy Compliance Dashboard</h1>
          <p className="text-slate-600">Monitor your cluster's security, cost, and reliability posture</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <Server className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Clusters Found</h3>
          <p className="text-slate-600">Please add a cluster first to view dashboard metrics.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Policy Compliance Dashboard</h1>
          <p className="text-slate-600">Monitor your cluster's security, cost, and reliability posture</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to Load Dashboard Data</h3>
          <p className="text-slate-600">Please try refreshing the page or select a different cluster.</p>
        </div>
      </div>
    );
  }

  const lastScanTime = dashboardData.generatedAt 
    ? new Date(dashboardData.generatedAt).toLocaleTimeString() 
    : 'Unknown';

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Policy Compliance Dashboard</h1>
        <p className="text-slate-600">
          Monitoring cluster: <span className="font-semibold">{dashboardData.cluster_name}</span>
        </p>
      </div>

      {/* Overall Compliance Card */}
      <div className="mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Overall Compliance</h2>
            <span className="text-sm text-slate-500">Last scan: {lastScanTime}</span>
          </div>

          <div className="flex items-center justify-center mb-8">
            <div className="relative">
              <svg className="w-48 h-48 transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  stroke="#e2e8f0"
                  strokeWidth="12"
                  fill="none"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  stroke="#10b981"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${dashboardData.overallScore * 5.02} 502`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-5xl font-bold text-slate-900">{dashboardData.overallScore}%</div>
                  <div className="text-sm text-slate-500 mt-1">Compliant</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg border ${scoreBg(dashboardData.securityScore)}`}>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-slate-600" />
                <div className="text-sm font-medium text-slate-700">Security</div>
              </div>
              <div className={`text-3xl font-bold ${scoreColor(dashboardData.securityScore)}`}>
                {dashboardData.securityScore}%
              </div>
            </div>
            <div className={`p-4 rounded-lg border ${scoreBg(dashboardData.costScore)}`}>
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-slate-600" />
                <div className="text-sm font-medium text-slate-700">Cost</div>
              </div>
              <div className={`text-3xl font-bold ${scoreColor(dashboardData.costScore)}`}>
                {dashboardData.costScore}%
              </div>
            </div>
            <div className={`p-4 rounded-lg border ${scoreBg(dashboardData.reliabilityScore)}`}>
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-slate-600" />
                <div className="text-sm font-medium text-slate-700">Reliability</div>
              </div>
              <div className={`text-3xl font-bold ${scoreColor(dashboardData.reliabilityScore)}`}>
                {dashboardData.reliabilityScore}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm text-slate-600 mb-2">Active Policies</div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{dashboardData.activePoliciesCount}</div>
          <div className="text-xs text-slate-500">{dashboardData.deployedPoliciesCount} deployed</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm text-slate-600 mb-2">Enforcement Rate</div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{dashboardData.enforcementRate}%</div>
          <div className="text-xs text-slate-500">{dashboardData.totalDeployments} total deployments</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm text-slate-600 mb-2">Success Rate</div>
          <div className="text-3xl font-bold text-emerald-600 mb-1">{dashboardData.successRate}%</div>
          <div className="text-xs text-slate-500">{dashboardData.successCount24h}/{dashboardData.totalLogs24h} succeeded</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm text-slate-600 mb-2">Resources Scanned</div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{dashboardData.resourcesScanned}</div>
          <div className="text-xs text-slate-500">Active monitoring</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
          </div>
          <div className="space-y-3">
            {dashboardData.recentLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
              </div>
            ) : (
              dashboardData.recentLogs.slice(0, 5).map((log) => {
                const resourceName = `${log.resource_type || 'Resource'}:${log.resource_id || 'N/A'}`;
                
                return (
                  <div key={log.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    {log.status === 'failure' ? (
                      <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{resourceName}</div>
                      <div className="text-xs text-slate-600 mt-1 truncate">{log.action}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded flex-shrink-0 ${
                      log.status === 'failure'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {log.status.toUpperCase()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Violations & Trends */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Violations & Trends</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-100">
              <div>
                <div className="text-sm text-slate-600">Violations (24h)</div>
                <div className="text-2xl font-bold text-slate-900">{dashboardData.violations24h}</div>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <div className="text-sm text-slate-600">Violations (7d)</div>
                <div className="text-2xl font-bold text-slate-900">{dashboardData.violations7d}</div>
              </div>
              <div className="flex items-center gap-2">
                {getTrendIcon(dashboardData.violationTrend)}
                <span className={`px-2 py-1 text-xs font-medium rounded ${getTrendColor(dashboardData.violationTrend)}`}>
                  {dashboardData.violationTrend.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
              <div>
                <div className="text-sm text-slate-600">Failed Deployments</div>
                <div className="text-2xl font-bold text-slate-900">{dashboardData.failedDeploymentsCount}</div>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
