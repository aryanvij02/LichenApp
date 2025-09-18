import json
import boto3
import os
import requests
import logging
import pytz
from datetime import datetime, date, timedelta
from collections import defaultdict
from botocore.exceptions import ClientError
import uuid
from typing import List, Dict, Any

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

#Sending SNS Notification
def send_notification(user_id: str, data_type: str, sample_count: int, supabase_result: dict):
    """Send SNS notification about new health data upload"""
    try:
        ##REMEMBER TO DEFINE THIS ENV VARIABLE IN THE LAMBDA FUNCTION ENVIRONMENT VARIABLES
        sns = boto3.client('sns')
        topic_arn = os.environ.get('SNS_TOPIC_ARN')
        
        if not topic_arn:
            logger.warning("SNS_TOPIC_ARN not configured, skipping notification")
            return
        
        # Create notification message
        message = f"""
            New Health Data Upload Alert

            User ID: {user_id}
            Data Type: {data_type}
            Sample Count: {sample_count}
            Supabase Status: {supabase_result.get('status', 'unknown')}
            Timestamp: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC

            Details: {json.dumps(supabase_result, indent=2)}
        """.strip()
        
        sns.publish(
            TopicArn=topic_arn,
            Subject=f"Health Data Upload - {data_type} ({sample_count} samples)",
            Message=message
        )
        
        logger.info(f"SNS notification sent for {user_id} - {data_type}")
        
    except Exception as e:
        logger.error(f"Failed to send SNS notification: {e}")


def call_fastapi_ecg_processing(bucket_name: str, voltage_s3_key: str, sampling_frequency: float) -> Dict[str, Any]:
    """Call FastAPI backend to process ECG data"""
    try:
        backend_url = os.environ.get('FASTAPI_BACKEND_URL')
        if not backend_url:
            logger.error("FASTAPI_BACKEND_URL environment variable not set")
            return {
                'success': False,
                'error': 'Backend URL not configured',
                'rmssd': None,
                'sdnn': None
            }
        
        # Prepare the request payload
        payload = {
            'bucket_name': bucket_name,
            'voltage_s3_key': voltage_s3_key,
            'sampling_frequency': sampling_frequency
        }
        
        # Make HTTP request to FastAPI endpoint
        response = requests.post(
            f"{backend_url}/api/v1/neurokit/process-ecg",
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=60  # 60 second timeout for ECG processing
        )
        
        if response.status_code == 200:
            result = response.json()
            logger.info(f"ECG processing successful via FastAPI: RMSSD={result.get('rmssd')}, SDNN={result.get('sdnn')}")
            return result
        else:
            logger.error(f"FastAPI ECG processing failed: {response.status_code} - {response.text}")
            return {
                'success': False,
                'error': f'FastAPI error: {response.status_code}',
                'rmssd': None,
                'sdnn': None
            }
            
    except requests.exceptions.Timeout:
        logger.error("FastAPI ECG processing timed out")
        return {
            'success': False,
            'error': 'Processing timeout',
            'rmssd': None,
            'sdnn': None
        }
    except Exception as e:
        logger.error(f"Error calling FastAPI ECG processing: {e}")
        return {
            'success': False,
            'error': f'FastAPI call failed: {str(e)}',
            'rmssd': None,
            'sdnn': None
        }


class SupabaseClient:
    def __init__(self, url: str, service_key: str):
        self.url = url.rstrip('/')
        self.service_key = service_key
        self.headers = {
            'apikey': service_key,
            'Authorization': f'Bearer {service_key}',
            'Content-Type': 'application/json'
        }
    
    def insert_data(self, table: str, data: list, upsert: bool = False, conflict_columns: list = None):
        """Insert data into Supabase table with proper UPSERT support"""
        endpoint = f"{self.url}/rest/v1/{table}"
        
        headers = self.headers.copy()
        if upsert:
            headers['Prefer'] = 'resolution=merge-duplicates'
        
        response = requests.post(endpoint, json=data, headers=headers)
        
        if response.status_code in [200, 201]:
            return response.json() if response.text else None
        elif response.status_code == 409 and upsert:
            logger.info(f"Record exists, updating instead for table {table}")
            return self._handle_upsert_conflict(table, data[0])
        else:
            logger.error(f"Failed to insert into {table}: {response.status_code} {response.text}")
            raise Exception(f"Supabase insert failed: {response.status_code} - {response.text}")
    
    def _handle_upsert_conflict(self, table: str, data: dict):
        """Handle UPSERT conflict by updating the existing record"""
        try:
            if table == 'user_profiles' and 'user_id' in data:
                return self.update_user_profile(data['user_id'], data)
            else:
                logger.warning(f"Conflict handling not implemented for table {table}")
                return None
        except Exception as e:
            logger.error(f"Failed to handle upsert conflict for {table}: {e}")
            return None
    
    def update_user_profile(self, user_id: str, profile_data: dict):
        """Update existing user profile"""
        endpoint = f"{self.url}/rest/v1/user_profiles"
        
        update_data = {k: v for k, v in profile_data.items() 
                      if k not in ['user_id', 'first_login_at', 'created_at']}
        
        response = requests.patch(
            endpoint,
            json=update_data,
            headers={**self.headers, 'Prefer': 'return=representation'},
            params={'user_id': f'eq.{user_id}'}
        )
        
        if response.status_code in [200, 204]:
            logger.info(f"Successfully updated user profile for {user_id}")
            return response.json() if response.text else {'updated': True}
        else:
            logger.error(f"Failed to update user profile: {response.status_code} {response.text}")
            raise Exception(f"Failed to update user profile: {response.status_code}")
    
    def update_user_last_synced(self, user_id: str):
        """Update user's last_synced_at timestamp after successful health data upload"""
        try:
            endpoint = f"{self.url}/rest/v1/user_profiles"
            current_time = datetime.utcnow().isoformat() + 'Z'
            
            update_data = {
                'last_synced_at': current_time
            }
            
            response = requests.patch(
                endpoint,
                json=update_data,
                headers=self.headers,
                params={'user_id': f'eq.{user_id}'}
            )
            
            if response.status_code in [200, 204]:
                logger.info(f"Successfully updated last_synced_at for user {user_id}")
                return True
            else:
                logger.warning(f"Failed to update last_synced_at for user {user_id}: {response.status_code} {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error updating last_synced_at for user {user_id}: {e}")
            return False


