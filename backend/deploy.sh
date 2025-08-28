#!/bin/bash

# LichenHealth Backend Deployment Script
# Run this script on your EC2 instance to deploy the application

set -e  # Exit on any error

echo "🚀 Starting LichenHealth Backend Deployment..."

# Configuration
APP_DIR="/opt/lichen-health"
BACKEND_DIR="$APP_DIR/backend"
SERVICE_NAME="lichen-health"
NGINX_SITE="lichen-health"
DOMAIN="your-domain.com"  # Change this to your actual domain

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
   exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
print_status "Installing required packages..."
sudo apt install -y python3-pip python3-venv nginx postgresql-client git curl software-properties-common

# Create application directory
print_status "Creating application directory..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Clone or update repository
if [ -d "$BACKEND_DIR" ]; then
    print_status "Updating existing repository..."
    cd $BACKEND_DIR
    git pull origin main
else
    print_status "Cloning repository..."
    cd $APP_DIR
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

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from template..."
    cp env.template .env
    print_warning "Please edit .env file with your actual configuration values!"
    echo "Edit the .env file with your database URL and other settings:"
    echo "sudo nano $BACKEND_DIR/.env"
    read -p "Press Enter after you've configured the .env file..."
fi

# Create logs directory
print_status "Creating logs directory..."
mkdir -p logs
sudo chown -R www-data:www-data logs

# Test the application
print_status "Testing the application..."
python -c "from app.core.config import settings; print('✅ Configuration loaded successfully')"

# Configure systemd service
print_status "Configuring systemd service..."
sudo cp lichen-health.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME

# Configure Nginx
print_status "Configuring Nginx..."
sudo cp nginx.conf /etc/nginx/sites-available/$NGINX_SITE

# Update nginx config with actual domain
if [ "$DOMAIN" != "your-domain.com" ]; then
    sudo sed -i "s/your-domain.com/$DOMAIN/g" /etc/nginx/sites-available/$NGINX_SITE
fi

# Enable Nginx site
sudo ln -sf /etc/nginx/sites-available/$NGINX_SITE /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Set proper permissions
print_status "Setting proper permissions..."
sudo chown -R www-data:www-data $BACKEND_DIR
sudo chmod +x $BACKEND_DIR/venv/bin/gunicorn

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
else
    print_warning "⚠️  API health check failed. Check logs:"
    echo "sudo journalctl -u $SERVICE_NAME -f"
fi

# Setup SSL with Let's Encrypt (optional)
read -p "Do you want to set up SSL with Let's Encrypt? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Installing Certbot..."
    sudo apt install -y certbot python3-certbot-nginx
    
    print_status "Obtaining SSL certificate..."
    sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN
    
    print_status "Setting up automatic renewal..."
    sudo crontab -l | grep -q 'certbot renew' || (sudo crontab -l; echo "0 12 * * * /usr/bin/certbot renew --quiet") | sudo crontab -
fi

print_status "🎉 Deployment completed successfully!"
echo
echo "Your LichenHealth Backend is now running at:"
echo "  HTTP:  http://$DOMAIN"
echo "  HTTPS: https://$DOMAIN (if SSL was configured)"
echo
echo "Useful commands:"
echo "  Check service status: sudo systemctl status $SERVICE_NAME"
echo "  View logs:           sudo journalctl -u $SERVICE_NAME -f"
echo "  Restart service:     sudo systemctl restart $SERVICE_NAME"
echo "  Update app:          cd $BACKEND_DIR && git pull && sudo systemctl restart $SERVICE_NAME"
echo
echo "API Endpoints:"
echo "  Health Check: http://$DOMAIN/health"
echo "  API Docs:     http://$DOMAIN/docs (development only)"
echo "  Metrics:      http://$DOMAIN/metrics (internal only)"
