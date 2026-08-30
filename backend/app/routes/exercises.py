from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Exercise, User
from app.schemas import ExerciseCreate, ExerciseOut
from app.security import get_current_user

router = APIRouter()


@router.get("", response_model=list[ExerciseOut])
def list_exercises(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    q: str | None = Query(default=None),
):
    query = db.query(Exercise).filter((Exercise.user_id == current_user.id) | (Exercise.user_id.is_(None)))
    if q:
        query = query.filter(Exercise.name.ilike(f"%{q}%"))
    return query.order_by(Exercise.name.asc()).all()


@router.post("", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
def create_exercise(
    payload: ExerciseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Exercise).filter(Exercise.user_id == current_user.id, Exercise.name.ilike(payload.name.strip())).first()
    if existing:
        raise HTTPException(status_code=400, detail="Exercício já existe para este usuário.")

    exercise = Exercise(
        id=payload.id or None,
        user_id=current_user.id,
        name=payload.name.strip(),
        muscle_group=payload.muscle_group.strip(),
        equipment=payload.equipment.strip(),
        media_url=payload.media_url,
        is_custom=payload.is_custom or True,
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


@router.get("/{exercise_id}", response_model=ExerciseOut)
def get_exercise(
    exercise_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exercise = (
        db.query(Exercise)
        .filter(Exercise.id == exercise_id)
        .filter((Exercise.user_id == current_user.id) | (Exercise.user_id.is_(None)))
        .first()
    )
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercício não encontrado.")
    return exercise


@router.put("/{exercise_id}", response_model=ExerciseOut)
def update_exercise(
    exercise_id: str,
    payload: ExerciseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exercise = (
        db.query(Exercise)
        .filter(Exercise.id == exercise_id)
        .filter(Exercise.user_id == current_user.id)
        .first()
    )
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercício não encontrado.")

    exercise.name = payload.name.strip()
    exercise.muscle_group = payload.muscle_group.strip()
    exercise.equipment = payload.equipment.strip()
    exercise.media_url = payload.media_url
    exercise.is_custom = payload.is_custom or True
    db.commit()
    db.refresh(exercise)
    return exercise


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(
    exercise_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exercise = (
        db.query(Exercise)
        .filter(Exercise.id == exercise_id)
        .filter(Exercise.user_id == current_user.id)
        .first()
    )
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercício não encontrado.")
    db.delete(exercise)
    db.commit()
