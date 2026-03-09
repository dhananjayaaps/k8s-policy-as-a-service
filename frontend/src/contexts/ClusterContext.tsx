'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getClusters } from '../lib/api';
import { saveSelectedCluster, getSelectedCluster } from '../lib/clusterStorage';
import type { Cluster } from '../types';

type ClusterContextType = {
  clusters: Cluster[];
  selectedClusterId: string | null;
  setSelectedClusterId: (clusterId: string) => void;
  loading: boolean;
  refreshClusters: () => Promise<void>;
};

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedClusterId, setSelectedClusterIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClusters();
  }, []);

  async function loadClusters() {
    setLoading(true);
    const response = await getClusters();

    if (response.data && response.data.length > 0) {
      setClusters(response.data);
      
      // Try to load previously selected cluster from localStorage
      const savedClusterId = getSelectedCluster();
      
      // Check if saved cluster still exists
      const savedClusterExists = savedClusterId 
        ? response.data.some(c => c.id === savedClusterId)
        : false;
      
      // Use saved cluster if it exists, otherwise use first cluster
      const initialClusterId = savedClusterExists 
        ? savedClusterId! 
        : response.data[0].id;
      
      setSelectedClusterIdState(initialClusterId);
      saveSelectedCluster(initialClusterId);
    } else {
      setClusters([]);
      setSelectedClusterIdState(null);
    }
    setLoading(false);
  }

  const setSelectedClusterId = (clusterId: string) => {
    setSelectedClusterIdState(clusterId);
    saveSelectedCluster(clusterId);
  };

  const refreshClusters = async () => {
    await loadClusters();
  };

  return (
    <ClusterContext.Provider
      value={{
        clusters,
        selectedClusterId,
        setSelectedClusterId,
        loading,
        refreshClusters,
      }}
    >
      {children}
    </ClusterContext.Provider>
  );
}

export function useCluster() {
  const context = useContext(ClusterContext);
  if (context === undefined) {
    throw new Error('useCluster must be used within a ClusterProvider');
  }
  return context;
}
