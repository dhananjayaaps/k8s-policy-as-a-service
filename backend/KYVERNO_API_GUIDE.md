# Kyverno Cluster Management API Guide

## Overview

This guide explains how to connect to Kubernetes clusters, manage cluster connections, install Kyverno, and check Kyverno status using the API.

## Prerequisites

- **Helm 3.x** must be installed on the system where the backend is running
- Valid kubeconfig content (YAML) with access to your Kubernetes cluster
- Python dependencies installed from `requirements.txt`

## Important: Kubeconfig Security

The API stores kubeconfig **content** (YAML) in the database instead of file paths. This approach:
- ✅ Works across different machines and users
- ✅ Ensures portability (no file path dependencies)
- ✅ Allows users to connect from anywhere
- ⚠️ **Security**: Ensure the database is properly secured with encryption at rest
- ⚠️ **Access Control**: Limit API access to authorized users only

## API Endpoints

### 1. Connect to a Cluster

#### Option A: Connect with Kubeconfig Content (No Persistence)

```http
POST /clusters/connect
Content-Type: application/json

{
  "kubeconfig_content": "apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://kubernetes.default.svc\n    certificate-authority-data: LS0tLS...\n  name: my-cluster\ncontexts:\n- context:\n    cluster: my-cluster\n    user: my-user\n  name: my-context\ncurrent-context: my-context\nusers:\n- name: my-user\n  user:\n    token: eyJhbGc...\n",
  "context": "optional-context-name"
}
```

**Getting Kubeconfig Content:**

You can get your kubeconfig content in several ways:

1. From default kubeconfig:
   ```bash
   cat ~/.kube/config
   ```

2. From a specific file:
   ```bash
   cat /path/to/your/kubeconfig
   ```

3. Export current context:
   ```bash
   kubectl config view --raw --minify
   ```

4. From cloud providers:
   - **AWS EKS**: `aws eks update-kubeconfig --name cluster-name --dry-run`
   - **GKE**: `gcloud container clusters get-credentials cluster-name --region us-central1 --dry-run`
   - **AKS**: `az aks get-credentials --resource-group rg --name cluster --file -`

**Response:**
```json
{
  "success": true,
  "message": "Successfully connected to cluster. Found 5 namespaces.",
  "cluster_info": {
    "kubernetes_version": "v1.28.0",
    "platform": "linux/amd64",
    "node_count": 3,
    "nodes": [
      {"name": "node-1", "status": "Ready"},
      {"name": "node-2", "status": "Ready"}
    ],
    "kubeconfig": "/path/to/your/kubeconfig",
    "context": "my-context"
  },
  "namespaces": ["default", "kube-system", "kyverno", "..."]
}
```

#### Option B: Save Cluster Config and Connect

**Step 1: Save cluster configuration to database**

```http
POST /clusters
Content-Type: application/json

{
  "name": "production-cluster",
  "kubeconfig_content": "apiVersion: v1\nkind: Config\n...",
  "context": "prod-context",
  "description": "Production Kubernetes cluster"
}
```

**Note**: The `kubeconfig_content` should be the YAML content as a string (with escaped newlines in JSON).

**Step 2: Connect to saved cluster**

```http
POST /clusters/{cluster_id}/connect
```

**Step 3: List all saved clusters**

```http
GET /clusters
```

### 2. Check Kyverno Installation Status

#### Simple Check (Legacy)

```http
GET /clusters/kyverno-status
```

**Response:**
```json
{
  "installed": true,
  "version": "v1.11.0",
  "message": "Kyverno is installed (version v1.11.0)"
}
```

#### Comprehensive Status Check (Recommended)

```http
GET /clusters/kyverno/status
```

**Response:**
```json
{
  "installed": true,
  "version": "v1.11.0",
  "namespace": "kyverno",
  "deployment_status": {
    "kyverno": {
      "ready_replicas": 3,
      "replicas": 3,
      "available": 3
    },
    "kyverno-cleanup-controller": {
      "ready_replicas": 1,
      "replicas": 1,
      "available": 1
    }
  },
  "helm_release": {
    "name": "kyverno",
    "namespace": "kyverno",
    "status": "deployed",
    "version": "kyverno-3.1.0"
  },
  "api_resources_available": true,
  "webhooks_configured": true
}
```

**Status Fields Explained:**
- `installed`: Whether Kyverno is detected in the cluster
- `version`: Kyverno version (from container image)
- `namespace`: Namespace where Kyverno is installed
- `deployment_status`: Status of each Kyverno deployment
- `helm_release`: Helm release information (if installed via Helm)
- `api_resources_available`: Whether Kyverno CRDs are installed
- `webhooks_configured`: Whether admission webhooks are configured

### 3. Install Kyverno via Helm

```http
POST /clusters/kyverno/install
Content-Type: application/json

{
  "namespace": "kyverno",
  "release_name": "kyverno",
  "create_namespace": true,
  "values": {
    "replicaCount": 3,
    "resources": {
      "limits": {
        "memory": "384Mi"
      },
      "requests": {
        "memory": "128Mi",
        "cpu": "100m"
      }
    }
  }
}
```

