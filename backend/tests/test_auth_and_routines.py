from fastapi import status


def test_register_and_login(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "João", "email": "joao@email.com", "password": "123456"},
    )
    assert response.status_code == status.HTTP_201_CREATED
    token = response.json()["access_token"]
    assert token

    login = client.post(
        "/api/auth/login",
        json={"email": "joao@email.com", "password": "123456"},
    )
    assert login.status_code == status.HTTP_200_OK
    assert login.json()["token_type"] == "bearer"


def test_frontend_origin_is_allowed_for_browser_requests(client):
    response = client.options(
        "/api/auth/register",
        headers={
            "Origin": "http://localhost:8080",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.headers.get("access-control-allow-origin") == "http://localhost:8080"


def test_create_routine_requires_auth(client):
    response = client.post(
        "/api/routines",
        json={"name": "Treino A", "exercises": []},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_create_routine_for_authenticated_user(client):
    register = client.post(
        "/api/auth/register",
        json={"name": "Maria", "email": "maria@email.com", "password": "123456"},
    )
    token = register.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    exercise = client.post(
        "/api/exercises",
        json={
            "name": "Supino Reto",
            "muscle_group": "Peito",
            "equipment": "Barra",
            "media_url": "",
            "is_custom": True,
        },
        headers=headers,
    )
    assert exercise.status_code == status.HTTP_201_CREATED
    exercise_id = exercise.json()["id"]

    response = client.post(
        "/api/routines",
        json={
            "name": "Peito + Triceps",
            "exercises": [
                {
                    "exercise_id": exercise_id,
                    "warmup_sets": 1,
                    "prep_sets": 0,
                    "target_sets": 4,
                    "target_reps_min": 8,
                    "target_reps_max": 10,
                    "rest_seconds": 90,
                    "order_index": 0,
                }
            ],
        },
        headers=headers,
    )
    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["name"] == "Peito + Triceps"
    assert len(response.json()["exercises"]) == 1
    assert response.json()["exercises"][0]["exercise_id"] == exercise_id
    assert response.json()["exercises"][0]["warmup_sets"] == 1
    assert response.json()["exercises"][0]["prep_sets"] == 0


def test_routine_rejects_exercise_from_another_user(client):
    owner = client.post(
        "/api/auth/register",
        json={"name": "Owner", "email": "owner@email.com", "password": "123456"},
    )
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}
    exercise = client.post(
        "/api/exercises",
        json={"name": "Leg Press", "muscle_group": "Pernas", "equipment": "Máquina", "is_custom": True},
        headers=owner_headers,
    )

    other = client.post(
        "/api/auth/register",
        json={"name": "Other", "email": "other@email.com", "password": "123456"},
    )
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}
    response = client.post(
        "/api/routines",
        json={"name": "Ficha inválida", "exercises": [{
            "exercise_id": exercise.json()["id"],
            "target_sets": 3,
            "target_reps_min": 8,
            "target_reps_max": 12,
            "rest_seconds": 90,
            "order_index": 0,
        }]},
        headers=other_headers,
    )
    assert response.status_code == 400


def test_sync_applies_queued_exercise(client):
    register = client.post(
        "/api/auth/register",
        json={"name": "Sync User", "email": "sync@email.com", "password": "123456"},
    )
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    response = client.post(
        "/api/sync",
        json={"entries": [{
            "id": "sync-exercise-1",
            "entity": "exercise",
            "operation": "create",
            "payload": {
                "id": "sync-exercise-1",
                "name": "Remada Offline",
                "muscle_group": "Costas",
                "equipment": "Cabo",
                "is_custom": True,
            },
            "created_at": "2026-08-29T23:00:00Z",
            "attempts": 0,
            "status": "pending",
        }]},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["synced"] == 1
    exercises = client.get("/api/exercises", headers=headers).json()
    assert any(exercise["id"] == "sync-exercise-1" for exercise in exercises)


def test_global_exercise_catalog_is_available(client):
    register = client.post(
        "/api/auth/register",
        json={"name": "Catalog User", "email": "catalog@email.com", "password": "123456"},
    )
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    exercises = client.get("/api/exercises", headers=headers).json()
    names = {exercise["name"] for exercise in exercises}
    assert len(exercises) >= 98
    assert "Supino Reto" in names
    assert "Agachamento Livre" in names
    assert "Tríceps Corda" in names


def test_workout_session_can_be_deleted(client):
    register = client.post(
        "/api/auth/register",
        json={"name": "Delete User", "email": "delete@email.com", "password": "123456"},
    )
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    session = client.post("/api/workouts", json={"status": "completed", "total_volume": 100}, headers=headers)
    assert session.status_code == 201
    deleted = client.delete(f"/api/workouts/{session.json()['id']}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/workouts/{session.json()['id']}", headers=headers).status_code == 404
