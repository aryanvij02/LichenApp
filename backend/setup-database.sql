-- LichenHealth Database Setup Script
-- Run this script to create all necessary tables

-- Create database (if using local PostgreSQL)
-- CREATE DATABASE lichen_health;
-- CREATE USER lichen_user WITH PASSWORD 'your_secure_password';
-- GRANT ALL PRIVILEGES ON DATABASE lichen_health TO lichen_user;

-- Connect to lichen_health database before running the rest

-- Sleep Analysis Table
CREATE TABLE IF NOT EXISTS sleep_analysis (
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

-- Sleep Analysis Indexes
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_user_time ON sleep_analysis(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_time_range ON sleep_analysis USING GIST (time_range);
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_user_stage ON sleep_analysis(user_id, sleep_stage);

-- Heart Rate Data Table
CREATE TABLE IF NOT EXISTS heart_rate_data (
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

-- Heart Rate Indexes
CREATE INDEX IF NOT EXISTS idx_heart_rate_user_time ON heart_rate_data(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_heart_rate_time_range ON heart_rate_data USING GIST (time_range);
CREATE INDEX IF NOT EXISTS idx_heart_rate_timestamp ON heart_rate_data(timestamp);

-- Resting Heart Rate Table
CREATE TABLE IF NOT EXISTS resting_heart_rate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    reading_uuid VARCHAR NOT NULL UNIQUE,
    timestamp TIMESTAMPTZ NOT NULL,
    local_date DATE NOT NULL,                    -- user's local date
    resting_heart_rate INTEGER NOT NULL,
    unit VARCHAR NOT NULL DEFAULT 'count/min',
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, local_date)                   -- one per day per user
);

-- Resting Heart Rate Indexes
CREATE INDEX IF NOT EXISTS idx_resting_hr_user_date ON resting_heart_rate(user_id, local_date);
CREATE INDEX IF NOT EXISTS idx_resting_hr_timestamp ON resting_heart_rate(timestamp);

-- Step Intervals Table
CREATE TABLE IF NOT EXISTS step_intervals (
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

-- Step Intervals Indexes
CREATE INDEX IF NOT EXISTS idx_step_intervals_user_time ON step_intervals(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_step_intervals_time_range ON step_intervals USING GIST (time_range);

-- Daily Steps Table
CREATE TABLE IF NOT EXISTS daily_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    local_date DATE NOT NULL,
    total_steps INTEGER NOT NULL,
    source_name VARCHAR NOT NULL,
    upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, local_date)
);

-- Daily Steps Index
CREATE INDEX IF NOT EXISTS idx_daily_steps_user_date ON daily_steps(user_id, local_date);

-- User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR UNIQUE NOT NULL,
    email VARCHAR,
    name VARCHAR,
    profile_picture_url VARCHAR,
    timezone VARCHAR,
    locale VARCHAR,
    country VARCHAR,
    region VARCHAR,
    health_data_enabled BOOLEAN DEFAULT true,
    notification_enabled BOOLEAN DEFAULT true,
    data_retention_days INT DEFAULT 365,
    first_login_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    profile_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    auth_provider VARCHAR,
    provider_user_id VARCHAR,
    last_app_version VARCHAR,
    last_platform VARCHAR
);

-- User Profiles Index
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Insert a test user (optional)
INSERT INTO user_profiles (user_id, email, name) 
VALUES ('test_user_123', 'test@example.com', 'Test User')
ON CONFLICT (user_id) DO NOTHING;

-- Show created tables
\dt

-- Show table sizes
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats 
WHERE schemaname = 'public';

COMMIT;
