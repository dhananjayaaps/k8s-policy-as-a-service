"""
Clusters Router

API endpoints for managing Kubernetes cluster connections.
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
import subprocess
import yaml
import re
from datetime import datetime, timedelta

from app.db import get_db
from app.models import Cluster, AuditLog, ServiceAccountToken
from app.schemas import (
    ClusterCreate,
    ClusterUpdate,
    ClusterResponse,
    ClusterConnectRequest,
    ClusterConnectResponse,
    NamespaceListResponse,
    KyvernoInstallRequest,
    KyvernoInstallResponse,
    KyvernoStatusResponse,
    KyvernoUninstallRequest,
    KyvernoUninstallResponse,
    SSHConnectRequest,
    SSHConnectResponse,
    SSHCommandRequest,
    SSHCommandResponse,
    SSHKubeconfigRequest,
    SSHKubeconfigResponse,
    RemoteKyvernoInstallRequest,
    MinikubeStatusResponse,
    ServiceAccountCreate,
    ServiceAccountResponse,
    TokenConnectRequest,
    ClusterSetupRequest,
    ClusterSetupResponse,
    KyvernoInstallViaTokenRequest,
)
from app.services.k8s_connector import (
    get_k8s_connector,
    K8sConnector,
    create_k8s_session,
    get_k8s_session,
    close_k8s_session,
    cleanup_expired_k8s_sessions,
    list_active_k8s_sessions
)
from app.services.ssh_connector import (
    create_ssh_session,
    get_ssh_session,
    close_ssh_session,
    cleanup_expired_sessions,
    list_active_sessions
)

router = APIRouter(prefix="/clusters", tags=["clusters"])


# ============ Helper Functions ============

def is_internal_ip(url: str) -> bool:
    """
    Check if a URL contains an internal/private IP address.
    
    Internal IP ranges:
    - 192.168.0.0/16 (Class C private)
    - 10.0.0.0/8 (Class A private)
    - 172.16.0.0/12 (Class B private)
    - 127.0.0.0/8 (Loopback)
    """
    import ipaddress
    from urllib.parse import urlparse
    
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        
        if not hostname:
            return False
        
        # Try to parse as IP address
        ip = ipaddress.ip_address(hostname)
        
        # Check if it's a private or loopback IP
        return ip.is_private or ip.is_loopback
        
    except (ValueError, AttributeError):
        # Not a valid IP address (might be a domain name)
        return False


def replace_internal_ip_with_public(
    internal_url: str,
    public_ip: str,
    public_port: Optional[int] = None
) -> str:
    """
    Replace internal IP in a URL with a public IP.
    
    Args:
        internal_url: Original URL (e.g., https://192.168.49.2:8443)
        public_ip: Public IP or hostname to use
        public_port: Optional port override (uses original port if not specified)
        
    Returns:
        URL with public IP (e.g., https://203.0.113.42:8443)
    """
    from urllib.parse import urlparse, urlunparse
    
    parsed = urlparse(internal_url)
    
    # Determine port
    if public_port:
        port = public_port
    elif parsed.port:
        port = parsed.port
    else:
        # Use default ports
        port = 443 if parsed.scheme == 'https' else 80
    
    # Build new netloc
    netloc = f"{public_ip}:{port}" if port else public_ip
    
    # Reconstruct URL
    return urlunparse((
        parsed.scheme,
        netloc,
        parsed.path,
        parsed.params,
        parsed.query,
        parsed.fragment
    ))


# ============ Cluster Connection Endpoints ============

@router.post("/connect", response_model=ClusterConnectResponse)
async def connect_cluster(request: ClusterConnectRequest):
    """
    Connect to a Kubernetes cluster and verify connectivity.
    
    This endpoint:
    1. Loads the kubeconfig from the provided content (YAML)
    2. Connects to the cluster
    3. Lists namespaces to verify connectivity
    4. Returns cluster info and namespace list
    
    Example kubeconfig_content:
    ```yaml
    apiVersion: v1
    kind: Config
    clusters:
    - cluster:
        server: https://kubernetes.default.svc
        certificate-authority-data: ...
      name: my-cluster
    contexts:
    - context:
        cluster: my-cluster
        user: my-user
      name: my-context
    current-context: my-context
    users:
    - name: my-user
      user:
        token: ...
    ```
    """
    connector = get_k8s_connector()
    
    try:
        # Load cluster configuration from content
        connector.load_cluster_from_content(
            kubeconfig_content=request.kubeconfig_content,
            context=request.context
        )
        
        # Get cluster info
        cluster_info = connector.get_cluster_info()
        
        # List namespaces to verify connectivity
        namespaces = connector.list_namespaces()
        
        return ClusterConnectResponse(
            success=True,
            message=f"Successfully connected to cluster. Found {len(namespaces)} namespaces.",
            cluster_info=cluster_info,
            namespaces=namespaces
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid kubeconfig content: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect to cluster: {str(e)}"
        )

@router.post("/disconnect")
async def disconnect_cluster():
    """
    Disconnect from the currently connected cluster.
    
    DEPRECATED: This endpoint is deprecated and will be removed.
    With session-based architecture, sessions automatically expire.
    Use session-specific disconnect endpoints instead.
    """
    connector = get_k8s_connector()
    connector.disconnect()
    return {
        "message": "Disconnected from cluster",
        "warning": "This endpoint is deprecated. Use session-based connections instead."
    }


# ============ CRUD Operations for stored clusters ============

@router.post("/", response_model=ClusterResponse)
async def create_cluster(cluster: ClusterCreate, db: Session = Depends(get_db)):
    """
    Save a cluster configuration to the database.
    """
    # Check if cluster with same name exists
    existing = db.query(Cluster).filter(Cluster.name == cluster.name).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Cluster with name '{cluster.name}' already exists"
        )
    
    db_cluster = Cluster(**cluster.model_dump())
    db.add(db_cluster)
    db.commit()
    db.refresh(db_cluster)
    
    # Add audit log
    audit = AuditLog(
        action="cluster_create",
        resource_type="cluster",
        resource_id=db_cluster.id,
        details={"name": cluster.name},
        status="success"
    )
    db.add(audit)
    db.commit()
    
    return db_cluster


@router.get("/", response_model=List[ClusterResponse])
async def list_clusters(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    List all saved cluster configurations.
    """
    clusters = db.query(Cluster).offset(skip).limit(limit).all()
    return clusters


@router.get("/{cluster_id}/namespaces", response_model=NamespaceListResponse)
async def list_namespaces(cluster_id: int, db: Session = Depends(get_db)):
    """
    List all namespaces in a specific cluster.
    
    This endpoint:
    1. Retrieves cluster from database
    2. Creates temporary K8s session with cluster credentials
    3. Lists all namespaces
    4. Closes session
    """
    # Get cluster from database
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get an active service account token for this cluster
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == cluster_id,
        ServiceAccountToken.is_active == True
    ).first()
    
    if not sa_token or not cluster.server_url:
        raise HTTPException(
            status_code=400,
            detail="Cluster missing credentials. Please run cluster setup first."
        )
    
    # Create temporary K8s session
    session_id, k8s_connector = create_k8s_session()
    
    try:
        # Create kubeconfig with token
        # Note: When insecure-skip-tls-verify is true, don't include CA cert (Helm requirement)
        cluster_config = {
            "server": cluster.server_url,
            "insecure-skip-tls-verify": not cluster.verify_ssl
        }
        if cluster.verify_ssl and cluster.ca_cert_data:
            cluster_config["certificate-authority-data"] = cluster.ca_cert_data
        
        kubeconfig = {
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [{
                "name": "cluster",
                "cluster": cluster_config
            }],
            "users": [{
                "name": "user",
                "user": {
                    "token": sa_token.token
                }
            }],
            "contexts": [{
                "name": "context",
                "context": {
                    "cluster": "cluster",
                    "user": "user"
                }
            }],
            "current-context": "context"
        }
        
        kubeconfig_content = yaml.dump(kubeconfig)
        k8s_connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
        
        namespaces = k8s_connector.list_namespaces()
        return NamespaceListResponse(
            namespaces=namespaces,
            count=len(namespaces)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list namespaces: {str(e)}"
        )
    finally:
        close_k8s_session(session_id)


@router.get("/{cluster_id}/info")
async def get_cluster_info(cluster_id: int, db: Session = Depends(get_db)):
    """
    Get information about a specific cluster.
    """
    # Get cluster from database
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get an active service account token
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == cluster_id,
        ServiceAccountToken.is_active == True
    ).first()
    
    if not sa_token or not cluster.server_url:
        raise HTTPException(
            status_code=400,
            detail="Cluster missing credentials. Please run cluster setup first."
        )
    
    # Create temporary K8s session
    session_id, k8s_connector = create_k8s_session()
    
    try:
        cluster_config = {
            "server": cluster.server_url,
            "insecure-skip-tls-verify": not cluster.verify_ssl
        }
        if cluster.verify_ssl and cluster.ca_cert_data:
            cluster_config["certificate-authority-data"] = cluster.ca_cert_data
        
        kubeconfig = {
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [{
                "name": "cluster",
                "cluster": cluster_config
            }],
            "users": [{
                "name": "user",
                "user": {
                    "token": sa_token.token
                }
            }],
            "contexts": [{
                "name": "context",
                "context": {
                    "cluster": "cluster",
                    "user": "user"
                }
            }],
            "current-context": "context"
        }
        
        kubeconfig_content = yaml.dump(kubeconfig)
        k8s_connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
        
        info = k8s_connector.get_cluster_info()
        return info
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get cluster info: {str(e)}"
        )
    finally:
        close_k8s_session(session_id)


