# OpenAPI Specification Usage Guide

The OpenAPI specification for the Kyverno Management API is available in `openapi.yaml`.

## 📚 What is OpenAPI?

OpenAPI (formerly Swagger) is a standard format for describing REST APIs. It provides:
- Complete API documentation
- Request/response schemas
- Interactive API testing
- Automatic client SDK generation
- API validation and testing

## 🚀 Using the OpenAPI Specification

### 1. Interactive Documentation with Swagger UI

**Run locally with Docker:**
```bash
docker run -p 8080:8080 -e SWAGGER_JSON=/openapi.yaml -v $(pwd)/openapi.yaml:/openapi.yaml swaggerapi/swagger-ui
```

Then visit: http://localhost:8080

**Or use online editor:**
1. Go to https://editor.swagger.io/
2. Copy contents of `openapi.yaml`
3. Paste into the editor

### 2. API Testing with Swagger UI

In Swagger UI, you can:
- View all endpoints and parameters
- Try out API calls directly
- See example requests/responses
- Test error scenarios

### 3. Generate Client SDKs

**Using OpenAPI Generator:**

```bash
# Install OpenAPI Generator
npm install @openapitools/openapi-generator-cli -g

# Generate Python client
openapi-generator-cli generate \
  -i openapi.yaml \
  -g python \
  -o ./clients/python

# Generate JavaScript/TypeScript client
openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-axios \
  -o ./clients/typescript

# Generate Java client
openapi-generator-cli generate \
  -i openapi.yaml \
  -g java \
  -o ./clients/java

# Generate Go client
openapi-generator-cli generate \
  -i openapi.yaml \
  -g go \
  -o ./clients/go
```

**Available generators:** Python, JavaScript, TypeScript, Java, Go, Ruby, PHP, C#, Rust, Kotlin, Swift, and 50+ more!

### 4. API Validation

**Validate the OpenAPI spec:**
```bash
# Using Swagger CLI
npm install -g @apidevtools/swagger-cli
swagger-cli validate openapi.yaml

# Using openapi-spec-validator (Python)
pip install openapi-spec-validator
openapi-spec-validator openapi.yaml
```

### 5. Mock Server for Testing

**Using Prism:**
```bash
# Install Prism
npm install -g @stoplight/prism-cli

# Start mock server
prism mock openapi.yaml

# API will be available at http://localhost:4010
```

Now you can test your frontend without the real backend!

### 6. Import into Postman

1. Open Postman
2. Click "Import"
3. Select `openapi.yaml`
4. Postman will create a collection with all endpoints
5. Set up environment variables for `base_url` and `session_id`

### 7. Import into Insomnia

1. Open Insomnia
2. Click "Create" → "Import From" → "File"
3. Select `openapi.yaml`
4. All endpoints will be imported

### 8. Generate Documentation Website

**Using Redoc:**
```bash
# Install Redoc CLI
npm install -g redoc-cli

# Generate HTML documentation
redoc-cli bundle openapi.yaml -o api-docs.html

# Start live server
redoc-cli serve openapi.yaml
```

Visit: http://localhost:8080

**Using Slate:**
```bash
# Convert OpenAPI to Slate markdown
npm install -g widdershins
widdershins openapi.yaml -o slate.md

# Use with Slate to generate beautiful docs
```

## 🔧 Integration Examples

### Python with Generated Client

```python
# After generating Python client
from openapi_client import ApiClient, Configuration
from openapi_client.api import ssh_connection_api

# Configure API client
config = Configuration(host="http://localhost:8001")
client = ApiClient(config)
ssh_api = ssh_connection_api.SSHConnectionApi(client)

# Connect via SSH
response = ssh_api.ssh_connect({
    "host": "192.168.1.100",
    "username": "ubuntu",
    "pem_key_content": open("~/.ssh/id_rsa").read()
})

session_id = response.session_id
print(f"Connected! Session ID: {session_id}")
```

### TypeScript with Generated Client

```typescript
import { Configuration, SSHConnectionApi } from './generated-client';

const config = new Configuration({
  basePath: 'http://localhost:8001',
});

const sshApi = new SSHConnectionApi(config);

// Connect via SSH
const response = await sshApi.sshConnect({
  host: '192.168.1.100',
  username: 'ubuntu',
  pem_key_content: await fs.readFile('~/.ssh/id_rsa', 'utf8'),
});

console.log(`Connected! Session ID: ${response.data.session_id}`);
```

