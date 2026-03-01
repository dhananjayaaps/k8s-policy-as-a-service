# Service Account Token Management Guide

## Overview

Instead of storing full admin kubeconfig credentials, use **Service Account Tokens** with limited RBAC permissions. This is More secure, easier to rotate, and follows Kubernetes best practices.

## Why Service Account Tokens?

### ❌ Problems with Full Kubeconfig:
- Contains admin-level credentials
- Hard to rotate without breaking access
- Same credentials for all users/applications
- Full cluster access (security risk)

### ✅ Benefits of Service Account Tokens:
- **Limited Permissions**: Use RBAC to grant only needed access
- **Easy Rotation**: Create new tokens without changing service account
- **Multi-User**: Different tokens for different users/apps
- **Auditable**: Track which service account performed actions
- **Secure**: Tokens can expire, kubeconfigs typically don't

## Architecture

```
Your Application
    ↓ (SSH to remote server)
Azure VM (172.203.224.237)
    ↓ (create service account + token)
Kubernetes Cluster (192.168.49.2:8443)
    ↓ (token stored in database)
Database
    ↓ (use token for operations)
Kubernetes API (with limited RBAC permissions)
```

## Quick Start

### Step 1: SSH Connect to Your VM

```bash
curl -X POST http://localhost:8000/clusters/ssh/connect \
  -H "Content-Type: application/json" \
  -d '{
    "host": "172.203.224.237",
    "username": "azureuser",
    "pem_key_content": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
  }'
```

### Step 2: Create Service Account with Token

```bash
curl -X POST http://localhost:8000/clusters/1/serviceaccount \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-api-user",
    "namespace": "default",
    "role_type": "view",
    "description": "Read-only access for monitoring",
    "duration": "87600h"
  }'
```

**Response:**
```json
{
  "id": 1,
  "cluster_id": 1,
  "name": "my-api-user",
  "namespace": "default",
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Imh...",
  "role_type": "view",
  "role_name": null,
  "description": "Read-only access for monitoring",
  "expires_at": "2036-02-28T15:09:38Z",
  "is_active": true,
  "created_at": "2026-02-28T15:09:38Z"
}
```

### Step 3: Connect Using the Token

```bash
curl -X POST http://localhost:8000/clusters/1/serviceaccount/1/connect
```

**That's it!** You're now connected with limited RBAC permissions.

## API Endpoints

### 1. Create Service Account with Token

**`POST /clusters/{cluster_id}/serviceaccount`**

Creates a service account on the remote cluster and stores the token.

**Request:**
```json
{
  "name": "my-api-user",
  "namespace": "default",
  "role_type": "view",
  "role_name": null,
  "description": "Read-only access",
  "duration": "87600h"
}
```

**Role Types:**
- `view` - Read-only access to most resources
- `edit` - Read/write access (create, update, delete resources)
- `admin` - Full access except RBAC management
- `cluster-admin` - Full cluster access (use carefully!)
- `custom` - Use custom ClusterRole (specify `role_name`)

**Durations:**
- `24h` - 1 day
- `168h` - 1 week
- `720h` - 30 days
- `8760h` - 1 year
- `87600h` - 10 years (default)

**Response:**
```json
{
  "id": 1,
  "cluster_id": 1,
  "name": "my-api-user",
  "namespace": "default",
  "token": "eyJhbGc...",
  "role_type": "view",
  "expires_at": "2036-02-28T15:09:38Z",
  "is_active": true,
  "created_at": "2026-02-28T15:09:38Z"
}
```

### 2. List Service Accounts

**`GET /clusters/{cluster_id}/serviceaccounts`**

List all service account tokens for a cluster.

**Response:**
```json
[
  {
    "id": 1,
    "cluster_id": 1,
    "name": "my-api-user",
    "token": "eyJhbGc...",
    "role_type": "view",
    "expires_at": "2036-02-28T15:09:38Z",
    "is_active": true
  },
  {
    "id": 2,
    "cluster_id": 1,
    "name": "admin-user",
    "token": "eyJhbGc...",
    "role_type": "admin",
    "expires_at": "2027-02-28T15:09:38Z",
    "is_active": true
  }
]
```