@router.get("/{cluster_id}/kyverno-status")
async def check_kyverno_status(cluster_id: int, db: Session = Depends(get_db)):
    """
    Check if Kyverno is installed in a specific cluster.
    (Legacy endpoint - use /{cluster_id}/kyverno/status for comprehensive check)
    """
    # Get cluster from database
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get an active service account token
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == cluster_id,
        ServiceAccountToken.is_active == True
    ).first()
    
    if not sa_token or not cluster.server_url:
        raise HTTPException(
            status_code=400,
            detail="Cluster missing credentials. Please run cluster setup first."
        )
    
    # Create temporary K8s session
    session_id, k8s_connector = create_k8s_session()
    
    try:
        cluster_config = {
            "server": cluster.server_url,
            "insecure-skip-tls-verify": not cluster.verify_ssl
        }
        if cluster.verify_ssl and cluster.ca_cert_data:
            cluster_config["certificate-authority-data"] = cluster.ca_cert_data
        
        kubeconfig = {
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [{
                "name": "cluster",
                "cluster": cluster_config
            }],
            "users": [{
                "name": "user",
                "user": {
                    "token": sa_token.token
                }
            }],
            "contexts": [{
                "name": "context",
                "context": {
                    "cluster": "cluster",
                    "user": "user"
                }
            }],
            "current-context": "context"
        }
        
        kubeconfig_content = yaml.dump(kubeconfig)
        k8s_connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
        
        is_installed, version = k8s_connector.check_kyverno_installed()
        return {
            "installed": is_installed,
            "version": version,
            "message": f"Kyverno {'is installed' if is_installed else 'is not installed'}"
                       + (f" (version {version})" if version else "")
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check Kyverno status: {str(e)}"
        )
    finally:
        close_k8s_session(session_id)


@router.get("/{cluster_id}/kyverno/status", response_model=KyvernoStatusResponse)
async def get_kyverno_comprehensive_status(cluster_id: int, db: Session = Depends(get_db)):
    """
    Get comprehensive Kyverno installation status for a specific cluster.
    
    This endpoint checks:
    - Helm release status
    - Deployment status
    - API resources (CRDs)
    - Webhook configuration
    """
    # Get cluster from database
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get an active service account token
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == cluster_id,
        ServiceAccountToken.is_active == True
    ).first()
    
    if not sa_token or not cluster.server_url:
        raise HTTPException(
            status_code=400,
            detail="Cluster missing credentials. Please run cluster setup first."
        )
    
    # Create temporary K8s session
    session_id, k8s_connector = create_k8s_session()
    
    try:
        cluster_config = {
            "server": cluster.server_url,
            "insecure-skip-tls-verify": not cluster.verify_ssl
        }
        if cluster.verify_ssl and cluster.ca_cert_data:
            cluster_config["certificate-authority-data"] = cluster.ca_cert_data
        
        kubeconfig = {
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [{
                "name": "cluster",
                "cluster": cluster_config
            }],
            "users": [{
                "name": "user",
                "user": {
                    "token": sa_token.token
                }
            }],
            "contexts": [{
                "name": "context",
                "context": {
                    "cluster": "cluster",
                    "user": "user"
                }
            }],
            "current-context": "context"
        }
        
        kubeconfig_content = yaml.dump(kubeconfig)
        k8s_connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
        
        status = k8s_connector.check_kyverno_comprehensive()
        return status
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check Kyverno status: {str(e)}"
        )
    finally:
        close_k8s_session(session_id)


