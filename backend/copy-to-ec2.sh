#!/bin/bash

# Script to copy LichenHealth Backend to EC2 instance
# Run this script FROM YOUR LOCAL MACHINE

# Configuration - UPDATE THESE VALUES
EC2_IP="your-ec2-public-ip"           # Replace with your EC2 public IP
KEY_FILE="path/to/your-key.pem"       # Replace with path to your .pem file
EC2_USER="ubuntu"                     # Default for Ubuntu AMI

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if variables are set
if [[ "$EC2_IP" == "your-ec2-public-ip" ]]; then
    print_error "Please update EC2_IP variable with your actual EC2 public IP"
    exit 1
fi

if [[ "$KEY_FILE" == "path/to/your-key.pem" ]]; then
    print_error "Please update KEY_FILE variable with path to your .pem file"
    exit 1
fi

if [[ ! -f "$KEY_FILE" ]]; then
    print_error "Key file not found: $KEY_FILE"
    exit 1
fi

# Ensure key file has correct permissions
chmod 400 "$KEY_FILE"

print_status "Copying LichenHealth Backend to EC2 instance..."
print_status "EC2 IP: $EC2_IP"
print_status "Key file: $KEY_FILE"

# Get the directory where this script is located (should be backend/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_status "Project root: $PROJECT_ROOT"
print_status "Backend directory: $SCRIPT_DIR"

# Test SSH connection
print_status "Testing SSH connection..."
if ssh -i "$KEY_FILE" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$EC2_USER@$EC2_IP" "echo 'SSH connection successful'"; then
    print_status "✅ SSH connection successful"
else
    print_error "❌ SSH connection failed. Check your EC2 IP and key file."
    exit 1
fi

# Create application directory on EC2
print_status "Creating application directory on EC2..."
ssh -i "$KEY_FILE" "$EC2_USER@$EC2_IP" "sudo mkdir -p /opt/lichen-health && sudo chown ubuntu:ubuntu /opt/lichen-health"

# Copy the entire project to EC2
print_status "Copying project files to EC2..."
scp -i "$KEY_FILE" -r "$PROJECT_ROOT" "$EC2_USER@$EC2_IP:/opt/lichen-health/"

# Rename the copied directory to match expected structure
ssh -i "$KEY_FILE" "$EC2_USER@$EC2_IP" "cd /opt/lichen-health && mv LichenApp/* . && rmdir LichenApp"

# Make deployment script executable
print_status "Making deployment script executable..."
ssh -i "$KEY_FILE" "$EC2_USER@$EC2_IP" "chmod +x /opt/lichen-health/backend/ec2-deploy.sh"

print_status "✅ Files copied successfully!"
echo
echo "Next steps:"
echo "1. SSH into your EC2 instance:"
echo "   ssh -i $KEY_FILE $EC2_USER@$EC2_IP"
echo
echo "2. Run the deployment script:"
echo "   cd /opt/lichen-health/backend"
echo "   ./ec2-deploy.sh"
echo
echo "3. Edit the .env file with your database credentials when prompted"
