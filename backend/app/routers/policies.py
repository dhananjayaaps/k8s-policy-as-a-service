"""
Policies Router

API endpoints for managing Kyverno policies.
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import logging
import yaml

from app.db import get_db
from app.models import Policy, PolicyDeployment, Cluster, AuditLog, ServiceAccountToken
from app.services.auth import get_current_user
from app.schemas import (
    PolicyCreate,
    PolicyUpdate,
    PolicyResponse,
    PolicyDeployRequest,
    PolicyDeployResponse,
    PolicyDeploymentResponse,
    AuditLogResponse,
    ClusterStatsResponse,
)
from app.services.k8s_connector import get_k8s_connector
from app.services.template_engine import get_template_engine
from app.services.validation_service import get_validation_service

router = APIRouter(
    prefix="/policies",
    tags=["policies"],
    dependencies=[Depends(get_current_user)]
)
logger = logging.getLogger(__name__)


# ============ Policy CRUD ============

@router.post("/", response_model=PolicyResponse)
async def create_policy(policy: PolicyCreate, db: Session = Depends(get_db)):
    """
    Create a new policy template for a specific cluster.
    """
    # Check if cluster exists
    cluster = db.query(Cluster).filter(Cluster.id == policy.cluster_id).first()
    if not cluster:
        raise HTTPException(
            status_code=404,
            detail=f"Cluster with ID {policy.cluster_id} not found"
        )
    
    # Validate the policy YAML
    validator = get_validation_service()
    validation_result = validator.validate_policy(policy.yaml_template)
    
    if not validation_result["valid"]:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid policy YAML",
                "errors": validation_result["errors"]
            }
        )
    
    # Check if policy with same name exists in this cluster
    existing = db.query(Policy).filter(
        Policy.name == policy.name,
        Policy.cluster_id == policy.cluster_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Policy with name '{policy.name}' already exists in cluster '{cluster.name}'"
        )
    
    db_policy = Policy(**policy.model_dump())
    db.add(db_policy)
    db.commit()
    db.refresh(db_policy)
    
    # Add audit log
    audit = AuditLog(
        action="policy_create",
        resource_type="policy",
        resource_id=db_policy.id,
        details={
            "name": policy.name,
            "category": policy.category,
            "cluster_id": policy.cluster_id,
            "cluster_name": cluster.name
        },
        status="success"
    )
    db.add(audit)
    db.commit()
    
    return db_policy


@router.get("/", response_model=List[PolicyResponse])
async def list_policies(
    cluster_id: int = None,
    skip: int = 0,
    limit: int = 100,
    category: str = None,
    db: Session = Depends(get_db)
):
    """
    List policy templates. Filter by cluster_id to get cluster-specific policies.
    """
    query = db.query(Policy)
    
    if cluster_id:
        query = query.filter(Policy.cluster_id == cluster_id)
    
    if category:
        query = query.filter(Policy.category == category)
    
    policies = query.offset(skip).limit(limit).all()
    return policies


@router.get("/cluster/{cluster_id}", response_model=List[PolicyResponse])
async def list_cluster_policies(
    cluster_id: int,
    skip: int = 0,
    limit: int = 100,
    category: str = None,
    db: Session = Depends(get_db)
):
    """
    Get all policies for a specific cluster.
    """
    # Verify cluster exists
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    query = db.query(Policy).filter(Policy.cluster_id == cluster_id)
    
    if category:
        query = query.filter(Policy.category == category)
    
    policies = query.offset(skip).limit(limit).all()
    return policies


@router.get("/{policy_id}", response_model=PolicyResponse)
async def get_policy(policy_id: int, db: Session = Depends(get_db)):
    """
    Get a specific policy template by ID.
    """
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.put("/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    policy_id: int,
    policy_update: PolicyUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a policy template.
    """
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    update_data = policy_update.model_dump(exclude_unset=True)
    
    # Validate YAML if being updated
    if "yaml_template" in update_data:
        validator = get_validation_service()
        validation_result = validator.validate_policy(update_data["yaml_template"])
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Invalid policy YAML",
                    "errors": validation_result["errors"]
                }
            )
    
    for key, value in update_data.items():
        setattr(policy, key, value)
    
    db.commit()
    db.refresh(policy)
    return policy


