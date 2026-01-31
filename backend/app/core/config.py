import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Intelligent Behavior Support Dashboard"
    GOOGLE_CREDENTIALS_FILE: str = "service_account.json"
    SHEET_URL: str = "https://docs.google.com/spreadsheets/d/1pMQIowYYBIk-6owcJqCNK5mA8GtssEEr6XdUq8gC9Cs/edit" 
    
    class Config:
        env_file = ".env"

settings = Settings()
