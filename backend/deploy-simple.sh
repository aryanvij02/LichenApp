#!/bin/bash

# Simple LichenHealth Backend Deployment Script
# Run this script on your EC2 instance to deploy the application

set -e  # Exit on any error

echo "🚀 Starting Simple LichenHealth Backend Deployment..."

# Configuration
APP_DIR="/opt/lichen-health"
BACKEND_DIR="$APP_DIR/backend"
SERVICE_NAME="lichen-health"
NGINX_SITE="lichen-health"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
print_status "Installing required packages..."
sudo apt install -y python3-pip python3-venv nginx git curl

# Create application directory
print_status "Creating application directory..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Clone or update repository (you'll need to replace this with your actual repo)
if [ -d "$BACKEND_DIR" ]; then
    print_status "Updating existing repository..."
    cd $BACKEND_DIR
    git pull origin main
else
    print_status "Cloning repository..."
    cd $APP_DIR
    # Replace with your actual repository URL
    git clone https://github.com/yourusername/LichenApp.git .
    cd backend
fi

# Create Python virtual environment
print_status "Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
print_status "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Create simple .env file if it doesn't exist
if [ ! -f ".env" ]; then
    print_status "Creating basic .env file..."
    cat > .env << EOF
APP_NAME=LichenHealth Backend
VERSION=1.0.0
DEBUG=false
ENVIRONMENT=production
HOST=0.0.0.0
PORT=8000
DATABASE_URL=postgresql://username:password@localhost:5432/lichen_health
SECRET_KEY=change-this-in-production
LOG_LEVEL=INFO
WORKERS=4
EOF
    echo "⚠️  Please edit .env file with your actual database URL!"
    echo "Edit: sudo nano $BACKEND_DIR/.env"
fi

# Test the application
print_status "Testing the application..."
python -c "from app.core.config import settings; print('✅ Configuration loaded successfully')"

# Configure systemd service
print_status "Configuring systemd service..."
sudo cp lichen-health.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME

# Configure Nginx with simple config
print_status "Configuring Nginx..."
sudo cp nginx-simple.conf /etc/nginx/sites-available/$NGINX_SITE

# Enable Nginx site
sudo ln -sf /etc/nginx/sites-available/$NGINX_SITE /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Set proper permissions
print_status "Setting proper permissions..."
sudo chown -R www-data:www-data $BACKEND_DIR

# Start services
print_status "Starting services..."
sudo systemctl restart $SERVICE_NAME
sudo systemctl restart nginx

# Wait for service to start
sleep 5

# Check service status
print_status "Checking service status..."
if sudo systemctl is-active --quiet $SERVICE_NAME; then
    print_status "✅ LichenHealth Backend service is running"
else
    print_error "❌ LichenHealth Backend service failed to start"
    sudo systemctl status $SERVICE_NAME
    exit 1
fi

if sudo systemctl is-active --quiet nginx; then
    print_status "✅ Nginx is running"
else
    print_error "❌ Nginx failed to start"
    sudo systemctl status nginx
    exit 1
fi

# Test API endpoint
print_status "Testing API endpoint..."
sleep 2
if curl -f -s http://localhost/health > /dev/null; then
    print_status "✅ API health check passed"
    echo "🎉 Deployment completed successfully!"
else
    print_status "⚠️  API health check failed. Checking logs..."
    echo "Check logs with: sudo journalctl -u $SERVICE_NAME -f"
fi

echo
echo "Your LichenHealth Backend is now running!"
echo "API Endpoints:"
echo "  Health Check: http://your-server-ip/health"
echo "  API Docs:     http://your-server-ip/docs"
echo "  Heart Rate:   http://your-server-ip/api/v1/heart-rate/"
echo
echo "Useful commands:"
echo "  Check service: sudo systemctl status $SERVICE_NAME"
echo "  View logs:     sudo journalctl -u $SERVICE_NAME -f"
echo "  Restart:       sudo systemctl restart $SERVICE_NAME"
