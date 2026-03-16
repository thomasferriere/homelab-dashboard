# Liquid Glass Smart Home

Interface Smart Home immersive en style **Glassmorphism / Spatial UI**, construite avec **FastAPI + HTML/CSS/JS Vanilla**.

Le dashboard combine :
- Statistiques serveur réelles (CPU, RAM, disque, uptime)
- Widgets domotiques interactifs (thermostat, Smart TV, LED, toggles)
- Design premium responsive desktop/tablette/mobile

## Aperçu

Le projet propose une expérience type "VisionOS" :
- cartes flottantes en verre dépoli,
- micro-interactions fluides,
- composants interactifs pilotés par un état central.

## Fonctionnalités

- Interface **Full Responsive** (3 colonnes desktop, 2 colonnes tablette, 1 colonne mobile)
- Effet **Liquid Glass** (`backdrop-filter`, transparence, bordures fines)
- Widgets interactifs :
  - Thermostat circulaire (drag/touch/keyboard)
  - Slider de progression musique draggable
  - Slider de couleur LED tactile
  - Switches style iOS
- Micro-interactions : hover glow, scale subtil, ripple au clic
- Horloge temps réel
- Persistance locale via `localStorage`
- État central réactif : `SMART_HOME_DATA`
- Data binding automatique (modifie `SMART_HOME_DATA` => UI se met à jour)
- **Glass Engine** : panneau de réglage blur/opacité/saturation en temps réel
- **Parallax Spatial** : profondeur 3D des widgets via `requestAnimationFrame`
- **Undo / Redo** : `Ctrl+Z` / `Ctrl+Y` sur les changements utilisateur
- **Staggered entrance** : apparition progressive des widgets au chargement

## Stack Technique

- Backend : FastAPI (`/api/stats`)
- Frontend : HTML5 / CSS3 moderne / JavaScript Vanilla
- Icônes : Font Awesome CDN

## Structure du projet

```text
app/
  main.py
  system_stats.py
  static/
    index.html
    style.css
    app.js
requirements.txt
README.md
```

## Démarrage rapide

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Ouvre ensuite : `http://127.0.0.1:8000`

## Architecture Frontend (GitHub Ready)

- **Data Layer** : objet central `SMART_HOME_DATA` (réactif via `Proxy`)
- **Persistence Layer** : `localStorage` (`liquid_glass_smart_home_v1`)
- **UI Layer** : fonctions `render*` dédiées
- **Controllers** : thermostat, sliders, ripple, switches, clock

## Comment personnaliser vos propres icônes et images

1. Changer le fond principal :
   - Fichier : `app/static/style.css`
   - Zone : `body { background-image: ... }`
   - Les fonds par pièce utilisent aussi des URLs Unsplash (`body.home-bg`, `body.living-bg`, etc.)

2. Changer les images widgets (caméra, album art) :
   - Fichier : `app/static/style.css`
   - Classes : `.camera-frame`, `.cover`

3. Changer les icônes :
   - Fichier : `app/static/index.html`
   - Remplacer les classes Font Awesome (ex: `fa-house`, `fa-calendar`)

4. Re-thémer rapidement l’interface :
   - Fichier : `app/static/style.css`
   - Modifier en priorité ces 3 variables :
     - `--theme-hue`
     - `--theme-sat`
     - `--theme-light`

## Notes de maintenance

- La plupart des interactions sont dans `app/static/app.js`
- Les fonctions de géométrie (thermostat/sliders) sont documentées en JSDoc
- `updateGlassTheme(blur, opacity, saturation)` est exposée globalement pour tests rapides
- Tu peux simuler une mise à jour temps réel depuis la console :

```js
SMART_HOME_DATA.hvac.temperatureC = 21;
SMART_HOME_DATA.switches.wifi = false;
SMART_HOME_DATA.led.intensity = 85;
```

## Roadmap possible

- Remplacer polling `/api/stats` par WebSocket
- Connecter les widgets à Home Assistant / MQTT
- Ajouter tests UI (Playwright) + linting ESLint/Stylelint
