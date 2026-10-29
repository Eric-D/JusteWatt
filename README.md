# JusteWatt

La juste puissance solaire : dimensionnement, simulation, comparaison de devis et rentabilité.

Application web (100 % navigateur) pour dimensionner panneaux photovoltaïques et batterie
à partir de la consommation réelle lue dans Home Assistant et des relevés Enedis.

- Aucune donnée n'est envoyée à un serveur : Home Assistant (websocket/OAuth) et Open-Meteo
  sont appelés directement depuis le navigateur.
- Météo : [Open-Meteo](https://open-meteo.com/) (CC BY 4.0, usage non commercial).

## Développement

```sh
pnpm install
pnpm dev
pnpm vitest run --project server   # moteur (rapide)
pnpm test                           # tout : unitaires, composants, e2e
pnpm lint && pnpm check
```

## Structure

- `src/lib/engine/` — moteur pur TypeScript, sans dépendance à l'interface :
  - `simulate.ts` : rejeu pas à pas (solaire direct → routeur → batterie → réseau) ;
  - `fusion.ts` : volume Enedis + forme horaire Home Assistant ;
  - `pv.ts` : production à partir de l'irradiance Open-Meteo (calée sur PVGIS) ;
  - `finance.ts` : retour, gain net, VAN, TRI.
- `tests/fixtures/` — année **synthétique** (aucune mesure réelle) et moteur Python de référence
  (`reference.py`, stdlib seule). `simulate.test.ts` vérifie la parité au kWh près avec ce script.

## Déploiement

GitHub Pages via GitHub Actions (`.github/workflows/pages.yml`), sans secret :
tests, puis build statique (`BASE_PATH=/<dépôt>`, fallback SPA `404.html`), puis publication.
Une seule fois : _Settings → Pages → Source : GitHub Actions_.
