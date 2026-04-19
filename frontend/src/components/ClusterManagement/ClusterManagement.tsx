'use client';

import { useState, useEffect } from 'react';
import { 
  Server, 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  WifiOff,
  Database,
  Loader2,
  Download
} from 'lucide-react';
import { 
  getClusters, 
  deleteCluster, 
  getKyvernoStatus,
  updateCluster
} from '../../lib/api';
import { useCluster } from '../../contexts/ClusterContext';
import type { Cluster } from '../../types';
import AddClusterModal from './AddClusterModal';
import EditClusterModal from './EditClusterModal';
import InstallKyvernoModal from './InstallKyvernoModal';

export default function ClusterManagement() {
  const { refreshClusters, clusterHealth, recheckHealth } = useCluster();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Cluster | null>(null);
  const [kyvernoStatuses, setKyvernoStatuses] = useState<Record<number, boolean>>({});
  const [installingKyverno, setInstallingKyverno] = useState<Record<number, boolean>>({});
  const [kyvernoModalCluster, setKyvernoModalCluster] = useState<Cluster | null>(null);

  useEffect(() => {
    loadClusters();
  }, []);

  async function loadClusters() {
    setLoading(true);
    const response = await getClusters();
    if (response.data) {
      setClusters(response.data);
      // Load Kyverno status for each cluster
      response.data.forEach(async (cluster) => {
        const status = await getKyvernoStatus(cluster.id);
        if (status.data) {
          setKyvernoStatuses(prev => ({ ...prev, [cluster.id]: status.data!.installed }));
        }
      });
    }
    setLoading(false);
  }

  async function handleInstallKyverno(clusterId: number) {
    // Find the cluster and show the install modal
    const cluster = clusters.find(c => c.id === clusterId);
    if (cluster) {
      setKyvernoModalCluster(cluster);
    }
  }

  async function handleKyvernoInstallSuccess() {
    if (kyvernoModalCluster) {
      setKyvernoStatuses(prev => ({ ...prev, [kyvernoModalCluster.id]: true }));
    }
    setKyvernoModalCluster(null);
  }

  async function handleDelete(clusterId: number, clusterName: string) {
    if (!confirm(`Are you sure you want to delete cluster "${clusterName}"? This action cannot be undone.`)) {
      return;
    }

    const response = await deleteCluster(clusterId);
    if (response.error) {
      alert(`Failed to delete cluster: ${response.error}`);
    } else {
      alert('Cluster deleted successfully');
      await loadClusters();
      await refreshClusters();
    }
  }

  async function handleAddSuccess() {
    setShowAddModal(false);
    await loadClusters();
    await refreshClusters();
    // After loading clusters, find the newest cluster and check if kyverno is installed
    // If not, prompt to install
    const response = await getClusters();
    if (response.data && response.data.length > 0) {
      // Get the most recently created cluster
      const newest = response.data.reduce((a, b) =>
        new Date(b.created_at) > new Date(a.created_at) ? b : a
      );
      // Check kyverno status for the new cluster
      const status = await getKyvernoStatus(newest.id);
      if (status.data && !status.data.installed) {
        setKyvernoModalCluster(newest);
      }
    }
  }

  async function handleEditSuccess() {
    setEditingCluster(null);
    await loadClusters();
    await refreshClusters();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Kubernetes Clusters</h3>
          <p className="text-sm text-slate-600 mt-1">
            Manage your connected Kubernetes clusters
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Cluster
        </button>
      </div>

      {/* Cluster List */}
      {clusters.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-12 text-center">
          <Server className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Clusters Connected</h3>
          <p className="text-slate-600 mb-6">
            Get started by adding your first Kubernetes cluster
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Cluster
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              kyvernoInstalled={kyvernoStatuses[cluster.id]}
              installingKyverno={installingKyverno[cluster.id] || false}
              healthStatus={clusterHealth[cluster.id]}
              onDelete={handleDelete}
              onEdit={(cluster) => setEditingCluster(cluster)}
              onInstallKyverno={handleInstallKyverno}
              onRecheckHealth={() => recheckHealth(cluster.id)}
            />
          ))}
        </div>
      )}

      {/* Add Cluster Modal */}
      {showAddModal && (
        <AddClusterModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      {/* Edit Cluster Modal */}
      {editingCluster && (
        <EditClusterModal
          cluster={editingCluster}
          onClose={() => setEditingCluster(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Install Kyverno Modal */}
      {kyvernoModalCluster && (
        <InstallKyvernoModal
          clusterId={kyvernoModalCluster.id}
          clusterName={kyvernoModalCluster.name}
          onClose={() => setKyvernoModalCluster(null)}
          onSuccess={handleKyvernoInstallSuccess}
        />
      )}
    </div>
  );
}

function ClusterCard({
  cluster,
  kyvernoInstalled,
  installingKyverno,
  healthStatus,
  onDelete,
  onEdit,
  onInstallKyverno,
  onRecheckHealth,
}: {
  cluster: Cluster;
  kyvernoInstalled?: boolean;
  installingKyverno: boolean;
  healthStatus?: { reachable: boolean; latency_ms: number | null; error: string | null; checkedAt: number };
  onDelete: (id: number, name: string) => void;
  onEdit: (cluster: Cluster) => void;
  onInstallKyverno: (clusterId: number) => void;
  onRecheckHealth: () => void;
}) {
  // Derive the full 4-state status
  type StatusState = 'active' | 'inactive' | 'unavailable' | 'checking';
  const status: StatusState = !cluster.is_active
    ? 'inactive'
    : !healthStatus
    ? 'checking'
    : healthStatus.reachable
    ? 'active'
    : 'unavailable';

  const statusConfig: Record<StatusState, { dotClass: string; pillClass: string; dotInner: React.ReactNode; label: string }> = {
    active: {
      dotClass: 'bg-emerald-500',
      pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotInner: <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />,
      label: 'Active',
    },
    inactive: {
      dotClass: 'bg-slate-400',
      pillClass: 'bg-slate-100 text-slate-500 border-slate-200',
      dotInner: null,
      label: 'Inactive',
    },
    unavailable: {
      dotClass: 'bg-red-500',
      pillClass: 'bg-red-50 text-red-700 border-red-200',
      dotInner: <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-50" />,
      label: 'Unavailable',
    },
    checking: {
      dotClass: 'bg-amber-400',
      pillClass: 'bg-amber-50 text-amber-700 border-amber-200',
      dotInner: null,
      label: 'Checking…',
    },
  };
  const sc = statusConfig[status];
  return (
    <div className={`bg-white rounded-xl border p-6 hover:shadow-md transition-shadow ${
      status === 'active' ? 'border-slate-200' :
      status === 'unavailable' ? 'border-red-200 bg-red-50/30' :
      'border-slate-200 opacity-75'
    }`}>
      <div className="flex items-start justify-between">
        {/* Cluster Info */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center relative ${
              status === 'active' ? 'bg-emerald-100' :
              status === 'unavailable' ? 'bg-red-100' :
              'bg-slate-100'
            }`}>
              {status === 'unavailable'
                ? <WifiOff className="w-5 h-5 text-red-500" />
                : <Database className={`w-5 h-5 ${status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`} />
              }
              {/* Status dot on the icon */}
              <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${sc.dotClass}`}>
                {sc.dotInner}
              </span>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900">{cluster.name}</h4>
              {cluster.description && (
                <p className="text-sm text-slate-600">{cluster.description}</p>
              )}
            </div>
          </div>

          {/* Cluster Details */}
          <div className="space-y-2 ml-13">
            {cluster.server_url && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">Server:</span>
                <span className="text-slate-700 font-mono text-xs">{cluster.server_url}</span>
              </div>
            )}
            {cluster.host && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">Host:</span>
                <span className="text-slate-700">{cluster.host}</span>
              </div>
            )}

            {/* Status Badges */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${sc.pillClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dotClass}`} />
                {sc.label}
              </span>

              {/* Latency badge when active */}
              {status === 'active' && healthStatus?.latency_ms != null && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 text-slate-500 text-xs rounded-full border border-slate-200">
                  {healthStatus.latency_ms}ms
                </span>
              )}

              {/* Error message when unavailable */}
              {status === 'unavailable' && healthStatus?.error && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 text-xs rounded-full border border-red-200 max-w-xs truncate" title={healthStatus.error}>
                  {healthStatus.error}
                </span>
              )}

              {/* Re-check button when unavailable */}
              {status === 'unavailable' && (
                <button
                  onClick={onRecheckHealth}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-white text-slate-600 text-xs rounded-full border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Retry
                </button>
              )}

              {kyvernoInstalled !== undefined && (
                kyvernoInstalled ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
                    <CheckCircle className="w-3 h-3" />
                    Kyverno Installed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                    <AlertCircle className="w-3 h-3" />
                    Kyverno Not Installed
                  </span>
                )
              )}
            </div>

            {/* Install Kyverno Button - only show when not installed */}
            {kyvernoInstalled === false && (
              <div className="mt-3">
                <button
                  onClick={() => onInstallKyverno(cluster.id)}
                  disabled={installingKyverno}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {installingKyverno ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Installing Kyverno...
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3" />
                      Install Kyverno
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(cluster)}
            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(cluster.id, cluster.name)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-500">
        <div className="flex items-center justify-between">
          <span>Added {new Date(cluster.created_at).toLocaleDateString()}</span>
          {cluster.updated_at && cluster.updated_at !== cluster.created_at && (
            <span>Updated {new Date(cluster.updated_at).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
