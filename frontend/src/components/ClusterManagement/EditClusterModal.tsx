'use client';

import { useState } from 'react';
import { X, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { updateCluster } from '../../lib/api';
import type { Cluster } from '../../types';

interface EditClusterModalProps {
  cluster: Cluster;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditClusterModal({ cluster, onClose, onSuccess }: EditClusterModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: cluster.name,
    description: cluster.description || '',
    is_active: cluster.is_active,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await updateCluster(cluster.id, {
        name: formData.name,
        description: formData.description || undefined,
        is_active: formData.is_active,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      setSuccess(`Cluster "${formData.name}" updated successfully!`);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Edit Cluster</h2>
            <p className="text-sm text-slate-600 mt-1">
              Update cluster information
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Status Messages */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}
          {success && (
            <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-900">Success</p>
                <p className="text-sm text-emerald-700 mt-1">{success}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Read-only cluster info */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-slate-900 text-sm">Cluster Connection Details</h3>
              {cluster.server_url && (
                <div className="text-sm">
                  <span className="text-slate-500">Server:</span>{' '}
                  <span className="text-slate-700 font-mono text-xs">{cluster.server_url}</span>
                </div>
              )}
              {cluster.host && (
                <div className="text-sm">
                  <span className="text-slate-500">Host:</span>{' '}
                  <span className="text-slate-700">{cluster.host}</span>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-2">
                Connection details cannot be modified. To change connection settings, delete and re-add the cluster.
              </p>
            </div>

            {/* Editable Fields */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Cluster Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="production-cluster-1"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Production cluster for main application"
                rows={3}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded"
              />
              <label htmlFor="is_active" className="flex-1 cursor-pointer">
                <span className="text-sm font-medium text-slate-900">Active Cluster</span>
                <p className="text-xs text-slate-600 mt-0.5">
                  Inactive clusters won't appear in the cluster selector
                </p>
              </label>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
