from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.database import SessionLocal
from sqlalchemy import inspect, text
from app.routes import auth, exercises, routines, sync, workouts
from app.seed_exercises import seed_exercises


app = FastAPI(
    title="Meu Treino API",
    description="API para gerenciamento de treinos, exercícios, histórico e sincronização offline.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin).rstrip("/") for origin in settings.CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_db_and_tables():
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "sqlite":
        columns = {column["name"] for column in inspect(engine).get_columns("routine_exercises")}
        with engine.begin() as connection:
            if "warmup_sets" not in columns:
                connection.execute(text("ALTER TABLE routine_exercises ADD COLUMN warmup_sets INTEGER NOT NULL DEFAULT 0"))
            if "prep_sets" not in columns:
                connection.execute(text("ALTER TABLE routine_exercises ADD COLUMN prep_sets INTEGER NOT NULL DEFAULT 0"))
    db = SessionLocal()
    try:
        seed_exercises(db)
    finally:
        db.close()


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(exercises.router, prefix="/api/exercises", tags=["exercises"])
app.include_router(routines.router, prefix="/api/routines", tags=["routines"])
app.include_router(workouts.router, prefix="/api/workouts", tags=["workouts"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])


@app.get("/api/health")
def healthcheck():
    return {"status": "ok", "environment": settings.environment}
