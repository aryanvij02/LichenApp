# LichenApp - Technical Handover Documentation

## Overview

This project involves four main aspects: (1) React Native application, (2) Native Swift modules which plug into the ReactNative/Expo side of the application, allowing us to access native functionalities on the iPhone such as accessing HealthKit APIs, (3) Lambda function on AWS behind an API Gateway which acts as our pre-processing engine, that takes raw data that is exposed by HealthKit's API, does de-duplication, and stores the data into a S3 DataLake for backup and Supabase SQL Tables, (4) EC2 Instance which acts as our backend server, built as a FastAPI application which exposes endpoints that can be hit to fetch specific data to serve the UI of our application.

EC2 Instance is put behind a NGINX reverse proxy and has SSL certificate from Certbot to expose an endpoint that can be hit publicly. A domain is currently configured for this EC2 Instance but can be easily changed in the NGINX configurations within the EC2 Server.

We have Google Authentication (SSO Login) and Google Calendar integration working with the application. One of the biggest challenges was accurately uploading data to the cloud from the application, in the foreground and the background. iOS limits background processing and therefore the final conclusion was: Queue all incoming data in a local SQLite table, whenever iOS enables background processes for the application, try to send as much data as possible. This seems to be the only way to do this as determined by exploring the functionalities and how notifications show up on other apps like Bevel and Welltory.

---

## Project Structure

```
LichenApp/
├── HealthKitSync/                    # React Native Mobile Application
├── backend/                          # FastAPI Backend Server (EC2)
├── lambda/                          # AWS Lambda Functions
├── database/                        # Database schemas and documentation
├── docs/                           # Additional documentation
└── PROJECT_HANDOVER.md             # This file
```

---

## 1. React Native Mobile Application (`HealthKitSync/`)

### **Primary Location**: `/HealthKitSync/`

The mobile app is built with **Expo (~53.0.20)** and **React Native 0.79.5**. This is where users interact with their health data.

#### **Key Directories:**

```
HealthKitSync/
├── modules/expo-healthkit-bridge/    # 🔥 CRITICAL: Custom Swift HealthKit module
├── screens/                         # Main app screens (Home, Biology, Calendar, etc.)
├── components/                      # Reusable UI components
├── services/                       # API integration services
├── hooks/                          # React Query hooks for state management
├── config/                         # Authentication configuration
├── ios/                           # iOS-specific configurations
├── android/                       # Android build configurations
└── docs/                         # Technical documentation
```

#### **🔥 Most Important: Custom HealthKit Bridge**

**Location**: `HealthKitSync/modules/expo-healthkit-bridge/`

This is the **heart of the iOS integration**. The custom Expo module written in Swift that handles:

- **HealthKit API Access**: `ios/ExpoHealthkitBridgeModule.swift` (2000+ lines)
- **Background Processing**: 3-tier sync strategy implementation
- **Data Queuing**: SQLite-based local storage for failed uploads
- **Permission Management**: HealthKit authorization flows

**Key Files:**

- `ios/ExpoHealthkitBridgeModule.swift` - Main Swift implementation
- `src/index.ts` - TypeScript interface definitions
- `expo-healthkit-bridge.podspec` - iOS module configuration

#### **Background Sync Architecture**

The app implements a sophisticated 3-tier sync strategy to handle iOS background limitations:

**Tier 1 (Real-time)**: Critical health data (HRV, ECG, Sleep, Resting HR)

- HKObserverQuery with immediate frequency
- 3 quick retries, then queue for Tier 3

**Tier 2 (Background)**: High-volume data (Heart Rate, Steps, Distance, Energy)

- BGProcessingTask for batch uploads
- All-or-nothing failure handling

**Tier 3 (Foreground)**: Safety net

- Process failed upload queues
- 24-hour comprehensive catch-up sync

**Documentation**: `HealthKitSync/docs/ETL-Pipeline-Architecture.md`

#### **Screens & Navigation**

