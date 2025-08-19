from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    app_name: str = "LichenHealth Backend"
    version: str = "1.0.0"
    debug: bool = False
    
    # Database
    database_url: str #This automatically gets the value from the .env file with uppercase
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    class Config:
        env_file = ".env"


settings = Settings()