import json
import boto3
import os
import logging
import requests
from datetime import datetime
import uuid
from collections import defaultdict
from botocore.exceptions import ClientError
import base64
import pytz

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

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
            # Use the correct Supabase UPSERT approach
            headers['Prefer'] = 'resolution=merge-duplicates'
        
        response = requests.post(endpoint, json=data, headers=headers)
        
        # For UPSERT operations, 409 conflicts should be handled gracefully
        if response.status_code in [200, 201]:
            return response.json() if response.text else None
        elif response.status_code == 409 and upsert:
            # Handle conflict by updating existing record
            logger.info(f"Record exists, updating instead for table {table}")
            return self._handle_upsert_conflict(table, data[0])
        else:
            logger.error(f"Failed to insert into {table}: {response.status_code} {response.text}")
            raise Exception(f"Supabase insert failed: {response.status_code} - {response.text}")
    
    def _handle_upsert_conflict(self, table: str, data: dict):
        """Handle UPSERT conflict by updating the existing record"""
        try:
            # For user_profiles table, use user_id as the key
            if table == 'user_profiles' and 'user_id' in data:
                return self.update_user_profile(data['user_id'], data)
            else:
                # For other tables, try a generic update approach
                logger.warning(f"Conflict handling not implemented for table {table}")
                return None
        except Exception as e:
            logger.error(f"Failed to handle upsert conflict for {table}: {e}")
            return None
    
    def update_user_profile(self, user_id: str, profile_data: dict):
        """Update existing user profile"""
        endpoint = f"{self.url}/rest/v1/user_profiles"
        
        # Remove fields that shouldn't be updated on existing records
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
    
    
    def call_function(self, function_name: str, params: dict):
        """Call a Supabase stored function"""
        endpoint = f"{self.url}/rest/v1/rpc/{function_name}"
        response = requests.post(endpoint, json=params, headers=self.headers)
        
        if response.status_code not in [200, 201]:
            logger.error(f"Supabase function call failed: {response.status_code} {response.text}")
            raise Exception(f"Supabase function call failed: {response.status_code}")
        
        return response.json() if response.text else None

def sync_user_profile_to_supabase(user_id: str, upload_metadata: dict, supabase: SupabaseClient):
    """Sync user profile to Supabase during health data uploads"""
    try:
        current_time = datetime.utcnow().isoformat() + 'Z'
        
        # Create a basic profile from available metadata
        supabase_profile = {
            'user_id': user_id,
            'health_data_enabled': True,  # They're uploading health data
            'last_login_at': current_time,
            'profile_updated_at': current_time,
        }
        
        # Add any additional info from upload metadata
        if upload_metadata:
            if 'appVersion' in upload_metadata:
                supabase_profile['last_app_version'] = upload_metadata['appVersion']
            if 'platform' in upload_metadata:
                supabase_profile['last_platform'] = upload_metadata['platform']
            if 'timezone' in upload_metadata:
                supabase_profile['timezone'] = upload_metadata['timezone']
        
        # Remove None values
        supabase_profile = {k: v for k, v in supabase_profile.items() if v is not None}
        
        # Use upsert to update existing user or create minimal profile
        supabase.insert_data('user_profiles', [supabase_profile], upsert=True)
        logger.info(f"User profile synced to Supabase during health data upload for user: {user_id}")
        
    except Exception as e:
        logger.error(f"Failed to sync user profile to Supabase: {e}")
        raise e

def get_user_timezone_from_supabase(user_id: str, supabase: SupabaseClient) -> str:
    """Get user timezone from Supabase, fallback to default"""
    try:
        result = supabase.call_function('get_user_timezone', {'p_user_id': user_id})
        return result if result else 'America/Los_Angeles'
    except Exception as e:
        logger.warning(f"Could not get timezone for user {user_id}: {e}")
        return 'America/Los_Angeles'