**Parameters:**
- `namespace` (default: "kyverno"): Target namespace for installation
- `release_name` (default: "kyverno"): Helm release name
- `create_namespace` (default: true): Create namespace if it doesn't exist
- `values` (optional): Custom Helm values to override defaults

**Response:**
```json
{
  "success": true,
  "message": "Kyverno installed successfully in namespace 'kyverno'",
  "release_name": "kyverno",
  "namespace": "kyverno",
  "output": "NAME: kyverno\nLAST DEPLOYED: ...\nNAMESPACE: kyverno\nSTATUS: deployed\n..."
}
```

**Common Custom Values:**

```json
{
  "values": {
    "replicaCount": 3,
    "podSecurityStandard": "restricted",
    "admissionController": {
      "replicas": 3
    },
    "backgroundController": {
      "enabled": true
    },
    "cleanupController": {
      "enabled": true
    }
  }
}
```

### 4. Uninstall Kyverno

```http
POST /clusters/kyverno/uninstall
Content-Type: application/json

{
  "release_name": "kyverno",
  "namespace": "kyverno"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Kyverno uninstalled successfully from namespace 'kyverno'",
  "output": "release \"kyverno\" uninstalled"
}
```

**Note:** This removes Kyverno deployments and services, but CRDs and existing policies may remain in the cluster.

### 5. Other Cluster Operations

#### List Namespaces

```http
GET /clusters/namespaces
```

#### Get Cluster Info

```http
GET /clusters/info
```

#### Disconnect from Cluster

```http
POST /clusters/disconnect
```

## Complete Workflow Examples

### Example 1: Connect to Cluster and Install Kyverno

**Step 1: Get your kubeconfig content**

```bash
# Export kubeconfig content
KUBECONFIG_CONTENT=$(kubectl config view --raw --minify)
```

**Step 2: Connect to your cluster**

```bash
curl -X POST http://localhost:8000/clusters/connect \
  -H "Content-Type: application/json" \
  -d "{
    \"kubeconfig_content\": \"$(echo $KUBECONFIG_CONTENT | sed 's/"/\\"/g')\",
    \"context\": \"my-cluster\"
  }"
```

**Step 3: Check if Kyverno is already installed**

```bash
curl http://localhost:8000/clusters/kyverno/status
```

**Step 4: Install Kyverno (if not installed)**

```bash
curl -X POST http://localhost:8000/clusters/kyverno/install \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "kyverno",
    "release_name": "kyverno",
    "create_namespace": true
  }'
```

**Step 5: Verify installation**

```bash
curl http://localhost:8000/clusters/kyverno/status
```

### Example 2: Save Cluster and Connect Later

**Save cluster configuration:**

```bash
# Read kubeconfig as JSON-safe string
KUBECONFIG_JSON=$(cat ~/.kube/config | jq -Rs .)

curl -X POST http://localhost:8000/clusters \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"dev-cluster\",
    \"kubeconfig_content\": $KUBECONFIG_JSON,
    \"context\": \"dev\",
    \"description\": \"Development environment\"
  }"
```

**List saved clusters:**

```bash
curl http://localhost:8000/clusters
```

**Connect to saved cluster (assuming ID is 1):**

```bash
curl -X POST http://localhost:8000/clusters/1/connect
```

### Example 3: Python Script for Connecting Clusters

```python
import requests
import yaml

# Read kubeconfig file
with open('/home/user/.kube/config', 'r') as f:
    kubeconfig_content = f.read()

# Connect to cluster
response = requests.post(
    'http://localhost:8000/clusters/connect',
    json={
        'kubeconfig_content': kubeconfig_content,
        'context': 'my-cluster'
    }
)

if response.status_code == 200:
    data = response.json()
    print(f"✅ Connected! Found {len(data['namespaces'])} namespaces")
    print(f"Kubernetes version: {data['cluster_info']['kubernetes_version']}")
else:
    print(f"❌ Connection failed: {response.json()['detail']}")

# Check Kyverno status
status = requests.get('http://localhost:8000/clusters/kyverno/status')
if status.json()['installed']:
    print(f"✅ Kyverno {status.json()['version']} is installed")
else:
    print("❌ Kyverno is not installed")
    
    # Install Kyverno
    install = requests.post(
        'http://localhost:8000/clusters/kyverno/install',
        json={'namespace': 'kyverno', 'create_namespace': True}
    )
    print(f"Installation: {install.json()['message']}")
```

## Error Handling

### Common Errors

**1. Helm Not Installed**
```json
{
  "detail": "Helm is not installed on this system. Please install Helm 3.x first."
}
```
**Solution:** Install Helm 3.x on the system running the backend.

**2. Not Connected to Cluster**
```json
{
  "detail": "Not connected to any cluster. Call load_cluster first."
}
```
**Solution:** Connect to a cluster first using `/clusters/connect` or `/clusters/{id}/connect`.