```
screens/
├── HomeScreen.tsx           # Dashboard with health widgets
├── BiologyScreen.tsx        # Health data visualizations
├── CalendarScreen.tsx       # Google Calendar integration
├── CoachScreen.tsx          # AI coaching features
├── SettingsScreen.tsx       # User preferences
└── LoginScreen.tsx          # Google OAuth authentication
```

#### **API Integration Services**

```
services/
├── HealthAPIService.ts      # Backend API communication
├── HealthKitService.ts      # Native HealthKit bridge interface
├── GoogleCalendarService.ts # Google Calendar API
├── UserProfileService.ts    # User management
└── SettingsService.ts       # App configuration
```

---

## 2. FastAPI Backend Server (`backend/`)

### **Primary Location**: `/backend/`

The backend runs on **EC2** behind **NGINX** and serves as the API layer between the mobile app and the database.

#### **Key Architecture:**

```
backend/
├── app/
│   ├── api/routes/          # 🔥 API endpoint definitions
│   ├── services/            # Business logic layer
│   ├── models/              # Pydantic response models
│   └── core/                # Database & configuration
├── main.py                  # 🔥 FastAPI application entry point
├── requirements.txt         # Python dependencies
├── nginx.conf              # 🔥 NGINX reverse proxy config
└── ssl-setup.sh            # SSL certificate automation
```

#### **🔥 Core API Routes**

**Location**: `backend/app/api/routes/`

```
routes/
├── steps.py                # Step count endpoints
├── heart_rate.py           # Heart rate data endpoints
├── resting_heart_rate.py   # Daily resting HR
├── sleep.py                # Sleep analysis endpoints
└── neurokit.py            # 🔥 ECG processing with NeuroKit2
```

**Key Endpoint**: `/api/v1/neurokit/process-ecg` - Processes ECG voltage data from S3 using NeuroKit2 library for HRV analysis (RMSSD/SDNN calculations).

#### **🔥 Database Integration**

**Location**: `backend/app/core/`

- **Database**: Supabase PostgreSQL with connection pooling
- **ORM**: Direct asyncpg for performance
- **Connection Management**: Connection pool with health checks

#### **🔥 NGINX Configuration**

**Location**: `backend/nginx.conf`

- **Reverse Proxy**: Routes traffic to FastAPI (port 8000)
- **SSL/TLS**: Certbot Let's Encrypt integration
- **Rate Limiting**: API protection (10 req/s for API, 30 req/s for health)
- **CORS**: Mobile app support with proper headers
- **Security**: Comprehensive HTTP security headers

#### **Key Features:**

- Health monitoring endpoints (`/health`, `/metrics`)
- Database connection pooling
- Structured logging with JSON format
- ECG signal processing with NeuroKit2
- Time-series query optimization

---

## 3. AWS Lambda Functions (`lambda/`)

### **Primary Location**: `/lambda/`

Lambda functions handle data ingestion and preprocessing behind API Gateway.

#### **Main Lambda Function**

**Location**: `lambda/lambda_function.py` (1296 lines)

**Three Primary Endpoints:**

1. **`/upload-health-data`** - Main health data ingestion

   - Processes HealthKit data from mobile app
   - Stores raw data to S3 with hierarchical organization
   - Processes and stores structured data to Supabase
   - Handles deduplication and data validation

2. **`/user/profile`** - User profile management

   - Creates/updates user profiles in both S3 and Supabase
   - Handles Google OAuth user information
   - Manages timezone and user preferences

3. **`/get-presigned-url`** - ECG voltage data upload
   - Generates presigned S3 URLs for large ECG voltage files
   - Enables secure direct upload from mobile app to S3

#### **Key Classes & Functions:**

```python
class HealthDataProcessor:    # Processes different health data types
class SupabaseClient:        # Database operations
handle_health_data_upload()  # Main data ingestion handler
handle_user_profile()        # User profile management
call_fastapi_ecg_processing() # ECG analysis via backend
```

#### **Data Processing Pipeline:**

1. **Data Grouping**: Organizes by source, year-month, data type
2. **S3 Storage**: Hierarchical structure `user_id/source/year-month/data-type/`
3. **Database Processing**: Transforms and stores in optimized PostgreSQL tables
4. **ECG Analysis**: Coordinates with FastAPI backend for voltage analysis
5. **Notifications**: SNS alerts for monitoring

