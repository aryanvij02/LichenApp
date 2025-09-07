# Database Migration: user_profiles Table

## Summary

Changing `user_profiles` table to use `user_id` as the primary key instead of a separate `id` UUID column.

## Migration Steps

### 1. Backup Current Data (IMPORTANT!)

```sql
-- Create backup table
CREATE TABLE user_profiles_backup AS SELECT * FROM user_profiles;
```

### 2. Drop and Recreate Table

```sql
-- Drop current table (after backup!)
DROP TABLE user_profiles;

-- Create new table with user_id as primary key
-- (Use the schema from updated_user_profiles_schema.sql)
```

### 3. Restore Data (if you have existing users)

```sql
-- Insert data back without the old id column
INSERT INTO user_profiles (
    user_id, email, name, profile_picture_url, timezone,
    locale, country, region, health_data_enabled,
    notification_enabled, data_retention_days, first_login_at,
    last_login_at, profile_updated_at, created_at,
    auth_provider, provider_user_id, last_app_version, last_platform
)
SELECT
    user_id, email, name, profile_picture_url, timezone,
    locale, country, region, health_data_enabled,
    notification_enabled, data_retention_days, first_login_at,
    last_login_at, profile_updated_at, created_at,
    auth_provider, provider_user_id, last_app_version, last_platform
FROM user_profiles_backup;
```

### 4. Verify Migration

```sql
-- Check that data migrated correctly
SELECT COUNT(*) FROM user_profiles;
SELECT COUNT(*) FROM user_profiles_backup;

-- Verify primary key constraint
\d user_profiles
```

### 5. Clean Up (after verification)

```sql
-- Drop backup table once everything is working
DROP TABLE user_profiles_backup;
```

## Benefits of This Change

- ✅ Eliminates UUID generation complexity
- ✅ Simpler upsert operations
- ✅ More natural primary key (user_id is the actual unique identifier)
- ✅ Cleaner Lambda code
- ✅ Better performance (no need to check if user exists before insert/update)

## Code Changes Applied

- Updated `handle_user_profile()` function to use simple upsert
- Updated `get_user_timezone()` method for new schema
- Removed complex check-and-update logic