**3. Kyverno Already Installed**
```json
{
  "detail": "Kyverno is already installed as release 'kyverno' in namespace 'kyverno'"
}
```
**Solution:** Use the status endpoint to verify, or use a different release name.

**4. Invalid Kubeconfig Content**
```json
{
  "detail": "Invalid kubeconfig content: Failed to load kubeconfig"
}
```
**Solution:** Verify the kubeconfig content is valid YAML and contains proper cluster configuration.

## Implementation Details

### How Kyverno Detection Works

The system uses multiple methods to detect Kyverno:

1. **Helm Release Check**: Queries Helm for installed releases
2. **Deployment Check**: Looks for Kyverno deployments in `kyverno` and `kyverno-system` namespaces
3. **CRD Check**: Verifies if Kyverno Custom Resource Definitions exist
4. **Webhook Check**: Checks for Kyverno admission webhooks

### Helm Installation Process

The installation process:

1. Validates system has Helm installed
2. Checks if Kyverno is already installed
3. Adds Kyverno Helm repository: `https://kyverno.github.io/kyverno/`
4. Updates Helm repositories
5. Installs Kyverno with specified values
6. Logs installation to audit log

### Database Models

**Cluster Model:**
```python
- id: int
- name: str (unique)
- kubeconfig_content: str  # YAML content stored in database
- context: str (optional)
- description: str (optional)
- is_active: bool
- created_at: datetime
- updated_at: datetime
```

**Benefits of Storing Content:**
- ✅ **Portable**: Works on any machine without file dependencies
- ✅ **Multi-User**: Each user can connect from different locations
- ✅ **Version Control**: Database can track config changes
- ⚠️ **Security**: Requires proper database encryption and access control

**Audit Log:**
All cluster operations (connect, install, uninstall) are logged for tracking.

## Testing

To test the API locally:

1. **Start the backend server:**
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

2. **Access API documentation:**
   - Swagger UI: http://localhost:8000/docs
   - ReDoc: http://localhost:8000/redoc

3. **Test connection:**
   Use the `/clusters/connect` endpoint with your kubeconfig

4. **Test Kyverno operations:**
   Try the status, install, and uninstall endpoints

## Security Considerations

### Critical Security Measures

1. **Kubeconfig Content Protection**:
   - ⚠️ **Kubeconfig content contains sensitive credentials** (certificates, tokens, passwords)
   - 🔒 **Enable database encryption at rest** to protect stored kubeconfig content
   - 🔐 **Use strong database passwords** and restrict database access
   - 🚫 **Never log kubeconfig content** in plain text
   - ✅ Temporary kubeconfig files are auto-deleted after use

2. **Database Security**:
   - Use encrypted connections (SSL/TLS) to the database
   - Implement database-level encryption for the `kubeconfig_content` column
   - Consider using environment-specific databases (dev/staging/prod separate)
   - Regular database backups with encryption

3. **API Authentication & Authorization**:
   - 🔴 **REQUIRED for production**: Add authentication (OAuth2, JWT, API keys)
   - Implement role-based access control (RBAC)
   - Rate limiting to prevent abuse
   - IP whitelisting for sensitive operations

4. **Network Security**:
   - Use HTTPS/TLS for all API communications
   - Deploy behind a reverse proxy (nginx, Trafficor similar)
   - Restrict API access to trusted networks

5. **Kubernetes RBAC**:
   - Ensure kubeconfig has appropriate permissions for Kyverno installation
   - Use service accounts with minimal required permissions
   - Avoid using cluster-admin credentials when possible

6. **Audit Logging**:
   - All operations are logged for compliance and troubleshooting
   - Monitor audit logs for suspicious activities
   - Set up alerts for failed authentication or unauthorized access

### Best Practices

✅ **DO**:
- Rotate kubeconfig credentials regularly
- Use short-lived tokens when possible
- Implement audit log retention policies
- Test disaster recovery procedures

❌ **DON'T**:
- Store kubeconfig in public repositories
- Share kubeconfig between environments
- Use same credentials for dev and production
- Expose API endpoints publicly without authentication

## Troubleshooting

### Helm Command Not Found

Ensure Helm is in the system PATH:
```bash
which helm  # Linux/Mac
where helm  # Windows
```

### Permission Denied

Check kubeconfig file permissions and cluster RBAC permissions.

### Installation Timeout

Increase the timeout in the code if installation takes longer than 5 minutes.

### Namespace Already Exists

If namespace exists but `create_namespace` is true, it will use the existing namespace without error.

## Next Steps

After connecting and installing Kyverno:

1. Use policy endpoints to deploy Kyverno policies
2. Monitor policy violations and compliance
3. Generate compliance reports
4. View audit logs for all operations

## Support

For issues or questions:
- Check the audit logs endpoint: `/audit-logs`
- Review Helm release status
- Check Kubernetes events in the Kyverno namespace
- Verify Helm and kubectl connectivity
