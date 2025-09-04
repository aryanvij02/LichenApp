#!/usr/bin/env python3
"""
Script to extract one sample of each type from a large health data JSON file.
This creates a much smaller JSON that represents the structure of the original.
"""

import json
import sys
from pathlib import Path


def extract_sample_structure(input_file: str, output_file: str = None):
    """
    Extract one sample of each type from the JSON file to create a structure representation.
    
    Args:
        input_file: Path to the input JSON file
        output_file: Path for the output JSON file (optional, defaults to input_file + '_structure.json')
    """
    
    # Set default output file name if not provided
    if output_file is None:
        input_path = Path(input_file)
        output_file = str(input_path.parent / f"{input_path.stem}_structure.json")
    
    print(f"Reading input file: {input_file}")
    
    # Read the original JSON file
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File '{input_file}' not found.")
        return False
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in file '{input_file}': {e}")
        return False
    
    # Check if the expected structure exists
    if 'complete_payload' not in data or 'samples' not in data['complete_payload']:
        print("Error: Expected structure not found. Looking for 'complete_payload.samples' array.")
        return False
    
    samples = data['complete_payload']['samples']
    print(f"Found {len(samples)} total samples")
    
    # Track types we've seen and store one sample of each type
    seen_types = set()
    representative_samples = []
    
    for sample in samples:
        if 'type' not in sample:
            print("Warning: Found sample without 'type' field, skipping...")
            continue
            
        sample_type = sample['type']
        
        # If we haven't seen this type yet, keep this sample
        if sample_type not in seen_types:
            seen_types.add(sample_type)
            representative_samples.append(sample)
            print(f"Added sample for type: {sample_type}")
    
    print(f"\nFound {len(seen_types)} unique types:")
    for sample_type in sorted(seen_types):
        print(f"  - {sample_type}")
    
    # Create the new structure with the representative samples
    structure_data = data.copy()
    structure_data['complete_payload']['samples'] = representative_samples
    structure_data['sample_count'] = len(representative_samples)
    
    # Add metadata about the extraction
    structure_data['extraction_info'] = {
        'original_sample_count': len(samples),
        'extracted_sample_count': len(representative_samples),
        'unique_types_count': len(seen_types),
        'extraction_purpose': 'Structure representation with one sample per type'
    }
    
    # Write the structure file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(structure_data, f, indent=2, ensure_ascii=False)
        print(f"\nStructure file saved to: {output_file}")
        print(f"Original size: {len(samples)} samples")
        print(f"Structure size: {len(representative_samples)} samples")
        print(f"Reduction: {len(samples) - len(representative_samples)} samples removed")
        return True
    except IOError as e:
        print(f"Error writing output file '{output_file}': {e}")
        return False


def main():
    """Main function to handle command line usage."""
    if len(sys.argv) < 2:
        print("Usage: python extract_sample_structure.py <input_json_file> [output_json_file]")
        print("\nExample:")
        print("  python extract_sample_structure.py 2025-09-03_22-33-44_3e72c969.json")
        print("  python extract_sample_structure.py data.json structure.json")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    success = extract_sample_structure(input_file, output_file)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
