# Kyverno Management API Documentation

Complete API reference for managing Kubernetes clusters and Kyverno policies with multi-user session support.

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Quick Start](#quick-start)
- [SSH Connection Management](#ssh-connection-management)
- [Cluster Setup Workflow](#cluster-setup-workflow)
- [Cluster Management](#cluster-management)
- [Kyverno Operations](#kyverno-operations)
- [Service Account Management](#service-account-management)
- [Policy Management](#policy-management)
- [Session Management](#session-management)
- [Error Handling](#error-handling)

---

## Overview

This API provides comprehensive management of Kubernetes clusters and Kyverno policy deployments with:
- **Multi-user session support** - Isolated sessions for concurrent users
- **SSH-based cluster access** - Connect to remote clusters via SSH
- **Token-based authentication** - Secure service account token management
- **Automated Kyverno installation** - Deploy Kyverno via Helm
- **Policy lifecycle management** - Deploy, update, and remove Kyverno policies

**Base URL:** `http://localhost:8001`

---

## Authentication

Currently, the API uses session-based authentication for SSH and Kubernetes connections. Each user receives unique session IDs that must be included in subsequent requests.

---

## Quick Start

### Complete Cluster Setup (Recommended)

For the fastest way to set up a cluster with Kyverno:

```bash
# 1. Connect via SSH
curl -X POST http://localhost:8001/clusters/ssh/connect \
  -H "Content-Type: application/json" \
  -d '{
    "host": "192.168.1.100",
    "username": "ubuntu",
    "pem_key_content": "-----BEGIN RSA PRIVATE KEY-----\n...",
    "port": 22
  }'
# Response: {"success": true, "session_id": "abc-123-...", "host": "192.168.1.100"}

# 2. Complete cluster setup (creates SA, token, saves to DB, installs Kyverno)
curl -X POST http://localhost:8001/clusters/setup \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "abc-123-...",
    "cluster_name": "production-cluster",
    "cluster_description": "Production K8s cluster",
    "service_account_name": "kyverno-admin",
    "namespace": "kyverno",
    "role_type": "cluster-admin",
    "install_kyverno": true,
    "kyverno_namespace": "kyverno"
  }'
# Response: Complete cluster details with token and Kyverno status

# 3. Disconnect SSH (cleanup)
curl -X POST "http://localhost:8001/clusters/ssh/disconnect?session_id=abc-123-..."
```

**That's it!** Your cluster is now ready with a service account token saved in the database.

---

## SSH Connection Management

### Connect to Remote Server

Establish an SSH connection to a remote server where Kubernetes is running.

**Endpoint:** `POST /clusters/ssh/connect`

**Request Body:**
```json
{
  "host": "192.168.1.100",
  "username": "ubuntu",
  "pem_key_content": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----",
  "password": null,
  "port": 22
}
```

**Note:** Provide either `pem_key_content` OR `password`, not both.

**Response:**
```json
{
  "success": true,
  "message": "Successfully connected to ubuntu@192.168.1.100",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "host": "192.168.1.100"
}
```

**Important:** Save the `session_id` - you'll need it for all subsequent SSH operations.

---

### Execute Remote Command

Execute a command on the connected remote server.

**Endpoint:** `POST /clusters/ssh/execute`

**Request Body:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "command": "kubectl get nodes",
  "timeout": 60
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "NAME           STATUS   ROLES           AGE   VERSION\nnode1          Ready    control-plane   10d   v1.28.0\n",
  "stderr": "",
  "exit_code": 0
}
```

---

### Get Kubeconfig from Remote Server

Retrieve kubeconfig from the remote server for local use.

**Endpoint:** `POST /clusters/ssh/kubeconfig`

**Request Body:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "kubeconfig_path": "~/.kube/config",
  "portable": true,
  "context": null
}
```

**Parameters:**
- `portable`: If `true`, returns kubeconfig with embedded certificates (recommended)
- `context`: Specific Kubernetes context to export (optional)

**Response:**
```json
{
  "success": true,
  "kubeconfig_content": "apiVersion: v1\nkind: Config\nclusters:\n...",
  "message": "Successfully retrieved kubeconfig from remote server"
}
```

---

### Check Minikube Status

Check if Minikube is running on the remote server.

**Endpoint:** `GET /clusters/ssh/minikube-status?session_id={session_id}`

**Response:**
```json
{
  "running": true,
  "status": {
    "Host": "Running",
    "Kubelet": "Running",
    "APIServer": "Running"
  }
}
```

---

### Disconnect SSH Session

Close the SSH connection and clean up the session.

**Endpoint:** `POST /clusters/ssh/disconnect?session_id={session_id}`

**Response:**
```json
{
  "success": true,
  "message": "Disconnected session 550e8400-e29b-41d4-a716-446655440000"
}
```

---

### Check SSH Connection Status

Verify if an SSH session is still active.

**Endpoint:** `GET /clusters/ssh/status?session_id={session_id}`

**Response:**
```json
{
  "connected": true,
  "host": "192.168.1.100",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### List All Active SSH Sessions

View all active SSH sessions (useful for monitoring).

**Endpoint:** `GET /clusters/ssh/sessions`

**Response:**
```json
{
  "sessions": {
    "550e8400-e29b-41d4-a716-446655440000": {
      "host": "192.168.1.100",
      "connected": true,
      "created_at": "2026-03-01T10:30:00",
      "age_minutes": 15.5
    }
  },
  "count": 1
}
```

---

## Cluster Setup Workflow

### Complete Cluster Setup (Recommended)

One-stop endpoint that sets up everything: service account, token, database entry, and optional Kyverno installation.

**Endpoint:** `POST /clusters/setup`

**Request Body:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "cluster_name": "production-cluster",
  "cluster_description": "Production Kubernetes cluster",
  "service_account_name": "kyverno-admin",
  "namespace": "kyverno",
  "role_type": "cluster-admin",
  "install_kyverno": true,
  "kyverno_namespace": "kyverno"
}
```

**Parameters:**
- `session_id`: Active SSH session ID (required)
- `cluster_name`: Unique name for the cluster (required)
- `cluster_description`: Optional description
- `service_account_name`: Name for the service account (default: "kyverno-admin")
- `namespace`: Namespace for service account (default: "kyverno")
- `role_type`: RBAC role - "view", "edit", "admin", "cluster-admin", "custom" (default: "cluster-admin")
- `install_kyverno`: Whether to install Kyverno (default: false)
- `kyverno_namespace`: Namespace for Kyverno (default: "kyverno")

**Response:**
```json
{
  "success": true,
  "message": "Cluster 'production-cluster' set up successfully",
  "cluster_id": 1,
  "cluster_name": "production-cluster",
  "host": "192.168.1.100",
  "server_url": "https://192.168.1.100:6443",
  "service_account_id": 1,
  "service_account_name": "kyverno-admin",
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ik...",
  "kyverno_installed": true,
  "kyverno_message": "Kyverno installed successfully"
}
```

**What This Does:**
1. ✅ Creates service account with token on remote cluster
2. ✅ Saves cluster to database with public IP
3. ✅ Saves service account token to database
4. ✅ Optionally installs Kyverno via Helm
5. ✅ Creates audit logs for all operations

**Benefits:**
- Single API call for complete setup
- Token saved for future use (no SSH needed later)
- Multi-user safe with session isolation
- Automated Kyverno installation

---

### Manual Step-by-Step Setup

If you prefer manual control:

#### Step 1: Create Service Account

**Endpoint:** `POST /clusters/{cluster_id}/serviceaccount`

**Request Body:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "kyverno-admin",
  "namespace": "kyverno",
  "role_type": "cluster-admin",
  "description": "Admin service account for Kyverno",
  "duration": "87600h"
}
```

**Response:** Service account details with token

---

## Cluster Management

### Connect to Cluster via Kubeconfig

Connect to a Kubernetes cluster using kubeconfig content.

**Endpoint:** `POST /clusters/connect`

**Request Body:**
```json
{
  "kubeconfig_content": "apiVersion: v1\nkind: Config\n...",
  "context": null
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully connected to cluster. Found 8 namespaces.",
  "cluster_info": {
    "server": "https://192.168.1.100:6443",
    "version": "v1.28.0"
  },
  "namespaces": ["default", "kube-system", "kyverno"]
}
```

---

### Connect via Service Account Token

Connect using a saved service account token (no kubeconfig needed).

**Endpoint:** `POST /clusters/connect-with-token`

**Request Body:**
```json
{
  "server_url": "https://192.168.1.100:6443",
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ik...",
  "ca_cert_data": "LS0tLS1CRUdJTiBDRVJUSUZ...",
  "verify_ssl": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully connected using service account token. Found 8 namespaces.",
  "cluster_info": {
    "server": "https://192.168.1.100:6443",
    "version": "v1.28.0"
  },
  "namespaces": ["default", "kube-system", "kyverno"]
}
```

---

### List Namespaces

Get all namespaces in the connected cluster.

**Endpoint:** `GET /clusters/namespaces`

**Response:**
```json
{
  "namespaces": ["default", "kube-system", "kyverno", "monitoring"],
  "count": 4
}
```

---

### Get Cluster Info

Get information about the currently connected cluster.

**Endpoint:** `GET /clusters/info`

**Response:**
```json
{
  "server": "https://192.168.1.100:6443",
  "version": "v1.28.0",
  "context": "minikube"
}
```

---

### List Service Accounts for Cluster

Get all service account tokens stored for a cluster.

**Endpoint:** `GET /clusters/{cluster_id}/serviceaccounts`

**Response:**
```json
[
  {
    "id": 1,
    "cluster_id": 1,
    "name": "kyverno-admin",
    "namespace": "kyverno",
    "token": "eyJhbGciOiJSUzI1NiIs...",
    "role_type": "cluster-admin",
    "description": "Admin service account",
    "expires_at": null,
    "is_active": true,
    "created_at": "2026-03-01T10:00:00"
  }
]
```

---

## Kyverno Operations

### Check Kyverno Status

Get comprehensive Kyverno installation status.

**Endpoint:** `GET /clusters/kyverno/status`

**Response:**
```json
{
  "installed": true,
  "helm_deployed": true,
  "release_name": "kyverno",
  "namespace": "kyverno",
  "chart_version": "3.1.0",
  "app_version": "v1.11.0",
  "deployment_status": "deployed",
  "pods_ready": true,
  "api_resources_available": true,
  "webhook_configured": true,
  "details": {
    "pods": [
      {
        "name": "kyverno-6c8f8d4b9d-abc12",
        "ready": "1/1",
        "status": "Running"
      }
    ]
  }
}
```

---

### Install Kyverno via SSH

Install Kyverno on a remote cluster via SSH and Helm.

**Endpoint:** `POST /clusters/ssh/kyverno/install`

**Request Body:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "namespace": "kyverno",
  "release_name": "kyverno",
  "create_namespace": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Kyverno installed successfully on remote server",
  "release_name": "kyverno",
  "namespace": "kyverno",
  "output": "NAME: kyverno\nLAST DEPLOYED: ...\nSTATUS: deployed\n..."
}
```

---

### Install Kyverno via Saved Token

Install Kyverno using a saved service account token (no SSH needed).

**Endpoint:** `POST /clusters/{cluster_id}/install-kyverno`

**Request Body:**
```json
{
  "cluster_id": 1,
  "service_account_id": 1,
  "namespace": "kyverno",
  "release_name": "kyverno",
  "create_namespace": true
}
```

**Parameters:**
- `service_account_id`: Optional - uses first active token if not provided

**Response:**
```json
{
  "success": true,
  "message": "Kyverno installed successfully on cluster 'production-cluster'",
  "release_name": "kyverno",
  "namespace": "kyverno",
  "output": "Helm installation output..."
}
```

**Benefits:**
- No SSH connection required
- Can be executed from anywhere
- Uses saved credentials from database
- Independent per cluster

---

### Uninstall Kyverno

Remove Kyverno from the cluster.

**Endpoint:** `POST /clusters/kyverno/uninstall`

**Request Body:**
```json
{
  "namespace": "kyverno",
  "release_name": "kyverno",
  "purge": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Kyverno uninstalled successfully",
  "output": "release \"kyverno\" uninstalled"
}
```

---

## Service Account Management

### Create Service Account with Token

Create a service account with a token on a remote cluster.

**Endpoint:** `POST /clusters/{cluster_id}/serviceaccount`

**Request Body:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "deployment-manager",
  "namespace": "production",
  "role_type": "edit",
  "role_name": null,
  "description": "Service account for deployment management",
  "duration": "87600h"
}
```

**Role Types:**
- `view` - Read-only access
- `edit` - Create, update, delete resources
- `admin` - Full access within namespace
- `cluster-admin` - Full cluster access
- `custom` - Use custom role (provide `role_name`)

**Duration Examples:**
- `24h` - 24 hours
- `168h` - 1 week
- `8760h` - 1 year
- `87600h` - 10 years (default)

**Response:**
```json
{
  "id": 2,
  "cluster_id": 1,
  "name": "deployment-manager",
  "namespace": "production",
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ik...",
  "role_type": "edit",
  "description": "Service account for deployment management",
  "expires_at": "2036-03-01T10:00:00",
  "is_active": true,
  "created_at": "2026-03-01T10:00:00"
}
```

---

## Policy Management

### List Policies

Get all available Kyverno policy templates.

**Endpoint:** `GET /policies`

**Response:**
```json
[
  {
    "id": 1,
    "name": "require-labels",
    "category": "best-practices",
    "description": "Require specific labels on all resources",
    "yaml_template": "apiVersion: kyverno.io/v1\nkind: ClusterPolicy\n...",
    "created_at": "2026-03-01T09:00:00"
  }
]
```

---

### Deploy Policy

Deploy a policy to a cluster.

**Endpoint:** `POST /policies/{policy_id}/deploy`

**Request Body:**
```json
{
  "cluster_id": 1,
  "namespace": "default",
  "parameters": {
    "required_labels": ["app", "env", "owner"]
  }
}
```

**Response:**
```json
{
  "id": 1,
  "policy_id": 1,
  "cluster_id": 1,
  "namespace": "default",
  "status": "deployed",
  "deployed_at": "2026-03-01T11:00:00"
}
```

---

## Session Management

### Session Timeouts

- **SSH Sessions:** 30 minutes of inactivity
- **K8s Sessions:** 60 minutes of inactivity

Sessions are automatically cleaned up upon expiration.

### Best Practices

1. **Save session IDs** immediately after connection
2. **Disconnect explicitly** when done to free resources
3. **Use the /setup endpoint** for production deployments
4. **Store tokens securely** - they provide cluster access
5. **Monitor active sessions** using `/ssh/sessions`

---

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "detail": "SSH session not found: 550e8400-e29b-41d4-a716-446655440000"
}
```

#### 404 Not Found
```json
{
  "detail": "Cluster not found"
}
```

#### 500 Internal Server Error
```json
{
  "detail": "Failed to connect via SSH: Connection refused"
}
```

### Error Codes

| Status | Meaning | Common Causes |
|--------|---------|---------------|
| 400 | Bad Request | Invalid session ID, missing required fields |
| 401 | Unauthorized | Invalid token or credentials |
| 404 | Not Found | Resource doesn't exist |
| 500 | Internal Server Error | Connection issues, remote command failures |

---

## Complete Example Workflow

Here's a complete example of setting up a cluster and deploying a policy:

```bash
#!/bin/bash

API_URL="http://localhost:8001"

# 1. Connect to remote server via SSH
echo "Connecting to remote server..."
SSH_RESPONSE=$(curl -s -X POST "$API_URL/clusters/ssh/connect" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "192.168.1.100",
    "username": "ubuntu",
    "pem_key_content": "'"$(cat ~/.ssh/id_rsa)"'",
    "port": 22
  }')

SESSION_ID=$(echo $SSH_RESPONSE | jq -r '.session_id')
echo "SSH Session ID: $SESSION_ID"

# 2. Complete cluster setup with Kyverno installation
echo "Setting up cluster..."
SETUP_RESPONSE=$(curl -s -X POST "$API_URL/clusters/setup" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'"$SESSION_ID"'",
    "cluster_name": "prod-cluster-1",
    "cluster_description": "Production cluster 1",
    "service_account_name": "kyverno-admin",
    "namespace": "kyverno",
    "role_type": "cluster-admin",
    "install_kyverno": true,
    "kyverno_namespace": "kyverno"
  }')

CLUSTER_ID=$(echo $SETUP_RESPONSE | jq -r '.cluster_id')
TOKEN=$(echo $SETUP_RESPONSE | jq -r '.token')
echo "Cluster ID: $CLUSTER_ID"
echo "Token saved to database"

# 3. Verify Kyverno status
echo "Checking Kyverno status..."
curl -s "$API_URL/clusters/kyverno/status" | jq '.'

# 4. Deploy a policy
echo "Deploying policy..."
curl -s -X POST "$API_URL/policies/1/deploy" \
  -H "Content-Type: application/json" \
  -d '{
    "cluster_id": '"$CLUSTER_ID"',
    "namespace": "default",
    "parameters": {}
  }' | jq '.'

# 5. Disconnect SSH
echo "Disconnecting SSH..."
curl -s -X POST "$API_URL/clusters/ssh/disconnect?session_id=$SESSION_ID"

echo "Setup complete!"
```

---

## Additional Resources

- **Kyverno Documentation:** https://kyverno.io/docs/
- **Kubernetes API Reference:** https://kubernetes.io/docs/reference/
- **Helm Documentation:** https://helm.sh/docs/

---

## Support

For issues or questions:
1. Check the audit logs in the database
2. Verify SSH/K8s session status
3. Review error messages for specific details
4. Ensure tokens haven't expired

---

**Last Updated:** March 1, 2026
**API Version:** 1.0