#### **Supported Health Data Types:**

- Heart Rate (high-frequency readings)
- Heart Rate Variability (SDNN + ECG analysis)
- Sleep Analysis (smart session grouping)
- Step Count (intervals + daily aggregation)
- Resting Heart Rate (daily values)
- ECG with voltage data processing

---

## 4. Database Architecture (`database/`)

### **Primary Location**: `/database/`

Contains database schemas, migration plans, and documentation.

#### **Key Files:**

```
database/
├── sql_schemas.md              # 🔥 Current PostgreSQL table definitions
├── health_data_schema_plan.md  # Future expansion plans
├── updated_user_profiles_schema.sql # User management schema
└── migration_notes.md          # Database evolution notes
```

#### **🔥 Core Database Tables** (Supabase PostgreSQL)

**Current Implementation:**

```sql
user_profiles              # User authentication, preferences, timezone
heart_rate_data           # High-frequency HR readings with TSTZRANGE
heart_rate_variability    # HRV data (SDNN, RMSSD) from Apple Watch + ECG
sleep_sessions           # Grouped sleep stages with smart session detection
step_intervals           # Raw step data with time ranges
daily_steps             # Aggregated daily step totals
resting_heart_rate      # Daily resting HR values
```

#### **Key Database Features:**

- **Time-Series Optimization**: TSTZRANGE for efficient time-based queries
- **User Timezone Handling**: UTC storage with local date conversion
- **Deduplication**: UUID-based uniqueness constraints
- **Indexing Strategy**: GIST indexes for time ranges, B-tree for user queries

---

## 5. Critical Integrations

### **5.1 Google Authentication & Calendar**

**Setup Location**: `HealthKitSync/config/auth.ts`

**Requirements:**

- Google Cloud Console project with Calendar API enabled
- OAuth 2.0 client IDs (Web + iOS)
- Proper scopes: calendar.readonly, calendar.events

**Documentation**: `HealthKitSync/docs/google-calendar-setup.md`

### **5.2 AWS Infrastructure**

**Key AWS Services:**

- **S3 Bucket**: `healthkit-data-lichen` (hierarchical data storage)
- **Lambda**: 3 functions behind API Gateway
- **EC2**: Backend server with IAM role for S3 access
- **SNS**: Monitoring and notification system

**Configuration**: `backend/setup_aws_permissions.md`

### **5.3 iOS Background Processing**

**Challenge**: iOS severely limits background execution
**Solution**: 3-tier fallback system with local SQLite queuing

**Implementation**: `HealthKitSync/modules/expo-healthkit-bridge/ios/`

**Key Insight**: Instead of fighting iOS limitations, the system embraces them by ensuring eventual data delivery through foreground sync safety nets.

---

## 6. Development Environment Setup

### **6.1 Mobile App**

```bash
cd HealthKitSync/
npm install
npx expo run:ios    # Requires Xcode and iOS device/simulator
```

**Requirements:**

- Node.js, Expo CLI
- Xcode 15+ for iOS development
- iOS 14+ device for HealthKit testing

### **6.2 Backend Server**

```bash
cd backend/
python -m venv backend_venv
source backend_venv/bin/activate
pip install -r requirements.txt

# Configure environment variables
cp env.template .env
# Edit .env with your database URL, AWS credentials, etc.

python main.py  # Development server
```

**Requirements:**

- Python 3.11+
- PostgreSQL database (Supabase recommended)
- AWS credentials for S3 access

### **6.3 Lambda Functions**

```bash
cd lambda/
# Lambda deployment handled via AWS Console or CLI
# Dependencies packaged in lambda-package/
```

---

## 7. Configuration Files

### **7.1 Environment Variables**

**Backend** (`.env`):

```bash
DATABASE_URL=postgresql://user:pass@host:port/db
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
AWS_ACCESS_KEY_ID=AKIA...
S3_BUCKET_NAME=healthkit-data-lichen
```

**Lambda Environment Variables**:

