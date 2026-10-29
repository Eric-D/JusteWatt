import type { Device } from './types';

/** Changements prévus dans le foyer, ajoutés à la consommation mesurée. */
export type Evolution =
	| {
			id: string;
			kind: 've';
			kmPerYear: number;
			kwhPer100km: number;
			mode: 'soir' | 'nuit' | 'midi';
			power: number;
	  }
	| { id: string; kind: 'pac'; kwhPerYear: number }
	| { id: string; kind: 'clim'; kwhPerYear: number }
	| { id: string; kind: 'piscine'; kwhPerDay: number; power: number }
	| { id: string; kind: 'autre'; label: string; kwhPerYear: number };

export const EVOLUTION_LABELS: Record<Evolution['kind'], string> = {
	ve: 'Voiture électrique',
	pac: 'Pompe à chaleur',
	clim: 'Climatisation',
	piscine: 'Piscine',
	autre: 'Autre usage'
};

export interface EvolutionInput {
	localHour: number[];
	localDay: string[];
	/** Température extérieure par pas, °C. */
	temp: ArrayLike<number>;
}

export interface EvolutionResult {
	/** Consommation ajoutée par pas, kWh (appareils pilotés compris). */
	extra: Float64Array;
	/** Nouveaux appareils pilotables sur le surplus. */
	devices: Device[];
	/** Total annuel par évolution, kWh. */
	totals: Record<string, number>;
}

/** Répartit `total` kWh proportionnellement à `weights`. */
function spread(
	total: number,
	weights: ArrayLike<number>,
	into: Float64Array,
	keep?: Float64Array
) {
	let w = 0;
	for (let i = 0; i < weights.length; i++) w += weights[i];
	if (w <= 0) return;
	for (let i = 0; i < weights.length; i++) {
		const v = (total * weights[i]) / w;
		into[i] += v;
		if (keep) keep[i] += v;
	}
}

export function applyEvolutions(input: EvolutionInput, evolutions: Evolution[]): EvolutionResult {
	const n = input.localHour.length;
	const extra = new Float64Array(n);
	const devices: Device[] = [];
	const totals: Record<string, number> = {};
	const days = new Set(input.localDay).size || 1;
	const scale = days / 365; // la série peut ne pas couvrir une année entière

	for (const e of evolutions) {
		const w = new Float64Array(n);
		let total: number;
		if (e.kind === 've') {
			total = ((e.kmPerYear * e.kwhPer100km) / 100) * scale;
			const hours =
				e.mode === 'nuit' ? [0, 1, 2, 3, 4, 5] : e.mode === 'soir' ? [19, 20, 21, 22] : [20];
			for (let i = 0; i < n; i++) if (hours.includes(input.localHour[i])) w[i] = 1;
			if (e.mode === 'midi') {
				const profile = new Float64Array(n);
				spread(total, w, extra, profile);
				devices.push({ name: 'Voiture', power: e.power, fallbackHour: 20, profile });
				totals[e.id] = total;
				continue;
			}
		} else if (e.kind === 'pac') {
			total = e.kwhPerYear * scale;
			for (let i = 0; i < n; i++) w[i] = Math.max(0, 16 - input.temp[i]);
		} else if (e.kind === 'clim') {
			total = e.kwhPerYear * scale;
			for (let i = 0; i < n; i++)
				if (input.localHour[i] >= 12 && input.localHour[i] <= 22)
					w[i] = Math.max(0, input.temp[i] - 24);
		} else if (e.kind === 'piscine') {
			const profile = new Float64Array(n);
			for (let i = 0; i < n; i++) {
				const m = Number(input.localDay[i].slice(5, 7));
				const h = input.localHour[i];
				if (m >= 5 && m <= 9 && h >= 10 && h < 18) w[i] = 1;
			}
			const summerDays = new Set(
				input.localDay.filter((d) => {
					const m = Number(d.slice(5, 7));
					return m >= 5 && m <= 9;
				})
			).size;
			total = e.kwhPerDay * summerDays;
			spread(total, w, extra, profile);
			devices.push({ name: 'Piscine', power: e.power, fallbackHour: 18, profile });
			totals[e.id] = total;
			continue;
		} else {
			total = e.kwhPerYear * scale;
			w.fill(1);
		}
		spread(total, w, extra);
		totals[e.id] = total;
	}
	return { extra, devices, totals };
}
