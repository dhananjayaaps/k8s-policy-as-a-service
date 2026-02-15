import { Cloud } from 'lucide-react';

type HeaderProps = {
  selectedCluster: string;
  clusters: Array<{ id: string; name: string; status: string }>;
  onClusterChange: (clusterId: string) => void;
};

export default function Header({ selectedCluster, clusters, onClusterChange }: HeaderProps) {
  return (
    <div className="bg-white border-b border-slate-200 px-8 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">Cluster:</span>
          </div>
          <select
            value={selectedCluster}
            onChange={(e) => onClusterChange(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {clusters.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>
                {cluster.name}
              </option>
            ))}
          </select>
          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
            Connected
          </span>
        </div>

        <div className="text-sm text-slate-500">
          {new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })}
        </div>
      </div>
    </div>
  );
}
