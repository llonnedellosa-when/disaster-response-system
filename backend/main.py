import os
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from database import engine
from models import Base
from routes import admin, reports, auth, chatbot_logs


load_dotenv()  # loads GEMINI_API_KEY from .env

app = FastAPI(
    title="DRES Polangui API",
    description="Disaster Response System — Polangui, Albay",
    version="1.0.0"
)

# ── CORS ── allows your frontend HTML files to call the API ───────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # replace * with your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Create DB tables ──────────────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ── Routers ───────────────────────────────────────────────────────────────────
# app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(reports.router)
app.include_router(auth.router)
app.include_router(chatbot_logs.router)


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR,
          "frontend"), html=True), name="frontend")
