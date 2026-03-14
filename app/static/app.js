const REFRESH_INTERVAL_MS = 5000;

let currentMode = "real";
let timerId = null;

const cpuValue = document.getElementById("cpu-value");
const ramValue = document.getElementById("ram-value");
const diskValue = document.getElementById("disk-value");
const uptimeValue = document.getElementById("uptime-value");
const modeIndicator = document.getElementById("mode-indicator");
const toggleButton = document.getElementById("toggle-mode-btn");
const errorMessage = document.getElementById("error-message");

function formatUptime(totalSeconds) {
  const seconds = Number(totalSeconds);
  if (Number.isNaN(seconds) || seconds < 0) return "--";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${days}j ${hours}h ${minutes}m`;
}

function updateModeUI() {
  if (currentMode === "real") {
    modeIndicator.textContent = "Mode réel";
    toggleButton.textContent = "Passer en mode démo";
  } else {
    modeIndicator.textContent = "Mode démo";
    toggleButton.textContent = "Passer en mode réel";
  }
}

async function fetchStats() {
  const endpoint = currentMode === "real" ? "/api/stats" : "/api/demo";

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    cpuValue.textContent = `${data.cpu_percent} %`;
    ramValue.textContent = `${data.ram_percent} %`;
    diskValue.textContent = `${data.disk_percent} %`;
    uptimeValue.textContent = formatUptime(data.uptime_seconds);
    errorMessage.textContent = "";
  } catch (error) {
    errorMessage.textContent = `Erreur de chargement des statistiques (${error.message}).`;
  }
}

function restartAutoRefresh() {
  if (timerId) {
    clearInterval(timerId);
  }

  timerId = setInterval(fetchStats, REFRESH_INTERVAL_MS);
}

toggleButton.addEventListener("click", () => {
  currentMode = currentMode === "real" ? "demo" : "real";
  updateModeUI();
  fetchStats();
  restartAutoRefresh();
});

updateModeUI();
fetchStats();
restartAutoRefresh();
