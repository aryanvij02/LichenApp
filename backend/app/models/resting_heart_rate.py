from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional


class RestingHeartRateResponse(BaseModel):
    user_id: str
    reading_uuid: str
    timestamp: datetime
    local_date: date
    resting_heart_rate: int
    unit: str
    source_name: str
    upload_timestamp: datetime
    created_at: datetime