### 3. Connect with Saved Token

**`POST /clusters/{cluster_id}/serviceaccount/{sa_id}/connect`**

Connect to cluster using a previously created service account token.

**Response:**
```json
{
  "success": true,
  "message": "Connected using service account 'my-api-user' with view role",
  "cluster_info": {
    "kubernetes_version": "v1.28.3",
    "node_count": 1
  },
  "namespaces": ["default", "kube-system", "kyverno"]
}
```

### 4. Connect with Custom Token

**`POST /clusters/connect-with-token`**

Connect using a token from external source (not stored in database).

**Request:**
```json
{
  "server_url": "https://192.168.49.2:8443",
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Imh...",
  "ca_cert_data": "LS0tLS1CRUdJTi...",
  "verify_ssl": true
}
```

### 5. Delete Service Account Token

**`DELETE /clusters/{cluster_id}/serviceaccount/{sa_id}`**

Remove token from database (soft delete - marks as inactive).

**Response:**
```json
{
  "message": "Service account token 'my-api-user' deleted"
}
```

## Complete Workflow Example

### PowerShell Script

```powershell
$API_URL = "http://localhost:8000"
$CLUSTER_ID = 1

# 1. SSH Connect (do this once)
$PEM_KEY = Get-Content "~\.ssh\azure-key.pem" -Raw
$sshConnect = @{
    host = "172.203.224.237"
    username = "azureuser"
    pem_key_content = $PEM_KEY
} | ConvertTo-Json

Invoke-RestMethod -Uri "$API_URL/clusters/ssh/connect" `
    -Method Post `
    -ContentType "application/json" `
    -Body $sshConnect

Write-Host "✅ SSH Connected"

# 2. Create Service Account (read-only)
$createSA = @{
    name = "monitoring-user"
    namespace = "default"
    role_type = "view"
    description = "Read-only for monitoring dashboard"
    duration = "8760h"
} | ConvertTo-Json

$saResponse = Invoke-RestMethod -Uri "$API_URL/clusters/$CLUSTER_ID/serviceaccount" `
    -Method Post `
    -ContentType "application/json" `
    -Body $createSA

Write-Host "✅ Service Account Created: ID $($saResponse.id)"

# 3. Connect using the service account
$connectResp = Invoke-RestMethod -Uri "$API_URL/clusters/$CLUSTER_ID/serviceaccount/$($saResponse.id)/connect" `
    -Method Post

Write-Host "✅ Connected with service account: $($connectResp.message)"

# 4. Now you can use other APIs with limited permissions
$namespaces = Invoke-RestMethod -Uri "$API_URL/clusters/namespaces"
Write-Host "Found $($namespaces.count) namespaces"

# 5. List all service accounts for this cluster
$allSAs = Invoke-RestMethod -Uri "$API_URL/clusters/$CLUSTER_ID/serviceaccounts"
Write-Host "Total service accounts: $($allSAs.count)"

foreach ($sa in $allSAs) {
    Write-Host "  - $($sa.name) ($($sa.role_type))"
}
```

### Bash Script

```bash
#!/bin/bash

API_URL="http://localhost:8000"
CLUSTER_ID=1
PEM_KEY=$(cat ~/.ssh/azure-key.pem)

# 1. SSH Connect
echo "Connecting via SSH..."
curl -s -X POST "$API_URL/clusters/ssh/connect" \
  -H "Content-Type: application/json" \
  -d "{
    \"host\": \"172.203.224.237\",
    \"username\": \"azureuser\",
    \"pem_key_content\": $(echo "$PEM_KEY" | jq -Rs .)
  }" | jq .

# 2. Create Service Account
echo "Creating service account..."
SA_RESPONSE=$(curl -s -X POST "$API_URL/clusters/$CLUSTER_ID/serviceaccount" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "monitoring-user",
    "namespace": "default",
    "role_type": "view",
    "description": "Read-only monitoring access",
    "duration": "8760h"
  }')

