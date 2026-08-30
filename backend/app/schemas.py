from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: str
    created_at: datetime
    updated_at: datetime


class ExerciseBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str = Field(..., min_length=2, max_length=200)
    muscle_group: str = Field(..., min_length=2, max_length=80)
    equipment: str = Field(..., min_length=2, max_length=80)
    media_url: Optional[str] = None
    is_custom: bool = False


class ExerciseCreate(ExerciseBase):
    id: Optional[str] = None


class ExerciseOut(ExerciseBase):
    id: str
    user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class RoutineExerciseBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    exercise_id: str
    warmup_sets: int = Field(default=0, ge=0, le=10)
    prep_sets: int = Field(default=0, ge=0, le=10)
    target_sets: int = Field(..., ge=1, le=20)
    target_reps_min: int = Field(..., ge=1, le=50)
    target_reps_max: int = Field(..., ge=1, le=100)
    rest_seconds: int = Field(..., ge=0, le=600)
    order_index: int = Field(..., ge=0)


class RoutineExerciseCreate(RoutineExerciseBase):
    id: Optional[str] = None


class RoutineExerciseOut(RoutineExerciseBase):
    id: str
    routine_id: str
    created_at: datetime
    updated_at: datetime


class RoutineBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str = Field(..., min_length=2, max_length=200)


class RoutineCreate(RoutineBase):
    id: Optional[str] = None
    exercises: List[RoutineExerciseCreate] = Field(default_factory=list)


class RoutineOut(RoutineBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime
    exercises: List[RoutineExerciseOut] = Field(default_factory=list)


class WorkoutSessionBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    routine_id: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    total_volume: float = 0.0
    duration_minutes: int = 0
    status: str = "in_progress"


class WorkoutSessionCreate(WorkoutSessionBase):
    id: Optional[str] = None


class WorkoutSessionOut(WorkoutSessionBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime


class WorkoutLogBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: str
    exercise_id: str
    set_type: str = Field(default="Trabalho", min_length=2, max_length=30)
    weight_kg: float = Field(..., ge=0)
    reps: int = Field(..., ge=0, le=100)
    rir_rpe: Optional[str] = None
    is_completed: bool = True
    order_index: int = Field(..., ge=0)


class WorkoutLogCreate(WorkoutLogBase):
    id: Optional[str] = None


class WorkoutLogOut(WorkoutLogBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime


class SyncQueuePayload(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    entity: str
    operation: str
    payload: dict
    created_at: datetime
    attempts: int = 0
    status: str = "pending"


class SyncRequest(BaseModel):
    entries: List[SyncQueuePayload]


class SyncResponse(BaseModel):
    synced: int
    queued: int
    skipped: int
