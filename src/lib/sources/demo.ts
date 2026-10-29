import type { HourSample } from '#lib/engine/fusion.js';
import { localParts } from '#lib/engine/time.js';

/** Lieu de démonstration (centre de Lyon). */
export const DEMO_SITE = {
	name: 'Démonstration · Lyon',
	latitude: 45.75,
	longitude: 4.85,
	elevation: 170
};

/**
 * Consommation fictive d'une maison (≈ 9 000 kWh/an, cumulus à 21 h), générée
 * de façon déterministe : mêmes valeurs à chaque chargement.
 */
export function demoHours(startMs: number, endMs: number, tz: string): Map<number, HourSample> {
	const shape = [
		0.3, 0.25, 0.25, 0.25, 0.25, 0.3, 0.6, 0.9, 0.7, 0.5, 0.45, 0.5, 0.6, 0.5, 0.45, 0.45, 0.55,
		0.8, 1.1, 1.2, 1.0, 0.8, 0.6, 0.4
	];
	let seed = 20250101;
	const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
	const out = new Map<number, HourSample>();
	for (let t = startMs; t < endMs; t += 3_600_000) {
		const { day, hour } = localParts(t, tz);
		const doy = (Date.parse(day) - Date.parse(day.slice(0, 4) + '-01-01')) / 86_400_000;
		const winter = 0.5 + 0.5 * Math.cos((2 * Math.PI * (doy - 15)) / 365);
		const pilotable = hour === 21 ? 1.4 : hour === 22 ? 0.6 : 0;
		const load = shape[hour] * (0.8 + 0.4 * rnd()) + 1.1 * winter * (0.6 + 0.4 * rnd()) + pilotable;
		out.set(t, { load, pilotable });
	}
	return out;
}
