from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Exercise, Routine, RoutineExercise, User
from app.schemas import RoutineCreate, RoutineOut
from app.security import get_current_user

router = APIRouter()


@router.get("", response_model=list[RoutineOut])
def list_routines(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    routines = (
        db.query(Routine)
        .options(selectinload(Routine.routine_exercises))
        .filter(Routine.user_id == current_user.id)
        .order_by(Routine.created_at.desc())
        .all()
    )
    return routines


@router.post("", response_model=RoutineOut, status_code=status.HTTP_201_CREATED)
def create_routine(
    payload: RoutineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exercise_ids = {item.exercise_id for item in payload.exercises}
    accessible_exercises = db.query(Exercise).filter(
        Exercise.id.in_(exercise_ids),
        (Exercise.user_id == current_user.id) | (Exercise.user_id.is_(None)),
    ).all() if exercise_ids else []
    if len(accessible_exercises) != len(exercise_ids):
        raise HTTPException(status_code=400, detail="A ficha contém exercício inválido.")

    routine = Routine(id=payload.id or None, user_id=current_user.id, name=payload.name.strip())
    db.add(routine)
    db.flush()

    for index, item in enumerate(payload.exercises):
        db.add(
            RoutineExercise(
                id=item.id or None,
                routine_id=routine.id,
                exercise_id=item.exercise_id,
                warmup_sets=item.warmup_sets,
                prep_sets=item.prep_sets,
                target_sets=item.target_sets,
                target_reps=item.target_reps or f"{item.target_reps_min}-{item.target_reps_max}",
                target_reps_min=item.target_reps_min,
                target_reps_max=item.target_reps_max,
                rest_seconds=item.rest_seconds,
                order_index=item.order_index if item.order_index is not None else index,
            )
        )

    db.commit()
    db.refresh(routine)
    routine.routine_exercises
    return routine


@router.get("/{routine_id}", response_model=RoutineOut)
def get_routine(
    routine_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    routine = db.query(Routine).filter(Routine.id == routine_id, Routine.user_id == current_user.id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Ficha não encontrada.")
    return routine


@router.put("/{routine_id}", response_model=RoutineOut)
def update_routine(
    routine_id: str,
    payload: RoutineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    routine = db.query(Routine).filter(Routine.id == routine_id, Routine.user_id == current_user.id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Ficha não encontrada.")

    routine.name = payload.name.strip()

    existing = db.query(RoutineExercise).filter(RoutineExercise.routine_id == routine.id).all()
    for item in existing:
        db.delete(item)

    for index, item in enumerate(payload.exercises):
        db.add(
            RoutineExercise(
                id=item.id or None,
                routine_id=routine.id,
                exercise_id=item.exercise_id,
                warmup_sets=item.warmup_sets,
                prep_sets=item.prep_sets,
                target_sets=item.target_sets,
                target_reps=item.target_reps or f"{item.target_reps_min}-{item.target_reps_max}",
                target_reps_min=item.target_reps_min,
                target_reps_max=item.target_reps_max,
                rest_seconds=item.rest_seconds,
                order_index=item.order_index if item.order_index is not None else index,
            )
        )

    db.commit()
    db.refresh(routine)
    return routine


@router.delete("/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_routine(
    routine_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    routine = db.query(Routine).filter(Routine.id == routine_id, Routine.user_id == current_user.id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Ficha não encontrada.")
    db.delete(routine)
    db.commit()
