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

const THEMES = [
  { name: "Frost", hue: 212, sat: 40, light: 16, blur: 28, opacity: 9, saturation: 170 },
  { name: "Smoke", hue: 220, sat: 22, light: 12, blur: 24, opacity: 12, saturation: 145 },
  { name: "Liquid", hue: 196, sat: 55, light: 18, blur: 32, opacity: 7, saturation: 190 },
];

let historyMuted = false;
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
  saveState(SMART_HOME_DATA);
  renderAll();
});

window.SMART_HOME_DATA = SMART_HOME_DATA;

const dom = {
  root: document.documentElement,
  body: document.body,
  appShell: document.querySelector(".app-shell"),
  widgetGrid: document.querySelector(".widget-grid"),
  cards: [...document.querySelectorAll(".widget-card")],
  pills: [...document.querySelectorAll(".pill")],
  iconButtons: [...document.querySelectorAll(".icon-btn")],
  switches: [...document.querySelectorAll(".switch[data-key]")],
  clockTime: document.getElementById("clock-time"),
  clockDate: document.getElementById("clock-date"),
  cpu: document.getElementById("cpu-value"),
  ram: document.getElementById("ram-value"),
  disk: document.getElementById("disk-value"),
  uptime: document.getElementById("uptime-value"),
  error: document.getElementById("error-message"),
  weatherTemp: document.getElementById("weather-temp"),
  weatherHumidity: document.getElementById("weather-humidity"),
  weatherWind: document.getElementById("weather-wind"),
  forecastList: document.getElementById("forecast-list"),
  trackTitle: document.getElementById("track-title"),
  trackArtist: document.getElementById("track-artist"),
  playBtn: document.getElementById("play-btn"),
  musicProgress: document.getElementById("music-progress"),
  musicFill: document.getElementById("music-fill"),
  musicThumb: document.getElementById("music-thumb"),
  thermo: document.getElementById("thermo"),
  thermoKnob: document.getElementById("thermo-knob"),
  thermoReflection: document.getElementById("thermo-reflection"),
  thermoValue: document.getElementById("thermo-value"),
  ledTrack: document.getElementById("led-track"),
  ledThumb: document.getElementById("led-thumb"),
  ledPreview: document.getElementById("led-preview"),
  glassToggle: document.getElementById("glass-toggle"),
  glassPanel: document.getElementById("glass-panel"),
  glassBlur: document.getElementById("glass-blur"),
  glassOpacity: document.getElementById("glass-opacity"),
  glassSat: document.getElementById("glass-sat"),
  randomThemeBtn: document.getElementById("random-theme-btn"),
};

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
    hvac: {
      temperatureC: SMART_HOME_DATA.hvac.temperatureC,
    },
    led: {
      intensity: SMART_HOME_DATA.led.intensity,
    },
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

/**
 * Thermostat conversion: map full circle angle to 10..32C.
 * @param {number} angleDeg
 * @returns {number}
 */
function angleToTemperature(angleDeg) {
  return Math.round(clamp(10 + (angleDeg / 360) * 22, 10, 32));
}

/**
 * Compute knob position for a circular slider.
 * @param {HTMLElement} circleEl
 * @param {number} temperatureC
 * @returns {{x:number,y:number}}
 */
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
  const now = new Date();
  dom.clockTime.textContent = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  dom.clockDate.textContent = now.toLocaleDateString("fr-FR", {
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
  dom.switches.forEach((sw) => {
    const key = sw.dataset.key;
    const isOn = Boolean(SMART_HOME_DATA.switches[key]);
    sw.classList.toggle("is-on", isOn);
    sw.setAttribute("aria-pressed", String(isOn));
  });
}

function renderStats() {
  const { cpu, ram, disk, uptime, error } = SMART_HOME_DATA.stats;
  dom.cpu.textContent = cpu == null ? "-- %" : `${cpu} %`;
  dom.ram.textContent = ram == null ? "-- %" : `${ram} %`;
  dom.disk.textContent = disk == null ? "-- %" : `${disk} %`;
  dom.uptime.textContent = uptime == null ? "--" : formatUptime(uptime);
  dom.error.textContent = error || "";
}

function renderWeather() {
  const w = SMART_HOME_DATA.weather;
  dom.weatherTemp.textContent = String(w.tempC);
  dom.weatherHumidity.textContent = `${w.humidity}%`;
  dom.weatherWind.textContent = `${w.windKmh} km/h`;
  dom.forecastList.innerHTML = "";
  w.forecast.forEach((f) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = `${f.day} ${f.temp}`;
    dom.forecastList.appendChild(chip);
  });
}

