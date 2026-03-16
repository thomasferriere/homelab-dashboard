/**
 * Liquid Glass Smart Home Dashboard
 *
 * Tutorial architecture:
 * 1) Data layer: SMART_HOME_DATA (reactive state + persistence)
 * 2) UI layer: render* functions
 * 3) Controller layer: event binding (sliders, toggles, parallax, theme engine)
 */

const STORAGE_KEY = "liquid_glass_smart_home_v1";
const STATS_INTERVAL_MS = 5000;

const DEFAULT_DATA = {
  room: "Home",
  home: {
    backupTime: "04:32",
    backupStatus: "OK",
    alertsCount: 1,
    alertsNote: "Caméra garage hors ligne.",
    networkPing: 18,
    networkDown: 312,
    networkUp: 42,
    energyKwh: 12.4,
    energyCost: 3.2,
    energyPct: 64,
  },
  living: {
    presenceLast: "2 min",
    airCo2: 620,
    airHumidity: 48,
    airTemp: 22.5,
    mainLight: 72,
    tvTime: "1h 25m",
  },
  bath: {
    waterTemp: 37,
    waterHardness: 14,
    waterToday: 86,
    waterWeek: 420,
    waterTodayPct: 45,
    waterWeekPct: 62,
    ventThreshold: 60,
    morningReminder: "07:30",
    morningMinutes: 12,
    mirrorTempK: 4200,
  },
  kitchen: {
    smokeStatus: "OK",
    airCo2: 540,
    airPm: 8,
    airHumidity: 45,
    ovenKwh: 1.2,
    fridgeKwh: 0.6,
    binRecycle: "Jeu",
    binTri: "Mar",
    binOut: "Ce soir",
  },
  bed: {
    nightStart: "22:30",
    roomTemp: 21.1,
    roomTempSet: 20,
    airCo2: 520,
    airHumidity: 46,
    curtainPercent: 55,
    ambientLight: 30,
    ambientWarmth: 4200,
    alarmsCount: 2,
    alarm1: "06:30 · Réveil principal",
    alarm2: "07:00 · Backup",
    sleepDuration: "7h 42m",
    sleepAwakenings: 2,
    whiteNoiseLevel: 40,
  },
  play: {
    cpuTemp: 72,
    gpuTemp: 64,
    cpuTempPct: 72,
    gpuTempPct: 64,
    alerts: 0,
    ping: 18,
    jitter: 2,
    consoleFree: 190,
    consoleUsed: 310,
    consoleFreePct: 38,
    consoleUsedPct: 62,
    audioProfile: "game",
  },
  weather: {
    tempC: 23,
    humidity: 88,
    windKmh: 13,
    forecast: [
      { day: "Mon", temp: 22 },
      { day: "Tue", temp: 23 },
      { day: "Wed", temp: 24 },
      { day: "Thu", temp: 21 },
      { day: "Fri", temp: 22 },
    ],
  },
  music: {
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    isPlaying: false,
    progress: 52,
  },
  hvac: {
    temperatureC: 17,
  },
  led: {
    intensity: 52,
  },
  switches: {
    tvPower: true,
    appleTv: true,
    cinemaMode: false,
    wifi: true,
    alexa: false,
    sleep: false,
    away: false,
    security: false,
    homeMode: false,
    awayMode: false,
    readingLight: false,
    movieNight: false,
    readingScene: false,
    relaxScene: false,
    streamObs: false,
    streamLight: false,
    streamMulti: false,
    sunrise: false,
    towelWarmer: false,
    streamMode: false,
    nightMode: false,
    whiteNoise: false,
    bathSpa: false,
    bathClean: false,
    bathDry: false,
  },
  stats: {
    cpu: null,
    ram: null,
    disk: null,
    uptime: null,
    error: "",
  },
  glass: {
    blur: 25,
    opacity: 8,
    saturation: 160,
  },
};

const ROOM_THEMES = {
  Home: { hue: 210, sat: 40, light: 16 },
  "Living Room": { hue: 210, sat: 40, light: 16 },
  "Bath Room": { hue: 192, sat: 28, light: 18 },
  Kitchen: { hue: 34, sat: 46, light: 18 },
  "Bed Room": { hue: 255, sat: 38, light: 18 },
  "Play Room": { hue: 320, sat: 50, light: 18 },
};

const THEMES = [
  { name: "Frost", hue: 212, sat: 40, light: 16, blur: 28, opacity: 9, saturation: 170 },
  { name: "Smoke", hue: 220, sat: 22, light: 12, blur: 24, opacity: 12, saturation: 145 },
  { name: "Liquid", hue: 196, sat: 55, light: 18, blur: 32, opacity: 7, saturation: 190 },
];

let historyMuted = false;
let suppressPersist = false;
const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 80;

function deepMerge(target, source) {
  const out = { ...target };
  Object.keys(source || {}).forEach((key) => {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
      return;
    }
    out[key] = source[key];
  });
  return out;
}

function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATA;
    return deepMerge(DEFAULT_DATA, JSON.parse(raw));
  } catch {
    return DEFAULT_DATA;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function buildPersistedSnapshot() {
  return {
    room: SMART_HOME_DATA.room,
    home: { ...SMART_HOME_DATA.home },
    living: { ...SMART_HOME_DATA.living },
    bath: { ...SMART_HOME_DATA.bath },
    kitchen: { ...SMART_HOME_DATA.kitchen },
    bed: { ...SMART_HOME_DATA.bed },
    play: { ...SMART_HOME_DATA.play },
    music: { ...SMART_HOME_DATA.music },
    hvac: { ...SMART_HOME_DATA.hvac },
    led: { ...SMART_HOME_DATA.led },
    switches: { ...SMART_HOME_DATA.switches },
    glass: { ...SMART_HOME_DATA.glass },
  };
}

const schedulePersist = (() => {
  let timer = null;
  return () => {
    if (suppressPersist) return;
    clearTimeout(timer);
    timer = setTimeout(() => saveState(buildPersistedSnapshot()), 400);
  };
})();

function createReactiveState(obj, onChange) {
  const cache = new WeakMap();

  const wrap = (target) => {
    if (!target || typeof target !== "object") return target;
    if (cache.has(target)) return cache.get(target);

    const proxy = new Proxy(target, {
      get(t, p) {
        return wrap(Reflect.get(t, p));
      },
      set(t, p, v) {
        const ok = Reflect.set(t, p, v);
        onChange();
        return ok;
      },
      deleteProperty(t, p) {
        const ok = Reflect.deleteProperty(t, p);
        onChange();
        return ok;
      },
    });

    cache.set(target, proxy);
    return proxy;
  };

  return wrap(obj);
}

const SMART_HOME_DATA = createReactiveState(safeLoad(), () => {
  renderAll();
  schedulePersist();
});

window.SMART_HOME_DATA = SMART_HOME_DATA;

const dom = {
  root: document.documentElement,
  body: document.body,
  appShell: document.querySelector(".app-shell"),
  roomStage: document.getElementById("room-stage"),
  pills: [...document.querySelectorAll(".pill")],
  iconButtons: [...document.querySelectorAll(".icon-btn")],
  glassToggle: document.getElementById("glass-toggle"),
  glassPanel: document.getElementById("glass-panel"),
  glassBlur: document.getElementById("glass-blur"),
  glassOpacity: document.getElementById("glass-opacity"),
  glassSat: document.getElementById("glass-sat"),
  randomThemeBtn: document.getElementById("random-theme-btn"),
  quickPanel: document.getElementById("quick-panel"),
  quickPanelTitle: document.getElementById("quick-panel-title"),
  quickPanelBody: document.getElementById("quick-panel-body"),
  quickPanelClose: document.getElementById("quick-panel-close"),
};

let roomDom = {};
let activeQuickApp = null;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function getByPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((acc, key) => {
    if (!acc[key] || typeof acc[key] !== "object") acc[key] = {};
    return acc[key];
  }, obj);
  target[last] = value;
}