echo "$SA_RESPONSE" | jq .

SA_ID=$(echo "$SA_RESPONSE" | jq -r '.id')

# 3. Connect using the service account
echo "Connecting with service account..."
curl -s -X POST "$API_URL/clusters/$CLUSTER_ID/serviceaccount/$SA_ID/connect" | jq .

# 4. List namespaces (with limited permissions)
echo "Listing namespaces..."
curl -s "$API_URL/clusters/namespaces" | jq .

#5. List all service accounts
echo "All service accounts:"
curl -s "$API_URL/clusters/$CLUSTER_ID/serviceaccounts" | jq .
```

## RBAC Permissions by Role Type

### `view` (Read-Only)
- ✅ Get, list, watch most resources
- ✅ View logs
- ✅ Execute commands in pods (read-only)
- ❌ Create, update, delete resources
- ❌ View secrets

**Use for:** Monitoring, dashboards, read-only operations

### `edit` (Read-Write)
- ✅ Everything in `view`
- ✅ Create, update, delete most resources
- ✅ View and edit secrets
- ❌ Manage RBAC (roles, bindings)
- ❌ Manage nodes

**Use for:** Application deployments, CI/CD pipelines

### `admin` (Namespace Admin)
- ✅ Everything in `edit`
- ✅ Manage RBAC within namespace
- ✅ View and edit resource quotas
- ❌ Cluster-wide operations
- ❌ Manage nodes

**Use for:** Namespace administrators

### `cluster-admin` (Full Access)
- ✅ Full cluster access
- ✅ All operations on all resources
- ⚠️ **Use sparingly!**

**Use for:** Cluster administrators only

### `custom` (Custom Role)
- Define your own ClusterRole with specific permissions
- Example: Deploy only to specific namespace, read secrets but not edit them, etc.

## Custom RBAC Example

Create a custom role for deploying only Kyverno policies:

```bash
# On your VM (via SSH)
kubectl create clusterrole kyverno-policy-manager \
  --verb=get,list,watch,create,update,delete \
  --resource=clusterpolicies,policies

# Then use API
curl -X POST http://localhost:8000/clusters/1/serviceaccount \
  -H "Content-Type: application/json" \
  -d '{
    "name": "kyverno-manager",
    "namespace": "kyverno",
    "role_type": "custom",
    "role_name": "kyverno-policy-manager",
    "duration": "8760h"
  }'
```

## Token Rotation

### Why Rotate Tokens?
- Security best practice
- Comply with security policies
- Remove compromised tokens
- Update permissions

### How to Rotate:

```bash
# 1. Create new service account with same permissions
curl -X POST http://localhost:8000/clusters/1/serviceaccount \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-api-user-v2",
    "namespace": "default",
    "role_type": "view",
    "duration": "8760h"
  }'

# 2. Test new token
curl -X POST http://localhost:8000/clusters/1/serviceaccount/2/connect

# 3. Update your application to use new token ID

# 4. Delete old token
curl -X DELETE http://localhost:8000/clusters/1/serviceaccount/1
```

## Security Best Practices

### ✅ DO:
1. **Use least privilege**: Start with `view`, only escalate if needed
2. **Set expiration**: Use reasonable token duration (1 year max for production)
3. **Rotate regularly**: Every 90 days for production
4. **One token per application**: Don't share tokens
5. **Monitor usage**: Check audit logs for suspicious activity
6. **Delete unused tokens**: Clean up old tokens

### ❌ DON'T:
1. **Don't use `cluster-admin`** unless absolutely necessary
2. **Don't commit tokens** to Git
3. **Don't share tokens** between teams
4. **Don't use same token** for dev and production
5. **Don't skip expiration**: Always set reasonable duration

## Troubleshooting

### Token Expired

**Error:** `Token has expired. Create a new token.`

**Solution:** Create a new service account token:
```bash
curl -X POST http://localhost:8000/clusters/1/serviceaccount \
  -H "Content-Type: application/json" \
  -d '{"name": "my-user-new", "namespace": "default", "role_type": "view", "duration": "8760h"}'
