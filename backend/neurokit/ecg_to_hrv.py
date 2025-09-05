#!/usr/bin/env python3
"""
Simple script: Load Apple HealthKit ECG JSON and compute RMSSD + SDNN using NeuroKit2.
"""

import json
import sys
import numpy as np
import neurokit2 as nk

# --- Config ---
fs = 512  # Hz, Apple Watch ECG
json_file = "sample_ecg.json"  # path to your file

# --- Step 1. Load JSON ---
with open(json_file, "r") as f:
    data = json.load(f)

# data is a list of {"t": float, "v": float}
voltages = [point["v"] for point in data]
ecg = np.array(voltages, dtype=float)

# --- Step 2. Clean ECG ---
cleaned = nk.ecg_clean(ecg, sampling_rate=fs, method="neurokit")

# --- Step 3. Detect R-peaks ---
signals, info = nk.ecg_peaks(cleaned, sampling_rate=fs)

# --- Step 4. Compute HRV (time-domain) ---
hrv = nk.hrv_time(signals, sampling_rate=fs, show=False)

# --- Step 5. Print results ---
rmssd = hrv.loc[0, "HRV_RMSSD"]
sdnn = hrv.loc[0, "HRV_SDNN"]

print(f"RMSSD (ms): {rmssd:.2f}")
print(f"SDNN (ms): {sdnn:.2f}")