class HealthDataProcessor:
    """Processes different types of health data for storage in Supabase"""
    
    def __init__(self, supabase_client: SupabaseClient, user_id: str, upload_timestamp: str):
        self.supabase = supabase_client
        self.user_id = user_id
        self.upload_timestamp = upload_timestamp
    
    def format_timestamp_for_postgres(self, iso_timestamp: str) -> str:
        """Convert ISO 8601 timestamp to PostgreSQL format for tstzrange
        
        Args:
            iso_timestamp: ISO 8601 format like "2024-01-15T08:00:00.000Z"
        
        Returns:
            PostgreSQL format like "2024-01-15 08:00:00+00"
        """
        return iso_timestamp.replace('T', ' ').replace('.000Z', '+00')
    
    def get_user_timezone(self) -> str:
        """Get user's timezone from user_profiles table
        
        Returns:
            Timezone string, defaults to 'America/Los_Angeles' if not found
        """
        try:
            # Direct REST API call since user_id is now the primary key
            response = requests.get(
                f"{self.supabase.url}/rest/v1/user_profiles",
                headers=self.supabase.headers,
                params={'user_id': f'eq.{self.user_id}', 'select': 'timezone'}
            )
            
            if response.status_code == 200:
                users = response.json()
                if users and len(users) > 0 and users[0].get('timezone'):
                    return users[0]['timezone']
        except Exception as e:
            logger.warning(f"Could not fetch timezone for user {self.user_id}: {e}")
        
        return 'America/Los_Angeles'  # Default fallback
    
    def convert_utc_to_local_date(self, utc_timestamp: str, timezone_str: str) -> str:
        """Convert UTC timestamp to local date string
        
        Args:
            utc_timestamp: ISO 8601 UTC timestamp like "2024-01-15T08:00:00.000Z"
            timezone_str: Timezone string like "America/Los_Angeles"
        
        Returns:
            Local date string like "2024-01-15"
        """
        
        # Parse UTC timestamp
        utc_dt = datetime.fromisoformat(utc_timestamp.replace('Z', '+00:00'))
        
        # Convert to local timezone
        local_tz = pytz.timezone(timezone_str)
        local_dt = utc_dt.astimezone(local_tz)
        
        # Return date string
        return local_dt.date().isoformat()
    
    def aggregate_to_daily_steps(self, processed_intervals: List[Dict]) -> None:
        """Aggregate step intervals to daily_steps table
        
        Args:
            processed_intervals: List of step interval records that were just inserted
        """
        if not processed_intervals:
            return
        
        try:
            # Get user's timezone once for this batch
            user_timezone = self.get_user_timezone()
            logger.info(f"Aggregating {len(processed_intervals)} step intervals using timezone: {user_timezone}")
            
            # Group intervals by (local_date, source_name)
            daily_groups = {}
            for interval in processed_intervals:
                local_date = self.convert_utc_to_local_date(interval['start_date'], user_timezone)
                source_name = interval['source_name']
                key = (local_date, source_name)
                
                if key not in daily_groups:
                    daily_groups[key] = []
                daily_groups[key].append(interval)
            
            # Process each daily group
            for (local_date, source_name), intervals in daily_groups.items():
                self._upsert_daily_steps(local_date, source_name, intervals)
                
        except Exception as e:
            logger.error(f"Error aggregating step intervals to daily_steps: {e}")
    
    #Upsert means appending to the existing row
    def _upsert_daily_steps(self, local_date: str, source_name: str, intervals: List[Dict]) -> None:
        """Upsert daily steps record for a specific date and source
        
        Args:
            local_date: Local date string like "2024-01-15"
            source_name: Source name like "Apple Watch"
            intervals: List of step intervals for this date/source
        """
        try:
            # Get existing daily_steps record if it exists
            existing_response = self.supabase.table('daily_steps').select('*').eq('user_id', self.user_id).eq('local_date', local_date).eq('source_name', source_name).execute()
            
            # Prepare new interval data
            new_interval_uuids = [interval['interval_uuid'] for interval in intervals]
            new_total_steps = sum(interval['step_count'] for interval in intervals)
            
            if existing_response.data and len(existing_response.data) > 0:
                # Update existing record
                existing = existing_response.data[0]
                existing_interval_uuids = existing.get('step_intervals', [])
                
                # Filter out duplicate intervals
                unique_new_uuids = [uuid for uuid in new_interval_uuids if uuid not in existing_interval_uuids]
                
                if unique_new_uuids:
                    # Calculate steps only from new intervals
                    unique_new_steps = sum(interval['step_count'] for interval in intervals if interval['interval_uuid'] in unique_new_uuids)
                    
                    updated_record = {
                        'total_steps': existing['total_steps'] + unique_new_steps,
                        'step_intervals': existing_interval_uuids + unique_new_uuids,
                        'upload_timestamp': self.upload_timestamp
                    }
                    
                    self.supabase.table('daily_steps').update(updated_record).eq('id', existing['id']).execute()
                    logger.info(f"Updated daily_steps for {local_date}/{source_name}: +{unique_new_steps} steps ({len(unique_new_uuids)} new intervals)")
                else:
                    logger.info(f"No new intervals for {local_date}/{source_name}, skipping duplicate intervals")
            else:
                # Create new record
                new_record = {
                    'user_id': self.user_id,
                    'local_date': local_date,
                    'source_name': source_name,
                    'total_steps': new_total_steps,
                    'step_intervals': new_interval_uuids,
                    'upload_timestamp': self.upload_timestamp
                }
                
                self.supabase.table('daily_steps').insert(new_record).execute()
                logger.info(f"Created new daily_steps for {local_date}/{source_name}: {new_total_steps} steps ({len(new_interval_uuids)} intervals)")
                
        except Exception as e:
            logger.error(f"Error upserting daily_steps for {local_date}/{source_name}: {e}")
    
    def process_heart_rate_data(self, samples: List[Dict]) -> Dict[str, Any]:
        """Process HKQuantityTypeIdentifierHeartRate samples"""
        processed_records = []
        
        for sample in samples:
            try:
                start_date = sample['startDate']
                end_date = sample['endDate']
                
                # Convert ISO 8601 timestamps to PostgreSQL format for tstzrange
                start_pg = self.format_timestamp_for_postgres(start_date)
                end_pg = self.format_timestamp_for_postgres(end_date)
                
                record = {
                    'user_id': self.user_id,
                    'reading_uuid': sample['uuid'],
                    'start_date': start_date,
                    'end_date': end_date,
                    'time_range': f"[{start_pg},{end_pg})",
                    'heart_rate': int(sample['value']),
                    'unit': sample.get('unit', 'count/min'),
                    'source_name': sample['sourceName'],
                    'upload_timestamp': self.upload_timestamp
                }
                processed_records.append(record)
                
            except Exception as e:
                logger.error(f"Error processing heart rate sample {sample.get('uuid', 'unknown')}: {e}")
        
        if processed_records:
            self.supabase.insert_data('heart_rate_data', processed_records, upsert=True)
            
        return {
            'type': 'heart_rate_data',
            'processed': len(processed_records),
            'total_samples': len(samples)
        }
    
    def process_resting_heart_rate(self, samples: List[Dict]) -> Dict[str, Any]:
        """Process HKQuantityTypeIdentifierRestingHeartRate samples"""
        processed_records = []
        
        for sample in samples:
            try:
                start_date = sample['startDate']
                end_date = sample['endDate']
                
                record = {
                    'user_id': self.user_id,
                    'reading_uuid': sample['uuid'],
                    'timestamp': start_date,
                    'start_date': start_date,
                    'end_date': end_date,
                    'resting_heart_rate': int(sample['value']),
                    'unit': sample.get('unit', 'count/min'),
                    'source_name': sample['sourceName'],
                    'upload_timestamp': self.upload_timestamp
                }
                processed_records.append(record)
                
            except Exception as e:
                logger.error(f"Error processing resting HR sample {sample.get('uuid', 'unknown')}: {e}")
        
        if processed_records:
            self.supabase.insert_data('resting_heart_rate', processed_records, upsert=True)
            
        return {
            'type': 'resting_heart_rate',
            'processed': len(processed_records),
            'total_samples': len(samples)
        }
    
    def process_step_data(self, samples: List[Dict]) -> Dict[str, Any]:
        """Process HKQuantityTypeIdentifierStepCount samples"""
        processed_intervals = []
        
        for sample in samples:
            try:
                start_date = sample['startDate']
                end_date = sample['endDate']
                
                # Convert ISO 8601 timestamps to PostgreSQL format for tstzrange
                start_pg = self.format_timestamp_for_postgres(start_date)
                end_pg = self.format_timestamp_for_postgres(end_date)
                
                record = {
                    'user_id': self.user_id,
                    'interval_uuid': sample['uuid'],
                    'time_range': f"[{start_pg},{end_pg})",
                    'start_date': start_date,
                    'end_date': end_date,
                    'step_count': int(sample['value']),
                    'unit': sample.get('unit', 'count'),
                    'source_name': sample['sourceName'],
                    'upload_timestamp': self.upload_timestamp
                }
                processed_intervals.append(record)
                
            except Exception as e:
                logger.error(f"Error processing step sample {sample.get('uuid', 'unknown')}: {e}")
        
        if processed_intervals:
            self.supabase.insert_data('step_intervals', processed_intervals, upsert=True)
            # Aggregate to daily_steps table
            self.aggregate_to_daily_steps(processed_intervals)
            
        return {
            'type': 'step_intervals',
            'processed': len(processed_intervals),
            'total_samples': len(samples)
        }
    
    def determine_sleep_date(self, utc_timestamp: str, user_timezone: str) -> str:
        """Determine sleep date using 3PM cutoff in user's timezone
        
        Args:
            utc_timestamp: UTC timestamp in ISO format
            user_timezone: User's timezone string (e.g., 'America/Los_Angeles')
            
        Returns:
            Sleep date in YYYY-MM-DD format
        """
        from zoneinfo import ZoneInfo
        
        # Parse UTC timestamp and convert to user's timezone
        utc_dt = datetime.fromisoformat(utc_timestamp.replace('Z', '+00:00'))
        local_dt = utc_dt.astimezone(ZoneInfo(user_timezone))
        
        # If time is before 3PM (15:00), assign to previous day
        if local_dt.hour < 15:
            sleep_date = (local_dt.date() - timedelta(days=1)).isoformat()
        else:
            sleep_date = local_dt.date().isoformat()
            
        return sleep_date
    
    def group_sleep_entries_by_date_and_gaps(self, samples: List[Dict], user_timezone: str) -> Dict[str, List[List[Dict]]]:
        """Group sleep entries by sleep date, then by 2-hour gaps within each date
        
        Args:
            samples: List of sleep stage entries
            user_timezone: User's timezone string
            
        Returns:
            Dict mapping sleep_date to list of session groups
        """
        if not samples:
            return {}
            
        # First, assign sleep_date to each sample and group by date
        samples_with_sleep_date = []
        for sample in samples:
            sleep_date = self.determine_sleep_date(sample['startDate'], user_timezone)
            sample['sleep_date'] = sleep_date
            samples_with_sleep_date.append(sample)
        
        # Group by sleep_date
        date_groups = {}
        for sample in samples_with_sleep_date:
            sleep_date = sample['sleep_date']
            if sleep_date not in date_groups:
                date_groups[sleep_date] = []
            date_groups[sleep_date].append(sample)
        
        # Within each date, apply 2-hour gap clustering
        final_groups = {}
        for sleep_date, date_samples in date_groups.items():
            # Sort by start time
            date_samples.sort(key=lambda x: x['startDate'])
            
            # Apply gap-based clustering (2 hours = 7200 seconds)
            session_groups = []
            current_group = [date_samples[0]]
            
            for i in range(1, len(date_samples)):
                prev_end = datetime.fromisoformat(date_samples[i-1]['endDate'].replace('Z', '+00:00'))
                curr_start = datetime.fromisoformat(date_samples[i]['startDate'].replace('Z', '+00:00'))
                gap_hours = (curr_start - prev_end).total_seconds() / 3600
                
                if gap_hours <= 2.0:  # Less than or equal to 2 hours gap
                    current_group.append(date_samples[i])
                else:  # More than 2 hours gap - start new session
                    session_groups.append(current_group)
                    current_group = [date_samples[i]]
            
            # Don't forget the last group
            session_groups.append(current_group)
            final_groups[sleep_date] = session_groups
            
        return final_groups

    def create_sleep_session_record(self, session_entries: List[Dict], sleep_date: str) -> Dict:
        """Create a single sleep session record from grouped entries
        
        Args:
            session_entries: List of sleep stage entries for this session
            sleep_date: The sleep date for this session
            
        Returns:
            Sleep session record for database insertion
        """
        # Sort entries by start time
        session_entries.sort(key=lambda x: x['startDate'])
        
        # Overall session bounds
        start_time = session_entries[0]['startDate']
        end_time = session_entries[-1]['endDate']
        
        # Convert to PostgreSQL format
        start_pg = self.format_timestamp_for_postgres(start_time)
        end_pg = self.format_timestamp_for_postgres(end_time)
        
        # Create sleep_stages array
        sleep_stages = []
        for entry in session_entries:
            stage_start_pg = self.format_timestamp_for_postgres(entry['startDate'])
            stage_end_pg = self.format_timestamp_for_postgres(entry['endDate'])
            
            stage = {
                'start_time': entry['startDate'],
                'end_time': entry['endDate'],
                'created_at': datetime.utcnow().isoformat() + 'Z',
                'time_range': f"[{stage_start_pg},{stage_end_pg})",
                'sleep_stage': entry.get('sleep_stage', 'unknown'),
                'hk_value': str(entry.get('value', '0'))
            }
            sleep_stages.append(stage)
        
        # Create composite UUID based on session timing
        session_uuid = f"session_{self.user_id}_{sleep_date}_{start_time.replace(':', '').replace('-', '').replace('T', '').replace('Z', '')}"
        
        # Create metadata
        metadata = {
            'sleep_date': sleep_date,
            'source_name': session_entries[0]['sourceName'],
            'upload_timestamp': self.upload_timestamp,
            'created_at': datetime.utcnow().isoformat() + 'Z',
            'total_stages': len(sleep_stages),
            'session_duration_minutes': int((datetime.fromisoformat(end_time.replace('Z', '+00:00')) - 
                                           datetime.fromisoformat(start_time.replace('Z', '+00:00'))).total_seconds() / 60)
        }
        
        return {
            'user_id': self.user_id,
            'reading_uuid': session_uuid,
            'time_range': f"[{start_pg},{end_pg})",
            'start_date': start_time,
            'end_date': end_time,
            'metadata': metadata,
            'sleep_stages': sleep_stages
        }

    def process_sleep_data(self, samples: List[Dict]) -> Dict[str, Any]:
        """Process HKCategoryTypeIdentifierSleepAnalysis samples with smart grouping"""
        if not samples:
            return {
                'type': 'sleep_sessions',
                'processed': 0,
                'total_samples': 0
            }
        
        processed_records = []
        
        try:
            # Get user's timezone
            user_timezone = self.get_user_timezone()
            logger.info(f"Processing sleep data for user {self.user_id} in timezone {user_timezone}")
            
            # Group entries by sleep date and gaps
            grouped_sessions = self.group_sleep_entries_by_date_and_gaps(samples, user_timezone)
            
            # Create sleep session records
            total_sessions = 0
            for sleep_date, session_groups in grouped_sessions.items():
                for session_entries in session_groups:
                    session_record = self.create_sleep_session_record(session_entries, sleep_date)
                    processed_records.append(session_record)
                    total_sessions += 1
            
            logger.info(f"Created {total_sessions} sleep sessions from {len(samples)} individual entries")
            
        except Exception as e:
            logger.error(f"Error processing sleep data: {e}")
            # Fallback to individual processing if grouping fails
            for sample in samples:
                try:
                    start_date = sample['startDate']
                    end_date = sample['endDate']
                    start_pg = self.format_timestamp_for_postgres(start_date)
                    end_pg = self.format_timestamp_for_postgres(end_date)
                    
                    metadata = {
                        'local_date': datetime.fromisoformat(start_date.replace('Z', '+00:00')).date().isoformat(),
                        'source_name': sample['sourceName'],
                        'upload_timestamp': self.upload_timestamp,
                        'created_at': datetime.utcnow().isoformat() + 'Z'
                    }
                    
                    sleep_stage = {
                        'start_time': start_date,
                        'end_time': end_date,
                        'created_at': datetime.utcnow().isoformat() + 'Z',
                        'time_range': f"[{start_pg},{end_pg})",
                        'sleep_stage': sample.get('sleep_stage', 'unknown'),
                        'hk_value': str(sample.get('value', '0'))
                    }
                    
                    record = {
                        'user_id': self.user_id,
                        'reading_uuid': sample['uuid'],
                        'time_range': f"[{start_pg},{end_pg})",
                        'start_date': start_date,
                        'end_date': end_date,
                        'metadata': metadata,
                        'sleep_stages': [sleep_stage]
                    }
                    processed_records.append(record)
                    
                except Exception as sample_error:
                    logger.error(f"Error processing individual sleep sample {sample.get('uuid', 'unknown')}: {sample_error}")
        
        # Insert into database
        if processed_records:
            self.supabase.insert_data('sleep_sessions', processed_records, upsert=True)
            
        return {
            'type': 'sleep_sessions',
            'processed': len(processed_records),
            'total_samples': len(samples)
        }
    
    def process_ecg_data(self, samples: List[Dict]) -> Dict[str, Any]:
        """Process HKDataTypeIdentifierElectrocardiogram samples"""
        processed_records = []
        
        for sample in samples:
            try:
                start_date = sample['startDate']
                end_date = sample['endDate']

                bucket_name = os.environ.get('S3_BUCKET_NAME', 'healthkit-data-lichen')

                result = call_fastapi_ecg_processing(
                    bucket_name, 
                    sample.get('voltageS3Key'), 
                    float(sample.get('samplingFrequency', 512.0))
                )

                if result['success']:
                    sdnn = result['sdnn']
                    rmssd = result['rmssd']
                else:
                    print("Neurokit failed")
                    break
                
                record = {
                    'user_id': self.user_id,
                    'reading_uuid': sample['uuid'],
                    'timestamp': start_date,
                    'start_date': start_date,
                    'end_date': end_date,
                    'volatage_s3_key': sample.get('voltageS3Key'),
                    'source_name': sample['sourceName'],
                    'accuracy': 'ECG',
                    'sdnn': sdnn,  # ECG doesn't provide SDNN directly
                    'rmssd': rmssd,  # Will be calculated by NeuroKit
                    'average_heart_rate': int(sample['averageHeartRate']) if sample.get('averageHeartRate') else None,
                    'sampling_frequency': float(sample['samplingFrequency']) if sample.get('samplingFrequency') else None,
                    'voltage_points_count': int(sample['voltagePointsCount']) if sample.get('voltagePointsCount') else None,
                    'number_of_voltage_measurements': int(sample['numberOfVoltageMeasurements']) if sample.get('numberOfVoltageMeasurements') else None,
                    'ecg_classification': sample.get('ecgClassification'),
                    'voltage_data_uploaded': bool(int(sample.get('voltageDataUploaded', '0'))),
                    'symptom_status': sample.get('symptomsStatus'),
                    'upload_timestamp': self.upload_timestamp
                }
                processed_records.append(record)
                
            except Exception as e:
                logger.error(f"Error processing ECG sample {sample.get('uuid', 'unknown')}: {e}")
        
        if processed_records:
            self.supabase.insert_data('heart_rate_variability', processed_records, upsert=True)
            
        return {
            'type': 'heart_rate_variability (ECG)',
            'processed': len(processed_records),
            'total_samples': len(samples)
        }
    
    def process_hrv_sdnn_data(self, samples: List[Dict]) -> Dict[str, Any]:
        """Process HKQuantityTypeIdentifierHeartRateVariabilitySDNN samples"""
        processed_records = []
        
        for sample in samples:
            try:
                start_date = sample['startDate']
                end_date = sample['endDate']
                
                record = {
                    'user_id': self.user_id,
                    'reading_uuid': sample['uuid'],
                    'timestamp': start_date,
                    'start_date': start_date,
                    'end_date': end_date,
                    'volatage_s3_key': None,
                    'source_name': sample['sourceName'],
                    'accuracy': 'Apple',
                    'sdnn': float(sample['value']) if sample.get('value') else None,
                    'rmssd': None,  # Apple doesn't provide RMSSD
                    'average_heart_rate': None,
                    'sampling_frequency': None,
                    'voltage_points_count': None,
                    'number_of_voltage_measurements': None,
                    'ecg_classification': None,
                    'voltage_data_uploaded': False,
                    'symptom_status': None,
                    'upload_timestamp': self.upload_timestamp
                }
                processed_records.append(record)
                
            except Exception as e:
                logger.error(f"Error processing HRV SDNN sample {sample.get('uuid', 'unknown')}: {e}")
        
        if processed_records:
            self.supabase.insert_data('heart_rate_variability', processed_records, upsert=True)
            
        return {
            'type': 'heart_rate_variability (SDNN)',
            'processed': len(processed_records),
            'total_samples': len(samples)
        }


