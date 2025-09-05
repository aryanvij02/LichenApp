# AWS S3 Permissions Setup for LichenApp FastAPI Backend

## Overview

Your FastAPI backend now processes ECG data and needs read access to your S3 bucket to download ECG voltage files.

## Required Permissions

- `s3:GetObject` on `arn:aws:s3:::healthkit-data-lichen/ecg_voltage/*`

## Option 1: IAM Role (Recommended)

### Step 1: Create IAM Policy

```bash
# Create the policy JSON file
cat > s3-read-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": [
                "arn:aws:s3:::healthkit-data-lichen/ecg_voltage/*"
            ]
        }
    ]
}
EOF

# Create the policy
aws iam create-policy \
    --policy-name LichenApp-S3-ReadAccess \
    --policy-document file://s3-read-policy.json
```

### Step 2: Create IAM Role

```bash
# Create trust policy for EC2
cat > trust-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

# Create the role
aws iam create-role \
    --role-name LichenApp-EC2-Role \
    --assume-role-policy-document file://trust-policy.json

# Attach the policy to the role (replace ACCOUNT_ID with your AWS account ID)
aws iam attach-role-policy \
    --role-name LichenApp-EC2-Role \
    --policy-arn arn:aws:iam::ACCOUNT_ID:policy/LichenApp-S3-ReadAccess
```

### Step 3: Create and Attach Instance Profile

```bash
# Create instance profile
aws iam create-instance-profile \
    --instance-profile-name LichenApp-EC2-Profile

# Add role to instance profile
aws iam add-role-to-instance-profile \
    --instance-profile-name LichenApp-EC2-Profile \
    --role-name LichenApp-EC2-Role

# Attach to EC2 instance (replace with your instance ID)
aws ec2 associate-iam-instance-profile \
    --instance-id i-1234567890abcdef0 \
    --iam-instance-profile Name=LichenApp-EC2-Profile
```

### Step 4: Restart FastAPI Service

After attaching the IAM role, restart your FastAPI service:

```bash
# If using systemd
sudo systemctl restart your-fastapi-service

# Or if running manually
pkill -f "uvicorn"
# Then restart your FastAPI app
```

## Option 2: Environment Variables (Less Secure)

If you can't use IAM roles, set these environment variables:

```bash
export AWS_ACCESS_KEY_ID=your_access_key_here
export AWS_SECRET_ACCESS_KEY=your_secret_key_here
export AWS_DEFAULT_REGION=us-east-1  # or your region

# Add to your shell profile to persist
echo 'export AWS_ACCESS_KEY_ID=your_access_key_here' >> ~/.bashrc
echo 'export AWS_SECRET_ACCESS_KEY=your_secret_key_here' >> ~/.bashrc
echo 'export AWS_DEFAULT_REGION=us-east-1' >> ~/.bashrc
```

## Testing

1. Copy `test_s3_access.py` to your EC2 instance
2. Run the test:

```bash
cd /path/to/your/backend
python test_s3_access.py
```

## Troubleshooting

### Common Issues:

1. **"Access Denied" errors**

   - Check IAM policy has correct bucket name and prefix
   - Ensure instance profile is attached to EC2 instance
   - Wait a few minutes for IAM changes to propagate

2. **"No credentials found" errors**

   - IAM role not attached properly
   - Environment variables not set
   - AWS CLI not configured

3. **"Bucket not found" errors**
   - Check bucket name in the policy matches your actual bucket
   - Ensure bucket exists and is in the same region

### Verify IAM Role is Attached:

```bash
# Check if IAM role is attached to your instance
aws ec2 describe-instances --instance-ids i-1234567890abcdef0 \
    --query 'Reservations[0].Instances[0].IamInstanceProfile'
```

### Check Current AWS Identity:

```bash
# This should show the IAM role if properly configured
aws sts get-caller-identity
```

## Security Notes

- ✅ **Use IAM roles** - Most secure, credentials managed by AWS
- ❌ **Avoid hardcoding credentials** in your code
- ❌ **Avoid long-lived access keys** when possible
- 🔒 **Principle of least privilege** - Only grant necessary permissions
