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
        
        # Store EVERYTHING as raw JSON
        filename = f"raw_dumps/{user_id}/{timestamp}_{batch_id}.json"
        
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
                'message': 'Raw data stored successfully',
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