- Same as backend plus SNS_TOPIC_ARN
- FASTAPI_BACKEND_URL for ECG processing

### **7.2 Domain & SSL Configuration**

**Location**: `backend/nginx.conf`

**SSL Setup**: `backend/ssl-setup.sh` (Certbot automation)

**Domain Configuration**: Update `server_name` in nginx.conf

---

## 8. Key Technical Decisions & Rationale

### **8.1 Why 3-Tier Sync Architecture?**

iOS background processing is unreliable. The solution:

- **Tier 1**: Real-time for critical data (low frequency, high importance)
- **Tier 2**: Background batching for high-volume data
- **Tier 3**: Foreground catch-all safety net

**Documentation**: `HealthKitSync/docs/ETL-Pipeline-Architecture.md`

### **8.2 Why Dual Storage (S3 + PostgreSQL)?**

- **S3**: Raw data backup, compliance, full data retention
- **PostgreSQL**: Optimized queries, real-time analytics, mobile API

### **8.3 Why Custom HealthKit Module?**

Expo's HealthKit support was insufficient for:

- Complex background processing requirements
- ECG voltage data handling
- Fine-grained permission management
- Advanced observer query configurations

---

## 9. Monitoring & Operations

### **9.1 Health Monitoring**

- **Backend**: `/health` endpoint with database connectivity check
- **Metrics**: `/metrics` endpoint with connection pool statistics
- **Logs**: Structured JSON logging across all components
- **Alerts**: SNS notifications for data upload events

### **9.2 Data Pipeline Monitoring**

- **Upload Success Rates**: Track via SNS notifications
- **Queue Sizes**: SQLite queue monitoring in mobile app
- **Database Performance**: Connection pool metrics
- **API Performance**: NGINX access logs with timing

---

## 10. Known Issues & Solutions

### **10.1 iOS Background Sync Issues**

**Problem**: iOS throttles background observers
**Solution**: Comprehensive foreground sync catches all missed data
**Monitoring**: Queue size tracking in mobile app

### **10.2 Google OAuth Setup**

**Problem**: "Access blocked" during development
**Solution**: Add test users to OAuth consent screen
**Documentation**: `HealthKitSync/docs/google-calendar-setup.md`

### **10.3 ECG Processing Performance**

**Problem**: Large ECG voltage files (50MB+)
**Solution**: Presigned S3 URLs + async backend processing
**Architecture**: Mobile → S3 direct upload → Lambda triggers backend analysis

---

## 11. Future Development Priorities

### **11.1 Additional Health Data Types**

The architecture supports but doesn't yet implement:

- Active/Basal Energy, VO2 Max, Body Temperature
- Environmental Audio, Running Power, Workout Sessions
- Blood Oxygen, Respiratory Rate

**Schema Plans**: `database/health_data_schema_plan.md`

### **11.2 Scalability Enhancements**

- Database partitioning for time-series data
- Container orchestration (Docker/Kubernetes)
- Enhanced monitoring and alerting
- CDN for mobile app assets

---

## 12. Critical Files Summary

**Must understand for system maintenance:**

1. **`HealthKitSync/modules/expo-healthkit-bridge/ios/ExpoHealthkitBridgeModule.swift`** - Core iOS integration (2000+ lines)
2. **`lambda/lambda_function.py`** - Data ingestion pipeline (1296 lines)
3. **`backend/main.py`** - FastAPI application setup
4. **`backend/nginx.conf`** - Reverse proxy and SSL configuration
5. **`database/sql_schemas.md`** - Current database structure
6. **`HealthKitSync/docs/ETL-Pipeline-Architecture.md`** - Background sync strategy

**Configuration Files:**

- `backend/.env` - Backend environment variables
- `HealthKitSync/config/auth.ts` - Google OAuth setup
- Lambda environment variables (AWS Console)

---

This documentation provides the technical foundation needed to understand, maintain, and extend the LichenApp health data platform. The system prioritizes data reliability over real-time performance, embracing iOS limitations rather than fighting them, and ensures comprehensive health data collection and analysis capabilities.