def convert_to_local_date(utc_timestamp: str, timezone: str = 'America/Los_Angeles') -> str:
    """Convert UTC timestamp to local date string (YYYY-MM-DD)"""
    try:
        # Parse UTC timestamp and make it timezone-aware
        dt = datetime.fromisoformat(utc_timestamp.replace('Z', '+00:00'))
        
        # Ensure the datetime is in UTC
        if dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        elif dt.tzinfo != pytz.UTC:
            dt = dt.astimezone(pytz.UTC)
        
        # Convert to target timezone
        target_tz = pytz.timezone(timezone)
        local_dt = dt.astimezone(target_tz)
        
        # Return date in YYYY-MM-DD format
        return local_dt.strftime('%Y-%m-%d')
        
    except Exception as e:
        logger.warning(f"Error converting timestamp {utc_timestamp} to timezone {timezone}: {e}")
        # Fallback: try to extract date from UTC timestamp
        try:
            return utc_timestamp.split('T')[0]
        except:
            # Last resort fallback
            return datetime.now().strftime('%Y-%m-%d')

def map_sleep_stage(hk_sleep_stage: str) -> str:
    """Map HealthKit sleep stages to clean names"""
    stage_map = {
        'HKCategoryValueSleepAnalysisAsleepCore': 'CORE',
        'HKCategoryValueSleepAnalysisAsleepDeep': 'DEEP',
        'HKCategoryValueSleepAnalysisAsleepREM': 'REM',
        'HKCategoryValueSleepAnalysisAsleepLight': 'LIGHT',
        'HKCategoryValueSleepAnalysisAwake': 'AWAKE',
        'HKCategoryValueSleepAnalysisAsleepUnspecified': 'CORE'
    }
    return stage_map.get(hk_sleep_stage, 'CORE')

def process_sleep_data_for_supabase(data: dict, supabase: SupabaseClient) -> dict:
    """Process sleep analysis data and insert directly into sleep_analysis table"""
    user_id = data['user_id']
    samples = data['samples']
    
    if not samples:
        logger.warning("No sleep samples found")
        return {'status': 'skipped', 'reason': 'no_samples'}
    
    # Process all sleep stages directly (no session management needed)
    sleep_analysis_data = []
    
    for sample in samples:
        # Skip any InBed samples if they exist (we don't need them anymore)
        if sample.get('sleep_stage') == 'HKCategoryValueSleepAnalysisInBed':
            logger.info(f"Skipping InBed sample: {sample['uuid']}")
            continue
            
        sleep_analysis_data.append({
            'user_id': user_id,
            'stage_uuid': sample['uuid'],
            'time_range': f"[{sample['startDate']},{sample['endDate']})",
            'start_time': sample['startDate'],
            'end_time': sample['endDate'],
            'sleep_stage': map_sleep_stage(sample.get('sleep_stage', '')),
            'hk_value': sample.get('value', 0),
            'source_name': sample.get('sourceName', 'HealthKit')
        })
    
    if not sleep_analysis_data:
        logger.warning("No valid sleep stage samples found (only InBed or invalid samples)")
        return {'status': 'skipped', 'reason': 'no_valid_stages'}
    
    # Insert all sleep stages directly
    supabase.insert_data('sleep_analysis', sleep_analysis_data, upsert=True)
    
    # Calculate time range for logging
    start_times = [item['start_time'] for item in sleep_analysis_data]
    end_times = [item['end_time'] for item in sleep_analysis_data]
    time_range_start = min(start_times)
    time_range_end = max(end_times)
    
    logger.info(f"Processed {len(sleep_analysis_data)} sleep stages from {time_range_start} to {time_range_end}")
    
    return {
        'status': 'success', 
        'stages_count': len(sleep_analysis_data),
        'time_range': {
            'start': time_range_start,
            'end': time_range_end
        }
    }

