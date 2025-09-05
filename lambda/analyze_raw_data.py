#!/usr/bin/env python3
"""
Simple script to analyze raw JSON health data collected from Lambda
Run this locally after collecting some data to understand patterns
"""

import json
import boto3
from collections import defaultdict, Counter
from datetime import datetime
import os

def analyze_s3_raw_data():
    """Download and analyze all raw JSON files from S3"""
    
    # Initialize S3
    s3 = boto3.client('s3')
    bucket_name = 'healthkit-data-lichen'  # Update if different
    
    print("🔍 ANALYZING RAW HEALTH DATA FROM S3")
    print("=" * 50)
    
            # List all raw data files
        try:
            response = s3.list_objects_v2(
                Bucket=bucket_name,
                Prefix='raw_data/'
            )
            
            if 'Contents' not in response:
                print("❌ No raw data files found in S3")
                return
        
        files = response['Contents']
        print(f"📁 Found {len(files)} raw data files")
        
        # Analysis containers
        all_data_types = Counter()
        all_metadata_keys = set()
        sample_structures = {}
        timestamp_patterns = defaultdict(list)
        value_patterns = defaultdict(list)
        
        # Process each file
        for i, file_obj in enumerate(files[:10]):  # Limit to first 10 files for speed
            key = file_obj['Key']
            print(f"\n📄 Analyzing file {i+1}/{min(10, len(files))}: {key}")
            
            # Download and parse file
            try:
                obj = s3.get_object(Bucket=bucket_name, Key=key)
                raw_data = json.loads(obj['Body'].read().decode('utf-8'))
                
                payload = raw_data.get('complete_payload', {})
                samples = payload.get('samples', [])
                
                print(f"   📊 Samples in this file: {len(samples)}")
                
                # Analyze each sample
                for sample in samples:
                    sample_type = sample.get('type', 'UNKNOWN')
                    all_data_types[sample_type] += 1
                    
                    # Collect metadata keys
                    if 'metadata' in sample and isinstance(sample['metadata'], dict):
                        all_metadata_keys.update(sample['metadata'].keys())
                    
                    # Analyze structure (first time we see this type)
                    if sample_type not in sample_structures:
                        sample_structures[sample_type] = {
                            'keys': list(sample.keys()),
                            'sample_value': str(sample.get('value', 'N/A'))[:50],
                            'sample_unit': sample.get('unit', 'N/A'),
                            'has_metadata': bool(sample.get('metadata')),
                            'start_date': sample.get('startDate', 'N/A'),
                            'end_date': sample.get('endDate', 'N/A'),
                            'same_start_end': sample.get('startDate') == sample.get('endDate')
                        }
                    
                    # Collect timestamp patterns
                    start_date = sample.get('startDate')
                    end_date = sample.get('endDate')
                    if start_date and end_date:
                        try:
                            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                            duration_seconds = (end_dt - start_dt).total_seconds()
                            timestamp_patterns[sample_type].append(duration_seconds)
                        except:
                            pass
                    
                    # Collect value patterns
                    value = sample.get('value')
                    if value is not None:
                        value_patterns[sample_type].append(str(value)[:20])
                
            except Exception as e:
                print(f"   ❌ Error processing {key}: {e}")
        
        # Print analysis results
        print("\n" + "="*60)
        print("📈 DATA TYPE ANALYSIS")
        print("="*60)
        
        for data_type, count in all_data_types.most_common():
            print(f"{data_type}: {count:,} samples")
        
        print(f"\n🏷️ TOTAL UNIQUE DATA TYPES: {len(all_data_types)}")
        print(f"🔑 TOTAL UNIQUE METADATA KEYS: {len(all_metadata_keys)}")
        
        print("\n" + "="*60)
        print("🗂️ SAMPLE STRUCTURES")
        print("="*60)
        
        for data_type, structure in sample_structures.items():
            print(f"\n📋 {data_type}:")
            print(f"   Keys: {structure['keys']}")
            print(f"   Sample Value: {structure['sample_value']}")
            print(f"   Unit: {structure['sample_unit']}")
            print(f"   Has Metadata: {structure['has_metadata']}")
            print(f"   Same Start/End: {structure['same_start_end']}")
        
        print("\n" + "="*60)
        print("⏱️ TIMESTAMP DURATION PATTERNS")
        print("="*60)
        
        for data_type, durations in timestamp_patterns.items():
            if durations:
                avg_duration = sum(durations) / len(durations)
                unique_durations = set(durations)
                print(f"{data_type}:")
                print(f"   Average duration: {avg_duration:.2f} seconds")
                print(f"   Unique durations: {sorted(unique_durations)[:5]}...")  # Show first 5
        
        print("\n" + "="*60)
        print("🔑 ALL METADATA KEYS FOUND")
        print("="*60)
        
        for key in sorted(all_metadata_keys):
            print(f"   {key}")
        
        print(f"\n✅ Analysis complete! Processed {len(files)} files.")
        print("💡 Use this data to design your database schema and processors.")
        
    except Exception as e:
        print(f"❌ Error accessing S3: {e}")

if __name__ == "__main__":
    # Make sure AWS credentials are configured
    analyze_s3_raw_data()
