import asyncpg
from typing import List, Optional, Dict
from datetime import date, datetime, time
from app.models.sleep import SleepStageResponse, SleepSummaryResponse


async def get_sleep_stages_by_date(
    db: asyncpg.Connection,
    local_date: str,
    user_id: Optional[str] = None
) -> List[SleepStageResponse]:
    """Get sleep stages for a specific date"""
    
    # Convert string date to date object and create datetime range
    try:
        date_obj = datetime.strptime(local_date, "%Y-%m-%d").date()
        # Create datetime range for the full day (typically sleep data spans across midnight)
        # We'll look for sleep data that starts within a wider range around the target date
        start_datetime = datetime.combine(date_obj, time(12, 0))  # Start from noon of the target date
        end_datetime = datetime.combine(date_obj, time(23, 59, 59))  # End at 11:59 PM next day
        # Add a day to end_datetime to cover sleep that goes past midnight
        from datetime import timedelta
        end_datetime = end_datetime + timedelta(days=1)
    except ValueError:
        raise ValueError(f"Invalid date format: {local_date}. Expected YYYY-MM-DD")
    
    query = """
        SELECT user_id, stage_uuid, start_time, end_time, sleep_stage, hk_value, source_name, upload_timestamp, created_at
        FROM sleep_analysis 
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
        SleepStageResponse(
            user_id=row['user_id'],
            stage_uuid=row['stage_uuid'],
            start_time=row['start_time'],
            end_time=row['end_time'],
            sleep_stage=row['sleep_stage'],
            hk_value=row['hk_value'],
            source_name=row['source_name'],
            upload_timestamp=row['upload_timestamp'],
            created_at=row['created_at']
        )
        for row in rows
    ]


async def get_sleep_summary_by_date(
    db: asyncpg.Connection,
    local_date: str,
    user_id: Optional[str] = None
) -> SleepSummaryResponse:
    """Get aggregated sleep summary for a specific date"""
    
    # Convert string date to date object and create datetime range
    try:
        date_obj = datetime.strptime(local_date, "%Y-%m-%d").date()
        # Create datetime range for the full day
        start_datetime = datetime.combine(date_obj, time(12, 0))  # Start from noon of the target date
        end_datetime = datetime.combine(date_obj, time(23, 59, 59))  # End at 11:59 PM next day
        from datetime import timedelta
        end_datetime = end_datetime + timedelta(days=1)
    except ValueError:
        raise ValueError(f"Invalid date format: {local_date}. Expected YYYY-MM-DD")
    
    # Query to get aggregated sleep data
    query = """
        SELECT 
            sleep_stage,
            SUM(EXTRACT(EPOCH FROM (end_time - start_time))/60) as total_minutes,
            COUNT(*) as stage_count,
            MIN(start_time) as earliest_start,
            MAX(end_time) as latest_end
        FROM sleep_analysis 
        WHERE start_time BETWEEN $1 AND $2
    """
    
    params = [start_datetime, end_datetime]
    
    # Add user_id filter if provided
    if user_id:
        query += " AND user_id = $3"
        params.append(user_id)
    
    query += " GROUP BY sleep_stage"
    
    rows = await db.fetch(query, *params)
    
    # Handle case where no data is found
    if not rows:
        raise ValueError("No sleep data found for the specified date")
    
    # Build sleep stages breakdown
    sleep_stages_breakdown = {}
    total_sleep_duration = 0
    total_stages_count = 0
    earliest_start = None
    latest_end = None
    
    for row in rows:
        stage = row['sleep_stage']
        minutes = int(row['total_minutes'] or 0)
        count = row['stage_count']
        
        sleep_stages_breakdown[stage] = minutes
        
        # Only count actual sleep stages (not AWAKE) towards total sleep duration
        if stage.upper() != 'AWAKE':
            total_sleep_duration += minutes
        
        total_stages_count += count
        
        # Track overall sleep period
        if earliest_start is None or row['earliest_start'] < earliest_start:
            earliest_start = row['earliest_start']
        if latest_end is None or row['latest_end'] > latest_end:
            latest_end = row['latest_end']
    
    # Calculate sleep efficiency (assuming total time in bed is from earliest start to latest end)
    if earliest_start and latest_end:
        total_time_in_bed = (latest_end - earliest_start).total_seconds() / 60  # minutes
        sleep_efficiency = (total_sleep_duration / total_time_in_bed) * 100 if total_time_in_bed > 0 else 0
    else:
        sleep_efficiency = 0
    
    return SleepSummaryResponse(
        user_id=user_id,
        local_date=date_obj,
        total_sleep_duration=total_sleep_duration,
        sleep_stages_breakdown=sleep_stages_breakdown,
        sleep_efficiency=round(sleep_efficiency, 2),
        sleep_start_time=earliest_start,
        sleep_end_time=latest_end,
        total_stages_count=total_stages_count
    )
