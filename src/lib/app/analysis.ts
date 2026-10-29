import {
	energyCost,
	priceSeries,
	tempoCalendar,
	type Tariff,
	type TariffKind,
	type TempoColor
} from '#lib/engine/tariffs.js';
import type { MonthMethod } from '#lib/engine/fusion.js';
import type { Consumption } from '#lib/sources/consumption.js';

export type Season = 'hiver' | 'printemps' | 'été' | 'automne';
export const SEASONS: Season[] = ['hiver', 'printemps', 'été', 'automne'];
const seasonOf = (month: number): Season =>
	month === 12 || month <= 2 ? 'hiver' : month <= 5 ? 'printemps' : month <= 8 ? 'été' : 'automne';

export interface DayStat {
	day: string;
	kwh: number;
	/** Température moyenne du jour, °C. */
	temp: number;
	weekend: boolean;
	pilotable: number;
	/** Part attribuée au chauffage et à la climatisation (estimation). */
	heating: number;
	cooling: number;
}

export interface MonthStat {
	month: string;
	kwh: number;
	pilotable: number;
	heating: number;
	cooling: number;
	other: number;
	method: MonthMethod | null;
}

/** Sensibilité à la température : y = pente × écart au seuil, au-delà du talon. */
export interface ThermalFit {
	/** Consommation d'un jour sans chauffage ni clim, kWh. */
	baseline: number;
	threshold: number;
	/** kWh par jour et par degré sous (chauffage) ou au-dessus (clim) du seuil. */
	slope: number;
	total: number;
}

export interface TariffCost {
	kind: TariffKind;
	energy: number;
	subscription: number;
	total: number;
}

export interface Analysis {
	total: number;
	days: number;
	perDay: number;
	/** Talon (veille permanente), kW. */
	standby: number;
	standbyKwh: number;
	peak: { kwh: number; day: string; hour: number };
	weekday: number;
	weekend: number;
	/** Parts horaires : heures creuses (du tarif), heures de soleil, nuit 0-6 h. */
	hcShare: number;
	sunShare: number;
	nightShare: number;
	pilotable: number;
	daily: DayStat[];
	monthly: MonthStat[];
	/** Journée moyenne par saison, en semaine et le week-end (kWh par heure). */
	profiles: Record<Season, { weekday: number[]; weekend: number[]; all: number[] }>;
	heating: ThermalFit | null;
	cooling: ThermalFit | null;
	topDays: DayStat[];
	tariffs: TariffCost[];
	/** Consommation des jours rouges Tempo estimés. */
	redDays: { days: number; kwh: number };
	/** Part couverte par les panneaux déjà installés (sans pilotage), si connue. */
	existing: { production: number; direct: number } | null;
}

export interface AnalysisInput {
	cons: Consumption;
	temp: number[];
	pvPerKwc: number[];
	basePv?: number[];
	/** Tarifs à comparer (le tarif actuel de l'utilisateur pour son option). */
	tariffs: Tariff[];
	hcHours: boolean[];
}

