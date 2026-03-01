"""
Policies Router

API endpoints for managing Kyverno policies.
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.db import get_db
from app.models import Policy, PolicyDeployment, Cluster, AuditLog, ServiceAccountToken
from app.schemas import (
    PolicyCreate,
    PolicyUpdate,
    PolicyResponse,
    PolicyDeployRequest,
    PolicyDeployResponse,
    PolicyDeploymentResponse,
)
from app.services.k8s_connector import get_k8s_connector
from app.services.template_engine import get_template_engine
from app.services.validation_service import get_validation_service

router = APIRouter(prefix="/policies", tags=["policies"])


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
    List policy deployments.
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


@router.delete("/deployments/{deployment_id}")
async def remove_deployment(deployment_id: int, db: Session = Depends(get_db)):
    """
    Remove a deployed policy from a cluster.
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
        # Try to delete from cluster
        connector = get_k8s_connector()
        try:
            connector.load_cluster(
                kubeconfig_path=cluster.kubeconfig_path,
                context=cluster.context
            )
            connector.delete_policy(policy.name, namespace=deployment.namespace)
        except Exception as e:
            # Log warning but proceed with database deletion
            pass
    
    deployment.status = "removed"
    db.commit()
    
    return {"message": "Deployment removed"}


@router.get("/kyverno-policies")
async def list_kyverno_policies():
    """
    List all Kyverno policies currently in the connected cluster.
    """
    connector = get_k8s_connector()
    
    try:
        policies = connector.list_kyverno_policies()
        return policies
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list Kyverno policies: {str(e)}"
        )
