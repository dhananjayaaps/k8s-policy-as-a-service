"""
Kubernetes Connector Service

Handles all interactions with Kubernetes clusters using the kubernetes-python-client.
"""

from kubernetes import client, config
from kubernetes.client.rest import ApiException
from typing import Optional, Dict, Any, List, Tuple
import os
import logging
import subprocess
import json
import tempfile
import urllib3

# Disable SSL warnings when verify_ssl=False
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)


class K8sConnector:
    """
    Kubernetes connector for managing cluster connections and operations.
    """
    
    def __init__(self):
        self._api_client: Optional[client.ApiClient] = None
        self._current_kubeconfig: Optional[str] = None
        self._current_context: Optional[str] = None
        self._temp_kubeconfig: Optional[str] = None
    
    def load_cluster_from_content(
        self, 
        kubeconfig_content: str, 
        context: Optional[str] = None
    ) -> client.ApiClient:
        """
        Load a Kubernetes cluster configuration from kubeconfig content.
        
        Args:
            kubeconfig_content: YAML content of the kubeconfig
            context: Optional Kubernetes context to use
            
        Returns:
            kubernetes.client.ApiClient instance
            
        Raises:
            ValueError: If kubeconfig content is invalid
            kubernetes.config.ConfigException: If config is invalid
        """
        if not kubeconfig_content or not kubeconfig_content.strip():
            raise ValueError("Kubeconfig content cannot be empty")
        
        # Clean up previous temp file if exists
        if self._temp_kubeconfig and os.path.exists(self._temp_kubeconfig):
            try:
                os.remove(self._temp_kubeconfig)
            except Exception as e:
                logger.warning(f"Failed to remove temp kubeconfig: {e}")
        
        # Create a temporary file to store kubeconfig content
        temp_fd, temp_path = tempfile.mkstemp(suffix=".yaml", prefix="kubeconfig_")
        try:
            # Write content to temp file
            with os.fdopen(temp_fd, 'w') as f:
                f.write(kubeconfig_content)
            
            # Load the kubeconfig from temp file
            config.load_kube_config(config_file=temp_path, context=context)
            
            # Set API timeout for faster responses
            configuration = client.Configuration.get_default_copy()
            configuration.timeout = 10  # 10 second timeout per API call
            
            self._api_client = client.ApiClient(configuration)
            self._current_kubeconfig = temp_path
            self._temp_kubeconfig = temp_path
            self._current_context = context
            
            return self._api_client
            
        except Exception as e:
            # Clean up temp file on error
            try:
                os.remove(temp_path)
            except:
                pass
            raise ValueError(f"Failed to load kubeconfig: {str(e)}")
    
    def load_cluster(
        self, 
        kubeconfig_path: str, 
        context: Optional[str] = None
    ) -> client.ApiClient:
        """
        Load a Kubernetes cluster configuration from a kubeconfig file.
        (Deprecated: Use load_cluster_from_content for better portability)
        
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
    
    def cleanup(self):
        """Clean up temporary files"""
        if self._temp_kubeconfig and os.path.exists(self._temp_kubeconfig):
            try:
                os.remove(self._temp_kubeconfig)
                self._temp_kubeconfig = None
            except Exception as e:
                logger.warning(f"Failed to clean up temp kubeconfig: {e}")
    
    def __del__(self):
        """Destructor to clean up temp files"""
        self.cleanup()
    
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
        
        if not self._api_client:
            raise RuntimeError("Not connected to any cluster. Call load_cluster first.")
        
        # Parse YAML
        manifests = list(yaml.safe_load_all(yaml_content))
        results = []
        
        for manifest in manifests:
            if manifest is None:
                continue
            
            try:
                kind = manifest.get("kind", "")
                api_version = manifest.get("apiVersion", "")
                metadata = manifest.get("metadata", {})
                name = metadata.get("name")
                
                # Check if this is a Kyverno policy (custom resource)
                if "kyverno.io" in api_version and kind in ["ClusterPolicy", "Policy"]:
                    custom_api = client.CustomObjectsApi(self._api_client)
                    
                    # Extract group and version from apiVersion
                    if "/" in api_version:
                        group, version = api_version.split("/")
                    else:
                        group = api_version
                        version = "v1"
                    
                    if kind == "ClusterPolicy":
                        # Create ClusterPolicy (cluster-scoped)
                        custom_api.create_cluster_custom_object(
                            group=group,
                            version=version,
                            plural="clusterpolicies",
                            body=manifest
                        )
                    else:
                        # Create Policy (namespace-scoped)
                        custom_api.create_namespaced_custom_object(
                            group=group,
                            version=version,
                            namespace=namespace,
                            plural="policies",
                            body=manifest
                        )
                    
                    results.append({
                        "kind": kind,
                        "name": name,
                        "status": "created",
                    })
                else:
                    # Use standard kubernetes utils for native resources
                    from kubernetes import utils
                    result = utils.create_from_dict(self._api_client, manifest, namespace=namespace)
                    results.append({
                        "kind": kind,
                        "name": name,
                        "status": "created",
                    })
                    
            except ApiException as e:
                # If resource already exists, try to update it
                if e.status == 409:  # Conflict - resource already exists
                    try:
                        if "kyverno.io" in api_version and kind in ["ClusterPolicy", "Policy"]:
                            custom_api = client.CustomObjectsApi(self._api_client)
                            
                            if "/" in api_version:
                                group, version = api_version.split("/")
                            else:
                                group = api_version
                                version = "v1"
                            
                            if kind == "ClusterPolicy":
                                custom_api.replace_cluster_custom_object(
                                    group=group,
                                    version=version,
                                    plural="clusterpolicies",
                                    name=name,
                                    body=manifest
                                )
                            else:
                                custom_api.replace_namespaced_custom_object(
                                    group=group,
                                    version=version,
                                    namespace=namespace,
                                    plural="policies",
                                    name=name,
                                    body=manifest
                                )
                            
                            results.append({
                                "kind": kind,
                                "name": name,
                                "status": "updated",
                            })
                        else:
                            results.append({
                                "kind": kind,
                                "name": name,
                                "status": "failed",
                                "error": "Resource already exists",
                            })
                    except Exception as update_error:
                        results.append({
                            "kind": kind,
                            "name": name,
                            "status": "failed",
                            "error": f"Update failed: {str(update_error)}",
                        })
                else:
                    results.append({
                        "kind": kind,
                        "name": name,
                        "status": "failed",
                        "error": str(e),
                    })
            except Exception as e:
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
    
    def check_helm_installed(self) -> bool:
        """
        Check if Helm is installed on the system.
        
        Returns:
            True if helm command is available
        """
        try:
            result = subprocess.run(
                ["helm", "version", "--short"],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False
    
    def install_kyverno_helm(
        self,
        namespace: str = "kyverno",
        release_name: str = "kyverno",
        create_namespace: bool = True,
        values: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Install Kyverno using Helm chart.
        
        Args:
            namespace: Kubernetes namespace for Kyverno
            release_name: Helm release name
            create_namespace: Whether to create namespace if it doesn't exist
            values: Custom values for Helm chart
            
        Returns:
            Dictionary with installation result
            
        Raises:
            RuntimeError: If not connected or Helm not available
            subprocess.CalledProcessError: If Helm command fails
        """
        if not self._api_client:
            raise RuntimeError("Not connected to any cluster. Call load_cluster first.")
        
        if not self.check_helm_installed():
            raise RuntimeError("Helm is not installed on this system. Please install Helm 3.x")
        
        # Check if already installed
        if self.check_helm_release_exists(release_name, namespace):
            raise RuntimeError(
                f"Kyverno is already installed as release '{release_name}' in namespace '{namespace}'"
            )
        
        # Add Kyverno Helm repository
        logger.info("Adding Kyverno Helm repository...")
        subprocess.run(
            ["helm", "repo", "add", "kyverno", "https://kyverno.github.io/kyverno/"],
            check=True,
            capture_output=True,
            text=True
        )
        
        # Update Helm repos
        subprocess.run(
            ["helm", "repo", "update"],
            check=True,
            capture_output=True,
            text=True
        )
        
        # Prepare install command
        install_cmd = [
            "helm", "install", release_name, "kyverno/kyverno",
            "--namespace", namespace,
            "--kubeconfig", self._current_kubeconfig
        ]
        
        if self._current_context:
            install_cmd.extend(["--kube-context", self._current_context])
        
        if create_namespace:
            install_cmd.append("--create-namespace")
        
        # Add custom values if provided
        if values:
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                import yaml
                yaml.dump(values, f)
                values_file = f.name
            install_cmd.extend(["-f", values_file])
        
        # Install Kyverno
        logger.info(f"Installing Kyverno in namespace '{namespace}'...")
        result = subprocess.run(
            install_cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )
        
        # Clean up temp values file
        if values:
            try:
                os.unlink(values_file)
            except:
                pass
        
        if result.returncode != 0:
            raise subprocess.CalledProcessError(
                result.returncode, 
                install_cmd, 
                output=result.stdout, 
                stderr=result.stderr
            )
        
        return {
            "success": True,
            "message": f"Kyverno installed successfully in namespace '{namespace}'",
            "release_name": release_name,
            "namespace": namespace,
            "output": result.stdout
        }
    
    def check_helm_release_exists(self, release_name: str, namespace: str) -> bool:
        """
        Check if a Helm release exists.
        
        Args:
            release_name: Name of the Helm release
            namespace: Namespace to check
            
        Returns:
            True if release exists
        """
        if not self._current_kubeconfig:
            return False
        
        try:
            cmd = [
                "helm", "list",
                "--namespace", namespace,
                "--filter", release_name,
                "--kubeconfig", self._current_kubeconfig,
                "--output", "json"
            ]
            
            if self._current_context:
                cmd.extend(["--kube-context", self._current_context])
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0 and result.stdout:
                releases = json.loads(result.stdout)
                return len(releases) > 0
            
            return False
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
            return False
    
    def get_helm_release_status(self, release_name: str, namespace: str) -> Optional[Dict[str, Any]]:
        """
        Get status of a Helm release.
        
        Args:
            release_name: Name of the Helm release
            namespace: Namespace of the release
            
        Returns:
            Dictionary with release status or None if not found
        """
        if not self._current_kubeconfig:
            raise RuntimeError("Not connected to any cluster")
        
        try:
            cmd = [
                "helm", "status", release_name,
                "--namespace", namespace,
                "--kubeconfig", self._current_kubeconfig,
                "--output", "json"
            ]
            
            if self._current_context:
                cmd.extend(["--kube-context", self._current_context])
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                return json.loads(result.stdout)
            
            return None
        except (subprocess.TimeoutExpired, json.JSONDecodeError, subprocess.CalledProcessError):
            return None
    
    def uninstall_kyverno_helm(self, release_name: str = "kyverno", namespace: str = "kyverno") -> Dict[str, Any]:
        """
        Uninstall Kyverno Helm release.
        
        Args:
            release_name: Name of the Helm release
            namespace: Namespace of the release
            
        Returns:
            Dictionary with uninstall result
        """
        if not self._current_kubeconfig:
            raise RuntimeError("Not connected to any cluster")
        
        if not self.check_helm_release_exists(release_name, namespace):
            return {
                "success": False,
                "message": f"Helm release '{release_name}' not found in namespace '{namespace}'"
            }
        
        cmd = [
            "helm", "uninstall", release_name,
            "--namespace", namespace,
            "--kubeconfig", self._current_kubeconfig
        ]
        
        if self._current_context:
            cmd.extend(["--kube-context", self._current_context])
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode != 0:
            raise subprocess.CalledProcessError(
                result.returncode,
                cmd,
                output=result.stdout,
                stderr=result.stderr
            )
        
        return {
            "success": True,
            "message": f"Kyverno uninstalled successfully from namespace '{namespace}'",
            "output": result.stdout
        }
    
    def check_kyverno_comprehensive(self) -> Dict[str, Any]:
        """
        Comprehensive check for Kyverno installation with multiple methods.
        
        Returns:
            Dictionary with detailed Kyverno status
        """
        if not self._api_client:
            raise RuntimeError("Not connected to any cluster")
        
        result = {
            "installed": False,
            "version": None,
            "namespace": None,
            "deployment_status": {},
            "helm_release": None,
            "api_resources_available": False,
            "webhooks_configured": False,
        }
        
        # Method 1: Check via Helm
        helm_status = self.get_helm_release_status("kyverno", "kyverno")
        if helm_status:
            result["helm_release"] = {
                "name": helm_status.get("name"),
                "namespace": helm_status.get("namespace"),
                "status": helm_status.get("info", {}).get("status"),
                "version": helm_status.get("chart"),
            }
            result["installed"] = True
            result["namespace"] = "kyverno"
        
        # Method 2: Check deployments (check only kyverno namespace first)
        apps_v1 = client.AppsV1Api(self._api_client)
        v1 = client.CoreV1Api(self._api_client)
        
        # Start with most common namespace
        namespaces_to_check = ["kyverno"] if not result["installed"] else [result["namespace"]]
        if not result["installed"]:
            namespaces_to_check.append("kyverno-system")
        
        for ns in namespaces_to_check:
            try:
                deployments = apps_v1.list_namespaced_deployment(namespace=ns, limit=10)
                for dep in deployments.items:
                    if "kyverno" in dep.metadata.name:
                        result["installed"] = True
                        result["namespace"] = ns
                        
                        # Extract version from image
                        for container in dep.spec.template.spec.containers:
                            if "kyverno" in container.image:
                                image_parts = container.image.split(":")
                                if len(image_parts) > 1:
                                    result["version"] = image_parts[1]
                        
                        # Get deployment status
                        result["deployment_status"][dep.metadata.name] = {
                            "ready_replicas": dep.status.ready_replicas or 0,
                            "replicas": dep.status.replicas or 0,
                            "available": dep.status.available_replicas or 0,
                        }
                        break  # Found Kyverno, no need to check more deployments
                if result["installed"]:
                    break  # Found in this namespace, skip other namespaces
            except ApiException as e:
                if e.status != 404:
                    logger.warning(f"Error checking namespace {ns}: {e}")
        
        # Method 3: Check for Kyverno API resources (CRDs)
        try:
            custom_api = client.CustomObjectsApi(self._api_client)
            # Try to list ClusterPolicies (this will work if CRDs are installed)
            custom_api.list_cluster_custom_object(
                group="kyverno.io",
                version="v1",
                plural="clusterpolicies",
                limit=1
            )
            result["api_resources_available"] = True
        except ApiException as e:
            if e.status != 404:
                logger.warning(f"Error checking Kyverno CRDs: {e}")
        
        # Method 4: Check for webhooks (only if Kyverno is installed)
        if result["installed"]:
            try:
                admissionreg_v1 = client.AdmissionregistrationV1Api(self._api_client)
                
                # Check validating webhooks (limit results)
                validating_webhooks = admissionreg_v1.list_validating_webhook_configuration(limit=20)
                for webhook in validating_webhooks.items:
                    if "kyverno" in webhook.metadata.name.lower():
                        result["webhooks_configured"] = True
                        break
                
                # Check mutating webhooks if not found yet
                if not result["webhooks_configured"]:
                    mutating_webhooks = admissionreg_v1.list_mutating_webhook_configuration(limit=20)
                    for webhook in mutating_webhooks.items:
                        if "kyverno" in webhook.metadata.name.lower():
                            result["webhooks_configured"] = True
                            break
            except ApiException as e:
                logger.warning(f"Error checking webhooks: {e}")
        
        return result
    
    def disconnect(self):
        """Disconnect from the current cluster"""
        if self._api_client:
            self._api_client.close()
        self._api_client = None
        self._current_kubeconfig = None
        self._current_context = None


# Session-based K8s connection management
import uuid
from datetime import datetime, timedelta
from typing import Tuple

# Store K8s connectors by session ID with timestamp
_k8s_sessions: Dict[str, Tuple[K8sConnector, datetime]] = {}

# Session timeout in minutes
K8S_SESSION_TIMEOUT_MINUTES = 60


def create_k8s_session() -> Tuple[str, K8sConnector]:
    """
    Create a new K8s session.
    
    Returns:
        Tuple of (session_id, K8sConnector instance)
    """
    session_id = str(uuid.uuid4())
    connector = K8sConnector()
    _k8s_sessions[session_id] = (connector, datetime.now())
    logger.info(f"Created K8s session: {session_id}")
    return session_id, connector


def get_k8s_session(session_id: str) -> K8sConnector:
    """
    Get K8s connector for a specific session.
    
    Args:
        session_id: The session identifier
        
    Returns:
        K8sConnector instance for the session
        
    Raises:
        ValueError: If session not found or expired
    """
    if session_id not in _k8s_sessions:
        raise ValueError(f"K8s session not found: {session_id}")
    
    connector, created_at = _k8s_sessions[session_id]
    
    # Check if session has expired
    if datetime.now() - created_at > timedelta(minutes=K8S_SESSION_TIMEOUT_MINUTES):
        # Clean up expired session
        connector.disconnect()
        del _k8s_sessions[session_id]
        raise ValueError(f"K8s session expired: {session_id}")
    
    # Update last access time
    _k8s_sessions[session_id] = (connector, datetime.now())
    
    return connector