@router.delete("/{policy_id}")
async def delete_policy(policy_id: int, db: Session = Depends(get_db)):
    """
    Delete a policy template.
    """
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    # Check for active deployments
    active_deployments = db.query(PolicyDeployment).filter(
        PolicyDeployment.policy_id == policy_id,
        PolicyDeployment.status == "deployed"
    ).count()
    
    if active_deployments > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete policy with {active_deployments} active deployments"
        )
    
    # Add audit log
    audit = AuditLog(
        action="policy_delete",
        resource_type="policy",
        resource_id=policy_id,
        details={"name": policy.name},
        status="success"
    )
    db.add(audit)
    
    db.delete(policy)
    db.commit()
    
    return {"message": f"Policy '{policy.name}' deleted"}


# ============ Policy Validation ============

@router.post("/validate")
async def validate_policy(policy_yaml: str):
    """
    Validate a policy YAML without saving it.
    """
    validator = get_validation_service()
    result = validator.validate_policy(policy_yaml)
    return result


@router.post("/render")
async def render_policy_template(
    template: str,
    parameters: dict = None
):
    """
    Render a policy template with parameters.
    """
    engine = get_template_engine()
    
    try:
        rendered = engine.render(template, parameters or {})
        
        # Validate the rendered output
        validator = get_validation_service()
        validation_result = validator.validate_policy(rendered)
        
        return {
            "rendered_yaml": rendered,
            "validation": validation_result
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to render template: {str(e)}"
        )


# ============ Policy Deployment ============

@router.post("/deploy", response_model=PolicyDeployResponse)
async def deploy_policy(
    request: PolicyDeployRequest,
    db: Session = Depends(get_db)
):
    """
    Deploy a policy to its associated cluster.
    The cluster_id is taken from the policy, or can be overridden in the request.
    """
    # Get policy
    policy = db.query(Policy).filter(Policy.id == request.policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    # Use policy's cluster_id if not specified in request
    target_cluster_id = request.cluster_id if request.cluster_id else policy.cluster_id
    
    if not target_cluster_id:
        raise HTTPException(
            status_code=400,
            detail="Policy has no cluster_id and none was provided in request"
        )
    
    # Validate that if cluster_id is provided, it matches the policy's cluster
    if request.cluster_id and policy.cluster_id and request.cluster_id != policy.cluster_id:
        raise HTTPException(
            status_code=400,
            detail=f"Policy belongs to cluster {policy.cluster_id}, cannot deploy to cluster {request.cluster_id}"
        )
    
    cluster = db.query(Cluster).filter(Cluster.id == target_cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Render template if parameters provided
    engine = get_template_engine()
    yaml_content = policy.yaml_template
    
    if request.parameters:
        try:
            yaml_content = engine.render(policy.yaml_template, request.parameters)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to render policy template: {str(e)}"
            )
    
    # Create deployment record
    deployment = PolicyDeployment(
        cluster_id=target_cluster_id,
        policy_id=request.policy_id,
        namespace=request.namespace,
        status="pending",
        deployed_yaml=yaml_content,
    )
    db.add(deployment)
    db.commit()
    db.refresh(deployment)
    
    # Get service account token for cluster
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == target_cluster_id,
        ServiceAccountToken.is_active == True
    ).first()
    
    if not sa_token or not cluster.server_url:
        deployment.status = "failed"
        deployment.error_message = "Cluster missing credentials. Please run cluster setup first."
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Cluster missing credentials. Please run cluster setup first."
        )
    
    # Connect to cluster and deploy
    connector = get_k8s_connector()
    
    try:
        # Create kubeconfig with token
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
        
        result = connector.apply_yaml(yaml_content, namespace=request.namespace)
        
        # Update deployment status
        deployment.status = "deployed"
        deployment.deployed_at = datetime.utcnow()
        db.commit()
        
        # Add audit log
        audit = AuditLog(
            action="policy_deploy",
            resource_type="policy_deployment",
            resource_id=deployment.id,
            details={
                "policy_name": policy.name,
                "cluster_name": cluster.name,
                "namespace": request.namespace
            },
            status="success"
        )
        db.add(audit)
        db.commit()
        
        return PolicyDeployResponse(
            success=True,
            message=f"Policy '{policy.name}' deployed to cluster '{cluster.name}'",
            deployment_id=deployment.id,
            deployed_yaml=yaml_content
        )
        
    except Exception as e:
        # Update deployment status
        deployment.status = "failed"
        deployment.error_message = str(e)
        db.commit()
        
        # Add audit log
        audit = AuditLog(
            action="policy_deploy",
            resource_type="policy_deployment",
            resource_id=deployment.id,
            status="failure",
            error_message=str(e)
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to deploy policy: {str(e)}"
        )


