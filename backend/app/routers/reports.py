"""
Reports Router

API endpoints for generating compliance and policy reports.
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional

from app.db import get_db
from app.models import Cluster, Policy, PolicyDeployment
from app.schemas import ComplianceReportRequest, ComplianceReportResponse
from app.services.k8s_connector import get_k8s_connector
from app.services.report_generator import get_report_generator

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/compliance")
async def generate_compliance_report(
    request: ComplianceReportRequest,
    db: Session = Depends(get_db)
):
    """
    Generate a compliance report for a cluster.
    """
    cluster = db.query(Cluster).filter(Cluster.id == request.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get deployments for this cluster
    deployments = db.query(PolicyDeployment).filter(
        PolicyDeployment.cluster_id == request.cluster_id,
        PolicyDeployment.status == "deployed"
    ).all()
    
    # Get policies
    policies = []
    for deployment in deployments:
        policy = db.query(Policy).filter(Policy.id == deployment.policy_id).first()
        if policy:
            policies.append({
                "name": policy.name,
                "category": policy.category,
                "deployment_id": deployment.id,
            })
    
    # TODO: Get actual violations from cluster
    # For now, return empty violations
    violations = []
    
    generator = get_report_generator()
    report = generator.generate_compliance_report(
        cluster_name=cluster.name,
        policies=policies,
        violations=violations,
        include_passed=request.include_passed,
        include_failed=request.include_failed,
    )
    
    return report


@router.get("/cluster-summary/{cluster_id}")
async def get_cluster_summary_report(cluster_id: int, db: Session = Depends(get_db)):
    """
    Generate a summary report for a cluster.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    connector = get_k8s_connector()
    generator = get_report_generator()
    
    try:
        # Connect to cluster
        connector.load_cluster(
            kubeconfig_path=cluster.kubeconfig_path,
            context=cluster.context
        )
        
        # Get cluster info
        cluster_info = connector.get_cluster_info()
        
        # Get Kyverno status
        is_installed, version = connector.check_kyverno_installed()
        kyverno_status = {
            "installed": is_installed,
            "version": version,
        }
        
        # Get Kyverno policies from cluster
        k8s_policies = connector.list_kyverno_policies()
        all_policies = (
            k8s_policies.get("cluster_policies", []) +
            k8s_policies.get("namespaced_policies", [])
        )
        
        report = generator.generate_cluster_summary(
            cluster_info=cluster_info,
            policies=all_policies,
            kyverno_status=kyverno_status,
        )
        
        return report
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate cluster summary: {str(e)}"
        )


@router.get("/policy/{policy_id}")
async def get_policy_report(policy_id: int, db: Session = Depends(get_db)):
    """
    Generate a report for a single policy across all deployments.
    """
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    # Get all deployments for this policy
    deployments = db.query(PolicyDeployment).filter(
        PolicyDeployment.policy_id == policy_id
    ).all()
    
    deployment_data = []
    for d in deployments:
        cluster = db.query(Cluster).filter(Cluster.id == d.cluster_id).first()
        deployment_data.append({
            "cluster_id": d.cluster_id,
            "cluster_name": cluster.name if cluster else "Unknown",
            "namespace": d.namespace,
            "status": d.status,
            "deployed_at": d.deployed_at.isoformat() if d.deployed_at else None,
            "error_message": d.error_message,
        })
    
    generator = get_report_generator()
    report = generator.generate_policy_report(
        policy={
            "name": policy.name,
            "category": policy.category,
            "description": policy.description,
        },
        deployments=deployment_data,
    )
    
    return report


@router.get("/compliance/{cluster_id}/markdown")
async def get_compliance_report_markdown(
    cluster_id: int,
    include_passed: bool = True,
    include_failed: bool = True,
    db: Session = Depends(get_db)
):
    """
    Generate a compliance report in Markdown format.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Get deployments
    deployments = db.query(PolicyDeployment).filter(
        PolicyDeployment.cluster_id == cluster_id,
        PolicyDeployment.status == "deployed"
    ).all()
    
    policies = []
    for deployment in deployments:
        policy = db.query(Policy).filter(Policy.id == deployment.policy_id).first()
        if policy:
            policies.append({"name": policy.name})
    
    generator = get_report_generator()
    report = generator.generate_compliance_report(
        cluster_name=cluster.name,
        policies=policies,
        violations=[],
        include_passed=include_passed,
        include_failed=include_failed,
    )
    
    markdown = generator.format_report_as_markdown(report)
    
    return {"markdown": markdown}
