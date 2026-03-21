'use client';

import { Server } from 'lucide-react';
import ClusterManagement from '../components/ClusterManagement/ClusterManagement';

export default function ManageClusters() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
            <Server className="w-5 h-5 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Manage Clusters</h1>
        </div>
        <p className="text-slate-600 ml-13">
          Connect, configure, and monitor your Kubernetes clusters
        </p>
      </div>

      <ClusterManagement />
    </div>
  );
}
