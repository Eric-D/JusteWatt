import { applyEvolutions, type Evolution } from '#lib/engine/evolutions.js';
import { finance, type FinanceResult } from '#lib/engine/finance.js';
import { simulate } from '#lib/engine/simulate.js';
import {
	energyCost,
	eveOfRedDays,
	priceSeries,
	tempoCalendar,
	type TempoColor
} from '#lib/engine/tariffs.js';
import type {
	Device,
	GridCharge,
	SimulationResult,
	SystemConfig,
	TimeSeries
} from '#lib/engine/types.js';
import type { Consumption } from '#lib/sources/consumption.js';
import {
	premiumFor,
	type CumulusSettings,
	type Economics,
	type GridChargeSettings,
	type Scenario
} from './model';

/** Données d'entrée préparées une fois (consommation de base + météo). */
export interface Prepared {
	cons: Consumption;
	/** Température par pas, °C. */
	temp: number[];
	/** Production par kWc, année de la consommation. */
	pv: number[];
	/** Production par kWc rejouée avec la météo d'autres années (incertitude). */
	pvYears: { year: number; pv: number[] }[];
}

/** Contexte de calcul : série finale, appareils pilotés, prix horaires. */
export interface Context {
	series: TimeSeries;
	devices: Device[];
	price: Float32Array;
	tempo: Map<string, TempoColor> | null;
	gridCharge: GridCharge | null;
	evolutionTotals: Record<string, number>;
	pvYears: { year: number; pv: number[] }[];
}

export interface ContextSettings {
	evolutions: Evolution[];
	cumulus: CumulusSettings;
	gridCharge: GridChargeSettings;
	economics: Economics;
}

export function buildContext(p: Prepared, s: ContextSettings): Context {
	const c = p.cons;
	const evo = applyEvolutions(
		{ localHour: c.localHour, localDay: c.localDay, temp: p.temp },
		s.evolutions
	);
	const load = c.load.map((v, i) => v + evo.extra[i]);
	const series: TimeSeries = {
		start: new Date(c.steps[0]).toISOString(),
		stepMinutes: 60,
		localHour: c.localHour,
		localDay: c.localDay,
		load,
		pilotable: c.pilotable,
		pvPerKwc: p.pv
	};
	const devices: Device[] = [];
	if (s.cumulus.enabled && c.pilotable.some((v) => v > 0))
		devices.push({
			name: 'Cumulus',
			power: s.cumulus.power,
			fallbackHour: s.cumulus.fallbackHour,
			profile: c.pilotable
		});
	devices.push(...evo.devices);

	const t = s.economics.tariff;
	let tempo: Map<string, TempoColor> | null = null;
	if (t.kind === 'tempo') {
		const sums = new Map<string, [number, number]>();
		c.localDay.forEach((d, i) => {
			const x = sums.get(d) ?? [0, 0];
			x[0] += p.temp[i];
			x[1]++;
			sums.set(d, x);
		});
		tempo = tempoCalendar(new Map([...sums].map(([d, [s, n]]) => [d, s / n])));
	}
	const price = priceSeries(c.localDay, c.localHour, t, tempo ?? undefined);
	const hc = t.kind === 'base' ? null : t.hcHours;
	const gridCharge: GridCharge | null =
		s.gridCharge.enabled && hc
			? {
					hours: hc,
					targetSoc: s.gridCharge.targetSoc,
					days: s.gridCharge.mode === 'rouge' && tempo ? eveOfRedDays(tempo) : undefined
				}
			: null;
	return {
		series,
		devices,
		price,
		tempo,
		gridCharge,
		evolutionTotals: evo.totals,
		pvYears: p.pvYears
	};
}

export function estimateInvestment(sc: Pick<Scenario, 'kwc' | 'battery'>, e: Economics): number {
	if (sc.kwc <= 0 && sc.battery.capacity <= 0) return 0;
	return Math.round(sc.kwc * e.pricePerKwc + sc.battery.capacity * e.pricePerKwh + e.priceFixed);
}

export function systemConfig(ctx: Context, sc: Scenario): SystemConfig {
	const b = sc.battery;
	return {
		kwc: sc.kwc,
		inverterAcMax: sc.inverterAcMax > 0 ? sc.inverterAcMax : Infinity,
		battery: b.capacity > 0 ? { ...b } : null,
		devices: ctx.devices,
		gridCharge: ctx.gridCharge
	};
}

export interface Outcome {
	sim: SimulationResult;
	investment: number;
	premium: number;
	/** Facture d'énergie sans installation / avec, €/an (hors abonnement). */
	billBefore: number;
	billAfter: number;
	savings: number;
	exportRevenue: number;
	finance: FinanceResult;
}

function money(ctx: Context, e: Economics, sc: Scenario, sim: SimulationResult) {
	const billBefore = energyCost(ctx.series.load, ctx.price);
	const billAfter = energyCost(sim.flows.import, ctx.price);
	const investment = sc.investment ?? estimateInvestment(sc, e);
	const premium = sc.premium && e.sellPrice > 0 ? Math.round(premiumFor(sc.kwc)) : 0;
	const replacements = [];
	if (sc.kwc > 0 && e.inverterYear > 0 && e.inverterYear < e.years)
		replacements.push({ year: e.inverterYear, cost: sc.kwc * e.inverterPerKwc });
	if (sc.battery.capacity > 0 && e.batteryYear > 0 && e.batteryYear < e.years)
		replacements.push({
			year: e.batteryYear,
			cost: sc.battery.capacity * e.pricePerKwh * e.batteryShare
		});
	return { billBefore, billAfter, investment, premium, replacements };
}

export function outcome(ctx: Context, e: Economics, sc: Scenario, pv?: number[]): Outcome {
	const series = pv ? { ...ctx.series, pvPerKwc: pv } : ctx.series;
	const sim = simulate(series, systemConfig(ctx, sc));
	const m = money(ctx, e, sc, sim);
	const savings = m.billBefore - m.billAfter;
	const exportRevenue = sim.export * e.sellPrice;
	const f = finance({
		investment: m.investment - m.premium,
		savings,
		exportRevenue,
		inflation: e.inflation,
		degradation: e.degradation,
		years: e.years,
		discountRate: e.discountRate,
		yearlyCosts: sc.kwc > 0 ? e.yearlyCosts : 0,
		replacements: m.replacements
	});
	return {
		sim,
		investment: m.investment,
		premium: m.premium,
		billBefore: m.billBefore,
		billAfter: m.billAfter,
		savings,
		exportRevenue,
		finance: f
	};
}

export interface Spread {
	/** Années météo rejouées × inflation basse / prévue / haute. */
	samples: {
		year: number;
		inflation: number;
		netGain: number;
		payback: number | null;
		production: number;
	}[];
	p10: number;
	p50: number;
	p90: number;
	paybackP10: number | null;
	paybackP90: number | null;
}

function quantile(sorted: number[], q: number) {
	if (!sorted.length) return 0;
	const x = (sorted.length - 1) * q;
	const i = Math.floor(x);
	return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (x - i);
}

/** Distribution du gain : météo de chaque année disponible × trois hypothèses d'inflation. */
export function spread(ctx: Context, e: Economics, sc: Scenario): Spread {
	const years = ctx.pvYears.length ? ctx.pvYears : [{ year: 0, pv: ctx.series.pvPerKwc }];
	const samples: Spread['samples'] = [];
	for (const y of years) {
		const o = outcome(ctx, e, sc, y.pv);
		for (const inflation of [Math.max(0, e.inflation - 0.02), e.inflation, e.inflation + 0.02]) {
			const f = finance({
				investment: o.investment - o.premium,
				savings: o.savings,
				exportRevenue: o.exportRevenue,
				inflation,
				degradation: e.degradation,
				years: e.years,
				discountRate: e.discountRate,
				yearlyCosts: sc.kwc > 0 ? e.yearlyCosts : 0,
				replacements: money(ctx, e, sc, o.sim).replacements
			});
			samples.push({
				year: y.year,
				inflation,
				netGain: f.netGain,
				payback: f.payback,
				production: o.sim.production
			});
		}
	}
	const gains = samples.map((s) => s.netGain).sort((a, b) => a - b);
	const pb = samples.map((s) => s.payback ?? Infinity).sort((a, b) => a - b);
	const fin = (v: number) => (Number.isFinite(v) ? v : null);
	return {
		samples,
		p10: quantile(gains, 0.1),
		p50: quantile(gains, 0.5),
		p90: quantile(gains, 0.9),
		paybackP10: fin(quantile(pb, 0.1)),
		paybackP90: fin(quantile(pb, 0.9))
	};
}

export interface MapCell {
	kwc: number;
	capacity: number;
	netGain: number;
	payback: number | null;
	autonomy: number;
	investment: number;
	npv: number;
}

export const MAP_KWC = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
export const MAP_BATTERY = [0, 2.5, 5, 7.5, 10, 12.5, 15];

/** Toutes les combinaisons panneaux × batterie, au prix d'estimation. */
export function explore(
	ctx: Context,
	e: Economics,
	base: Scenario,
	kwcs = MAP_KWC,
	caps = MAP_BATTERY
): MapCell[] {
	const cells: MapCell[] = [];
	for (const kwc of kwcs)
		for (const capacity of caps) {
			const sc: Scenario = {
				...base,
				kwc,
				investment: null,
				battery: {
					...base.battery,
					capacity,
					power: capacity > 0 ? Math.max(2.5, capacity / 2) : 0
				}
			};
			const o = outcome(ctx, e, sc);
			cells.push({
				kwc,
				capacity,
				netGain: o.finance.netGain,
				payback: o.finance.payback,
				autonomy: o.sim.autonomy,
				investment: o.investment,
				npv: o.finance.npv
			});
		}
	return cells;
}
