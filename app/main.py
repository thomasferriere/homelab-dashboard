from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.system_stats import (
    get_demo_stats,
    get_homelab_demo_status,
    get_homelab_status,
    get_system_stats,
)

app = FastAPI(title="Homelab Dashboard")

app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/")
def read_dashboard() -> FileResponse:
    """Serve the single dashboard page."""
    return FileResponse("app/static/index.html")


@app.get("/api/stats")
def read_real_stats() -> dict:
    """Return real stats from the current machine."""
    try:
        return get_system_stats()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to read system stats: {exc}")


@app.get("/api/demo")
def read_demo_stats() -> dict:
    """Return fake values for the public demo mode."""
    try:
        return get_demo_stats()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to build demo stats: {exc}")


@app.get("/api/homelab")
def read_real_homelab() -> dict:
    """Return simple baseline status for homelab equipment."""
    try:
        return get_homelab_status()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to read homelab status: {exc}")


@app.get("/api/homelab-demo")
def read_demo_homelab() -> dict:
    """Return fake homelab status for public demo mode."""
    try:
        return get_homelab_demo_status()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to build demo homelab status: {exc}")
