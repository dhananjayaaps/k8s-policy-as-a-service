'use client';

import { useEffect, useState } from 'react';
import { Shield, DollarSign, Zap, FileText, Search, Rocket, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { getPolicies, checkDeploymentStatus, quickDeployPolicy, quickUndeployPolicy } from '../lib/api';
import { useCluster } from '../contexts/ClusterContext';
import PolicyEditorModal from '../components/PolicyEditor/PolicyEditorModal';
import type { Policy } from '../types';

interface PolicyDeploymentStatus {
  [policyId: string]: {
    deployed: boolean;
    loading: boolean;
    canQuickDeploy?: boolean;
    requiresConfig?: boolean;
    hasPreviousConfig?: boolean;
    deployment_info?: {
      deployment_id: number;
      namespace: string;
      deployed_at: string;
      status: string;
      parameters: any;
    };
  };
}

export default function Marketplace() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<PolicyDeploymentStatus>({});
  const [currentDeploymentParams, setCurrentDeploymentParams] = useState<Record<string, any>>({});
  const { clusters, selectedClusterId } = useCluster();

  useEffect(() => {
    loadPolicies();
  }, []);

  useEffect(() => {
    // Load deployment status when cluster changes
    if (selectedClusterId && policies.length > 0) {
      loadDeploymentStatuses();
    }
  }, [selectedClusterId, policies]);

  async function loadPolicies() {
    setLoading(true);
    const response = await getPolicies();
    
    if (response.data) {
      // Show ALL policies (marketplace = available templates)
      const sorted = [...response.data].sort((a, b) => a.category.localeCompare(b.category));
      setPolicies(sorted);
    }
    setLoading(false);
  }

  async function loadDeploymentStatuses() {
    if (!selectedClusterId) return;

    const statuses: PolicyDeploymentStatus = {};
    
    // Initialize all as loading
    policies.forEach(policy => {
      statuses[policy.id] = { deployed: false, loading: true };
    });
    setDeploymentStatus(statuses);

    // Check each policy's deployment status with enhanced info
    await Promise.all(
      policies.map(async (policy) => {
        try {
          const response = await checkDeploymentStatus(policy.id, selectedClusterId);
          if (response.data) {
            statuses[policy.id] = {
              deployed: response.data.deployed,
              loading: false,
              canQuickDeploy: response.data.can_quick_deploy,
              requiresConfig: response.data.requires_config,
              hasPreviousConfig: response.data.has_previous_config,
              deployment_info: response.data.deployment_info || undefined
            };
          }
        } catch (error) {
          statuses[policy.id] = { deployed: false, loading: false };
        }
      })
    );

    setDeploymentStatus({ ...statuses });
  }

  async function handleToggleDeployment(policy: Policy, currentlyDeployed: boolean) {
    if (!selectedClusterId) {
      alert('Please select a cluster first');
      return;
    }

    // Set loading state
    setDeploymentStatus(prev => ({
      ...prev,
      [policy.id]: { ...prev[policy.id], loading: true }
    }));

    try {
      if (currentlyDeployed) {
        // Undeploy from cluster
        const response = await quickUndeployPolicy(policy.id, selectedClusterId);
        if (response.data?.success) {
          setDeploymentStatus(prev => ({
            ...prev,
            [policy.id]: { deployed: false, loading: false }
          }));
        } else {
          throw new Error(response.error || 'Failed to undeploy');
        }
      } else {
        // Try to deploy to cluster
        const response = await quickDeployPolicy(policy.id, selectedClusterId);
        
        // Check if configuration is required
        if (response.error && typeof response.error === 'object') {
          const errorDetail = response.error as any;
          if (errorDetail.error === 'configuration_required') {
            // Configuration needed - open editor instead
            setDeploymentStatus(prev => ({
              ...prev,
              [policy.id]: { deployed: false, loading: false }
            }));
            setSelectedPolicy(policy);
            setIsEditorOpen(true);
            return;
          }
        }
        
        if (response.data?.success) {
          setDeploymentStatus(prev => ({
            ...prev,
            [policy.id]: { deployed: true, loading: false }
          }));
        } else {
          throw new Error(response.error || 'Failed to deploy');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Operation failed';
      alert(errorMessage);
      setDeploymentStatus(prev => ({
        ...prev,
        [policy.id]: { deployed: currentlyDeployed, loading: false }
      }));
    }
  }

  const handleDeployClick = async (policy: Policy) => {
    if (!selectedClusterId) {
      alert('Please select a cluster first');
      return;
    }
    
    // Fetch current deployment parameters if exists
    try {
      const statusResponse = await checkDeploymentStatus(policy.id, selectedClusterId);
      if (statusResponse.data?.deployment_info?.parameters) {
        // Pre-fill with current deployed parameters
        setCurrentDeploymentParams(statusResponse.data.deployment_info.parameters);
      } else {
        // No current deployment, start with empty
        setCurrentDeploymentParams({});
      }
    } catch (error) {
      // No deployment found, start with empty
      setCurrentDeploymentParams({});
    }
    
    setSelectedPolicy(policy);
    setIsEditorOpen(true);
  };

  const handleDeploySuccess = () => {
    loadDeploymentStatuses(); // Refresh deployment statuses
  };

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
    const matchesSearch = 
      (policy.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (policy.description?.toLowerCase() || '').includes(searchQuery.toLowerCase());
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
        <p className="text-slate-600">Deploy pre-built policies to secure and optimize your cluster</p>
      </div>

      {/* Cluster Selection Warning */}
      {!selectedClusterId && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            Please select a cluster from the dropdown to view deployment status and deploy policies.
          </p>
        </div>
      )}

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
          const status = deploymentStatus[policy.id];
          const isDeployed = status?.deployed || false;
          const isLoading = status?.loading || false;
          const canToggle = status?.canQuickDeploy !== false; // Can toggle if true or undefined (loading)
          const requiresFirstConfig = status?.requiresConfig && !status?.hasPreviousConfig && !isDeployed;
          
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
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{policy.title}</h3>
                      {selectedClusterId && isDeployed && (
                        <span title="Deployed to selected cluster">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </span>
                      )}
                    </div>
                    <span className={`inline-block px-2 py-1 text-xs font-medium rounded mt-1 ${severityColors[policy.severity || 'low']}`}>
                      {(policy.severity || 'low').toUpperCase()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleDeployment(policy, isDeployed)}
                  disabled={!selectedClusterId || isLoading || !canToggle}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    !selectedClusterId || !canToggle ? 'bg-slate-200 cursor-not-allowed' :
                    isDeployed ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                  title={
                    !selectedClusterId ? 'Select a cluster first' :
                    !canToggle ? 'Configure parameters using Deploy button first' :
                    isDeployed ? 'Deployed - Click to undeploy' : 'Available - Click to deploy'
                  }
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 text-white absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-spin" />
                  ) : (
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                        (!selectedClusterId || !canToggle) ? 'bg-slate-400' : 'bg-white'
                      } ${
                        isDeployed ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  )}
                </button>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">{policy.description}</p>
              {/* Deployment Status and Config Info */}
              {selectedClusterId && (
                <div className="mb-3 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    {/* Deployment Status */}
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${
                      isDeployed 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-slate-50 text-slate-600 border border-slate-200'
                    }`}>
                      {isDeployed ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Deployed
                        </>
                      ) : (
                        'Available'
                      )}
                    </span>
                    
                    {/* Configuration Status - Only show when not deployed */}
                    {!isDeployed && requiresFirstConfig && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-amber-50 text-amber-700 border border-amber-200">
                        <FileText className="w-3 h-3" />
                        Configure First
                      </span>
                    )}
                    
                    {!isDeployed && status?.hasPreviousConfig && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Quick Deploy Ready
                      </span>
                    )}
                  </div>
                  
                  {/* Show parameter count when deployed */}
                  {isDeployed && status?.deployment_info?.parameters && (
                    <div className="text-xs text-slate-500">
                      <span className="font-medium">
                        {Object.keys(status.deployment_info.parameters).length} parameter{Object.keys(status.deployment_info.parameters).length !== 1 ? 's' : ''} configured
                      </span>
                      {' • '}
                      <span className="text-violet-600 cursor-pointer hover:underline" onClick={() => handleDeployClick(policy)}>
                        View details
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <span className="text-xs font-medium text-slate-500">{policy.category}</span>
                <button
                  onClick={() => handleDeployClick(policy)}
                  disabled={!selectedClusterId}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    !selectedClusterId 
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : requiresFirstConfig
                      ? 'text-white bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-300'
                      : isDeployed
                      ? 'text-white bg-violet-600 hover:bg-violet-700'
                      : 'text-white bg-emerald-600 hover:bg-emerald-700'
                  }`}
                  title={
                    !selectedClusterId 
                      ? 'Select a cluster first' 
                      : requiresFirstConfig
                      ? 'Configure parameters and deploy'
                      : isDeployed
                      ? 'View and edit current configuration'
                      : 'Deploy with custom parameters'
                  }
                >
                  <Rocket className="w-4 h-4" />
                  {requiresFirstConfig ? 'Configure & Deploy' : isDeployed ? 'Edit Config' : 'Deploy'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Policy Editor Modal */}
      {selectedPolicy && (
        <PolicyEditorModal
          policy={selectedPolicy}
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setSelectedPolicy(null);
            setCurrentDeploymentParams({});
          }}
          onDeploySuccess={handleDeploySuccess}
          initialParameters={currentDeploymentParams}
        />
      )}
    </div>
  );
}
