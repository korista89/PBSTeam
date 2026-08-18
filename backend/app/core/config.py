import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Intelligent Behavior Support Dashboard"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", os.getenv("VERCEL_ENV", "production"))
    GOOGLE_CREDENTIALS_FILE: str = "service_account.json"
    SHEET_URL: str = "https://docs.google.com/spreadsheets/d/1pMQIowYYBIk-6owcJqCNK5mA8GtssEEr6XdUq8gC9Cs/edit" 
    DAILY_LOG_SHEET: str = "평가문장"
    GEMINI_API_KEY: str = ""
    GAS_WEB_APP_URL: str = ""
    LOCAL_LLM_URL: str = "http://localhost:1234/v1"
    LOCAL_LLM_MODEL: str = "gemma-4-E4B-it-GGUF"
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
