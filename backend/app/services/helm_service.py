"""
Helm Service

Executes real `helm upgrade --install` / `helm uninstall` commands against
a Kubernetes cluster using a temporary kubeconfig written to disk.

All operations are idempotent:
  - install / upgrade → `helm upgrade --install --create-namespace`
  - uninstall         → `helm uninstall` (succeeds even if release not present)
"""

import json
import logging
import os
import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from typing import Any, Dict, Optional

import yaml

logger = logging.getLogger(__name__)

# ── Timeout constants ─────────────────────────────────────────────────────────
HELM_TIMEOUT = "10m0s"   # passed to helm --timeout
SUBPROCESS_TIMEOUT = 660  # subprocess hard-kill timeout (seconds)

# ── Helm binary resolution ────────────────────────────────────────────────────
# When running as a systemd service the process PATH may be empty, so bare
# "helm" is not resolvable. We probe well-known locations at import time.
_HELM_SEARCH_PATHS = [
    "/usr/local/bin/helm",
    "/usr/bin/helm",
    "/snap/bin/helm",
    os.path.expanduser("~/bin/helm"),
    os.path.expanduser("~/.local/bin/helm"),
]

def _find_helm() -> str | None:
    found = shutil.which("helm")
    if found:
        return found
    for path in _HELM_SEARCH_PATHS:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return None

_HELM_BIN: str | None = _find_helm()
if _HELM_BIN:
    logger.info("helm_service: helm resolved to %s", _HELM_BIN)
else:
    logger.warning("helm_service: helm binary not found at import time")


class HelmError(RuntimeError):
    """Raised when a Helm command fails."""

    def __init__(self, message: str, stdout: str = "", stderr: str = ""):
        super().__init__(message)
        self.stdout = stdout
        self.stderr = stderr

    def detail(self) -> str:
        parts = [str(self)]
        if self.stderr:
            parts.append(f"stderr: {self.stderr.strip()}")
        if self.stdout:
            parts.append(f"stdout: {self.stdout.strip()}")
        return "\n".join(parts)


# ── Context manager for temp files ────────────────────────────────────────────

@contextmanager
def _temp_file(content: str, suffix: str = ".yaml"):
    """Write *content* to a temp file, yield its path, then delete it."""
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "w") as fh:
            fh.write(content)
        yield path
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


# ── Helpers ───────────────────────────────────────────────────────────────────

def _run(cmd: list[str], timeout: int = SUBPROCESS_TIMEOUT) -> subprocess.CompletedProcess:
    """Run *cmd* and return the CompletedProcess. Raises HelmError on non-zero exit."""
    logger.debug("helm cmd: %s", " ".join(cmd))
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise HelmError(
            f"Helm command failed (exit {result.returncode})",
            stdout=result.stdout,
            stderr=result.stderr,
        )
    return result


