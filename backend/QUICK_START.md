# Quick Start Guide - Kyverno Management API

Get started in 3 minutes! 🚀

## Prerequisites

- Remote server with Kubernetes installed
- SSH access (key or password)
- API server running on `http://localhost:8001`

---

## Method 1: Complete Setup (Recommended) ⭐

**One API call to set up everything!**

### Step 1: Connect via SSH
```bash
curl -X POST http://localhost:8001/clusters/ssh/connect \
  -H "Content-Type: application/json" \
  -d '{
    "host": "YOUR_SERVER_IP",
    "username": "YOUR_USERNAME",
    "pem_key_content": "-----BEGIN RSA PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END RSA PRIVATE KEY-----"
  }'
```

**Save the `session_id` from the response!**

### Step 2: Complete Setup
```bash
curl -X POST http://localhost:8001/clusters/setup \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "YOUR_SESSION_ID",
    "cluster_name": "my-cluster",
    "service_account_name": "kyverno-admin",
    "namespace": "kyverno",
    "role_type": "cluster-admin",
    "install_kyverno": true
  }'
```

**Done!** ✅ You now have:
- Cluster saved in database with public IP
- Service account with token
- Kyverno installed and ready

### Step 3: Disconnect (Cleanup)
```bash
curl -X POST "http://localhost:8001/clusters/ssh/disconnect?session_id=YOUR_SESSION_ID"
```

---

## Method 2: Manual Control

### Step 1: SSH Connect
```bash
curl -X POST http://localhost:8001/clusters/ssh/connect \
  -H "Content-Type: application/json" \
  -d '{
    "host": "192.168.1.100",
    "username": "ubuntu",
    "password": "your_password"
  }'
```

### Step 2: Get Kubeconfig
```bash
curl -X POST http://localhost:8001/clusters/ssh/kubeconfig \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "YOUR_SESSION_ID",
    "portable": true
  }'
```

### Step 3: Connect to Cluster
```bash
curl -X POST http://localhost:8001/clusters/connect \
  -H "Content-Type: application/json" \
  -d '{
    "kubeconfig_content": "KUBECONFIG_FROM_STEP_2"
  }'
```

### Step 4: Install Kyverno
```bash
curl -X POST http://localhost:8001/clusters/ssh/kyverno/install \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "YOUR_SESSION_ID",
    "namespace": "kyverno",
    "release_name": "kyverno"
  }'
```

---

## Common Operations

### Check Kyverno Status
```bash
curl http://localhost:8001/clusters/kyverno/status
```

### List Namespaces
```bash
curl http://localhost:8001/clusters/namespaces
```

### Execute Remote Command
```bash
curl -X POST http://localhost:8001/clusters/ssh/execute \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "YOUR_SESSION_ID",
    "command": "kubectl get nodes"
  }'
```

### Check SSH Session Status
```bash
curl "http://localhost:8001/clusters/ssh/status?session_id=YOUR_SESSION_ID"
```

### List All Active SSH Sessions
```bash
curl http://localhost:8001/clusters/ssh/sessions
```

---

## Using Postman

1. Import the API endpoints
2. Create environment variables:
   - `base_url`: `http://localhost:8001`
   - `session_id`: Save from SSH connect response
3. Use the collections for each workflow

---

## Python Example

```python
import requests

API_URL = "http://localhost:8001"

# 1. Connect via SSH
ssh_response = requests.post(f"{API_URL}/clusters/ssh/connect", json={
    "host": "192.168.1.100",
    "username": "ubuntu",
    "pem_key_content": open("~/.ssh/id_rsa").read()
})
session_id = ssh_response.json()["session_id"]
print(f"Session ID: {session_id}")

# 2. Complete setup
setup_response = requests.post(f"{API_URL}/clusters/setup", json={
    "session_id": session_id,
    "cluster_name": "prod-cluster",
    "service_account_name": "kyverno-admin",
    "namespace": "kyverno",
    "role_type": "cluster-admin",
    "install_kyverno": True
})
result = setup_response.json()
print(f"Cluster ID: {result['cluster_id']}")
print(f"Token: {result['token'][:50]}...")

# 3. Check Kyverno status
status = requests.get(f"{API_URL}/clusters/kyverno/status").json()
print(f"Kyverno installed: {status['installed']}")

# 4. Disconnect
requests.post(f"{API_URL}/clusters/ssh/disconnect", params={"session_id": session_id})
print("Disconnected")
```

---

## JavaScript/Node.js Example

```javascript
const axios = require('axios');
const fs = require('fs');

const API_URL = 'http://localhost:8001';

async function setupCluster() {
  // 1. Connect via SSH
  const sshResponse = await axios.post(`${API_URL}/clusters/ssh/connect`, {
    host: '192.168.1.100',
    username: 'ubuntu',
    pem_key_content: fs.readFileSync('~/.ssh/id_rsa', 'utf8')
  });
  const sessionId = sshResponse.data.session_id;
  console.log(`Session ID: ${sessionId}`);

  // 2. Complete setup
  const setupResponse = await axios.post(`${API_URL}/clusters/setup`, {
    session_id: sessionId,
    cluster_name: 'prod-cluster',
    service_account_name: 'kyverno-admin',
    namespace: 'kyverno',
    role_type: 'cluster-admin',
    install_kyverno: true
  });
  console.log(`Cluster ID: ${setupResponse.data.cluster_id}`);
  console.log(`Token: ${setupResponse.data.token.substring(0, 50)}...`);

  // 3. Check Kyverno status
  const statusResponse = await axios.get(`${API_URL}/clusters/kyverno/status`);
  console.log(`Kyverno installed: ${statusResponse.data.installed}`);

  // 4. Disconnect
  await axios.post(`${API_URL}/clusters/ssh/disconnect`, null, {
    params: { session_id: sessionId }
  });
  console.log('Disconnected');
}

setupCluster().catch(console.error);
```

---

## Troubleshooting

### "SSH session not found"
- Session expired (30 min timeout)
- Wrong session ID
- **Solution:** Reconnect via `/clusters/ssh/connect`

### "SSH connection is no longer active"
- Connection dropped
- Server unreachable
- **Solution:** Reconnect and get new session ID

### "Cluster with name already exists"
- Cluster name must be unique
- **Solution:** Use different name or update existing cluster

### "No active service account token found"
- No tokens saved for cluster
- Token deactivated
- **Solution:** Create new service account via `/clusters/{id}/serviceaccount`

---

## Best Practices

1. ✅ **Always save session IDs** immediately
2. ✅ **Use the /setup endpoint** for production
3. ✅ **Disconnect when done** to free resources
4. ✅ **Store tokens securely** - they're like passwords
5. ✅ **Monitor sessions** via `/ssh/sessions`
6. ✅ **Use cluster-admin role** for Kyverno service accounts
7. ✅ **Set long token duration** (87600h = 10 years)

---

## Key Differences from Old Workflow

| Old (Problematic) | New (Fixed) |
|-------------------|-------------|
| Single global SSH connection | Session-based per user |
| User conflicts | Isolated sessions |
| No token storage | Tokens saved in DB |
| Manual multi-step | One `/setup` call |
| SSH required always | Token-based operations |

---

## Next Steps

- Read full [API Documentation](./API_DOCUMENTATION.md)
- Deploy Kyverno policies
- Create additional service accounts
- Monitor audit logs

---

**Need Help?**
- Check `/clusters/ssh/sessions` for active connections
- Review audit logs in database
- Verify SSH connectivity: `ssh username@host`

Happy cluster managing! 🎉
