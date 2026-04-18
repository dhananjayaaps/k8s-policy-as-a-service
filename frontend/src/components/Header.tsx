'use client';

import { useState, useRef, useEffect } from 'react';
import { Cloud, LogOut, User, ChevronDown, CheckCircle, XCircle, WifiOff } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useCluster } from '@/src/contexts/ClusterContext';
import { useRouter } from 'next/navigation';

export default function Header() {
  const { user, logout } = useAuth();
  const { clusters, selectedClusterId, setSelectedClusterId, loading } = useCluster();
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

  // Status helpers
  const statusDot = (isActive: boolean) =>
    isActive
      ? 'bg-emerald-500 shadow-[0_0_0_2px_#d1fae5]'
      : 'bg-slate-400 shadow-[0_0_0_2px_#e2e8f0]';

  const connectionBadge = () => {
    if (!selectedCluster) return null;
    if (!selectedCluster.is_active) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full border border-slate-200">
          <XCircle className="w-3 h-3" />
          Inactive
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200">
        <CheckCircle className="w-3 h-3" />
        Active
      </span>
    );
  };

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
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(selectedCluster.is_active)}`} />
                  <span className="truncate flex-1 text-left">{selectedCluster.name}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left text-slate-400">
                    {loading ? 'Loading...' : 'No cluster'}
                  </span>
                </>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && clusters.length > 0 && (
              <div className="absolute top-full mt-1 left-0 z-50 min-w-[240px] bg-white border border-slate-200 rounded-xl shadow-lg py-1 overflow-hidden">
                {/* Active clusters */}
                {clusters.some((c) => c.is_active) && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Active Clusters
                    </div>
                    {clusters.filter((c) => c.is_active).map((cluster) => (
                      <button
                        key={cluster.id}
                        onClick={() => { setSelectedClusterId(cluster.id); setOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors ${
                          selectedClusterId === cluster.id ? 'bg-emerald-50' : ''
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-500 shadow-[0_0_0_2px_#d1fae5]" />
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium truncate ${selectedClusterId === cluster.id ? 'text-emerald-700' : 'text-slate-900'}`}>
                            {cluster.name}
                          </div>
                          {cluster.host || cluster.server_url ? (
                            <div className="text-[11px] text-slate-400 truncate font-mono">
                              {cluster.server_url || cluster.host}
                            </div>
                          ) : null}
                        </div>
                        {selectedClusterId === cluster.id && (
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </>
                )}

                {/* Inactive clusters */}
                {clusters.some((c) => !c.is_active) && (
                  <>
                    <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${clusters.some((c) => c.is_active) ? 'border-t border-slate-100 mt-1' : ''}`}>
                      Inactive Clusters
                    </div>
                    {clusters.filter((c) => !c.is_active).map((cluster) => (
                      <button
                        key={cluster.id}
                        onClick={() => { setSelectedClusterId(cluster.id); setOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors opacity-60 ${
                          selectedClusterId === cluster.id ? 'bg-slate-50 opacity-100' : ''
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-400 shadow-[0_0_0_2px_#e2e8f0]" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-slate-600">{cluster.name}</div>
                          {cluster.host || cluster.server_url ? (
                            <div className="text-[11px] text-slate-400 truncate font-mono">
                              {cluster.server_url || cluster.host}
                            </div>
                          ) : null}
                        </div>
                        {selectedClusterId === cluster.id && (
                          <CheckCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Status badge for selected cluster */}
          {connectionBadge()}
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
