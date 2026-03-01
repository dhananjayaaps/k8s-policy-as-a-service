# SSH Remote Server Management Guide

## Overview

The SSH feature allows you to connect to remote servers (like your Azure VM) via SSH and execute Kubernetes commands remotely. This solves the problem of Minikube running on a private network that isn't accessible from your local machine.

## Architecture

```
Your Local Machine (Windows)
    ↓
Backend API (localhost:8000)
    ↓ SSH Connection
Azure VM (172.203.224.237)
    ↓ Local Connection
Minikube (192.168.49.2:8443)
```

The backend connects via SSH to your VM and executes kubectl/helm commands there, where Minikube is accessible!

## Quick Start

### Step 1: Connect to Your VM via SSH

```bash
curl -X POST http://localhost:8000/clusters/ssh/connect \
  -H "Content-Type: application/json" \
  -d '{
    "host": "172.203.224.237",
    "username": "azureuser",
    "pem_key_content": "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----",
    "port": 22
  }'
```

**Reading PEM key from file:**

```bash
# Linux/Mac
PEM_CONTENT=$(cat ~/.ssh/your-key.pem)

# Windows PowerShell
$PEM_CONTENT = Get-Content ~/.ssh/your-key.pem -Raw
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully connected to azureuser@172.203.224.237",
  "host": "172.203.224.237"
}
```

### Step 2: Get Kubeconfig from Remote Server

```bash
curl -X POST http://localhost:8000/clusters/ssh/kubeconfig \
  -H "Content-Type: application/json" \
  -d '{
    "portable": true,
    "context": "minikube"
  }'
```

**Response:**
```json
{
  "success": true,
  "kubeconfig_content": "apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    certificate-authority-data: LS0tLS...\n    server: https://192.168.49.2:8443\n  name: minikube\n...",
  "message": "Successfully retrieved kubeconfig from remote server"
}
```

### Step 3: Connect to Cluster Using Retrieved Kubeconfig

```bash
# Use the kubeconfig_content from step 2
curl -X POST http://localhost:8000/clusters/connect \
  -H "Content-Type: application/json" \
  -d '{
    "kubeconfig_content": "<content from step 2>",
    "context": "minikube"
  }'
```

Now your backend is connected to the cluster through the VM!

## API Endpoints

### 1. SSH Connect

**`POST /clusters/ssh/connect`**

Connect to a remote server via SSH.

**Request:**
```json
{
  "host": "172.203.224.237",
  "username": "azureuser",
  "pem_key_content": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----",
  "password": null,  // Use password instead of key if needed
  "port": 22
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully connected to azureuser@172.203.224.237",
  "host": "172.203.224.237"
}
```

### 2. Execute Remote Command

**`POST /clusters/ssh/execute`**

Execute any command on the remote server.

**Request:**
```json
{
  "command": "kubectl get nodes",
  "timeout": 60
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "NAME       STATUS   ROLES           AGE   VERSION\nminikube   Ready    control-plane   10m   v1.28.3\n",
  "stderr": "",
  "exit_code": 0
}
```

### 3. Get Kubeconfig

**`POST /clusters/ssh/kubeconfig`**

Get kubeconfig from the remote server.

**Request:**
```json
{
  "kubeconfig_path": "~/.kube/config",
  "portable": true,
  "context": "minikube"
}
```

**Parameters:**
- `portable: true` - Embeds certificates (recommended)
- `portable: false` - Returns raw kubeconfig with file paths

**Response:**
```json
{
  "success": true,
  "kubeconfig_content": "apiVersion: v1...",
  "message": "Successfully retrieved kubeconfig from remote server"
}
```

### 4. Check Minikube Status

**`GET /clusters/ssh/minikube-status`**

Check if Minikube is running on the remote server.

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

### 5. Install Kyverno Remotely

**`POST /clusters/ssh/kyverno/install`**

Install Kyverno on the remote cluster via Helm.

**Request:**
```json
{
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
  "output": "NAME: kyverno\nLAST DEPLOYED: ..."
}
```

### 6. Check SSH Status

**`GET /clusters/ssh/status`**

Check current SSH connection status.

**Response:**
```json
{
  "connected": true,
  "host": "172.203.224.237"
}
```

