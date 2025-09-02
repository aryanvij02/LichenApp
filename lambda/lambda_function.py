import json
import boto3
import os
from datetime import datetime
import uuid

def lambda_handler(event, context):
    """
    ULTRA SIMPLE: Just store all incoming health data as raw JSON files
    No processing, no database, no complexity - just data collection
    """
    
    path = event.get('path', '').rstrip('/')
    
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
