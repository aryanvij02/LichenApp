from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import asyncpg

from app.core.database import get_db
from app.models.sleep import SleepStageResponse, SleepSummaryResponse
from app.services.sleep import get_sleep_stages_by_date, get_sleep_summary_by_date

# Prefix of every router is added on each route in this file
router = APIRouter(prefix="/api/v1/sleep", tags=["sleep"])


@router.get("/", response_model=List[SleepStageResponse])
async def get_sleep_stages(
    local_date: str = Query(..., description="Date in YYYY-MM-DD format"),
    user_id: Optional[str] = Query(None, description="User ID filter"),
    db: asyncpg.Connection = Depends(get_db)
):
    """Get sleep stages for a specific date"""
    
    try:
        sleep_data = await get_sleep_stages_by_date(db, local_date, user_id)
        return sleep_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/summary", response_model=SleepSummaryResponse)
async def get_sleep_summary(
    local_date: str = Query(..., description="Date in YYYY-MM-DD format"),
    user_id: Optional[str] = Query(None, description="User ID filter"),
    db: asyncpg.Connection = Depends(get_db)
):
    """Get aggregated sleep summary for a specific date"""
    
    try:
        summary_data = await get_sleep_summary_by_date(db, local_date, user_id)
        return summary_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/test")
async def test_connection(db: asyncpg.Connection = Depends(get_db)):
    """Test database connection"""
    
    try:
        result = await db.fetchval("SELECT COUNT(*) FROM sleep_analysis")
        return {"message": "Database connection successful", "total_records": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")
