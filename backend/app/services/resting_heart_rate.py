import asyncpg
from typing import List, Optional
from datetime import date, datetime
from app.models.resting_heart_rate import RestingHeartRateResponse


async def get_resting_heart_rate_by_date_range(
    db: asyncpg.Connection,
    start_date: str,
    end_date: Optional[str] = None,
    user_id: Optional[str] = None
) -> List[RestingHeartRateResponse]:
    """Get resting heart rate data for a specific date or date range"""
    
    # Convert string dates to date objects
    try:
        start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        if end_date:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        else:
            end_date_obj = start_date_obj  # Single date query
    except ValueError:
        raise ValueError(f"Invalid date format. Expected YYYY-MM-DD")
    
    query = """
        SELECT user_id, reading_uuid, timestamp, local_date, resting_heart_rate, unit, source_name, upload_timestamp, created_at
        FROM resting_heart_rate 
        WHERE local_date BETWEEN $1 AND $2
    """
    
    params = [start_date_obj, end_date_obj]
    
    # Add user_id filter if provided
    if user_id:
        query += " AND user_id = $3"
        params.append(user_id)
    
    query += " ORDER BY local_date DESC"
    
    rows = await db.fetch(query, *params)
    
    return [
        RestingHeartRateResponse(
            user_id=row['user_id'],
            reading_uuid=row['reading_uuid'],
            timestamp=row['timestamp'],
            local_date=row['local_date'],
            resting_heart_rate=row['resting_heart_rate'],
            unit=row['unit'],
            source_name=row['source_name'],
            upload_timestamp=row['upload_timestamp'],
            created_at=row['created_at']
        )
        for row in rows
    ]
