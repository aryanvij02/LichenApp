from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import asyncpg

from app.core.database import get_db
from app.models.steps import StepsResponse, StepIntervalResponse, StepsRangeResponse
from app.services.steps import get_steps_by_date, get_steps_by_date_range, get_step_intervals_by_date

#Prefix of every router is added on each route in this file
router = APIRouter(prefix="/api/v1/steps", tags=["steps"])


@router.get("/", response_model=List[StepsResponse])
async def get_steps(
    local_date: str = Query(..., description="Date in YYYY-MM-DD format"),
    user_id: Optional[str] = Query(None, description="User ID filter"),
    db: asyncpg.Connection = Depends(get_db)
):
    """Get steps data for a specific date"""
    
    try:
        steps_data = await get_steps_by_date(db, local_date, user_id)
        return steps_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/range", response_model=List[StepsRangeResponse])
async def get_steps_range(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
    user_id: Optional[str] = Query(None, description="User ID filter"),
    db: asyncpg.Connection = Depends(get_db)
):
    """Get steps data for a date range"""
    
    try:
        steps_data = await get_steps_by_date_range(db, start_date, end_date, user_id)
        return steps_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/intervals", response_model=List[StepIntervalResponse])
async def get_step_intervals(
    local_date: str = Query(..., description="Date in YYYY-MM-DD format"),
    user_id: Optional[str] = Query(None, description="User ID filter"),
    db: asyncpg.Connection = Depends(get_db)
):
    """Get raw step intervals for a specific date"""
    
    try:
        intervals_data = await get_step_intervals_by_date(db, local_date, user_id)
        return intervals_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/test")
async def test_connection(db: asyncpg.Connection = Depends(get_db)):
    """Test database connection"""
    
    try:
        result = await db.fetchval("SELECT COUNT(*) FROM daily_steps")
        return {"message": "Database connection successful", "total_records": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")