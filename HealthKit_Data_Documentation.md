# HealthKit Data Integration Documentation

## Overview

This document provides a comprehensive overview of Apple HealthKit data integration within the Lichen application, including supported data types, current limitations, available endpoints, and data processing architecture.

## Table of Contents

1. [HealthKit Data Types](#healthkit-data-types)
2. [Data Processing Architecture](#data-processing-architecture)
3. [Current Limitations](#current-limitations)
4. [Lambda Endpoints (Data Ingestion)](#lambda-endpoints-data-ingestion)
5. [Backend API Endpoints (Data Query)](#backend-api-endpoints-data-query)
6. [Database Schemas](#database-schemas)
7. [Data Standardization](#data-standardization)

---

## HealthKit Data Types

### Currently Supported Data Types

The application currently processes the following HealthKit data types:

#### 1. Sleep Analysis (`HKCategoryTypeIdentifierSleepAnalysis`)

- **Raw HealthKit Stages:**

  - `HKCategoryValueSleepAnalysisAsleepCore` → Mapped to `CORE`
  - `HKCategoryValueSleepAnalysisAsleepDeep` → Mapped to `DEEP`
  - `HKCategoryValueSleepAnalysisAsleepREM` → Mapped to `REM`
  - `HKCategoryValueSleepAnalysisAsleepLight` → Mapped to `LIGHT`
  - `HKCategoryValueSleepAnalysisAwake` → Mapped to `AWAKE`
  - `HKCategoryValueSleepAnalysisAsleepUnspecified` → Mapped to `CORE`
  - `HKCategoryValueSleepAnalysisInBed` → Filtered out (not stored)

- **Data Structure:**
  - Time ranges with start/end timestamps
  - Stage-specific classification
  - UTC timestamps converted to user local timezone

#### 2. Heart Rate (`HKQuantityTypeIdentifierHeartRate`)

- **Characteristics:**
  - High-frequency data (every 2-3 seconds during active monitoring)
  - Point-in-time readings (startDate = endDate)
  - Unit: `count/min` (BPM)
  - Source varies (Apple Watch, iPhone, manual entry)

#### 3. Resting Heart Rate (`HKQuantityTypeIdentifierRestingHeartRate`)

- **Characteristics:**
  - Daily aggregated values
  - One reading per day per user
  - Computed by HealthKit based on heart rate patterns
  - Unit: `count/min` (BPM)

#### 4. Step Count (`HKQuantityTypeIdentifierStepCount`)

- **Characteristics:**
  - Interval-based data with start/end timestamps
  - Aggregated to daily totals
  - Unit: `count`
  - Multiple intervals throughout the day

### Unsupported/Missing Data Types

The following HealthKit data types are **not currently supported** but may be valuable:

- **Heart Rate Variability (HRV)** - `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`
  - Note: Engineer's document indicates this may not be available from all sources
- **Active Energy Burned** - `HKQuantityTypeIdentifierActiveEnergyBurned`
- **Respiratory Rate** - `HKQuantityTypeIdentifierRespiratoryRate`
- **Body Temperature** - `HKQuantityTypeIdentifierBodyTemperature`
- **Blood Oxygen Saturation** - `HKQuantityTypeIdentifierOxygenSaturation`
- **VO2 Max** - `HKQuantityTypeIdentifierVO2Max`
- **Workout Sessions** - `HKWorkoutTypeIdentifier`
- **Mindfulness Sessions** - `HKCategoryTypeIdentifierMindfulSession`

---

## Data Processing Architecture

### Dual Storage System

The application uses a dual storage approach:

1. **AWS S3** - Raw data storage and backup

   - Hierarchical organization: `user_id/source/year-month/data-type/files`
   - UUID-based deduplication
   - Maintains original HealthKit data structure

2. **Supabase (PostgreSQL)** - Structured querying and analytics
   - Optimized schemas for fast range queries
   - User timezone handling
   - Pre-computed aggregations

### Data Flow

```
HealthKit App → Lambda Function → S3 Storage + Supabase Database → Backend API → Frontend
```

1. **Collection**: iOS app collects HealthKit data
2. **Upload**: Lambda function receives and processes data
3. **Storage**: Dual storage in S3 (raw) and Supabase (structured)
4. **Query**: Backend API provides structured access
5. **Display**: Frontend consumes processed data

---

## Current Limitations

### 1. Heart Rate Variability (HRV)

- **Issue**: Limited availability from certain HealthKit sources
- **Workaround**: Using heart rate patterns for stress estimation
- **Impact**: Stress calculations rely on elevated heart rate above resting heart rate

### 2. Real-time Processing

- **Issue**: Data processing is batch-based via Lambda
- **Impact**: No real-time data streaming or alerts

### 3. Data Retention

- **Issue**: No automatic data archival or cleanup policies
- **Impact**: Potentially unlimited storage growth

### 4. Authentication & Authorization

- **Issue**: Limited user authentication in current endpoints
- **Impact**: Data access control relies on user_id parameter

### 5. Timezone Handling

- **Issue**: Complex timezone conversion between UTC storage and user local time
- **Impact**: Potential inconsistencies in day-based aggregations

### 6. Source Reliability

- **Issue**: Different HealthKit data sources have varying accuracy
- **Impact**: Mixed data quality from different devices/apps

---

## Lambda Endpoints (Data Ingestion)

### Base URL

```
https://your-lambda-gateway-url.amazonaws.com/
```

### 1. Health Data Upload

**Endpoint:** `POST /upload-health-data`

**Purpose:** Receives and processes HealthKit data from iOS app

**Request Body:**

```json
{
  "user_id": "string",
  "samples": [
    {
      "uuid": "string",
      "type": "HKQuantityTypeIdentifierHeartRate",
      "startDate": "2025-08-13T10:30:00.000Z",
      "endDate": "2025-08-13T10:30:00.000Z",
      "value": 72,
      "unit": "count/min",
      "sourceName": "Apple Watch"
    }
  ],
  "batch_type": "realtime|historical",
  "upload_metadata": {
    "appVersion": "1.0.0",
    "platform": "iOS",
    "timezone": "America/Los_Angeles"
  }
}
```

**Response:**

```json
{
  "status": "success",
  "total_samples_received": 100,
  "duplicate_samples_skipped": 5,
  "new_samples_uploaded": 95,
  "files_created": 3,
  "supabase_processing": "success"
}
```

### 2. User Profile Management

**Endpoint:** `POST /user/profile`

**Purpose:** Creates or updates user profile information

**Request Body:**

```json
{
  "userId": "string",
  "email": "user@example.com",
  "name": "John Doe",
  "timezone": "America/Los_Angeles",
  "profilePictureUrl": "https://...",
  "lastAppVersion": "1.0.0",
  "lastPlatform": "iOS"
}
```

---

## Backend API Endpoints (Data Query)

### Base URL

```
http://localhost:8000/api/v1
```

### 1. Heart Rate Endpoints

#### Get Heart Rate Data

```
GET /heart-rate/
```

**Parameters:**

- `start_time` (required): ISO format timestamp
- `end_time` (required): ISO format timestamp
- `user_id` (optional): User identifier

**Response:** Array of heart rate readings with timestamp and BPM value

#### Get Heart Rate Average

```
GET /heart-rate/average
```

**Parameters:** Same as above

**Response:** Aggregated statistics (average, min, max, total readings)

### 2. Sleep Endpoints

#### Get Sleep Stages

```
GET /sleep/
```

**Parameters:**

- `local_date` (required): YYYY-MM-DD format
- `user_id` (optional): User identifier

**Response:** Array of sleep stages with start/end times and stage types

#### Get Sleep Summary

```
GET /sleep/summary
```

**Parameters:** Same as above

**Response:** Aggregated sleep metrics (duration, efficiency, stage breakdown)

### 3. Resting Heart Rate Endpoints

#### Get Resting Heart Rate

```
GET /resting-heart-rate/
```

**Parameters:**

- `start_date` (required): YYYY-MM-DD format
- `end_date` (optional): YYYY-MM-DD format for range queries
- `user_id` (optional): User identifier

**Response:** Daily resting heart rate values

### 4. Steps Endpoints

#### Get Daily Steps

```
GET /steps/
```

**Parameters:**

- `local_date` (required): YYYY-MM-DD format
- `user_id` (optional): User identifier

**Response:** Daily step count totals

#### Get Steps Range

```
GET /steps/range
```

**Parameters:**

- `start_date` (required): YYYY-MM-DD format
- `end_date` (required): YYYY-MM-DD format
- `user_id` (optional): User identifier

**Response:** Step counts for date range

#### Get Step Intervals

```
GET /steps/intervals
```

**Parameters:** Same as daily steps

**Response:** Raw step intervals with start/end times

---

## Database Schemas

### 1. Sleep Analysis Table (`sleep_analysis`)

```sql
CREATE TABLE sleep_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    stage_uuid VARCHAR NOT NULL UNIQUE,
    time_range TSTZRANGE NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    sleep_stage VARCHAR NOT NULL,
    hk_value INTEGER NOT NULL,
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Heart Rate Data Table (`heart_rate_data`)

```sql
CREATE TABLE heart_rate_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    reading_uuid VARCHAR NOT NULL UNIQUE,
    timestamp TIMESTAMPTZ NOT NULL,
    time_range TSTZRANGE NOT NULL,
    heart_rate INTEGER NOT NULL,
    unit VARCHAR NOT NULL DEFAULT 'count/min',
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Resting Heart Rate Table (`resting_heart_rate`)

```sql
CREATE TABLE resting_heart_rate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    reading_uuid VARCHAR NOT NULL UNIQUE,
    timestamp TIMESTAMPTZ NOT NULL,
    local_date DATE NOT NULL,
    resting_heart_rate INTEGER NOT NULL,
    unit VARCHAR NOT NULL DEFAULT 'count/min',
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, local_date)
);
```

### 4. Steps Tables

#### Daily Steps Aggregates (`daily_steps`)

```sql
CREATE TABLE daily_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    local_date DATE NOT NULL,
    total_steps INTEGER NOT NULL,
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, local_date)
);
```

#### Step Intervals (`step_intervals`)

```sql
CREATE TABLE step_intervals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    interval_uuid VARCHAR NOT NULL UNIQUE,
    time_range TSTZRANGE NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    step_count INTEGER NOT NULL,
    unit VARCHAR NOT NULL DEFAULT 'count',
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. User Profiles Table (`user_profiles`)

```sql
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY,
    user_id VARCHAR,
    email VARCHAR,
    name VARCHAR,
    profile_picture_url VARCHAR,
    timezone VARCHAR,
    locale VARCHAR,
    country VARCHAR,
    region VARCHAR,
    health_data_enabled BOOLEAN,
    notification_enabled BOOLEAN,
    data_retention_days INT,
    first_login_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    profile_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    auth_provider VARCHAR,
    provider_user_id VARCHAR,
    last_app_version VARCHAR,
    last_platform VARCHAR
);
```

---

## Data Standardization

### Timezone Handling

- **Storage**: All timestamps stored in UTC
- **Display**: Converted to user's local timezone based on profile
- **Day Boundaries**: Local date calculations use user timezone

### UUID-Based Deduplication

- Every HealthKit sample includes a unique UUID
- Lambda function maintains UUID index for duplicate prevention
- Ensures idempotent data uploads

### Data Quality

- **Heart Rate**: Values validated as integers in reasonable range
- **Sleep Stages**: Mapped from HealthKit constants to standardized names
- **Steps**: Non-negative integer validation
- **Timestamps**: ISO 8601 format with timezone information

### Performance Optimizations

- **Range Queries**: TSTZRANGE columns with GiST indexes
- **User Queries**: Composite indexes on (user_id, timestamp/date)
- **Aggregations**: Pre-computed daily totals for frequently accessed data

---

## Future Considerations

### Planned Enhancements

1. **Stress Computation**: Real-time stress calculation based on heart rate patterns
2. **HRV Integration**: When available from HealthKit sources
3. **Environmental Data**: Integration with audio/noise level monitoring
4. **AI Insights**: LLM-powered health insights based on data patterns
5. **Real-time Alerts**: Push notifications for health anomalies

### Scalability Concerns

1. **Data Volume**: Heart rate data can generate thousands of readings per day
2. **Query Performance**: Range queries on large datasets need optimization
3. **Storage Costs**: S3 storage costs for raw data retention
4. **Processing Latency**: Lambda cold starts affecting upload performance

---

## Environment Configuration

### Lambda Environment Variables

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
S3_BUCKET_NAME=healthkit-data-lichen
```

### Backend Configuration

- Database: PostgreSQL via Supabase
- API Framework: FastAPI with async PostgreSQL connections
- Authentication: Currently minimal, user_id based

---

_Last Updated: August 13, 2025_
_Document Version: 1.0_
