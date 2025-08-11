import json
import boto3
from datetime import datetime
import uuid
from collections import defaultdict
from botocore.exceptions import ClientError

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

def lambda_handler(event, context):
    print(f"Received event: {json.dumps(event)}")
    
    try:
        # Initialize S3 client
        s3 = boto3.client('s3')
        bucket_name = 'healthkit-data-lichen'  # Your bucket name
        
        # Parse the request body
        if 'body' not in event:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
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
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({'error': 'Missing user_id or samples'})
            }
        
        user_id = body['user_id']
        samples = body['samples']
        batch_type = body.get('batch_type', 'realtime')
        upload_metadata = body.get('upload_metadata', {})
        
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
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({
                    'status': 'success',
                    'message': 'All samples were duplicates, nothing uploaded',
                    'total_samples_received': original_count,
                    'duplicate_samples_skipped': duplicate_count,
                    'new_samples_uploaded': 0,
                    'files_created': 0
                })
            }
        
        # Group samples by data source, then by year-month, then by data type
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
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'status': 'success',
                'total_samples_received': original_count,
                'duplicate_samples_skipped': duplicate_count,
                'new_samples_uploaded': total_samples_uploaded,
                'files_created': len(uploaded_files),
                'uploaded_files': uploaded_files,
                'deduplication_enabled': True
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }