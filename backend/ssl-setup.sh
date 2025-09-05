#!/bin/bash

# SSL/TLS Setup Script for LichenHealth Backend
# This script helps set up HTTPS with Let's Encrypt or custom certificates

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_header() {
    echo -e "${BLUE}[SSL SETUP]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as ubuntu user with sudo privileges."
   exit 1
fi

# Check if nginx is installed and running
if ! systemctl is-active --quiet nginx; then
    print_error "Nginx is not running. Please ensure nginx is installed and running first."
    exit 1
fi

print_header "🔒 SSL/TLS Setup for LichenHealth Backend"
echo
echo "This script will help you set up HTTPS for your LichenHealth backend."
echo "Choose one of the following options:"
echo
echo "1. Let's Encrypt (Free SSL certificate - Recommended)"
echo "2. Custom SSL certificate (You provide the certificate files)"
echo "3. Self-signed certificate (For testing only)"
echo "4. Exit"
echo

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        print_header "Setting up Let's Encrypt SSL"
        
        # Prompt for domain name
        echo
        read -p "Enter your domain name (e.g., api.yourdomain.com): " domain
        read -p "Enter additional domains (comma-separated, or press enter to skip): " additional_domains
        read -p "Enter your email address for Let's Encrypt notifications: " email
        
        if [[ -z "$domain" || -z "$email" ]]; then
            print_error "Domain name and email are required for Let's Encrypt"
            exit 1
        fi
        
        # Install certbot
        print_status "Installing Certbot..."
        sudo apt update
        sudo apt install -y certbot python3-certbot-nginx
        
        # Prepare domain list
        domain_args="-d $domain"
        if [[ ! -z "$additional_domains" ]]; then
            IFS=',' read -ra ADDR <<< "$additional_domains"
            for i in "${ADDR[@]}"; do
                domain_args="$domain_args -d $(echo $i | xargs)"
            done
        fi
        
        # Update nginx configuration with domain name
        print_status "Updating nginx configuration with domain name..."
        sudo sed -i "s/your-domain\.com/$domain/g" /etc/nginx/sites-available/lichen-health
        sudo sed -i "s/www\.your-domain\.com/www.$domain/g" /etc/nginx/sites-available/lichen-health
        
        # Test nginx configuration
        if sudo nginx -t; then
            sudo systemctl reload nginx
            print_status "Nginx configuration updated successfully"
        else
            print_error "Nginx configuration test failed"
            exit 1
        fi
        
        # Obtain SSL certificate
        print_status "Obtaining SSL certificate from Let's Encrypt..."
        sudo certbot --nginx $domain_args --email $email --agree-tos --non-interactive --redirect
        
        if [[ $? -eq 0 ]]; then
            print_status "✅ SSL certificate obtained successfully!"
            
            # Test auto-renewal
            print_status "Testing certificate auto-renewal..."
            sudo certbot renew --dry-run
            
            if [[ $? -eq 0 ]]; then
                print_status "✅ Auto-renewal test passed"
            else
                print_warning "⚠️  Auto-renewal test failed. Please check certbot configuration."
            fi
            
            # Show certificate info
            echo
            print_header "Certificate Information:"
            sudo certbot certificates
            
        else
            print_error "❌ Failed to obtain SSL certificate"
            exit 1
        fi
        ;;
        
    2)
        print_header "Setting up Custom SSL Certificate"
        
        read -p "Enter your domain name: " domain
        read -p "Enter path to your SSL certificate file (.crt or .pem): " cert_file
        read -p "Enter path to your private key file (.key): " key_file
        read -p "Enter path to certificate chain file (optional, press enter to skip): " chain_file
        
        if [[ -z "$domain" || -z "$cert_file" || -z "$key_file" ]]; then
            print_error "Domain name, certificate file, and private key file are required"
            exit 1
        fi
        
        # Verify certificate files exist
        if [[ ! -f "$cert_file" ]]; then
            print_error "Certificate file not found: $cert_file"
            exit 1
        fi
        
        if [[ ! -f "$key_file" ]]; then
            print_error "Private key file not found: $key_file"
            exit 1
        fi
        
        # Create SSL directory
        print_status "Creating SSL directory..."
        sudo mkdir -p /etc/ssl/lichen-health
        
        # Copy certificate files
        print_status "Copying certificate files..."
        sudo cp "$cert_file" /etc/ssl/lichen-health/certificate.crt
        sudo cp "$key_file" /etc/ssl/lichen-health/private.key
        
        if [[ ! -z "$chain_file" && -f "$chain_file" ]]; then
            sudo cp "$chain_file" /etc/ssl/lichen-health/chain.crt
        fi
        
        # Set proper permissions
        sudo chmod 644 /etc/ssl/lichen-health/certificate.crt
        sudo chmod 600 /etc/ssl/lichen-health/private.key
        sudo chown root:root /etc/ssl/lichen-health/*
        
        # Update nginx configuration
        print_status "Updating nginx configuration..."
        
        # Backup original configuration
        sudo cp /etc/nginx/sites-available/lichen-health /etc/nginx/sites-available/lichen-health.backup
        
        # Enable HTTPS server block and update paths
        sudo sed -i "s/your-domain\.com/$domain/g" /etc/nginx/sites-available/lichen-health
        sudo sed -i "s|# ssl_certificate /path/to/ssl/certificate.crt;|ssl_certificate /etc/ssl/lichen-health/certificate.crt;|" /etc/nginx/sites-available/lichen-health
        sudo sed -i "s|# ssl_certificate_key /path/to/ssl/private.key;|ssl_certificate_key /etc/ssl/lichen-health/private.key;|" /etc/nginx/sites-available/lichen-health
        
        # Uncomment HTTPS server block (this is complex, so we'll provide manual instructions)
        print_warning "Please manually uncomment the HTTPS server block in /etc/nginx/sites-available/lichen-health"
        print_status "Opening nginx configuration file for editing..."
        sudo nano /etc/nginx/sites-available/lichen-health
        
        # Test nginx configuration
        if sudo nginx -t; then
            sudo systemctl reload nginx
            print_status "✅ SSL certificate configured successfully!"
        else
            print_error "❌ Nginx configuration test failed"
            print_status "Restoring backup configuration..."
            sudo cp /etc/nginx/sites-available/lichen-health.backup /etc/nginx/sites-available/lichen-health
            sudo systemctl reload nginx
            exit 1
        fi
        ;;
        
    3)
        print_header "Setting up Self-Signed Certificate (Testing Only)"
        
        print_warning "⚠️  Self-signed certificates should only be used for testing!"
        print_warning "⚠️  Browsers will show security warnings for self-signed certificates."
        
        read -p "Enter your domain name or IP address: " domain
        
        if [[ -z "$domain" ]]; then
            print_error "Domain name or IP address is required"
            exit 1
        fi
        
        # Create SSL directory
        sudo mkdir -p /etc/ssl/lichen-health
        
        # Generate self-signed certificate
        print_status "Generating self-signed certificate..."
        sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /etc/ssl/lichen-health/private.key \
            -out /etc/ssl/lichen-health/certificate.crt \
            -subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=$domain"
        
        # Set proper permissions
        sudo chmod 644 /etc/ssl/lichen-health/certificate.crt
        sudo chmod 600 /etc/ssl/lichen-health/private.key
        sudo chown root:root /etc/ssl/lichen-health/*
        
        # Update nginx configuration (similar to custom certificate)
        print_status "Updating nginx configuration..."
        sudo cp /etc/nginx/sites-available/lichen-health /etc/nginx/sites-available/lichen-health.backup
        
        sudo sed -i "s/your-domain\.com/$domain/g" /etc/nginx/sites-available/lichen-health
        
        print_warning "Please manually uncomment the HTTPS server block in /etc/nginx/sites-available/lichen-health"
        print_status "Opening nginx configuration file for editing..."
        sudo nano /etc/nginx/sites-available/lichen-health
        
        # Test nginx configuration
        if sudo nginx -t; then
            sudo systemctl reload nginx
            print_status "✅ Self-signed certificate configured successfully!"
            print_warning "Remember: This is for testing only. Use Let's Encrypt or a proper certificate for production."
        else
            print_error "❌ Nginx configuration test failed"
            sudo cp /etc/nginx/sites-available/lichen-health.backup /etc/nginx/sites-available/lichen-health
            sudo systemctl reload nginx
            exit 1
        fi
        ;;
        
    4)
        print_status "Exiting SSL setup"
        exit 0
        ;;
        
    *)
        print_error "Invalid choice. Please run the script again and choose 1-4."
        exit 1
        ;;
esac

# Final testing and information
echo
print_header "🎉 SSL Setup Complete!"
echo

# Test HTTPS connection
if [[ $choice -eq 1 || $choice -eq 2 || $choice -eq 3 ]]; then
    print_status "Testing HTTPS connection..."
    
    # Wait a moment for nginx to fully reload
    sleep 2
    
    if curl -f -s https://$domain/health > /dev/null 2>&1; then
        print_status "✅ HTTPS endpoint is working!"
        echo
        echo "🌐 Your API is now available at:"
        echo "  HTTPS: https://$domain"
        echo "  Health: https://$domain/health"
        echo "  Docs: https://$domain/docs"
        echo
    else
        print_warning "⚠️  HTTPS endpoint test failed. Please check:"
        echo "  1. DNS points to your server"
        echo "  2. Firewall allows port 443"
        echo "  3. Certificate is valid"
        echo "  4. Nginx configuration is correct"
    fi
    
    # Show certificate expiration (for Let's Encrypt and custom certs)
    if [[ $choice -eq 1 || $choice -eq 2 ]]; then
        echo "📅 Certificate expiration:"
        echo | openssl s_client -servername $domain -connect $domain:443 2>/dev/null | openssl x509 -noout -dates
    fi
    
    echo
    echo "🔧 Next steps:"
    echo "1. Update your mobile app to use HTTPS: https://$domain"
    echo "2. Test all API endpoints with HTTPS"
    echo "3. Monitor certificate expiration"
    
    if [[ $choice -eq 1 ]]; then
        echo "4. Let's Encrypt will auto-renew certificates"
    elif [[ $choice -eq 2 ]]; then
        echo "4. Set up certificate renewal process for your custom certificate"
    fi
fi

echo
print_status "SSL setup completed successfully! 🔒"
