#!/usr/bin/env python3
"""
Example usage of the XML filter script

This shows different ways to use the xml_filter.py script
"""

import subprocess
import os

def run_filter_example():
    """Example of how to use the XML filter script"""
    
    # Path to your XML file
    xml_file = "files/export.xml"
    
    # Check if file exists
    if not os.path.exists(xml_file):
        print(f"XML file not found: {xml_file}")
        print("Please update the xml_file path in this script.")
        return
    
    print("XML Health Data Filter - Usage Examples")
    print("=" * 50)
    
    # Example 1: Filter by Apple Watch data from November 2024
    print("\nExample 1: Filter Apple Watch data from November 2024")
    print("Command: python xml_filter.py files/export.xml 'Apple Watch' 2024-11-01 2024-11-30")
    print("-" * 50)
    
    try:
        result = subprocess.run([
            "python3", "xml_filter.py", 
            xml_file, 
            "Apple Watch", 
            "2024-11-01", 
            "2024-11-30"
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            print(result.stdout)
        else:
            print("Error:", result.stderr)
    except subprocess.TimeoutExpired:
        print("Command timed out (processing large file...)")
    except Exception as e:
        print(f"Error running command: {e}")
    
    print("\n" + "=" * 50)
    print("Other example commands you can try:")
    print("1. python3 xml_filter.py files/export.xml 'Zing' 2024-06-01 2024-06-30")
    print("2. python3 xml_filter.py files/export.xml 'iPhone' 2024-01-01 2024-12-31")
    print("3. python3 xml_filter.py files/export.xml 'Cal AI' 2025-01-01 2025-12-31")
    print("4. python3 xml_filter.py files/export.xml 'Health' 2016-01-01 2016-12-31")
    
    print("\nAvailable source names found in your data:")
    print("• Aryan's Apple Watch")
    print("• Zing")
    print("• Av iPhone") 
    print("• Health")
    print("• Cal AI")
    print("• MacroFactor")

if __name__ == '__main__':
    run_filter_example()
