# Homelab Dashboard (FastAPI)

Petit dashboard minimaliste pour afficher l'état d'un serveur Debian.

Le projet propose deux modes :
- **Mode réel (privé)** : lit les vraies statistiques de la machine
- **Mode démo (public)** : affiche des données simulées

## Fonctionnalités

- Dashboard unique avec 4 cartes : CPU, RAM, disque, uptime
- Endpoint API réel : `GET /api/stats`
- Endpoint API démo : `GET /api/demo`
- Bascule simple entre mode réel et mode démo dans l'interface
- Rafraîchissement automatique toutes les 5 secondes
- Interface sobre, responsive et facile à lire

## Stack

- Backend : Python + FastAPI
- Collecte stats système : `psutil`
- Frontend : HTML, CSS, JavaScript natif

## Installation

Prérequis : Python 3.10+ recommandé.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Lancer le projet

```bash
uvicorn app.main:app --reload
```

Puis ouvrir : `http://127.0.0.1:8000`

## Mode réel vs mode démo

- **Mode réel** : bouton sur "Mode réel", frontend appelle `GET /api/stats`
- **Mode démo** : bouton sur "Mode démo", frontend appelle `GET /api/demo`

Le mode démo est utile pour publier le projet sur GitHub sans exposer les vraies métriques d'un serveur.

## Captures (à ajouter)

Tu peux ajouter plus tard :
- `docs/screenshot-real.png`
- `docs/screenshot-demo.png`

## Améliorations futures

- Ajouter un graphique simple d'historique CPU/RAM (client-side)
- Ajouter la température CPU si disponible
- Ajouter un fichier de configuration pour l'intervalle de rafraîchissement