def process_health_data_to_supabase(samples: List[Dict], user_id: str, supabase: SupabaseClient) -> Dict[str, Any]:
    """Main function to process and store health data in Supabase"""
    upload_timestamp = datetime.utcnow().isoformat() + 'Z'
    processor = HealthDataProcessor(supabase, user_id, upload_timestamp)
    
    # Group samples by type
    grouped_samples = {}
    for sample in samples:
        sample_type = sample.get('type', 'unknown')
        if sample_type not in grouped_samples:
            grouped_samples[sample_type] = []
        grouped_samples[sample_type].append(sample)
    
    # Process each type
    processing_results = []
    
    # Define type mapping to processor methods
    TYPE_PROCESSORS = {
        'HKQuantityTypeIdentifierHeartRate': processor.process_heart_rate_data,
        'HKQuantityTypeIdentifierRestingHeartRate': processor.process_resting_heart_rate,
        'HKQuantityTypeIdentifierStepCount': processor.process_step_data,
        'HKCategoryTypeIdentifierSleepAnalysis': processor.process_sleep_data,
        'HKDataTypeIdentifierElectrocardiogram': processor.process_ecg_data,
        'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': processor.process_hrv_sdnn_data
    }
    
    for sample_type, sample_list in grouped_samples.items():
        try:
            if sample_type in TYPE_PROCESSORS:
                result = TYPE_PROCESSORS[sample_type](sample_list)
                processing_results.append(result)
                logger.info(f"Processed {result['processed']}/{result['total_samples']} {sample_type} samples")
            else:
                logger.info(f"Skipping unsupported type: {sample_type} ({len(sample_list)} samples)")
                processing_results.append({
                    'type': sample_type,
                    'processed': 0,
                    'total_samples': len(sample_list),
                    'status': 'skipped - unsupported type'
                })
        except Exception as e:
            logger.error(f"Error processing {sample_type}: {e}")
            processing_results.append({
                'type': sample_type,
                'processed': 0,
                'total_samples': len(sample_list),
                'status': f'error: {str(e)}'
            })
    
    return {
        'total_samples': len(samples),
        'unique_types': len(grouped_samples),
        'processing_results': processing_results,
        'upload_timestamp': upload_timestamp
    }


