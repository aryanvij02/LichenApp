from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import time
import logging

from app.core.config import settings
from app.core.database import create_db_pool, close_db_pool
from app.api.routes import steps, heart_rate, resting_heart_rate, sleep

# Simple logging setup
logging.basicConfig(level=getattr(logging, settings.log_level.upper()))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting LichenHealth Backend v{settings.version} in {settings.environment} mode")
    await create_db_pool()
    logger.info("Database connection pool created")
    yield
    # Shutdown
    logger.info("Shutting down LichenHealth Backend")
    await close_db_pool()
    logger.info("Database connection pool closed")


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    lifespan=lifespan,
)

# Simple CORS for mobile app - allow everything for now
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for now
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Simple request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    logger.info(f"{request.method} {request.url} - {response.status_code} - {process_time:.4f}s")
    
    return response

# Include routers
app.include_router(steps.router)
app.include_router(heart_rate.router)
app.include_router(resting_heart_rate.router)
app.include_router(sleep.router)


@app.get("/")
async def root():
    return {
        "message": "LichenHealth Backend API", 
        "version": settings.version,
        "environment": settings.environment,
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Enhanced health check for load balancer"""
    try:
        # Test database connection
        from app.core.database import pool
        if pool is None:
            raise HTTPException(status_code=503, detail="Database pool not initialized")
        
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        
        return {
            "status": "healthy",
            "version": settings.version,
            "environment": settings.environment,
            "database": "connected",
            "timestamp": time.time()
        }
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        raise HTTPException(status_code=503, detail=f"Health check failed: {str(e)}")


@app.get("/metrics")
async def metrics():
    """Basic metrics endpoint for monitoring"""
    from app.core.database import pool
    
    return {
        "database_pool": {
            "size": pool.get_size() if pool else 0,
            "available": pool.get_available_size() if pool else 0,
            "used": pool.get_size() - pool.get_available_size() if pool else 0,
        },
        "version": settings.version,
        "environment": settings.environment,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )