'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus,
  Server, Shield, DollarSign, Activity, RefreshCw, Clock,
  Layers, XCircle, BarChart3, ArrowUpRight, ArrowDownRight,
  Zap, Eye, ChevronRight
} from 'lucide-react';
import { getDashboardData, getKyvernoStatus } from '../lib/api';
import { useCluster } from '../contexts/ClusterContext';
import type { DashboardData } from '../types';

// Radial gauge component for compliance scores
function RadialGauge({ score, size = 160, strokeWidth = 10, color }: {
  score: number; size?: number; strokeWidth?: number; color: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={center} cy={center} r={radius} stroke="#e2e8f0" strokeWidth={strokeWidth} fill="none" />
      <circle
        cx={center} cy={center} r={radius}
        stroke={color} strokeWidth={strokeWidth} fill="none"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700 ease-out"
      />
    </svg>
  );
}

// Score bar for the breakdown section
function ScoreBar({ label, score, icon }: { label: string; score: number; icon: React.ReactNode }) {
  const barColor = score >= 90 ? 'bg-emerald-500' : score >= 75 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = score >= 90 ? 'text-emerald-600' : score >= 75 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          {icon}
          {label}
        </div>
        <span className={`text-sm font-bold ${textColor}`}>{score}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// Metric card with optional trend
function MetricCard({ label, value, subtitle, icon, trend, trendValue }: {
  label: string; value: string | number; subtitle?: string;
  icon: React.ReactNode; trend?: 'up' | 'down' | 'neutral'; trendValue?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 bg-slate-50 rounded-lg">{icon}</div>
        {trend && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            trend === 'up' ? 'text-emerald-700 bg-emerald-50' :
            trend === 'down' ? 'text-red-700 bg-red-50' :
            'text-slate-600 bg-slate-50'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> :
             trend === 'down' ? <ArrowDownRight className="w-3 h-3" /> :
             <Minus className="w-3 h-3" />}
            {trendValue}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      {subtitle && <div className="text-[11px] text-slate-400 mt-0.5">{subtitle}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kyvernoInstalled, setKyvernoInstalled] = useState<boolean | null>(null);
  const { clusters, selectedClusterId, loading: loadingClusters } = useCluster();

  const fetchData = useCallback(async (showRefresh = false) => {
    if (!selectedClusterId) {
      setLoading(false);
      return;
    }
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    const response = await getDashboardData(selectedClusterId.toString());
    if (response.data) setDashboardData(response.data);

    // Check Kyverno status
    const kyvernoRes = await getKyvernoStatus(selectedClusterId);
    if (kyvernoRes.data) {
      setKyvernoInstalled(kyvernoRes.data.installed);
    }

    setLoading(false);
    setRefreshing(false);
  }, [selectedClusterId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const scoreColor = (score: number) =>
    score >= 90 ? '#10b981' : score >= 75 ? '#f59e0b' : '#ef4444';

  const scoreTextColor = (score: number) =>
    score >= 90 ? 'text-emerald-600' : score >= 75 ? 'text-amber-600' : 'text-red-600';

  const scoreLabel = (score: number) =>
    score >= 90 ? 'Excellent' : score >= 75 ? 'Needs Work' : 'Critical';

  const scoreLabelBg = (score: number) =>
    score >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    score >= 75 ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-red-50 text-red-700 border-red-200';

  const getTrendIcon = (trend: string) => {
    if (trend === 'increasing') return <TrendingUp className="w-4 h-4 text-red-500" />;
    if (trend === 'decreasing') return <TrendingDown className="w-4 h-4 text-green-500" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  const formatAction = (action: string) =>
    action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const timeAgo = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // --- Loading / Empty States ---
  if (loadingClusters) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-600 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading clusters...</p>
        </div>
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
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center max-w-lg mx-auto">
          <Server className="w-14 h-14 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Clusters Connected</h3>
          <p className="text-slate-600 text-sm">Connect a Kubernetes cluster to start monitoring policy compliance, security posture, and deployment health.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-600 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading dashboard data...</p>
        </div>
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
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-lg mx-auto">
          <AlertTriangle className="w-14 h-14 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Unable to Load Data</h3>
          <p className="text-slate-600 text-sm mb-4">Dashboard data could not be retrieved. The cluster may be unreachable.</p>
          <button onClick={() => fetchData()} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const d = dashboardData;
  const lastScanTime = d.generatedAt ? new Date(d.generatedAt).toLocaleTimeString() : 'Unknown';
  const deploymentSuccessRate = d.totalDeployments > 0
    ? Math.round(((d.totalDeployments - d.failedDeploymentsCount) / d.totalDeployments) * 100) : 100;
  const avgViolationsPerDay7d = d.violations7d > 0 ? Math.round(d.violations7d / 7) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Policy Compliance Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            Cluster: <span className="font-semibold text-slate-700">{d.cluster_name}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            Last updated: {lastScanTime}
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Kyverno Status Banner */}
      {kyvernoInstalled === false && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">Kyverno is not installed on this cluster</p>
              <p className="text-xs text-amber-700">Policy enforcement requires Kyverno. Go to Manage Clusters to install it.</p>
            </div>
          </div>
          <a
            href="/clusters"
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
          >
            <Shield className="w-4 h-4" />
            Install Kyverno
          </a>
        </div>
      )}

      {/* Top Row: Overall Score + Score Breakdown + Health Status */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* Overall Compliance Gauge */}
        <div className="col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center">
          <div className="relative mb-3">
            <RadialGauge score={d.overallScore} size={160} strokeWidth={12} color={scoreColor(d.overallScore)} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-4xl font-bold ${scoreTextColor(d.overallScore)}`}>{d.overallScore}</div>
                <div className="text-[11px] text-slate-400 font-medium">/ 100</div>
              </div>
            </div>
          </div>
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Overall Compliance</h3>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${scoreLabelBg(d.overallScore)}`}>
            {scoreLabel(d.overallScore)}
          </span>
        </div>

        {/* Score Breakdown Bars */}
        <div className="col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-5">Compliance Breakdown</h3>
          <div className="space-y-5">
            <ScoreBar label="Security" score={d.securityScore} icon={<Shield className="w-4 h-4 text-blue-500" />} />
            <ScoreBar label="Cost Efficiency" score={d.costScore} icon={<DollarSign className="w-4 h-4 text-emerald-500" />} />
            <ScoreBar label="Reliability" score={d.reliabilityScore} icon={<Activity className="w-4 h-4 text-purple-500" />} />
          </div>
        </div>

        {/* Cluster Health Summary */}
        <div className="col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Cluster Health</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full ${d.failedDeploymentsCount === 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="text-sm text-slate-700">Deployments</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{deploymentSuccessRate}% healthy</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full ${d.violations24h === 0 ? 'bg-emerald-500' : d.violations24h <= 3 ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-sm text-slate-700">Violations (24h)</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{d.violations24h}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full ${d.enforcementRate >= 80 ? 'bg-emerald-500' : d.enforcementRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-sm text-slate-700">Enforcement</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{d.enforcementRate}%</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full ${d.successRate >= 90 ? 'bg-emerald-500' : d.successRate >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-sm text-slate-700">Success Rate</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{d.successRate}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-5 gap-4 mb-4">
        <MetricCard
          label="Active Policies"
          value={d.activePoliciesCount}
          subtitle={`${d.deployedPoliciesCount} currently deployed`}
          icon={<Layers className="w-4 h-4 text-indigo-500" />}
        />
        <MetricCard
          label="Total Deployments"
          value={d.totalDeployments}
          subtitle={`${d.failedDeploymentsCount} failed`}
          icon={<Zap className="w-4 h-4 text-amber-500" />}
          trend={d.failedDeploymentsCount === 0 ? 'up' : 'down'}
          trendValue={d.failedDeploymentsCount === 0 ? 'All OK' : `${d.failedDeploymentsCount} issues`}
        />
        <MetricCard
          label="Success Rate (24h)"
          value={`${d.successRate}%`}
          subtitle={`${d.successCount24h} of ${d.totalLogs24h} operations`}
          icon={<CheckCircle className="w-4 h-4 text-emerald-500" />}
          trend={d.successRate >= 90 ? 'up' : d.successRate >= 70 ? 'neutral' : 'down'}
          trendValue={d.successRate >= 90 ? 'Healthy' : d.successRate >= 70 ? 'Fair' : 'Low'}
        />
        <MetricCard
          label="Resources Scanned"
          value={d.resourcesScanned}
          subtitle="Under active monitoring"
          icon={<Eye className="w-4 h-4 text-sky-500" />}
        />
        <MetricCard
          label="Violations (7d)"
          value={d.violations7d}
          subtitle={`~${avgViolationsPerDay7d}/day avg`}
          icon={<AlertTriangle className="w-4 h-4 text-orange-500" />}
          trend={d.violationTrend === 'decreasing' ? 'up' : d.violationTrend === 'increasing' ? 'down' : 'neutral'}
          trendValue={d.violationTrend === 'decreasing' ? 'Improving' : d.violationTrend === 'increasing' ? 'Rising' : 'Stable'}
        />
      </div>

      {/* Bottom Row: Violations + Recent Activity */}
      <div className="grid grid-cols-12 gap-4">
        {/* Violations Panel */}
        <div className="col-span-5 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-slate-800">Violation Overview</h3>
            <div className="flex items-center gap-1.5">
              {getTrendIcon(d.violationTrend)}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                d.violationTrend === 'increasing' ? 'text-red-700 bg-red-50' :
                d.violationTrend === 'decreasing' ? 'text-emerald-700 bg-emerald-50' :
                'text-slate-600 bg-slate-100'
              }`}>{d.violationTrend}</span>
            </div>
          </div>

          {/* Mini bar chart: 24h vs 7d */}
          <div className="flex items-end gap-6 mb-6">
            <div className="flex-1">
              <div className="text-xs text-slate-500 mb-1">Last 24 hours</div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-slate-900">{d.violations24h}</span>
                <div className="pb-1">
                  <div className="h-8 w-16 bg-orange-100 rounded-md relative overflow-hidden">
                    <div
                      className="absolute bottom-0 w-full bg-orange-400 rounded-md transition-all duration-500"
                      style={{ height: d.violations7d > 0 ? `${Math.min((d.violations24h / d.violations7d) * 100, 100)}%` : '0%' }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 mb-1">Last 7 days</div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-slate-900">{d.violations7d}</span>
                <div className="pb-1">
                  <div className="h-8 w-16 bg-slate-100 rounded-md relative overflow-hidden">
                    <div className="absolute bottom-0 w-full bg-slate-400 rounded-md h-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-slate-700">Failed Deployments</span>
              </div>
              <span className={`text-sm font-bold ${d.failedDeploymentsCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {d.failedDeploymentsCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-700">Daily Average (7d)</span>
              </div>
              <span className="text-sm font-bold text-slate-900">{avgViolationsPerDay7d}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-slate-700">Enforcement Rate</span>
              </div>
              <span className="text-sm font-bold text-slate-900">{d.enforcementRate}%</span>
            </div>
          </div>
        </div>

        {/* Recent Activity Timeline */}
        <div className="col-span-7 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-slate-800">Recent Activity</h3>
            <span className="text-xs text-slate-400">{d.totalLogs24h} events in the last 24h</span>
          </div>

          {d.recentLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Activity className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm">No recent activity recorded</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-200" />

              <div className="space-y-1">
                {d.recentLogs.slice(0, 6).map((log) => {
                  const isFailure = log.status === 'failure';
                  const detailName = log.details && typeof log.details === 'object' && log.details.name
                    ? log.details.name : null;
                  const displayLabel = detailName || `${log.resource_type || 'resource'}#${log.resource_id || '?'}`;

                  return (
                    <div key={log.id} className="relative flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group">
                      <div className={`relative z-10 mt-0.5 flex-shrink-0 w-[30px] h-[30px] rounded-full flex items-center justify-center ${
                        isFailure ? 'bg-red-100' : 'bg-emerald-100'
                      }`}>
                        {isFailure
                          ? <XCircle className="w-4 h-4 text-red-500" />
                          : <CheckCircle className="w-4 h-4 text-emerald-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 truncate">{formatAction(log.action)}</span>
                          <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                          <span className="text-sm text-slate-500 truncate">{displayLabel}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{timeAgo(log.created_at)}</div>
                      </div>
                      <span className={`flex-shrink-0 mt-1 inline-block w-2 h-2 rounded-full ${isFailure ? 'bg-red-400' : 'bg-emerald-400'}`} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
