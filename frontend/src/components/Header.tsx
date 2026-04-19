'use client';

import { useState, useRef, useEffect } from 'react';
import { Cloud, LogOut, User, ChevronDown, CheckCircle, XCircle, WifiOff, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useCluster } from '@/src/contexts/ClusterContext';
import { useRouter } from 'next/navigation';

type StatusState = 'active' | 'inactive' | 'unavailable' | 'checking';

export default function Header() {
  const { user, logout } = useAuth();
  const { clusters, selectedClusterId, setSelectedClusterId, loading, clusterHealth } = useCluster();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCluster = clusters.find((c) => c.id === selectedClusterId) ?? null;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // Derive a 4-state status for any cluster
  const getStatus = (cluster: { id: number; is_active: boolean }): StatusState => {
    if (!cluster.is_active) return 'inactive';
    const h = clusterHealth[cluster.id];
    if (!h) return 'checking';
    return h.reachable ? 'active' : 'unavailable';
  };

  const statusStyles: Record<StatusState, { dot: string; badge: string; badgeText: string; badgeIcon: React.ReactNode; label: string }> = {
    active: {
      dot: 'bg-emerald-500 shadow-[0_0_0_2px_#d1fae5]',
      badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      badgeIcon: <CheckCircle className="w-3 h-3" />,
      badgeText: '',
      label: 'Active',
    },
    inactive: {
      dot: 'bg-slate-400 shadow-[0_0_0_2px_#e2e8f0]',
      badge: 'bg-slate-100 text-slate-600 border-slate-200',
      badgeIcon: <XCircle className="w-3 h-3" />,
      badgeText: '',
      label: 'Inactive',
    },
    unavailable: {
      dot: 'bg-red-500 shadow-[0_0_0_2px_#fee2e2]',
      badge: 'bg-red-100 text-red-700 border-red-200',
      badgeIcon: <WifiOff className="w-3 h-3" />,
      badgeText: '',
      label: 'Unavailable',
    },
    checking: {
      dot: 'bg-amber-400 shadow-[0_0_0_2px_#fef3c7]',
      badge: 'bg-amber-100 text-amber-700 border-amber-200',
      badgeIcon: <AlertTriangle className="w-3 h-3" />,
      badgeText: '',
      label: 'Checking…',
    },
  };

  const selectedStatus = selectedCluster ? getStatus(selectedCluster) : null;
  const ss = selectedStatus ? statusStyles[selectedStatus] : null;

  // Tooltip for unavailable: show the error reason
  const unavailableError = selectedCluster && selectedStatus === 'unavailable'
    ? clusterHealth[selectedCluster.id]?.error ?? 'Unreachable'
    : null;

  return (
    <div className="bg-white border-b border-slate-200 px-8 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">Cluster:</span>
          </div>

          {/* Custom cluster dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setOpen(!open)}
              disabled={loading || clusters.length === 0}
              className="flex items-center gap-2.5 px-3 py-2 min-w-[180px] border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {selectedCluster ? (
                <>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ss?.dot ?? 'bg-slate-300'}`} />
                  <span className="truncate flex-1 text-left">{selectedCluster.name}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left text-slate-400">
                    {loading ? 'Loading…' : 'No cluster'}
                  </span>
                </>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && clusters.length > 0 && (
              <div className="absolute top-full mt-1 left-0 z-50 min-w-[280px] bg-white border border-slate-200 rounded-xl shadow-lg py-1 overflow-hidden">
                {(['active', 'unavailable', 'checking', 'inactive'] as StatusState[]).map((group) => {
                  const inGroup = clusters.filter((c) => getStatus(c) === group);
                  if (inGroup.length === 0) return null;

                  const groupLabel: Record<StatusState, string> = {
                    active: 'Active',
                    unavailable: 'Unavailable',
                    checking: 'Checking',
                    inactive: 'Inactive',
                  };

                  return (
                    <div key={group}>
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-t border-slate-100 first:border-t-0">
                        {groupLabel[group]}
                      </div>
                      {inGroup.map((cluster) => {
                        const st = statusStyles[group];
                        const health = clusterHealth[cluster.id];
                        return (
                          <button
                            key={cluster.id}
                            onClick={() => { setSelectedClusterId(cluster.id); setOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors ${
                              selectedClusterId === cluster.id ? 'bg-slate-50' : ''
                            } ${group === 'inactive' ? 'opacity-60' : ''}`}
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot} ${group === 'active' ? 'animate-none' : ''}`} />
                            <div className="flex-1 min-w-0">
                              <div className={`font-medium truncate ${selectedClusterId === cluster.id ? 'text-slate-900' : 'text-slate-700'}`}>
                                {cluster.name}
                              </div>
                              {group === 'unavailable' && health?.error && (
                                <div className="text-[11px] text-red-500 truncate">{health.error}</div>
                              )}
                              {group === 'active' && health?.latency_ms != null && (
                                <div className="text-[11px] text-slate-400">{health.latency_ms}ms</div>
                              )}
                              {(cluster.server_url || cluster.host) && group !== 'unavailable' && (
                                <div className="text-[11px] text-slate-400 truncate font-mono">
                                  {cluster.server_url || cluster.host}
                                </div>
                              )}
                            </div>
                            {selectedClusterId === cluster.id && (
                              <CheckCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status badge for selected cluster */}
          {ss && selectedCluster && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${ss.badge}`}
              title={unavailableError ?? undefined}
            >
              {ss.badgeIcon}
              {ss.label}
              {unavailableError && (
                <span className="ml-0.5 opacity-70" title={unavailableError}>— {unavailableError.length > 30 ? unavailableError.slice(0, 30) + '…' : unavailableError}</span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-500">
            {new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </div>
          
          {/* User info */}
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
            <User className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">{user?.username}</span>
            {user?.role === 'admin' && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                Admin
              </span>
            )}
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}
