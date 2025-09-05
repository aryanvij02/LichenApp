#!/usr/bin/env python3
"""
Simple XML Filter for HealthData

This script filters Apple HealthData XML export files and preserves the complete XML structure.
It only filters by sourceName and date range, keeping all subtags intact.

Usage:
    python simple_xml_filter.py <xml_file> <source_name> <start_date> <end_date>

Date format: YYYY-MM-DD (e.g., 2024-01-01)
"""

import xml.etree.ElementTree as ET
from datetime import datetime
import argparse
import sys
import re


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


def simple_filter(xml_file, source_name, start_date_str, end_date_str, output_file=None):
    """
    Simple XML filtering that preserves complete structure.
    
    Args:
        xml_file: Path to XML file
        source_name: Source name to filter by
        start_date_str: Start date in YYYY-MM-DD format
        end_date_str: End date in YYYY-MM-DD format
        output_file: Optional output file path
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
    
    if output_file:
        print(f"Output file: {output_file}")
    else:
        print("Output: stdout")
    
    print("=" * 60)

    # Count variables
    total_records = 0
    matched_records = 0
    data_types = set()

    # Open output stream
    if output_file:
        output = open(output_file, 'w', encoding='utf-8')
    else:
        output = sys.stdout

    try:
        # Write XML header
        output.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        output.write('<HealthData locale="en_US">\n')
        
        # Parse XML file line by line to preserve formatting
        with open(xml_file, 'r', encoding='utf-8') as f:
            current_record = []
            in_record = False
            record_depth = 0
            
            for line in f:
                line_stripped = line.strip()
                
                # Skip XML header and HealthData opening tag
                if line_stripped.startswith('<?xml') or line_stripped.startswith('<HealthData'):
                    continue
                
                # Check if this is a Record start tag
                if '<Record ' in line and not line_stripped.endswith('/>'):
                    in_record = True
                    record_depth = 1
                    current_record = [line]
                    total_records += 1
                    
                    if total_records % 50000 == 0:
                        print(f"Processed {total_records:,} records...", file=sys.stderr)
                    
                elif '<Record ' in line and line_stripped.endswith('/>'):
                    # Self-closing Record tag
                    total_records += 1
                    
                    if total_records % 50000 == 0:
                        print(f"Processed {total_records:,} records...", file=sys.stderr)
                    
                    # Check if this record matches our criteria
                    if matches_criteria(line, source_name, start_date, end_date):
                        matched_records += 1
                        # Extract data type for summary
                        type_match = re.search(r'type="([^"]+)"', line)
                        if type_match:
                            data_types.add(type_match.group(1))
                        output.write(line)
                    
                elif in_record:
                    current_record.append(line)
                    
                    # Track nesting depth
                    if '<' in line and not line_stripped.startswith('</') and not line_stripped.endswith('/>'):
                        record_depth += line.count('<') - line.count('</')
                    elif '</' in line:
                        record_depth -= line.count('</')
                    
                    # Check if we've closed the Record tag
                    if record_depth == 0 and '</Record>' in line:
                        in_record = False
                        
                        # Check if this record matches our criteria
                        record_text = ''.join(current_record)
                        if matches_criteria(record_text, source_name, start_date, end_date):
                            matched_records += 1
                            # Extract data type for summary
                            type_match = re.search(r'type="([^"]+)"', record_text)
                            if type_match:
                                data_types.add(type_match.group(1))
                            output.write(record_text)
                        
                        current_record = []
        
        # Write XML footer
        output.write('</HealthData>\n')
        
    finally:
        if output_file:
            output.close()
    
    # Print summary
    print(f"\nCompleted processing {total_records:,} total records", file=sys.stderr)
    print(f"Found {matched_records:,} matching records", file=sys.stderr)
    print(f"Data types found: {len(data_types)}", file=sys.stderr)
    for data_type in sorted(data_types):
        print(f"  • {data_type}", file=sys.stderr)


def matches_criteria(record_text, source_name, start_date, end_date):
    """
    Check if a record matches the filtering criteria.
    """
    # Check source name (handle apostrophes and case insensitive)
    source_match = re.search(r'sourceName="([^"]*)"', record_text)
    if not source_match:
        return False
    
    record_source = source_match.group(1)
    if source_name.lower() not in record_source.lower():
        return False
    
    # Check date range
    start_match = re.search(r'startDate="([^"]*)"', record_text)
    end_match = re.search(r'endDate="([^"]*)"', record_text)
    
    if not start_match or not end_match:
        return False
    
    record_start_date = parse_date(start_match.group(1))
    record_end_date = parse_date(end_match.group(1))
    
    if not record_start_date or not record_end_date:
        return False
    
    # Check if record falls within date range
    if record_start_date < start_date or record_end_date > end_date:
        return False
    
    return True


def main():
    parser = argparse.ArgumentParser(
        description='Simple XML filter that preserves complete structure'
    )
    parser.add_argument('xml_file', help='Path to the XML file')
    parser.add_argument('source_name', help='Source name to filter by (case-insensitive)')
    parser.add_argument('start_date', help='Start date (YYYY-MM-DD)')
    parser.add_argument('end_date', help='End date (YYYY-MM-DD)')
    parser.add_argument('-o', '--output', help='Output file (default: stdout)')
    
    args = parser.parse_args()
    
    simple_filter(args.xml_file, args.source_name, args.start_date, args.end_date, args.output)


if __name__ == '__main__':
    main()
