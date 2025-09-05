import json
import boto3
import os
import requests
import logging
from datetime import datetime, date
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


class HealthDataProcessor:
    """Processes different types of health data for storage in Supabase"""
    
    def __init__(self, supabase_client: SupabaseClient, user_id: str, upload_timestamp: str):
        self.supabase = supabase_client
        self.user_id = user_id
        self.upload_timestamp = upload_timestamp
    
    def process_heart_rate_data(self, samples: List[Dict]) -> Dict[str, Any]:
        """Process HKQuantityTypeIdentifierHeartRate samples"""
        processed_records = []
        
        for sample in samples:
            try:
                start_date = sample['startDate']
                end_date = sample['endDate']
                
                record = {
                    'user_id': self.user_id,
                    'reading_uuid': sample['uuid'],
                    'start_date': start_date,
                    'end_date': end_date,
                    'time_range': f"[{start_date},{end_date})",
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
                
                record = {
                    'user_id': self.user_id,
                    'interval_uuid': sample['uuid'],
                    'time_range': f"[{start_date},{end_date})",
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
            # TODO: Aggregate to daily_steps table
            
        return {
            'type': 'step_intervals',
            'processed': len(processed_intervals),
            'total_samples': len(samples)
        }
    
    def process_sleep_data(self, samples: List[Dict]) -> Dict[str, Any]:
        """Process HKCategoryTypeIdentifierSleepAnalysis samples"""
        processed_records = []
        
        for sample in samples:
            try:
                start_date = sample['startDate']
                end_date = sample['endDate']
                
                # Create metadata for sleep session
                metadata = {
                    'local_date': datetime.fromisoformat(start_date.replace('Z', '+00:00')).date().isoformat(),
                    'source_name': sample['sourceName'],
                    'upload_timestamp': self.upload_timestamp,
                    'created_at': datetime.utcnow().isoformat() + 'Z'
                }
                
                # Create sleep stage entry
                sleep_stage = {
                    'start_time': start_date,
                    'end_time': end_date,
                    'created_at': datetime.utcnow().isoformat() + 'Z',
                    'time_range': f"[{start_date},{end_date})",
                    'sleep_stage': sample.get('sleep_stage', 'unknown'),
                    'hk_value': sample.get('value', '0')
                }
                
                record = {
                    'user_id': self.user_id,
                    'reading_uuid': sample['uuid'],
                    'time_range': f"[{start_date},{end_date})",
                    'start_date': start_date,
                    'end_date': end_date,
                    'metadata': metadata,
                    'sleep_stages': [sleep_stage]  # Single stage for now
                }
                processed_records.append(record)
                
            except Exception as e:
                logger.error(f"Error processing sleep sample {sample.get('uuid', 'unknown')}: {e}")
        
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

                result = call_fastapi_ecg_processing(
                    self.bucket_name, 
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
        profile_key = f"{user_id}/_profile/user_profile.json"
        
        # Check if profile already exists in S3
        try:
            existing_response = s3.get_object(Bucket=bucket_name, Key=profile_key)
            existing_profile = json.loads(existing_response['Body'].read().decode('utf-8'))
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
                    'health_data_enabled': True,
                    'notification_enabled': True,
                    'data_retention_days': 365,
                    'first_login_at': current_time,
                    'last_login_at': current_time,
                    'profile_updated_at': current_time,
                    'auth_provider': 'google',
                    'provider_user_id': user_profile['userId'],
                    'last_app_version': user_profile['lastAppVersion'],
                    'last_platform': user_profile['lastPlatform']
                }
                
                supabase_profile = {k: v for k, v in supabase_profile.items() if v is not None}
                supabase.insert_data('user_profiles', [supabase_profile], upsert=True)
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
        
        # Create filename with timestamp
        timestamp = datetime.utcnow().strftime('%Y-%m-%d_%H-%M-%S')
        batch_id = str(uuid.uuid4())[:8]
        
        # Store raw data in S3 (keep existing functionality)
        filename = f"raw_data/{user_id}/{timestamp}_{batch_id}.json"
        raw_dump = {
            'timestamp': timestamp,
            'batch_id': batch_id,
            'user_id': user_id,
            'sample_count': len(samples),
            'batch_type': body.get('batch_type', 'unknown'), 
            'complete_payload': body,
            'lambda_event': {
                'headers': event.get('headers', {}),
                'path': event.get('path', ''),
                'httpMethod': event.get('httpMethod', '')
            }
        }
        
        # Upload raw JSON to S3
        s3.put_object(
            Bucket=bucket_name,
            Key=filename,
            Body=json.dumps(raw_dump, indent=2),
            ContentType='application/json'
        )
        
        print(f"STORED RAW DATA: {filename}")
        print(f"Sample count: {raw_dump['sample_count']}")
        
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