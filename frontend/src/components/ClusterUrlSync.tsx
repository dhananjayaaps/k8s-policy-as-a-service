'use client';

/**
 * ClusterUrlSync
 *
 * Bridges the URL `?cluster=N` query param ↔ ClusterContext.
 * - On mount / URL change: reads ?cluster= and syncs to context (URL wins over localStorage).
 * - When context changes: reflects selectedClusterId back into the URL.
 *
 * Must be wrapped in <Suspense> by its parent because it uses useSearchParams().
 */

import { useEffect, useRef } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useCluster } from '../contexts/ClusterContext';

export default function ClusterUrlSync() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { selectedClusterId, setSelectedClusterId, clusters, loading } = useCluster();

  // Track whether the URL was the source of the last change to avoid loops
  const lastUrlCluster = useRef<string | null>(null);

  // URL → Context: when ?cluster= changes (or on first mount), sync to context
  useEffect(() => {
    if (loading || clusters.length === 0) return;

    const clusterParam = searchParams.get('cluster');
    if (!clusterParam) return;
    if (clusterParam === lastUrlCluster.current) return;

    const id = parseInt(clusterParam, 10);
    if (!isNaN(id) && clusters.some((c) => c.id === id) && id !== selectedClusterId) {
      lastUrlCluster.current = clusterParam;
      setSelectedClusterId(id);
    }
  }, [searchParams, clusters, loading]);

  // Context → URL: when selectedClusterId changes, write it into the URL
  useEffect(() => {
    if (!selectedClusterId || loading) return;

    const currentParams = new URLSearchParams(searchParams.toString());
    const currentCluster = currentParams.get('cluster');

    if (currentCluster === String(selectedClusterId)) return; // already in sync

    lastUrlCluster.current = String(selectedClusterId);
    currentParams.set('cluster', String(selectedClusterId));
    router.replace(`${pathname}?${currentParams.toString()}`, { scroll: false });
  }, [selectedClusterId, loading]);

  return null;
}
