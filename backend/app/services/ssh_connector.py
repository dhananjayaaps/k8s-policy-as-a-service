"""
SSH Connector Service

Handles SSH connections to remote servers for executing commands.
"""

import paramiko
import io
import logging
from typing import Optional, Dict, Any, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)


class SSHConnector:
    """
    SSH connector for executing commands on remote servers.
    """
    
    def __init__(self):
        self._client: Optional[paramiko.SSHClient] = None
        self._connected_host: Optional[str] = None
    
    def connect(
        self,
        host: str,
        username: str,
        pem_key_content: Optional[str] = None,
        password: Optional[str] = None,
        port: int = 22,
        timeout: int = 30
    ) -> bool:
        """
        Connect to a remote server via SSH.
        
        Args:
            host: Server IP or hostname
            username: SSH username
            pem_key_content: PEM private key content (string)
            password: SSH password (if not using key)
            port: SSH port (default: 22)
            timeout: Connection timeout in seconds
            
        Returns:
            True if connection successful
            
        Raises:
            paramiko.SSHException: If connection fails
            ValueError: If neither key nor password provided
        """
        if not pem_key_content and not password:
            raise ValueError("Either pem_key_content or password must be provided")
        
        # Close existing connection if any
        self.disconnect()
        
        try:
            self._client = paramiko.SSHClient()
            self._client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            # Connect with key or password
            if pem_key_content:
                # Load private key from string
                key_file = io.StringIO(pem_key_content)
                try:
                    pkey = paramiko.RSAKey.from_private_key(key_file)
                except paramiko.ssh_exception.SSHException:
                    # Try other key types
                    key_file.seek(0)
                    try:
                        pkey = paramiko.Ed25519Key.from_private_key(key_file)
                    except paramiko.ssh_exception.SSHException:
                        key_file.seek(0)
                        pkey = paramiko.ECDSAKey.from_private_key(key_file)
                
                self._client.connect(
                    hostname=host,
                    port=port,
                    username=username,
                    pkey=pkey,
                    timeout=timeout,
                    look_for_keys=False,
                    allow_agent=False
                )
            else:
                self._client.connect(
                    hostname=host,
                    port=port,
                    username=username,
                    password=password,
                    timeout=timeout,
                    look_for_keys=False,
                    allow_agent=False
                )
            
            self._connected_host = host
            logger.info(f"Successfully connected to {username}@{host}:{port}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to {host}: {str(e)}")
            raise
    
    def execute_command(
        self,
        command: str,
        timeout: Optional[int] = 60,
        get_pty: bool = False
    ) -> Tuple[str, str, int]:
        """
        Execute a command on the remote server.
        
        Args:
            command: Command to execute
            timeout: Command timeout in seconds
            get_pty: Whether to request a pseudo-terminal
            
        Returns:
            Tuple of (stdout, stderr, exit_code)
            
        Raises:
            RuntimeError: If not connected to a server
        """
        if not self._client:
            raise RuntimeError("Not connected to any server. Call connect() first.")
        
        try:
            logger.info(f"Executing command: {command[:100]}...")
            
            stdin, stdout, stderr = self._client.exec_command(
                command,
                timeout=timeout,
                get_pty=get_pty
            )
            
            # Read output
            stdout_output = stdout.read().decode('utf-8')
            stderr_output = stderr.read().decode('utf-8')
            exit_code = stdout.channel.recv_exit_status()
            
            logger.info(f"Command exit code: {exit_code}")
            
            return stdout_output, stderr_output, exit_code
            
        except Exception as e:
            logger.error(f"Failed to execute command: {str(e)}")
            raise
    
    def execute_kubectl_command(
        self,
        kubectl_args: str,
        kubeconfig_path: str = "~/.kube/config",
        timeout: int = 60
    ) -> Tuple[str, str, int]:
        """
        Execute a kubectl command on the remote server.
        
        Args:
            kubectl_args: kubectl command arguments (e.g., "get pods -n kyverno")
            kubeconfig_path: Path to kubeconfig on remote server
            timeout: Command timeout in seconds
            
        Returns:
            Tuple of (stdout, stderr, exit_code)
        """
        command = f"kubectl --kubeconfig={kubeconfig_path} {kubectl_args}"
        return self.execute_command(command, timeout=timeout)
    
    def get_kubeconfig_content(
        self,
        kubeconfig_path: str = "~/.kube/config"
    ) -> str:
        """
        Read kubeconfig file from remote server.
        
        Args:
            kubeconfig_path: Path to kubeconfig on remote server
            
        Returns:
            Kubeconfig content as string
        """
        stdout, stderr, exit_code = self.execute_command(f"cat {kubeconfig_path}")
        
        if exit_code != 0:
            raise RuntimeError(f"Failed to read kubeconfig: {stderr}")
        
        return stdout
    
    def get_portable_kubeconfig(
        self,
        context: Optional[str] = None
    ) -> str:
        """
        Get portable kubeconfig with embedded certificates from remote server.
        
        Args:
            context: Kubernetes context to export (None for current)
            
        Returns:
            Portable kubeconfig content
        """
        context_arg = f"--context={context}" if context else ""
        command = f"kubectl config view --raw --flatten --minify {context_arg}"
        
        stdout, stderr, exit_code = self.execute_command(command)
        
        if exit_code != 0:
            raise RuntimeError(f"Failed to get portable kubeconfig: {stderr}")
        
        return stdout
    
    def check_minikube_status(self) -> Dict[str, Any]:
        """
        Check Minikube status on remote server.
        
        Returns:
            Dictionary with Minikube status information
        """
        stdout, stderr, exit_code = self.execute_command("minikube status --format=json", timeout=30)
        
        if exit_code != 0:
            return {
                "running": False,
                "error": stderr or "Minikube not running or not installed"
            }
        
        import json
        try:
            status = json.loads(stdout)
            return {
                "running": True,
                "status": status
            }
        except json.JSONDecodeError:
            return {
                "running": False,
                "error": "Failed to parse Minikube status"
            }
    
    def install_kyverno_remote(
        self,
        namespace: str = "kyverno",
        release_name: str = "kyverno",
        create_namespace: bool = True
    ) -> Tuple[str, str, int]:
        """
        Install Kyverno via Helm on remote server.
        
        Args:
            namespace: Kubernetes namespace
            release_name: Helm release name
            create_namespace: Create namespace if it doesn't exist
            
        Returns:
            Tuple of (stdout, stderr, exit_code)
        """
        commands = [
            "helm repo add kyverno https://kyverno.github.io/kyverno/",
            "helm repo update",
            f"helm install {release_name} kyverno/kyverno "
            f"-n {namespace} "
            f"{'--create-namespace' if create_namespace else ''} "
            f"--wait --timeout=5m"
        ]
        
        full_command = " && ".join(commands)
        return self.execute_command(full_command, timeout=360)
    
    def create_service_account_with_token(
        self,
        name: str,
        namespace: str = "default",
        role_type: str = "view",
        role_name: Optional[str] = None,
        duration: str = "87600h"
    ) -> Dict[str, Any]:
        """
        Create a service account with token and RBAC binding on remote server.
        
        Args:
            name: ServiceAccount name
            namespace: Namespace for service account
            role_type: Role type (view, edit, admin, cluster-admin, custom)
            role_name: Custom role name (if role_type is 'custom')
            duration: Token duration (e.g., 24h, 87600h)
            
        Returns:
            Dictionary with token, server_url, and ca_cert
        """
        commands = []
        
        # Create namespace if needed (suppress output with >/dev/null)
        commands.append(f"kubectl create namespace {namespace} --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1")
        
        # Create service account (suppress output)
        commands.append(f"kubectl create serviceaccount {name} -n {namespace} --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1")
        
        # Create role binding based on role_type (suppress output)
        binding_name = f"{name}-binding"
        if role_type == "custom" and role_name:
            commands.append(
                f"kubectl create clusterrolebinding {binding_name} "
                f"--clusterrole={role_name} "
                f"--serviceaccount={namespace}:{name} "
                f"--dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1"
            )
        elif role_type in ["view", "edit", "admin", "cluster-admin"]:
            commands.append(
                f"kubectl create clusterrolebinding {binding_name} "
                f"--clusterrole={role_type} "
                f"--serviceaccount={namespace}:{name} "
                f"--dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1"
            )
        
        # Echo separator to clearly mark start of output we care about
        commands.append('echo "---SA_TOKEN_START---"')
        
        # Create token with duration - ensure it ends with newline
        commands.append(f"kubectl create token {name} -n {namespace} --duration={duration} && echo")
        
        # Get server URL - ensure it ends with newline
        commands.append("kubectl cluster-info | grep 'Kubernetes control plane' | awk '{print $NF}' && echo")
        
        # Get CA certificate - ensure it ends with newline
        commands.append("kubectl config view --raw --minify --flatten -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' && echo")
        
        full_command = " && ".join(commands)
        
        try:
            stdout, stderr, exit_code = self.execute_command(full_command, timeout=60)
            
            if exit_code != 0:
                error_msg = stderr if stderr else stdout
                
                # Provide more specific error messages
                if "no route to host" in error_msg.lower() or "connection refused" in error_msg.lower():
                    raise RuntimeError(
                        f"Cannot connect to Kubernetes API server. The cluster may not be running. "
                        f"Error: {error_msg}"
                    )
                elif "unable to connect" in error_msg.lower():
                    raise RuntimeError(
                        f"Unable to connect to Kubernetes cluster. Ensure kubectl is configured and the cluster is accessible. "
                        f"Error: {error_msg}"
                    )
                else:
                    raise RuntimeError(f"Failed to create service account: {error_msg}")
            
            # Parse output: find the separator and get the 3 lines after it
            lines = stdout.strip().split('\n')
            
            # Find the separator line
            try:
                separator_index = lines.index("---SA_TOKEN_START---")
                # Get all lines after the separator and filter out empty lines
                all_lines_after = lines[separator_index + 1:]
                relevant_lines = [line.strip() for line in all_lines_after if line.strip()]
                
                if len(relevant_lines) < 3:
                    raise RuntimeError(
                        f"Unexpected output when creating service account. "
                        f"Expected 3 non-empty lines after separator (token, server_url, ca_cert), got {len(relevant_lines)}. "
                        f"Lines found: {relevant_lines}. "
                        f"Full output: {stdout}"
                    )
                
                token = relevant_lines[0].strip()
                server_url = relevant_lines[1].strip()
                ca_cert = relevant_lines[2].strip()
                
                # Validate the outputs
                if not token or len(token) < 50:  # JWT tokens are much longer
                    raise RuntimeError(
                        f"Invalid token received (too short or empty). "
                        f"Token: '{token}'. Full output: {stdout}"
                    )
                
                if not server_url.startswith("https://"):
                    raise RuntimeError(
                        f"Invalid server URL received (should start with https://). "
                        f"Server URL: '{server_url}'. Full output: {stdout}"
                    )
                
                if not ca_cert or len(ca_cert) < 50:  # Base64 CA certs are long
                    raise RuntimeError(
                        f"Invalid CA certificate received (too short or empty). "
                        f"CA cert: '{ca_cert}'. Full output: {stdout}"
                    )
                
            except ValueError:
                # Separator not found - fallback to old logic but with better error
                raise RuntimeError(
                    f"Could not find output separator in command output. "
                    f"This indicates a command execution issue. "
                    f"Full output: {stdout}"
                )
            
            return {
                "token": token,
                "server_url": server_url,
                "ca_cert_data": ca_cert
            }
            
        except Exception as e:
            logger.error(f"Failed to create service account: {str(e)}")
            raise
    
    def get_cluster_info_for_token(self) -> Dict[str, str]:
        """
        Get cluster server URL and CA certificate for token-based auth.
        
        Returns:
            Dictionary with server_url and ca_cert_data
        """
        commands = [
            "kubectl cluster-info | grep 'Kubernetes control plane' | awk '{print $NF}'",
            "kubectl config view --raw --minify --flatten -o jsonpath='{.clusters[0].cluster.certificate-authority-data}'"
        ]
        
        full_command = " && ".join(commands)
        stdout, stderr, exit_code = self.execute_command(full_command, timeout=30)
        
        if exit_code != 0:
            raise RuntimeError(f"Failed to get cluster info: {stderr}")
        
        lines = stdout.strip().split('\n')
        
        return {
            "server_url": lines[0].strip(),
            "ca_cert_data": lines[1].strip() if len(lines) > 1 else ""
        }
    
    def disconnect(self):
        """Close SSH connection."""
        if self._client:
            try:
                self._client.close()
                logger.info(f"Disconnected from {self._connected_host}")
            except Exception as e:
                logger.warning(f"Error closing SSH connection: {e}")
            finally:
                self._client = None
                self._connected_host = None
    
    def is_connected(self) -> bool:
        """Check if currently connected to a server."""
        if not self._client:
            return False
        
        try:
            transport = self._client.get_transport()
            return transport is not None and transport.is_active()
        except:
            return False
    
    def get_connected_host(self) -> Optional[str]:
        """Get the currently connected host."""
        return self._connected_host if self.is_connected() else None
    
    def __del__(self):
        """Destructor to ensure connection is closed."""
        self.disconnect()


