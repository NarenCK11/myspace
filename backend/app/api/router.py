"""Top-level API router."""

from fastapi import APIRouter

from app.api.routes import (
    activities,
    auth,
    calendar,
    dashboard,
    food_labels,
    google,
    meals,
    notes,
    nutrition,
    reminders,
    tags,
    tasks,
    weights,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(tasks.router)
api_router.include_router(reminders.router)
api_router.include_router(notes.router)
api_router.include_router(activities.router)
api_router.include_router(tags.router)
api_router.include_router(calendar.router)
api_router.include_router(google.router)
api_router.include_router(meals.router)
api_router.include_router(food_labels.router)
api_router.include_router(weights.router)
api_router.include_router(nutrition.router)
