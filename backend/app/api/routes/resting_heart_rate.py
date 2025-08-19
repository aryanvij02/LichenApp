from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import asyncpg

from app.core.database import get_db
from app.models.resting_heart_rate import RestingHeartRateResponse
from app.services.resting_heart_rate import get_resting_heart_rate_by_date_range

# Prefix of every router is added on each route in this file
router = APIRouter(prefix="/api/v1/resting-heart-rate", tags=["resting-heart-rate"])


@router.get("/", response_model=List[RestingHeartRateResponse])
async def get_resting_heart_rate(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: Optional[str] = Query(None, description="End date in YYYY-MM-DD format (optional for single date)"),
    user_id: Optional[str] = Query(None, description="User ID filter"),
    db: asyncpg.Connection = Depends(get_db)
):
    """Get resting heart rate data for a specific date or date range"""
    
    try:
        resting_hr_data = await get_resting_heart_rate_by_date_range(db, start_date, end_date, user_id)
        return resting_hr_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/test")
async def test_connection(db: asyncpg.Connection = Depends(get_db)):
    """Test database connection"""
    
    try:
        result = await db.fetchval("SELECT COUNT(*) FROM resting_heart_rate")
        return {"message": "Database connection successful", "total_records": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")