def process_heart_rate_data_for_supabase(data: dict, supabase: SupabaseClient) -> dict:
    """Process heart rate data and insert into Supabase"""
    user_id = data['user_id']
    samples = data['samples']
    
    heart_rate_data = []
    for sample in samples:
        heart_rate_data.append({
            'user_id': user_id,
            'reading_uuid': sample['uuid'],
            'timestamp': sample['startDate'],
            'time_range': f"[{sample['startDate']},{sample['startDate']}]",  # Same start/end for HR
            'heart_rate': int(sample['value']),
            'unit': sample.get('unit', 'count/min'),
            'source_name': sample.get('sourceName', 'HealthKit')
        })
    
    # Batch insert heart rate data
    supabase.insert_data('heart_rate_data', heart_rate_data, upsert=True)
    logger.info(f"Processed {len(heart_rate_data)} heart rate readings from {min(s['startDate'] for s in samples)} to {max(s['startDate'] for s in samples)}")
    
    return {
        'status': 'success',
        'inserted_count': len(heart_rate_data),
        'time_range': {
            'start': min(s['startDate'] for s in samples),
            'end': max(s['startDate'] for s in samples)
        }
    }

def process_resting_heart_rate_data_for_supabase(data: dict, supabase: SupabaseClient) -> dict:
    """Process resting heart rate data and insert into Supabase"""
    user_id = data['user_id']
    samples = data['samples']
    
    # Get user timezone
    user_timezone = get_user_timezone_from_supabase(user_id, supabase)
    
    rh_data = []
    for sample in samples:
        local_date = convert_to_local_date(sample['startDate'], user_timezone)
        
        rh_data.append({
            'user_id': user_id,
            'reading_uuid': sample['uuid'],
            'timestamp': sample['startDate'],
            'local_date': local_date,
            'resting_heart_rate': int(sample['value']),
            'unit': sample.get('unit', 'count/min'),
            'source_name': sample.get('sourceName', 'HealthKit')
        })
    
    # Insert resting heart rate data
    supabase.insert_data('resting_heart_rate', rh_data, upsert=True)
    logger.info(f"Processed {len(rh_data)} resting heart rate readings")
    
    return {
        'status': 'success',
        'processed_days': len(rh_data),
        'dates': [d['local_date'] for d in rh_data]
    }

def process_steps_data_for_supabase(data: dict, supabase: SupabaseClient) -> dict:
    """Process steps data and insert into Supabase"""
    user_id = data['user_id']
    samples = data['samples']
    
    # Get user timezone
    user_timezone = get_user_timezone_from_supabase(user_id, supabase)
    
    # Insert raw step intervals
    interval_data = []
    for sample in samples:
        interval_data.append({
            'user_id': user_id,
            'interval_uuid': sample['uuid'],
            'time_range': f"[{sample['startDate']},{sample['endDate']})",
            'start_time': sample['startDate'],
            'end_time': sample['endDate'],
            'step_count': int(sample['value']),
            'unit': sample.get('unit', 'count'),
            'source_name': sample.get('sourceName', 'HealthKit')
        })
    
    supabase.insert_data('step_intervals', interval_data, upsert=True)
    logger.info(f"Processed {len(interval_data)} step intervals")
    
    # Aggregate steps by local date
    steps_by_day = {}
    for sample in samples:
        local_date = convert_to_local_date(sample['startDate'], user_timezone)
        steps_by_day[local_date] = steps_by_day.get(local_date, 0) + int(sample['value'])
    
    # Insert/update daily totals
    daily_data = []
    for date, total_steps in steps_by_day.items():
        daily_data.append({
            'user_id': user_id,
            'local_date': date,
            'total_steps': total_steps,
            'source_name': samples[0].get('sourceName', 'HealthKit') if samples else 'HealthKit'
        })
    
    supabase.insert_data('daily_steps', daily_data, upsert=True)
    logger.info(f"Processed {len(daily_data)} daily step totals")
    
    return {
        'status': 'success',
        'intervals_inserted': len(interval_data),
        'daily_totals': [{'date': d['local_date'], 'steps': d['total_steps']} for d in daily_data]
    }