@router.post("/{cluster_id}/install-kyverno", response_model=KyvernoInstallResponse)
async def install_kyverno_with_token(
    cluster_id: int,
    request: KyvernoInstallViaTokenRequest,
    db: Session = Depends(get_db)
):
    """
    Install Kyverno on a cluster using a saved service account token.
    
    This method uses the service account token from the database to connect
    to the cluster and install Kyverno via Helm (without SSH).
    
    Benefits:
    - No SSH access needed
    - Can be done remotely from anywhere
    - Uses stored credentials
    - Independent per cluster
    
    Prerequisites:
    - Cluster must be saved in database with valid service account token
    - Token must have sufficient permissions (cluster-admin recommended)
    - Helm must be accessible from the API server
    """
    # Get cluster from database
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get service account token
    if request.service_account_id:
        sa_token = db.query(ServiceAccountToken).filter(
            ServiceAccountToken.id == request.service_account_id,
            ServiceAccountToken.cluster_id == cluster_id,
            ServiceAccountToken.is_active == True
        ).first()
    else:
        # Use first active token for the cluster
        sa_token = db.query(ServiceAccountToken).filter(
            ServiceAccountToken.cluster_id == cluster_id,
            ServiceAccountToken.is_active == True
        ).first()
    
    if not sa_token:
        raise HTTPException(
            status_code=404,
            detail="No active service account token found for this cluster"
        )
    
    # Check if cluster has required connection info
    if not cluster.server_url or not sa_token.token:
        raise HTTPException(
            status_code=400,
            detail="Cluster missing server URL or token"
        )
    
    try:
        # Create a K8s session
        session_id, k8s_connector = create_k8s_session()
        
        try:
            # Create kubeconfig with token
            # Note: When insecure-skip-tls-verify is true, don't include CA cert (Helm requirement)
            cluster_config = {
                "server": cluster.server_url,
                "insecure-skip-tls-verify": not cluster.verify_ssl
            }
            
            # Only include CA cert when SSL verification is enabled
            if cluster.verify_ssl and cluster.ca_cert_data:
                cluster_config["certificate-authority-data"] = cluster.ca_cert_data
            
            kubeconfig = {
                "apiVersion": "v1",
                "kind": "Config",
                "clusters": [{
                    "name": "cluster",
                    "cluster": cluster_config
                }],
                "users": [{
                    "name": "user",
                    "user": {
                        "token": sa_token.token
                    }
                }],
                "contexts": [{
                    "name": "context",
                    "context": {
                        "cluster": "cluster",
                        "user": "user"
                    }
                }],
                "current-context": "context"
            }
            
            kubeconfig_content = yaml.dump(kubeconfig)
            
            # Connect to cluster
            k8s_connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
            
            # Install Kyverno via Helm
            result = k8s_connector.install_kyverno_helm(
                namespace=request.namespace,
                release_name=request.release_name,
                create_namespace=request.create_namespace
            )
            
            # Add audit log
            audit = AuditLog(
                action="kyverno_install_via_token",
                resource_type="cluster",
                resource_id=cluster_id,
                details={
                    "cluster_name": cluster.name,
                    "namespace": request.namespace,
                    "release_name": request.release_name,
                    "service_account_id": sa_token.id
                },
                status="success"
            )
            db.add(audit)
            db.commit()
            
            return KyvernoInstallResponse(**result)
                
        finally:
            # Close K8s session
            close_k8s_session(session_id)
            
    except HTTPException:
        raise
    except RuntimeError as e:
        # Add audit log for failure
        audit = AuditLog(
            action="kyverno_install_via_token",
            resource_type="cluster",
            resource_id=cluster_id,
            details={
                "cluster_name": cluster.name,
                "error": str(e)
            },
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except subprocess.CalledProcessError as e:
        # Add audit log for failure
        audit = AuditLog(
            action="kyverno_install_via_token",
            resource_type="cluster",
            resource_id=cluster_id,
            details={
                "cluster_name": cluster.name,
                "error": f"{e.stderr or e.stdout}"
            },
            status="failure",
            error_message=f"{e.stderr or e.stdout}"
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Helm installation failed: {e.stderr or e.stdout}"
        )
    except Exception as e:
        # Add audit log for failure
        audit = AuditLog(
            action="kyverno_install_via_token",
            resource_type="cluster",
            resource_id=cluster_id,
            details={
                "cluster_name": cluster.name,
                "error": str(e)
            },
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to install Kyverno: {str(e)}"
        )


@router.post("/{cluster_id}/kyverno/install", response_model=KyvernoInstallResponse)
async def install_kyverno(
    cluster_id: int,
    request: KyvernoInstallRequest,
    db: Session = Depends(get_db)
):
    """
    Install Kyverno using Helm chart on a specific cluster.
    
    This endpoint:
    1. Retrieves cluster credentials from database
    2. Creates temporary K8s session
    3. Checks if Helm is installed
    4. Adds Kyverno Helm repository
    5. Installs Kyverno with specified configuration
    6. Logs the installation to audit log
    
    Requirements:
    - Cluster must be set up in database with valid credentials
    - Helm 3.x must be installed on the system
    """
    # Get cluster from database
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get an active service account token
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == cluster_id,
        ServiceAccountToken.is_active == True
    ).first()
    
    if not sa_token or not cluster.server_url:
        raise HTTPException(
            status_code=400,
            detail="Cluster missing credentials. Please run cluster setup first."
        )
    
    # Create temporary K8s session
    session_id, connector = create_k8s_session()
    
    try:
        # Create kubeconfig with token
        cluster_config = {
            "server": cluster.server_url,
            "insecure-skip-tls-verify": not cluster.verify_ssl
        }
        if cluster.verify_ssl and cluster.ca_cert_data:
            cluster_config["certificate-authority-data"] = cluster.ca_cert_data
        
        kubeconfig = {
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [{
                "name": "cluster",
                "cluster": cluster_config
            }],
            "users": [{
                "name": "user",
                "user": {
                    "token": sa_token.token
                }
            }],
            "contexts": [{
                "name": "context",
                "context": {
                    "cluster": "cluster",
                    "user": "user"
                }
            }],
            "current-context": "context"
        }
        
        kubeconfig_content = yaml.dump(kubeconfig)
        connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
        
        # Check if Helm is available
        if not connector.check_helm_installed():
            raise HTTPException(
                status_code=400,
                detail="Helm is not installed on this system. Please install Helm 3.x first."
            )
        
        # Install Kyverno
        result = connector.install_kyverno_helm(
            namespace=request.namespace,
            release_name=request.release_name,
            create_namespace=request.create_namespace,
            values=request.values
        )
        
        # Add audit log
        audit = AuditLog(
            action="kyverno_install",
            resource_type="helm_release",
            resource_id=cluster_id,
            details={
                "cluster_id": cluster_id,
                "release_name": request.release_name,
                "namespace": request.namespace
            },
            status="success"
        )
        db.add(audit)
        db.commit()
        
        return KyvernoInstallResponse(**result)
        
    except RuntimeError as e:
        # Add audit log for failure
        audit = AuditLog(
            action="kyverno_install",
            resource_type="helm_release",
            resource_id=cluster_id,
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except subprocess.CalledProcessError as e:
        # Add audit log for failure
        audit = AuditLog(
            action="kyverno_install",
            resource_type="helm_release",
            resource_id=cluster_id,
            status="failure",
            error_message=f"{e.stderr or e.stdout}"
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Helm installation failed: {e.stderr or e.stdout}"
        )
    except Exception as e:
        # Add audit log for failure
        audit = AuditLog(
            action="kyverno_install",
            resource_type="helm_release",
            resource_id=cluster_id,
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to install Kyverno: {str(e)}"
        )
    finally:
        close_k8s_session(session_id)


@router.post("/{cluster_id}/kyverno/uninstall", response_model=KyvernoUninstallResponse)
async def uninstall_kyverno(
    cluster_id: int,
    request: KyvernoUninstallRequest,
    db: Session = Depends(get_db)
):
    """
    Uninstall Kyverno Helm release from a specific cluster.
    
    This removes:
    - Kyverno deployments
    - Services and ConfigMaps
    - Note: CRDs and existing policies may remain
    """
    # Get cluster from database
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get an active service account token
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == cluster_id,
        ServiceAccountToken.is_active == True
    ).first()
    
    if not sa_token or not cluster.server_url:
        raise HTTPException(
            status_code=400,
            detail="Cluster missing credentials. Please run cluster setup first."
        )
    
    # Create temporary K8s session
    session_id, connector = create_k8s_session()
    
    try:
        # Create kubeconfig with token
        cluster_config = {
            "server": cluster.server_url,
            "insecure-skip-tls-verify": not cluster.verify_ssl
        }
        if cluster.verify_ssl and cluster.ca_cert_data:
            cluster_config["certificate-authority-data"] = cluster.ca_cert_data
        
        kubeconfig = {
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [{
                "name": "cluster",
                "cluster": cluster_config
            }],
            "users": [{
                "name": "user",
                "user": {
                    "token": sa_token.token
                }
            }],
            "contexts": [{
                "name": "context",
                "context": {
                    "cluster": "cluster",
                    "user": "user"
                }
            }],
            "current-context": "context"
        }
        
        kubeconfig_content = yaml.dump(kubeconfig)
        connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
        
        result = connector.uninstall_kyverno_helm(
            release_name=request.release_name,
            namespace=request.namespace
        )
        
        # Add audit log
        audit = AuditLog(
            action="kyverno_uninstall",
            resource_type="helm_release",
            resource_id=cluster_id,
            details={
                "cluster_id": cluster_id,
                "release_name": request.release_name,
                "namespace": request.namespace
            },
            status="success" if result["success"] else "failure"
        )
        db.add(audit)
        db.commit()
        
        return KyvernoUninstallResponse(**result)
        
    except subprocess.CalledProcessError as e:
        audit = AuditLog(
            action="kyverno_uninstall",
            resource_type="helm_release",
            resource_id=cluster_id,
            status="failure",
            error_message=f"{e.stderr or e.stdout}"
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Helm uninstall failed: {e.stderr or e.stdout}"
        )
    except Exception as e:
        audit = AuditLog(
            action="kyverno_uninstall",
            resource_type="helm_release",
            resource_id=cluster_id,
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to uninstall Kyverno: {str(e)}"
        )
    finally:
        close_k8s_session(session_id)
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to uninstall Kyverno: {str(e)}"
        )


