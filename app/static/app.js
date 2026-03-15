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
  room: "Living Room",
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
    sunrise: false,
    towelWarmer: false,
    streamMode: false,
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
};

let roomDom = {};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
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
  if (!roomDom.switches) return;
  roomDom.switches.forEach((sw) => {
    const key = sw.dataset.key;
    const isOn = Boolean(SMART_HOME_DATA.switches[key]);
    sw.classList.toggle("is-on", isOn);
    sw.setAttribute("aria-checked", String(isOn));
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
  renderGlassControls();
  applyGlassThemeVariables();
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
    });
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
  if (!roomDom.switches) return;
  roomDom.switches.forEach((sw) => {
    sw.addEventListener("click", () => {
      pushHistory();
      const key = sw.dataset.key;
      SMART_HOME_DATA.switches[key] = !SMART_HOME_DATA.switches[key];
    });
  });

  if (roomDom.playBtn) {
    roomDom.playBtn.addEventListener("click", () => {
      pushHistory();
      SMART_HOME_DATA.music.isPlaying = !SMART_HOME_DATA.music.isPlaying;
    });
  }

  bindMusicSlider();
  bindThermostat();
  bindLedSlider();
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
    createLivingRoomPanel(),
    createBathRoomPanel(),
    createKitchenPanel(),
    createBedRoomPanel(),
    createPlayRoomPanel(),
  ].join("");

  const startPanel = dom.roomStage.querySelector(`[data-room="${SMART_HOME_DATA.room}"]`);
  if (startPanel) startPanel.classList.add("is-active");
}