def _helm_installed() -> bool:
    helm = _HELM_BIN or _find_helm()
    if not helm:
        return False
    try:
        r = subprocess.run(
            [helm, "version", "--short"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return r.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, PermissionError):
        return False


def _helm_bin() -> str:
    """Return the absolute helm path, or raise HelmError with install instructions."""
    helm = _HELM_BIN or _find_helm()
    if not helm:
        raise HelmError(
            "Helm 3 is not installed on the backend server. "
            "Install it with: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"
        )
    return helm


def _base_cmd(kubeconfig: str, context: str | None) -> list[str]:
    """Return the common helm flags for every command."""
    cmd = [_helm_bin(), "--kubeconfig", kubeconfig]
    if context:
        cmd += ["--kube-context", context]
    return cmd


# ── Main service ──────────────────────────────────────────────────────────────

class HelmService:
    """
    Stateless service – every method receives a kubeconfig string and
    optional context so it can be called from any request handler without
    a persistent connection object.
    """

    # ── Pre-flight ────────────────────────────────────────────────────────────

    @staticmethod
    def assert_helm_available() -> None:
        _helm_bin()  # raises HelmError with install instructions if not found

    # ── Install / Upgrade ─────────────────────────────────────────────────────

    def upgrade_install(
        self,
        *,
        release_name: str,
        chart_ref: str,           # e.g. "bitnami/nginx" or local path or OCI ref
        namespace: str,
        kubeconfig: str,
        context: Optional[str] = None,
        values_yaml: Optional[str] = None,
        repo_url: Optional[str] = None,
        version: Optional[str] = None,
        create_namespace: bool = True,
        atomic: bool = False,
        wait: bool = False,
    ) -> Dict[str, Any]:
        """
        Run `helm upgrade --install` for *release_name*.

        Parameters
        ----------
        chart_ref   : Chart reference. Can be:
                        - "repo/chartname"   (requires repo_url to be added first)
                        - OCI ref:  "oci://registry/repo/chart"
                        - A local path (not typical for this UI, but supported)
        repo_url    : If provided, `helm repo add` is run before install.
        values_yaml : Raw YAML string written to a temp file and passed via -f.
        atomic      : Roll back on failure.
        wait        : Wait until all pods are Running before returning.
        """
        self.assert_helm_available()

        with _temp_file(kubeconfig, suffix=".yaml") as kube_path:
            base = _base_cmd(kube_path, context)

            # ── Add / update repo if necessary ────────────────────────────
            if repo_url and not chart_ref.startswith("oci://"):
                repo_alias = release_name.replace("/", "-")  # unique alias
                try:
                    _run(base + ["repo", "add", repo_alias, repo_url])
                except HelmError:
                    pass  # "already exists" is fine
                try:
                    _run(base + ["repo", "update"])
                except HelmError:
                    pass  # non-fatal

                # Rewrite chart_ref to use the alias
                chart_name = chart_ref.split("/")[-1] if "/" in chart_ref else chart_ref
                chart_ref = f"{repo_alias}/{chart_name}"

            # ── Build upgrade --install command ───────────────────────────
            cmd = base + [
                "upgrade", "--install", release_name, chart_ref,
                "--namespace", namespace,
                "--timeout", HELM_TIMEOUT,
                "--output", "json",
            ]

            if create_namespace:
                cmd.append("--create-namespace")
            if atomic:
                cmd.append("--atomic")
            if wait:
                cmd.append("--wait")
            if version:
                cmd += ["--version", version]

            # Write values to a temp file
            if values_yaml and values_yaml.strip():
                with _temp_file(values_yaml, suffix=".yaml") as val_path:
                    cmd += ["-f", val_path]
                    result = _run(cmd)
            else:
                result = _run(cmd)

            # Parse JSON output from helm
            try:
                info = json.loads(result.stdout)
            except json.JSONDecodeError:
                info = {"raw": result.stdout}

            revision = info.get("version") or info.get("revision") or "?"
            status = info.get("info", {}).get("status", "deployed")

            return {
                "success": True,
                "release_name": release_name,
                "namespace": namespace,
                "revision": revision,
                "status": status,
                "output": result.stdout,
            }

    # ── Uninstall ─────────────────────────────────────────────────────────────

    def uninstall(
        self,
        *,
        release_name: str,
        namespace: str,
        kubeconfig: str,
        context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run `helm uninstall`. Tolerates 'release not found'."""
        self.assert_helm_available()

        with _temp_file(kubeconfig, suffix=".yaml") as kube_path:
            base = _base_cmd(kube_path, context)
            cmd = base + [
                "uninstall", release_name,
                "--namespace", namespace,
                "--timeout", HELM_TIMEOUT,
            ]
            try:
                result = _run(cmd)
                return {
                    "success": True,
                    "release_name": release_name,
                    "namespace": namespace,
                    "output": result.stdout,
                }
            except HelmError as exc:
                # Not an error if it was already gone
                combined = (exc.stderr + exc.stdout).lower()
                if "not found" in combined or "release: not found" in combined:
                    return {
                        "success": True,
                        "release_name": release_name,
                        "namespace": namespace,
                        "output": "Release was not present on cluster.",
                    }
                raise

    # ── Status ────────────────────────────────────────────────────────────────

    def get_status(
        self,
        *,
        release_name: str,
        namespace: str,
        kubeconfig: str,
        context: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Return parsed `helm status` JSON, or None if not found."""
        if not _helm_installed():
            return None

        with _temp_file(kubeconfig, suffix=".yaml") as kube_path:
            base = _base_cmd(kube_path, context)
            cmd = base + [
                "status", release_name,
                "--namespace", namespace,
                "--output", "json",
            ]
            try:
                result = _run(cmd)
                return json.loads(result.stdout)
            except (HelmError, json.JSONDecodeError):
                return None

    # ── List ──────────────────────────────────────────────────────────────────

    def list_releases(
        self,
        *,
        namespace: Optional[str] = None,
        kubeconfig: str,
        context: Optional[str] = None,
    ) -> list[Dict[str, Any]]:
        """Return list of all releases in *namespace* (all namespaces if None)."""
        if not _helm_installed():
            return []

        with _temp_file(kubeconfig, suffix=".yaml") as kube_path:
            base = _base_cmd(kube_path, context)
            cmd = base + ["list", "--output", "json"]
            if namespace:
                cmd += ["--namespace", namespace]
            else:
                cmd.append("--all-namespaces")
            try:
                result = _run(cmd, timeout=30)
                return json.loads(result.stdout) or []
            except (HelmError, json.JSONDecodeError):
                return []


# ── Module-level singleton ────────────────────────────────────────────────────

helm_service = HelmService()