@router.get("/{cluster_id}", response_model=ClusterResponse)
async def get_cluster(cluster_id: int, db: Session = Depends(get_db)):
    """
    Get a specific cluster configuration by ID.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return cluster


@router.put("/{cluster_id}", response_model=ClusterResponse)
async def update_cluster(
    cluster_id: int,
    cluster_update: ClusterUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a cluster configuration.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    update_data = cluster_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cluster, key, value)
    
    db.commit()
    db.refresh(cluster)
    return cluster


@router.delete("/{cluster_id}")
async def delete_cluster(cluster_id: int, db: Session = Depends(get_db)):
    """
    Delete a cluster configuration.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Add audit log before deletion
    audit = AuditLog(
        action="cluster_delete",
        resource_type="cluster",
        resource_id=cluster_id,
        details={"name": cluster.name},
        status="success"
    )
    db.add(audit)
    
    db.delete(cluster)
    db.commit()
    
    return {"message": f"Cluster '{cluster.name}' deleted"}


# ============ SSH Remote Cluster Operations ============

@router.post("/ssh/connect", response_model=SSHConnectResponse)
async def ssh_connect(request: SSHConnectRequest, db: Session = Depends(get_db)):
    """
    Connect to a remote server via SSH.
    
    This creates a new SSH session and returns a session_id that must be used
    for subsequent operations. Each user/connection gets its own isolated session.
    
    Provide either:
    - `pem_key_content`: Private key content (recommended)
    - `password`: SSH password
    
    Returns a session_id that must be included in subsequent SSH requests.
    """
    # Clean up any expired sessions first
    cleanup_expired_sessions()
    
    # Create a new SSH session
    session_id, ssh = create_ssh_session()
    
    try:
        ssh.connect(
            host=request.host,
            username=request.username,
            pem_key_content=request.pem_key_content,
            password=request.password,
            port=request.port
        )
        
        # Add audit log
        audit = AuditLog(
            action="ssh_connect",
            resource_type="ssh_server",
            details={
                "host": request.host,
                "username": request.username,
                "port": request.port,
                "session_id": session_id
            },
            status="success"
        )
        db.add(audit)
        db.commit()
        
        return SSHConnectResponse(
            success=True,
            message=f"Successfully connected to {request.username}@{request.host}",
            session_id=session_id,
            host=request.host
        )
        
    except Exception as e:
        # Clean up failed session
        close_ssh_session(session_id)
        
        # Add audit log for failure
        audit = AuditLog(
            action="ssh_connect",
            resource_type="ssh_server",
            details={
                "host": request.host,
                "username": request.username
            },
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect via SSH: {str(e)}"
        )