# Session-based SSH connection management
import uuid
from datetime import datetime, timedelta

# Store SSH connectors by session ID with timestamp
_ssh_sessions: Dict[str, Tuple[SSHConnector, datetime]] = {}

# Session timeout in minutes
SESSION_TIMEOUT_MINUTES = 30


def create_ssh_session() -> Tuple[str, SSHConnector]:
    """
    Create a new SSH session.
    
    Returns:
        Tuple of (session_id, SSHConnector instance)
    """
    session_id = str(uuid.uuid4())
    connector = SSHConnector()
    _ssh_sessions[session_id] = (connector, datetime.now())
    logger.info(f"Created SSH session: {session_id}")
    return session_id, connector


def get_ssh_session(session_id: str) -> SSHConnector:
    """
    Get SSH connector for a specific session.
    
    Args:
        session_id: The session identifier
        
    Returns:
        SSHConnector instance for the session
        
    Raises:
        ValueError: If session not found or expired
    """
    if session_id not in _ssh_sessions:
        raise ValueError(f"SSH session not found: {session_id}")
    
    connector, created_at = _ssh_sessions[session_id]
    
    # Check if session has expired
    if datetime.now() - created_at > timedelta(minutes=SESSION_TIMEOUT_MINUTES):
        # Clean up expired session
        connector.disconnect()
        del _ssh_sessions[session_id]
        raise ValueError(f"SSH session expired: {session_id}")
    
    # Update last access time
    _ssh_sessions[session_id] = (connector, datetime.now())
    
    return connector


