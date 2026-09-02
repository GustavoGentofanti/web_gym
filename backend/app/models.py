from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    routines = relationship("Routine", back_populates="user", cascade="all, delete-orphan")
    exercises = relationship("Exercise", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("WorkoutSession", back_populates="user", cascade="all, delete-orphan")
    workout_logs = relationship("WorkoutLog", back_populates="user", cascade="all, delete-orphan")


class Exercise(Base):
    __tablename__ = "exercises"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String(200), nullable=False)
    muscle_group = Column(String(80), nullable=False)
    equipment = Column(String(80), nullable=False)
    media_url = Column(Text, nullable=True)
    is_custom = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="exercises")
    routine_exercises = relationship("RoutineExercise", back_populates="exercise", cascade="all, delete-orphan")
    workout_logs = relationship("WorkoutLog", back_populates="exercise")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_exercise_name"),
    )


class Routine(Base):
    __tablename__ = "routines"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="routines")
    routine_exercises = relationship("RoutineExercise", back_populates="routine", cascade="all, delete-orphan")
    sessions = relationship("WorkoutSession", back_populates="routine")

    @property
    def exercises(self):
        return self.routine_exercises


class RoutineExercise(Base):
    __tablename__ = "routine_exercises"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    routine_id = Column(String, ForeignKey("routines.id"), nullable=False)
    exercise_id = Column(String, ForeignKey("exercises.id"), nullable=False)
    warmup_sets = Column(Integer, nullable=False, default=0)
    prep_sets = Column(Integer, nullable=False, default=0)
    target_sets = Column(Integer, nullable=False, default=3)
    target_reps = Column(String(30), nullable=True, default="8-12")
    target_reps_min = Column(Integer, nullable=False, default=8)
    target_reps_max = Column(Integer, nullable=False, default=12)
    rest_seconds = Column(Integer, nullable=False, default=90)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    routine = relationship("Routine", back_populates="routine_exercises")
    exercise = relationship("Exercise", back_populates="routine_exercises")


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    routine_id = Column(String, ForeignKey("routines.id"), nullable=True)
    start_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    end_time = Column(DateTime, nullable=True)
    total_volume = Column(Float, default=0.0, nullable=False)
    duration_minutes = Column(Integer, default=0, nullable=False)
    status = Column(String(30), default="in_progress", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="sessions")
    routine = relationship("Routine", back_populates="sessions")
    workout_logs = relationship("WorkoutLog", back_populates="session", cascade="all, delete-orphan")


class WorkoutLog(Base):
    __tablename__ = "workout_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    session_id = Column(String, ForeignKey("workout_sessions.id"), nullable=False)
    exercise_id = Column(String, ForeignKey("exercises.id"), nullable=False)
    set_type = Column(String(30), nullable=False, default="Trabalho")
    weight_kg = Column(Float, nullable=False)
    reps = Column(Integer, nullable=False)
    rir_rpe = Column(String(20), nullable=True)
    is_completed = Column(Boolean, default=False, nullable=False)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="workout_logs")
    session = relationship("WorkoutSession", back_populates="workout_logs")
    exercise = relationship("Exercise", back_populates="workout_logs")


class SyncQueue(Base):
    __tablename__ = "sync_queue"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    entity = Column(String(100), nullable=False)
    operation = Column(String(20), nullable=False)
    payload = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    status = Column(String(20), default="pending", nullable=False)
