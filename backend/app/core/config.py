from pydantic_settings import BaseSettings
from typing import Optional, List
import os


class Settings(BaseSettings):
    # App Configuration
    app_name: str = "LichenHealth Backend"
    version: str = "1.0.0"
    debug: bool = False
    environment: str = "development"
    
    # Database
    database_url: str  # This automatically gets the value from the .env file with uppercase
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    # Security
    secret_key: str = "dev-secret-key-change-in-production"
    allowed_origins: List[str] = ["http://localhost:3000", "http://localhost:8080"]
    mobile_app_origins: str = "*"  # For mobile app CORS
    
    # Production Settings
    workers: int = 4
    max_connections: int = 100
    timeout: int = 30
    keepalive: int = 2
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "json"
    
    # Health Check
    health_check_interval: int = 30
    
    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"
    
    @property
    def cors_origins(self) -> List[str]:
        """Get CORS origins including mobile app origins"""
        origins = self.allowed_origins.copy()
        if self.mobile_app_origins and self.mobile_app_origins != "*":
            origins.extend(self.mobile_app_origins.split(","))
        return origins
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()