def process_health_data_for_supabase(data: dict, supabase: SupabaseClient) -> dict:
    """Process health data based on type"""
    data_type = data.get('data_type', '')
    
    try:
        if data_type == 'HKCategoryTypeIdentifierSleepAnalysis':
            return process_sleep_data_for_supabase(data, supabase)
        elif data_type == 'HKQuantityTypeIdentifierHeartRate':
            return process_heart_rate_data_for_supabase(data, supabase)
        elif data_type == 'HKQuantityTypeIdentifierRestingHeartRate':
            return process_resting_heart_rate_data_for_supabase(data, supabase)
        elif data_type == 'HKQuantityTypeIdentifierStepCount':
            return process_steps_data_for_supabase(data, supabase)
        else:
            logger.warning(f"Unsupported data type: {data_type}")
            return {'status': 'skipped', 'reason': f'unsupported_type_{data_type}'}
    except Exception as e:
        logger.error(f"Error processing {data_type} for Supabase: {e}")
        return {'status': 'error', 'error': str(e)}

# Your existing functions (keeping them exactly as they are)
def load_existing_uuids(s3, bucket_name, user_id):
    """Load existing sample UUIDs for deduplication"""
    uuid_index_key = f"{user_id}/_uuid_index/uploaded_uuids.json"
    
    try:
        response = s3.get_object(Bucket=bucket_name, Key=uuid_index_key)
        existing_uuids = json.loads(response['Body'].read().decode('utf-8'))
        print(f"Loaded {len(existing_uuids)} existing UUIDs for deduplication")
        return set(existing_uuids)
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            print("No existing UUID index found, starting fresh")
            return set()
        else:
            print(f"Error loading UUID index: {e}")
            return set()

def save_uuid_index(s3, bucket_name, user_id, all_uuids):
    """Save updated UUID index for future deduplication"""
    uuid_index_key = f"{user_id}/_uuid_index/uploaded_uuids.json"
    
    try:
        s3.put_object(
            Bucket=bucket_name,
            Key=uuid_index_key,
            Body=json.dumps(list(all_uuids), indent=2),
            ContentType='application/json'
        )
        print(f"Updated UUID index with {len(all_uuids)} total UUIDs")
    except Exception as e:
        print(f"Error saving UUID index: {e}")

def filter_duplicate_samples(samples, existing_uuids):
    """Filter out samples with UUIDs that already exist"""
    new_samples = []
    duplicate_count = 0
    new_uuids = set()
    
    for sample in samples:
        sample_uuid = sample.get('uuid')
        if sample_uuid and sample_uuid in existing_uuids:
            duplicate_count += 1
            print(f"Skipping duplicate sample UUID: {sample_uuid}")
        else:
            new_samples.append(sample)
            if sample_uuid:
                new_uuids.add(sample_uuid)
    
    return new_samples, duplicate_count, new_uuids

def decode_jwt_token(token):
    """Decode JWT token to get user info (simplified - in production use proper JWT validation)"""
    try:
        # This is a simplified version - in production, properly validate the JWT signature
        parts = token.split('.')
        if len(parts) != 3:
            return None
        
        # Decode the payload (second part)
        payload = parts[1]
        # Add padding if needed
        payload += '=' * (4 - len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload)
        return json.loads(decoded)
    except Exception as e:
        print(f"Error decoding JWT: {e}")
        return None

def handle_user_profile(event, s3, bucket_name):
    """Handle user profile creation and updates - saves to both S3 and Supabase"""
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
            'createdAt': datetime.utcnow().isoformat()  # Will be overwritten if profile exists
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
        profile_key = f"{user_id}/_profile/user_profile.json"
        
        # Check if profile already exists in S3
        try:
            existing_response = s3.get_object(Bucket=bucket_name, Key=profile_key)
            existing_profile = json.loads(existing_response['Body'].read().decode('utf-8'))
            # Keep original creation date
            user_profile['createdAt'] = existing_profile.get('createdAt', user_profile['createdAt'])
            print(f"Updating existing profile for user: {user_id}")
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
                
                # Prepare data for Supabase user_profiles table
                current_time = datetime.utcnow().isoformat() + 'Z'
                supabase_profile = {
                    'user_id': user_profile['userId'],
                    'email': user_profile['email'],
                    'name': user_profile['name'],
                    'profile_picture_url': user_profile['profilePictureUrl'],
                    'timezone': user_profile['timezone'],
                    'locale': user_profile['locale'],
                    'country': user_profile['country'],
                    'region': user_profile['region'],
                    'health_data_enabled': True,  # Default to true since they're using the app
                    'notification_enabled': True,  # Default to true
                    'data_retention_days': 365,  # Default retention
                    'first_login_at': current_time,  # Will only be set on first insert
                    'last_login_at': current_time,
                    'profile_updated_at': current_time,
                    'auth_provider': 'google',  # Correct provider since you're using Google Sign-In
                    'provider_user_id': user_profile['userId'],
                    'last_app_version': user_profile['lastAppVersion'],
                    'last_platform': user_profile['lastPlatform']
                }
                
                # Remove None values
                supabase_profile = {k: v for k, v in supabase_profile.items() if v is not None}
                
                # Use upsert to handle existing users
                supabase.insert_data('user_profiles', [supabase_profile], upsert=True)
                supabase_result = 'success'
                logger.info(f"User profile synced to Supabase for user: {user_id}")
                
            except Exception as e:
                logger.error(f"Failed to sync user profile to Supabase: {e}")
                supabase_result = f'error: {str(e)}'
                # Continue execution - S3 save was successful
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

