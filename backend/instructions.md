# FastAPI Health Endpoints Implementation Guide

## Context & Prerequisites

You are working with the LichenHealth monorepo structure:

```
LichenHealth/
├── backend/          # FastAPI server (current work)
├── HealthKitSync/          # React Native app
├── lambda/          # AWS Lambda function
└── database/        # Supabase schemas
```

**Database Schema Context:**

- `heart_rate_data` - Individual heart rate readings with timestamp and time_range (TSTZRANGE)
- `resting_heart_rate` - Daily resting heart rate values with local_date
- `sleep_analysis` - Sleep stages with time_range, sleep_stage (CORE, REM, DEEP, AWAKE)
- `daily_steps` - Daily step totals (already implemented)
- `step_intervals` - Raw step intervals for detailed analysis

**Existing Implementation:**

- Basic FastAPI setup in `/backend/` with database connection via asyncpg
- Steps endpoint already working: `/api/v1/steps/?local_date=YYYY-MM-DD&user_id=google_XXX`
- Database connection established using Supabase Session Pooler
- File structure: `app/models/`, `app/services/`, `app/api/routes/`

## Implementation Pattern

Follow this exact pattern for each endpoint (based on working steps implementation):

1. **Model** (`app/models/{data_type}.py`) - Pydantic response models
2. **Service** (`app/services/{data_type}.py`) - Database queries and business logic
3. **Route** (`app/api/routes/{data_type}.py`) - FastAPI endpoints
4. **Update main.py** - Include new router

---

## 1. Heart Rate Endpoints

### Endpoint Specifications:

- `GET /api/v1/heart-rate/` - Get heart rate readings for time range
- `GET /api/v1/heart-rate/average` - Get average heart rate for time period

### Database Table: `heart_rate_data`

