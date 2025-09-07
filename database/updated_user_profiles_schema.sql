-- Updated User Profiles Table (user_id as primary key)
DROP TABLE IF EXISTS user_profiles;

CREATE TABLE user_profiles (
    user_id VARCHAR PRIMARY KEY,  -- Now the primary key instead of id
    email VARCHAR NOT NULL,
    name VARCHAR,
    profile_picture_url VARCHAR,
    timezone VARCHAR,
    locale VARCHAR,
    country VARCHAR,
    region VARCHAR,
    health_data_enabled BOOLEAN DEFAULT TRUE,
    notification_enabled BOOLEAN DEFAULT TRUE,
    data_retention_days INT DEFAULT 365,
    first_login_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    profile_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    auth_provider VARCHAR DEFAULT 'google',
    provider_user_id VARCHAR,  -- Keep this for reference, but user_id is now the key
    last_app_version VARCHAR,
    last_platform VARCHAR
);

-- Indexes (user_id already has index as primary key)
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_created_at ON user_profiles(created_at);
CREATE INDEX idx_user_profiles_last_login_at ON user_profiles(last_login_at);

-- Add some constraints
ALTER TABLE user_profiles ADD CONSTRAINT check_user_id_not_empty 
    CHECK (user_id IS NOT NULL AND LENGTH(user_id) > 0);

ALTER TABLE user_profiles ADD CONSTRAINT check_email_format 
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
