from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import asyncpg

from app.core.database import get_db
from app.models.heart_rate import HeartRateResponse, HeartRateAverageResponse
from app.services.heart_rate import get_heart_rate_by_time_range, get_heart_rate_average

# Prefix of every router is added on each route in this file
router = APIRouter(prefix="/api/v1/heart-rate", tags=["heart-rate"])


@router.get("/", response_model=List[HeartRateResponse])
async def get_heart_rate(
    start_time: str = Query(..., description="Start time in ISO format (e.g., 2025-08-12T00:00:00Z)"),
    end_time: str = Query(..., description="End time in ISO format (e.g., 2025-08-12T23:59:59Z)"),
    user_id: Optional[str] = Query(None, description="User ID filter"),
    db: asyncpg.Connection = Depends(get_db)
):
    """Get heart rate readings for a specific time range"""
    
    try:
        heart_rate_data = await get_heart_rate_by_time_range(db, start_time, end_time, user_id)
        return heart_rate_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/average", response_model=HeartRateAverageResponse)
async def get_heart_rate_avg(
    start_time: str = Query(..., description="Start time in ISO format (e.g., 2025-08-12T00:00:00Z)"),
    end_time: str = Query(..., description="End time in ISO format (e.g., 2025-08-12T23:59:59Z)"),
    user_id: Optional[str] = Query(None, description="User ID filter"),
    db: asyncpg.Connection = Depends(get_db)
):
    """Get average heart rate for a specific time range"""
    
    try:
        average_data = await get_heart_rate_average(db, start_time, end_time, user_id)
        return average_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/test")
async def test_connection(db: asyncpg.Connection = Depends(get_db)):
    """Test database connection"""
    
    try:
        result = await db.fetchval("SELECT COUNT(*) FROM heart_rate_data")
        return {"message": "Database connection successful", "total_records": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")
