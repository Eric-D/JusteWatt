export type TariffKind = 'base' | 'hphc' | 'tempo';
export type TempoColor = 'bleu' | 'blanc' | 'rouge';

export interface Tariff {
	kind: TariffKind;
	/** Abonnement, €/an. */
	subscription: number;
	base: number;
	hp: number;
	hc: number;
	/** Heures creuses locales (24 booléens). */
	hcHours: boolean[];
	tempo: Record<TempoColor, { hp: number; hc: number }>;
}

export const DEFAULT_HC_HOURS = Array.from({ length: 24 }, (_, h) => h >= 22 || h < 6);
const TEMPO_HC = DEFAULT_HC_HOURS;

const pad = (n: number) => String(n).padStart(2, '0');
const dayBefore = (d: string) => {
	const x = new Date(d + 'T12:00:00Z');
	x.setUTCDate(x.getUTCDate() - 1);
	return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
};

/**
 * Calendrier Tempo estimé : RTE place les 22 jours rouges (1er nov. → 31 mars, hors
 * week-end) et les 43 blancs (hors dimanche) sur les jours les plus froids.
 * On reproduit cette règle avec la température moyenne du jour.
 */
export function tempoCalendar(dailyTemp: Map<string, number>): Map<string, TempoColor> {
	const out = new Map<string, TempoColor>();
	const seasons = new Map<number, string[]>();
	for (const d of dailyTemp.keys()) {
		out.set(d, 'bleu');
		const y = Number(d.slice(0, 4));
		const season = Number(d.slice(5, 7)) >= 9 ? y : y - 1; // saison du 1er sept. au 31 août
		if (!seasons.has(season)) seasons.set(season, []);
		seasons.get(season)!.push(d);
	}
	const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
	const cold = (a: string, b: string) => dailyTemp.get(a)! - dailyTemp.get(b)!;
	for (const days of seasons.values()) {
		const red = days
			.filter((d) => {
				const m = Number(d.slice(5, 7));
				return (m >= 11 || m <= 3) && dow(d) !== 0 && dow(d) !== 6;
			})
			.sort(cold)
			.slice(0, 22);
		red.forEach((d) => out.set(d, 'rouge'));
		days
			.filter((d) => {
				const m = Number(d.slice(5, 7));
				return (m >= 10 || m <= 5) && dow(d) !== 0 && out.get(d) === 'bleu';
			})
			.sort(cold)
			.slice(0, 43)
			.forEach((d) => out.set(d, 'blanc'));
	}
	return out;
}

/** Prix du kWh à chaque pas. Tempo : la couleur d'un jour vaut de 6 h à 6 h le lendemain. */
export function priceSeries(
	localDay: string[],
	localHour: number[],
	t: Tariff,
	tempo?: Map<string, TempoColor>
): Float32Array {
	const out = new Float32Array(localDay.length);
	for (let i = 0; i < out.length; i++) {
		const h = localHour[i];
		if (t.kind === 'base') out[i] = t.base;
		else if (t.kind === 'hphc') out[i] = t.hcHours[h] ? t.hc : t.hp;
		else {
			const d = h < 6 ? dayBefore(localDay[i]) : localDay[i];
			const c = t.tempo[tempo?.get(d) ?? 'bleu'];
			out[i] = TEMPO_HC[h] ? c.hc : c.hp;
		}
	}
	return out;
}

/**
 * Jours locaux où recharger avant un jour rouge : la veille (22-24 h) et le jour
 * même avant 6 h, encore en heures creuses.
 */
export function eveOfRedDays(tempo: Map<string, TempoColor>): Set<string> {
	const s = new Set<string>();
	for (const [d, c] of tempo) if (c === 'rouge') s.add(dayBefore(d)).add(d);
	return s;
}

export function energyCost(kwh: ArrayLike<number>, price: Float32Array): number {
	let s = 0;
	for (let i = 0; i < price.length; i++) s += kwh[i] * price[i];
	return s;
}
