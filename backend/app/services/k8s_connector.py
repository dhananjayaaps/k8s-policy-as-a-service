"""
Kubernetes Connector Service

Handles all interactions with Kubernetes clusters using the kubernetes-python-client.
"""

from kubernetes import client, config
from kubernetes.client.rest import ApiException
from typing import Optional, Dict, Any, List, Tuple
import os
import logging

logger = logging.getLogger(__name__)


class K8sConnector:
    """
    Kubernetes connector for managing cluster connections and operations.
    """
    
    def __init__(self):
        self._api_client: Optional[client.ApiClient] = None
        self._current_kubeconfig: Optional[str] = None
        self._current_context: Optional[str] = None
    
    def load_cluster(
        self, 
        kubeconfig_path: str, 
        context: Optional[str] = None
    ) -> client.ApiClient:
        """
        Load a Kubernetes cluster configuration from a kubeconfig file.
        
        Args:
            kubeconfig_path: Path to the kubeconfig file
            context: Optional Kubernetes context to use
            
        Returns:
            kubernetes.client.ApiClient instance
            
        Raises:
            FileNotFoundError: If kubeconfig file doesn't exist
            kubernetes.config.ConfigException: If config is invalid
        """
        # Validate kubeconfig path
        if not os.path.exists(kubeconfig_path):
            raise FileNotFoundError(f"Kubeconfig file not found: {kubeconfig_path}")
        
        # Load the kubeconfig
        config.load_kube_config(config_file=kubeconfig_path, context=context)
        
        self._api_client = client.ApiClient()
        self._current_kubeconfig = kubeconfig_path
        self._current_context = context
        
        return self._api_client
    
    def get_api_client(self) -> Optional[client.ApiClient]:
        """Get the current API client"""
        return self._api_client
    
    def list_namespaces(self) -> List[str]:
        """
        List all namespaces in the connected cluster.
        
        Returns:
            List of namespace names
            
        Raises:
            RuntimeError: If not connected to a cluster
            kubernetes.client.rest.ApiException: If API call fails
        """
        if not self._api_client:
            raise RuntimeError("Not connected to any cluster. Call load_cluster first.")
        
        v1 = client.CoreV1Api(self._api_client)
        namespaces = v1.list_namespace()
        
        return [ns.metadata.name for ns in namespaces.items]
    
    def get_cluster_info(self) -> Dict[str, Any]:
        """
        Get information about the connected cluster.
        
        Returns:
            Dictionary containing cluster information
        """
        if not self._api_client:
            raise RuntimeError("Not connected to any cluster. Call load_cluster first.")
        
        v1 = client.CoreV1Api(self._api_client)
        version_api = client.VersionApi(self._api_client)
        
        # Get cluster version
        version_info = version_api.get_code()
        
        # Get node count
        nodes = v1.list_node()
        
        return {
            "kubernetes_version": version_info.git_version,
            "platform": version_info.platform,
            "node_count": len(nodes.items),
            "nodes": [
                {
                    "name": node.metadata.name,
                    "status": self._get_node_status(node),
                }
                for node in nodes.items
            ],
            "kubeconfig": self._current_kubeconfig,
            "context": self._current_context,
        }
    
    def _get_node_status(self, node) -> str:
        """Extract node status from conditions"""
        for condition in node.status.conditions:
            if condition.type == "Ready":
                return "Ready" if condition.status == "True" else "NotReady"
        return "Unknown"
    
    def check_kyverno_installed(self) -> Tuple[bool, Optional[str]]:
        """
        Check if Kyverno is installed in the cluster.
        
        Returns:
            Tuple of (is_installed, version)
        """
        if not self._api_client:
            raise RuntimeError("Not connected to any cluster. Call load_cluster first.")
        
        apps_v1 = client.AppsV1Api(self._api_client)
        
        try:
            # Check for Kyverno deployment in kyverno namespace
            deployments = apps_v1.list_namespaced_deployment(namespace="kyverno")
            
            for dep in deployments.items:
                if "kyverno" in dep.metadata.name:
                    # Try to extract version from image tag
                    containers = dep.spec.template.spec.containers
                    for container in containers:
                        if "kyverno" in container.image:
                            image_parts = container.image.split(":")
                            version = image_parts[1] if len(image_parts) > 1 else "unknown"
                            return True, version
                    return True, "unknown"
            
            return False, None
            
        except ApiException as e:
            if e.status == 404:
                return False, None
            raise
    
    def apply_yaml(self, yaml_content: str, namespace: str = "default") -> Dict[str, Any]:
        """
        Apply a YAML manifest to the cluster.
        
        Args:
            yaml_content: YAML content as string
            namespace: Target namespace
            
        Returns:
            Dictionary with result information
        """
        import yaml
        from kubernetes import utils
        
        if not self._api_client:
            raise RuntimeError("Not connected to any cluster. Call load_cluster first.")
        
        # Parse YAML
        manifests = list(yaml.safe_load_all(yaml_content))
        results = []
        
        for manifest in manifests:
            if manifest is None:
                continue
            
            try:
                # Use kubernetes utils to create from dict
                result = utils.create_from_dict(self._api_client, manifest, namespace=namespace)
                results.append({
                    "kind": manifest.get("kind"),
                    "name": manifest.get("metadata", {}).get("name"),
                    "status": "created",
                })
            except ApiException as e:
                results.append({
                    "kind": manifest.get("kind"),
                    "name": manifest.get("metadata", {}).get("name"),
                    "status": "failed",
                    "error": str(e),
                })
        
        return {"results": results}
    
    def delete_policy(self, name: str, namespace: str = "default") -> bool:
        """
        Delete a Kyverno policy from the cluster.
        
        Args:
            name: Policy name
            namespace: Policy namespace (for namespaced policies)
            
        Returns:
            True if deleted successfully
        """
        if not self._api_client:
            raise RuntimeError("Not connected to any cluster. Call load_cluster first.")
        
        custom_api = client.CustomObjectsApi(self._api_client)
        
        try:
            # Try ClusterPolicy first
            custom_api.delete_cluster_custom_object(
                group="kyverno.io",
                version="v1",
                plural="clusterpolicies",
                name=name,
            )
            return True
        except ApiException as e:
            if e.status == 404:
                # Try namespaced Policy
                try:
                    custom_api.delete_namespaced_custom_object(
                        group="kyverno.io",
                        version="v1",
                        plural="policies",
                        namespace=namespace,
                        name=name,
                    )
                    return True
                except ApiException:
                    return False
            raise
    
    def list_kyverno_policies(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        List all Kyverno policies in the cluster.
        
        Returns:
            Dictionary with cluster_policies and namespaced_policies
        """
        if not self._api_client:
            raise RuntimeError("Not connected to any cluster. Call load_cluster first.")
        
        custom_api = client.CustomObjectsApi(self._api_client)
        result = {
            "cluster_policies": [],
            "namespaced_policies": [],
        }
        
        try:
            # Get ClusterPolicies
            cluster_policies = custom_api.list_cluster_custom_object(
                group="kyverno.io",
                version="v1",
                plural="clusterpolicies",
            )
            result["cluster_policies"] = [
                {
                    "name": p["metadata"]["name"],
                    "background": p.get("spec", {}).get("background", True),
                    "validation_failure_action": p.get("spec", {}).get("validationFailureAction", "Audit"),
                }
                for p in cluster_policies.get("items", [])
            ]
        except ApiException as e:
            if e.status != 404:
                logger.warning(f"Failed to list ClusterPolicies: {e}")
        
        try:
            # Get namespaced Policies from all namespaces
            policies = custom_api.list_cluster_custom_object(
                group="kyverno.io",
                version="v1",
                plural="policies",
            )
            result["namespaced_policies"] = [
                {
                    "name": p["metadata"]["name"],
                    "namespace": p["metadata"]["namespace"],
                    "background": p.get("spec", {}).get("background", True),
                    "validation_failure_action": p.get("spec", {}).get("validationFailureAction", "Audit"),
                }
                for p in policies.get("items", [])
            ]
        except ApiException as e:
            if e.status != 404:
                logger.warning(f"Failed to list Policies: {e}")
        
        return result
    
    def disconnect(self):
        """Disconnect from the current cluster"""
        if self._api_client:
            self._api_client.close()
        self._api_client = None
        self._current_kubeconfig = None
        self._current_context = None


# Singleton instance for the connector
_connector_instance: Optional[K8sConnector] = None


def get_k8s_connector() -> K8sConnector:
    """Get or create the K8s connector singleton"""
    global _connector_instance
    if _connector_instance is None:
        _connector_instance = K8sConnector()
    return _connector_instance
