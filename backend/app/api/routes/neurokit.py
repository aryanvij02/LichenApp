from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import logging

from app.models.ecg_processing import ECGProcessingRequest, ECGProcessingResponse
from app.services.ecg_processing import ecg_service

logger = logging.getLogger(__name__)

# Prefix of every router is added on each route in this file
router = APIRouter(prefix="/api/v1/neurokit", tags=["neurokit"])


@router.post("/process-ecg", response_model=ECGProcessingResponse)
async def process_ecg(request: ECGProcessingRequest) -> ECGProcessingResponse:
    """
    Process ECG data from S3 and compute HRV metrics (RMSSD, SDNN) using NeuroKit2
    
    Args:
        request: ECGProcessingRequest containing bucket_name, voltage_s3_key, and sampling_frequency
    
    Returns:
        ECGProcessingResponse with HRV metrics or error information
    """
    try:
        logger.info(f"Processing ECG from S3: {request.bucket_name}/{request.voltage_s3_key}")
        
        result = await ecg_service.process_ecg_from_s3(
            bucket_name=request.bucket_name,
            voltage_s3_key=request.voltage_s3_key,
            sampling_frequency=request.sampling_frequency
        )
        
        if result.success:
            logger.info(f"ECG processing successful: RMSSD={result.rmssd}, SDNN={result.sdnn}")
        else:
            logger.warning(f"ECG processing failed: {result.error}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in ECG processing endpoint: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Internal server error during ECG processing: {str(e)}"
        )


