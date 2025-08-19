import asyncpg
from typing import List, Optional
from datetime import date, datetime, time
from app.models.steps import StepsResponse, StepIntervalResponse, StepsRangeResponse


async def get_steps_by_date(
    db: asyncpg.Connection, 
    local_date: str, 
    user_id: Optional[str] = None
) -> List[StepsResponse]:
    """Get steps data for a specific date"""
    
    # Convert string date to date object
    try:
        date_obj = datetime.strptime(local_date, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"Invalid date format: {local_date}. Expected YYYY-MM-DD")
    
    query = """
        SELECT user_id, local_date, total_steps, source_name, upload_timestamp, created_at
        FROM daily_steps 
        WHERE local_date = $1
    """
    
    params = [date_obj]
    
    # Add user_id filter if provided
    if user_id:
        query += " AND user_id = $2"
        params.append(user_id)
    
    query += " ORDER BY created_at DESC"
    
    rows = await db.fetch(query, *params)
    
    return [
        StepsResponse(
            user_id=row['user_id'],
            local_date=row['local_date'],
            total_steps=row['total_steps'],
            source_name=row['source_name'],
            upload_timestamp=row['upload_timestamp'],
            created_at=row['created_at']
        )
        for row in rows
    ]


async def get_steps_by_date_range(
    db: asyncpg.Connection,
    start_date: str,
    end_date: str,
    user_id: Optional[str] = None
) -> List[StepsRangeResponse]:
    """Get steps data for a date range"""
    
    # Convert string dates to date objects
    try:
        start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"Invalid date format. Expected YYYY-MM-DD")
    
    query = """
        SELECT user_id, local_date, total_steps, source_name, upload_timestamp, created_at
        FROM daily_steps 
        WHERE local_date BETWEEN $1 AND $2
    """
    
    params = [start_date_obj, end_date_obj]
    
    # Add user_id filter if provided
    if user_id:
        query += " AND user_id = $3"
        params.append(user_id)
    
    query += " ORDER BY local_date ASC"
    
    rows = await db.fetch(query, *params)
    
    return [
        StepsRangeResponse(
            user_id=row['user_id'],
            local_date=row['local_date'],
            total_steps=row['total_steps'],
            source_name=row['source_name'],
            upload_timestamp=row['upload_timestamp'],
            created_at=row['created_at']
        )
        for row in rows
    ]


async def get_step_intervals_by_date(
    db: asyncpg.Connection,
    local_date: str,
    user_id: Optional[str] = None
) -> List[StepIntervalResponse]:
    """Get raw step intervals for a specific date"""
    
    # Convert string date to date object and create datetime range
    try:
        date_obj = datetime.strptime(local_date, "%Y-%m-%d").date()
        # Create datetime range for the full day
        start_datetime = datetime.combine(date_obj, time(0, 0))
        end_datetime = datetime.combine(date_obj, time(23, 59, 59))
    except ValueError:
        raise ValueError(f"Invalid date format: {local_date}. Expected YYYY-MM-DD")
    
    query = """
        SELECT user_id, interval_uuid, start_time, end_time, step_count, unit, source_name, upload_timestamp, created_at
        FROM step_intervals 
        WHERE start_time BETWEEN $1 AND $2
    """
    
    params = [start_datetime, end_datetime]
    
    # Add user_id filter if provided
    if user_id:
        query += " AND user_id = $3"
        params.append(user_id)
    
    query += " ORDER BY start_time ASC"
    
    rows = await db.fetch(query, *params)
    
    return [
        StepIntervalResponse(
            user_id=row['user_id'],
            interval_uuid=row['interval_uuid'],
            start_time=row['start_time'],
            end_time=row['end_time'],
            step_count=row['step_count'],
            unit=row['unit'],
            source_name=row['source_name'],
            upload_timestamp=row['upload_timestamp'],
            created_at=row['created_at']
        )
        for row in rows
    ]