"""
Kyverno Policy Manager API

FastAPI application for managing Kyverno policies across Kubernetes clusters.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import logging

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
        "features": [
            "Kubernetes cluster management",
            "Kyverno policy templates",
            "Policy deployment",
            "Compliance reporting",
        ],
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