function createLivingRoomPanel() {
  return `
    <section class="room-panel" data-room="Living Room">
      <section class="widget-grid">
        <section class="widget-col left">
          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <div class="row space-between align-start">
              <div>
                <h1>Liquid Glass Smart Home</h1>
                <p class="muted">Premium control panel for homelab devices</p>
              </div>
              <div class="clock-block">
                <strong id="clock-time">--:--:--</strong>
                <span id="clock-date" class="muted">--</span>
              </div>
            </div>
            <ul class="stats-list">
              <li><span>CPU</span><strong id="cpu-value">-- %</strong></li>
              <li><span>RAM</span><strong id="ram-value">-- %</strong></li>
              <li><span>Disk</span><strong id="disk-value">-- %</strong></li>
              <li><span>Uptime</span><strong id="uptime-value">--</strong></li>
            </ul>
            <p id="error-message" class="error" role="alert"></p>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Weather</h2>
            <div class="row space-between align-center weather-main">
              <p class="temp"><span id="weather-temp">23</span>&deg;C</p>
              <i class="fa-solid fa-cloud-sun weather-icon"></i>
            </div>
            <div class="chip-grid">
              <div class="chip">Humidity: <strong id="weather-humidity">88%</strong></div>
              <div class="chip">Wind: <strong id="weather-wind">13 km/h</strong></div>
            </div>
            <div id="forecast-list" class="forecast-grid"></div>
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

          <article class="widget-card glass interactive intro-item home-intel" data-depth="1.15">
            <h2>Home Intelligence</h2>
            <div class="intel-chart-wrap">
              <svg class="intel-chart" viewBox="0 0 320 120" role="img" aria-label="Energy usage chart">
                <polyline class="intel-grid-line" points="0,20 320,20"></polyline>
                <polyline class="intel-grid-line" points="0,60 320,60"></polyline>
                <polyline class="intel-grid-line" points="0,100 320,100"></polyline>
                <polyline class="intel-area" points="0,105 24,92 48,96 72,70 96,74 120,56 144,62 168,48 192,57 216,38 240,42 264,26 288,34 312,18 320,20 320,120 0,120"></polyline>
                <polyline class="intel-line" points="0,105 24,92 48,96 72,70 96,74 120,56 144,62 168,48 192,57 216,38 240,42 264,26 288,34 312,18"></polyline>
              </svg>
            </div>

            <div class="intel-actions">
              <button class="scene-btn ripple" type="button">Sleep</button>
              <button class="scene-btn ripple" type="button">Away</button>
              <button class="scene-btn ripple" type="button">Security</button>
            </div>

            <p class="intel-note">All systems normal - 12 devices connected</p>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.05">
            <h2>Energy Monitoring</h2>
            <div class="meter">
              <div class="meter-bar"><span style="width: 62%"></span></div>
              <div class="meter-row"><span>Today</span><strong>12.4 kWh</strong></div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>Quick Scenes</h2>
            <div class="scene-grid">
              <button class="scene-btn ripple" type="button">Relax</button>
              <button class="scene-btn ripple" type="button">Cinema</button>
              <button class="scene-btn ripple" type="button">Focus</button>
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
            <h2>Water Temperature</h2>
            <div class="slider-row">
              <input class="range" type="range" min="30" max="42" value="37" />
              <span class="range-value">37&deg;C</span>
            </div>
          </article>
        </section>

        <section class="widget-col center">
          <article class="widget-card glass interactive intro-item" data-depth="1.3">
            <h2>Humidity Control</h2>
            <div class="meter">
              <div class="meter-bar"><span style="width: 58%"></span></div>
              <div class="meter-row"><span>Ventilation</span><strong>58%</strong></div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.2">
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
              <button class="scene-btn ripple" type="button">Spa</button>
              <button class="scene-btn ripple" type="button">Clean</button>
              <button class="scene-btn ripple" type="button">Quick Dry</button>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.0">
            <h2>Mirror Display</h2>
            <p class="muted">Weather, news, and daily tasks synced.</p>
            <div class="chip-grid">
              <div class="chip">UV Index: 3</div>
              <div class="chip">Air Quality: Good</div>
            </div>
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
            <h2>Countertop Lighting</h2>
            <input class="range" type="range" min="0" max="100" value="68" />
          </article>
        </section>

        <section class="widget-col center">
          <article class="widget-card glass interactive intro-item" data-depth="1.3">
            <h2>Oven Timer</h2>
            <div class="dial">
              <div class="dial-center">25:00</div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h2>Smart Coffee</h2>
            <button class="scene-btn ripple">Brew Now</button>
            <div class="slider-row">
              <input class="range" type="range" min="1" max="5" value="3" />
              <span class="range-value">Intensity 3</span>
            </div>
          </article>
        </section>

        <section class="widget-col right">
          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Fridge Inventory</h2>
            <div class="meter">
              <div class="meter-bar"><span style="width: 74%"></span></div>
              <div class="meter-row"><span>Stock Level</span><strong>74%</strong></div>
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
            <p class="muted">Rest & recovery analytics</p>
            <div class="sleep-chart">
              <div class="sleep-bar" style="height: 40%"></div>
              <div class="sleep-bar" style="height: 70%"></div>
              <div class="sleep-bar" style="height: 55%"></div>
              <div class="sleep-bar" style="height: 80%"></div>
              <div class="sleep-bar" style="height: 60%"></div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Curtain Control</h2>
            <div class="vertical-slider">
              <div class="vertical-track"><span style="height: 55%"></span></div>
            </div>
          </article>
        </section>

        <section class="widget-col center">
          <article class="widget-card glass interactive intro-item" data-depth="1.3">
            <h2>Alarm Clock</h2>
            <div class="dial">
              <div class="dial-center">06:30</div>
            </div>
          </article>
        </section>

        <section class="widget-col right">
          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Sunrise Simulation</h2>
            <div class="switch-item">
              <span>Enabled</span>
              <button class="switch ripple" data-key="sunrise" type="button" role="switch" aria-checked="false"></button>
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
            <div class="meter">
              <div class="meter-bar"><span style="width: 72%"></span></div>
              <div class="meter-row"><span>CPU</span><strong>72%</strong></div>
            </div>
            <div class="meter mt-sm">
              <div class="meter-bar"><span style="width: 64%"></span></div>
              <div class="meter-row"><span>GPU</span><strong>64%</strong></div>
            </div>
          </article>
        </section>

        <section class="widget-col center">
          <article class="widget-card glass interactive intro-item" data-depth="1.3">
            <h2>RGB Sync</h2>
            <input class="color-wheel" type="color" value="#ff66cc" />
            <div class="chip-grid mt-sm">
              <div class="chip">Zone A</div>
              <div class="chip">Zone B</div>
            </div>
          </article>

          <article class="widget-card glass interactive intro-item" data-depth="1.2">
            <h2>Sound System</h2>
            <div class="equalizer">
              ${Array.from({ length: 12 }).map((_, i) => `<span class="eq-bar" style="--h:${40 + i * 3}%"></span>`).join("")}
            </div>
          </article>
        </section>

        <section class="widget-col right">
          <article class="widget-card glass interactive intro-item" data-depth="1.1">
            <h2>Stream Mode</h2>
            <button class="scene-btn ripple" data-key="streamMode" type="button">Activate</button>
            <p class="muted mt-sm">Optimizes lighting, audio, and capture.</p>
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