@router.get("/deployments", response_model=List[PolicyDeploymentResponse])
async def list_deployments(
    cluster_id: int = None,
    policy_id: int = None,
    status: str = None,
    db: Session = Depends(get_db)
):
    """
    List policy deployments with optional filters.
    
    Query Parameters:
    - cluster_id: Filter by cluster ID
    - policy_id: Filter by policy ID
    - status: Filter by status (pending, deployed, failed, removed)
    """
    query = db.query(PolicyDeployment)
    
    if cluster_id:
        query = query.filter(PolicyDeployment.cluster_id == cluster_id)
    if policy_id:
        query = query.filter(PolicyDeployment.policy_id == policy_id)
    if status:
        query = query.filter(PolicyDeployment.status == status)
    
    deployments = query.all()
    return deployments


@router.get("/deployments/cluster/{cluster_id}", response_model=List[PolicyDeploymentResponse])
async def list_cluster_deployments(
    cluster_id: int,
    status: str = None,
    db: Session = Depends(get_db)
):
    """
    Get all policy deployments for a specific cluster.
    
    Path Parameters:
    - cluster_id: ID of the cluster
    
    Query Parameters:
    - status: Optional status filter (pending, deployed, failed, removed)
    """
    # Verify cluster exists
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    query = db.query(PolicyDeployment).filter(PolicyDeployment.cluster_id == cluster_id)
    
    if status:
        query = query.filter(PolicyDeployment.status == status)
    
    # Order by most recent first
    query = query.order_by(PolicyDeployment.created_at.desc())
    
    deployments = query.all()
    return deployments


@router.delete("/deployments/{deployment_id}")
async def remove_deployment(deployment_id: int, db: Session = Depends(get_db)):
    """
    Remove a deployed policy from a cluster using saved service account token.
    """
    deployment = db.query(PolicyDeployment).filter(
        PolicyDeployment.id == deployment_id
    ).first()
    
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    # Get policy and cluster info
    policy = db.query(Policy).filter(Policy.id == deployment.policy_id).first()
    cluster = db.query(Cluster).filter(Cluster.id == deployment.cluster_id).first()
    
    if deployment.status == "deployed" and policy and cluster:
        # Get service account token
        sa_token = db.query(ServiceAccountToken).filter(
            ServiceAccountToken.cluster_id == cluster.id,
            ServiceAccountToken.is_active == True
        ).first()
        
        if sa_token and cluster.server_url:
            # Try to delete from cluster using token
            connector = get_k8s_connector()
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
                    "clusters": [{"name": "cluster", "cluster": cluster_config}],
                    "users": [{"name": "user", "user": {"token": sa_token.token}}],
                    "contexts": [{"name": "context", "context": {"cluster": "cluster", "user": "user"}}],
                    "current-context": "context"
                }
                
                kubeconfig_content = yaml.dump(kubeconfig)
                connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
                connector.delete_policy(policy.name, namespace=deployment.namespace)
            except Exception as e:
                # Log warning but proceed with database deletion
                logger.warning(f"Failed to delete policy from cluster: {e}")
    
    # Update deployment status
    deployment.status = "removed"
    deployment.updated_at = datetime.utcnow()
    db.commit()
    
    # Add audit log
    audit = AuditLog(
        action="policy_undeploy",
        resource_type="policy_deployment",
        resource_id=deployment.id,
        details={
            "policy_name": policy.name if policy else None,
            "cluster_id": cluster.id if cluster else None,
            "namespace": deployment.namespace
        },
        status="success"
    )
    db.add(audit)
    db.commit()
    
    return {"success": True, "message": "Deployment removed"}