function renderMusic() {
  const m = SMART_HOME_DATA.music;
  dom.trackTitle.textContent = m.title;
  dom.trackArtist.textContent = m.artist;
  dom.playBtn.innerHTML = m.isPlaying
    ? '<i class="fa-solid fa-pause"></i>'
    : '<i class="fa-solid fa-play"></i>';
  dom.musicFill.style.width = `${m.progress}%`;
  dom.musicThumb.style.left = `${m.progress}%`;
  dom.musicProgress.setAttribute("aria-valuenow", String(Math.round(m.progress)));
}

function renderThermostat() {
  const temp = SMART_HOME_DATA.hvac.temperatureC;
  const { x, y } = temperatureToKnobPosition(dom.thermo, temp);
  dom.thermoKnob.style.left = `${x}px`;
  dom.thermoKnob.style.top = `${y}px`;
  dom.thermoValue.textContent = String(temp);
  dom.thermo.setAttribute("aria-valuenow", String(temp));

  const normalized = (temp - 10) / 22;
  const angle = normalized * 360;
  const glow = 0.52 + normalized * 0.4;
  dom.thermoReflection.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(-4.4rem)`;
  dom.thermoReflection.style.opacity = String(glow);
}

function renderLed() {
  const intensity = SMART_HOME_DATA.led.intensity;
  dom.ledThumb.style.left = `${intensity}%`;
  dom.ledTrack.setAttribute("aria-valuenow", String(Math.round(intensity)));
  const hue = (intensity / 100) * 360;
  const color = `hsl(${hue}deg 92% 68%)`;
  dom.root.style.setProperty("--led-color", color);
  dom.ledPreview.style.background = `linear-gradient(90deg, ${color}, rgba(255,255,255,0.65))`;
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
    el.addEventListener("pointerdown", (event) => {
      applyRippleEvent(el, event);
    });
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
      SMART_HOME_DATA.room = pill.dataset.room;
    });
  });

  dom.iconButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      dom.iconButtons.forEach((x) => x.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  dom.switches.forEach((sw) => {
    sw.addEventListener("click", () => {
      pushHistory();
      const key = sw.dataset.key;
      SMART_HOME_DATA.switches[key] = !SMART_HOME_DATA.switches[key];
    });
  });

  dom.playBtn.addEventListener("click", () => {
    pushHistory();
    SMART_HOME_DATA.music.isPlaying = !SMART_HOME_DATA.music.isPlaying;
  });

  dom.glassToggle.addEventListener("click", () => {
    const open = dom.glassPanel.classList.toggle("is-open");
    dom.glassToggle.setAttribute("aria-expanded", String(open));
    dom.glassPanel.setAttribute("aria-hidden", String(!open));
  });

  const onGlassInput = () => {
    pushHistory();
    updateGlassTheme(dom.glassBlur.value, dom.glassOpacity.value, dom.glassSat.value);
  };
  dom.glassBlur.addEventListener("change", onGlassInput);
  dom.glassOpacity.addEventListener("change", onGlassInput);
  dom.glassSat.addEventListener("change", onGlassInput);

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

/**
 * Music slider controller with pointer + keyboard support.
 */
function bindMusicSlider() {
  let dragging = false;
  const setFromX = (clientX) => {
    const rect = dom.musicProgress.getBoundingClientRect();
    SMART_HOME_DATA.music.progress = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  dom.musicProgress.addEventListener("pointerdown", (event) => {
    pushHistory();
    dragging = true;
    dom.musicProgress.setPointerCapture(event.pointerId);
    setFromX(event.clientX);
  });
  dom.musicProgress.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    setFromX(event.clientX);
  });
  dom.musicProgress.addEventListener("pointerup", () => {
    dragging = false;
  });
  dom.musicProgress.addEventListener("keydown", (event) => {
    pushHistory();
    if (event.key === "ArrowRight") SMART_HOME_DATA.music.progress = clamp(SMART_HOME_DATA.music.progress + 2, 0, 100);
    if (event.key === "ArrowLeft") SMART_HOME_DATA.music.progress = clamp(SMART_HOME_DATA.music.progress - 2, 0, 100);
  });
}

/**
 * Circular thermostat controller.
 * Uses pointer coordinates and center-based angle math.
 */
function bindThermostat() {
  let dragging = false;

  const setFromPointer = (clientX, clientY) => {
    const rect = dom.thermo.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = pointerToAngle(clientX, clientY, cx, cy);
    const target = angleToTemperature(angle);

    const before = SMART_HOME_DATA.hvac.temperatureC;
    SMART_HOME_DATA.hvac.temperatureC = target;

    animateNumber(before, target, 120, (value) => {
      dom.thermoValue.textContent = String(Math.round(value));
    });
  };

  dom.thermo.addEventListener("pointerdown", (event) => {
    pushHistory();
    dragging = true;
    dom.thermo.setPointerCapture(event.pointerId);
    setFromPointer(event.clientX, event.clientY);
  });

  dom.thermo.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    setFromPointer(event.clientX, event.clientY);
  });

  dom.thermo.addEventListener("pointerup", () => {
    dragging = false;
  });

  dom.thermo.addEventListener("keydown", (event) => {
    pushHistory();
    const before = SMART_HOME_DATA.hvac.temperatureC;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") SMART_HOME_DATA.hvac.temperatureC = clamp(before + 1, 10, 32);
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") SMART_HOME_DATA.hvac.temperatureC = clamp(before - 1, 10, 32);
    animateNumber(before, SMART_HOME_DATA.hvac.temperatureC, 120, (value) => {
      dom.thermoValue.textContent = String(Math.round(value));
    });
  });

  window.addEventListener("resize", renderThermostat);
}

/**
 * LED horizontal slider controller with touch support.
 */
function bindLedSlider() {
  let dragging = false;
  const setFromX = (clientX) => {
    const rect = dom.ledTrack.getBoundingClientRect();
    SMART_HOME_DATA.led.intensity = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  dom.ledTrack.addEventListener("pointerdown", (event) => {
    pushHistory();
    dragging = true;
    dom.ledTrack.setPointerCapture(event.pointerId);
    setFromX(event.clientX);
  });
  dom.ledTrack.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    setFromX(event.clientX);
  });
  dom.ledTrack.addEventListener("pointerup", () => {
    dragging = false;
  });
  dom.ledTrack.addEventListener("keydown", (event) => {
    pushHistory();
    if (event.key === "ArrowRight") SMART_HOME_DATA.led.intensity = clamp(SMART_HOME_DATA.led.intensity + 2, 0, 100);
    if (event.key === "ArrowLeft") SMART_HOME_DATA.led.intensity = clamp(SMART_HOME_DATA.led.intensity - 2, 0, 100);
  });
}

function bindParallax() {
  let raf = 0;
  const maxTilt = 5;

  const apply = (mx, my) => {
    const rect = dom.widgetGrid.getBoundingClientRect();
    const px = (mx - rect.left) / rect.width;
    const py = (my - rect.top) / rect.height;
    const rotateY = (px - 0.5) * maxTilt;
    const rotateX = (0.5 - py) * maxTilt;

    dom.cards.forEach((card) => {
      const depth = Number(card.dataset.depth || 1);
      const rx = rotateX * depth;
      const ry = rotateY * depth;
      const tz = depth * 1.4;
      card.style.transform = `translateZ(${tz}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
  };

  dom.widgetGrid.addEventListener("mousemove", (event) => {
    if (window.matchMedia("(max-width: 768px)").matches) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => apply(event.clientX, event.clientY));
  });

  dom.widgetGrid.addEventListener("mouseleave", () => {
    dom.cards.forEach((card) => {
      card.style.transform = "translateZ(0) rotateX(0) rotateY(0)";
    });
  });
}

async function syncSystemStats() {
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
  dom.cards.forEach((card, index) => {
    card.style.animationDelay = `${80 + index * 70}ms`;
  });
  requestAnimationFrame(() => {
    dom.body.classList.add("ready");
  });
}

function init() {
  renderClock();
  renderAll();
  bindCoreInteractions();
  bindMusicSlider();
  bindThermostat();
  bindLedSlider();
  bindParallax();
  initStaggerEntry();

  setInterval(renderClock, 1000);
  syncSystemStats();
  setInterval(syncSystemStats, STATS_INTERVAL_MS);
  startMusicTicker();
}

init();
