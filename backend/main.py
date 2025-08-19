from fastapi import FastAPI
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import create_db_pool, close_db_pool
from app.api.routes import steps, heart_rate, resting_heart_rate, sleep


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_db_pool()
    yield
    # Shutdown
    await close_db_pool()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    lifespan=lifespan
)

# Include routers
app.include_router(steps.router)
app.include_router(heart_rate.router)
app.include_router(resting_heart_rate.router)
app.include_router(sleep.router)


@app.get("/")
async def root():
    return {"message": "LichenHealth Backend API", "version": settings.version}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )