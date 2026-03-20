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
    PolicyMultiDeployRequest,
    PolicyMultiDeployResponse,
    PolicyDeploymentResponse,
    AuditLogResponse,
    ClusterStatsResponse,
    PolicyValidateRequest,
    PolicyValidateResponse,
    PolicyRenderRequest,
    PolicyRenderResponse,
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
    Create a new generalized policy template.
    Templates can be deployed to any cluster via the deployment API.
    """
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
    
    # Check if policy with same name already exists
    existing = db.query(Policy).filter(Policy.name == policy.name).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Policy with name '{policy.name}' already exists. Please use a unique name."
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
            "title": policy.title
        },
        status="success"
    )
    db.add(audit)
    db.commit()
    
    return db_policy


@router.get("/", response_model=List[PolicyResponse])
async def list_policies(
    skip: int = 0,
    limit: int = 100,
    category: str = None,
    db: Session = Depends(get_db)
):
    """
    List all generalized policy templates.
    These templates can be deployed to any cluster.
    """
    query = db.query(Policy)
    
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


# ============ Policy Validation & Rendering ============

@router.post("/validate", response_model=PolicyValidateResponse)
async def validate_policy_yaml(
    request: PolicyValidateRequest,
    db: Session = Depends(get_db)
):
    """
    Validate policy YAML syntax and structure.
    """
    validator = get_validation_service()
    result = validator.validate_policy(request.yaml_content)
    
    return PolicyValidateResponse(
        valid=result["valid"],
        errors=result.get("errors", []),
        warnings=result.get("warnings", []),
        info=result.get("info", {})
    )


@router.post("/render", response_model=PolicyRenderResponse)
async def render_policy_template(
    request: PolicyRenderRequest,
    db: Session = Depends(get_db)
):
    """
    Render policy template with provided parameters.
    """
    engine = get_template_engine()
    
    try:
        rendered = engine.render(request.yaml_template, request.parameters)
        return PolicyRenderResponse(
            success=True,
            rendered_yaml=rendered,
            error=None
        )
    except Exception as e:
        return PolicyRenderResponse(
            success=False,
            rendered_yaml=None,
            error=str(e)
        )


# ============ Policy Deployment ============

@router.post("/deploy", response_model=PolicyDeployResponse)
async def deploy_policy(
    request: PolicyDeployRequest,
    db: Session = Depends(get_db)
):
    """
    Deploy a policy template to a specific cluster.
    cluster_id must be provided in the request.
    """
    # Get policy template
    policy = db.query(Policy).filter(Policy.id == request.policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    # cluster_id is now required in the request
    if not request.cluster_id:
        raise HTTPException(
            status_code=400,
            detail="cluster_id is required to deploy a policy template"
        )
    
    cluster = db.query(Cluster).filter(Cluster.id == request.cluster_id).first()
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
    
    # Detect policy kind (ClusterPolicy vs Policy) from rendered YAML
    policy_kind = None
    try:
        parsed = yaml.safe_load(yaml_content)
        if parsed and isinstance(parsed, dict):
            policy_kind = parsed.get("kind")
    except yaml.YAMLError:
        pass
    
    # ClusterPolicy is cluster-scoped — namespace is stored as "cluster-wide" for reference
    effective_namespace = request.namespace
    if policy_kind == "ClusterPolicy":
        effective_namespace = "cluster-wide"
        logger.info(f"ClusterPolicy detected — namespace ignored, storing as '{effective_namespace}'")
    
    # Create deployment record
    deployment = PolicyDeployment(
        cluster_id=request.cluster_id,
        policy_id=request.policy_id,
        namespace=effective_namespace,
        status="pending",
        deployed_yaml=yaml_content,
        parameters=request.parameters,  # Store parameters for reuse
    )
    db.add(deployment)
    db.commit()
    db.refresh(deployment)
    
    # Get service account token for cluster
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == request.cluster_id,
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


@router.post("/deploy-multi", response_model=PolicyMultiDeployResponse)
async def deploy_policy_multi(
    request: PolicyMultiDeployRequest,
    db: Session = Depends(get_db)
):
    """
    Deploy a policy template to multiple namespaces with per-namespace parameters.
    Each namespace can have its own parameter set.
    """
    if not request.namespace_configs:
        raise HTTPException(status_code=400, detail="At least one namespace configuration is required")

    results = []
    all_success = True

    for ns_config in request.namespace_configs:
        try:
            deploy_request = PolicyDeployRequest(
                policy_id=request.policy_id,
                cluster_id=request.cluster_id,
                namespace=ns_config.namespace,
                parameters=ns_config.parameters,
            )
            response = await deploy_policy(deploy_request, db)
            results.append({
                "namespace": ns_config.namespace,
                "success": response.success,
                "message": response.message,
                "deployment_id": response.deployment_id,
            })
        except HTTPException as e:
            all_success = False
            detail = e.detail if isinstance(e.detail, str) else str(e.detail)
            results.append({
                "namespace": ns_config.namespace,
                "success": False,
                "message": detail,
                "deployment_id": None,
            })
        except Exception as e:
            all_success = False
            results.append({
                "namespace": ns_config.namespace,
                "success": False,
                "message": str(e),
                "deployment_id": None,
            })

    succeeded = sum(1 for r in results if r["success"])
    total = len(results)

    return PolicyMultiDeployResponse(
        success=all_success,
        message=f"Deployed to {succeeded}/{total} namespace(s)",
        results=results,
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
                # K8s delete failed — mark as removal_failed so user knows
                logger.warning(f"Failed to delete policy from cluster: {e}")
                deployment.status = "removal_failed"
                deployment.error_message = f"Failed to remove from cluster: {str(e)}"
                deployment.updated_at = datetime.utcnow()
                db.commit()
                
                return {
                    "success": False,
                    "message": f"Failed to remove policy from cluster: {str(e)}. "
                               "The policy may still be active in the cluster."
                }
    
    # Update deployment status to removed
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
    
    return {"success": True, "message": "Policy undeployed successfully"}


@router.get("/deployment-status/{policy_id}/cluster/{cluster_id}")
async def check_deployment_status(
    policy_id: int,
    cluster_id: int,
    db: Session = Depends(get_db)
):
    """
    Check deployment status and configuration requirements for a policy.
    
    Returns:
    - deployed: Whether policy is currently deployed
    - can_quick_deploy: Whether toggle can deploy directly or requires editor
    - requires_config: Whether policy needs parameter configuration
    - has_previous_config: Whether policy was deployed before (can reuse params)
    - deployment_info: Details about current/previous deployment
    """
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    # Check current deployment (any namespace)
    current_deployments = db.query(PolicyDeployment).filter(
        PolicyDeployment.policy_id == policy_id,
        PolicyDeployment.cluster_id == cluster_id,
        PolicyDeployment.status == "deployed"
    ).order_by(PolicyDeployment.created_at.desc()).all()
    
    current_deployment = current_deployments[0] if current_deployments else None
    
    # Check previous deployment for parameter reuse
    previous_deployment = db.query(PolicyDeployment).filter(
        PolicyDeployment.policy_id == policy_id,
        PolicyDeployment.cluster_id == cluster_id
    ).order_by(PolicyDeployment.created_at.desc()).first()
    
    # Determine if policy requires configuration
    requires_config = False
    can_quick_deploy = True
    parameter_info = []
    
    if policy.parameters:
        try:
            import json
            params = policy.parameters if isinstance(policy.parameters, dict) else json.loads(policy.parameters)
            
            # Ensure params is a dictionary
            if isinstance(params, dict):
                for param_name, param_def in params.items():
                    # Ensure param_def is a dictionary
                    if isinstance(param_def, dict):
                        has_default = param_def.get('default') is not None
                        parameter_info.append({
                            "name": param_name,
                            "type": param_def.get('type', 'string'),
                            "required": param_def.get('required', False),
                            "has_default": has_default,
                            "description": param_def.get('description', '')
                        })
                        
                        if not has_default:
                            requires_config = True
                    else:
                        # param_def is not a dict, treat as requiring config
                        requires_config = True
                        parameter_info.append({
                            "name": param_name,
                            "type": "string",
                            "required": True,
                            "has_default": False,
                            "description": ""
                        })
            else:
                requires_config = True
        except:
            requires_config = True
    
    # Can quick deploy if:
    # 1. Already deployed (will be no-op), OR
    # 2. Has previous deployment with params (will reuse), OR
    # 3. No configuration required (all params have defaults or no params)
    has_previous_config = previous_deployment is not None and previous_deployment.parameters is not None
    can_quick_deploy = current_deployment is not None or has_previous_config or not requires_config
    
    response = {
        "deployed": current_deployment is not None,
        "can_quick_deploy": can_quick_deploy,
        "requires_config": requires_config,
        "has_previous_config": has_previous_config,
        "parameters": parameter_info,
        "deployment_info": None,
        "namespace_deployments": []
    }
    
    # Build per-namespace deployment info
    for dep in current_deployments:
        response["namespace_deployments"].append({
            "deployment_id": dep.id,
            "namespace": dep.namespace,
            "deployed_at": dep.deployed_at,
            "status": dep.status,
            "parameters": dep.parameters
        })
    
    if current_deployment:
        response["deployment_info"] = {
            "deployment_id": current_deployment.id,
            "namespace": current_deployment.namespace,
            "deployed_at": current_deployment.deployed_at,
            "status": current_deployment.status,
            "parameters": current_deployment.parameters
        }
    elif previous_deployment and previous_deployment.parameters:
        # Return previous deployment info so the UI can show last-used values
        response["deployment_info"] = {
            "deployment_id": previous_deployment.id,
            "namespace": previous_deployment.namespace,
            "deployed_at": previous_deployment.deployed_at,
            "status": previous_deployment.status,
            "parameters": previous_deployment.parameters
        }
    
    return response


@router.post("/quick-deploy/{policy_id}/cluster/{cluster_id}")
async def quick_deploy_policy(
    policy_id: int,
    cluster_id: int,
    namespace: str = "default",
    db: Session = Depends(get_db)
):
    """
    Smart deploy a policy to a cluster.
    
    Behavior:
    1. If policy already deployed → Return success (no-op)
    2. If policy was deployed before → Reuse last successful parameters
    3. If new deployment and policy has parameters → Return error (requires configuration via editor)
    4. If no parameters needed → Deploy with defaults
    """
    # Get policy
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    # Check if already deployed
    existing = db.query(PolicyDeployment).filter(
        PolicyDeployment.policy_id == policy_id,
        PolicyDeployment.cluster_id == cluster_id,
        PolicyDeployment.status == "deployed"
    ).first()
    
    if existing:
        return PolicyDeployResponse(
            success=True,
            message="Policy already deployed to this cluster",
            deployment_id=existing.id
        )
    
    # Check for previous deployment to reuse parameters
    previous_deployment = db.query(PolicyDeployment).filter(
        PolicyDeployment.policy_id == policy_id,
        PolicyDeployment.cluster_id == cluster_id,
        PolicyDeployment.status.in_(["deployed", "removed"])
    ).order_by(PolicyDeployment.created_at.desc()).first()
    
    parameters_to_use = None
    
    if previous_deployment and previous_deployment.parameters:
        # Reuse previous successful parameters
        parameters_to_use = previous_deployment.parameters
        logger.info(f"Reusing previous parameters for policy {policy_id}")
    else:
        # Check if policy requires parameters
        if policy.parameters:
            # Policy has parameter definitions - check if configuration is needed
            requires_config = False
            param_info = []
            
            try:
                import json
                if isinstance(policy.parameters, str):
                    params = json.loads(policy.parameters)
                else:
                    params = policy.parameters
                
                # Validate params is a dictionary
                if not isinstance(params, dict):
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "error": "configuration_required",
                            "message": "This policy requires configuration before deployment",
                            "action": "open_editor"
                        }
                    )
                
                # Check if any parameters lack default values
                for param_name, param_def in params.items():
                    # Ensure param_def is a dictionary
                    if not isinstance(param_def, dict):
                        # If param_def is not a dict, treat as requiring configuration
                        requires_config = True
                        param_info.append({
                            "name": param_name,
                            "required": True,
                            "has_default": False
                        })
                        continue
                    
                    has_default = param_def.get('default') is not None
                    param_info.append({
                        "name": param_name,
                        "required": param_def.get('required', False),
                        "has_default": has_default
                    })
                    
                    if not has_default:
                        requires_config = True
                
                if requires_config:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "error": "configuration_required",
                            "message": "This policy requires configuration before deployment",
                            "parameters": param_info,
                            "action": "open_editor"
                        }
                    )
                else:
                    # All parameters have defaults, use them
                    parameters_to_use = {}
                    for p, p_def in params.items():
                        if isinstance(p_def, dict) and 'default' in p_def:
                            parameters_to_use[p] = p_def['default']
                    
            except json.JSONDecodeError:
                # If parameters field is malformed, require configuration
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "configuration_required",
                        "message": "This policy requires configuration before deployment",
                        "action": "open_editor"
                    }
                )
    
    # Deploy with determined parameters
    request = PolicyDeployRequest(
        policy_id=policy_id,
        cluster_id=cluster_id,
        namespace=namespace,
        parameters=parameters_to_use
    )
    
    return await deploy_policy(request, db)


@router.post("/quick-undeploy/{policy_id}/cluster/{cluster_id}")
async def quick_undeploy_policy(
    policy_id: int,
    cluster_id: int,
    db: Session = Depends(get_db)
):
    """
    Quick undeploy a policy from a cluster.
    Removes ALL deployed instances across all namespaces.
    Used by marketplace toggle switch.
    """
    # Find all deployed instances for this policy+cluster
    deployments = db.query(PolicyDeployment).filter(
        PolicyDeployment.policy_id == policy_id,
        PolicyDeployment.cluster_id == cluster_id,
        PolicyDeployment.status == "deployed"
    ).order_by(PolicyDeployment.created_at.desc()).all()
    
    if not deployments:
        raise HTTPException(
            status_code=404,
            detail="No active deployment found for this policy in this cluster"
        )
    
    # Undeploy each instance
    results = []
    any_failed = False
    for deployment in deployments:
        result = await remove_deployment(deployment.id, db)
        if not result.get("success", False):
            any_failed = True
        results.append({"namespace": deployment.namespace, **result})
    
    if any_failed:
        return {
            "success": False,
            "message": f"Some deployments failed to remove. Check cluster for remaining policies.",
            "results": results,
        }
    
    return {
        "success": True,
        "message": f"Policy undeployed from {len(deployments)} namespace(s)",
        "results": results,
    }


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
    # Count distinct policies deployed to this cluster
    active_policies_count = db.query(func.count(distinct(PolicyDeployment.policy_id))).filter(
        PolicyDeployment.cluster_id == cluster_id
    ).scalar() or 0
    
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
    # Count security policies deployed to this cluster
    security_policies = db.query(func.count(distinct(PolicyDeployment.policy_id))).filter(
        PolicyDeployment.cluster_id == cluster_id
    ).join(Policy).filter(
        Policy.category.in_(["security", "best-practices", "pod-security"])
    ).scalar() or 0
    
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
    # Count cost policies deployed to this cluster
    cost_policies = db.query(func.count(distinct(PolicyDeployment.policy_id))).filter(
        PolicyDeployment.cluster_id == cluster_id
    ).join(Policy).filter(
        Policy.category.in_(["resource-management", "cost-optimization"])
    ).scalar() or 0
    
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
