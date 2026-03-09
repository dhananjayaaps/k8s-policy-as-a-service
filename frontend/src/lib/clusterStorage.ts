// Cluster storage utility for persisting selected cluster across sessions

const SELECTED_CLUSTER_KEY = 'kyvarno_selected_cluster_id';

/**
 * Save the selected cluster ID to localStorage
 */
export function saveSelectedCluster(clusterId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SELECTED_CLUSTER_KEY, clusterId);
  }
}

/**
 * Get the selected cluster ID from localStorage
 */
export function getSelectedCluster(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(SELECTED_CLUSTER_KEY);
  }
  return null;
}

/**
 * Clear the selected cluster from localStorage
 */
export function clearSelectedCluster(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SELECTED_CLUSTER_KEY);
  }
}