## 📊 CI/CD Integration

### GitHub Actions - API Testing

```yaml
name: API Tests

on: [push, pull_request]

jobs:
  test-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Validate OpenAPI Spec
        run: |
          npm install -g @apidevtools/swagger-cli
          swagger-cli validate openapi.yaml
      
      - name: Start Mock Server
        run: |
          npm install -g @stoplight/prism-cli
          prism mock openapi.yaml &
      
      - name: Run API Tests
        run: |
          # Your API tests here
          npm test
```

### Contract Testing with Pact

```bash
# Install Pact
npm install -g @pact-foundation/pact

# Run contract tests
pact-broker can-i-deploy \
  --pacticipant KyvernoAPI \
  --broker-base-url https://your-pact-broker \
  --latest
```

## 🛠️ Development Workflow

### 1. Update OpenAPI Spec First (Design-First Approach)
```bash
# Edit openapi.yaml
vim openapi.yaml

# Validate changes
swagger-cli validate openapi.yaml

# Generate mock server
prism mock openapi.yaml
```

### 2. Develop Frontend Against Mock
```bash
# Frontend can use mock API at http://localhost:4010
# No backend needed during development!
```

### 3. Implement Backend to Match Spec
```bash
# Backend must conform to openapi.yaml
# Use validators to ensure compliance
```

### 4. Run Contract Tests
```bash
# Verify backend matches spec
dredd openapi.yaml http://localhost:8001
```

## 📖 Tools & Resources

### API Documentation
- **Swagger UI**: https://swagger.io/tools/swagger-ui/
- **Redoc**: https://github.com/Redocly/redoc
- **Stoplight**: https://stoplight.io/

### Code Generation
- **OpenAPI Generator**: https://openapi-generator.tech/
- **Swagger Codegen**: https://github.com/swagger-api/swagger-codegen

### Testing
- **Prism Mock Server**: https://stoplight.io/open-source/prism
- **Dredd**: https://dredd.org/
- **Postman**: https://www.postman.com/

### Validation
- **Swagger CLI**: https://apitools.dev/swagger-cli/
- **OpenAPI Spec Validator**: https://github.com/p1c2u/openapi-spec-validator

### API Design
- **Swagger Editor**: https://editor.swagger.io/
- **Stoplight Studio**: https://stoplight.io/studio

## 🎯 Best Practices

1. **Keep OpenAPI spec up to date** with code changes
2. **Validate spec in CI/CD** pipeline
3. **Use mock servers** for parallel frontend/backend development
4. **Generate SDKs** for consistent client implementations
5. **Version your API** properly (use semantic versioning)
6. **Document all error scenarios** with examples
7. **Include request/response examples** for all endpoints
8. **Use references ($ref)** to avoid duplication

## 📝 OpenAPI Extensions

The spec supports custom extensions:
```yaml
x-codegen-request-body-name: body
x-group-parameters: true
x-implementation-notes: "Custom implementation details"
```

## 🔄 Keeping Spec in Sync

### Option 1: Generate from Code (Code-First)
```bash
# FastAPI automatic OpenAPI generation
# Available at http://localhost:8001/docs
# Download from http://localhost:8001/openapi.json
```

### Option 2: Design First (Recommended)
- Maintain `openapi.yaml` manually
- Use tooling to validate implementation matches spec
- Generate clients from spec

## 🚨 Common Issues

### Issue: Spec validation fails
**Solution:** Check YAML syntax and OpenAPI 3.0 compliance

### Issue: Generated client doesn't work
**Solution:** Ensure base URL is configured correctly

### Issue: Mock server returns wrong data
**Solution:** Add more detailed examples in the spec

## 📚 Additional Documentation

- [API Documentation](./API_DOCUMENTATION.md) - Complete API reference
- [Quick Start Guide](./QUICK_START.md) - Get started in 3 minutes
- [OpenAPI Specification](./openapi.yaml) - Machine-readable API spec

---

**Need more help?** Check the OpenAPI documentation at https://spec.openapis.org/oas/v3.0.3
