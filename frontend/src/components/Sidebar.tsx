'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ShoppingBag, FileCode, ScrollText, Server, UserCircle, Shield, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCluster } from '../contexts/ClusterContext';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag, adminOnly: false },
  { href: '/sandbox', label: 'Sandbox', icon: FileCode, adminOnly: false },
  { href: '/audit', label: 'Audit Logs', icon: ScrollText, adminOnly: false },
  { href: '/clusters', label: 'Manage Clusters', icon: Server, adminOnly: false },
  { href: '/policy-manager', label: 'Policy Manager', icon: Shield, adminOnly: true },
  { href: '/user-management', label: 'User Management', icon: Users, adminOnly: true },
  { href: '/profile', label: 'User Profile', icon: UserCircle, adminOnly: false },
];

export default function Sidebar() {
  const { user } = useAuth();
  const { selectedClusterId } = useCluster();
  const pathname = usePathname();

  // Preserve cluster in URL across navigation
  const clusterSuffix = selectedClusterId ? `?cluster=${selectedClusterId}` : '';

  return (
    <div className="fixed top-0 left-0 w-64 bg-slate-900 text-white h-screen flex flex-col flex-shrink-0 overflow-y-auto z-30">
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold">PolicyFlow</h1>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {menuItems.filter((item) => !item.adminOnly || user?.role === 'admin').map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={`${item.href}${clusterSuffix}`}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-150 ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/30'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium text-sm">{item.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors cursor-default">
          <div className="w-8 h-8 bg-gradient-to-br from-slate-500 to-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold">
              {(user?.full_name || user?.username || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="overflow-hidden min-w-0">
            <div className="text-sm font-medium truncate">
              {user?.full_name || user?.username || 'User'}
            </div>
            <div className="text-xs text-slate-400 capitalize">{user?.role || 'user'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
