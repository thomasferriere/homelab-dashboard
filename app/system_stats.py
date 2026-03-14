import random
import time

import psutil


# Shared shape for system metrics.
def _build_stats_payload(cpu: float, ram: float, disk: float, uptime_seconds: int) -> dict:
    return {
        "cpu_percent": round(cpu, 1),
        "ram_percent": round(ram, 1),
        "disk_percent": round(disk, 1),
        "uptime_seconds": int(uptime_seconds),
    }


def get_system_stats() -> dict:
    """Read real stats from the host system."""
    cpu = psutil.cpu_percent(interval=0.2)
    ram = psutil.virtual_memory().percent
    disk = psutil.disk_usage("/").percent
    uptime_seconds = int(time.time() - psutil.boot_time())
    return _build_stats_payload(cpu=cpu, ram=ram, disk=disk, uptime_seconds=uptime_seconds)


def get_demo_stats() -> dict:
    """Return plausible fake stats for public demo mode."""
    cpu = random.uniform(12, 78)
    ram = random.uniform(28, 85)
    disk = random.uniform(35, 90)
    uptime_seconds = random.randint(6 * 3600, 21 * 24 * 3600)
    return _build_stats_payload(cpu=cpu, ram=ram, disk=disk, uptime_seconds=uptime_seconds)


def get_homelab_status() -> dict:
    """Return a simple baseline status for homelab equipment."""
    second = int(time.time())
    presence_detected = second % 2 == 0

    return {
        "lights": [
            {"name": "Salon", "state": "on"},
            {"name": "Couloir", "state": "off"},
            {"name": "Bureau", "state": "on"},
        ],
        "devices": [
            {"name": "Apple TV", "state": "online"},
            {"name": "Routeur", "state": "online"},
            {"name": "Switch", "state": "online"},
        ],
        "sensors": [
            {"name": "Presence", "state": "detected" if presence_detected else "clear"},
            {"name": "Fumee", "state": "clear"},
            {"name": "Eau", "state": "clear"},
        ],
        "cameras": [
            {"name": "Entree", "state": "recording"},
            {"name": "Garage", "state": "recording"},
            {"name": "Jardin", "state": "recording"},
        ],
        "updated_at": int(time.time()),
    }


def get_homelab_demo_status() -> dict:
    """Return fake equipment states for demo mode."""
    return {
        "lights": [
            {"name": "Salon", "state": random.choice(["on", "off"])},
            {"name": "Couloir", "state": random.choice(["on", "off"])},
            {"name": "Bureau", "state": random.choice(["on", "off"])},
        ],
        "devices": [
            {"name": "Apple TV", "state": random.choice(["online", "offline"])},
            {"name": "Routeur", "state": random.choice(["online", "offline"])},
            {"name": "Switch", "state": random.choice(["online", "offline"])},
        ],
        "sensors": [
            {"name": "Presence", "state": random.choice(["detected", "clear"])},
            {"name": "Fumee", "state": random.choice(["clear", "alert"])},
            {"name": "Eau", "state": random.choice(["clear", "alert"])},
        ],
        "cameras": [
            {"name": "Entree", "state": random.choice(["recording", "offline"])},
            {"name": "Garage", "state": random.choice(["recording", "offline"])},
            {"name": "Jardin", "state": random.choice(["recording", "offline"])},
        ],
        "updated_at": int(time.time()),
    }
