"""
Helm Charts Router

API endpoints for managing Helm chart templates and releases.
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import logging
import yaml

from app.db import get_db
from app.models import HelmChart, HelmRelease, Cluster, AuditLog, ServiceAccountToken
from app.services.auth import get_current_user
from app.services.helm_service import helm_service, HelmError, _helm_installed
from app.schemas import (
    HelmChartCreate,
    HelmChartUpdate,
    HelmChartResponse,
    HelmReleaseCreate,
    HelmReleaseUpdate,
    HelmReleaseResponse,
    HelmDeployRequest,
    HelmDeployResponse,
    HelmMultiDeployRequest,
    HelmMultiDeployResponse,
    HelmUninstallRequest,
    HelmUninstallResponse,
    HelmValidateRequest,
    HelmValidateResponse,
)

router = APIRouter(
    prefix="/helm",
    tags=["helm"],
    dependencies=[Depends(get_current_user)],
)
logger = logging.getLogger(__name__)


def _resolve_kubeconfig(cluster: Cluster, db: Session) -> str | None:
    """
    Return a kubeconfig YAML string for *cluster*.

    Priority:
      1. cluster.kubeconfig_content  (full admin kubeconfig)
      2. Build one from server_url + active ServiceAccountToken  (same pattern as policies.py)
      3. None  — caller must skip real helm operations
    """
    if cluster.kubeconfig_content:
        return cluster.kubeconfig_content

    if not cluster.server_url:
        return None

    sa_token = (
        db.query(ServiceAccountToken)
        .filter(
            ServiceAccountToken.cluster_id == cluster.id,
            ServiceAccountToken.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not sa_token:
        return None

    cluster_cfg: dict = {"server": cluster.server_url, "insecure-skip-tls-verify": not cluster.verify_ssl}
    if cluster.verify_ssl and cluster.ca_cert_data:
        cluster_cfg["certificate-authority-data"] = cluster.ca_cert_data

    return yaml.dump({
        "apiVersion": "v1",
        "kind": "Config",
        "clusters": [{"name": "cluster", "cluster": cluster_cfg}],
        "users": [{"name": "user", "user": {"token": sa_token.token}}],
        "contexts": [{"name": "ctx", "context": {"cluster": "cluster", "user": "user"}}],
        "current-context": "ctx",
    })


def _audit(db: Session, action: str, resource_type: str, resource_id: int | None = None,
           details: dict | None = None, status: str = "success", error_message: str | None = None):
    """Helper to write a single audit-log row."""
    log = AuditLog(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        status=status,
        error_message=error_message,
    )
    db.add(log)
    db.commit()


def _validate_yaml(content: str) -> dict:
    """Basic YAML validation, returns {valid, errors, warnings}."""
    errors: list[str] = []
    warnings: list[str] = []
    try:
        parsed = yaml.safe_load(content)
        if parsed is None:
            errors.append("YAML content is empty")
        elif not isinstance(parsed, dict):
            errors.append("YAML must parse to a mapping (key-value pairs)")
    except yaml.YAMLError as exc:
        errors.append(f"YAML syntax error: {exc}")
    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


# ============ Chart CRUD ============

@router.post("/charts", response_model=HelmChartResponse)
async def create_chart(chart: HelmChartCreate, db: Session = Depends(get_db)):
    """Create a new Helm chart template."""
    # Validate chart YAML
    result = _validate_yaml(chart.chart_yaml)
    if not result["valid"]:
        raise HTTPException(status_code=400, detail={"message": "Invalid Chart.yaml", "errors": result["errors"]})

    if chart.values_yaml:
        vresult = _validate_yaml(chart.values_yaml)
        if not vresult["valid"]:
            raise HTTPException(status_code=400, detail={"message": "Invalid values.yaml", "errors": vresult["errors"]})

    existing = db.query(HelmChart).filter(HelmChart.name == chart.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Helm chart '{chart.name}' already exists.")

    db_chart = HelmChart(**chart.model_dump())
    db.add(db_chart)
    db.commit()
    db.refresh(db_chart)

    _audit(db, "helm_chart_create", "helm_chart", db_chart.id, {"name": db_chart.name})
    return db_chart


@router.get("/charts", response_model=List[HelmChartResponse])
async def list_charts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all Helm chart templates."""
    return db.query(HelmChart).offset(skip).limit(limit).all()