```sql
CREATE TABLE heart_rate_data (
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

### Implementation Steps:

#### Step 1: Create `/backend/app/models/heart_rate.py`

```python
# Define Pydantic models:
# - HeartRateResponse: matches database columns
# - HeartRateAverageResponse: for average calculations
# - Include proper datetime/timestamp handling
```

#### Step 2: Create `/backend/app/services/heart_rate.py`

```python
# Two functions needed:
# 1. get_heart_rate_by_time_range(db, start_time, end_time, user_id)
#    - Query: WHERE timestamp BETWEEN start_time AND end_time
#    - Convert string timestamps to datetime objects (like steps date conversion)
#    - Return List[HeartRateResponse]
#
# 2. get_heart_rate_average(db, start_time, end_time, user_id)
#    - Query: SELECT AVG(heart_rate) WHERE timestamp BETWEEN...
#    - Return average value and count
```

#### Step 3: Create `/backend/app/api/routes/heart_rate.py`

```python
# Two endpoints:
# 1. @router.get("/") - accepts start_time, end_time, user_id query params
# 2. @router.get("/average") - same params, returns average calculation
#
# Query parameters:
# - start_time: str (ISO format: 2025-08-12T00:00:00Z)
# - end_time: str (ISO format: 2025-08-12T23:59:59Z)
# - user_id: Optional[str]
#
# Follow same error handling pattern as steps
```

#### Step 4: Update `/backend/main.py`

```python
# Add: from app.api.routes import heart_rate
# Add: app.include_router(heart_rate.router)
```

---

## 2. Resting Heart Rate Endpoints

### Endpoint Specifications:

- `GET /api/v1/resting-heart-rate/` - Get daily resting heart rate values

### Database Table: `resting_heart_rate`

```sql
CREATE TABLE resting_heart_rate (
    user_id VARCHAR NOT NULL,
    reading_uuid VARCHAR NOT NULL UNIQUE,
    timestamp TIMESTAMPTZ NOT NULL,
    local_date DATE NOT NULL,
    resting_heart_rate INTEGER NOT NULL,
    unit VARCHAR NOT NULL DEFAULT 'count/min',
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Implementation Steps:

#### Step 1: Create `/backend/app/models/resting_heart_rate.py`

```python
# Define RestingHeartRateResponse model
# Similar to steps model but with resting_heart_rate field instead of total_steps
```

#### Step 2: Create `/backend/app/services/resting_heart_rate.py`

```python
# Function: get_resting_heart_rate_by_date_range(db, start_date, end_date, user_id)
# - Query: WHERE local_date BETWEEN start_date AND end_date
# - Convert date strings to date objects (exactly like steps implementation)
# - Return List[RestingHeartRateResponse]
```

#### Step 3: Create `/backend/app/api/routes/resting_heart_rate.py`

```python
# Endpoint: @router.get("/")
# Query parameters:
# - start_date: str (YYYY-MM-DD format)
# - end_date: str (YYYY-MM-DD format)
# - user_id: Optional[str]
#
# If only start_date provided, query single date
# If both provided, query date range
```

#### Step 4: Update `/backend/main.py`

```python
# Add resting heart rate router
```

---

## 3. Sleep Endpoints

### Endpoint Specifications:

- `GET /api/v1/sleep/` - Get sleep stages for specific date/time range
- `GET /api/v1/sleep/summary` - Get sleep summary (total sleep, efficiency, etc.)

### Database Table: `sleep_analysis`

```sql
CREATE TABLE sleep_analysis (
    user_id VARCHAR NOT NULL,
    stage_uuid VARCHAR NOT NULL UNIQUE,
    time_range TSTZRANGE NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    sleep_stage VARCHAR NOT NULL,  -- CORE, REM, DEEP, AWAKE, etc.
    hk_value INTEGER NOT NULL,
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Implementation Steps:

#### Step 1: Create `/backend/app/models/sleep.py`

```python
# Define models:
# - SleepStageResponse: individual sleep stages
# - SleepSummaryResponse: aggregated sleep data
#   - total_sleep_duration (minutes)
#   - sleep_stages_breakdown (CORE: X min, REM: Y min, etc.)
#   - sleep_efficiency (percentage)
#   - sleep_start_time, sleep_end_time
```

#### Step 2: Create `/backend/app/services/sleep.py`

```python
# Two functions needed:
# 1. get_sleep_stages_by_date(db, local_date, user_id)
#    - Convert local_date to date range (start: 00:00, end: 23:59)
#    - Query: WHERE start_time BETWEEN date_start AND date_end
#    - Return List[SleepStageResponse]
#
# 2. get_sleep_summary_by_date(db, local_date, user_id)
#    - Same query as above but aggregate the results
#    - Calculate total duration per stage: SUM(EXTRACT(EPOCH FROM (end_time - start_time))/60)
#    - Group by sleep_stage
#    - Return SleepSummaryResponse with totals
```

#### Step 3: Create `/backend/app/api/routes/sleep.py`

```python
# Two endpoints:
# 1. @router.get("/") - raw sleep stages
# 2. @router.get("/summary") - aggregated summary
#
# Query parameters:
# - local_date: str (YYYY-MM-DD format)
# - user_id: Optional[str]
```

#### Step 4: Update `/backend/main.py`

```python
# Add sleep router
```

---

## 4. Additional Steps Endpoints

### Endpoint Specifications:

- `GET /api/v1/steps/range` - Get steps over date range
- `GET /api/v1/steps/intervals` - Get raw step intervals

### Database Tables:

- `daily_steps` (already used)
- `step_intervals` (for raw data)

### Implementation Steps:

#### Step 1: Update `/backend/app/models/steps.py`

```python
# Add new models:
# - StepIntervalResponse: for raw intervals
# - StepsRangeResponse: for date range queries
```

#### Step 2: Update `/backend/app/services/steps.py`

```python
# Add two new functions:
# 1. get_steps_by_date_range(db, start_date, end_date, user_id)
#    - Query daily_steps WHERE local_date BETWEEN start_date AND end_date
#
# 2. get_step_intervals_by_date(db, local_date, user_id)
#    - Query step_intervals table for detailed interval data
#    - Convert local_date to timestamp range for time_range column
```

#### Step 3: Update `/backend/app/api/routes/steps.py`

```python
# Add two new endpoints:
# 1. @router.get("/range") - date range queries
# 2. @router.get("/intervals") - raw interval data
```

---

## Testing Strategy

### Test Each Endpoint:

1. **Database Connection Test:** Use `/test` endpoints first
2. **Single User Test:** Test with known user_id from your data
3. **Date Range Test:** Test with dates you know have data
4. **Edge Cases:** Test with no data, invalid dates, missing user_id

### Example Test Commands:

```bash
# Heart Rate
curl "http://localhost:8000/api/v1/heart-rate/?start_time=2025-08-12T00:00:00Z&end_time=2025-08-12T23:59:59Z&user_id=google_XXX"

# Resting Heart Rate
curl "http://localhost:8000/api/v1/resting-heart-rate/?start_date=2025-08-12&user_id=google_XXX"

# Sleep
curl "http://localhost:8000/api/v1/sleep/?local_date=2025-08-12&user_id=google_XXX"
curl "http://localhost:8000/api/v1/sleep/summary?local_date=2025-08-12&user_id=google_XXX"

# Steps Range
curl "http://localhost:8000/api/v1/steps/range?start_date=2025-08-10&end_date=2025-08-12&user_id=google_XXX"
```

### Validation Points:

- All timestamps returned in ISO format
- Proper error handling for invalid dates
- Consistent response structure across endpoints
- No database connection leaks
- Fast query performance (< 1 second)

## Notes for Developer

- **Follow Existing Pattern:** The steps implementation is your template - copy its structure exactly
- **Date Handling:** Always convert string dates to proper Python date/datetime objects before database queries
- **Error Handling:** Wrap database calls in try/catch with proper HTTP error responses
- **Query Optimization:** Use indexed columns (user_id, timestamps, local_date) in WHERE clauses
- **Response Models:** Define clear Pydantic models for type safety and auto-generated API docs
