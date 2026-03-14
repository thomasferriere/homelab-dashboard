import random
import time

import psutil


# Keep this as a tiny helper so JSON shape is shared by real/demo endpoints.
def _build_payload(cpu: float, ram: float, disk: float, uptime_seconds: int) -> dict:
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
    return _build_payload(cpu=cpu, ram=ram, disk=disk, uptime_seconds=uptime_seconds)


def get_demo_stats() -> dict:
    """Return plausible fake stats for a public demo."""
    cpu = random.uniform(12, 78)
    ram = random.uniform(28, 85)
    disk = random.uniform(35, 90)
    uptime_seconds = random.randint(6 * 3600, 21 * 24 * 3600)
    return _build_payload(cpu=cpu, ram=ram, disk=disk, uptime_seconds=uptime_seconds)
