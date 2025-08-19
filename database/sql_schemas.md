Sleep Analysis
sql
Copy
Edit
CREATE TABLE sleep_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    stage_uuid VARCHAR NOT NULL UNIQUE,
    time_range TSTZRANGE NOT NULL,           -- [start_time, end_time)
    start_time TIMESTAMPTZ NOT NULL,         -- for response payload
    end_time TIMESTAMPTZ NOT NULL,           -- for response payload
    sleep_stage VARCHAR NOT NULL,            -- CORE, REM, DEEP, AWAKE, etc.
    hk_value INTEGER NOT NULL,               -- Original HealthKit value
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sleep_analysis_user_time ON sleep_analysis(user_id, start_time);
CREATE INDEX idx_sleep_analysis_time_range ON sleep_analysis USING GIST (time_range);
CREATE INDEX idx_sleep_analysis_user_stage ON sleep_analysis(user_id, sleep_stage);
Heart Rate Data
sql
Copy
Edit
CREATE TABLE heart_rate_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    reading_uuid VARCHAR NOT NULL UNIQUE,        -- from HealthKit UUID
    timestamp TIMESTAMPTZ NOT NULL,              -- single instant
    time_range TSTZRANGE NOT NULL,               -- [timestamp, timestamp] for range queries
    heart_rate INTEGER NOT NULL,                 -- BPM
    unit VARCHAR NOT NULL DEFAULT 'count/min',
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_heart_rate_user_time ON heart_rate_data(user_id, timestamp);
CREATE INDEX idx_heart_rate_time_range ON heart_rate_data USING GIST (time_range);
CREATE INDEX idx_heart_rate_timestamp ON heart_rate_data(timestamp);
Example Query – Range + Average:

sql
Copy
Edit
SELECT 
    MIN(timestamp) AS start_time,
    MAX(timestamp) AS end_time,
    JSON_AGG(
        JSON_BUILD_OBJECT('time', timestamp, 'value', heart_rate) 
        ORDER BY timestamp
    ) AS values,
    ROUND(AVG(heart_rate)) AS average_hr
FROM heart_rate_data 
WHERE user_id = $1 
  AND time_range && tstzrange($2, $3);
Resting Heart Rate
sql
Copy
Edit
CREATE TABLE resting_heart_rate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    reading_uuid VARCHAR NOT NULL UNIQUE,
    timestamp TIMESTAMPTZ NOT NULL,
    local_date DATE NOT NULL,                    -- user’s local date
    resting_heart_rate INTEGER NOT NULL,
    unit VARCHAR NOT NULL DEFAULT 'count/min',
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, local_date)                   -- one per day per user
);

-- Indexes
CREATE INDEX idx_resting_hr_user_date ON resting_heart_rate(user_id, local_date);
CREATE INDEX idx_resting_hr_timestamp ON resting_heart_rate(timestamp);
Example Query – Specific Date:

sql
Copy
Edit
SELECT local_date, resting_heart_rate
FROM resting_heart_rate 
WHERE user_id = $1 AND local_date = $2;
Steps
Raw Step Intervals
sql
Copy
Edit
CREATE TABLE step_intervals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    interval_uuid VARCHAR NOT NULL UNIQUE,
    time_range TSTZRANGE NOT NULL,               -- [start_time, end_time)
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    step_count INTEGER NOT NULL,
    unit VARCHAR NOT NULL DEFAULT 'count',
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_step_intervals_user_time ON step_intervals(user_id, start_time);
CREATE INDEX idx_step_intervals_time_range ON step_intervals USING GIST (time_range);
Daily Step Totals
sql
Copy
Edit
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

-- Index
CREATE INDEX idx_daily_steps_user_date ON daily_steps(user_id, local_date);
Example Query – Daily Total:

sql
Copy
Edit
SELECT local_date, total_steps AS steps
FROM daily_steps
WHERE user_id = $1 AND local_date = $2;
User Profiles
sql
Copy
Edit
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