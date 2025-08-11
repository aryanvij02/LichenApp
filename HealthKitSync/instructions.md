# HealthKit to S3 Data Pipeline Implementation Guide

## **Overview**
This guide will help you implement a simple data pipeline to upload all HealthKit data from the existing React Native app to AWS S3. The pipeline will handle both historical data and real-time streaming.

## **Prerequisites**
- Existing React Native app with HealthKit integration (as provided)
- AWS account with appropriate permissions
- Basic familiarity with AWS Console

---

## **Part 1: AWS Infrastructure Setup**

### **1.1 Create S3 Bucket**

1. **Login to AWS Console** → Navigate to S3
2. **Create Bucket**:
   - Bucket name: `healthkit-data-[your-project-name]` (must be globally unique)
   - Region: `us-east-1` (or your preferred region)
   - Leave all other settings as default
   - Click "Create bucket"

3. **Note down the bucket name** - you'll need it later

### **1.2 Create IAM Role for Lambda**

1. **Navigate to IAM** → Roles → Create Role
2. **Select trusted entity**: AWS Service → Lambda
3. **Add permissions**:
   - `AWSLambdaBasicExecutionRole` (for CloudWatch logs)
   - `AmazonS3FullAccess` (for S3 write access)
4. **Role name**: `HealthKitLambdaRole`
5. **Create role**

### **1.3 Create Lambda Function**

1. **Navigate to Lambda** → Create function
2. **Function configuration**:
   - Function name: `healthkit-data-processor`
   - Runtime: `Python 3.11`
   - Execution role: Use existing role → `HealthKitLambdaRole`
3. **Create function**

4. **Replace the default code** with this:

```python
import json
import boto3
from datetime import datetime
import uuid

def lambda_handler(event, context):
    print(f"Received event: {json.dumps(event)}")
    
    try:
        # Initialize S3 client
        s3 = boto3.client('s3')
        bucket_name = 'healthkit-data-your-project-name'  # Replace with your bucket name
        
        # Parse the request body
        if 'body' not in event:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({'error': 'No body in request'})
            }
        
        body = json.loads(event['body'])
        
        # Validate required fields
        if 'user_id' not in body or 'samples' not in body:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({'error': 'Missing user_id or samples'})
            }
        
        user_id = body['user_id']
        samples = body['samples']
        batch_type = body.get('batch_type', 'realtime')  # 'historical' or 'realtime'
        
        # Create filename with timestamp
        timestamp = datetime.utcnow().strftime('%Y-%m-%d-%H-%M-%S')
        batch_id = str(uuid.uuid4())[:8]
        filename = f"{user_id}/{timestamp}-{batch_type}-{batch_id}.json"
        
        # Prepare data to store
        data_to_store = {
            'user_id': user_id,
            'batch_type': batch_type,
            'upload_timestamp': timestamp,
            'batch_id': batch_id,
            'sample_count': len(samples),
            'samples': samples
        }
        
        # Upload to S3
        s3.put_object(
            Bucket=bucket_name,
            Key=filename,
            Body=json.dumps(data_to_store, indent=2),
            ContentType='application/json'
        )
        
        print(f"Successfully uploaded {len(samples)} samples for user {user_id}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'status': 'success',
                'samples_uploaded': len(samples),
                'filename': filename
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }
```

5. **Update the bucket name** in line 12 to match your bucket
6. **Deploy** the function

### **1.4 Create API Gateway**

1. **Navigate to API Gateway** → Create API
2. **Choose REST API** (not private)
3. **API name**: `healthkit-api`
4. **Create API**

5. **Create Resource**:
   - Actions → Create Resource
   - Resource Name: `upload-health-data`
   - Resource Path: `/upload-health-data`
   - Enable CORS: ✓
   - Create Resource

6. **Create POST Method**:
   - Select `/upload-health-data` resource
   - Actions → Create Method → POST
   - Integration type: Lambda Function
   - Lambda Region: (your region)
   - Lambda Function: `healthkit-data-processor`
   - Save

7. **Enable CORS**:
   - Select `/upload-health-data` resource
   - Actions → Enable CORS
   - Access-Control-Allow-Origin: `*`
   - Access-Control-Allow-Headers: `Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`
   - Access-Control-Allow-Methods: `POST,OPTIONS`
   - Enable CORS and replace existing CORS headers

8. **Deploy API**:
   - Actions → Deploy API
   - Deployment stage: New Stage → `prod`
   - Deploy

9. **Note the Invoke URL** - you'll see it after deployment (looks like: `https://xxxxxxx.execute-api.us-east-1.amazonaws.com/prod`)

### **1.5 Test the API**

Test with curl to make sure it works:

```bash
curl -X POST https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/upload-health-data \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-123",
    "batch_type": "test",
    "samples": [
      {
        "type": "HKQuantityTypeIdentifierStepCount",
        "value": 100,
        "unit": "count",
        "startDate": "2025-08-10T12:00:00.000Z",
        "endDate": "2025-08-10T12:00:00.000Z"
      }
    ]
  }'
```