### 7. Disconnect SSH

**`POST /clusters/ssh/disconnect`**

Disconnect from the current SSH session.

**Response:**
```json
{
  "message": "Disconnected from 172.203.224.237"
}
```

## Complete Workflow Example

### PowerShell Script

```powershell
# 1. Read PEM key
$PEM_KEY = Get-Content "C:\Users\YourUser\.ssh\azure-key.pem" -Raw

# 2. Connect via SSH
$sshConnect = @{
    host = "172.203.224.237"
    username = "azureuser"
    pem_key_content = $PEM_KEY
    port = 22
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:8000/clusters/ssh/connect" `
    -Method Post `
    -ContentType "application/json" `
    -Body $sshConnect

Write-Host "✅ Connected: $($result.message)"

# 3. Check Minikube status
$minikubeStatus = Invoke-RestMethod -Uri "http://localhost:8000/clusters/ssh/minikube-status"
Write-Host "Minikube Running: $($minikubeStatus.running)"

# 4. Get portable kubeconfig
$kubeconfigReq = @{
    portable = $true
    context = "minikube"
} | ConvertTo-Json

$kubeconfigResp = Invoke-RestMethod -Uri "http://localhost:8000/clusters/ssh/kubeconfig" `
    -Method Post `
    -ContentType "application/json" `
    -Body $kubeconfigReq

Write-Host "✅ Got kubeconfig"

# 5. Connect to cluster using the kubeconfig
$clusterConnect = @{
    kubeconfig_content = $kubeconfigResp.kubeconfig_content
    context = "minikube"
} | ConvertTo-Json

$clusterResp = Invoke-RestMethod -Uri "http://localhost:8000/clusters/connect" `
    -Method Post `
    -ContentType "application/json" `
    -Body $clusterConnect

Write-Host "✅ Connected to cluster: $($clusterResp.message)"

# 6. Check Kyverno status
$kyvernoStatus = Invoke-RestMethod -Uri "http://localhost:8000/clusters/kyverno/status"
Write-Host "Kyverno Installed: $($kyvernoStatus.installed)"

