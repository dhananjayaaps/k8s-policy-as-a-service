"""
Clusters Router

API endpoints for managing Kubernetes cluster connections.
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List

from app.db import get_db
from app.models import Cluster, AuditLog
from app.schemas import (
    ClusterCreate,
    ClusterUpdate,
    ClusterResponse,
    ClusterConnectRequest,
    ClusterConnectResponse,
    NamespaceListResponse,
)
from app.services.k8s_connector import get_k8s_connector, K8sConnector

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.post("/connect", response_model=ClusterConnectResponse)
async def connect_cluster(request: ClusterConnectRequest):
    """
    Connect to a Kubernetes cluster and verify connectivity.
    
    This endpoint:
    1. Loads the kubeconfig from the specified path
    2. Connects to the cluster
    3. Lists namespaces to verify connectivity
    4. Returns cluster info and namespace list
    """
    connector = get_k8s_connector()
    
    try:
        # Load cluster configuration
        connector.load_cluster(
            kubeconfig_path=request.kubeconfig_path,
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
        
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=404,
            detail=f"Kubeconfig file not found: {request.kubeconfig_path}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect to cluster: {str(e)}"
        )


@router.get("/namespaces", response_model=NamespaceListResponse)
async def list_namespaces():
    """
    List all namespaces in the currently connected cluster.
    """
    connector = get_k8s_connector()
    
    try:
        namespaces = connector.list_namespaces()
        return NamespaceListResponse(
            namespaces=namespaces,
            count=len(namespaces)
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list namespaces: {str(e)}"
        )


@router.get("/info")
async def get_cluster_info():
    """
    Get information about the currently connected cluster.
    """
    connector = get_k8s_connector()
    
    try:
        info = connector.get_cluster_info()
        return info
    except RuntimeError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get cluster info: {str(e)}"
        )


@router.get("/kyverno-status")
async def check_kyverno_status():
    """
    Check if Kyverno is installed in the connected cluster.
    """
    connector = get_k8s_connector()
    
    try:
        is_installed, version = connector.check_kyverno_installed()
        return {
            "installed": is_installed,
            "version": version,
            "message": f"Kyverno {'is installed' if is_installed else 'is not installed'}"
                       + (f" (version {version})" if version else "")
        }
    except RuntimeError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check Kyverno status: {str(e)}"
        )


@router.post("/disconnect")
async def disconnect_cluster():
    """
    Disconnect from the currently connected cluster.
    """
    connector = get_k8s_connector()
    connector.disconnect()
    return {"message": "Disconnected from cluster"}


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
        connector.load_cluster(
            kubeconfig_path=cluster.kubeconfig_path,
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