@router.post("/ssh/execute", response_model=SSHCommandResponse)
async def ssh_execute_command(request: SSHCommandRequest):
    """
    Execute a command on a remote server using an SSH session.
    
    Requires a valid session_id from /ssh/connect.
    """
    try:
        ssh = get_ssh_session(request.session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    
    if not ssh.is_connected():
        raise HTTPException(
            status_code=400,
            detail="SSH connection is no longer active. Please reconnect."
        )
    
    try:
        stdout, stderr, exit_code = ssh.execute_command(
            command=request.command,
            timeout=request.timeout
        )
        
        return SSHCommandResponse(
            success=exit_code == 0,
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to execute command: {str(e)}"
        )


@router.post("/ssh/kubeconfig", response_model=SSHKubeconfigResponse)
async def ssh_get_kubeconfig(request: SSHKubeconfigRequest):
    """
    Get kubeconfig from remote server using an SSH session.
    
    If `portable=True`, returns kubeconfig with embedded certificates
    that can be used from any machine.
    
    Requires a valid session_id from /ssh/connect.
    """
    try:
        ssh = get_ssh_session(request.session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    
    if not ssh.is_connected():
        raise HTTPException(
            status_code=400,
            detail="SSH connection is no longer active. Please reconnect."
        )
    
    try:
        if request.portable:
            kubeconfig_content = ssh.get_portable_kubeconfig(context=request.context)
        else:
            kubeconfig_content = ssh.get_kubeconfig_content(kubeconfig_path=request.kubeconfig_path)
        
        return SSHKubeconfigResponse(
            success=True,
            kubeconfig_content=kubeconfig_content,
            message="Successfully retrieved kubeconfig from remote server"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get kubeconfig: {str(e)}"
        )


@router.get("/ssh/minikube-status", response_model=MinikubeStatusResponse)
async def ssh_check_minikube(session_id: str):
    """
    Check Minikube status on remote server using an SSH session.
    
    Requires a valid session_id from /ssh/connect (passed as query parameter).
    """
    try:
        ssh = get_ssh_session(session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    
    if not ssh.is_connected():
        raise HTTPException(
            status_code=400,
            detail="SSH connection is no longer active. Please reconnect."
        )
    
    try:
        status = ssh.check_minikube_status()
        return MinikubeStatusResponse(**status)
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check Minikube status: {str(e)}"
        )


@router.post("/ssh/kyverno/install", response_model=KyvernoInstallResponse)
async def ssh_install_kyverno(
    request: RemoteKyvernoInstallRequest,
    db: Session = Depends(get_db)
):
    """
    Install Kyverno on remote server via Helm using an SSH session.
    
    This executes Helm commands on the remote server.
    Requires a valid session_id from /ssh/connect.
    """
    try:
        ssh = get_ssh_session(request.session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    
    if not ssh.is_connected():
        raise HTTPException(
            status_code=400,
            detail="SSH connection is no longer active. Please reconnect."
        )
    
    try:
        stdout, stderr, exit_code = ssh.install_kyverno_remote(
            namespace=request.namespace,
            release_name=request.release_name,
            create_namespace=request.create_namespace
        )
        
        success = exit_code == 0
        
        # Add audit log
        audit = AuditLog(
            action="remote_kyverno_install",
            resource_type="helm_release",
            details={
                "host": ssh.get_connected_host(),
                "namespace": request.namespace,
                "release_name": request.release_name,
                "session_id": request.session_id
            },
            status="success" if success else "failure",
            error_message=stderr if not success else None
        )
        db.add(audit)
        db.commit()
        
        if success:
            return KyvernoInstallResponse(
                success=True,
                message=f"Kyverno installed successfully on remote server",
                release_name=request.release_name,
                namespace=request.namespace,
                output=stdout
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Helm installation failed: {stderr}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        # Add audit log for failure
        audit = AuditLog(
            action="remote_kyverno_install",
            resource_type="helm_release",
            details={
                "host": ssh.get_connected_host(),
                "namespace": request.namespace,
                "session_id": request.session_id
            },
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to install Kyverno: {str(e)}"
        )


@router.post("/ssh/disconnect")
async def ssh_disconnect(session_id: str):
    """
    Disconnect from an SSH session.
    
    Requires session_id as a query parameter.
    """
    if close_ssh_session(session_id):
        return {"success": True, "message": f"Disconnected session {session_id}"}
    else:
        return {"success": False, "message": f"Session {session_id} not found"}


@router.get("/ssh/status")
async def ssh_connection_status(session_id: str):
    """
    Check SSH connection status for a specific session.
    
    Requires session_id as a query parameter.
    """
    try:
        ssh = get_ssh_session(session_id)
        return {
            "connected": ssh.is_connected(),
            "host": ssh.get_connected_host(),
            "session_id": session_id
        }
    except ValueError:
        return {
            "connected": False,
            "host": None,
            "session_id": session_id,
            "error": "Session not found or expired"
        }


@router.get("/ssh/sessions")
async def list_ssh_sessions():
    """
    List all active SSH sessions.
    
    This is useful for debugging and monitoring.
    """
    # Clean up expired sessions first
    cleanup_expired_sessions()
    
    sessions = list_active_sessions()
    return {
        "sessions": sessions,
        "count": len(sessions)
    }


# ============ Complete Cluster Setup Workflow ============

@router.get("/ssh/k8s-api-info")
async def get_kubernetes_api_info(session_id: str):
    """
    Get Kubernetes API server information from remote server.
    
    This helps you set up port forwarding by showing:
    - Internal Kubernetes API URL (e.g., https://192.168.49.2:8443)
    - Required port forwarding configuration
    - Alternative access methods
    
    Use this to understand what needs to be forwarded before running /clusters/setup.
    """
    try:
        ssh = get_ssh_session(session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    
    if not ssh.is_connected():
        raise HTTPException(
            status_code=400,
            detail="SSH connection is no longer active. Please reconnect."
        )
    
    try:
        # Get cluster info
        stdout, stderr, exit_code = ssh.execute_command(
            "kubectl cluster-info | grep 'Kubernetes control plane' | awk '{print $NF}'",
            timeout=10
        )
        
        if exit_code != 0:
            return {
                "success": False,
                "error": "Cannot get cluster info. Ensure kubectl is configured and cluster is running.",
                "details": stderr
            }
        
        internal_api_url = stdout.strip()
        host = ssh.get_connected_host()
        
        # Parse the URL to get components
        from urllib.parse import urlparse
        parsed = urlparse(internal_api_url)
        internal_host = parsed.hostname
        internal_port = parsed.port or 8443
        
        is_private = is_internal_ip(internal_api_url)
        
        # Generate port forwarding instructions
        port_forward_instructions = []
        
        if is_private:
            port_forward_instructions = [
                {
                    "method": "kubectl proxy",
                    "description": "Easiest method - creates a local proxy to the API server",
                    "command": f"kubectl proxy --address=0.0.0.0 --port={internal_port} --accept-hosts='.*'",
                    "access_url": f"https://{host}:{internal_port}",
                    "notes": "Run this command on the remote server. API will be accessible at your server's public IP."
                },
                {
                    "method": "SSH tunnel (from client)",
                    "description": "Secure tunnel from your local machine to the cluster",
                    "command": f"ssh -L {internal_port}:{internal_host}:{internal_port} user@{host}",
                    "access_url": f"https://localhost:{internal_port}",
                    "notes": "Run this on your local machine. Replace 'user' with your SSH username."
                },
                {
                    "method": "iptables NAT",
                    "description": "Permanent port forwarding rule on the server",
                    "command": f"sudo iptables -t nat -A PREROUTING -p tcp --dport {internal_port} -j DNAT --to-destination {internal_host}:{internal_port}",
                    "access_url": f"https://{host}:{internal_port}",
                    "notes": "Requires root access. Make persistent with iptables-save."
                },
                {
                    "method": "socat",
                    "description": "Simple port forwarding tool",
                    "command": f"socat TCP-LISTEN:{internal_port},fork,reuseaddr TCP:{internal_host}:{internal_port}",
                    "access_url": f"https://{host}:{internal_port}",
                    "notes": "Install socat first: sudo apt-get install socat"
                }
            ]
        
        return {
            "success": True,
            "internal_api_url": internal_api_url,
            "internal_host": internal_host,
            "internal_port": internal_port,
            "ssh_host": host,
            "is_internal_ip": is_private,
            "requires_port_forwarding": is_private,
            "public_api_url_suggestion": f"https://{host}:{internal_port}" if is_private else internal_api_url,
            "port_forwarding_instructions": port_forward_instructions if is_private else [],
            "recommendation": (
                f"The Kubernetes API is on an internal network ({internal_api_url}). "
                f"You must set up port forwarding to access it remotely. "
                f"Choose one of the methods above and configure it on your server."
            ) if is_private else (
                f"The Kubernetes API is accessible at {internal_api_url}. "
                f"No port forwarding needed - you can use this URL directly."
            )
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to get API info: {str(e)}"
        }


@router.get("/ssh/kubectl-check")
async def check_kubectl_connectivity(session_id: str):
    """
    Check if kubectl can connect to the Kubernetes cluster on remote server.
    
    This endpoint verifies:
    - kubectl is installed
    - kubectl can reach the API server
    - Cluster is responsive
    
    Use this before running /clusters/setup to diagnose connectivity issues.
    """
    try:
        ssh = get_ssh_session(session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    
    if not ssh.is_connected():
        raise HTTPException(
            status_code=400,
            detail="SSH connection is no longer active. Please reconnect."
        )
    
    try:
        # Check kubectl version
        stdout, stderr, exit_code = ssh.execute_command("kubectl version --client --short 2>/dev/null || kubectl version --client", timeout=10)
        if exit_code != 0:
            return {
                "success": False,
                "error": "kubectl_not_found",
                "message": "kubectl is not installed on the remote server",
                "suggestion": "Install kubectl on the remote server first"
            }
        
        kubectl_version = stdout.strip()
        
        # Check cluster connectivity
        stdout, stderr, exit_code = ssh.execute_command("kubectl cluster-info 2>&1", timeout=15)
        
        if exit_code != 0:
            # Try to diagnose the issue
            error_lower = stderr.lower() + stdout.lower()
            
            suggestions = []
            if "refused" in error_lower or "no route to host" in error_lower:
                suggestions.append("Start your Kubernetes cluster (e.g., minikube start)")
                suggestions.append("Verify the cluster is running: kubectl get nodes")
            if "minikube" in error_lower:
                suggestions.append("Check Minikube status: minikube status")
                suggestions.append("Start Minikube if stopped: minikube start")
            if "context" in error_lower:
                suggestions.append("Set the correct kubectl context: kubectl config use-context <context-name>")
            if not suggestions:
                suggestions.append("Check kubectl configuration: kubectl config view")
                suggestions.append("Verify the API server is accessible")
            
            return {
                "success": False,
                "error": "cluster_unreachable",
                "message": "kubectl cannot connect to the Kubernetes cluster",
                "kubectl_version": kubectl_version,
                "error_details": (stderr + stdout).strip(),
                "suggestions": suggestions
            }
        
        # Get current context
        stdout_ctx, _, _ = ssh.execute_command("kubectl config current-context 2>&1", timeout=5)
        current_context = stdout_ctx.strip()
        
        return {
            "success": True,
            "message": "kubectl can successfully connect to the cluster",
            "kubectl_version": kubectl_version,
            "current_context": current_context,
            "cluster_info": stdout.strip()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": "check_failed",
            "message": f"Failed to check kubectl connectivity: {str(e)}"
        }


@router.post("/setup", response_model=ClusterSetupResponse)
async def setup_cluster_complete(
    request: ClusterSetupRequest,
    db: Session = Depends(get_db)
):
    """
    Complete cluster setup workflow:
    1. Use existing SSH session
    2. Verify kubectl connectivity to cluster
    3. Create service account with token on remote cluster
    4. Save cluster to database with host IP
    5. Save service account token to database
    6. Optionally install Kyverno using the token
    
    This is the recommended way to set up a new cluster for independent multi-user access.
    
    Prerequisites:
    - Active SSH session (from POST /clusters/ssh/connect)
    - Kubernetes cluster running and accessible via kubectl
    - kubectl configured on remote server
    
    Returns:
    - Cluster ID, service account details, and token for future use
    
    Troubleshooting:
    - If setup fails, use GET /clusters/ssh/kubectl-check?session_id=<id> to diagnose
    - Ensure Minikube/K8s cluster is running: minikube status
    - Verify kubectl works: kubectl get nodes
    """
    # Get SSH session
    try:
        ssh = get_ssh_session(request.session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"SSH session error: {str(e)}"
        )
    
    if not ssh.is_connected():
        raise HTTPException(
            status_code=400,
            detail="SSH connection is no longer active. Please reconnect."
        )
    
    host = ssh.get_connected_host()
    
    try:
        # Step 0: Pre-check kubectl connectivity
        stdout, stderr, exit_code = ssh.execute_command("kubectl cluster-info 2>&1", timeout=15)
        
        if exit_code != 0:
            error_output = (stderr + stdout).strip()
            
            # Provide specific error messages based on the error
            if "refused" in error_output.lower() or "no route to host" in error_output.lower():
                raise HTTPException(
                    status_code=400,
                    detail="Kubernetes cluster is not accessible. Please ensure the cluster is running (e.g., 'minikube start') and kubectl can connect. Use GET /clusters/ssh/kubectl-check to diagnose."
                )
            elif "minikube" in error_output.lower():
                raise HTTPException(
                    status_code=400,
                    detail="Minikube is not running. Start it with 'minikube start' on the remote server. Use GET /clusters/ssh/kubectl-check to diagnose."
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"kubectl cannot connect to Kubernetes cluster: {error_output[:200]}. Use GET /clusters/ssh/kubectl-check to diagnose."
                )
        
        # Step 1: Create service account and get token on remote cluster
        sa_info = ssh.create_service_account_with_token(
            name=request.service_account_name,
            namespace=request.namespace,
            role_type=request.role_type,
            duration="87600h"  # 10 years
        )
        
        # Step 1.5: Replace internal IP with public IP if necessary
        original_server_url = sa_info['server_url']
        final_server_url = original_server_url
        
        if is_internal_ip(original_server_url):
            # Minikube or internal cluster detected
            if request.public_api_url:
                # User provided explicit public URL
                final_server_url = request.public_api_url
            else:
                # Use SSH host IP with the same port as internal API
                final_server_url = replace_internal_ip_with_public(
                    original_server_url,
                    host,
                    request.api_port
                )
            
            # Log the replacement for user awareness
            from logging import getLogger
            logger = getLogger(__name__)
            logger.info(
                f"Replaced internal API URL {original_server_url} with "
                f"public URL {final_server_url}. Ensure port forwarding is configured."
            )
        
        # Step 2: Check if cluster already exists by name
        existing_cluster = db.query(Cluster).filter(Cluster.name == request.cluster_name).first()
        if existing_cluster:
            raise HTTPException(
                status_code=400,
                detail=f"Cluster with name '{request.cluster_name}' already exists"
            )
        
        # Step 3: Create cluster record in database with public URL
        cluster = Cluster(
            name=request.cluster_name,
            host=host,
            server_url=final_server_url,  # Use public URL, not internal
            ca_cert_data=sa_info['ca_cert_data'],
            verify_ssl=request.verify_ssl,
            description=request.cluster_description,
            is_active=True
        )
        
        db.add(cluster)
        db.commit()
        db.refresh(cluster)
        
        # Step 4: Create service account token record
        sa_token = ServiceAccountToken(
            cluster_id=cluster.id,
            name=request.service_account_name,
            namespace=request.namespace,
            token=sa_info['token'],
            role_type=request.role_type,
            description=f"Auto-generated admin token for {request.cluster_name}",
            expires_at=None,  # Long-lived token
            is_active=True
        )
        
        db.add(sa_token)
        db.commit()
        db.refresh(sa_token)
        
        # Step 5: Add audit log
        audit = AuditLog(
            action="cluster_setup_complete",
            resource_type="cluster",
            resource_id=cluster.id,
            details={
                "cluster_name": request.cluster_name,
                "host": host,
                "service_account": request.service_account_name,
                "namespace": request.namespace
            },
            status="success"
        )
        db.add(audit)
        db.commit()
        
        # Step 6: Optionally install Kyverno
        kyverno_installed = False
        kyverno_message = None
        
        if request.install_kyverno:
            try:
                stdout, stderr, exit_code = ssh.install_kyverno_remote(
                    namespace=request.kyverno_namespace,
                    release_name="kyverno",
                    create_namespace=True
                )
                
                if exit_code == 0:
                    kyverno_installed = True
                    kyverno_message = "Kyverno installed successfully"
                    
                    # Update audit log
                    audit = AuditLog(
                        action="kyverno_install",
                        resource_type="cluster",
                        resource_id=cluster.id,
                        details={
                            "namespace": request.kyverno_namespace,
                            "method": "ssh_helm"
                        },
                        status="success"
                    )
                    db.add(audit)
                    db.commit()
                else:
                    kyverno_message = f"Kyverno installation failed: {stderr}"
                    
            except Exception as e:
                kyverno_message = f"Error installing Kyverno: {str(e)}"
        
        # Build success message with port forwarding instructions if needed
        success_msg = f"Cluster '{request.cluster_name}' set up successfully"
        if is_internal_ip(original_server_url):
            from urllib.parse import urlparse
            parsed = urlparse(final_server_url)
            port = parsed.port or 443
            
            success_msg += (
                f"\n\n⚠️  IMPORTANT: Port Forwarding Required!\n"
                f"The Kubernetes API is on an internal network ({original_server_url}).\n"
                f"To connect from external clients, configure port forwarding:\n\n"
                f"  1. Forward {host}:{port} → Kubernetes API ({original_server_url})\n"
                f"  2. Options:\n"
                f"     - iptables: sudo iptables -t nat -A PREROUTING -p tcp --dport {port} -j DNAT --to-destination {urlparse(original_server_url).hostname}:{urlparse(original_server_url).port or 8443}\n"
                f"     - kubectl proxy: kubectl proxy --address=0.0.0.0 --port={port} --accept-hosts='.*'\n"
                f"     - SSH tunnel: ssh -L {port}:{urlparse(original_server_url).hostname}:{urlparse(original_server_url).port or 8443} {host}\n"
                f"  3. Or set public_api_url in request if you have a different setup\n"
            )
        
        return ClusterSetupResponse(
            success=True,
            message=success_msg,
            cluster_id=cluster.id,
            cluster_name=cluster.name,
            host=host,
            server_url=final_server_url,  # Return the public URL, not internal
            service_account_id=sa_token.id,
            service_account_name=request.service_account_name,
            token=sa_info['token'],
            kyverno_installed=kyverno_installed,
            kyverno_message=kyverno_message
        )
        
    except HTTPException:
        raise
    except Exception as e:
        # Rollback on error
        db.rollback()
        
        # Add audit log for failure
        audit = AuditLog(
            action="cluster_setup_complete",
            resource_type="cluster",
            details={
                "cluster_name": request.cluster_name,
                "error": str(e)
            },
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Cluster setup failed: {str(e)}"
        )


@router.get("/{cluster_id}/serviceaccounts", response_model=List[ServiceAccountResponse])
async def list_service_accounts(
    cluster_id: int,
    db: Session = Depends(get_db)
):
    """
    List all service account tokens for a cluster.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    tokens = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == cluster_id,
        ServiceAccountToken.is_active == True
    ).all()
    
    return tokens


@router.post("/connect-with-token", response_model=ClusterConnectResponse)
async def connect_with_token(request: TokenConnectRequest):
    """
    Connect to a cluster using a service account token.
    
    This is more secure than using full kubeconfig as the token
    can have limited RBAC permissions.
    """
    connector = get_k8s_connector()
    
    try:
        # Create temporary kubeconfig with token
        import tempfile
        import yaml
        
        kubeconfig = {
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [{
                "name": "cluster",
                "cluster": {
                    "server": request.server_url,
                    "certificate-authority-data": request.ca_cert_data,
                    "insecure-skip-tls-verify": not request.verify_ssl
                }
            }],
            "users": [{
                "name": "user",
                "user": {
                    "token": request.token
                }
            }],
            "contexts": [{
                "name": "context",
                "context": {
                    "cluster": "cluster",
                    "user": "user"
                }
            }],
            "current-context": "context"
        }
        
        kubeconfig_content = yaml.dump(kubeconfig)
        
        # Connect using the token-based kubeconfig
        connector.load_cluster_from_content(
            kubeconfig_content=kubeconfig_content
        )
        
        # Get cluster info
        cluster_info = connector.get_cluster_info()
        
        # List namespaces to verify connectivity
        namespaces = connector.list_namespaces()
        
        return ClusterConnectResponse(
            success=True,
            message=f"Successfully connected using service account token. Found {len(namespaces)} namespaces.",
            cluster_info=cluster_info,
            namespaces=namespaces
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect with token: {str(e)}"
        )


@router.delete("/{cluster_id}/serviceaccount/{sa_id}")
async def delete_service_account_token(
    cluster_id: int,
    sa_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a service account token from database.
    
    Note: This doesn't delete the service account from Kubernetes,
    only removes the token from our database.
    """
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.id == sa_id,
        ServiceAccountToken.cluster_id == cluster_id
    ).first()
    
    if not sa_token:
        raise HTTPException(status_code=404, detail="Service account token not found")
    
    # Soft delete - mark as inactive
    sa_token.is_active = False
    db.commit()
    
    # Add audit log
    audit = AuditLog(
        action="serviceaccount_delete",
        resource_type="service_account",
        resource_id=sa_id,
        details={
            "cluster_id": cluster_id,
            "name": sa_token.name
        },
        status="success"
    )
    db.add(audit)
    db.commit()
    
    return {"message": f"Service account token '{sa_token.name}' deleted"}


@router.post("/{cluster_id}/connect", response_model=ClusterConnectResponse)
async def connect_saved_cluster(cluster_id: int, db: Session = Depends(get_db)):
    """
    Connect to a saved cluster configuration.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    connector = get_k8s_connector()
    
    try:
        connector.load_cluster_from_content(
            kubeconfig_content=cluster.kubeconfig_content,
            context=cluster.context
        )
        
        cluster_info = connector.get_cluster_info()
        namespaces = connector.list_namespaces()
        
        # Add audit log
        audit = AuditLog(
            action="cluster_connect",
            resource_type="cluster",
            resource_id=cluster_id,
            details={"namespaces_count": len(namespaces)},
            status="success"
        )
        db.add(audit)
        db.commit()
        
        return ClusterConnectResponse(
            success=True,
            message=f"Connected to cluster '{cluster.name}'",
            cluster_info=cluster_info,
            namespaces=namespaces
        )
        
    except Exception as e:
        # Add audit log for failure
        audit = AuditLog(
            action="cluster_connect",
            resource_type="cluster",
            resource_id=cluster_id,
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect to cluster: {str(e)}"
        )
    

@router.post("/{cluster_id}/serviceaccount/{sa_id}/connect", response_model=ClusterConnectResponse)
async def connect_with_saved_token(
    cluster_id: int,
    sa_id: int,
    db: Session = Depends(get_db)
):
    """
    Connect to a cluster using a saved service account token.
    """
    # Get service account token
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.id == sa_id,
        ServiceAccountToken.cluster_id == cluster_id,
        ServiceAccountToken.is_active == True
    ).first()
    
    if not sa_token:
        raise HTTPException(status_code=404, detail="Service account token not found")
    
    # Get cluster
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Check if token is expired
    if sa_token.expires_at and sa_token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="Token has expired. Create a new token."
        )
    
    try:
        # Connect using the token
        connector = get_k8s_connector()
        
        import yaml
        cluster_config = {
            "server": cluster.server_url,
            "insecure-skip-tls-verify": not cluster.verify_ssl
        }
        if cluster.verify_ssl and cluster.ca_cert_data:
            cluster_config["certificate-authority-data"] = cluster.ca_cert_data
        
        kubeconfig = {
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [{
                "name": "cluster",
                "cluster": cluster_config
            }],
            "users": [{
                "name": "user",
                "user": {
                    "token": sa_token.token
                }
            }],
            "contexts": [{
                "name": "context",
                "context": {
                    "cluster": "cluster",
                    "user": "user"
                }
            }],
            "current-context": "context"
        }
        
        kubeconfig_content = yaml.dump(kubeconfig)
        
        connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
        
        cluster_info = connector.get_cluster_info()
        namespaces = connector.list_namespaces()
        
        # Add audit log
        audit = AuditLog(
            action="cluster_connect_token",
            resource_type="service_account",
            resource_id=sa_id,
            details={
                "cluster_id": cluster_id,
                "service_account": sa_token.name
            },
            status="success"
        )
        db.add(audit)
        db.commit()
        
        return ClusterConnectResponse(
            success=True,
            message=f"Connected using service account '{sa_token.name}' with {sa_token.role_type} role",
            cluster_info=cluster_info,
            namespaces=namespaces
        )
        
    except Exception as e:
        # Add audit log for failure
        audit = AuditLog(
            action="cluster_connect_token",
            resource_type="service_account",
            resource_id=sa_id,
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect with token: {str(e)}"
        )
    

# ============ Service Account Token Management ============

@router.post("/{cluster_id}/serviceaccount", response_model=ServiceAccountResponse)
async def create_service_account(
    cluster_id: int,
    request: ServiceAccountCreate,
    db: Session = Depends(get_db)
):
    """
    Create a service account with token on a remote cluster via SSH.
    
    This creates:
    1. Service account in specified namespace
    2. ClusterRoleBinding with specified role
    3. Service account token (JWT)
    4. Stores token in database for future use
    
    Benefits:
    - More secure than storing full kubeconfig
    - Token can have limited RBAC permissions
    - Easy to rotate tokens
    - Multiple tokens for different purposes
    """
    # Check if cluster exists
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get SSH session
    try:
        ssh = get_ssh_session(request.session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    
    if not ssh.is_connected():
        raise HTTPException(
            status_code=400,
            detail="SSH connection is no longer active. Please reconnect."
        )
    
    try:
        # Create service account and get token
        sa_info = ssh.create_service_account_with_token(
            name=request.name,
            namespace=request.namespace,
            role_type=request.role_type,
            role_name=request.role_name,
            duration=request.duration
        )
        
        # Calculate expiration date
        import re
        from datetime import timedelta
        duration_match = re.match(r'(\d+)([hms])', request.duration)
        expires_at = None
        if duration_match:
            value, unit = int(duration_match.group(1)), duration_match.group(2)
            if unit == 'h':
                expires_at = datetime.utcnow() + timedelta(hours=value)
            elif unit == 'm':
                expires_at = datetime.utcnow() + timedelta(minutes=value)
            elif unit == 's':
                expires_at = datetime.utcnow() + timedelta(seconds=value)
        
        # Update cluster with server URL and CA cert if not set
        if not cluster.server_url:
            cluster.server_url = sa_info['server_url']
        if not cluster.ca_cert_data:
            cluster.ca_cert_data = sa_info['ca_cert_data']
        
        # Create service account token record
        sa_token = ServiceAccountToken(
            cluster_id=cluster_id,
            name=request.name,
            namespace=request.namespace,
            token=sa_info['token'],
            role_type=request.role_type,
            role_name=request.role_name,
            description=request.description,
            expires_at=expires_at
        )
        
        db.add(sa_token)
        db.commit()
        db.refresh(sa_token)
        
        # Add audit log
        audit = AuditLog(
            action="serviceaccount_create",
            resource_type="service_account",
            resource_id=sa_token.id,
            details={
                "cluster_id": cluster_id,
                "name": request.name,
                "namespace": request.namespace,
                "role_type": request.role_type
            },
            status="success"
        )
        db.add(audit)
        db.commit()
        
        return sa_token
        
    except Exception as e:
        # Add audit log for failure
        audit = AuditLog(
            action="serviceaccount_create",
            resource_type="service_account",
            details={
                "cluster_id": cluster_id,
                "name": request.name
            },
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create service account: {str(e)}"
        )