@router.get("/cluster/{cluster_id}/kyverno-policies")
async def list_kyverno_policies(cluster_id: int, db: Session = Depends(get_db)):
    """
    List all Kyverno policies currently deployed in a specific cluster.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get service account token
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == cluster_id,
        ServiceAccountToken.is_active == True
    ).first()
    
    if not sa_token or not cluster.server_url:
        raise HTTPException(
            status_code=400,
            detail="Cluster missing credentials. Please run cluster setup first."
        )
    
    connector = get_k8s_connector()
    
    try:
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
            "clusters": [{"name": "cluster", "cluster": cluster_config}],
            "users": [{"name": "user", "user": {"token": sa_token.token}}],
            "contexts": [{"name": "context", "context": {"cluster": "cluster", "user": "user"}}],
            "current-context": "context"
        }
        
        kubeconfig_content = yaml.dump(kubeconfig)
        connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
        
        policies = connector.list_kyverno_policies()
        return policies
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list Kyverno policies: {str(e)}"
        )


# ============ Audit Logs ============

@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    action: str = None,
    resource_type: str = None,
    status: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Get audit logs for policy operations.
    
    Query Parameters:
    - action: Filter by action (e.g., policy_create, policy_deploy, policy_undeploy)
    - resource_type: Filter by resource type (e.g., policy, policy_deployment)
    - status: Filter by status (success, failure)
    - skip: Number of records to skip
    - limit: Maximum records to return
    """
    query = db.query(AuditLog)
    
    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    if status:
        query = query.filter(AuditLog.status == status)
    
    # Order by most recent first
    query = query.order_by(AuditLog.created_at.desc())
    
    logs = query.offset(skip).limit(limit).all()
    return logs


