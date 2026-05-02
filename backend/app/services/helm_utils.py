"""
Shared Helm binary resolution utilities.

Used by both helm_service.py and k8s_connector.py so the probing logic
lives in one place. Resolves the helm binary once at import time and
exposes helpers for callers.
"""

import logging
import os
import shutil
import subprocess
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Well-known install locations to probe when PATH is empty (e.g. systemd service)
HELM_SEARCH_PATHS = [
    "/usr/local/bin/helm",
    "/usr/bin/helm",
    "/snap/bin/helm",
    os.path.expanduser("~/bin/helm"),
    os.path.expanduser("~/.local/bin/helm"),
]


def find_helm() -> Optional[str]:
    """Return the absolute path to the helm binary, or None if not found."""
    # Prefer shutil.which (respects current PATH)
    found = shutil.which("helm")
    if found:
        return found
    # Fall back to well-known install locations
    for path in HELM_SEARCH_PATHS:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return None


# Resolved once at import time; callers can fall back to find_helm() if needed.
HELM_BIN: Optional[str] = find_helm()
if HELM_BIN:
    logger.info("helm_utils: helm binary resolved to: %s", HELM_BIN)
else:
    logger.warning("helm_utils: helm binary not found at import time; will re-check on each call.")


def get_helm_bin() -> str:
    """
    Return the absolute helm binary path.

    Raises
    ------
    RuntimeError
        If helm is not found anywhere on the system.
    """
    helm = HELM_BIN or find_helm()
    if not helm:
        raise RuntimeError(
            "Helm binary not found. "
            "Install Helm 3 on the backend server: "
            "curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"
        )
    return helm


def helm_installed() -> bool:
    """Return True if helm is reachable and responds to 'helm version'."""
    helm = HELM_BIN or find_helm()
    if not helm:
        return False
    try:
        result = subprocess.run(
            [helm, "version", "--short"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, PermissionError):
        return False


def get_stable_kyverno_values() -> Dict[str, Any]:
    """
    Return recommended stable Helm values for Kyverno installation.

    These values include:
    - Single replica for admission controller (stable in development/test)
    - ClusterIP service (no external exposure needed)
    - Resource requests/limits for predictable resource usage
    - Webhook timeout configuration for reliability
    - Webhook cleanup enablement

    Returns:
        Dictionary of Helm values suitable for kyverno/kyverno chart
    """
    return {
        "admissionController": {
            "replicas": 1,
            "service": {
                "type": "ClusterIP"
            },
            "resources": {
                "requests": {
                    "cpu": "100m",
                    "memory": "128Mi"
                },
                "limits": {
                    "cpu": "500m",
                    "memory": "512Mi"
                }
            }
        },
        "webhooksCleanup": {
            "enabled": True
        },
        "config": {
            "webhookTimeoutSeconds": 30
        }
    }