You should see a success response and a new file appear in your S3 bucket.

---

## **Part 2: Mobile App Integration**

### **2.1 Create Data Upload Service**

Create a new file: `services/HealthDataUploader.ts`

```typescript
interface UploadConfig {
  apiUrl: string;
  userId: string;
}

interface UploadBatch {
  user_id: string;
  batch_type: 'historical' | 'realtime';
  samples: any[];
}

export class HealthDataUploader {
  private config: UploadConfig;
  private uploadQueue: any[] = [];
  private isUploading = false;

  constructor(config: UploadConfig) {
    this.config = config;
  }

  async uploadBatch(samples: any[], batchType: 'historical' | 'realtime' = 'realtime'): Promise<boolean> {
    if (samples.length === 0) {
      console.log('No samples to upload');
      return true;
    }

    const batch: UploadBatch = {
      user_id: this.config.userId,
      batch_type: batchType,
      samples: samples
    };

    console.log(`📤 Uploading ${samples.length} samples (${batchType})`);

    try {
      const response = await this.uploadWithRetry(batch);
      console.log(`✅ Successfully uploaded ${samples.length} samples`);
      return true;
    } catch (error) {
      console.error('❌ Upload failed:', error);
      return false;
    }
  }

  private async uploadWithRetry(batch: UploadBatch, maxRetries = 3): Promise<any> {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.config.apiUrl}/upload-health-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        return result;

      } catch (error) {
        lastError = error;
        console.log(`Upload attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  // Queue samples for batch upload
  queueSamples(samples: any[]) {
    this.uploadQueue.push(...samples);
    console.log(`📥 Queued ${samples.length} samples. Queue size: ${this.uploadQueue.length}`);

    // Auto-upload when queue gets large enough
    if (this.uploadQueue.length >= 50) {
      this.flushQueue();
    }
  }

  // Upload all queued samples
  async flushQueue(): Promise<boolean> {
    if (this.isUploading || this.uploadQueue.length === 0) {
      return true;
    }

    this.isUploading = true;
    const samplesToUpload = [...this.uploadQueue];
    this.uploadQueue = [];

    try {
      const success = await this.uploadBatch(samplesToUpload, 'realtime');
      return success;
    } finally {
      this.isUploading = false;
    }
  }

  // Upload all historical data
  async uploadHistoricalData(types: string[], days: number = 30): Promise<boolean> {
    try {
      console.log(`📊 Starting historical upload for last ${days} days`);
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Import your HealthKit bridge
      const HealthKitBridge = require('../modules/expo-healthkit-bridge/src/index').default;
      
      const result = await HealthKitBridge.queryDataInRange(
        types,
        startDate.toISOString(),
        endDate.toISOString()
      );

      // Flatten all the data into a single array
      const allSamples: any[] = [];
      Object.entries(result).forEach(([type, samples]: [string, any]) => {
        allSamples.push(...samples);
      });

      console.log(`📈 Found ${allSamples.length} historical samples`);

      // Upload in chunks to avoid large payloads
      const chunkSize = 100;
      for (let i = 0; i < allSamples.length; i += chunkSize) {
        const chunk = allSamples.slice(i, i + chunkSize);
        const success = await this.uploadBatch(chunk, 'historical');
        
        if (!success) {
          console.error(`Failed to upload chunk ${i / chunkSize + 1}`);
          return false;
        }

        // Small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`✅ Historical upload completed: ${allSamples.length} samples`);
      return true;

    } catch (error) {
      console.error('❌ Historical upload failed:', error);
      return false;
    }
  }
}
```

### **2.2 Modify App.tsx**

Add these imports to your `App.tsx`:

```typescript
import { HealthDataUploader } from './services/HealthDataUploader';
```

Add this to your component state:

```typescript
const [uploader, setUploader] = useState<HealthDataUploader | null>(null);
const [isUploading, setIsUploading] = useState(false);
```

Initialize the uploader in `useEffect`:

```typescript
useEffect(() => {
  // Initialize uploader
  const uploaderInstance = new HealthDataUploader({
    apiUrl: 'https://your-api-id.execute-api.us-east-1.amazonaws.com/prod', // Replace with your API URL
    userId: 'user-123' // Replace with actual user ID
  });
  setUploader(uploaderInstance);

  // Existing subscription code...
  const streamSubscription = HealthKitBridge.onDataStream((event) => {
    console.log("🌊 STREAMING DATA:", event);
    
    // Queue new samples for upload
    if (uploaderInstance && event.samples.length > 0) {
      uploaderInstance.queueSamples(event.samples);
    }
  });

  // Auto-flush queue every 5 minutes
  const flushInterval = setInterval(() => {
    if (uploaderInstance) {
      uploaderInstance.flushQueue();
    }
  }, 5 * 60 * 1000); // 5 minutes

  return () => {
    streamSubscription?.remove();
    clearInterval(flushInterval);
  };
}, []);
```

### **2.3 Add Upload Buttons**

Add these new handler functions:

```typescript
const handleUploadHistorical = async () => {
  if (!uploader) {
    Alert.alert("Error", "Uploader not initialized");
    return;
  }

  setIsUploading(true);
  try {
    const success = await uploader.uploadHistoricalData(permissions, 30);
    Alert.alert(
      success ? "Success" : "Error", 
      success ? "Historical data uploaded successfully" : "Failed to upload historical data"
    );
  } catch (error) {
    console.error("Upload error:", error);
    Alert.alert("Error", "Upload failed");
  } finally {
    setIsUploading(false);
  }
};