@router.get("/cluster/{cluster_id}/stats", response_model=ClusterStatsResponse)
async def get_cluster_stats(cluster_id: int, db: Session = Depends(get_db)):
    """
    Get comprehensive statistics for a specific cluster including:
    - Active policies count and deployment stats
    - Compliance scores (overall, security, cost, reliability)
    - Violations and audit log statistics
    - Recent activity and trends
    """
    from sqlalchemy import func, distinct, case
    from datetime import datetime, timedelta
    
    # Verify cluster exists
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Time windows for calculations
    twenty_four_hours_ago = datetime.utcnow() - timedelta(days=1)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    
    # ============ Policy Counts ============
    active_policies_count = db.query(Policy).filter(
        Policy.cluster_id == cluster_id
    ).count()
    
    total_deployments = db.query(PolicyDeployment).filter(
        PolicyDeployment.cluster_id == cluster_id
    ).count()
    
    deployed_policies_count = db.query(PolicyDeployment).filter(
        PolicyDeployment.cluster_id == cluster_id,
        PolicyDeployment.status == "deployed"
    ).count()
    
    failed_deployments_count = db.query(PolicyDeployment).filter(
        PolicyDeployment.cluster_id == cluster_id,
        PolicyDeployment.status == "failed"
    ).count()
    
    # ============ Audit Log Analysis ============
    # Total audit logs in last 24 hours
    total_logs_24h = db.query(AuditLog).filter(
        AuditLog.created_at >= twenty_four_hours_ago,
        AuditLog.resource_type.in_(["policy", "policy_deployment"])
    ).count()
    
    # Success vs failure counts
    success_count_24h = db.query(AuditLog).filter(
        AuditLog.created_at >= twenty_four_hours_ago,
        AuditLog.status == "success",
        AuditLog.resource_type.in_(["policy", "policy_deployment"])
    ).count()
    
    violations_count = db.query(AuditLog).filter(
        AuditLog.created_at >= twenty_four_hours_ago,
        AuditLog.status == "failure",
        AuditLog.resource_type.in_(["policy", "policy_deployment"])
    ).count()
    
    # Violations in last 7 days for trend
    violations_7d = db.query(AuditLog).filter(
        AuditLog.created_at >= seven_days_ago,
        AuditLog.status == "failure",
        AuditLog.resource_type.in_(["policy", "policy_deployment"])
    ).count()
    
    # Get recent audit logs (last 10)
    recent_logs = db.query(AuditLog).filter(
        AuditLog.resource_type.in_(["policy", "policy_deployment", "cluster"])
    ).order_by(AuditLog.created_at.desc()).limit(10).all()
    
    # ============ Compliance Score Calculations ============
    # Overall Compliance Score (0-100)
    # Based on: deployment success rate, low violations, active monitoring
    deployment_success_rate = 0
    if total_deployments > 0:
        deployment_success_rate = (deployed_policies_count / total_deployments) * 100
    
    # Penalty for violations
    violation_penalty = min(violations_count * 2, 30)  # Max 30 points penalty
    
    # Bonus for having policies deployed
    policy_coverage_bonus = min(deployed_policies_count * 5, 20)  # Max 20 points bonus
    
    overall_score = max(0, min(100, int(
        deployment_success_rate * 0.5 +  # 50% weight on deployment success
        policy_coverage_bonus +          # Bonus for coverage
        (40 if violations_count == 0 else max(0, 40 - violation_penalty))  # Violation penalty
    )))
    
    # Security Score (0-100)
    # Based on: security policies deployed, low security violations
    security_policies = db.query(Policy).filter(
        Policy.cluster_id == cluster_id,
        Policy.category.in_(["security", "best-practices", "pod-security"])
    ).count()
    
    security_deployments = db.query(PolicyDeployment).filter(
        PolicyDeployment.cluster_id == cluster_id,
        PolicyDeployment.status == "deployed"
    ).join(Policy).filter(
        Policy.category.in_(["security", "best-practices", "pod-security"])
    ).count()
    
    security_score = max(0, min(100, int(
        (security_deployments * 10) +  # 10 points per security policy
        (60 if violations_count < 3 else max(30, 60 - violations_count * 5))
    )))
    
    # Cost Score (0-100)
    # Based on: resource limit policies, cost-related policies
    cost_policies = db.query(Policy).filter(
        Policy.cluster_id == cluster_id,
        Policy.category.in_(["resource-management", "cost-optimization"])
    ).count()
    
    cost_deployments = db.query(PolicyDeployment).filter(
        PolicyDeployment.cluster_id == cluster_id,
        PolicyDeployment.status == "deployed"
    ).join(Policy).filter(
        Policy.category.in_(["resource-management", "cost-optimization"])
    ).count()
    
    cost_score = max(0, min(100, int(
        70 +  # Base score
        (cost_deployments * 10) -  # Bonus for cost policies
        (failed_deployments_count * 5)  # Penalty for failures
    )))
    
    # Reliability Score (0-100)
    # Based on: deployment stability, low failure rate
    reliability_base = 85  # Start with high base
    failure_penalty = min(failed_deployments_count * 10, 40)
    
    recent_success_rate = 0
    if total_logs_24h > 0:
        recent_success_rate = (success_count_24h / total_logs_24h) * 15  # Max 15 points
    
    reliability_score = max(0, min(100, int(
        reliability_base - failure_penalty + recent_success_rate
    )))
    
    # ============ Additional Metrics ============
    resources_scanned = deployed_policies_count  # Each deployed policy scans resources
    
    # Policy enforcement rate
    enforcement_rate = 0
    if active_policies_count > 0:
        enforcement_rate = round((deployed_policies_count / active_policies_count) * 100, 1)
    
    # Success rate
    success_rate = 0
    if total_logs_24h > 0:
        success_rate = round((success_count_24h / total_logs_24h) * 100, 1)
    
    # Trend indicator (comparing 24h vs 7d average)
    avg_violations_per_day_7d = violations_7d / 7 if violations_7d > 0 else 0
    violation_trend = "stable"
    if violations_count > avg_violations_per_day_7d * 1.5:
        violation_trend = "increasing"
    elif violations_count < avg_violations_per_day_7d * 0.5:
        violation_trend = "decreasing"
    
    return {
        "cluster_id": cluster_id,
        "cluster_name": cluster.name,
        
        # Policy statistics
        "active_policies_count": active_policies_count,
        "deployed_policies_count": deployed_policies_count,
        "total_deployments": total_deployments,
        "failed_deployments_count": failed_deployments_count,
        "enforcement_rate": enforcement_rate,
        
        # Compliance scores
        "overall_score": overall_score,
        "security_score": security_score,
        "cost_score": cost_score,
        "reliability_score": reliability_score,
        
        # Violation statistics
        "violations_count": violations_count,
        "violations_24h": violations_count,
        "violations_7d": violations_7d,
        "violation_trend": violation_trend,
        
        # Activity metrics
        "total_logs_24h": total_logs_24h,
        "success_count_24h": success_count_24h,
        "success_rate": success_rate,
        "resources_scanned": resources_scanned,
        
        # Recent activity
        "recent_logs": recent_logs,
        
        # Timestamp
        "generated_at": datetime.utcnow().isoformat()
    }


