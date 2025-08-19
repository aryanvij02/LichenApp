import asyncpg
from typing import List, Optional
from datetime import datetime
from app.models.heart_rate import HeartRateResponse, HeartRateAverageResponse


async def get_heart_rate_by_time_range(
    db: asyncpg.Connection,
    start_time: str,
    end_time: str,
    user_id: Optional[str] = None
) -> List[HeartRateResponse]:
    """Get heart rate readings for a specific time range"""
    
    # Convert string timestamps to datetime objects
    try:
        start_datetime = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_datetime = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    except ValueError:
        raise ValueError(f"Invalid datetime format. Expected ISO format (e.g., 2025-08-12T00:00:00Z)")
    
    query = """
        SELECT user_id, reading_uuid, timestamp, heart_rate, unit, source_name, upload_timestamp, created_at
        FROM heart_rate_data 
        WHERE timestamp BETWEEN $1 AND $2
    """
    
    params = [start_datetime, end_datetime]
    
    # Add user_id filter if provided
    if user_id:
        query += " AND user_id = $3"
        params.append(user_id)
    
    query += " ORDER BY timestamp ASC"
    
    rows = await db.fetch(query, *params)
    
    return [
        HeartRateResponse(
            user_id=row['user_id'],
            reading_uuid=row['reading_uuid'],
            timestamp=row['timestamp'],
            heart_rate=row['heart_rate'],
            unit=row['unit'],
            source_name=row['source_name'],
            upload_timestamp=row['upload_timestamp'],
            created_at=row['created_at']
        )
        for row in rows
    ]


async def get_heart_rate_average(
    db: asyncpg.Connection,
    start_time: str,
    end_time: str,
    user_id: Optional[str] = None
) -> HeartRateAverageResponse:
    """Get average heart rate for a specific time range"""
    
    # Convert string timestamps to datetime objects
    try:
        start_datetime = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_datetime = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    except ValueError:
        raise ValueError(f"Invalid datetime format. Expected ISO format (e.g., 2025-08-12T00:00:00Z)")
    
    query = """
        SELECT 
            AVG(heart_rate) as avg_hr,
            COUNT(*) as total_readings,
            MIN(heart_rate) as min_hr,
            MAX(heart_rate) as max_hr
        FROM heart_rate_data 
        WHERE timestamp BETWEEN $1 AND $2
    """
    
    params = [start_datetime, end_datetime]
    
    # Add user_id filter if provided
    if user_id:
        query += " AND user_id = $3"
        params.append(user_id)
    
    row = await db.fetchrow(query, *params)
    
    # Handle case where no data is found
    if row['avg_hr'] is None:
        raise ValueError("No heart rate data found for the specified time range")
    
    return HeartRateAverageResponse(
        user_id=user_id,
        start_time=start_datetime,
        end_time=end_datetime,
        average_heart_rate=float(row['avg_hr']),
        total_readings=row['total_readings'],
        min_heart_rate=row['min_hr'],
        max_heart_rate=row['max_hr']
    )
