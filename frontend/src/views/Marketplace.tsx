'use client';

import { useEffect, useState } from 'react';
import { Shield, DollarSign, Zap, FileText, Search } from 'lucide-react';
import { getPolicies, togglePolicyStatus } from '../lib/api';
import type { Policy } from '../types';

export default function Marketplace() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPolicies();
  }, []);

  async function loadPolicies() {
    setLoading(true);
    const response = await getPolicies();
    
    if (response.data) {
      // Sort by category
      const sorted = [...response.data].sort((a, b) => a.category.localeCompare(b.category));
      setPolicies(sorted);
    }
    setLoading(false);
  }

  async function handleTogglePolicy(policyId: string, currentState: boolean) {
    const response = await togglePolicyStatus(policyId, !currentState);
    
    if (response.data) {
      // Update local state
      setPolicies(prev =>
        prev.map(p => (p.id === policyId ? { ...p, is_active: !currentState } : p))
      );
    }
  }

  const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    Security: Shield,
    Cost: DollarSign,
    Reliability: Zap,
    Governance: FileText,
  };

  const categoryColors: Record<string, string> = {
    Security: 'bg-red-50 border-red-200 text-red-700',
    Cost: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    Reliability: 'bg-blue-50 border-blue-200 text-blue-700',
    Governance: 'bg-slate-50 border-slate-200 text-slate-700',
  };

  const severityColors: Record<string, string> = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-slate-100 text-slate-700',
  };

  const filteredPolicies = policies.filter((policy) => {
    const matchesCategory = filter === 'all' || policy.category === filter;
    const matchesSearch = policy.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         policy.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories = ['all', ...Array.from(new Set(policies.map(p => p.category)))];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Policy Marketplace</h1>
        <p className="text-slate-600">Enable pre-built policies to secure and optimize your cluster</p>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search policies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                filter === cat
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {filteredPolicies.map((policy) => {
          const Icon = categoryIcons[policy.category] || Shield;
          return (
            <div
              key={policy.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-lg border flex items-center justify-center ${categoryColors[policy.category]}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{policy.title}</h3>
                    <span className={`inline-block px-2 py-1 text-xs font-medium rounded mt-1 ${severityColors[policy.severity]}`}>
                      {policy.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleTogglePolicy(policy.id, policy.is_active)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    policy.is_active ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      policy.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{policy.description}</p>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <span className="text-xs font-medium text-slate-500">{policy.category}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