function formatUptime(totalSeconds) {
  const seconds = Number(totalSeconds);
  if (Number.isNaN(seconds) || seconds < 0) return "--";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function animateNumber(from, to, duration, onUpdate) {
  const start = performance.now();
  function step(now) {
    const p = clamp((now - start) / duration, 0, 1);
    const eased = 1 - (1 - p) ** 3;
    onUpdate(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function buildQuickPanelContent(appId) {
  const w = SMART_HOME_DATA.weather;
  const h = SMART_HOME_DATA.home;
  const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  switch (appId) {
    case "home":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>Heure</span><strong>${now}</strong></div>
          <div class="stat-row"><span>Pièce active</span><strong>${SMART_HOME_DATA.room}</strong></div>
        </div>
      `;
    case "cameras":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>Entrée</span><strong>Online</strong></div>
          <div class="stat-row"><span>Garage</span><strong>Offline</strong></div>
          <div class="stat-row"><span>Jardin</span><strong>Online</strong></div>
        </div>
      `;
    case "terminal":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>SSH</span><strong>ssh debian@server</strong></div>
          <div class="stat-row"><span>Docker</span><strong>docker ps</strong></div>
          <div class="stat-row"><span>Logs</span><strong>journalctl -u service</strong></div>
        </div>
      `;
    case "network":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>Ping</span><strong>${h.networkPing} ms</strong></div>
          <div class="stat-row"><span>Down</span><strong>${h.networkDown} Mbps</strong></div>
          <div class="stat-row"><span>Up</span><strong>${h.networkUp} Mbps</strong></div>
        </div>
      `;
    case "energy":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>Énergie</span><strong>${h.energyKwh} kWh</strong></div>
          <div class="stat-row"><span>Coût</span><strong>€${h.energyCost.toFixed(2)}</strong></div>
        </div>
      `;
    case "alerts":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>Alertes</span><strong>${h.alertsCount}</strong></div>
          <div class="stat-row"><span>Détail</span><strong>${h.alertsNote}</strong></div>
        </div>
      `;
    case "scenes":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>Home</span><strong>${SMART_HOME_DATA.switches.homeMode ? "ON" : "OFF"}</strong></div>
          <div class="stat-row"><span>Away</span><strong>${SMART_HOME_DATA.switches.awayMode ? "ON" : "OFF"}</strong></div>
          <div class="stat-row"><span>Relax</span><strong>${SMART_HOME_DATA.switches.relaxScene ? "ON" : "OFF"}</strong></div>
        </div>
      `;
    case "music":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>Titre</span><strong>${SMART_HOME_DATA.music.title}</strong></div>
          <div class="stat-row"><span>Artiste</span><strong>${SMART_HOME_DATA.music.artist}</strong></div>
          <div class="stat-row"><span>État</span><strong>${SMART_HOME_DATA.music.isPlaying ? "Lecture" : "Pause"}</strong></div>
        </div>
      `;
    case "security":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>Mode</span><strong>${SMART_HOME_DATA.switches.security ? "Armé" : "Normal"}</strong></div>
          <div class="stat-row"><span>Portes</span><strong>Verrouillées</strong></div>
        </div>
      `;
    case "storage":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>NAS</span><strong>1.2 TB libres</strong></div>
          <div class="stat-row"><span>Sauvegarde</span><strong>${h.backupStatus}</strong></div>
        </div>
      `;
    case "weather":
      return `
        <div class="stat-grid">
          <div class="stat-row"><span>Temp.</span><strong>${w.tempC}°C</strong></div>
          <div class="stat-row"><span>Humidité</span><strong>${w.humidity}%</strong></div>
          <div class="stat-row"><span>Vent</span><strong>${w.windKmh} km/h</strong></div>
        </div>
      `;
    default:
      return `<p class="muted">Aucune donnée disponible.</p>`;
  }
}

function openQuickPanel(appId, title) {
  if (!dom.quickPanel) return;
  activeQuickApp = appId;
  dom.quickPanelTitle.textContent = title;
  dom.quickPanelBody.innerHTML = buildQuickPanelContent(appId);
  const activeBtn = dom.iconButtons.find((btn) => btn.dataset.app === appId);
  if (activeBtn) {
    const dashboardRect = dom.appShell.querySelector(".dashboard")?.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    if (dashboardRect) {
      const top = btnRect.top - dashboardRect.top;
      dom.quickPanel.style.top = `${top}px`;
    }
  }
  dom.quickPanel.classList.add("is-open");
  dom.quickPanel.setAttribute("aria-hidden", "false");
}

function closeQuickPanel() {
  if (!dom.quickPanel) return;
  activeQuickApp = null;
  dom.quickPanel.classList.remove("is-open");
  dom.quickPanel.setAttribute("aria-hidden", "true");
}

function buildUndoSnapshot() {
  return {
    room: SMART_HOME_DATA.room,
    music: {
      isPlaying: SMART_HOME_DATA.music.isPlaying,
      progress: SMART_HOME_DATA.music.progress,
    },
    hvac: { temperatureC: SMART_HOME_DATA.hvac.temperatureC },
    led: { intensity: SMART_HOME_DATA.led.intensity },
    switches: { ...SMART_HOME_DATA.switches },
    glass: { ...SMART_HOME_DATA.glass },
  };
}

function applySnapshot(snapshot) {
  historyMuted = true;
  SMART_HOME_DATA.room = snapshot.room;
  SMART_HOME_DATA.music.isPlaying = snapshot.music.isPlaying;
  SMART_HOME_DATA.music.progress = snapshot.music.progress;
  SMART_HOME_DATA.hvac.temperatureC = snapshot.hvac.temperatureC;
  SMART_HOME_DATA.led.intensity = snapshot.led.intensity;
  Object.keys(snapshot.switches).forEach((k) => {
    SMART_HOME_DATA.switches[k] = snapshot.switches[k];
  });
  SMART_HOME_DATA.glass.blur = snapshot.glass.blur;
  SMART_HOME_DATA.glass.opacity = snapshot.glass.opacity;
  SMART_HOME_DATA.glass.saturation = snapshot.glass.saturation;
  historyMuted = false;
  renderAll();
}

function pushHistory() {
  if (historyMuted) return;
  undoStack.push(buildUndoSnapshot());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (undoStack.length === 0) return;
  const current = buildUndoSnapshot();
  const previous = undoStack.pop();
  redoStack.push(current);
  applySnapshot(previous);
}

function redo() {
  if (redoStack.length === 0) return;
  const current = buildUndoSnapshot();
  const next = redoStack.pop();
  undoStack.push(current);
  applySnapshot(next);
}

/**
 * Convert pointer coordinate to angle around a center point.
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} centerX
 * @param {number} centerY
 * @returns {number} angle in [0..360)
 */
function pointerToAngle(clientX, clientY, centerX, centerY) {
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  let deg = Math.atan2(dy, dx) * (180 / Math.PI);
  if (deg < 0) deg += 360;
  return deg;
}

function angleToTemperature(angleDeg) {
  return Math.round(clamp(10 + (angleDeg / 360) * 22, 10, 32));
}

function temperatureToKnobPosition(circleEl, temperatureC) {
  const normalized = (temperatureC - 10) / 22;
  const angle = normalized * 360;
  const radius = circleEl.clientWidth / 2 - 8;
  const rad = (angle * Math.PI) / 180;
  const center = circleEl.clientWidth / 2;
  return {
    x: center + Math.cos(rad) * radius,
    y: center + Math.sin(rad) * radius,
  };
}

function renderClock() {
  if (!roomDom.clockTime || !roomDom.clockDate) return;
  const now = new Date();
  roomDom.clockTime.textContent = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  roomDom.clockDate.textContent = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function renderRoomPills() {
  dom.pills.forEach((pill) => {
    pill.classList.toggle("is-active", pill.dataset.room === SMART_HOME_DATA.room);
  });
}

function renderSwitches() {
  if (roomDom.switches) {
    roomDom.switches.forEach((sw) => {
      const key = sw.dataset.key;
      const isOn = Boolean(SMART_HOME_DATA.switches[key]);
      sw.classList.toggle("is-on", isOn);
      sw.setAttribute("aria-checked", String(isOn));
    });
  }

  const sceneButtons = roomDom.active?.querySelectorAll(".scene-btn[data-key]") || [];
  sceneButtons.forEach((btn) => {
    const key = btn.dataset.key;
    const isOn = Boolean(SMART_HOME_DATA.switches[key]);
    btn.classList.toggle("is-active", isOn);
  });
}

function renderStats() {
  if (!roomDom.cpu) return;
  const { cpu, ram, disk, uptime, error } = SMART_HOME_DATA.stats;
  roomDom.cpu.textContent = cpu == null ? "-- %" : `${cpu} %`;
  roomDom.ram.textContent = ram == null ? "-- %" : `${ram} %`;
  roomDom.disk.textContent = disk == null ? "-- %" : `${disk} %`;
  roomDom.uptime.textContent = uptime == null ? "--" : formatUptime(uptime);
  roomDom.error.textContent = error || "";
}

function renderWeather() {
  if (!roomDom.weatherTemp) return;
  const w = SMART_HOME_DATA.weather;
  roomDom.weatherTemp.textContent = String(w.tempC);
  if (roomDom.weatherHumidity) roomDom.weatherHumidity.textContent = `${w.humidity}%`;
  if (roomDom.weatherWind) roomDom.weatherWind.textContent = `${w.windKmh} km/h`;
  if (roomDom.forecastList) {
    roomDom.forecastList.innerHTML = "";
    w.forecast.forEach((f) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = `${f.day} ${f.temp}`;
      roomDom.forecastList.appendChild(chip);
    });
  }
}

function renderMusic() {
  if (!roomDom.trackTitle) return;
  const m = SMART_HOME_DATA.music;
  roomDom.trackTitle.textContent = m.title;
  roomDom.trackArtist.textContent = m.artist;
  roomDom.playBtn.innerHTML = m.isPlaying
    ? '<i class="fa-solid fa-pause"></i>'
    : '<i class="fa-solid fa-play"></i>';
  roomDom.musicFill.style.width = `${m.progress}%`;
  roomDom.musicThumb.style.left = `${m.progress}%`;
  roomDom.musicProgress.setAttribute("aria-valuenow", String(Math.round(m.progress)));
}

function renderThermostat() {
  if (!roomDom.thermo || !roomDom.thermoKnob) return;
  const temp = SMART_HOME_DATA.hvac.temperatureC;
  const { x, y } = temperatureToKnobPosition(roomDom.thermo, temp);
  roomDom.thermoKnob.style.left = `${x}px`;
  roomDom.thermoKnob.style.top = `${y}px`;
  roomDom.thermoValue.textContent = String(temp);
  roomDom.thermo.setAttribute("aria-valuenow", String(temp));

  if (roomDom.thermoReflection) {
    const normalized = (temp - 10) / 22;
    const angle = normalized * 360;
    const glow = 0.52 + normalized * 0.4;
    roomDom.thermoReflection.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(-4.4rem)`;
    roomDom.thermoReflection.style.opacity = String(glow);
  }
}

function renderLed() {
  if (!roomDom.ledTrack) return;
  const intensity = SMART_HOME_DATA.led.intensity;
  roomDom.ledThumb.style.left = `${intensity}%`;
  roomDom.ledTrack.setAttribute("aria-valuenow", String(Math.round(intensity)));
  const hue = (intensity / 100) * 360;
  const color = `hsl(${hue}deg 92% 68%)`;
  dom.root.style.setProperty("--led-color", color);
  roomDom.ledPreview.style.background = `linear-gradient(90deg, ${color}, rgba(255,255,255,0.65))`;
}

function renderBindings() {
  if (!roomDom.active) return;

  roomDom.active.querySelectorAll("[data-bind]").forEach((el) => {
    const path = el.dataset.bind;
    const value = getByPath(SMART_HOME_DATA, path);
    if (value == null) return;
    let display = value;
    const decimals = el.dataset.decimals ? Number(el.dataset.decimals) : null;
    if (typeof value === "number" && Number.isFinite(decimals)) {
      display = value.toFixed(decimals);
    }
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    el.textContent = `${prefix}${display}${suffix}`;
  });

  roomDom.active.querySelectorAll("[data-status]").forEach((el) => {
    const value = getByPath(SMART_HOME_DATA, el.dataset.status);
    if (value == null) return;
    el.textContent = value;
    el.classList.toggle("ok", value === "OK");
    el.classList.toggle("fail", value === "FAIL");
  });

  roomDom.active.querySelectorAll("[data-meter]").forEach((el) => {
    const value = getByPath(SMART_HOME_DATA, el.dataset.meter);
    if (typeof value !== "number") return;
    el.style.width = `${clamp(value, 0, 100)}%`;
  });

  roomDom.active.querySelectorAll("input.range[data-key]").forEach((input) => {
    const value = getByPath(SMART_HOME_DATA, input.dataset.key);
    if (value == null) return;
    if (Number(input.value) !== Number(value)) {
      input.value = value;
    }
  });

  roomDom.active.querySelectorAll("[data-profile]").forEach((btn) => {
    btn.classList.toggle("is-active", SMART_HOME_DATA.play.audioProfile === btn.dataset.profile);
  });
}

function renderGlassControls() {
  const g = SMART_HOME_DATA.glass;
  dom.glassBlur.value = String(g.blur);
  dom.glassOpacity.value = String(g.opacity);
  dom.glassSat.value = String(g.saturation);
}

function updateGlassTheme(blur, opacity, saturation) {
  SMART_HOME_DATA.glass.blur = clamp(Number(blur), 8, 36);
  SMART_HOME_DATA.glass.opacity = clamp(Number(opacity), 4, 22);
  SMART_HOME_DATA.glass.saturation = clamp(Number(saturation), 110, 220);
}

window.updateGlassTheme = updateGlassTheme;

function applyGlassThemeVariables() {
  const g = SMART_HOME_DATA.glass;
  dom.root.style.setProperty("--glass-blur", `${g.blur}px`);
  dom.root.style.setProperty("--glass-opacity", `${g.opacity / 100}`);
  dom.root.style.setProperty("--glass-saturation", `${g.saturation}%`);
}

function renderAll() {
  renderRoomPills();
  renderSwitches();
  renderStats();
  renderWeather();
  renderMusic();
  renderThermostat();
  renderLed();
  renderBindings();
  renderGlassControls();
  applyGlassThemeVariables();
  if (dom.quickPanel && dom.quickPanel.classList.contains("is-open") && activeQuickApp) {
    dom.quickPanelBody.innerHTML = buildQuickPanelContent(activeQuickApp);
  }
}

function applyRippleEvent(el, event) {
  const rect = el.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  el.style.setProperty("--rx", `${x}%`);
  el.style.setProperty("--ry", `${y}%`);
  el.classList.remove("rippling");
  void el.offsetWidth;
  el.classList.add("rippling");
}

function bindCoreInteractions() {
  document.querySelectorAll(".ripple").forEach((el) => {
    el.addEventListener("pointerdown", (event) => applyRippleEvent(el, event));
  });

  document.querySelectorAll(".interactive").forEach((el) => {
    let timer = null;
    el.addEventListener("pointerdown", () => {
      timer = setTimeout(() => el.classList.add("touch-active"), 220);
    });
    const cleanup = () => {
      clearTimeout(timer);
      el.classList.remove("touch-active");
    };
    el.addEventListener("pointerup", cleanup);
    el.addEventListener("pointercancel", cleanup);
    el.addEventListener("pointerleave", cleanup);
  });

  dom.pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pushHistory();
      switchRoom(pill.dataset.room);
    });
  });

  dom.iconButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      dom.iconButtons.forEach((x) => x.classList.remove("is-active"));
      btn.classList.add("is-active");
      const appId = btn.dataset.app;
      const label = btn.getAttribute("aria-label") || "Quick App";
      if (!appId) return;
      if (activeQuickApp === appId && dom.quickPanel?.classList.contains("is-open")) {
        closeQuickPanel();
        return;
      }
      openQuickPanel(appId, label);
    });
  });

  if (dom.quickPanelClose) {
    dom.quickPanelClose.addEventListener("click", closeQuickPanel);
  }

  document.addEventListener("click", (event) => {
    if (!dom.quickPanel || !dom.quickPanel.classList.contains("is-open")) return;
    const target = event.target;
    const isInsidePanel = dom.quickPanel.contains(target);
    const isIcon = target.closest?.(".icon-btn");
    if (!isInsidePanel && !isIcon) closeQuickPanel();
  });

  dom.glassToggle.addEventListener("click", () => {
    const open = dom.glassPanel.classList.toggle("is-open");
    dom.glassToggle.setAttribute("aria-expanded", String(open));
    dom.glassPanel.setAttribute("aria-hidden", String(!open));
  });

  let glassDirty = false;
  const onGlassInput = () => {
    if (!glassDirty) {
      pushHistory();
      glassDirty = true;
    }
    updateGlassTheme(dom.glassBlur.value, dom.glassOpacity.value, dom.glassSat.value);
  };
  const onGlassCommit = () => {
    glassDirty = false;
  };
  [dom.glassBlur, dom.glassOpacity, dom.glassSat].forEach((input) => {
    input.addEventListener("input", onGlassInput);
    input.addEventListener("change", onGlassCommit);
  });

  dom.randomThemeBtn.addEventListener("click", () => {
    pushHistory();
    const t = THEMES[Math.floor(Math.random() * THEMES.length)];
    dom.root.style.setProperty("--theme-hue", t.hue);
    dom.root.style.setProperty("--theme-sat", `${t.sat}%`);
    dom.root.style.setProperty("--theme-light", `${t.light}%`);
    updateGlassTheme(t.blur, t.opacity, t.saturation);
  });

  document.addEventListener("keydown", (event) => {
    const z = event.key.toLowerCase() === "z";
    const y = event.key.toLowerCase() === "y";
    if (event.key === "Escape") closeQuickPanel();
    if ((event.ctrlKey || event.metaKey) && z && !event.shiftKey) {
      event.preventDefault();
      undo();
    }
    if ((event.ctrlKey || event.metaKey) && (y || (z && event.shiftKey))) {
      event.preventDefault();
      redo();
    }
  });
}

function bindRoomControls() {
  bindMusicSlider();
  bindThermostat();
  bindLedSlider();
  bindRangeControls();
  bindProfileButtons();

  if (roomDom.switches) {
    roomDom.switches.forEach((sw) => {
      sw.addEventListener("click", () => {
        pushHistory();
        const key = sw.dataset.key;
        SMART_HOME_DATA.switches[key] = !SMART_HOME_DATA.switches[key];
      });
    });
  }

  if (roomDom.playBtn) {
    roomDom.playBtn.addEventListener("click", () => {
      pushHistory();
      SMART_HOME_DATA.music.isPlaying = !SMART_HOME_DATA.music.isPlaying;
    });
  }

  const sceneButtons = roomDom.active?.querySelectorAll(".scene-btn[data-key]") || [];
  sceneButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      pushHistory();
      const key = btn.dataset.key;
      SMART_HOME_DATA.switches[key] = !SMART_HOME_DATA.switches[key];
    });
  });
}

function bindMusicSlider() {
  if (!roomDom.musicProgress) return;
  let dragging = false;
  const setFromX = (clientX) => {
    const rect = roomDom.musicProgress.getBoundingClientRect();
    SMART_HOME_DATA.music.progress = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  roomDom.musicProgress.addEventListener("pointerdown", (event) => {
    pushHistory();
    dragging = true;
    roomDom.musicProgress.setPointerCapture(event.pointerId);
    setFromX(event.clientX);
  });
  roomDom.musicProgress.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    setFromX(event.clientX);
  });
  roomDom.musicProgress.addEventListener("pointerup", () => {
    dragging = false;
  });
  roomDom.musicProgress.addEventListener("keydown", (event) => {
    pushHistory();
    if (event.key === "ArrowRight") SMART_HOME_DATA.music.progress = clamp(SMART_HOME_DATA.music.progress + 2, 0, 100);
    if (event.key === "ArrowLeft") SMART_HOME_DATA.music.progress = clamp(SMART_HOME_DATA.music.progress - 2, 0, 100);
  });
}

function bindThermostat() {
  if (!roomDom.thermo) return;
  let dragging = false;

  const setFromPointer = (clientX, clientY) => {
    const rect = roomDom.thermo.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = pointerToAngle(clientX, clientY, cx, cy);
    const target = angleToTemperature(angle);

    const before = SMART_HOME_DATA.hvac.temperatureC;
    SMART_HOME_DATA.hvac.temperatureC = target;

    animateNumber(before, target, 120, (value) => {
      roomDom.thermoValue.textContent = String(Math.round(value));
    });
  };

  roomDom.thermo.addEventListener("pointerdown", (event) => {
    pushHistory();
    dragging = true;
    roomDom.thermo.setPointerCapture(event.pointerId);
    setFromPointer(event.clientX, event.clientY);
  });

  roomDom.thermo.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    setFromPointer(event.clientX, event.clientY);
  });

  roomDom.thermo.addEventListener("pointerup", () => {
    dragging = false;
  });

  roomDom.thermo.addEventListener("keydown", (event) => {
    pushHistory();
    const before = SMART_HOME_DATA.hvac.temperatureC;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") SMART_HOME_DATA.hvac.temperatureC = clamp(before + 1, 10, 32);
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") SMART_HOME_DATA.hvac.temperatureC = clamp(before - 1, 10, 32);
    animateNumber(before, SMART_HOME_DATA.hvac.temperatureC, 120, (value) => {
      roomDom.thermoValue.textContent = String(Math.round(value));
    });
  });

  window.addEventListener("resize", renderThermostat);
}

function bindLedSlider() {
  if (!roomDom.ledTrack) return;
  let dragging = false;
  const setFromX = (clientX) => {
    const rect = roomDom.ledTrack.getBoundingClientRect();
    SMART_HOME_DATA.led.intensity = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  roomDom.ledTrack.addEventListener("pointerdown", (event) => {
    pushHistory();
    dragging = true;
    roomDom.ledTrack.setPointerCapture(event.pointerId);
    setFromX(event.clientX);
  });
  roomDom.ledTrack.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    setFromX(event.clientX);
  });
  roomDom.ledTrack.addEventListener("pointerup", () => {
    dragging = false;
  });
  roomDom.ledTrack.addEventListener("keydown", (event) => {
    pushHistory();
    if (event.key === "ArrowRight") SMART_HOME_DATA.led.intensity = clamp(SMART_HOME_DATA.led.intensity + 2, 0, 100);
    if (event.key === "ArrowLeft") SMART_HOME_DATA.led.intensity = clamp(SMART_HOME_DATA.led.intensity - 2, 0, 100);
  });
}

function bindRangeControls() {
  if (!roomDom.active) return;
  const ranges = [...roomDom.active.querySelectorAll("input.range[data-key]")];
  ranges.forEach((input) => {
    let dirty = false;
    const update = () => {
      if (!dirty) {
        pushHistory();
        dirty = true;
      }
      const value = Number(input.value);
      setByPath(SMART_HOME_DATA, input.dataset.key, value);
    };
    const commit = () => {
      dirty = false;
    };
    input.addEventListener("input", update);
    input.addEventListener("change", commit);
  });
}

function bindProfileButtons() {
  if (!roomDom.active) return;
  const profiles = [...roomDom.active.querySelectorAll("[data-profile]")];
  if (!profiles.length) return;
  profiles.forEach((btn) => {
    btn.addEventListener("click", () => {
      pushHistory();
      SMART_HOME_DATA.play.audioProfile = btn.dataset.profile;
    });
  });
}

function bindParallax() {
  if (!dom.roomStage) return;
  let raf = 0;
  const maxTilt = 5;

  const apply = (mx, my) => {
    const rect = dom.roomStage.getBoundingClientRect();
    const px = (mx - rect.left) / rect.width;
    const py = (my - rect.top) / rect.height;
    const rotateY = (px - 0.5) * maxTilt;
    const rotateX = (0.5 - py) * maxTilt;

    const cards = [...dom.roomStage.querySelectorAll(".widget-card")];
    cards.forEach((card) => {
      const depth = Number(card.dataset.depth || 1);
      const rx = rotateX * depth;
      const ry = rotateY * depth;
      const tz = depth * 1.4;
      card.style.setProperty("--rx", `${rx}deg`);
      card.style.setProperty("--ry", `${ry}deg`);
      card.style.setProperty("--tz", `${tz}px`);
    });
  };

  dom.roomStage.addEventListener("mousemove", (event) => {
    if (window.matchMedia("(max-width: 768px)").matches) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => apply(event.clientX, event.clientY));
  });

  dom.roomStage.addEventListener("mouseleave", () => {
    const cards = [...dom.roomStage.querySelectorAll(".widget-card")];
    cards.forEach((card) => {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
      card.style.setProperty("--tz", "0px");
    });
  });
}

async function syncSystemStats() {
  suppressPersist = true;
  try {
    const response = await fetch("/api/stats", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    SMART_HOME_DATA.stats.cpu = data.cpu_percent;
    SMART_HOME_DATA.stats.ram = data.ram_percent;
    SMART_HOME_DATA.stats.disk = data.disk_percent;
    SMART_HOME_DATA.stats.uptime = data.uptime_seconds;
    SMART_HOME_DATA.stats.error = "";
  } catch (error) {
    SMART_HOME_DATA.stats.error = `Stats error: ${error.message}`;
  } finally {
    suppressPersist = false;
  }
}

function startMusicTicker() {
  setInterval(() => {
    if (!SMART_HOME_DATA.music.isPlaying) return;
    const next = SMART_HOME_DATA.music.progress + 0.7;
    SMART_HOME_DATA.music.progress = next > 100 ? 0 : next;
  }, 450);
}

function initStaggerEntry() {
  const cards = [...dom.roomStage.querySelectorAll(".widget-card")];
  cards.forEach((card, index) => {
    card.style.setProperty("--entry-delay", `${80 + index * 70}ms`);
  });
  requestAnimationFrame(() => {
    dom.body.classList.add("ready");
  });
}

function updateRoomTheme(room) {
  const theme = ROOM_THEMES[room];
  if (!theme) return;
  dom.root.style.setProperty("--theme-hue", theme.hue);
  dom.root.style.setProperty("--theme-sat", `${theme.sat}%`);
  dom.root.style.setProperty("--theme-light", `${theme.light}%`);
  dom.body.classList.toggle("home-bg", room === "Home");
  dom.body.classList.toggle("living-bg", room === "Living Room");
  dom.body.classList.toggle("bath-bg", room === "Bath Room");
  dom.body.classList.toggle("kitchen-bg", room === "Kitchen");
  dom.body.classList.toggle("bed-bg", room === "Bed Room");
  dom.body.classList.toggle("play-bg", room === "Play Room");
}

function switchRoom(room) {
  if (room === SMART_HOME_DATA.room) return;
  const stage = dom.roomStage;
  const current = stage.querySelector(".room-panel.is-active");
  const next = stage.querySelector(`[data-room="${room}"]`);
  if (!next) return;

  stage.classList.add("is-switching");
  setTimeout(() => {
    if (current) current.classList.remove("is-active");
    next.classList.add("is-active", "is-entering");
    SMART_HOME_DATA.room = room;
    updateRoomTheme(room);
    cacheRoomDom();
    renderAll();
    bindRoomControls();
    initStaggerEntry();
    stage.classList.remove("is-switching");
    setTimeout(() => next.classList.remove("is-entering"), 260);
  }, 220);
}

function cacheRoomDom() {
  const stage = dom.roomStage;
  const active = stage.querySelector(".room-panel.is-active");
  if (!active) return;

  roomDom = {
    active,
    switches: [...active.querySelectorAll(".switch[data-key]")],
    cpu: active.querySelector("#cpu-value"),
    ram: active.querySelector("#ram-value"),
    disk: active.querySelector("#disk-value"),
    uptime: active.querySelector("#uptime-value"),
    error: active.querySelector("#error-message"),
    clockTime: active.querySelector("#clock-time"),
    clockDate: active.querySelector("#clock-date"),
    weatherTemp: active.querySelector("#weather-temp"),
    weatherHumidity: active.querySelector("#weather-humidity"),
    weatherWind: active.querySelector("#weather-wind"),
    forecastList: active.querySelector("#forecast-list"),
    trackTitle: active.querySelector("#track-title"),
    trackArtist: active.querySelector("#track-artist"),
    playBtn: active.querySelector("#play-btn"),
    musicProgress: active.querySelector("#music-progress"),
    musicFill: active.querySelector("#music-fill"),
    musicThumb: active.querySelector("#music-thumb"),
    thermo: active.querySelector("#thermo"),
    thermoKnob: active.querySelector("#thermo-knob"),
    thermoReflection: active.querySelector("#thermo-reflection"),
    thermoValue: active.querySelector("#thermo-value"),
    ledTrack: active.querySelector("#led-track"),
    ledThumb: active.querySelector("#led-thumb"),
    ledPreview: active.querySelector("#led-preview"),
  };
}

function renderRoomPanels() {
  dom.roomStage.innerHTML = [
    createHomePanel(),
    createLivingRoomPanel(),
    createBathRoomPanel(),
    createKitchenPanel(),
    createBedRoomPanel(),
    createPlayRoomPanel(),
  ].join("");

  const startPanel = dom.roomStage.querySelector(`[data-room="${SMART_HOME_DATA.room}"]`);
  if (startPanel) startPanel.classList.add("is-active");
}

function createHomePanel() {
  return `
    <section class="room-panel" data-room="Home">
      <section class="widget-grid">
        <section class="widget-col left">
          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <div class="row space-between align-start">
              <div>
                <h1>Bonjour</h1>
                <p class="muted">Bienvenue sur le dashboard du homelab</p>
              </div>
              <div class="clock-block">
                <strong id="clock-time">--:--:--</strong>
                <span id="clock-date" class="muted">--</span>
              </div>
            </div>
            <p class="muted mt-sm">Suivi rapide des infos essentielles.</p>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Calendrier</h2>
            <div class="calendar">
              <div class="calendar-header">
                <span>Mars 2026</span>
                <span class="muted">Semaine 11</span>
              </div>
              <div class="calendar-grid">
                <span class="cal-day">Lu</span>
                <span class="cal-day">Ma</span>
                <span class="cal-day">Me</span>
                <span class="cal-day">Je</span>
                <span class="cal-day">Ve</span>
                <span class="cal-day">Sa</span>
                <span class="cal-day">Di</span>
                <span class="cal-date is-muted">24</span>
                <span class="cal-date is-muted">25</span>
                <span class="cal-date is-muted">26</span>
                <span class="cal-date is-muted">27</span>
                <span class="cal-date is-muted">28</span>
                <span class="cal-date">1</span>
                <span class="cal-date">2</span>
                <span class="cal-date">3</span>
                <span class="cal-date">4</span>
                <span class="cal-date">5</span>
                <span class="cal-date is-today">6</span>
                <span class="cal-date">7</span>
                <span class="cal-date">8</span>
                <span class="cal-date">9</span>
                <span class="cal-date">10</span>
                <span class="cal-date">11</span>
                <span class="cal-date">12</span>
                <span class="cal-date">13</span>
                <span class="cal-date">14</span>
                <span class="cal-date">15</span>
                <span class="cal-date">16</span>
                <span class="cal-date">17</span>
                <span class="cal-date">18</span>
                <span class="cal-date">19</span>
                <span class="cal-date">20</span>
              </div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>Prochains événements</h2>
            <ul class="simple-list">
              <li>10:30 · Maintenance NAS</li>
              <li>15:00 · Mise à jour routeur</li>
              <li>20:00 · Vérif. sauvegardes</li>
            </ul>
          </article>
        </section>

        <section class="widget-col center">
          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h2>Météo</h2>
            <div class="row space-between align-center weather-main">
              <p class="temp"><span id="weather-temp">23</span>&deg;C</p>
              <i class="fa-solid fa-cloud-sun weather-icon"></i>
            </div>
            <div class="chip-grid">
              <div class="chip">Humidité: <strong id="weather-humidity">88%</strong></div>
              <div class="chip">Vent: <strong id="weather-wind">13 km/h</strong></div>
            </div>
            <div id="forecast-list" class="forecast-grid"></div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Automatisations</h2>
            <div class="automation-grid">
              <button class="scene-btn automation-btn ripple" data-key="homeMode" type="button">Je suis à la maison</button>
              <button class="scene-btn automation-btn ripple" data-key="awayMode" type="button">Je sors de la maison</button>
            </div>
            <p class="muted mt-sm">Active tes scénarios en un clic.</p>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>État réseau</h2>
            <div class="stat-grid">
              <div class="stat-row"><span>Ping</span><strong data-bind="home.networkPing" data-suffix=" ms"></strong></div>
              <div class="stat-row"><span>Download</span><strong data-bind="home.networkDown" data-suffix=" Mbps"></strong></div>
              <div class="stat-row"><span>Upload</span><strong data-bind="home.networkUp" data-suffix=" Mbps"></strong></div>
            </div>
          </article>
        </section>

        <section class="widget-col right">
          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>Musique</h2>
            <div class="music-grid">
              <div class="cover" aria-label="Album cover"></div>
              <div>
                <strong id="track-title">Never Gonna Give You Up</strong>
                <p id="track-artist" class="muted">Rick Astley</p>
                <div id="music-progress" class="track" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
                  <span id="music-fill" class="track-fill"></span>
                  <span id="music-thumb" class="track-thumb"></span>
                </div>
                <div class="row gap-sm mt-sm">
                  <button class="mini-btn ripple" type="button"><i class="fa-solid fa-backward-step"></i></button>
                  <button id="play-btn" class="mini-btn ripple" type="button"><i class="fa-solid fa-play"></i></button>
                  <button class="mini-btn ripple" type="button"><i class="fa-solid fa-forward-step"></i></button>
                </div>
              </div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="0.95">
            <h2>Dernière sauvegarde</h2>
            <div class="status-row">
              <span data-bind="home.backupTime"></span>
              <span class="status-pill" data-status="home.backupStatus"></span>
            </div>
            <p class="muted mt-sm">Prochaine vérification à 23:00.</p>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="0.9">
            <h2>Alertes en cours</h2>
            <div class="status-row">
              <strong data-bind="home.alertsCount"></strong>
              <a class="link-pill" href="#">Voir</a>
            </div>
            <p class="muted mt-sm" data-bind="home.alertsNote"></p>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="0.85">
            <h2>Énergie du jour</h2>
            <div class="energy-bar"><span data-meter="home.energyPct"></span></div>
            <div class="status-row mt-sm">
              <span data-bind="home.energyKwh" data-decimals="1" data-suffix=" kWh"></span>
              <strong data-bind="home.energyCost" data-decimals="2" data-prefix="€"></strong>
            </div>
          </article>
        </section>
      </section>
    </section>
  `;
}

function createLivingRoomPanel() {
  return `
    <section class="room-panel" data-room="Living Room">
      <section class="widget-grid">
        <section class="widget-col left">
          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h1>Living Room</h1>
            <p class="muted">Comfort & entertainment overview</p>
            <div class="presence-row">
              <span class="room-tag"><i class="fa-solid fa-person-walking"></i> Présence</span>
              <span class="muted" data-bind="living.presenceLast" data-prefix="Détecté il y a "></span>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Qualité de l’air</h2>
            <div class="stat-grid">
              <div class="stat-row"><span>CO₂</span><strong data-bind="living.airCo2" data-suffix=" ppm"></strong></div>
              <div class="stat-row"><span>Humidité</span><strong data-bind="living.airHumidity" data-suffix="%"></strong></div>
              <div class="stat-row"><span>Temp.</span><strong data-bind="living.airTemp" data-decimals="1" data-suffix="°C"></strong></div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>Music</h2>
            <div class="music-grid">
              <div class="cover" aria-label="Album cover"></div>
              <div>
                <strong id="track-title">Never Gonna Give You Up</strong>
                <p id="track-artist" class="muted">Rick Astley</p>
                <div id="music-progress" class="track" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
                  <span id="music-fill" class="track-fill"></span>
                  <span id="music-thumb" class="track-thumb"></span>
                </div>
                <div class="row gap-sm mt-sm">
                  <button class="mini-btn ripple" type="button"><i class="fa-solid fa-backward-step"></i></button>
                  <button id="play-btn" class="mini-btn ripple" type="button"><i class="fa-solid fa-play"></i></button>
                  <button class="mini-btn ripple" type="button"><i class="fa-solid fa-forward-step"></i></button>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section class="widget-col center">
          <article class="widget-card glass interactive intro-item" data-depth="1.5">
            <h2>Live Camera</h2>
            <div class="camera-frame">
              <span class="rec"><span class="dot"></span> REC</span>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.35">
            <h2>Éclairage principal</h2>
            <div class="slider-row">
              <input class="range" type="range" min="0" max="100" value="72" data-key="living.mainLight" />
              <span class="range-value" data-bind="living.mainLight" data-suffix="%"></span>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.35">
            <h2>Air Conditioner</h2>
            <div class="thermo-wrap">
              <div id="thermo" class="thermo" role="slider" aria-valuemin="10" aria-valuemax="32" aria-valuenow="17" tabindex="0">
                <span id="thermo-knob" class="thermo-knob"></span>
                <span id="thermo-reflection" class="thermo-reflection"></span>
                <div class="thermo-center">
                  <p class="thermo-text"><span id="thermo-value">17</span>&deg;C</p>
                  <p class="muted">Drag to adjust</p>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section class="widget-col right">
          <article class="widget-card glass interactive intro-item" data-depth="1.25">
            <h2>Smart TV</h2>
            <div class="apps-row">
              <span class="app-chip">Netflix</span>
              <span class="app-chip">Disney+</span>
              <span class="app-chip">YouTube</span>
              <span class="app-chip">HBO</span>
            </div>
            <div class="switch-list">
              <div class="switch-item"><span>TV Power</span><button class="switch ripple" data-key="tvPower" type="button" role="switch" aria-checked="false"></button></div>
              <div class="switch-item"><span>Apple TV</span><button class="switch ripple" data-key="appleTv" type="button" role="switch" aria-checked="false"></button></div>
              <div class="switch-item"><span>Cinema Mode</span><button class="switch ripple" data-key="cinemaMode" type="button" role="switch" aria-checked="false"></button></div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h2>Consommation TV</h2>
            <div class="meter">
              <div class="meter-bar"><span style="width: 46%"></span></div>
              <div class="meter-row"><span>Aujourd’hui</span><strong data-bind="living.tvTime"></strong></div>
            </div>
          </article>

          <article class="widget-card glass interactive led-card intro-item" id="led-card" data-depth="1.4">
            <h2>Ambient LED</h2>
            <div id="led-track" class="led-track" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" tabindex="0">
              <span id="led-thumb" class="led-thumb"></span>
            </div>
            <div id="led-preview" class="led-preview"></div>

            <div class="mini-toggle-grid">
              <div class="mini-toggle">
                <span><i class="fa-solid fa-wifi"></i> WiFi</span>
                <button class="switch ripple" data-key="wifi" type="button" role="switch" aria-checked="false"></button>
              </div>
              <div class="mini-toggle">
                <span><i class="fa-solid fa-microphone-lines"></i> Alexa</span>
                <button class="switch ripple" data-key="alexa" type="button" role="switch" aria-checked="false"></button>
              </div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>Quick Scenes</h2>
            <div class="scene-grid">
              <button class="scene-btn ripple" data-key="movieNight" type="button">Movie Night</button>
              <button class="scene-btn ripple" data-key="readingScene" type="button">Lecture</button>
              <button class="scene-btn ripple" data-key="relaxScene" type="button">Relax</button>
            </div>
          </article>
        </section>
      </section>
    </section>
  `;
}

function createBathRoomPanel() {
  return `
    <section class="room-panel" data-room="Bath Room">
      <section class="widget-grid">
        <section class="widget-col left">
          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h1>Bath Room</h1>
            <p class="muted">Morning routine intelligence</p>
            <div class="mirror-panel">
              <div class="row space-between align-center">
                <span class="room-tag"><i class="fa-solid fa-sun"></i> 23&deg;C</span>
                <span class="room-tag"><i class="fa-regular fa-newspaper"></i> Daily Brief</span>
              </div>
              <div class="news-box">Top story: Minimalist spa trends boost well-being.</div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.05">
            <h2>Qualité de l’eau</h2>
            <div class="stat-grid">
              <div class="stat-row"><span>Température</span><strong data-bind="bath.waterTemp" data-suffix="°C"></strong></div>
              <div class="stat-row"><span>Dureté</span><strong data-bind="bath.waterHardness" data-suffix=" °fH"></strong></div>
            </div>
            <div class="slider-row mt-sm">
              <input class="range" type="range" min="30" max="42" value="37" data-key="bath.waterTemp" />
              <span class="range-value" data-bind="bath.waterTemp" data-suffix="°C"></span>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>Conso d’eau</h2>
            <div class="meter">
              <div class="meter-bar"><span data-meter="bath.waterTodayPct"></span></div>
              <div class="meter-row"><span>Aujourd’hui</span><strong data-bind="bath.waterToday" data-suffix=" L"></strong></div>
            </div>
            <div class="meter mt-sm">
              <div class="meter-bar"><span data-meter="bath.waterWeekPct"></span></div>
              <div class="meter-row"><span>Semaine</span><strong data-bind="bath.waterWeek" data-suffix=" L"></strong></div>
            </div>
          </article>
        </section>

        <section class="widget-col center">
          <article class="widget-card glass interactive intro-item" data-depth="1.3">
            <h2>Ventilation intelligente</h2>
            <div class="meter">
              <div class="meter-bar"><span style="width: 58%"></span></div>
              <div class="meter-row"><span>Auto ON</span><strong data-bind="bath.ventThreshold" data-prefix="> " data-suffix="%"></strong></div>
            </div>
            <p class="muted mt-sm">Actif quand l’humidité dépasse 60%.</p>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h2>Routine matin</h2>
            <div class="status-row">
              <span>Rappel</span>
              <span class="status-pill" data-bind="bath.morningReminder"></span>
            </div>
            <div class="slider-row mt-sm">
              <input class="range" type="range" min="5" max="30" value="12" data-key="bath.morningMinutes" />
              <span class="range-value" data-bind="bath.morningMinutes" data-suffix=" min"></span>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Towel Warmer</h2>
            <div class="switch-item">
              <span>Heated Towels</span>
              <button class="switch ripple" data-key="towelWarmer" type="button" role="switch" aria-checked="false"></button>
            </div>
          </article>
        </section>

        <section class="widget-col right">
          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Steam Boost</h2>
            <div class="scene-grid">
              <button class="scene-btn ripple" data-key="bathSpa" type="button">Spa</button>
              <button class="scene-btn ripple" data-key="bathClean" type="button">Clean</button>
              <button class="scene-btn ripple" data-key="bathDry" type="button">Quick Dry</button>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>Éclairage miroir</h2>
            <div class="slider-row">
              <input class="range" type="range" min="2500" max="6500" value="4200" data-key="bath.mirrorTempK" />
              <span class="range-value" data-bind="bath.mirrorTempK" data-suffix="K"></span>
            </div>
            <p class="muted mt-sm">Chaud ↔ Froid</p>
          </article>
        </section>
      </section>
    </section>
  `;
}

function createKitchenPanel() {
  return `
    <section class="room-panel" data-room="Kitchen">
      <section class="widget-grid">
        <section class="widget-col left">
          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h1>Kitchen</h1>
            <p class="muted">Prep and inventory dashboard</p>
            <ul class="list">
              <li>Oat milk</li>
              <li>Avocados</li>
              <li>Salmon</li>
              <li>Spinach</li>
            </ul>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Plan de repas</h2>
            <ul class="simple-list">
              <li>Ce soir · Saumon & quinoa</li>
              <li>Demain · Pâtes pesto</li>
              <li>Jeu. · Salade complète</li>
            </ul>
          </article>
        </section>

        <section class="widget-col center">
          <article class="widget-card glass interactive intro-item" data-depth="1.3">
            <h2>Détection fumée/gaz</h2>
            <div class="status-row">
              <span>Statut</span>
              <span class="status-pill" data-status="kitchen.smokeStatus"></span>
            </div>
            <p class="muted mt-sm">Aucune alerte active.</p>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h2>Qualité de l’air</h2>
            <div class="stat-grid">
              <div class="stat-row"><span>CO₂</span><strong data-bind="kitchen.airCo2" data-suffix=" ppm"></strong></div>
              <div class="stat-row"><span>Particules</span><strong data-bind="kitchen.airPm" data-prefix="PM2.5 · "></strong></div>
              <div class="stat-row"><span>Humidité</span><strong data-bind="kitchen.airHumidity" data-suffix="%"></strong></div>
            </div>
          </article>
        </section>

        <section class="widget-col right">
          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Conso appareils</h2>
            <div class="meter">
              <div class="meter-bar"><span style="width: 46%"></span></div>
              <div class="meter-row"><span>Four</span><strong data-bind="kitchen.ovenKwh" data-decimals="1" data-suffix=" kWh"></strong></div>
            </div>
            <div class="meter mt-sm">
              <div class="meter-bar"><span style="width: 32%"></span></div>
              <div class="meter-row"><span>Frigo</span><strong data-bind="kitchen.fridgeKwh" data-decimals="1" data-suffix=" kWh"></strong></div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>État poubelles</h2>
            <div class="stat-grid">
              <div class="stat-row"><span>Recyclage</span><strong data-bind="kitchen.binRecycle"></strong></div>
              <div class="stat-row"><span>Tri</span><strong data-bind="kitchen.binTri"></strong></div>
              <div class="stat-row"><span>Sortie</span><strong data-bind="kitchen.binOut"></strong></div>
            </div>
          </article>
        </section>
      </section>
    </section>
  `;
}

function createBedRoomPanel() {
  return `
    <section class="room-panel" data-room="Bed Room">
      <section class="widget-grid">
        <section class="widget-col left">
          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h1>Bed Room</h1>
            <p class="muted">Calme, routine, et confort nocturne</p>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Mode nuit</h2>
            <div class="switch-item">
              <span>Activé</span>
              <button class="switch ripple" data-key="nightMode" type="button" role="switch" aria-checked="false"></button>
            </div>
            <div class="status-row mt-sm">
              <span>Début</span>
              <strong data-bind="bed.nightStart"></strong>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>Qualité de l’air</h2>
            <div class="stat-grid">
              <div class="stat-row"><span>CO₂</span><strong data-bind="bed.airCo2" data-suffix=" ppm"></strong></div>
              <div class="stat-row"><span>Humidité</span><strong data-bind="bed.airHumidity" data-suffix="%"></strong></div>
            </div>
          </article>
        </section>

        <section class="widget-col center">
          <article class="widget-card glass interactive intro-item" data-depth="1.3">
            <h2>Température chambre</h2>
            <div class="status-row">
              <span>Actuelle</span>
              <strong data-bind="bed.roomTemp" data-decimals="1" data-suffix="°C"></strong>
            </div>
            <div class="slider-row mt-sm">
              <input class="range" type="range" min="16" max="24" value="20" data-key="bed.roomTempSet" />
              <span class="range-value" data-bind="bed.roomTempSet" data-suffix="°C"></span>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h2>Rideaux / volets</h2>
            <div class="slider-row">
              <input class="range" type="range" min="0" max="100" value="55" data-key="bed.curtainPercent" />
              <span class="range-value" data-bind="bed.curtainPercent" data-suffix="%"></span>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Lumière d’ambiance</h2>
            <div class="slider-row">
              <input class="range" type="range" min="0" max="100" value="30" data-key="bed.ambientLight" />
              <span class="range-value" data-bind="bed.ambientLight" data-suffix="%"></span>
            </div>
            <div class="slider-row mt-sm">
              <input class="range" type="range" min="2500" max="6500" value="4200" data-key="bed.ambientWarmth" />
              <span class="range-value" data-bind="bed.ambientWarmth" data-suffix="K"></span>
            </div>
          </article>
        </section>

        <section class="widget-col right">
          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Alarmes actives</h2>
            <div class="status-row">
              <span>Total</span>
              <strong data-bind="bed.alarmsCount"></strong>
            </div>
            <ul class="simple-list mt-sm">
              <li data-bind="bed.alarm1"></li>
              <li data-bind="bed.alarm2"></li>
            </ul>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>Statut sommeil</h2>
            <div class="stat-grid">
              <div class="stat-row"><span>Durée</span><strong data-bind="bed.sleepDuration"></strong></div>
              <div class="stat-row"><span>Réveils</span><strong data-bind="bed.sleepAwakenings"></strong></div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="0.95">
            <h2>Bruit blanc</h2>
            <div class="switch-item">
              <span>Actif</span>
              <button class="switch ripple" data-key="whiteNoise" type="button" role="switch" aria-checked="false"></button>
            </div>
            <div class="slider-row mt-sm">
              <input class="range" type="range" min="0" max="100" value="40" data-key="bed.whiteNoiseLevel" />
              <span class="range-value" data-bind="bed.whiteNoiseLevel" data-suffix="%"></span>
            </div>
          </article>
        </section>
      </section>
    </section>
  `;
}

function createPlayRoomPanel() {
  return `
    <section class="room-panel" data-room="Play Room">
      <section class="widget-grid">
        <section class="widget-col left">
          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h1>Play Room</h1>
            <p class="muted">Gaming & streaming control</p>
            <div class="temp-graph">
              <div class="temp-line"><span class="temp-fill cpu" data-meter="play.cpuTempPct"></span></div>
              <div class="temp-line"><span class="temp-fill gpu" data-meter="play.gpuTempPct"></span></div>
            </div>
            <div class="stat-grid mt-sm">
              <div class="stat-row"><span>CPU Temp</span><strong data-bind="play.cpuTemp" data-suffix="°C"></strong></div>
              <div class="stat-row"><span>GPU Temp</span><strong data-bind="play.gpuTemp" data-suffix="°C"></strong></div>
              <div class="stat-row"><span>Alertes</span><strong data-bind="play.alerts"></strong></div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Latence réseau</h2>
            <div class="stat-grid">
              <div class="stat-row"><span>Ping</span><strong data-bind="play.ping" data-suffix=" ms"></strong></div>
              <div class="stat-row"><span>Jitter</span><strong data-bind="play.jitter" data-suffix=" ms"></strong></div>
            </div>
          </article>
        </section>

        <section class="widget-col center">
          <article class="widget-card glass interactive intro-item" data-depth="1.3">
            <h2>Profil audio</h2>
            <div class="scene-grid">
              <button class="scene-btn ripple" data-profile="game" type="button">Jeu</button>
              <button class="scene-btn ripple" data-profile="movie" type="button">Film</button>
              <button class="scene-btn ripple" data-profile="night" type="button">Nuit</button>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h2>Mode streaming</h2>
            <div class="scene-grid">
              <button class="scene-btn ripple" data-key="streamObs" type="button">OBS</button>
              <button class="scene-btn ripple" data-key="streamLight" type="button">Lumière</button>
              <button class="scene-btn ripple" data-key="streamMulti" type="button">Multi-cam</button>
            </div>
            <p class="muted mt-sm">Scènes rapides de diffusion.</p>
          </article>
        </section>

        <section class="widget-col right">
          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Stockage console</h2>
            <div class="meter">
              <div class="meter-bar"><span data-meter="play.consoleFreePct"></span></div>
              <div class="meter-row"><span>Libre</span><strong data-bind="play.consoleFree" data-suffix=" GB"></strong></div>
            </div>
            <div class="meter mt-sm">
              <div class="meter-bar"><span data-meter="play.consoleUsedPct"></span></div>
              <div class="meter-row"><span>Utilisé</span><strong data-bind="play.consoleUsed" data-suffix=" GB"></strong></div>
            </div>
          </article>
        </section>
      </section>
    </section>
  `;
}

function init() {
  renderRoomPanels();
  updateRoomTheme(SMART_HOME_DATA.room);
  cacheRoomDom();
  renderAll();
  bindCoreInteractions();
  bindRoomControls();
  bindParallax();
  initStaggerEntry();

  setInterval(renderClock, 1000);
  syncSystemStats();
  setInterval(syncSystemStats, STATS_INTERVAL_MS);
  startMusicTicker();
}

init();
