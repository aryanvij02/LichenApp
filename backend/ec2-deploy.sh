#!/bin/bash

# EC2 Deployment Script for LichenHealth Backend
# Run this script ON YOUR EC2 INSTANCE after copying your code

set -e  # Exit on any error

echo "🚀 Setting up LichenHealth Backend on EC2..."

# Configuration
APP_DIR="/opt/lichen-health"
BACKEND_DIR="$APP_DIR/backend"
SERVICE_NAME="lichen-health"
NGINX_SITE="lichen-health"

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

# Check if we're on Ubuntu
if [[ ! -f /etc/lsb-release ]] || ! grep -q "Ubuntu" /etc/lsb-release; then
    print_error "This script is designed for Ubuntu. Please run on Ubuntu 22.04 LTS."
    exit 1
fi

# Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
print_status "Installing required packages..."
sudo apt install -y python3-pip python3-venv nginx git curl htop

# Create application directory
print_status "Setting up application directory..."
sudo mkdir -p $APP_DIR
sudo chown ubuntu:ubuntu $APP_DIR

# Check if code exists
if [[ ! -d "$BACKEND_DIR" ]]; then
    print_error "Backend code not found at $BACKEND_DIR"
    echo "Please copy your backend code to $APP_DIR first."
    echo "You can use scp or git clone."
    exit 1
fi

cd $BACKEND_DIR

# Create Python virtual environment
print_status "Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
print_status "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Create .env file if it doesn't exist
if [[ ! -f ".env" ]]; then
    print_warning "Creating .env file from template..."
    if [[ -f "env.template" ]]; then
        cp env.template .env
    else
        cat > .env << 'EOF'
APP_NAME=LichenHealth Backend
VERSION=1.0.0
DEBUG=false
ENVIRONMENT=production
HOST=0.0.0.0
PORT=8000
DATABASE_URL=postgresql://lichen_user:your_secure_password@localhost:5432/lichen_health
SECRET_KEY=change-this-super-secret-key-in-production
LOG_LEVEL=INFO
WORKERS=4
EOF
    fi
    
    print_warning "⚠️  IMPORTANT: Edit the .env file with your actual database credentials!"
    echo "Edit with: nano $BACKEND_DIR/.env"
    echo "Press Enter after you've updated the DATABASE_URL..."
    read
fi

# Test configuration
print_status "Testing application configuration..."
if python -c "from app.core.config import settings; print('✅ Configuration loaded successfully')"; then
    print_status "✅ Application configuration is valid"
else
    print_error "❌ Application configuration failed. Check your .env file."
    exit 1
fi

# Create systemd service
print_status "Setting up systemd service..."
sudo cp lichen-health.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME

# Setup Nginx
print_status "Configuring Nginx..."
sudo cp nginx-simple.conf /etc/nginx/sites-available/$NGINX_SITE

# Get EC2 public IP for nginx config
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
if [[ -n "$EC2_IP" ]]; then
    print_status "Detected EC2 public IP: $EC2_IP"
    sudo sed -i "s/your-domain.com/$EC2_IP/g" /etc/nginx/sites-available/$NGINX_SITE
fi

# Enable Nginx site
sudo ln -sf /etc/nginx/sites-available/$NGINX_SITE /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
print_status "Testing Nginx configuration..."
if sudo nginx -t; then
    print_status "✅ Nginx configuration is valid"
else
    print_error "❌ Nginx configuration failed"
    exit 1
fi

# Set proper permissions
print_status "Setting proper permissions..."
sudo chown -R www-data:www-data $BACKEND_DIR
sudo chmod +x $BACKEND_DIR/venv/bin/gunicorn

# Start services
print_status "Starting services..."
sudo systemctl restart $SERVICE_NAME
sudo systemctl restart nginx

# Wait for services to start
print_status "Waiting for services to start..."
sleep 10

# Check service status
print_status "Checking service status..."
if sudo systemctl is-active --quiet $SERVICE_NAME; then
    print_status "✅ LichenHealth Backend service is running"
else
    print_error "❌ LichenHealth Backend service failed to start"
    echo "Check logs with: sudo journalctl -u $SERVICE_NAME -n 20"
    sudo systemctl status $SERVICE_NAME
fi

if sudo systemctl is-active --quiet nginx; then
    print_status "✅ Nginx is running"
else
    print_error "❌ Nginx failed to start"
    sudo systemctl status nginx
fi

# Test API endpoints
print_status "Testing API endpoints..."
sleep 5

# Test health endpoint
if curl -f -s http://localhost/health > /dev/null; then
    print_status "✅ Health endpoint is working"
    HEALTH_RESPONSE=$(curl -s http://localhost/health | python3 -m json.tool)
    echo "$HEALTH_RESPONSE"
else
    print_warning "⚠️  Health endpoint test failed"
    echo "Check logs: sudo journalctl -u $SERVICE_NAME -f"
fi

# Show final status
echo
echo "🎉 Deployment Complete!"
echo "================================"
echo "Your LichenHealth Backend is running at:"
echo "  Public URL: http://$EC2_IP"
echo "  Health Check: http://$EC2_IP/health"
echo "  API Docs: http://$EC2_IP/docs"
echo
echo "API Endpoints:"
echo "  Heart Rate: http://$EC2_IP/api/v1/heart-rate/"
echo "  Steps: http://$EC2_IP/api/v1/steps/"
echo "  Sleep: http://$EC2_IP/api/v1/sleep/"
echo
echo "Useful Commands:"
echo "  Check service: sudo systemctl status $SERVICE_NAME"
echo "  View logs: sudo journalctl -u $SERVICE_NAME -f"
echo "  Restart: sudo systemctl restart $SERVICE_NAME"
echo "  Nginx logs: sudo tail -f /var/log/nginx/lichen-health_*.log"
echo
echo "Next Steps:"
echo "1. Update your mobile app to use: http://$EC2_IP"
echo "2. Set up your database tables using the SQL schemas"
echo "3. Test your API endpoints"
echo "4. Consider setting up SSL with Let's Encrypt for HTTPS"
