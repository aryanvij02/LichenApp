#!/usr/bin/env python3
"""
Quick test to verify AWS environment variables are working
"""

import os
import boto3
from botocore.exceptions import ClientError

def test_aws_env_vars():
    """Test AWS environment variables and S3 access"""
    
    print("Testing AWS Environment Variables...")
    print("=" * 50)
    
    # Check if environment variables are set
    access_key = os.environ.get('AWS_ACCESS_KEY_ID')
    secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY') 
    region = os.environ.get('AWS_DEFAULT_REGION')
    
    if access_key:
        print(f"✅ AWS_ACCESS_KEY_ID: {access_key[:8]}...")
    else:
        print("❌ AWS_ACCESS_KEY_ID not set")
        return False
        
    if secret_key:
        print(f"✅ AWS_SECRET_ACCESS_KEY: {secret_key[:8]}...")
    else:
        print("❌ AWS_SECRET_ACCESS_KEY not set") 
        return False
        
    if region:
        print(f"✅ AWS_DEFAULT_REGION: {region}")
    else:
        print("⚠️  AWS_DEFAULT_REGION not set (will use default)")
    
    print("\nTesting S3 Connection...")
    print("-" * 30)
    
    try:
        # Test S3 connection
        s3_client = boto3.client('s3')
        
        # Test access to your bucket
        bucket_name = 'healthkit-data-lichen'  # Replace with your bucket
        
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='ecg_voltage/',
            MaxKeys=1
        )
        
        print(f"✅ Successfully connected to S3 bucket: {bucket_name}")
        print(f"✅ Can access ecg_voltage/ prefix")
        
        return True
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'AccessDenied':
            print(f"❌ Access denied to bucket '{bucket_name}'")
            print("   Check your IAM user has s3:GetObject permission")
        elif error_code == 'NoSuchBucket':
            print(f"❌ Bucket '{bucket_name}' not found")
        else:
            print(f"❌ S3 Error: {error_code} - {e.response['Error']['Message']}")
        return False
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_aws_env_vars()
    print("=" * 50)
    if success:
        print("🎉 Environment variables are working! FastAPI should be able to access S3.")
    else:
        print("🔧 Fix the issues above and try again.")
