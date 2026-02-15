'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/src/components/Sidebar';
import Header from '@/src/components/Header';
import Dashboard from '@/src/views/Dashboard';
import Marketplace from '@/src/views/Marketplace';
import Sandbox from '@/src/views/Sandbox';
import AuditLogs from '@/src/views/AuditLogs';
import Settings from '@/src/views/Settings';
import { getClusters } from '@/src/lib/api';
import type { Cluster } from '@/src/types';

type ViewType = 'dashboard' | 'marketplace' | 'sandbox' | 'audit' | 'settings';

export default function Home() {
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>('');

  useEffect(() => {
    loadClusters();
  }, []);

  async function loadClusters() {
    const response = await getClusters();

    if (response.data && response.data.length > 0) {
      setClusters(response.data);
      setSelectedCluster(response.data[0].id);
    }
  }

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />;
      case 'marketplace':
        return <Marketplace />;
      case 'sandbox':
        return <Sandbox />;
      case 'audit':
        return <AuditLogs />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  const handleViewChange = (view: string) => {
    setActiveView(view as ViewType);
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar activeView={activeView} onViewChange={handleViewChange} />
      <div className="flex-1 flex flex-col">
        <Header
          selectedCluster={selectedCluster}
          clusters={clusters}
          onClusterChange={setSelectedCluster}
        />
        <main className="flex-1 overflow-auto">
          {renderView()}
        </main>
      </div>
    </div>
  );
}
