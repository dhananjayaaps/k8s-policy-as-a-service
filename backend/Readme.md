# Kyverno Management API

A comprehensive REST API for managing Kubernetes clusters and Kyverno policies with multi-user session support.

## 🚀 Features

- **Multi-User Session Management** - Isolated SSH and K8s sessions for concurrent users
- **Remote Cluster Access** - Connect to clusters via SSH
- **Service Account Token Management** - Secure token-based authentication
- **Automated Kyverno Installation** - Deploy Kyverno via Helm
- **Policy Lifecycle Management** - Deploy, update, and remove Kyverno policies
- **Complete Audit Logging** - Track all operations

## 📚 Documentation

- **[Quick Start Guide](./QUICK_START.md)** - Get started in 3 minutes ⭐
- **[Complete API Documentation](./API_DOCUMENTATION.md)** - Full API reference
- **[OpenAPI Specification](./openapi.yaml)** - Machine-readable API spec (Swagger/OpenAPI 3.0)
- **[OpenAPI Usage Guide](./OPENAPI_USAGE.md)** - How to use the OpenAPI spec with tools

## 🎯 Quick Start

### 1. Connect via SSH
```bash
curl -X POST http://localhost:8001/clusters/ssh/connect \
  -H "Content-Type: application/json" \
  -d '{
    "host": "192.168.1.100",
    "username": "ubuntu",
    "pem_key_content": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
  }'
```

Save the `session_id` from the response!

### 2. Complete Cluster Setup
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

**Done!** Your cluster is now set up with Kyverno installed.

## 🛠️ Installation

### Prerequisites
- Python 3.8+
- FastAPI
- SQLAlchemy
- Kubernetes Python Client
- Paramiko (SSH)

### Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### Run the API Server
```bash
uvicorn app.main:app --reload --port 8001
```

API will be available at: http://localhost:8001

### Interactive API Documentation
- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

## 📖 API Overview

### SSH Connection Management
- `POST /clusters/ssh/connect` - Connect to remote server
- `POST /clusters/ssh/execute` - Execute remote commands
- `POST /clusters/ssh/kubeconfig` - Get kubeconfig
- `POST /clusters/ssh/disconnect` - Disconnect session
- `GET /clusters/ssh/status` - Check connection status
- `GET /clusters/ssh/sessions` - List active sessions

### Cluster Setup
- `POST /clusters/setup` - Complete cluster setup (Recommended) ⭐
- `POST /clusters/connect` - Connect via kubeconfig
- `POST /clusters/connect-with-token` - Connect via service account token
- `GET /clusters/namespaces` - List namespaces
- `GET /clusters/info` - Get cluster information

### Kyverno Management
- `GET /clusters/kyverno/status` - Check Kyverno status
- `POST /clusters/ssh/kyverno/install` - Install Kyverno via SSH
- `POST /clusters/{id}/install-kyverno` - Install Kyverno via token
- `POST /clusters/kyverno/uninstall` - Uninstall Kyverno

### Service Account Management
- `POST /clusters/{id}/serviceaccount` - Create service account with token
- `GET /clusters/{id}/serviceaccounts` - List service accounts

### Policy Management
- `GET /policies` - List all policies
- `POST /policies/{id}/deploy` - Deploy policy to cluster

## 🔧 Configuration

### Environment Variables
```bash
DATABASE_URL=sqlite:///./kyverno.db  # Database connection
API_HOST=0.0.0.0                     # API host
API_PORT=8001                        # API port
```

### Session Timeouts
- SSH Sessions: 30 minutes
- K8s Sessions: 60 minutes

## 🏗️ Architecture

```
┌─────────────┐     SSH      ┌──────────────┐
│   Client    │◄────────────►│ Remote Server│
│             │              │  (K8s Cluster)│
└──────┬──────┘              └──────────────┘
       │
       │ REST API
       │
┌──────▼──────────────────────────────────┐
│         FastAPI Backend                 │
│  ┌────────────────────────────────┐    │
│  │   Session Management           │    │
│  │  - SSH Sessions (isolated)     │    │
│  │  - K8s Sessions (isolated)     │    │
│  └────────────────────────────────┘    │
│  ┌────────────────────────────────┐    │
│  │   Services                     │    │
│  │  - SSH Connector               │    │
│  │  - K8s Connector               │    │
│  │  - Service Account Manager     │    │
│  └────────────────────────────────┘    │
└─────────────┬───────────────────────────┘
              │
              │
      ┌───────▼────────┐
      │   Database     │
      │  (SQLite/PG)   │
      │  - Clusters    │
      │  - Tokens      │
      │  - Audit Logs  │
      └────────────────┘
```

## 🔐 Security Best Practices

1. **Use SSH Keys** instead of passwords
2. **Set token expiration** appropriately
3. **Use RBAC** with least privilege (view, edit, admin)
4. **Store tokens securely** in database
5. **Monitor active sessions** regularly
6. **Clean up expired sessions** automatically
7. **Use HTTPS** in production
8. **Audit all operations** via logs

## 🧪 Testing

### Using OpenAPI Spec
```bash
# Generate mock server
npm install -g @stoplight/prism-cli
prism mock openapi.yaml

# Run against mock at http://localhost:4010
```

### Using Postman
1. Import `openapi.yaml` into Postman
2. Set environment variables
3. Test all endpoints

## 📊 Database Schema

### Clusters
- id, name, host, server_url, ca_cert_data, kubeconfig_content, description

### ServiceAccountToken
- id, cluster_id, name, namespace, token, role_type, expires_at

### Policies
- id, name, category, description, yaml_template, parameters

### PolicyDeployments
- id, cluster_id, policy_id, namespace, status, deployed_yaml

### AuditLogs
- id, action, resource_type, resource_id, details, status, error_message

## 🔄 Migration from Single-User to Multi-User

The API has been updated to support multi-user operations:

**Before (Problematic):**
```python
# Global singleton - causes conflicts
ssh = get_ssh_connector()
```

**After (Fixed):**
```python
# Session-based - isolated per user
session_id, ssh = create_ssh_session()
ssh = get_ssh_session(session_id)
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Update `openapi.yaml` if adding/changing endpoints
4. Add tests
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🆘 Support

- Check the [Quick Start Guide](./QUICK_START.md)
- Review [API Documentation](./API_DOCUMENTATION.md)
- Use [OpenAPI Spec](./openapi.yaml) with Swagger UI
- Check audit logs in database
- Verify session status via `/ssh/sessions`

## 🗺️ Roadmap

- [ ] Add authentication (JWT/OAuth2)
- [ ] Multi-cluster monitoring dashboard
- [ ] Policy validation before deployment
- [ ] Automated policy testing
- [ ] Webhook support for GitOps
- [ ] Prometheus metrics export
- [ ] Grafana dashboards

---

## Legacy: Getting Kubeconfig Manually

If you need to manually get kubeconfig from a VM:

```bash
# SSH into your VM first
ssh azureuser@your-vm-ip

# Create a portable kubeconfig with embedded certificates
kubectl config view --raw --minify \
  --context=minikube \
  --flatten \
  > ~/kubeconfig-portable.yaml

# Display the content (copy this to use in API)
cat ~/kubeconfig-portable.yaml
```

**Note:** The `/clusters/ssh/kubeconfig` endpoint does this automatically!

---

**Last Updated:** March 1, 2026  
**API Version:** 1.0.0