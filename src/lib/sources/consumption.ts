import { fuse, type HourSample, type MonthReport } from '#lib/engine/fusion.js';
import { localParts } from '#lib/engine/time.js';
import { typicalProfile } from './profile';

/** Année de consommation reconstruite heure par heure. */
export interface Consumption {
	tz: string;
	steps: number[];
	localHour: number[];
	localDay: string[];
	load: number[];
	pilotable: number[];
	months: MonthReport[];
	/** Sources utilisées, pour l'affichage. */
	sources: string[];
	/** Appareils mesurés à part (tableau Énergie de HA), kWh par pas, NaN quand non mesuré. */
	devices?: MeasuredDevice[];
}

export interface MeasuredDevice {
	name: string;
	kwh: number[];
}

/** Minuit local du 1er jour du mois `m` (1-12), en UTC ms. */
export function monthStart(y: number, m: number, tz: string): number {
	const base = Date.UTC(y, m - 1, 1);
	for (let h = -14; h <= 14; h++) {
		const t = base + h * 3_600_000;
		const p = localParts(t, tz);
		if (p.hour === 0 && p.day === `${y}-${String(m).padStart(2, '0')}-01`) return t;
	}
	return base;
}

/** Douze mois complets se terminant avant le mois `endMonth` (AAAA-MM, exclu). */
export function yearBefore(endMonth: string, tz: string): { startMs: number; endMs: number } {
	const [y, m] = endMonth.split('-').map(Number);
	return { startMs: monthStart(y - 1, m, tz), endMs: monthStart(y, m, tz) };
}

/** Mois en cours (AAAA-MM), utilisé comme borne exclue par défaut. */
export function currentMonth(tz: string, now = Date.now()): string {
	return localParts(now, tz).day.slice(0, 7);
}

export interface BuildInput {
	tz: string;
	startMs: number;
	endMs: number;
	/** Mesures horaires (courbe Enedis prioritaire, puis HA). */
	curve?: Map<number, number>;
	ha?: Map<number, HourSample>;
	/** Volumes mensuels officiels (Enedis), kWh. */
	monthly?: Record<string, number>;
}

/** Volume Enedis (si présent) + forme horaire mesurée (courbe Enedis, sinon HA, sinon profil type). */
export function buildConsumption(input: BuildInput): Consumption {
	const shape = new Map<number, HourSample>();
	for (const [t, s] of input.ha ?? []) shape.set(t, s);
	for (const [t, kwh] of input.curve ?? []) {
		const h = input.ha?.get(t);
		shape.set(t, { load: kwh, pilotable: h ? Math.min(h.pilotable, kwh) : 0 });
	}
	const monthly = { ...(input.monthly ?? {}) };
	const r = fuse({
		tz: input.tz,
		startMs: input.startMs,
		endMs: input.endMs,
		enedisMonthly: monthly,
		ha: shape,
		fallback: typicalProfile
	});
	const sources = [];
	if (input.curve?.size) sources.push('Courbe Enedis');
	if (input.monthly && Object.keys(input.monthly).length) sources.push('Volumes Enedis');
	if (input.ha?.size) sources.push('Home Assistant');
	return {
		tz: input.tz,
		steps: r.steps,
		localHour: r.localHour,
		localDay: r.localDay,
		load: r.load,
		pilotable: r.pilotable,
		months: r.months,
		sources
	};
}
