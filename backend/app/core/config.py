import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Intelligent Behavior Support Dashboard"
    GOOGLE_CREDENTIALS_FILE: str = "service_account.json"
    SHEET_URL: str = "https://docs.google.com/spreadsheets/d/1pMQIowYYBIk-6owcJqCNK5mA8GtssEEr6XdUq8gC9Cs/edit" 
    DAILY_LOG_SHEET: str = "평가문장"
    GEMINI_API_KEY: str = ""
    GAS_WEB_APP_URL: str = ""
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
