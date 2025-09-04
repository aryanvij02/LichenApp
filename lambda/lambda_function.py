import json
import boto3
import os
import requests
import logging
from datetime import datetime
from botocore.exceptions import ClientError
import uuid

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

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

def lambda_handler(event, context):
    """
    ULTRA SIMPLE: Just store all incoming health data as raw JSON files
    No processing, no database, no complexity - just data collection
    """
    
    path = event.get('path', '').rstrip('/')
    
    if path.endswith('/user/profile'):
            return handle_user_profile(event, s3, bucket_name)
    if path == "/get-presigned-url":
        return handle_get_presigned_url(event, context)
    elif path == "/upload-health-data":
        return handle_health_data_upload(event, context)
    else:
        return {
            'statusCode': 404,
            'body': json.dumps({'error': 'Endpoint not found'})
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
        sample_uuid = body.get('sample_uuid')  # ECG sample UUID from iOS
        estimated_size = body.get('estimated_size', 0)  # Optional size hint
        
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
        
        # Generate presigned POST URL (more secure than PUT)
        # 15 minute expiration should be plenty for upload
        presigned_post = s3.generate_presigned_post(
            Bucket=bucket_name,
            Key=s3_key,
            Fields={
                'Content-Type': 'application/json'
            },
            Conditions=[
                {'Content-Type': 'application/json'},
                ['content-length-range', 1, 50485760]  # 1 byte to 50MB limit
            ],
            ExpiresIn=900  # 15 minutes
        )
        
        print(f"✅ Generated presigned URL for voltage data: {s3_key}")
        print(f"📊 Estimated size: {estimated_size} bytes")
        
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
        print(f"❌ JSON parsing error: {str(e)}")
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
        
    except Exception as e:
        print(f"❌ ERROR generating presigned URL: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': f'Failed to generate presigned URL: {str(e)}'})
        }
        
        
def handle_health_data_upload(event, context):
    print(f"🔍 RAW EVENT RECEIVED: {json.dumps(event, indent=2)}")
    
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
        
        # Create filename with timestamp
        timestamp = datetime.utcnow().strftime('%Y-%m-%d_%H-%M-%S')
        batch_id = str(uuid.uuid4())[:8]
        
        # Store EVERYTHING as raw JSON in raw_data folder
        filename = f"raw_data/{user_id}/{timestamp}_{batch_id}.json"
        
        # Add some metadata for context
        raw_dump = {
            'timestamp': timestamp,
            'batch_id': batch_id,
            'user_id': user_id,
            'sample_count': len(body.get('samples', [])),
            'batch_type': body.get('batch_type', 'unknown'), 
            'complete_payload': body,  # THE ENTIRE PAYLOAD
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
        
        print(f"✅ STORED RAW DATA: {filename}")
        print(f"📊 Sample count: {raw_dump['sample_count']}")
        
        # Log data types for quick analysis
        if 'samples' in body and body['samples']:
            data_types = {}
            for sample in body['samples']:
                sample_type = sample.get('type', 'unknown')
                data_types[sample_type] = data_types.get(sample_type, 0) + 1
            print(f"🏷️ Data types in this batch: {json.dumps(data_types, indent=2)}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'status': 'success',
                'message': 'Raw data stored to S3 successfully',
                'filename': filename,
                'sample_count': raw_dump['sample_count'],
                'batch_id': batch_id
            })
        }
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }

# That's it! No database, no processing, just raw data collection
# Perfect for understanding what we're actually receiving
