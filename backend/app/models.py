from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class Cluster(Base):
    """Kubernetes cluster configuration"""
    __tablename__ = "clusters"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    host = Column(String(255), nullable=True)  # Public IP or hostname
    kubeconfig_content = Column(Text, nullable=True)  # Optional: for full admin access
    context = Column(String(255), nullable=True)
    server_url = Column(String(500), nullable=True)  # API server URL for token auth
    ca_cert_data = Column(Text, nullable=True)  # CA certificate base64 for token auth
    verify_ssl = Column(Boolean, default=False)  # SSL certificate verification (False for dev/self-signed)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    policies = relationship("PolicyDeployment", back_populates="cluster")
    service_accounts = relationship("ServiceAccountToken", back_populates="cluster", cascade="all, delete-orphan")


class ServiceAccountToken(Base):
    """Service account tokens for cluster access with RBAC"""
    __tablename__ = "service_account_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=False)
    name = Column(String(255), nullable=False)  # Service account name
    namespace = Column(String(255), default="default", nullable=False)
    token = Column(Text, nullable=False)  # JWT token
    role_type = Column(String(100), nullable=True)  # e.g., "view", "edit", "admin", "custom"
    role_name = Column(String(255), nullable=True)  # ClusterRole or Role name
    description = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=True)  # Token expiration
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    cluster = relationship("Cluster", back_populates="service_accounts")


class Policy(Base):
    """Kyverno policy template"""
    __tablename__ = "policies"
    
    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=True)  # Cluster-specific policy
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)  # e.g., "security", "best-practices"
    description = Column(Text, nullable=True)
    yaml_template = Column(Text, nullable=False)
    parameters = Column(JSON, nullable=True)  # JSON schema for policy parameters
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    cluster = relationship("Cluster")
    deployments = relationship("PolicyDeployment", back_populates="policy")


class PolicyDeployment(Base):
    """Track policy deployments to clusters"""
    __tablename__ = "policy_deployments"
    
    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=False)
    policy_id = Column(Integer, ForeignKey("policies.id"), nullable=False)
    namespace = Column(String(255), default="default")
    status = Column(String(50), default="pending")  # pending, deployed, failed, removed
    deployed_yaml = Column(Text, nullable=True)  # Actual YAML deployed
    error_message = Column(Text, nullable=True)
    deployed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    cluster = relationship("Cluster", back_populates="policies")
    policy = relationship("Policy", back_populates="deployments")


class AuditLog(Base):
    """Audit log for all operations"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(100), nullable=False)  # e.g., "cluster_connect", "policy_deploy"
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(Integer, nullable=True)
    details = Column(JSON, nullable=True)
    status = Column(String(50), default="success")  # success, failure
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
