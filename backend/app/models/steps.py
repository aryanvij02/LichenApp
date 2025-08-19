from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional


class StepsResponse(BaseModel):
    user_id: str
    local_date: date
    total_steps: int
    source_name: str
    upload_timestamp: datetime
    created_at: datetime


class StepsQueryParams(BaseModel):
    local_date: str  # Format: YYYY-MM-DD
    user_id: Optional[str] = None  # Optional for now since no auth
    

class StepIntervalResponse(BaseModel):
    user_id: str
    interval_uuid: str
    start_time: datetime
    end_time: datetime
    step_count: int
    unit: str
    source_name: str
    upload_timestamp: datetime
    created_at: datetime


class StepsRangeResponse(BaseModel):
    user_id: str
    local_date: date
    total_steps: int
    source_name: str
    upload_timestamp: datetime
    created_at: datetime