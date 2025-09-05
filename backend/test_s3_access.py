#!/usr/bin/env python3
"""
Test script to verify S3 access from FastAPI backend
Run this on your EC2 instance to test S3 permissions
"""

import boto3
import json
from botocore.exceptions import ClientError

def test_s3_access():
    """Test S3 access with the same configuration as FastAPI service"""
    try:
        # Use the same S3 client setup as in the FastAPI service
        s3_client = boto3.client('s3')
        
        # Test bucket access
        bucket_name = 'healthkit-data-lichen'  # Replace with your actual bucket name
        
        print(f"Testing S3 access to bucket: {bucket_name}")
        
        # Test listing objects in ecg_voltage prefix (read permission test)
        try:
            response = s3_client.list_objects_v2(
                Bucket=bucket_name,
                Prefix='ecg_voltage/',
                MaxKeys=1
            )
            print("✅ Successfully listed objects in ecg_voltage/ prefix")
            
            if 'Contents' in response and len(response['Contents']) > 0:
                # Test getting an actual object
                test_key = response['Contents'][0]['Key']
                print(f"Testing GetObject on: {test_key}")
                
                obj_response = s3_client.get_object(Bucket=bucket_name, Key=test_key)
                print(f"✅ Successfully retrieved object: {test_key}")
                print(f"   Object size: {obj_response['ContentLength']} bytes")
            else:
                print("ℹ️  No objects found in ecg_voltage/ prefix to test GetObject")
                
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchBucket':
                print(f"❌ Bucket '{bucket_name}' does not exist")
            elif e.response['Error']['Code'] == 'AccessDenied':
                print(f"❌ Access denied to bucket '{bucket_name}'")
                print("   Check IAM permissions for s3:ListBucket and s3:GetObject")
            else:
                print(f"❌ S3 Error: {e.response['Error']['Code']} - {e.response['Error']['Message']}")
                
    except Exception as e:
        print(f"❌ Error setting up S3 client: {e}")
        print("   Check AWS credentials and configuration")

if __name__ == "__main__":
    print("Testing S3 access for LichenApp FastAPI backend...")
    print("=" * 50)
    test_s3_access()
    print("=" * 50)
    print("If you see ✅ marks above, S3 access is working correctly!")
    print("If you see ❌ marks, check your IAM permissions.")