def handle_user_profile(event, s3, bucket_name):
    """Handle user profile creation and updates - saves to both S3 and Supabase"""
    logger.info("handle_user_profile function called")
    logger.info(f"Event body: {event.get('body', 'NO_BODY')}")
    try:
        body = json.loads(event['body'])
        
        # Extract user profile data
        user_profile = {
            'userId': body.get('userId'),
            'email': body.get('email'),
            'name': body.get('name'),
            'profilePictureUrl': body.get('profilePictureUrl'),
            'timezone': body.get('timezone'),
            'locale': body.get('locale'),
            'country': body.get('country'),
            'region': body.get('region'),
            'lastAppVersion': body.get('lastAppVersion'),
            'lastPlatform': body.get('lastPlatform'),
            'lastUpdated': datetime.utcnow().isoformat(),
            'createdAt': datetime.utcnow().isoformat()
        }
        
        # Validate required fields
        if not user_profile['userId'] or not user_profile['email']:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
                },
                'body': json.dumps({'error': 'Missing required fields: userId and email'})
            }
        
        user_id = user_profile['userId']
        profile_key = f"{user_id}/profile/user-profile/user_profile.json"
        
        # Check if profile already exists in S3
        try:
            existing_response = s3.get_object(Bucket=bucket_name, Key=profile_key)
            existing_profile = json.loads(existing_response['Body'].read().decode('utf-8'))
            user_profile['createdAt'] = existing_profile.get('createdAt', user_profile['createdAt'])
            print(f"Updating existing profile for user: {user_id}")
            ##Just sending noti for check
            send_notification(user_id, 'profile_updated', 1, {})
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                print(f"Creating new profile for user: {user_id}")
            else:
                raise e
        
        # Save user profile to S3
        s3.put_object(
            Bucket=bucket_name,
            Key=profile_key,
            Body=json.dumps(user_profile, indent=2),
            ContentType='application/json'
        )
        
        # Initialize Supabase client and save to database
        supabase_url = os.environ.get('SUPABASE_URL')
        supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')
        supabase_result = None
        
        if supabase_url and supabase_key:
            try:
                supabase = SupabaseClient(supabase_url, supabase_key)
                
                current_time = datetime.utcnow().isoformat() + 'Z'
                supabase_profile = {
                    'user_id': user_profile['userId'],  # Now the primary key
                    'email': user_profile['email'],
                    'name': user_profile['name'],
                    'profile_picture_url': user_profile['profilePictureUrl'],
                    'timezone': user_profile['timezone'],
                    'locale': user_profile['locale'],
                    'country': user_profile['country'],
                    'region': user_profile['region'],
                    'health_data_enabled': True,
                    'notification_enabled': True,
                    'data_retention_days': 365,
                    'first_login_at': current_time,  # Will be ignored on conflict
                    'last_login_at': current_time,
                    'profile_updated_at': current_time,
                    'auth_provider': 'google',
                    'provider_user_id': user_profile['userId'],
                    'last_app_version': user_profile['lastAppVersion'],
                    'last_platform': user_profile['lastPlatform']
                    # last_synced_at will remain NULL until first health data upload
                }
                
                # Remove None values
                supabase_profile = {k: v for k, v in supabase_profile.items() if v is not None}
                
                # Simple upsert with user_id as primary key
                upsert_response = requests.post(
                    f"{supabase_url}/rest/v1/user_profiles",
                    headers={
                        'apikey': supabase_key,
                        'Authorization': f'Bearer {supabase_key}',
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates,return=representation'
                    },
                    json=[supabase_profile]
                )
                
                if upsert_response.status_code in [200, 201]:
                    supabase_result = 'success'
                    logger.info(f"User profile upserted successfully for user: {user_id}")
                else:
                    raise Exception(f"Upsert failed: {upsert_response.status_code} - {upsert_response.text}")
                
                supabase_result = 'success'
                logger.info(f"User profile synced to Supabase for user: {user_id}")
                
            except Exception as e:
                logger.error(f"Failed to sync user profile to Supabase: {e}")
                supabase_result = f'error: {str(e)}'
        else:
            logger.warning("Supabase credentials not configured, skipping user profile sync")
            supabase_result = 'skipped: no credentials'
        
        print(f"User profile saved successfully for: {user_profile['email']}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
            },
            'body': json.dumps({
                'status': 'success',
                'message': 'User profile saved successfully',
                'userId': user_id,
                'supabase_sync': supabase_result
            })
        }
        
    except Exception as e:
        print(f"Error in handle_user_profile: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
            },
            'body': json.dumps({'error': f'Failed to save user profile: {str(e)}'})
        }


def handle_get_presigned_url(event, context):
    try:
        # Initialize S3 client
        s3 = boto3.client('s3')
        bucket_name = os.environ.get('S3_BUCKET_NAME', 'healthkit-data-lichen')
        
        # Handle CORS preflight
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': ''
            }
        
        # Parse request body
        if 'body' not in event:
            return {'statusCode': 400, 'body': json.dumps({'error': 'No body provided'})}
        
        body = json.loads(event['body'])
        
        # Extract required parameters
        user_id = body.get('user_id')
        sample_uuid = body.get('sample_uuid')
        estimated_size = body.get('estimated_size', 0)
        
        if not user_id or not sample_uuid:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Missing required fields: user_id and sample_uuid'
                })
            }
        
        # Generate unique S3 key for voltage data
        timestamp = datetime.utcnow().strftime('%Y-%m-%d_%H-%M-%S')
        s3_key = f"ecg_voltage/{user_id}/{sample_uuid}_{timestamp}.json"
        
        # Generate presigned POST URL
        presigned_post = s3.generate_presigned_post(
            Bucket=bucket_name,
            Key=s3_key,
            Fields={
                'Content-Type': 'application/json'
            },
            Conditions=[
                {'Content-Type': 'application/json'},
                ['content-length-range', 1, 50485760]
            ],
            ExpiresIn=900
        )
        
        print(f"Generated presigned URL for voltage data: {s3_key}")
        print(f"Estimated size: {estimated_size} bytes")
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'status': 'success',
                'message': 'Presigned URL generated successfully',
                's3_key': s3_key,
                'upload_url': presigned_post['url'],
                'upload_fields': presigned_post['fields'],
                'expires_in_minutes': 15
            })
        }
        
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {str(e)}")
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
        
    except Exception as e:
        print(f"ERROR generating presigned URL: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': f'Failed to generate presigned URL: {str(e)}'})
        }


