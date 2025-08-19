from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional, Dict


class SleepStageResponse(BaseModel):
    user_id: str
    stage_uuid: str
    start_time: datetime
    end_time: datetime
    sleep_stage: str
    hk_value: int
    source_name: str
    upload_timestamp: datetime
    created_at: datetime


class SleepSummaryResponse(BaseModel):
    user_id: Optional[str]
    local_date: date
    total_sleep_duration: int  # Total sleep in minutes
    sleep_stages_breakdown: Dict[str, int]  # e.g., {"CORE": 180, "REM": 90, "DEEP": 120}
    sleep_efficiency: float  # Percentage (0-100)
    sleep_start_time: Optional[datetime]
    sleep_end_time: Optional[datetime]
    total_stages_count: int
