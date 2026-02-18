from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ============ Cluster Schemas ============

class ClusterBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    kubeconfig_path: str
    context: Optional[str] = None
    description: Optional[str] = None


class ClusterCreate(ClusterBase):
    pass


class ClusterUpdate(BaseModel):
    name: Optional[str] = None
    kubeconfig_path: Optional[str] = None
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
    kubeconfig_path: str = Field(..., description="Path to kubeconfig file")
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
    category: Optional[str] = None
    description: Optional[str] = None
    yaml_template: str
    parameters: Optional[Dict[str, Any]] = None


class PolicyCreate(PolicyBase):
    pass


class PolicyUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    yaml_template: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


class PolicyResponse(PolicyBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PolicyDeployRequest(BaseModel):
    """Request to deploy a policy to a cluster"""
    cluster_id: int
    policy_id: int
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