def handle_health_data_upload(event, context):
    print(f"RAW EVENT RECEIVED: {json.dumps(event, indent=2)}")
    
    try:
        # Initialize S3
        s3 = boto3.client('s3')
        bucket_name = os.environ.get('S3_BUCKET_NAME', 'healthkit-data-lichen')
        
        # Handle CORS
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': ''
            }
        
        # Parse body
        if 'body' not in event:
            return {'statusCode': 400, 'body': json.dumps({'error': 'No body'})}
        
        body = json.loads(event['body'])
        user_id = body.get('user_id', 'unknown_user')
        samples = body.get('samples', [])
    
        # Group samples by source, year-month, and data type
        grouped_samples = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
        
        for sample in samples:
            source_name = sample.get('sourceName', 'unknown-source')
            data_type = sample.get('type', 'unknown-type')
            
            # Clean source name for file system
            clean_source = source_name.replace(' ', '-').replace('/', '-').lower()
            
            # Extract year-month from sample date
            try:
                sample_date = sample.get('startDate') or sample.get('endDate')
                if sample_date:
                    date_obj = datetime.fromisoformat(sample_date.replace('Z', '+00:00'))
                    year_month = date_obj.strftime('%Y-%m')
                else:
                    year_month = 'unknown-date'
            except:
                year_month = 'unknown-date'
            
            grouped_samples[clean_source][year_month][data_type].append(sample)
        
        uploaded_files = []
        total_samples_uploaded = 0
        
        # Create separate files for each source/year-month/data-type combination
        for source_name, months_data in grouped_samples.items():
            for year_month, types_data in months_data.items():
                for data_type, type_samples in types_data.items():
                    # Create filename with timestamp
                    timestamp = datetime.utcnow().strftime('%Y-%m-%d-%H-%M-%S')
                    batch_id = str(uuid.uuid4())[:8]
                    batch_type = body.get('batch_type', 'health-data')
                    
                    # Clean data type for file system
                    clean_data_type = data_type.replace('HKQuantityTypeIdentifier', '').replace('HKCategoryTypeIdentifier', '')
                    
                    # Hierarchical path: user/source/year-month/data-type/file.json
                    filename = f"{user_id}/{source_name}/{year_month}/{clean_data_type}/{timestamp}-{batch_type}-{batch_id}.json"
                    
                    # Prepare data to store
                    file_data = {
                        'timestamp': timestamp,
                        'batch_id': batch_id,
                        'user_id': user_id,
                        'source_name': source_name,
                        'data_type': data_type,
                        'year_month': year_month,
                        'sample_count': len(type_samples),
                        'batch_type': batch_type,
                        'samples': type_samples,
                        'lambda_event': {
                            'headers': event.get('headers', {}),
                            'path': event.get('path', ''),
                            'httpMethod': event.get('httpMethod', '')
                        }
                    }
                    
                    # Upload to S3
                    s3.put_object(
                        Bucket=bucket_name,
                        Key=filename,
                        Body=json.dumps(file_data, indent=2),
                        ContentType='application/json'
                    )
                    
                    uploaded_files.append({
                        'filename': filename,
                        'sample_count': len(type_samples),
                        'data_type': data_type,
                        'source': source_name,
                        'year_month': year_month
                    })
                    total_samples_uploaded += len(type_samples)
                    
                    print(f"STORED ORGANIZED DATA: {filename} ({len(type_samples)} samples)")
        
        # Process health data to Supabase
        supabase_result = None
        supabase_url = os.environ.get('SUPABASE_URL')
        supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')
        
        if supabase_url and supabase_key and samples:
            try:
                supabase = SupabaseClient(supabase_url, supabase_key)
                # Pass S3 client and bucket name for ECG analysis
                supabase_result = process_health_data_to_supabase(samples, user_id, supabase)
                logger.info(f"Successfully processed {supabase_result['total_samples']} samples to Supabase")
                
                # Update user's last_synced_at timestamp after successful data processing
                sync_updated = supabase.update_user_last_synced(user_id)
                if sync_updated:
                    logger.info(f"Updated last_synced_at for user {user_id}")
                else:
                    logger.warning(f"Failed to update last_synced_at for user {user_id}")
                
                send_notification(
                    user_id=user_id,
                    data_type='health_data',  # or determine from supabase_result
                    sample_count=len(samples),
                    supabase_result=supabase_result
                )
            except Exception as e:
                logger.error(f"Failed to process data to Supabase: {e}")
                supabase_result = {'error': str(e)}
        else:
            logger.warning("Supabase credentials not configured or no samples provided")
            supabase_result = {'error': 'No Supabase credentials or no samples'}
        
        # Log data types for analysis
        if samples:
            data_types = {}
            for sample in samples:
                sample_type = sample.get('type', 'unknown')
                data_types[sample_type] = data_types.get(sample_type, 0) + 1
            print(f"Data types in this batch: {json.dumps(data_types, indent=2)}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'status': 'success',
                'message': 'Health data processed successfully',
                'raw_data_storage': {
                    'filename': filename,
                    'total_samples': len(samples),
                    'batch_id': batch_id,
                    'timestamp': timestamp
                },
                'supabase_processing': supabase_result
            })
        }
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }


def lambda_handler(event, context):
    """Main Lambda handler"""
    logger.info(f"Lambda invoked with path: {event.get('path', 'NO_PATH')}")
    logger.info(f"HTTP method: {event.get('httpMethod', 'NO_METHOD')}")
    logger.info(f"Full event: {json.dumps(event, default=str)}")
    
    s3 = boto3.client('s3')
    bucket_name = os.environ.get('S3_BUCKET_NAME', 'healthkit-data-lichen')
    
    path = event.get('path', '').rstrip('/')
    
    if path.endswith('/user/profile'):
        return handle_user_profile(event, s3, bucket_name)
    elif path == "/get-presigned-url":
        return handle_get_presigned_url(event, context)
    elif path == "/upload-health-data":
        return handle_health_data_upload(event, context)
    else:
        return {
            'statusCode': 404,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
            },
            'body': json.dumps({'error': 'Endpoint not found'})
        }
        