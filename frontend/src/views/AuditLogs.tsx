'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Download,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  User,
  ChevronDown,
  X,
  Eye,
} from 'lucide-react';
import { getAuditLogs, getAuditLogStats } from '../lib/api';
import type { AuditLog } from '../types';

type Stats = {
  total: number;
  success_count: number;
  failure_count: number;
  actions: Record<string, number>;
  resource_types: Record<string, number>;
};

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, string> = {
  policy_create: 'Policy Created',
  policy_update: 'Policy Updated',
  policy_delete: 'Policy Deleted',
  policy_deploy: 'Policy Deployed',
  policy_undeploy: 'Policy Undeployed',
  cluster_connect: 'Cluster Connected',
  cluster_create: 'Cluster Created',
  cluster_delete: 'Cluster Deleted',
  kyverno_install: 'Kyverno Installed',
  kyverno_uninstall: 'Kyverno Uninstalled',
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatResourceType(rt: string | null): string {
  if (!rt) return '—';
  return rt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const response = await getAuditLogs({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      action: actionFilter !== 'all' ? actionFilter : undefined,
      resource_type: resourceTypeFilter !== 'all' ? resourceTypeFilter : undefined,
      search: searchQuery || undefined,
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    });

    if (response.data) {
      setLogs(response.data);
      setHasMore(response.data.length === PAGE_SIZE);
    } else {
      setLogs([]);
      setHasMore(false);
    }
    setLoading(false);
  }, [statusFilter, actionFilter, resourceTypeFilter, searchQuery, page]);

  const loadStats = useCallback(async () => {
    const response = await getAuditLogStats();
    if (response.data) {
      setStats(response.data);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, actionFilter, resourceTypeFilter, searchQuery]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadLogs(), loadStats()]);
    setRefreshing(false);
  };

  const handleExport = () => {
    if (logs.length === 0) return;
    const headers = ['ID', 'Timestamp', 'User', 'Action', 'Resource Type', 'Resource ID', 'Status', 'Error', 'Details'];
    const rows = logs.map((log) => [
      log.id,
      new Date(log.created_at).toISOString(),
      log.username || '—',
      log.action,
      log.resource_type || '',
      log.resource_id ?? '',
      log.status,
      log.error_message || '',
      typeof log.details === 'object' ? JSON.stringify(log.details) : (log.details || ''),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setActionFilter('all');
    setResourceTypeFilter('all');
    setPage(0);
  };

  const hasActiveFilters =
    searchQuery !== '' || statusFilter !== 'all' || actionFilter !== 'all' || resourceTypeFilter !== 'all';

  const actionOptions = stats ? Object.keys(stats.actions).sort() : [];
  const resourceTypeOptions = stats ? Object.keys(stats.resource_types).sort() : [];

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track all policy and cluster operations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={logs.length === 0}
            className="px-3 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-5">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
                <div className="text-xs text-slate-500">Total Events</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-600">{stats.success_count}</div>
                <div className="text-xs text-slate-500">Successful</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{stats.failure_count}</div>
                <div className="text-xs text-slate-500">Failed</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  {Object.keys(stats.actions).length}
                </div>
                <div className="text-xs text-slate-500">Action Types</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-5">
        <div className="p-4 flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[220px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search actions, users, errors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Action filter */}
          <div className="relative">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
            >
              <option value="all">All Actions</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>
                  {formatAction(a)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Resource type filter */}
          <div className="relative">
            <select
              value={resourceTypeFilter}
              onChange={(e) => setResourceTypeFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
            >
              <option value="all">All Resources</option>
              {resourceTypeOptions.map((rt) => (
                <option key={rt} value={rt}>
                  {formatResourceType(rt)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <Activity className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="font-semibold text-slate-700 mb-1">No audit logs found</h3>
            <p className="text-sm text-slate-500 max-w-xs">
              {hasActiveFilters
                ? 'Try adjusting your filters or search query.'
                : 'Audit logs will appear here as you perform operations.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-auto flex-1">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-[160px]">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-[120px]">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-[140px]">
                      Resource
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-[90px]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Details
                    </th>
                    <th className="px-4 py-3 w-[50px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => {
                    const detailsStr = log.error_message
                      || (typeof log.details === 'string'
                        ? log.details
                        : log.details
                        ? Object.entries(log.details)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ')
                        : '')
                      || '—';

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-900">
                            {timeAgo(log.created_at)}
                          </div>
                          <div className="text-xs text-slate-400">
                            {new Date(log.created_at).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-slate-900">
                            {formatAction(log.action)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-sm text-slate-600">
                              {log.username || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-600">
                            {formatResourceType(log.resource_type)}
                          </div>
                          {log.resource_id && (
                            <div className="text-xs text-slate-400">ID: {log.resource_id}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                              log.status === 'failure'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {log.status === 'failure' ? (
                              <XCircle className="w-3 h-3" />
                            ) : (
                              <CheckCircle className="w-3 h-3" />
                            )}
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 max-w-[300px] truncate">
                          {detailsStr}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between bg-white">
              <div className="text-sm text-slate-500">
                Page {page + 1}
                {stats && ` · ${stats.total} total events`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Audit Log #{selectedLog.id}
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Action
                  </label>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {formatAction(selectedLog.action)}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Status
                  </label>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                        selectedLog.status === 'failure'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {selectedLog.status === 'failure' ? (
                        <XCircle className="w-3 h-3" />
                      ) : (
                        <CheckCircle className="w-3 h-3" />
                      )}
                      {selectedLog.status}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    User
                  </label>
                  <div className="mt-1 text-sm text-slate-700">
                    {selectedLog.username || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Timestamp
                  </label>
                  <div className="mt-1 text-sm text-slate-700">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Resource Type
                  </label>
                  <div className="mt-1 text-sm text-slate-700">
                    {formatResourceType(selectedLog.resource_type)}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Resource ID
                  </label>
                  <div className="mt-1 text-sm text-slate-700">
                    {selectedLog.resource_id ?? '—'}
                  </div>
                </div>
              </div>

              {selectedLog.error_message && (
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Error Message
                  </label>
                  <div className="mt-1 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 whitespace-pre-wrap">
                    {selectedLog.error_message}
                  </div>
                </div>
              )}

              {selectedLog.details && (
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Details
                  </label>
                  <div className="mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    {typeof selectedLog.details === 'object' ? (
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                        {JSON.stringify(selectedLog.details, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-slate-700">{selectedLog.details}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
