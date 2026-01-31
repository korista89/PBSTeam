import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Intelligent Behavior Support Dashboard"
    GOOGLE_CREDENTIALS_FILE: str = "service_account.json"
    SHEET_URL: str = "" 
    
    class Config:
        env_file = ".env"

settings = Settings()
