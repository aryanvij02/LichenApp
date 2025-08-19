from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class HeartRateResponse(BaseModel):
    user_id: str
    reading_uuid: str
    timestamp: datetime
    heart_rate: int
    unit: str
    source_name: str
    upload_timestamp: datetime
    created_at: datetime


class HeartRateAverageResponse(BaseModel):
    user_id: Optional[str]
    start_time: datetime
    end_time: datetime
    average_heart_rate: float
    total_readings: int
    min_heart_rate: int
    max_heart_rate: int