const median = (a: number[]) => {
	if (!a.length) return 0;
	const s = [...a].sort((x, y) => x - y);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Ajuste y = pente × max(0, ±(T − seuil)) sur l'excédent au-dessus du talon (moindres carrés). */
function fitThermal(
	days: DayStat[],
	baseline: number,
	thresholds: number[],
	sign: 1 | -1,
	minSlope = 0.3
): ThermalFit | null {
	let best: { threshold: number; slope: number; sse: number } | null = null;
	for (const th of thresholds) {
		let sxy = 0,
			sxx = 0,
			n = 0;
		for (const d of days) {
			const x = Math.max(0, sign * (d.temp - th));
			if (x <= 0) continue;
			sxy += x * (d.kwh - baseline);
			sxx += x * x;
			n++;
		}
		if (n < 15 || sxx === 0) continue;
		const slope = sxy / sxx;
		let sse = 0;
		for (const d of days) {
			const x = Math.max(0, sign * (d.temp - th));
			sse += (d.kwh - baseline - slope * x) ** 2;
		}
		if (!best || sse < best.sse) best = { threshold: th, slope, sse };
	}
	// en dessous de quelques dixièmes de kWh par degré et par jour, l'effet se confond avec le bruit
	if (!best || best.slope < minSlope) return null;
	return { baseline, threshold: best.threshold, slope: best.slope, total: 0 };
}

const isWeekend = (d: string) => {
	const w = new Date(d + 'T12:00:00Z').getUTCDay();
	return w === 0 || w === 6;
};

export function analyse(input: AnalysisInput): Analysis {
	const { cons, temp, pvPerKwc } = input;
	const n = cons.load.length;
	const byDay = new Map<string, { kwh: number; t: number; nt: number; pil: number; min: number }>();
	const prof = Object.fromEntries(
		SEASONS.map((s) => [
			s,
			{
				weekday: new Array<number>(24).fill(0),
				weekend: new Array<number>(24).fill(0),
				nwd: new Array<number>(24).fill(0),
				nwe: new Array<number>(24).fill(0)
			}
		])
	) as Record<
		Season,
		{
			weekday: number[];
			weekend: number[];
			nwd: number[];
			nwe: number[];
		}
	>;
	let total = 0,
		hc = 0,
		sun = 0,
		night = 0,
		pilotable = 0;
	let peak = { kwh: 0, day: '', hour: 0 };
	for (let i = 0; i < n; i++) {
		const v = cons.load[i];
		const d = cons.localDay[i];
		const h = cons.localHour[i];
		total += v;
		pilotable += cons.pilotable[i];
		if (input.hcHours[h]) hc += v;
		if (h < 6) night += v;
		if ((pvPerKwc[i] ?? 0) > 0.1) sun += v;
		if (v > peak.kwh) peak = { kwh: v, day: d, hour: h };
		const a = byDay.get(d) ?? { kwh: 0, t: 0, nt: 0, pil: 0, min: Infinity };
		a.kwh += v;
		a.pil += cons.pilotable[i];
		a.min = Math.min(a.min, v);
		if (Number.isFinite(temp[i])) {
			a.t += temp[i];
			a.nt++;
		}
		byDay.set(d, a);
		const p = prof[seasonOf(Number(d.slice(5, 7)))];
		if (isWeekend(d)) {
			p.weekend[h] += v;
			p.nwe[h]++;
		} else {
			p.weekday[h] += v;
			p.nwd[h]++;
		}
	}
	const profiles = Object.fromEntries(
		SEASONS.map((s) => {
			const p = prof[s];
			return [
				s,
				{
					weekday: p.weekday.map((v, h) => (p.nwd[h] ? v / p.nwd[h] : 0)),
					weekend: p.weekend.map((v, h) => (p.nwe[h] ? v / p.nwe[h] : 0)),
					all: p.weekday.map((v, h) =>
						p.nwd[h] + p.nwe[h] ? (v + p.weekend[h]) / (p.nwd[h] + p.nwe[h]) : 0
					)
				}
			];
		})
	) as Analysis['profiles'];

	const daily: DayStat[] = [...byDay].map(([day, a]) => ({
		day,
		kwh: a.kwh,
		temp: a.nt ? a.t / a.nt : NaN,
		weekend: isWeekend(day),
		pilotable: a.pil,
		heating: 0,
		cooling: 0
	}));

	const withTemp = daily.filter((d) => Number.isFinite(d.temp));
	// le lien jour par jour avec la température n'existe que sur les mois mesurés : une
	// forme horaire empruntée à un autre mois le brouillerait
	const methods = new Map(cons.months.map((m) => [m.month, m.method]));
	const isMeasured = (d: DayStat) => {
		const m = methods.get(d.day.slice(0, 7));
		return !m || m === 'ha';
	};
	const measuredDays = withTemp.filter(isMeasured);
	const fitDays = measuredDays.length >= 60 ? measuredDays : withTemp;
	// talon thermique : jours doux (15-21 °C), sinon les 20 % de jours les moins chargés
	const mild = fitDays.filter((d) => d.temp >= 15 && d.temp <= 21).map((d) => d.kwh);
	const baseline =
		mild.length >= 10
			? median(mild)
			: median(
					[...fitDays]
						.sort((a, b) => a.kwh - b.kwh)
						.slice(0, Math.max(1, Math.round(fitDays.length / 5)))
						.map((d) => d.kwh)
				);
	const heating = fitThermal(fitDays, baseline, [12, 13, 14, 15, 16, 17], -1);
	// la clim se mesure par rapport à un jour d'été ordinaire, plus sobre qu'un jour de
	// mi-saison (moins d'éclairage, eau chaude plus vite chauffée)
	const summer = fitDays
		.filter((d) => d.temp >= 16 && d.temp <= 20 && (!heating || d.temp >= heating.threshold))
		.map((d) => d.kwh);
	const coolBase = summer.length >= 10 ? Math.min(baseline, median(summer)) : baseline;
	const cooling = fitThermal(fitDays, coolBase, [18, 19, 20, 21, 22, 23, 24], 1, 0.15);
	// talon : minimum horaire des jours sans chauffage ni clim (en hiver, une PAC qui tourne
	// la nuit le gonflerait), de préférence sur les mois réellement mesurés
	const neutral = withTemp.filter(
		(d) => (!heating || d.temp >= heating.threshold) && (!cooling || d.temp <= cooling.threshold)
	);
	const measured = neutral.filter(isMeasured);
	const pool = measured.length >= 20 ? measured : neutral.length >= 20 ? neutral : daily;
	const mins = pool.map((d) => byDay.get(d.day)!.min).sort((x, y) => x - y);
	const standby = pool === daily ? (mins[Math.floor(mins.length * 0.1)] ?? 0) : median(mins);
	for (const d of withTemp) {
		// le talon (veille × 24 h) et l'eau chaude pilotée ne sont jamais du chauffage
		const room = Math.max(0, d.kwh - d.pilotable - standby * 24);
		if (heating && d.temp < heating.threshold)
			d.heating = Math.min(room, heating.slope * (heating.threshold - d.temp));
		if (cooling && d.temp > cooling.threshold)
			d.cooling = Math.min(room - d.heating, cooling.slope * (d.temp - cooling.threshold));
	}
	if (heating) heating.total = daily.reduce((s, d) => s + d.heating, 0);
	if (cooling) cooling.total = daily.reduce((s, d) => s + d.cooling, 0);

	const months = new Map<string, MonthStat>();
	for (const d of daily) {
		const k = d.day.slice(0, 7);
		const m = months.get(k) ?? {
			month: k,
			kwh: 0,
			pilotable: 0,
			heating: 0,
			cooling: 0,
			other: 0,
			method: methods.get(k) ?? null
		};
		m.kwh += d.kwh;
		m.pilotable += d.pilotable;
		m.heating += d.heating;
		m.cooling += d.cooling;
		m.other += d.kwh - d.pilotable - d.heating - d.cooling;
		months.set(k, m);
	}

	const wd = daily.filter((d) => !d.weekend);
	const we = daily.filter((d) => d.weekend);
	const avg = (a: DayStat[]) => (a.length ? a.reduce((s, d) => s + d.kwh, 0) / a.length : 0);

	// comparaison des options tarifaires sur cette consommation
	let tempo: Map<string, TempoColor> | null = null;
	const tariffs = input.tariffs.map((t) => {
		if (t.kind === 'tempo' && !tempo)
			tempo = tempoCalendar(new Map(withTemp.map((d) => [d.day, d.temp])));
		const price = priceSeries(cons.localDay, cons.localHour, t, tempo ?? undefined);
		const energy = energyCost(cons.load, price);
		return { kind: t.kind, energy, subscription: t.subscription, total: energy + t.subscription };
	});
	const red = { days: 0, kwh: 0 };
	if (tempo) {
		const cal: Map<string, TempoColor> = tempo;
		for (const d of daily)
			if (cal.get(d.day) === 'rouge') {
				red.days++;
				red.kwh += d.kwh;
			}
	}

	let existing: Analysis['existing'] = null;
	if (input.basePv) {
		let production = 0,
			direct = 0;
		for (let i = 0; i < n; i++) {
			production += input.basePv[i];
			direct += Math.min(cons.load[i], input.basePv[i]);
		}
		existing = { production, direct };
	}

	return {
		total,
		days: daily.length,
		perDay: daily.length ? total / daily.length : 0,
		standby,
		standbyKwh: standby * 8760,
		peak,
		weekday: avg(wd),
		weekend: avg(we),
		hcShare: total ? hc / total : 0,
		sunShare: total ? sun / total : 0,
		nightShare: total ? night / total : 0,
		pilotable,
		daily,
		monthly: [...months.values()],
		profiles,
		heating,
		cooling,
		topDays: [...daily].sort((a, b) => b.kwh - a.kwh).slice(0, 5),
		tariffs,
		redDays: red,
		existing
	};
}