@router.get("/charts/{chart_id}", response_model=HelmChartResponse)
async def get_chart(chart_id: int, db: Session = Depends(get_db)):
    """Get a single Helm chart by ID."""
    chart = db.query(HelmChart).filter(HelmChart.id == chart_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Helm chart not found")
    return chart


@router.put("/charts/{chart_id}", response_model=HelmChartResponse)
async def update_chart(chart_id: int, update: HelmChartUpdate, db: Session = Depends(get_db)):
    """Update an existing Helm chart template."""
    chart = db.query(HelmChart).filter(HelmChart.id == chart_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Helm chart not found")

    update_data = update.model_dump(exclude_unset=True)

    if "chart_yaml" in update_data and update_data["chart_yaml"]:
        result = _validate_yaml(update_data["chart_yaml"])
        if not result["valid"]:
            raise HTTPException(status_code=400, detail={"message": "Invalid Chart.yaml", "errors": result["errors"]})

    if "values_yaml" in update_data and update_data["values_yaml"]:
        result = _validate_yaml(update_data["values_yaml"])
        if not result["valid"]:
            raise HTTPException(status_code=400, detail={"message": "Invalid values.yaml", "errors": result["errors"]})

    for key, value in update_data.items():
        setattr(chart, key, value)

    db.commit()
    db.refresh(chart)

    _audit(db, "helm_chart_update", "helm_chart", chart.id, {"name": chart.name})
    return chart


@router.delete("/charts/{chart_id}")
async def delete_chart(chart_id: int, db: Session = Depends(get_db)):
    """Delete a Helm chart template and all its releases."""
    chart = db.query(HelmChart).filter(HelmChart.id == chart_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Helm chart not found")

    # Check for active releases
    active = db.query(HelmRelease).filter(
        HelmRelease.chart_id == chart_id,
        HelmRelease.status == "deployed",
    ).count()
    if active > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete chart with {active} active release(s). Uninstall them first.",
        )

    chart_name = chart.name
    db.delete(chart)
    db.commit()

    _audit(db, "helm_chart_delete", "helm_chart", chart_id, {"name": chart_name})
    return {"message": f"Helm chart '{chart_name}' deleted"}


# ============ Validate ============

@router.post("/validate", response_model=HelmValidateResponse)
async def validate_yaml(req: HelmValidateRequest):
    """Validate YAML content (Chart.yaml or values.yaml)."""
    result = _validate_yaml(req.yaml_content)
    return HelmValidateResponse(**result)


# ============ Releases CRUD ============

@router.get("/releases", response_model=List[HelmReleaseResponse])
async def list_releases(
    cluster_id: int | None = None,
    chart_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List helm releases, optionally filtered by cluster or chart."""
    q = db.query(HelmRelease)
    if cluster_id is not None:
        q = q.filter(HelmRelease.cluster_id == cluster_id)
    if chart_id is not None:
        q = q.filter(HelmRelease.chart_id == chart_id)
    return q.order_by(HelmRelease.updated_at.desc()).offset(skip).limit(limit).all()


@router.get("/releases/{release_id}", response_model=HelmReleaseResponse)
async def get_release(release_id: int, db: Session = Depends(get_db)):
    """Get a single helm release."""
    release = db.query(HelmRelease).filter(HelmRelease.id == release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Helm release not found")
    return release


@router.put("/releases/{release_id}", response_model=HelmReleaseResponse)
async def update_release(release_id: int, update: HelmReleaseUpdate, db: Session = Depends(get_db)):
    """Update a helm release (e.g. change values, upgrade)."""
    release = db.query(HelmRelease).filter(HelmRelease.id == release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Helm release not found")

    update_data = update.model_dump(exclude_unset=True)

    if "values_yaml" in update_data and update_data["values_yaml"]:
        result = _validate_yaml(update_data["values_yaml"])
        if not result["valid"]:
            raise HTTPException(status_code=400, detail={"message": "Invalid values.yaml", "errors": result["errors"]})

    for key, value in update_data.items():
        setattr(release, key, value)

    release.revision = (release.revision or 1) + 1
    release.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(release)

    _audit(db, "helm_release_update", "helm_release", release.id,
           {"release_name": release.release_name, "namespace": release.namespace})
    return release


# ============ Deploy / Undeploy ============

@router.post("/deploy", response_model=HelmDeployResponse)
async def deploy_release(req: HelmDeployRequest, db: Session = Depends(get_db)):
    """Deploy (install) or upgrade an existing helm release."""
    chart = db.query(HelmChart).filter(HelmChart.id == req.chart_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Helm chart not found")

    cluster = db.query(Cluster).filter(Cluster.id == req.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    # Check for an existing release record (any non-deleted status)
    existing = db.query(HelmRelease).filter(
        HelmRelease.cluster_id == req.cluster_id,
        HelmRelease.release_name == req.release_name,
        HelmRelease.namespace == req.namespace,
    ).first()

    if existing:
        # Upgrade: update the existing record instead of blocking
        existing.chart_id = req.chart_id
        existing.values_yaml = req.values_yaml or chart.values_yaml
        existing.status = "deployed"
        existing.revision = (existing.revision or 1) + 1
        existing.deployed_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        release = existing
        action = "helm_upgrade"
        msg = f"Release '{release.release_name}' upgraded (revision {release.revision}) on {cluster.name}/{release.namespace}"
    else:
        release = HelmRelease(
            chart_id=req.chart_id,
            cluster_id=req.cluster_id,
            release_name=req.release_name,
            namespace=req.namespace,
            values_yaml=req.values_yaml or chart.values_yaml,
            status="deployed",
            revision=1,
            deployed_at=datetime.utcnow(),
        )
        db.add(release)
        db.commit()
        db.refresh(release)
        action = "helm_deploy"
        msg = f"Release '{release.release_name}' deployed to {cluster.name}/{release.namespace}"

    # ── Execute real helm upgrade --install ─────────────────────────────────
    kubeconfig_str = _resolve_kubeconfig(cluster, db)
    if kubeconfig_str:
        try:
            if chart.repo_url and chart.repo_url.startswith("oci://"):
                chart_ref = f"{chart.repo_url.rstrip('/')}/{chart.name}"
                repo_url_for_helm = None
            else:
                chart_ref = chart.name
                repo_url_for_helm = chart.repo_url or None

            helm_result = helm_service.upgrade_install(
                release_name=release.release_name,
                chart_ref=chart_ref,
                namespace=release.namespace,
                kubeconfig=kubeconfig_str,
                context=cluster.context or None,
                values_yaml=release.values_yaml,
                repo_url=repo_url_for_helm,
                version=chart.version or None,
                create_namespace=True,
            )
            release.revision = int(helm_result.get("revision") or release.revision)
            release.status = helm_result.get("status", "deployed")
            release.error_message = None
            db.commit()
            msg = f"{msg} (helm revision {release.revision})"
        except HelmError as exc:
            release.status = "failed"
            release.error_message = exc.detail()
            db.commit()
            _audit(db, "helm_deploy_failed", "helm_release", release.id, {
                "error": exc.detail(), "chart": chart.name, "cluster": cluster.name,
            }, status="failure", error_message=exc.detail())
            raise HTTPException(status_code=502, detail=exc.detail())
    else:
        logger.warning(
            "Cluster '%s' has no kubeconfig or service-account token — DB record saved, real helm skipped",
            cluster.name,
        )

    _audit(db, action, "helm_release", release.id, {
        "chart": chart.name,
        "release_name": release.release_name,
        "namespace": release.namespace,
        "cluster": cluster.name,
        "revision": release.revision,
    })

    return HelmDeployResponse(
        success=True,
        message=msg,
        release_id=release.id,
    )


@router.post("/deploy-multi", response_model=HelmMultiDeployResponse)
async def deploy_multi(req: HelmMultiDeployRequest, db: Session = Depends(get_db)):
    """Deploy a helm chart to multiple namespaces at once."""
    chart = db.query(HelmChart).filter(HelmChart.id == req.chart_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Helm chart not found")

    cluster = db.query(Cluster).filter(Cluster.id == req.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    results = []
    for item in req.releases:
        release_name = item.get("release_name", "")
        namespace = item.get("namespace", "default")
        values_yaml = item.get("values_yaml") or chart.values_yaml

        if not release_name:
            results.append({"release_name": release_name, "namespace": namespace, "success": False,
                            "message": "release_name is required"})
            continue

        # Check duplicate — upgrade if already exists
        existing = db.query(HelmRelease).filter(
            HelmRelease.cluster_id == req.cluster_id,
            HelmRelease.release_name == release_name,
            HelmRelease.namespace == namespace,
        ).first()
        if existing:
            existing.chart_id = req.chart_id
            existing.values_yaml = values_yaml
            existing.status = "deployed"
            existing.revision = (existing.revision or 1) + 1
            existing.deployed_at = datetime.utcnow()
            db.commit()
            db.refresh(existing)
            # Real helm upgrade
            kubeconfig_str = _resolve_kubeconfig(cluster, db)
            if kubeconfig_str:
                try:
                    if chart.repo_url and chart.repo_url.startswith("oci://"):
                        chart_ref = f"{chart.repo_url.rstrip('/')}/{chart.name}"
                        repo_url_for_helm = None
                    else:
                        chart_ref = chart.name
                        repo_url_for_helm = chart.repo_url or None
                    helm_result = helm_service.upgrade_install(
                        release_name=release_name,
                        chart_ref=chart_ref,
                        namespace=namespace,
                        kubeconfig=kubeconfig_str,
                        context=cluster.context or None,
                        values_yaml=values_yaml,
                        repo_url=repo_url_for_helm,
                        version=chart.version or None,
                        create_namespace=True,
                    )
                    existing.revision = int(helm_result.get("revision") or existing.revision)
                    existing.status = helm_result.get("status", "deployed")
                    existing.error_message = None
                    db.commit()
                    results.append({"release_name": release_name, "namespace": namespace,
                                    "success": True, "message": f"Upgraded (helm rev {existing.revision})",
                                    "release_id": existing.id})
                except HelmError as exc:
                    existing.status = "failed"
                    existing.error_message = exc.detail()
                    db.commit()
                    results.append({"release_name": release_name, "namespace": namespace,
                                    "success": False, "message": exc.detail(),
                                    "release_id": existing.id})
            else:
                results.append({"release_name": release_name, "namespace": namespace,
                                "success": True, "message": f"Upgraded (revision {existing.revision})",
                                "release_id": existing.id})
            continue

        release = HelmRelease(
            chart_id=req.chart_id,
            cluster_id=req.cluster_id,
            release_name=release_name,
            namespace=namespace,
            values_yaml=values_yaml,
            status="deployed",
            revision=1,
            deployed_at=datetime.utcnow(),
        )
        db.add(release)
        db.commit()
        db.refresh(release)

        # Real helm install for this release
        kubeconfig_str = _resolve_kubeconfig(cluster, db)
        if kubeconfig_str:
            try:
                if chart.repo_url and chart.repo_url.startswith("oci://"):
                    chart_ref = f"{chart.repo_url.rstrip('/')}/{chart.name}"
                    repo_url_for_helm = None
                else:
                    chart_ref = chart.name
                    repo_url_for_helm = chart.repo_url or None

                helm_result = helm_service.upgrade_install(
                    release_name=release_name,
                    chart_ref=chart_ref,
                    namespace=namespace,
                    kubeconfig=kubeconfig_str,
                    context=cluster.context or None,
                    values_yaml=values_yaml,
                    repo_url=repo_url_for_helm,
                    version=chart.version or None,
                    create_namespace=True,
                )
                release.revision = int(helm_result.get("revision") or release.revision)
                release.status = helm_result.get("status", "deployed")
                release.error_message = None
                db.commit()
                results.append({"release_name": release_name, "namespace": namespace,
                                "success": True, "message": f"Deployed (helm rev {release.revision})",
                                "release_id": release.id})
            except HelmError as exc:
                release.status = "failed"
                release.error_message = exc.detail()
                db.commit()
                results.append({"release_name": release_name, "namespace": namespace,
                                "success": False, "message": exc.detail(),
                                "release_id": release.id})
        else:
            results.append({"release_name": release_name, "namespace": namespace,
                            "success": True, "message": "Deployed (no credentials — DB only)",
                            "release_id": release.id})

    _audit(db, "helm_deploy_multi", "helm_release", None, {
        "chart": chart.name,
        "cluster": cluster.name,
        "count": len(results),
    })

    success_count = sum(1 for r in results if r["success"])
    return HelmMultiDeployResponse(
        success=success_count > 0,
        message=f"{success_count}/{len(results)} releases deployed",
        results=results,
    )


@router.post("/uninstall", response_model=HelmUninstallResponse)
async def uninstall_release(req: HelmUninstallRequest, db: Session = Depends(get_db)):
    """Uninstall (remove) a helm release."""
    release = db.query(HelmRelease).filter(HelmRelease.id == req.release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Helm release not found")

    if release.status == "uninstalled":
        raise HTTPException(status_code=400, detail="Release is already uninstalled")

    release.status = "uninstalled"
    release.updated_at = datetime.utcnow()
    db.commit()

    # ── Execute real helm uninstall ───────────────────────────────────────────
    # Load the cluster separately (avoids lazy-load outside session issues)
    cluster = db.query(Cluster).filter(Cluster.id == release.cluster_id).first()
    kubeconfig_str = _resolve_kubeconfig(cluster, db) if cluster else None
    if kubeconfig_str:
        try:
            helm_service.uninstall(
                release_name=release.release_name,
                namespace=release.namespace,
                kubeconfig=kubeconfig_str,
                context=cluster.context or None,
            )
        except HelmError as exc:
            release.status = "failed"
            release.error_message = exc.detail()
            db.commit()
            _audit(db, "helm_uninstall_failed", "helm_release", release.id, {
                "error": exc.detail()
            }, status="failure", error_message=exc.detail())
            raise HTTPException(status_code=502, detail=exc.detail())

    _audit(db, "helm_uninstall", "helm_release", release.id, {
        "release_name": release.release_name,
        "namespace": release.namespace,
    })

    return HelmUninstallResponse(
        success=True,
        message=f"Release '{release.release_name}' uninstalled",
    )


# ============ Helm binary availability check ============

@router.get("/available")
async def check_helm_available():
    """Check whether the helm binary is installed on the server."""
    available = _helm_installed()
    return {
        "available": available,
        "message": "Helm 3 is available" if available else "Helm binary not found on server PATH",
    }


@router.delete("/releases/{release_id}")
async def delete_release(release_id: int, db: Session = Depends(get_db)):
    """Permanently delete a helm release record."""
    release = db.query(HelmRelease).filter(HelmRelease.id == release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Helm release not found")

    if release.status == "deployed":
        raise HTTPException(status_code=400, detail="Cannot delete an active release. Uninstall it first.")

    name = release.release_name
    db.delete(release)
    db.commit()

    _audit(db, "helm_release_delete", "helm_release", release_id, {"release_name": name})
    return {"message": f"Release '{name}' deleted"}
