from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, WorkoutLog, WorkoutSession
from app.schemas import WorkoutLogCreate, WorkoutLogOut, WorkoutSessionCreate, WorkoutSessionOut
from app.security import get_current_user

router = APIRouter()


@router.post("", response_model=WorkoutSessionOut, status_code=status.HTTP_201_CREATED)
def create_workout_session(
    payload: WorkoutSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = WorkoutSession(
        id=payload.id or None,
        user_id=current_user.id,
        routine_id=payload.routine_id,
        start_time=payload.start_time or datetime.utcnow(),
        end_time=payload.end_time,
        total_volume=payload.total_volume,
        duration_minutes=payload.duration_minutes,
        status=payload.status,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("", response_model=list[WorkoutSessionOut])
def list_workout_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(WorkoutSession).filter(WorkoutSession.user_id == current_user.id).order_by(WorkoutSession.start_time.desc()).all()


@router.get("/{session_id}", response_model=WorkoutSessionOut)
def get_workout_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(WorkoutSession).filter(WorkoutSession.id == session_id, WorkoutSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de treino não encontrada.")
    return session


@router.put("/{session_id}", response_model=WorkoutSessionOut)
def update_workout_session(
    session_id: str,
    payload: WorkoutSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(WorkoutSession).filter(WorkoutSession.id == session_id, WorkoutSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de treino não encontrada.")

    session.routine_id = payload.routine_id
    session.start_time = payload.start_time or session.start_time
    session.end_time = payload.end_time
    session.total_volume = payload.total_volume
    session.duration_minutes = payload.duration_minutes
    session.status = payload.status
    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(WorkoutSession).filter(
        WorkoutSession.id == session_id,
        WorkoutSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de treino não encontrada.")
    db.delete(session)
    db.commit()


@router.get("/{session_id}/logs", response_model=list[WorkoutLogOut])
def list_logs(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(WorkoutSession).filter(WorkoutSession.id == session_id, WorkoutSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de treino não encontrada.")
    return db.query(WorkoutLog).filter(WorkoutLog.session_id == session_id, WorkoutLog.user_id == current_user.id).order_by(WorkoutLog.order_index.asc()).all()


@router.post("/{session_id}/logs", response_model=WorkoutLogOut, status_code=status.HTTP_201_CREATED)
def create_log(
    session_id: str,
    payload: WorkoutLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(WorkoutSession).filter(WorkoutSession.id == session_id, WorkoutSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de treino não encontrada.")

    log = WorkoutLog(
        id=payload.id or None,
        user_id=current_user.id,
        session_id=session_id,
        exercise_id=payload.exercise_id,
        set_type=payload.set_type,
        weight_kg=payload.weight_kg,
        reps=payload.reps,
        rir_rpe=payload.rir_rpe,
        is_completed=payload.is_completed,
        order_index=payload.order_index,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.put("/logs/{log_id}", response_model=WorkoutLogOut)
def update_log(
    log_id: str,
    payload: WorkoutLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = db.query(WorkoutLog).filter(WorkoutLog.id == log_id, WorkoutLog.user_id == current_user.id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Registro de série não encontrado.")

    log.set_type = payload.set_type
    log.weight_kg = payload.weight_kg
    log.reps = payload.reps
    log.rir_rpe = payload.rir_rpe
    log.is_completed = payload.is_completed
    log.order_index = payload.order_index
    db.commit()
    db.refresh(log)
    return log
