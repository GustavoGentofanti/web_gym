import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Exercise


DATA_FILE = Path(__file__).with_name("exercises_seed.json")


def seed_exercises(db: Session) -> int:
    with DATA_FILE.open(encoding="utf-8") as file:
        exercises = json.load(file)

    created = 0
    for item in exercises:
        exists = db.query(Exercise).filter(
            Exercise.user_id.is_(None),
            Exercise.name == item["name"],
        ).first()
        if exists:
            continue
        db.add(Exercise(**item, user_id=None))
        created += 1

    if created:
        db.commit()
    return created