def close_ssh_session(session_id: str) -> bool:
    """
    Close and remove an SSH session.
    
    Args:
        session_id: The session identifier
        
    Returns:
        True if session was closed, False if not found
    """
    if session_id not in _ssh_sessions:
        return False
    
    connector, _ = _ssh_sessions[session_id]
    connector.disconnect()
    del _ssh_sessions[session_id]
    logger.info(f"Closed SSH session: {session_id}")
    return True


def cleanup_expired_sessions():
    """Remove all expired SSH sessions."""
    expired_sessions = []
    
    for session_id, (connector, created_at) in _ssh_sessions.items():
        if datetime.now() - created_at > timedelta(minutes=SESSION_TIMEOUT_MINUTES):
            expired_sessions.append(session_id)
    
    for session_id in expired_sessions:
        connector, _ = _ssh_sessions[session_id]
        connector.disconnect()
        del _ssh_sessions[session_id]
        logger.info(f"Cleaned up expired SSH session: {session_id}")
    
    return len(expired_sessions)


def list_active_sessions() -> Dict[str, Dict[str, Any]]:
    """
    List all active SSH sessions.
    
    Returns:
        Dictionary mapping session_id to session info
    """
    return {
        session_id: {
            "host": connector.get_connected_host(),
            "connected": connector.is_connected(),
            "created_at": created_at.isoformat(),
            "age_minutes": (datetime.now() - created_at).total_seconds() / 60
        }
        for session_id, (connector, created_at) in _ssh_sessions.items()
    }


# Legacy support - deprecated
_ssh_connector: Optional[SSHConnector] = None


def get_ssh_connector() -> SSHConnector:
    """
    Get or create the global SSH connector instance.
    
    DEPRECATED: Use create_ssh_session() and get_ssh_session() instead
    for multi-user support.
    """
    global _ssh_connector
    if _ssh_connector is None:
        _ssh_connector = SSHConnector()
    return _ssh_connector


def reset_ssh_connector():
    """Reset the global SSH connector (for testing)."""
    global _ssh_connector
    if _ssh_connector:
        _ssh_connector.disconnect()
    _ssh_connector = None
