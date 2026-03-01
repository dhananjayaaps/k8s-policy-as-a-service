"""
Kyverno Policy Manager API

FastAPI application for managing Kyverno policies across Kubernetes clusters.
"""

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from datetime import datetime
import logging
import os
from pathlib import Path
import yaml

from app.db import init_db
from app.routers import clusters, policies, reports

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# API Version
API_VERSION = "0.1.0"

# Create FastAPI application
app = FastAPI(
    title="Kyverno Policy Manager",
    description="API for managing Kyverno policies across Kubernetes clusters",
    version=API_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Startup Events ============

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup"""
    logger.info("Starting Kyverno Policy Manager API...")
    
    # Initialize database
    init_db()
    logger.info("Database initialized")
    
    logger.info(f"API v{API_VERSION} ready")


# ============ Include Routers ============

app.include_router(clusters.router)
app.include_router(policies.router)
app.include_router(reports.router)


# ============ Root Endpoints ============

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Kyverno Policy Manager API",
        "version": API_VERSION,
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": API_VERSION,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/api/v1/info")
async def api_info():
    """API information endpoint"""
    return {
        "name": "Kyverno Policy Manager",
        "version": API_VERSION,
        "endpoints": {
            "clusters": "/clusters",
            "policies": "/policies",
            "reports": "/reports",
        },
        "documentation": {
            "swagger_ui": "/docs",
            "redoc": "/redoc",
            "openapi_json": "/openapi.json",
            "openapi_yaml": "/api/openapi.yaml",
            "api_docs": "/api/documentation",
            "quick_start": "/api/quick-start",
        },
        "features": [
            "Kubernetes cluster management",
            "Kyverno policy templates",
            "Policy deployment",
            "Compliance reporting",
            "Multi-user session support",
            "SSH-based cluster access",
            "Service account token management",
        ],
    }


# ============ OpenAPI & Documentation Endpoints ============

@app.get("/api/openapi.yaml", 
         responses={200: {"content": {"application/x-yaml": {}}}},
         tags=["Documentation"])
async def get_openapi_yaml():
    """
    Get OpenAPI specification in YAML format.
    
    This endpoint serves the openapi.yaml file for use with:
    - Swagger UI / ReDoc
    - Postman / Insomnia import
    - Code generators (OpenAPI Generator, Swagger Codegen)
    - Mock servers (Prism)
    - API testing tools
    """
    try:
        base_dir = Path(__file__).parent.parent
        openapi_path = base_dir / "openapi.yaml"
        
        if openapi_path.exists():
            with open(openapi_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return Response(content=content, media_type="application/x-yaml")
        else:
            # Fallback: Generate from FastAPI's OpenAPI schema
            openapi_schema = app.openapi()
            yaml_content = yaml.dump(openapi_schema, sort_keys=False)
            return Response(content=yaml_content, media_type="application/x-yaml")
    except Exception as e:
        logger.error(f"Failed to serve OpenAPI YAML: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Failed to load OpenAPI specification: {str(e)}"}
        )


@app.get("/api/openapi", tags=["Documentation"])
async def get_openapi_json():
    """
    Get OpenAPI specification in JSON format.
    
    Alternative to /openapi.json with a cleaner path.
    """
    return JSONResponse(content=app.openapi())


@app.get("/api/documentation", 
         responses={200: {"content": {"text/markdown": {}}}},
         tags=["Documentation"])
async def get_api_documentation():
    """
    Get complete API documentation in Markdown format.
    
    Returns the comprehensive API_DOCUMENTATION.md file.
    """
    try:
        base_dir = Path(__file__).parent.parent
        doc_path = base_dir / "API_DOCUMENTATION.md"
        
        if doc_path.exists():
            with open(doc_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return Response(content=content, media_type="text/markdown")
        else:
            return JSONResponse(
                status_code=404,
                content={"detail": "API documentation file not found"}
            )
    except Exception as e:
        logger.error(f"Failed to serve API documentation: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Failed to load documentation: {str(e)}"}
        )


@app.get("/api/quick-start",
         responses={200: {"content": {"text/markdown": {}}}},
         tags=["Documentation"])
async def get_quick_start():
    """
    Get Quick Start guide in Markdown format.
    
    Returns the QUICK_START.md file with getting started instructions.
    """
    try:
        base_dir = Path(__file__).parent.parent
        doc_path = base_dir / "QUICK_START.md"
        
        if doc_path.exists():
            with open(doc_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return Response(content=content, media_type="text/markdown")
        else:
            return JSONResponse(
                status_code=404,
                content={"detail": "Quick start guide not found"}
            )
    except Exception as e:
        logger.error(f"Failed to serve quick start guide: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Failed to load quick start guide: {str(e)}"}
        )


@app.get("/api/openapi-usage",
         responses={200: {"content": {"text/markdown": {}}}},
         tags=["Documentation"])
async def get_openapi_usage():
    """
    Get OpenAPI usage guide in Markdown format.
    
    Returns the OPENAPI_USAGE.md file with instructions on using the OpenAPI spec.
    """
    try:
        base_dir = Path(__file__).parent.parent
        doc_path = base_dir / "OPENAPI_USAGE.md"
        
        if doc_path.exists():
            with open(doc_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return Response(content=content, media_type="text/markdown")
        else:
            return JSONResponse(
                status_code=404,
                content={"detail": "OpenAPI usage guide not found"}
            )
    except Exception as e:
        logger.error(f"Failed to serve OpenAPI usage guide: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Failed to load usage guide: {str(e)}"}
        )


@app.get("/api/docs/list", tags=["Documentation"])
async def list_documentation():
    """
    List all available documentation resources.
    
    Returns links to all documentation endpoints and files.
    """
    base_url = "/api"
    
    return {
        "documentation_resources": {
            "interactive": {
                "swagger_ui": {
                    "url": "/docs",
                    "description": "Interactive API documentation with Swagger UI",
                    "format": "HTML"
                },
                "redoc": {
                    "url": "/redoc",
                    "description": "Interactive API documentation with ReDoc",
                    "format": "HTML"
                }
            },
            "specifications": {
                "openapi_json": {
                    "url": "/openapi.json",
                    "description": "OpenAPI 3.0 specification in JSON format",
                    "format": "JSON",
                    "use_cases": ["API testing", "Client generation"]
                },
                "openapi_yaml": {
                    "url": f"{base_url}/openapi.yaml",
                    "description": "OpenAPI 3.0 specification in YAML format",
                    "format": "YAML",
                    "use_cases": ["Postman import", "Code generation", "Mock servers"]
                }
            },
            "guides": {
                "api_documentation": {
                    "url": f"{base_url}/documentation",
                    "description": "Complete API reference with examples",
                    "format": "Markdown"
                },
                "quick_start": {
                    "url": f"{base_url}/quick-start",
                    "description": "Get started in 3 minutes",
                    "format": "Markdown"
                },
                "openapi_usage": {
                    "url": f"{base_url}/openapi-usage",
                    "description": "How to use the OpenAPI specification",
                    "format": "Markdown"
                }
            }
        },
        "tools": {
            "postman": "Import openapi.yaml into Postman for testing",
            "swagger_editor": "https://editor.swagger.io/ - Paste openapi.yaml content",
            "code_generators": "Use OpenAPI Generator to create client SDKs",
            "mock_server": "Use Prism (prism mock openapi.yaml) for testing"
        }
    }


# ============ Connect Cluster Shortcut ============
# This provides the /connect-cluster endpoint as requested

@app.post("/connect-cluster")
async def connect_cluster_shortcut(kubeconfig_path: str, context: str = None):
    """
    Shortcut endpoint to connect to a Kubernetes cluster.
    
    This is a convenience endpoint that wraps /clusters/connect.
    
    Args:
        kubeconfig_path: Path to the kubeconfig file
        context: Optional Kubernetes context to use
    """
    from app.schemas import ClusterConnectRequest
    from app.routers.clusters import connect_cluster
    
    request = ClusterConnectRequest(
        kubeconfig_path=kubeconfig_path,
        context=context
    )
    return await connect_cluster(request)
