'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { getClusters, getClusterHealth } from '../lib/api';
import type { ClusterHealth } from '../lib/api';
import { saveSelectedCluster, getSelectedCluster } from '../lib/clusterStorage';
import { useAuth } from './AuthContext';
import type { Cluster } from '../types';

// How often to re-probe cluster health (ms)
const HEALTH_POLL_INTERVAL = 30_000;

export type ClusterHealthMap = Record<number, ClusterHealth & { checkedAt: number }>;

type ClusterContextType = {
  clusters: Cluster[];
  selectedClusterId: number | null;
  setSelectedClusterId: (clusterId: number) => void;
  loading: boolean;
  refreshClusters: () => Promise<void>;
  /** Live reachability keyed by cluster id */
  clusterHealth: ClusterHealthMap;
  /** Manually re-probe a single cluster */
  recheckHealth: (clusterId: number) => Promise<void>;
};

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedClusterId, setSelectedClusterIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [clusterHealth, setClusterHealth] = useState<ClusterHealthMap>({});
  const { isAuthenticated, loading: authLoading } = useAuth();
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clustersRef = useRef<Cluster[]>([]);

  // Keep ref in sync so the poll callback always sees latest clusters
  clustersRef.current = clusters;

  const probeAll = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    const results = await Promise.allSettled(
      ids.map((id) => getClusterHealth(id).then((r) => ({ id, data: r.data })))
    );
    setClusterHealth((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.data) {
          next[r.value.id] = { ...r.value.data, checkedAt: Date.now() };
        }
      }
      return next;
    });
  }, []);

  const recheckHealth = useCallback(async (clusterId: number) => {
    const r = await getClusterHealth(clusterId);
    if (r.data) {
      setClusterHealth((prev) => ({
        ...prev,
        [clusterId]: { ...r.data!, checkedAt: Date.now() },
      }));
    }
  }, []);

  // Schedule recurring health polls
  useEffect(() => {
    if (!isAuthenticated || clusters.length === 0) return;

    const ids = clusters.map((c) => c.id);
    // Immediate first probe
    probeAll(ids);

    const scheduleNext = () => {
      pollTimerRef.current = setTimeout(async () => {
        await probeAll(clustersRef.current.map((c) => c.id));
        scheduleNext();
      }, HEALTH_POLL_INTERVAL);
    };
    scheduleNext();

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [isAuthenticated, clusters.length, probeAll]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (isAuthenticated) {
      loadClusters();
    } else {
      setClusters([]);
      setSelectedClusterIdState(null);
      setClusterHealth({});
      setLoading(false);
    }
  }, [isAuthenticated, authLoading]);

  async function loadClusters() {
    setLoading(true);
    const response = await getClusters();

    if (response.data && response.data.length > 0) {
      setClusters(response.data);
      
      const savedClusterId = getSelectedCluster();
      const savedId = savedClusterId ? parseInt(savedClusterId, 10) : null;
      const savedClusterExists = savedId 
        ? response.data.some(c => c.id === savedId)
        : false;
      const initialClusterId = savedClusterExists 
        ? savedId! 
        : response.data[0].id;
      
      setSelectedClusterIdState(initialClusterId);
      saveSelectedCluster(initialClusterId.toString());
    } else {
      setClusters([]);
      setSelectedClusterIdState(null);
    }
    setLoading(false);
  }

  const setSelectedClusterId = (clusterId: number) => {
    setSelectedClusterIdState(clusterId);
    saveSelectedCluster(clusterId.toString());
    // Immediately recheck health for newly selected cluster
    recheckHealth(clusterId);
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
        clusterHealth,
        recheckHealth,
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
