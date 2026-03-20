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
  Database,
  Loader2
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

export default function ClusterManagement() {
  const { refreshClusters } = useCluster();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Cluster | null>(null);
  const [kyvernoStatuses, setKyvernoStatuses] = useState<Record<number, boolean>>({});

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
              onDelete={handleDelete}
              onEdit={(cluster) => setEditingCluster(cluster)}
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
    </div>
  );
}

function ClusterCard({
  cluster,
  kyvernoInstalled,
  onDelete,
  onEdit
}: {
  cluster: Cluster;
  kyvernoInstalled?: boolean;
  onDelete: (id: number, name: string) => void;
  onEdit: (cluster: Cluster) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        {/* Cluster Info */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-emerald-600" />
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
            <div className="flex items-center gap-2 mt-3">
              {cluster.is_active ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">
                  <CheckCircle className="w-3 h-3" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                  <XCircle className="w-3 h-3" />
                  Inactive
                </span>
              )}

              {kyvernoInstalled !== undefined && (
                kyvernoInstalled ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                    <CheckCircle className="w-3 h-3" />
                    Kyverno Installed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">
                    <AlertCircle className="w-3 h-3" />
                    Kyverno Not Installed
                  </span>
                )
              )}
            </div>
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