@router.get("/cluster/{cluster_id}/policy-reports")
async def get_cluster_policy_reports(cluster_id: int, db: Session = Depends(get_db)):
    """
    Get Kyverno PolicyReports for a specific cluster.
    
    This shows actual policy violations and pass/fail results from Kyverno.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get service account token
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == cluster_id,
        ServiceAccountToken.is_active == True
    ).first()
    
    if not sa_token or not cluster.server_url:
        raise HTTPException(
            status_code=400,
            detail="Cluster missing credentials. Please run cluster setup first."
        )
    
    connector = get_k8s_connector()
    
    try:
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
            "clusters": [{"name": "cluster", "cluster": cluster_config}],
            "users": [{"name": "user", "user": {"token": sa_token.token}}],
            "contexts": [{"name": "context", "context": {"cluster": "cluster", "user": "user"}}],
            "current-context": "context"
        }
        
        kubeconfig_content = yaml.dump(kubeconfig)
        connector.load_cluster_from_content(kubeconfig_content=kubeconfig_content)
        
        # Get policy reports from Kubernetes
        from kubernetes import client
        custom_api = client.CustomObjectsApi(connector.get_api_client())
        
        reports = []
        
        # Get ClusterPolicyReports
        try:
            cluster_reports = custom_api.list_cluster_custom_object(
                group="wgpolicyk8s.io",
                version="v1alpha2",
                plural="clusterpolicyreports"
            )
            reports.extend(cluster_reports.get("items", []))
        except Exception as e:
            logger.warning(f"Failed to get ClusterPolicyReports: {e}")
        
        # Get PolicyReports from all namespaces
        try:
            v1 = client.CoreV1Api(connector.get_api_client())
            namespaces = v1.list_namespace()
            
            for ns in namespaces.items:
                try:
                    ns_reports = custom_api.list_namespaced_custom_object(
                        group="wgpolicyk8s.io",
                        version="v1alpha2",
                        namespace=ns.metadata.name,
                        plural="policyreports"
                    )
                    for report in ns_reports.get("items", []):
                        report["namespace"] = ns.metadata.name
                        reports.append(report)
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Failed to get PolicyReports: {e}")
        
        # Parse and summarize reports
        summary = {
            "total_reports": len(reports),
            "total_pass": 0,
            "total_fail": 0,
            "total_warn": 0,
            "total_error": 0,
            "total_skip": 0,
            "reports": []
        }
        
        for report in reports:
            results = report.get("results", [])
            report_summary = {
                "name": report.get("metadata", {}).get("name"),
                "namespace": report.get("namespace"),
                "summary": report.get("summary", {}),
                "results": results
            }
            
            # Count results
            summary["total_pass"] += report.get("summary", {}).get("pass", 0)
            summary["total_fail"] += report.get("summary", {}).get("fail", 0)
            summary["total_warn"] += report.get("summary", {}).get("warn", 0)
            summary["total_error"] += report.get("summary", {}).get("error", 0)
            summary["total_skip"] += report.get("summary", {}).get("skip", 0)
            
            summary["reports"].append(report_summary)
        
        return summary
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get policy reports: {str(e)}"
        )
