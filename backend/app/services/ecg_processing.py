import json
import boto3
import logging
import numpy as np
import neurokit2 as nk
from botocore.exceptions import ClientError
from typing import Dict, Any
from app.models.ecg_processing import ECGProcessingResponse

logger = logging.getLogger(__name__)


class ECGProcessingService:
    """Service for processing ECG data using NeuroKit2"""
    
    def __init__(self):
        self.s3_client = boto3.client('s3')
    
    async def process_ecg_from_s3(self, bucket_name: str, voltage_s3_key: str, 
                                 sampling_frequency: float = 512.0) -> ECGProcessingResponse:
        """
        Fetch ECG voltage data from S3 and compute HRV metrics using NeuroKit2
        
        Args:
            bucket_name: S3 bucket name
            voltage_s3_key: S3 key for the voltage JSON file
            sampling_frequency: ECG sampling rate in Hz (default 512 for Apple Watch)
        
        Returns:
            ECGProcessingResponse with success status, rmssd, sdnn values, and any error messages
        """
        try:
            logger.info(f"Fetching ECG voltage data from S3: {voltage_s3_key}")
            
            # Step 1: Fetch voltage data from S3
            response = self.s3_client.get_object(Bucket=bucket_name, Key=voltage_s3_key)
            voltage_data = json.loads(response['Body'].read().decode('utf-8'))
            
            # Step 2: Extract voltage values from JSON
            # Try different possible key names for voltage data
            voltages = None
            for key in ['voltages', 'data', 'values', 'v']:
                if key in voltage_data:
                    voltages = voltage_data[key]
                    break
            
            # If data is in format [{"t": time, "v": voltage}, ...]
            if voltages is None and isinstance(voltage_data, list) and len(voltage_data) > 0:
                if isinstance(voltage_data[0], dict) and 'v' in voltage_data[0]:
                    voltages = [point["v"] for point in voltage_data]
                else:
                    voltages = voltage_data
            
            if voltages is None or len(voltages) == 0:
                return ECGProcessingResponse(
                    success=False,
                    error='No voltage data found in JSON'
                )
            
            # Step 3: Convert to numpy array
            ecg_signal = np.array(voltages, dtype=float)
            logger.info(f"Processing ECG signal: {len(ecg_signal)} samples at {sampling_frequency} Hz")
            
            # Step 4: Clean ECG signal
            cleaned_ecg = nk.ecg_clean(ecg_signal, sampling_rate=sampling_frequency, method="neurokit")
            
            # Step 5: Detect R-peaks
            signals, info = nk.ecg_peaks(cleaned_ecg, sampling_rate=sampling_frequency)
            
            # Step 6: Compute HRV time-domain metrics
            hrv_metrics = nk.hrv_time(signals, sampling_rate=sampling_frequency, show=False)
            
            # Step 7: Extract RMSSD and SDNN
            rmssd = float(hrv_metrics.loc[0, "HRV_RMSSD"]) if "HRV_RMSSD" in hrv_metrics.columns else None
            sdnn = float(hrv_metrics.loc[0, "HRV_SDNN"]) if "HRV_SDNN" in hrv_metrics.columns else None
            
            logger.info(f"HRV analysis completed: RMSSD={rmssd:.2f}ms, SDNN={sdnn:.2f}ms")
            
            return ECGProcessingResponse(
                success=True,
                rmssd=rmssd,
                sdnn=sdnn,
                r_peaks_count=len(info['ECG_R_Peaks']) if 'ECG_R_Peaks' in info else 0,
                signal_length=len(ecg_signal),
                sampling_frequency=sampling_frequency
            )
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logger.error(f"ECG voltage file not found in S3: {voltage_s3_key}")
                return ECGProcessingResponse(
                    success=False,
                    error='ECG voltage file not found in S3'
                )
            else:
                logger.error(f"S3 error fetching {voltage_s3_key}: {e}")
                return ECGProcessingResponse(
                    success=False,
                    error=f'S3 error: {str(e)}'
                )
        
        except Exception as e:
            logger.error(f"Error processing ECG data from {voltage_s3_key}: {e}")
            return ECGProcessingResponse(
                success=False,
                error=f'Processing failed: {str(e)}'
            )


# Create a singleton instance
ecg_service = ECGProcessingService()
