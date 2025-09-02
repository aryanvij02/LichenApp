# HealthData XML Filter

A Python script to filter Apple HealthData XML export files based on source name and date range.

## Features

- **Source Name Filtering**: Filter records by data source (case-insensitive)
- **Date Range Filtering**: Only include records within specified date range
- **Data Type Discovery**: Lists all unique health data types found
- **Memory Efficient**: Processes large XML files without loading everything into memory
- **Organized Output**: Groups filtered data by data type for easy reading

## Requirements

- Python 3.6 or higher
- No additional dependencies (uses built-in libraries)

## Usage

### Command Line

```bash
python3 xml_filter.py <xml_file> <source_name> <start_date> <end_date>
```

### Parameters

- `xml_file`: Path to your HealthData XML export file
- `source_name`: Source name to filter by (case-insensitive partial matching)
- `start_date`: Start date in YYYY-MM-DD format
- `end_date`: End date in YYYY-MM-DD format

### Examples

**Filter Apple Watch data from November 2024:**

```bash
python3 xml_filter.py files/export.xml "Apple Watch" 2024-11-01 2024-11-30
```

**Filter iPhone health data for entire year 2024:**

```bash
python3 xml_filter.py files/export.xml "iPhone" 2024-01-01 2024-12-31
```

**Filter Cal AI app data from May 2025:**

```bash
python3 xml_filter.py files/export.xml "Cal AI" 2025-05-01 2025-05-31
```

## Output Format

The script provides:

1. **Summary Statistics**
   - Total records processed
   - Number of matching records
2. **Data Types Found**

   - List of unique health data types
   - Count of records for each type

3. **Filtered Data**
   - Records grouped by data type
   - Full details for each matching record

## Sample Output

```
Filtering XML file: files/export.xml
Source Name: Apple Watch
Date Range: 2024-11-01 to 2024-11-30
============================================================

Completed processing 1,333,893 total records
Found 142 matching records
============================================================

DATA TYPES FOUND (3 unique types):
----------------------------------------
• HKQuantityTypeIdentifierHeartRate (140 records)
• HKQuantityTypeIdentifierStepCount (1 records)
• HKQuantityTypeIdentifierWalkingSpeed (1 records)

FILTERED DATA (142 records):
----------------------------------------

HKQuantityTypeIdentifierHeartRate (140 records):
  --------------------------------------------------
  Record 1:
    Source: Aryan's Apple Watch
    Value: 72 count/min
    Start Date: 2024-11-13 17:04:07 -0700
    End Date: 2024-11-13 17:04:07 -0700
    Creation Date: 2024-11-13 17:08:48 -0700
    Source Version: 10.5
    Device: Apple Watch
```

## Common Source Names

Based on your XML file, common source names include:

- `"Apple Watch"` - Apple Watch data
- `"iPhone"` - iPhone Health app data
- `"Zing"` - Zing fitness app
- `"Cal AI"` - Cal AI nutrition app
- `"MacroFactor"` - MacroFactor nutrition app
- `"Health"` - iOS Health app

## Tips

1. **Large Files**: The script is designed to handle large XML files efficiently
2. **Partial Matching**: Source name filtering uses case-insensitive partial matching
3. **Date Format**: Always use YYYY-MM-DD format for dates
4. **Progress**: For large files, progress is shown every 10,000 records processed

## Troubleshooting

- **File not found**: Check the XML file path is correct
- **Invalid date format**: Ensure dates are in YYYY-MM-DD format
- **No matches**: Check source name spelling and date range
- **Memory issues**: The script uses iterative parsing to minimize memory usage

## Running the Example

Run the example script to see the filter in action:

```bash
python3 example_usage.py
```