def handle_health_data_upload(event, s3, bucket_name):
    """Enhanced health data upload with Supabase integration"""
    # Parse the request body
    if 'body' not in event:
        return {
            'statusCode': 400,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({'error': 'No body in request'})
        }
    
    body = json.loads(event['body'])
    
    # Validate required fields
    if 'user_id' not in body or 'samples' not in body:
        return {
            'statusCode': 400,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({'error': 'Missing user_id or samples'})
        }
    
    user_id = body['user_id']
    samples = body['samples']
    batch_type = body.get('batch_type', 'realtime')
    upload_metadata = body.get('upload_metadata', {})
    
    # Initialize Supabase client if configured
    supabase = None
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')
    
    if supabase_url and supabase_key:
        try:
            supabase = SupabaseClient(supabase_url, supabase_key)
            logger.info("Supabase client initialized successfully")
            
            # Ensure user profile exists in Supabase (sync from upload metadata if available)
            try:
                sync_user_profile_to_supabase(user_id, upload_metadata, supabase)
            except Exception as e:
                logger.warning(f"Failed to sync user profile during health data upload: {e}")
                # Continue with health data processing even if profile sync fails
                
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            # Continue without Supabase - S3 storage will still work
    else:
        logger.warning("Supabase credentials not configured, skipping database processing")
    
    # Load existing UUIDs for deduplication
    existing_uuids = load_existing_uuids(s3, bucket_name, user_id)
    
    # Filter out duplicate samples based on UUID
    original_count = len(samples)
    samples, duplicate_count, new_uuids = filter_duplicate_samples(samples, existing_uuids)
    filtered_count = len(samples)
    
    print(f"Deduplication: {original_count} original samples → {filtered_count} new samples ({duplicate_count} duplicates skipped)")
    
    # If no new samples, return early
    if not samples:
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'status': 'success',
                'message': 'All samples were duplicates, nothing uploaded',
                'total_samples_received': original_count,
                'duplicate_samples_skipped': duplicate_count,
                'new_samples_uploaded': 0,
                'files_created': 0,
                'supabase_processing': 'skipped'
            })
        }
    
    # Process for Supabase FIRST (before S3 grouping)
    supabase_results = {}
    if supabase:
        try:
            # Prepare data for Supabase processing
            supabase_data = {
                'user_id': user_id,
                'samples': samples,
                'data_type': body.get('data_type'),
                'batch_type': batch_type,
                'upload_metadata': upload_metadata
            }
            
            # Try to infer data_type if not provided
            if not supabase_data['data_type'] and samples:
                supabase_data['data_type'] = samples[0].get('type', 'unknown')
            
            # Process health data for Supabase
            supabase_result = process_health_data_for_supabase(supabase_data, supabase)
            supabase_results = {
                'supabase_processing': 'success',
                'supabase_result': supabase_result
            }
            logger.info(f"Successfully processed {filtered_count} samples in Supabase")
            
            # Send notification about successful upload (SNS Notification)
            send_notification(
                user_id=user_id,
                data_type=supabase_data.get('data_type', 'unknown'),
                sample_count=filtered_count,
                supabase_result=supabase_result
            )
            
        except Exception as e:
            logger.error(f"Supabase processing failed: {e}")
            supabase_results = {
                'supabase_processing': 'error',
                'supabase_error': str(e)
            }
            # Continue with S3 processing even if Supabase fails
    
    # Your existing S3 processing logic (unchanged)
    grouped_samples = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    
    for sample in samples:
        source_name = sample.get('sourceName', 'unknown-source')
        data_type = sample.get('type', 'unknown-type')
        
        # Clean source name for file system (remove spaces, special chars)
        clean_source = source_name.replace(' ', '-').replace('/', '-').lower()
        
        # Extract year-month from sample date
        try:
            # Try startDate first, fallback to endDate
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
                
                # Clean data type for file system
                clean_data_type = data_type.replace('HKQuantityTypeIdentifier', '').replace('HKCategoryTypeIdentifier', '')
                
                # New hierarchical path: user/source/year-month/data-type/file.json
                filename = f"{user_id}/{source_name}/{year_month}/{clean_data_type}/{timestamp}-{batch_type}-{batch_id}.json"
                
                # Prepare data to store
                data_to_store = {
                    'user_id': user_id,
                    'data_source': source_name,
                    'original_source_name': type_samples[0].get('sourceName', 'unknown'),
                    'data_type': data_type,
                    'year_month': year_month,
                    'batch_type': batch_type,
                    'upload_timestamp': timestamp,
                    'batch_id': batch_id,
                    'sample_count': len(type_samples),
                    'samples': type_samples,
                    'upload_metadata': upload_metadata
                }
                
                # Upload to S3
                s3.put_object(
                    Bucket=bucket_name,
                    Key=filename,
                    Body=json.dumps(data_to_store, indent=2),
                    ContentType='application/json'
                )
                
                uploaded_files.append({
                    'filename': filename,
                    'source': source_name,
                    'year_month': year_month,
                    'data_type': clean_data_type,
                    'sample_count': len(type_samples)
                })
                total_samples_uploaded += len(type_samples)
                
                print(f"Successfully uploaded {len(type_samples)} {data_type} samples from {source_name} ({year_month}) to {filename}")
    
    # Update the UUID index with new UUIDs
    all_uuids = existing_uuids.union(new_uuids)
    save_uuid_index(s3, bucket_name, user_id, all_uuids)
    
    # Prepare response with both S3 and Supabase results
    response_data = {
        'status': 'success',
        'total_samples_received': original_count,
        'duplicate_samples_skipped': duplicate_count,
        'new_samples_uploaded': total_samples_uploaded,
        'files_created': len(uploaded_files),
        'uploaded_files': uploaded_files,
        'deduplication_enabled': True
    }
    
    # Add Supabase results to response
    response_data.update(supabase_results)
    
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        'body': json.dumps(response_data)
    }

def lambda_handler(event, context):
    """Main lambda handler that routes requests to appropriate functions"""
    print(f"Received event: {json.dumps(event)}")
    
    try:
        # Initialize S3 client
        s3 = boto3.client('s3')
        bucket_name = os.environ.get('S3_BUCKET_NAME', 'healthkit-data-lichen')
        
        # Handle OPTIONS requests for CORS
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
                },
                'body': ''
            }
        
        # Get the request path to route to appropriate handler
        path = event.get('path', '')
        
        if path.endswith('/user/profile'):
            return handle_user_profile(event, s3, bucket_name)
        elif path.endswith('/upload-health-data') or 'healthkit-data' in path:
            return handle_health_data_upload(event, s3, bucket_name)
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
            
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }

# Environment variables needed for Lambda:
"""
Required Environment Variables:
- SUPABASE_URL: https://your-project.supabase.co
- SUPABASE_SERVICE_KEY: your-service-role-key  
- S3_BUCKET_NAME: healthkit-data-lichen (optional, will default to this)

Dependencies to add to Lambda (requirements.txt):
requests==2.31.0
"""