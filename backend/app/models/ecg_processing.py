from pydantic import BaseModel
from typing import Optional


class ECGProcessingRequest(BaseModel):
    bucket_name: str
    voltage_s3_key: str
    sampling_frequency: float = 512.0


class ECGProcessingResponse(BaseModel):
    success: bool
    rmssd: Optional[float] = None
    sdnn: Optional[float] = None
    r_peaks_count: Optional[int] = None
    signal_length: Optional[int] = None
    sampling_frequency: Optional[float] = None
    error: Optional[str] = None
