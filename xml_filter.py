#!/usr/bin/env python3
"""
HealthData XML Filter Script

This script filters Apple HealthData XML export files based on:
1. Source name (sourceName attribute)
2. Date range (startDate and endDate attributes)

Usage:
    python xml_filter.py <xml_file> <source_name> <start_date> <end_date>

Date format: YYYY-MM-DD (e.g., 2024-01-01)
"""

import xml.etree.ElementTree as ET
from datetime import datetime
import argparse
import sys
from collections import defaultdict


def parse_date(date_string):
    """
    Parse date from XML format to datetime object.
    XML dates are in format: "2024-06-22 11:06:45 -0700"
    """
    try:
        # Remove timezone part and parse
        date_part = date_string.split(' ')[0]
        return datetime.strptime(date_part, '%Y-%m-%d')
    except (ValueError, IndexError):
        return None


def filter_health_data(xml_file, source_name, start_date_str, end_date_str):
    """
    Filter health data XML based on source name and date range.
    
    Args:
        xml_file: Path to XML file
        source_name: Source name to filter by
        start_date_str: Start date in YYYY-MM-DD format
        end_date_str: End date in YYYY-MM-DD format
    """
    try:
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
    except ValueError:
        print("Error: Invalid date format. Use YYYY-MM-DD format.")
        return
    
    print(f"Filtering XML file: {xml_file}")
    print(f"Source Name: {source_name}")
    print(f"Date Range: {start_date_str} to {end_date_str}")
    print("=" * 60)
    
    # Track data types and filtered records
    data_types = set()
    filtered_records = []
    total_records = 0
    
    try:
        # Parse XML file iteratively for memory efficiency
        print("Parsing XML file...")
        try:
            context = ET.iterparse(xml_file, events=('start', 'end'))
            context = iter(context)
            event, root = next(context)
            
            for event, elem in context:
                if event == 'end' and elem.tag == 'Record':
                    total_records += 1
                
                # Get attributes
                record_source = elem.get('sourceName', '')
                record_type = elem.get('type', '')
                start_date_attr = elem.get('startDate', '')
                end_date_attr = elem.get('endDate', '')
                
                # Check source name filter
                if source_name.lower() not in record_source.lower():
                    elem.clear()
                    continue
                
                # Check date range filter
                record_start_date = parse_date(start_date_attr)
                record_end_date = parse_date(end_date_attr)
                
                if not record_start_date or not record_end_date:
                    elem.clear()
                    continue
                
                # Check if record falls within date range
                if record_start_date < start_date or record_end_date > end_date:
                    elem.clear()
                    continue
                
                # Record matches filters
                data_types.add(record_type)
                
                # Store record information
                record_info = {
                    'type': record_type,
                    'sourceName': record_source,
                    'startDate': start_date_attr,
                    'endDate': end_date_attr,
                    'value': elem.get('value', ''),
                    'unit': elem.get('unit', ''),
                    'creationDate': elem.get('creationDate', ''),
                    'sourceVersion': elem.get('sourceVersion', ''),
                    'device': elem.get('device', '')
                }
                
                filtered_records.append(record_info)
                
                # Clear element to save memory
                elem.clear()
                
                # Progress indicator
                if total_records % 50000 == 0:
                    print(f"Processed {total_records:,} records...")
            
            # Clear root element
            root.clear()
        except Exception as parse_error:
            print(f"Parsing stopped at record {total_records:,}: {parse_error}")
            print("Continuing with records found so far...")
        
    except ET.ParseError as e:
        print(f"Error parsing XML: {e}")
        return
    except FileNotFoundError:
        print(f"Error: File '{xml_file}' not found.")
        return
    except Exception as e:
        print(f"Unexpected error: {e}")
        return
    
    print(f"\nCompleted processing {total_records:,} total records")
    print(f"Found {len(filtered_records):,} matching records")
    print("=" * 60)
    
    # Display data types found
    print(f"\nDATA TYPES FOUND ({len(data_types)} unique types):")
    print("-" * 40)
    for data_type in sorted(data_types):
        # Count occurrences of each type
        count = sum(1 for record in filtered_records if record['type'] == data_type)
        print(f"• {data_type} ({count:,} records)")
    
    # Display filtered data
    print(f"\nFILTERED DATA ({len(filtered_records)} records):")
    print("-" * 40)
    
    if not filtered_records:
        print("No records match the specified criteria.")
        return
    
    # Group records by data type for better organization
    records_by_type = defaultdict(list)
    for record in filtered_records:
        records_by_type[record['type']].append(record)
    
    # Display records grouped by type
    for data_type in sorted(records_by_type.keys()):
        records = records_by_type[data_type]
        print(f"\n{data_type} ({len(records)} records):")
        print("  " + "-" * 50)
        
        for i, record in enumerate(records):
            print(f"  Record {i+1}:")
            print(f"    Source: {record['sourceName']}")
            print(f"    Value: {record['value']} {record['unit']}")
            print(f"    Start Date: {record['startDate']}")
            print(f"    End Date: {record['endDate']}")
            print(f"    Creation Date: {record['creationDate']}")
            if record['sourceVersion']:
                print(f"    Source Version: {record['sourceVersion']}")
            if record['device']:
                print(f"    Device: {record['device']}")
            print()


def main():
    parser = argparse.ArgumentParser(
        description='Filter HealthData XML by source name and date range'
    )
    parser.add_argument('xml_file', help='Path to the XML file')
    parser.add_argument('source_name', help='Source name to filter by (case-insensitive)')
    parser.add_argument('start_date', help='Start date (YYYY-MM-DD)')
    parser.add_argument('end_date', help='End date (YYYY-MM-DD)')
    
    args = parser.parse_args()
    
    filter_health_data(args.xml_file, args.source_name, args.start_date, args.end_date)


if __name__ == '__main__':
    main()