const handleFlushQueue = async () => {
  if (!uploader) {
    Alert.alert("Error", "Uploader not initialized");
    return;
  }

  setIsUploading(true);
  try {
    const success = await uploader.flushQueue();
    Alert.alert(
      success ? "Success" : "Error",
      success ? "Queued data uploaded successfully" : "Failed to upload queued data"
    );
  } finally {
    setIsUploading(false);
  }
};
```

Add these buttons to your button section:

```typescript
{/* Add after your existing buttons */}
<TouchableOpacity
  style={[styles.button, styles.primaryButton]}
  onPress={handleUploadHistorical}
  disabled={isLoading || isUploading || permissions.length === 0}
>
  {isUploading ? (
    <ActivityIndicator color="white" />
  ) : (
    <Text style={styles.buttonText}>Upload Historical Data (30 days)</Text>
  )}
</TouchableOpacity>

<TouchableOpacity
  style={[styles.button, styles.secondaryButton]}
  onPress={handleFlushQueue}
  disabled={isLoading || isUploading}
>
  {isUploading ? (
    <ActivityIndicator color="white" />
  ) : (
    <Text style={styles.buttonText}>Upload Queued Data</Text>
  )}
</TouchableOpacity>
```

---

## **Part 3: Testing & Verification**

### **3.1 Test Real-time Upload**

1. **Start the app** and request permissions
2. **Start background sync**
3. **Add some manual steps** in the Health app
4. **Check the console logs** - you should see samples being queued
5. **Press "Upload Queued Data"** or wait 5 minutes for auto-upload
6. **Check your S3 bucket** - you should see new files appearing

### **3.2 Test Historical Upload**

1. **Press "Upload Historical Data (30 days)"**
2. **Monitor console logs** for progress
3. **Check S3 bucket** for historical batch files
4. **Verify data completeness** by checking file contents

### **3.3 Monitor AWS Costs**

1. **Check AWS Billing Dashboard** regularly
2. **Set up billing alerts** for $10-20 limit
3. **Monitor S3 storage usage** in S3 console

---

## **Part 4: Configuration & Customization**

### **4.1 Update Configuration**

**Replace these placeholders with your actual values:**

1. **In Lambda function**: Update bucket name (line 12)
2. **In App.tsx**: Update API URL and user ID
3. **Test curl command**: Update API URL

### **4.2 Customize Upload Behavior**

**Adjust these parameters in `HealthDataUploader.ts`:**

- **Queue size trigger**: Change `50` in line with `uploadQueue.length >= 50`
- **Auto-flush interval**: Change `5 * 60 * 1000` (5 minutes)
- **Historical days**: Change default `30` days
- **Chunk size**: Change `100` for historical uploads
- **Retry attempts**: Change `maxRetries = 3`

### **4.3 Add More Data Types**

**To upload additional HealthKit data types:**

1. **Update permissions** in your existing permission request
2. **The uploader automatically handles** any data types you have permissions for
3. **No code changes needed** in the upload service

---

## **Part 5: Troubleshooting**

### **Common Issues**

1. **API Gateway CORS errors**:
   - Ensure CORS is enabled on the resource
   - Check that POST method exists
   - Verify headers are correct

2. **Lambda timeout**:
   - Default timeout is 3 seconds
   - Increase to 30 seconds in Lambda configuration if needed

3. **S3 permission errors**:
   - Verify IAM role has S3 write permissions
   - Check bucket name is correct

4. **Mobile network errors**:
   - Check API URL is correct
   - Verify network connectivity
   - Check console logs for detailed error messages

### **Debugging Steps**

1. **Check Lambda logs** in CloudWatch
2. **Check API Gateway logs** (enable if needed)
3. **Check mobile console logs** for detailed error info
4. **Verify S3 bucket contents** to confirm data flow

---

## **Expected Results**

After successful implementation:

1. **S3 bucket** will contain files like:
   ```
   user-123/
   ├── 2024-08-10-14-30-15-historical-abc123.json
   ├── 2024-08-10-14-35-22-realtime-def456.json
   └── 2024-08-10-14-40-18-realtime-ghi789.json
   ```

2. **Real-time data** will be uploaded automatically every 5 minutes or when 50 samples are queued

3. **Historical data** will be uploaded in chunks when the button is pressed

4. **Console logs** will show upload progress and success/failure status

5. **AWS costs** should be under $5/month for 100 users

This implementation provides a complete pipeline from HealthKit to S3 with minimal complexity and cost.