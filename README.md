# JusteWatt

La juste puissance solaire : dimensionnement, simulation, comparaison de devis et rentabilité.

**Application : https://eric-d.github.io/JusteWatt/**

Application web 100 % navigateur. Elle rejoue chaque heure de votre dernière année de consommation avec la
météo réelle de votre toit, pour chaque configuration de panneaux et de batterie.

- **Sources** : Home Assistant (jeton longue durée, lecture du tableau Énergie), CSV Enedis (courbe de charge
  30 min ou journalier), factures mensuelles, ou données de démonstration.
- **Fusion** : volume officiel Enedis, forme horaire mesurée (Home Assistant ou courbe Enedis), mois par mois.
- **Toit** : adresse (IGN), plusieurs pans, masque d'horizon calculé depuis le relief (Copernicus 90 m).
- **Production** : irradiance horaire Open-Meteo, modèle calé sur PVGIS ; incertitude sur plusieurs années météo.
- **Simulation** : solaire direct → appareils pilotés par priorité (cumulus, voiture, piscine) → batterie
  (rendement, profondeur de décharge, réserve, veille, recharge réseau en heures creuses) → réseau ;
  écrêtage onduleur.
- **Tarifs** : Base, Heures creuses, Tempo (calendrier estimé), comparateur d'options.
- **Finance** : inflation, dégradation, remplacements, prime, revente, VAN, TRI, retour en années décimales.
- **Écrans** : simulateur, carte des combinaisons, comparateur de devis, démarches (France), partage par lien,
  export JSON, impression PDF, mode sombre, hors ligne (PWA).

Aucune donnée de consommation n'est envoyée à un serveur. Météo : [Open-Meteo](https://open-meteo.com/)
(CC BY 4.0, usage non commercial).

## Développement

```sh
pnpm install
pnpm dev
pnpm vitest run --project server   # moteur et calculs (rapide)
pnpm vitest run                     # + composants dans le navigateur
pnpm exec playwright test           # parcours de bout en bout (API simulées)
pnpm lint && pnpm check
```

## Structure

- `src/lib/engine/` — moteur pur TypeScript : `simulate`, `fusion`, `pv`, `sun`, `horizon`, `tariffs`,
  `evolutions`, `finance`.
- `src/lib/sources/` — Home Assistant (websocket), CSV Enedis, profil type, démonstration.
- `src/lib/rules/` — règles par pays (`fr.ts`) : tarifs, revente, prime, TVA, démarches, avec dates de validité.
- `src/lib/app/` — état sauvegardé sur l'appareil, chargement des données, calculs (Web Worker), partage.
- `tests/fixtures/` — année **synthétique** et moteur Python de référence (`reference.py`) :
  `simulate.test.ts` vérifie la parité au kWh près.
- `tests/e2e/` — parcours Playwright avec Open-Meteo et géocodage simulés.

## Déploiement

GitHub Pages via GitHub Actions (`.github/workflows/pages.yml`), sans secret : tests, build statique
(`BASE_PATH=/<dépôt>`, fallback SPA `404.html`), publication.
