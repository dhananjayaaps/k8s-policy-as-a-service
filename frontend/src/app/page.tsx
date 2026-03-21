'use client';

import { useState } from 'react';
import Sidebar from '@/src/components/Sidebar';
import Header from '@/src/components/Header';
import Dashboard from '@/src/views/Dashboard';
import Marketplace from '@/src/views/Marketplace';
import Sandbox from '@/src/views/Sandbox';
import AuditLogs from '@/src/views/AuditLogs';
import ManageClusters from '@/src/views/ManageClusters';
import Profile from '@/src/views/Profile';
import ProtectedRoute from '@/src/components/ProtectedRoute';

type ViewType = 'dashboard' | 'marketplace' | 'sandbox' | 'audit' | 'clusters' | 'profile';

export default function Home() {
  const [activeView, setActiveView] = useState<ViewType>('dashboard');

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
      case 'clusters':
        return <ManageClusters />;
      case 'profile':
        return <Profile />;
      default:
        return <Dashboard />;
    }
  };

  const handleViewChange = (view: string) => {
    setActiveView(view as ViewType);
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-slate-100">
        <Sidebar activeView={activeView} onViewChange={handleViewChange} />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 overflow-auto">
            {renderView()}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
