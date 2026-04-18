"""
Shared cluster utility functions used across routers.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session
import yaml

from app.models import ServiceAccountToken


def resolve_cluster_kubeconfig(cluster, db: Session) -> str:
    """
    Resolve kubeconfig content for a cluster.
    Tries service-account token first, then falls back to stored kubeconfig_content.
    Returns the kubeconfig YAML string.
    Raises HTTPException if no credentials are available.
    """
    # Try service account token first
    sa_token = db.query(ServiceAccountToken).filter(
        ServiceAccountToken.cluster_id == cluster.id,
        ServiceAccountToken.is_active == True
    ).first()

    if sa_token and cluster.server_url:
        cluster_cfg = {
            "server": cluster.server_url,
            "insecure-skip-tls-verify": not cluster.verify_ssl,
        }
        if cluster.verify_ssl and cluster.ca_cert_data:
            cluster_cfg["certificate-authority-data"] = cluster.ca_cert_data

        return yaml.dump({
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [{"name": "cluster", "cluster": cluster_cfg}],
            "users": [{"name": "user", "user": {"token": sa_token.token}}],
            "contexts": [{"name": "context", "context": {"cluster": "cluster", "user": "user"}}],
            "current-context": "context",
        })

    # Fall back to stored kubeconfig_content
    if cluster.kubeconfig_content:
        return cluster.kubeconfig_content

    raise HTTPException(
        status_code=400,
        detail="Cluster has no credentials. Add a service account token or kubeconfig."
    )
