'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { getDashboardData } from '../lib/api';
import type { ComplianceMetric, AuditLog } from '../types';

export default function Dashboard() {
  const [metrics, setMetrics] = useState<ComplianceMetric | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [activePolicies, setActivePolicies] = useState(0);
  const [violations, setViolations] = useState(0);
  const [resourcesScanned, setResourcesScanned] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const response = await getDashboardData();
    
    if (response.data) {
      setMetrics(response.data.metrics);
      setRecentLogs(response.data.recentLogs);
      setActivePolicies(response.data.activePoliciesCount);
      setViolations(response.data.violationsCount);
      setResourcesScanned(response.data.resourcesScanned);
    }
    setLoading(false);
  }

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

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Policy Compliance Dashboard</h1>
        <p className="text-slate-600">Monitor your cluster's security, cost, and reliability posture</p>
      </div>

      <div className="mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Overall Compliance</h2>
            <span className="text-sm text-slate-500">Last scan: 2 minutes ago</span>
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
                  strokeDasharray={`${(metrics?.overall_score || 0) * 5.02} 502`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-5xl font-bold text-slate-900">{metrics?.overall_score || 0}%</div>
                  <div className="text-sm text-slate-500 mt-1">Compliant</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg border ${scoreBg(metrics?.security_score || 0)}`}>
              <div className="text-sm font-medium text-slate-700 mb-2">Security</div>
              <div className={`text-3xl font-bold ${scoreColor(metrics?.security_score || 0)}`}>
                {metrics?.security_score || 0}%
              </div>
            </div>
            <div className={`p-4 rounded-lg border ${scoreBg(metrics?.cost_score || 0)}`}>
              <div className="text-sm font-medium text-slate-700 mb-2">Cost</div>
              <div className={`text-3xl font-bold ${scoreColor(metrics?.cost_score || 0)}`}>
                {metrics?.cost_score || 0}%
              </div>
            </div>
            <div className={`p-4 rounded-lg border ${scoreBg(metrics?.reliability_score || 0)}`}>
              <div className="text-sm font-medium text-slate-700 mb-2">Reliability</div>
              <div className={`text-3xl font-bold ${scoreColor(metrics?.reliability_score || 0)}`}>
                {metrics?.reliability_score || 0}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
          </div>
          <div className="space-y-3">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                {log.action_taken === 'BLOCKED' ? (
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900">{log.resource_name}</div>
                  <div className="text-xs text-slate-600 mt-1">{log.details}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  log.action_taken === 'BLOCKED'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {log.action_taken}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Quick Stats</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div>
                <div className="text-sm text-slate-600">Active Policies</div>
                <div className="text-2xl font-bold text-slate-900">{activePolicies}</div>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
              <div>
                <div className="text-sm text-slate-600">Violations (24h)</div>
                <div className="text-2xl font-bold text-slate-900">{violations}</div>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg">
              <div>
                <div className="text-sm text-slate-600">Resources Scanned</div>
                <div className="text-2xl font-bold text-slate-900">{resourcesScanned}</div>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
