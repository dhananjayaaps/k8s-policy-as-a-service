from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ============ Cluster Schemas ============

class ClusterBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    host: Optional[str] = Field(None, description="Public IP or hostname")
    kubeconfig_content: Optional[str] = Field(None, description="Kubeconfig YAML content (optional for token-based auth)")
    context: Optional[str] = None
    description: Optional[str] = None


class ClusterCreate(ClusterBase):
    pass


class ClusterUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    kubeconfig_content: Optional[str] = None
    context: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ClusterResponse(ClusterBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ClusterConnectRequest(BaseModel):
    """Request to connect to a cluster"""
    kubeconfig_content: str = Field(..., description="Kubeconfig YAML content")
    context: Optional[str] = Field(None, description="Kubernetes context to use")


class ClusterConnectResponse(BaseModel):
    """Response after connecting to cluster"""
    success: bool
    message: str
    cluster_info: Optional[Dict[str, Any]] = None
    namespaces: Optional[List[str]] = None


class NamespaceListResponse(BaseModel):
    """Response containing list of namespaces"""
    namespaces: List[str]
    count: int


# ============ Policy Schemas ============

class PolicyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    cluster_id: int = Field(..., description="ID of the cluster this policy belongs to")
    category: Optional[str] = None
    description: Optional[str] = None
    yaml_template: str
    parameters: Optional[Dict[str, Any]] = None


class PolicyCreate(PolicyBase):
    pass


class PolicyUpdate(BaseModel):
    name: Optional[str] = None
    cluster_id: Optional[int] = None
    category: Optional[str] = None
    description: Optional[str] = None
    yaml_template: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


class PolicyResponse(PolicyBase):
    id: int
    cluster_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PolicyDeployRequest(BaseModel):
    """Request to deploy a policy to a cluster"""
    policy_id: int
    cluster_id: Optional[int] = Field(None, description="Cluster ID (uses policy's cluster if not specified)")
    namespace: str = "default"
    parameters: Optional[Dict[str, Any]] = None


class PolicyDeployResponse(BaseModel):
    """Response after deploying a policy"""
    success: bool
    message: str
    deployment_id: Optional[int] = None
    deployed_yaml: Optional[str] = None


# ============ Policy Deployment Schemas ============

class PolicyDeploymentResponse(BaseModel):
    id: int
    cluster_id: int
    policy_id: int
    namespace: str
    status: str
    deployed_yaml: Optional[str] = None
    error_message: Optional[str] = None
    deployed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ============ Audit Log Schemas ============

class AuditLogResponse(BaseModel):
    id: int
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[int] = None
    details: Optional[Dict[str, Any]] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============ Report Schemas ============

class ComplianceReportRequest(BaseModel):
    cluster_id: int
    include_passed: bool = True
    include_failed: bool = True


class ComplianceReportResponse(BaseModel):
    cluster_name: str
    generated_at: datetime
    total_policies: int
    passed: int
    failed: int
    warnings: int
    details: List[Dict[str, Any]]


# ============ Generic Response Schemas ============

class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: datetime


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None


# ============ Kyverno Installation Schemas ============

class KyvernoInstallRequest(BaseModel):
    """Request to install Kyverno via Helm"""
    namespace: str = Field(default="kyverno", description="Namespace to install Kyverno")
    release_name: str = Field(default="kyverno", description="Helm release name")
    create_namespace: bool = Field(default=True, description="Create namespace if it doesn't exist")
    values: Optional[Dict[str, Any]] = Field(default=None, description="Custom Helm values")


class KyvernoInstallResponse(BaseModel):
    """Response after installing Kyverno"""
    success: bool
    message: str
    release_name: Optional[str] = None
    namespace: Optional[str] = None
    output: Optional[str] = None


class KyvernoStatusResponse(BaseModel):
    """Comprehensive Kyverno status response"""
    installed: bool
    version: Optional[str] = None
    namespace: Optional[str] = None
    deployment_status: Dict[str, Any] = {}
    helm_release: Optional[Dict[str, Any]] = None
    api_resources_available: bool = False
    webhooks_configured: bool = False


class KyvernoUninstallRequest(BaseModel):
    """Request to uninstall Kyverno"""
    release_name: str = Field(default="kyverno", description="Helm release name")
    namespace: str = Field(default="kyverno", description="Namespace of Kyverno installation")


class KyvernoUninstallResponse(BaseModel):
    """Response after uninstalling Kyverno"""
    success: bool
    message: str
    output: Optional[str] = None


# ============ SSH Connection Schemas ============

class SSHConnectRequest(BaseModel):
    """Request to connect to a remote server via SSH"""
    host: str = Field(..., description="Server IP or hostname")
    username: str = Field(..., description="SSH username")
    pem_key_content: Optional[str] = Field(None, description="PEM private key content")
    password: Optional[str] = Field(None, description="SSH password (if not using key)")
    port: int = Field(default=22, description="SSH port")


class SSHConnectResponse(BaseModel):
    """Response after SSH connection"""
    success: bool
    message: str
    session_id: str = Field(..., description="Unique session identifier for this SSH connection")
    host: Optional[str] = None


class SSHCommandRequest(BaseModel):
    """Request to execute a command via SSH"""
    session_id: str = Field(..., description="SSH session identifier")
    command: str = Field(..., description="Command to execute")
    timeout: int = Field(default=60, description="Command timeout in seconds")


class SSHCommandResponse(BaseModel):
    """Response after executing SSH command"""
    success: bool
    stdout: str
    stderr: str
    exit_code: int


class SSHKubeconfigRequest(BaseModel):
    """Request to get kubeconfig from remote server"""
    session_id: str = Field(..., description="SSH session identifier")
    kubeconfig_path: str = Field(default="~/.kube/config", description="Path to kubeconfig on remote server")
    portable: bool = Field(default=True, description="Get portable kubeconfig with embedded certs")
    context: Optional[str] = Field(None, description="Kubernetes context to export")


class SSHKubeconfigResponse(BaseModel):
    """Response with kubeconfig content from remote server"""
    success: bool
    kubeconfig_content: str
    message: str


class RemoteKyvernoInstallRequest(BaseModel):
    """Request to install Kyverno on remote server"""
    session_id: str = Field(..., description="SSH session identifier")
    namespace: str = Field(default="kyverno", description="Namespace to install Kyverno")
    release_name: str = Field(default="kyverno", description="Helm release name")
    create_namespace: bool = Field(default=True, description="Create namespace if it doesn't exist")


class MinikubeStatusResponse(BaseModel):
    """Response with Minikube status from remote server"""
    running: bool
    status: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# ============ Service Account Token Schemas ============

class ServiceAccountCreate(BaseModel):
    """Request to create a service account with token"""
    session_id: str = Field(..., description="SSH session identifier")
    name: str = Field(..., description="Service account name")
    namespace: str = Field(default="default", description="Namespace for service account")
    role_type: str = Field(default="view", description="Role type: view, edit, admin, cluster-admin, or custom")
    role_name: Optional[str] = Field(None, description="Custom ClusterRole or Role name")
    description: Optional[str] = None
    duration: Optional[str] = Field(default="87600h", description="Token duration (e.g., 87600h = 10 years, 24h = 1 day)")


class ServiceAccountResponse(BaseModel):
    """Response after creating service account"""
    id: int
    cluster_id: int
    name: str
    namespace: str
    token: str
    role_type: Optional[str]
    role_name: Optional[str]
    description: Optional[str]
    expires_at: Optional[datetime]
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class TokenConnectRequest(BaseModel):
    """Request to connect using service account token"""
    server_url: str = Field(..., description="Kubernetes API server URL")
    token: str = Field(..., description="Service account token")
    ca_cert_data: Optional[str] = Field(None, description="CA certificate base64 data")


# ============ Complete Cluster Setup Workflow ============

class ClusterSetupRequest(BaseModel):
    """Complete workflow: SSH -> Create SA -> Save to DB"""
    session_id: str = Field(..., description="SSH session identifier")
    cluster_name: str = Field(..., description="Cluster name for database")
    cluster_description: Optional[str] = Field(None, description="Cluster description")
    service_account_name: str = Field(default="kyverno-admin", description="Service account name")
    namespace: str = Field(default="kyverno", description="Namespace for service account")
    role_type: str = Field(default="cluster-admin", description="Role type for the service account")
    install_kyverno: bool = Field(default=False, description="Install Kyverno after setup")
    kyverno_namespace: str = Field(default="kyverno", description="Namespace for Kyverno installation")
    verify_ssl: bool = Field(default=False, description="Verify SSL certificates (False recommended for IP replacement/self-signed certs)")
    
    # Public API access configuration
    public_api_url: Optional[str] = Field(
        None,
        description="Public API server URL (e.g., https://your-server.com:8443). "
                    "Use this to replace internal Minikube IPs (192.168.x.x) with accessible URLs. "
                    "If not provided, uses SSH host IP with same port as internal API."
    )
    api_port: Optional[int] = Field(
        None,
        description="API server port on public IP (default: uses same port as cluster's internal API, usually 8443 for Minikube)"
    )


class ClusterSetupResponse(BaseModel):
    """Response for complete cluster setup"""
    success: bool
    message: str
    cluster_id: int
    cluster_name: str
    host: str
    server_url: str
    service_account_id: int
    service_account_name: str
    token: str
    kyverno_installed: bool = False
    kyverno_message: Optional[str] = None


class KyvernoInstallViaTokenRequest(BaseModel):
    """Install Kyverno using service account token"""
    service_account_id: Optional[int] = Field(None, description="Service account token ID (uses cluster's first token if not provided)")
    namespace: str = Field(default="kyverno", description="Namespace to install Kyverno")
    release_name: str = Field(default="kyverno", description="Helm release name")
    create_namespace: bool = Field(default=True, description="Create namespace if it doesn't exist")