if (-not $kyvernoStatus.installed) {
    # 7. Install Kyverno remotely
    $kyvernoInstall = @{
        namespace = "kyverno"
        release_name = "kyverno"
        create_namespace = $true
    } | ConvertTo-Json
    
    $installResp = Invoke-RestMethod -Uri "http://localhost:8000/clusters/ssh/kyverno/install" `
        -Method Post `
        -ContentType "application/json" `
        -Body $kyvernoInstall
    
    Write-Host "✅ Kyverno installed: $($installResp.message)"
}
```

### Bash Script

```bash
#!/bin/bash

# Configuration
HOST="172.203.224.237"
USERNAME="azureuser"
PEM_KEY_FILE="$HOME/.ssh/azure-key.pem"
API_URL="http://localhost:8000"

# Read PEM key
PEM_KEY=$(cat "$PEM_KEY_FILE")

# 1. Connect via SSH
echo "Connecting to $HOST..."
curl -s -X POST "$API_URL/clusters/ssh/connect" \
  -H "Content-Type: application/json" \
  -d "{
    \"host\": \"$HOST\",
    \"username\": \"$USERNAME\",
    \"pem_key_content\": $(echo "$PEM_KEY" | jq -Rs .),
    \"port\": 22
  }" | jq .

# 2. Check Minikube status
echo "Checking Minikube status..."
curl -s "$API_URL/clusters/ssh/minikube-status" | jq .

# 3. Get portable kubeconfig
echo "Getting kubeconfig..."
KUBECONFIG_CONTENT=$(curl -s -X POST "$API_URL/clusters/ssh/kubeconfig" \
  -H "Content-Type: application/json" \
  -d '{
    "portable": true,
    "context": "minikube"
  }' | jq -r '.kubeconfig_content')

# 4. Connect to cluster
echo "Connecting to cluster..."
curl -s -X POST "$API_URL/clusters/connect" \
  -H "Content-Type: application/json" \
  -d "{
    \"kubeconfig_content\": $(echo "$KUBECONFIG_CONTENT" | jq -Rs .),
    \"context\": \"minikube\"
  }" | jq .

# 5. Check Kyverno status
echo "Checking Kyverno status..."
curl -s "$API_URL/clusters/kyverno/status" | jq .

echo "✅ Setup complete!"
```

## Use Cases

### 1. Remote Minikube Management

Access Minikube running on a VM without exposing Kubernetes API to the internet.

### 2. Multi-User Teams

Multiple developers can manage the same cluster by connecting to the VM via SSH.

### 3. Cloud VM Kubernetes

Manage Kubernetes clusters on cloud VMs (AWS EC2, Azure VM, GCP Compute) where the API server is on a private network.

### 4. GitOps Deployments

Execute kubectl/helm commands on remote servers as part of CI/CD pipelines.

## Security Considerations

### ✅ Best Practices

1. **Use PEM keys instead of passwords**
   - More secure
   - Can be easily rotated
   - Supports key-based authentication

2. **Store PEM keys securely**
   - Never commit to Git
   - Use secrets management (Azure Key Vault, AWS Secrets Manager)
   - Restrict file permissions: `chmod 600 ~/.ssh/key.pem`

3. **Limit SSH access**
   - Use firewall rules to restrict SSH (port 22)
   - Consider VPN for additional security
   - Use SSH key passphrase protection

4. **Monitor audit logs**
   - All SSH operations are logged
   - Review logs regularly for suspicious activity

5. **Use dedicated service accounts**
   - Don't use your personal SSH key
   - Create service accounts with minimal permissions
   - Rotate keys regularly

### ⚠️ Warnings

- **Don't expose this API publicly** without authentication
- **PEM keys are sensitive** - treat them like passwords
- **SSH session is persistent** - disconnect when done
- **Commands execute with SSH user's permissions** - be careful!

## Troubleshooting

### Connection Refused

**Error:** `Failed to connect via SSH: Connection refused`

**Solution:**
- Check VM is running
- Verify SSH service is running: `sudo systemctl status sshd`
- Check firewall allows port 22: `sudo ufw status`
- Verify correct IP address

### Authentication Failed

**Error:** `Failed to connect via SSH: Authentication failed`

**Solution:**
- Verify PEM key is correct
- Check PEM key format (should include `-----BEGIN...-----`)
- Ensure PEM key matches the VM
- Try password authentication instead

### Command Timeout

**Error:** `Failed to execute command: timeout`

**Solution:**
- Increase timeout value
- Check command actually completes on VM
- Verify network latency

### Kubeconfig Not Found

**Error:** `Failed to get kubeconfig: No such file or directory`

**Solution:**
- Check kubeconfig path is correct
- Default is `~/.kube/config`
- For Minikube: usually in the same location
- SSH to VM manually to verify: `ls -la ~/.kube/config`

## Advanced Usage

### Execute Multiple Commands

```bash
curl -X POST http://localhost:8000/clusters/ssh/execute \
  -H "Content-Type: application/json" \
  -d '{
    "command": "kubectl get nodes && kubectl get pods -A && helm list -A",
    "timeout": 120
  }'
```

### Custom Kubeconfig Path

```bash
curl -X POST http://localhost:8000/clusters/ssh/kubeconfig \
  -H "Content-Type: application/json" \
  -d '{
    "kubeconfig_path": "/opt/kubernetes/admin.conf",
    "portable": true
  }'
```

### Use with Password Instead of Key

```bash
curl -X POST http://localhost:8000/clusters/ssh/connect \
  -H "Content-Type: application/json" \
  -d '{
    "host": "172.203.224.237",
    "username": "azureuser",
    "password": "your-password",
    "port": 22
  }'
```

## Integration with Swagger UI

Access the interactive API documentation:

```
http://localhost:8000/docs
```

All SSH endpoints are documented there with **Try it out** functionality!

## Next Steps

1. **Install dependencies**: `pip install -r requirements.txt`
2. **Start backend**: `uvicorn app.main:app --reload`
3. **Test SSH connection**: Use Swagger UI or curl
4. **Automate workflows**: Create scripts for your team
5. **Set up monitoring**: Track SSH operations in audit logs

## Support

For issues or questions:
- Check backend logs: Look for SSH connection errors
- Verify VM accessibility: `ping 172.203.224.237`
- Test SSH manually: `ssh azureuser@172.203.224.237`
- Review audit logs in database
