import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Exercise, Routine, RoutineExercise, SyncQueue, User, WorkoutLog, WorkoutSession
from app.schemas import SyncRequest, SyncResponse
from app.security import get_current_user

router = APIRouter()


def apply_entry(entry, user_id, db):
    payload = entry.payload
    entity = entry.entity
    operation = entry.operation
    model_map = {
        "exercise": Exercise,
        "routine": Routine,
        "workout_session": WorkoutSession,
        "workout_log": WorkoutLog,
    }
    model = model_map.get(entity)
    if not model or not payload.get("id"):
        return False

    record = db.query(model).filter(model.id == payload["id"], model.user_id == user_id).first()
    if operation == "delete":
        if record:
            db.delete(record)
        return True
    if operation == "update" and not record:
        return False
    if operation == "create" and record:
        return True
    if record is None:
        record = model(id=payload["id"], user_id=user_id)
        db.add(record)

    allowed = {
        "exercise": ("name", "muscle_group", "equipment", "media_url", "is_custom"),
        "routine": ("name",),
        "workout_session": ("routine_id", "start_time", "end_time", "total_volume", "duration_minutes", "status"),
        "workout_log": ("session_id", "exercise_id", "set_type", "weight_kg", "reps", "rir_rpe", "is_completed", "order_index"),
    }
    for field in allowed[entity]:
        if field in payload:
            setattr(record, field, payload[field])

    if entity == "routine" and operation == "create":
        for index, item in enumerate(payload.get("exercises", [])):
            db.add(RoutineExercise(
                id=item.get("id"),
                routine_id=record.id,
                exercise_id=item["exercise_id"],
                warmup_sets=item.get("warmup_sets", 0),
                prep_sets=item.get("prep_sets", 0),
                target_sets=item["target_sets"],
                target_reps_min=item["target_reps_min"],
                target_reps_max=item["target_reps_max"],
                rest_seconds=item["rest_seconds"],
                order_index=item.get("order_index", index),
            ))
    return True


@router.post("", response_model=SyncResponse)
def sync_data(
    payload: SyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.entries:
        return SyncResponse(synced=0, queued=0, skipped=0)

    synced = 0
    queued = 0
    skipped = 0

    for entry in payload.entries:
        item = db.query(SyncQueue).filter(SyncQueue.id == entry.id, SyncQueue.user_id == current_user.id).first()
        if item:
            skipped += 1
            continue

        if apply_entry(entry, current_user.id, db):
            synced += 1
            continue

        sync_entry = SyncQueue(
            user_id=current_user.id,
            entity=entry.entity,
            operation=entry.operation,
            payload=json.dumps(entry.payload),
            created_at=entry.created_at or datetime.utcnow(),
            attempts=entry.attempts,
            status=entry.status,
        )
        db.add(sync_entry)
        queued += 1

    db.commit()
    return SyncResponse(synced=synced, queued=queued, skipped=skipped)