def close_k8s_session(session_id: str) -> bool:
    """
    Close and remove a K8s session.
    
    Args:
        session_id: The session identifier
        
    Returns:
        True if session was closed, False if not found
    """
    if session_id not in _k8s_sessions:
        return False
    
    connector, _ = _k8s_sessions[session_id]
    connector.disconnect()
    del _k8s_sessions[session_id]
    logger.info(f"Closed K8s session: {session_id}")
    return True


def cleanup_expired_k8s_sessions():
    """Remove all expired K8s sessions."""
    expired_sessions = []
    
    for session_id, (connector, created_at) in _k8s_sessions.items():
        if datetime.now() - created_at > timedelta(minutes=K8S_SESSION_TIMEOUT_MINUTES):
            expired_sessions.append(session_id)
    
    for session_id in expired_sessions:
        connector, _ = _k8s_sessions[session_id]
        connector.disconnect()
        del _k8s_sessions[session_id]
        logger.info(f"Cleaned up expired K8s session: {session_id}")
    
    return len(expired_sessions)


def list_active_k8s_sessions() -> Dict[str, Dict[str, Any]]:
    """
    List all active K8s sessions.
    
    Returns:
        Dictionary mapping session_id to session info
    """
    return {
        session_id: {
            "context": connector._current_context,
            "has_client": connector._api_client is not None,
            "created_at": created_at.isoformat(),
            "age_minutes": (datetime.now() - created_at).total_seconds() / 60
        }
        for session_id, (connector, created_at) in _k8s_sessions.items()
    }


# Legacy support - deprecated
_connector_instance: Optional[K8sConnector] = None


def get_k8s_connector() -> K8sConnector:
    """
    Get or create the K8s connector singleton.
    
    DEPRECATED: Use create_k8s_session() and get_k8s_session() instead
    for multi-user support.
    """
    global _connector_instance
    if _connector_instance is None:
        _connector_instance = K8sConnector()
    return _connector_instance

