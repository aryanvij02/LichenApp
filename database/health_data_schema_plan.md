# Health Data Database Schema Plan

## 🎯 **Engineering Approach**

### **Phase 1: Data Discovery & Generic Storage (CURRENT)**

1. **Audit incoming data** - See what Apple Watch actually sends
2. **Generic `raw_health_data` table** - Store everything temporarily
3. **Analyze patterns** - Understand data structures and frequencies

### **Phase 2: Specific Table Design (NEXT)**

4. **Design optimized tables** for each data type
5. **Implement specific processors** for high-value data types
6. **Migrate from generic** to specific tables

---

## 📊 **Phase 1: Generic Storage Table**

```sql
CREATE TABLE raw_health_data (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    sample_uuid TEXT UNIQUE,
    data_type TEXT NOT NULL,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    value TEXT, -- Flexible string storage
    unit TEXT,
    source_name TEXT,
    device TEXT,
    metadata JSONB, -- Rich metadata storage
    raw_sample JSONB, -- Complete Apple Watch sample
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexes for performance
    INDEX idx_raw_health_user_type (user_id, data_type),
    INDEX idx_raw_health_time (start_time),
    INDEX idx_raw_health_uuid (sample_uuid)
);
```

**Benefits:**

- ✅ **Captures EVERYTHING** - No data loss
- ✅ **Fast to implement** - Single table
- ✅ **Analysis ready** - JSONB for flexible queries
- ✅ **Migration safe** - Can extract to specific tables later

---

## 📈 **Phase 2: Specific Tables (Priority Order)**

### **1. HRV Data (HIGHEST PRIORITY)**

```sql
CREATE TABLE hrv_data (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    reading_uuid TEXT UNIQUE,
    timestamp TIMESTAMPTZ NOT NULL,
    sdnn_ms DECIMAL(8,3), -- SDNN in milliseconds
    algorithm_version INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hrv_instantaneous_bpm (
    id BIGSERIAL PRIMARY KEY,
    hrv_reading_id BIGINT REFERENCES hrv_data(id),
    sequence_number INTEGER, -- Order in the array
    bpm DECIMAL(6,2), -- Beats per minute
    timestamp_offset_ms INTEGER -- Milliseconds from start
);
```

### **2. Energy Data (HIGH PRIORITY)**

```sql
CREATE TABLE energy_data (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    reading_uuid TEXT UNIQUE,
    energy_type TEXT NOT NULL, -- 'basal' or 'active'
    time_range TSTZRANGE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    calories DECIMAL(8,2),
    unit TEXT DEFAULT 'Cal',
    source_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_energy_user_type_time (user_id, energy_type, start_time)
);
```

### **3. Environmental Audio (MEDIUM PRIORITY)**

```sql
CREATE TABLE environmental_audio (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    reading_uuid TEXT UNIQUE,
    time_range TSTZRANGE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    db_level DECIMAL(6,2), -- dBASPL
    unit TEXT DEFAULT 'dBASPL',
    source_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **4. Physical Effort (MEDIUM PRIORITY)**

```sql
CREATE TABLE physical_effort (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    reading_uuid TEXT UNIQUE,
    time_range TSTZRANGE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    effort_intensity DECIMAL(8,3), -- kcal/hr·kg
    activity_type INTEGER, -- HKActivityType value
    algorithm_version INTEGER,
    effort_estimation_type INTEGER,
    unit TEXT DEFAULT 'kcal/hr·kg',
    source_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **5. Daylight Exposure (MEDIUM PRIORITY)**

```sql
CREATE TABLE daylight_exposure (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    reading_uuid TEXT UNIQUE,
    time_range TSTZRANGE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    daylight_minutes DECIMAL(6,2),
    max_light_intensity_lux DECIMAL(10,2), -- From metadata
    unit TEXT DEFAULT 'min',
    source_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🚀 **Implementation Strategy**

### **Step 1: Deploy Generic Processor (TODAY)**

1. ✅ Add data audit logging to Lambda
2. ✅ Add generic processor function
3. 🔄 Create `raw_health_data` table in Supabase
4. 🔄 Test with real Apple Watch data

### **Step 2: Analyze Real Data (THIS WEEK)**

1. Run app with background sync enabled
2. Review Lambda CloudWatch logs for data audit
3. Query `raw_health_data` table to see actual structures
4. Identify most common data types and patterns

### **Step 3: Prioritize Specific Processors (NEXT WEEK)**

1. **HRV first** - Most valuable for health analysis
2. **Energy data** - High frequency, useful for activity
3. **Audio/Daylight** - Unique Apple Watch features
4. **Physical effort** - Workout and activity insights

### **Step 4: Optimize & Clean (ONGOING)**

1. Move processed data from generic to specific tables
2. Add data quality checks and validation
3. Create analytics views and aggregations
4. Archive old raw data after processing

---

## 🔍 **Data Analysis Queries**

### **See what data types are coming in:**

```sql
SELECT
    data_type,
    COUNT(*) as sample_count,
    MIN(start_time) as earliest,
    MAX(start_time) as latest,
    COUNT(DISTINCT user_id) as users
FROM raw_health_data
GROUP BY data_type
ORDER BY sample_count DESC;
```

### **Analyze metadata patterns:**

```sql
SELECT
    data_type,
    jsonb_object_keys(metadata) as metadata_key,
    COUNT(*) as frequency
FROM raw_health_data
WHERE metadata IS NOT NULL
GROUP BY data_type, jsonb_object_keys(metadata)
ORDER BY data_type, frequency DESC;
```

### **Find HRV samples with InstantaneousBeatsPerMinute:**

```sql
SELECT
    data_type,
    raw_sample->'metadata'->>'HeartRateVariabilityMetadataList' as hrv_metadata,
    LENGTH(raw_sample->'metadata'->>'HeartRateVariabilityMetadataList') as metadata_size
FROM raw_health_data
WHERE data_type = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'
LIMIT 5;
```

---

## ✅ **Success Metrics**

**Phase 1 Success:**

- [ ] All 20+ data types captured in `raw_health_data`
- [ ] No data loss from Apple Watch
- [ ] Rich metadata preserved in JSONB
- [ ] Real-time analysis possible via SQL

**Phase 2 Success:**

- [ ] HRV data with InstantaneousBeatsPerMinute arrays
- [ ] Energy data for activity analysis
- [ ] Environmental data for circadian insights
- [ ] Optimized queries < 100ms response time