```

### Permission Denied

**Error:** `forbidden: User "system:serviceaccount:default:my-api-user" cannot ...`

**Solution:** The service account doesn't have required permissions. Create new one with higher role:
```bash
curl -X POST http://localhost:8000/clusters/1/serviceaccount \
  -H "Content-Type: application/json" \
  -d '{"name": "my-user-edit", "namespace": "default", "role_type": "edit", "duration": "8760h"}'
```

### SSH Not Connected

**Error:** `Not connected to any server. Call /ssh/connect first.`

**Solution:** Establish SSH connection first:
```bash
curl -X POST http://localhost:8000/clusters/ssh/connect \
  -H "Content-Type: application/json" \
  -d '{"host": "172.203.224.237", "username": "azureuser", "pem_key_content": "..."}'
```

## Comparison: Kubeconfig vs Token

| Feature | Full Kubeconfig | Service Account Token |
|---------|----------------|----------------------|
| **Security** | ❌ Often admin-level | ✅ Limited RBAC |
| **Rotation** | ❌ Complex | ✅ Easy |
| **Expiration** | ❌ Usually none | ✅ Configurable |
| **Multi-User** | ❌ Same for all | ✅ Different per user |
| **Audit Trail** | ❌ Hard to track | ✅ Per service account |
| **Portability** | ✅ Works anywhere | ✅ Works anywhere |
| **Setup** | ✅ Simple | ⚠️ Requires RBAC knowledge |

## Migration Path

### From Kubeconfig to Tokens:

1. **Audit current access**: What permissions do you need?
2. **Create service account**: With appropriate role
3. **Test with new token**: Verify all operations work
4. **Update applications**: Use new token
5. **Remove kubeconfig**: From database (optional, keep as backup)

### Example Migration:

```bash
# Step 1: Check what permissions you're using
# (review audit logs or application needs)

# Step 2: Create appropriate service account
curl -X POST http://localhost:8000/clusters/1/serviceaccount \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app-deploy-user",
    "namespace": "default",
    "role_type": "edit",
    "description": "For application deployments",
    "duration": "8760h"
  }'

# Step 3: Test deployment with new token
curl -X POST http://localhost:8000/clusters/1/serviceaccount/1/connect

# Step 4: Deploy test application
# (verify it works with new permissions)

# Step 5: Update production to use token
# (update your deployment scripts/configs)

# Step 6: Monitor for issues
# (check audit logs for permission errors)
```

## Advanced: Multiple Service Accounts Strategy

```bash
# Read-only for monitoring
curl -X POST http://localhost:8000/clusters/1/serviceaccount \
  -d '{"name": "monitoring", "role_type": "view", "duration": "8760h"}'

# Deploy applications
curl -X POST http://localhost:8000/clusters/1/serviceaccount \
  -d '{"name": "ci-cd-deploy", "role_type": "edit", "duration": "2160h"}'

# Manage Kyverno policies
curl -X POST http://localhost:8000/clusters/1/serviceaccount \
  -d '{"name": "kyverno-admin", "role_type": "custom", "role_name": "kyverno-policy-manager", "duration": "8760h"}'

# Emergency admin access (short duration!)
curl -X POST http://localhost:8000/clusters/1/serviceaccount \
  -d '{"name": "emergency-admin", "role_type": "admin", "duration": "24h"}'
```

## Next Steps

1. **Install dependencies**: `pip install -r requirements.txt`
2. **Run migrations**: Database schema updated automatically
3. **SSH connect**: To your Kubernetes VM
4. **Create first service account**: Start with `view` role
5. **Test connection**: Verify it works
6. **Deploy with token**: Use in your applications
7. **Monitor & rotate**: Regular security maintenance

## Documentation

- Swagger UI: http://localhost:8000/docs
- Kubernetes RBAC: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
- Service Account Tokens: https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/

This approach is **production-ready** and follows Kubernetes security best practices! 🔒
