import { hourlySteps, localParts } from './time';

export interface HourSample {
	load: number;
	pilotable: number;
}

export type MonthMethod = 'ha' | 'borrowed' | 'excluded';

export interface MonthReport {
	month: string;
	enedis: number;
	/** Part des heures mesurées par HA (0-1). */
	coverage: number;
	/** Rapport Enedis ÷ HA (sur les heures mesurées extrapolées au mois). */
	factor: number | null;
	method: MonthMethod;
}

export interface FusionInput {
	tz: string;
	startMs: number;
	endMs: number;
	/** Consommation mensuelle officielle, clé AAAA-MM (mois local). */
	enedisMonthly: Record<string, number>;
	/** Mesures HA par heure UTC (ms). */
	ha: Map<number, HourSample>;
	/** Plage de facteur acceptée pour utiliser la forme HA d'un mois. */
	factorRange?: [number, number];
	/** Couverture minimale pour juger le facteur d'un mois. */
	minCoverage?: number;
}

export interface FusionResult {
	steps: number[];
	localHour: number[];
	localDay: string[];
	load: number[];
	pilotable: number[];
	months: MonthReport[];
}

/**
 * Volume = Enedis, forme = HA.
 * Chaque mois est recalé pour que son total égale exactement le relevé Enedis ;
 * les heures sans mesure HA reprennent le profil moyen (mois, heure) le plus proche.
 */
export function fuse(input: FusionInput): FusionResult {
	const [fmin, fmax] = input.factorRange ?? [0.9, 1.1];
	const minCov = input.minCoverage ?? 0.9;
	const steps = hourlySteps(input.startMs, input.endMs);
	const parts = steps.map((t) => localParts(t, input.tz));
	const monthOf = (i: number) => parts[i].day.slice(0, 7);

	const byMonth = new Map<string, number[]>();
	steps.forEach((_, i) => {
		const m = monthOf(i);
		if (!byMonth.has(m)) byMonth.set(m, []);
		byMonth.get(m)!.push(i);
	});

	// 1. diagnostic de chaque mois
	const months: MonthReport[] = [];
	for (const [m, idx] of byMonth) {
		const measured = idx.filter((i) => input.ha.has(steps[i]));
		const coverage = measured.length / idx.length;
		const enedis = input.enedisMonthly[m] ?? NaN;
		let factor: number | null = null;
		if (measured.length) {
			const sum = measured.reduce((s, i) => s + input.ha.get(steps[i])!.load, 0);
			factor = sum > 0 ? enedis / ((sum * idx.length) / measured.length) : null;
		}
		const suspicious = coverage >= minCov && factor !== null && (factor < fmin || factor > fmax);
		months.push({
			month: m,
			enedis,
			coverage,
			factor,
			method: suspicious ? 'excluded' : coverage > 0 ? 'ha' : 'borrowed'
		});
	}
	const excluded = new Set(months.filter((x) => x.method === 'excluded').map((x) => x.month));

	// 2. profil moyen (mois de l'année × heure locale) à partir des mois sains
	const acc = Array.from({ length: 12 }, () =>
		Array.from({ length: 24 }, () => ({ load: 0, pil: 0, n: 0 }))
	);
	steps.forEach((t, i) => {
		const s = input.ha.get(t);
		if (!s || excluded.has(monthOf(i))) return;
		const c = acc[Number(monthOf(i).slice(5)) - 1][parts[i].hour];
		c.load += s.load;
		c.pil += s.pilotable;
		c.n++;
	});
	const hasData = acc.map((h) => h.some((c) => c.n > 0));
	const profile = (monthIdx: number, hour: number) => {
		// mois disponible le plus proche (écart circulaire)
		let best = -1;
		for (let d = 0; d < 7 && best < 0; d++)
			for (const k of [monthIdx - d, monthIdx + d]) {
				const mm = (k + 12) % 12;
				if (hasData[mm]) {
					best = mm;
					break;
				}
			}
		if (best < 0) return { load: 1, pil: 0 };
		const c = acc[best][hour];
		return c.n ? { load: c.load / c.n, pil: c.pil / c.n } : { load: 0, pil: 0 };
	};

	// 3. série brute puis recalage mensuel sur Enedis
	const load = new Array<number>(steps.length);
	const pilotable = new Array<number>(steps.length);
	for (const rep of months) {
		const idx = byMonth.get(rep.month)!;
		const mIdx = Number(rep.month.slice(5)) - 1;
		const useHa = rep.method === 'ha';
		let total = 0;
		for (const i of idx) {
			const s = useHa ? input.ha.get(steps[i]) : undefined;
			const v = s ? { load: s.load, pil: s.pilotable } : profile(mIdx, parts[i].hour);
			load[i] = v.load;
			pilotable[i] = v.pil;
			total += v.load;
		}
		const k = Number.isFinite(rep.enedis) && total > 0 ? rep.enedis / total : 1;
		for (const i of idx) {
			load[i] *= k;
			pilotable[i] = Math.min(pilotable[i] * k, load[i]);
		}
	}

	return {
		steps,
		localHour: parts.map((p) => p.hour),
		localDay: parts.map((p) => p.day),
		load,
		pilotable,
		months
	};
}
