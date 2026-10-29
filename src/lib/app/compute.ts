import { applyEvolutions, type Evolution } from '#lib/engine/evolutions.js';
import { finance, type FinanceResult } from '#lib/engine/finance.js';
import { simulate } from '#lib/engine/simulate.js';
import {
	energyCost,
	eveOfRedDays,
	priceSeries,
	tempoCalendar,
	type Tariff,
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
	type ExistingSettings,
	type GridChargeSettings,
	type Scenario
} from './model';

/** Année météo : production par kWc des panneaux simulés et, s'il y en a, des panneaux existants. */
export interface WeatherYear {
	year: number;
	pv: number[];
	basePv?: number[];
}

/** Données d'entrée préparées une fois (consommation de base + météo). */
export interface Prepared {
	cons: Consumption;
	/** Température par pas, °C. */
	temp: number[];
	/** Production par kWc, année de la consommation. */
	pv: number[];
	/** Production des panneaux déjà installés, kWh par pas (calée sur la mesure). */
	basePv?: number[];
	/** Autres années météo (incertitude). */
	pvYears: WeatherYear[];
}

/** Situation d'aujourd'hui, quand des panneaux existent déjà. */
export interface Baseline {
	settings: ExistingSettings;
	tariff: Tariff;
	price: Float32Array;
	devices: Device[];
	sim: SimulationResult;
}

/** Contexte de calcul : série finale, appareils pilotés, prix horaires. */
export interface Context {
	series: TimeSeries;
	devices: Device[];
	tariff: Tariff;
	price: Float32Array;
	tempo: Map<string, TempoColor> | null;
	gridCharge: GridCharge | null;
	evolutionTotals: Record<string, number>;
	pvYears: WeatherYear[];
	baseline: Baseline | null;
	/** Le pilotage du cumulus fait partie de l'ajout (routeur à acheter). */
	routerAdded: boolean;
}

export interface ContextSettings {
	evolutions: Evolution[];
	cumulus: CumulusSettings;
	gridCharge: GridChargeSettings;
	economics: Economics;
	existing?: ExistingSettings;
}

export function buildContext(p: Prepared, s: ContextSettings): Context {
	const c = p.cons;
	const ex = s.existing?.enabled && p.basePv ? s.existing : null;
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
		pvPerKwc: p.pv,
		basePv: ex ? p.basePv : undefined
	};
	const hasPilotable = c.pilotable.some((v) => v > 0);
	const cumulus: Device = {
		name: 'Cumulus',
		power: s.cumulus.power,
		fallbackHour: s.cumulus.fallbackHour,
		profile: c.pilotable
	};
	const devices: Device[] = [];
	if (s.cumulus.enabled && hasPilotable) devices.push(cumulus);
	devices.push(...evo.devices);

	const t = s.economics.tariff;
	const baseTariff = ex?.currentTariff ?? t;
	let tempo: Map<string, TempoColor> | null = null;
	if (t.kind === 'tempo' || baseTariff.kind === 'tempo') {
		const sums = new Map<string, [number, number]>();
		c.localDay.forEach((d, i) => {
			const x = sums.get(d) ?? [0, 0];
			x[0] += p.temp[i];
			x[1]++;
			sums.set(d, x);
		});
		tempo = tempoCalendar(new Map([...sums].map(([d, [sum, n]]) => [d, sum / n])));
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

	let baseline: Baseline | null = null;
	if (ex) {
		const baseDevices = [...(ex.router && hasPilotable ? [cumulus] : []), ...evo.devices];
		baseline = {
			settings: ex,
			tariff: baseTariff,
			price: priceSeries(c.localDay, c.localHour, baseTariff, tempo ?? undefined),
			devices: baseDevices,
			sim: simulate(series, {
				kwc: 0,
				inverterAcMax: Infinity,
				battery: null,
				devices: baseDevices
			})
		};
	}
	return {
		series,
		devices,
		tariff: t,
		price,
		tempo,
		gridCharge,
		evolutionTotals: evo.totals,
		pvYears: p.pvYears,
		baseline,
		routerAdded: !!ex && !ex.router && s.cumulus.enabled && hasPilotable
	};
}

/** Prix estimé : neuf, ou seulement l'ajout quand des panneaux existent déjà. */
export function estimateInvestment(
	sc: Pick<Scenario, 'kwc' | 'battery'>,
	e: Economics,
	routerAdded = false
): number {
	const cap = sc.battery.capacity;
	// une batterie seule demande moins de pose qu'une installation de panneaux
	const fixed = sc.kwc > 0 ? e.priceFixed : cap > 0 ? e.priceFixed / 2 : 0;
	const router = routerAdded ? e.routerCost : 0;
	if (sc.kwc <= 0 && cap <= 0 && !router) return 0;
	return Math.round(sc.kwc * e.pricePerKwc + cap * e.pricePerKwh + fixed + router);
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
	/** Facture d'énergie avant / après, €/an (hors abonnement). */
	billBefore: number;
	billAfter: number;
	/** Économie de facture l'année 1, abonnement compris. */
	savings: number;
	/** Variation de revente l'année 1 (négative si l'on revend moins qu'avant). */
	exportRevenue: number;
	finance: FinanceResult;
	/** Situation d'aujourd'hui, quand des panneaux existent déjà. */
	baseline: SimulationResult | null;
}

const thisYear = new Date().getFullYear();

/**
 * Résultat d'un scénario. Avec des panneaux existants, tout est compté par rapport à
 * aujourd'hui : économie de facture, revente perdue ou gagnée, investissement de l'ajout.
 */
export function outcome(ctx: Context, e: Economics, sc: Scenario, year?: WeatherYear): Outcome {
	const series = year
		? { ...ctx.series, pvPerKwc: year.pv, basePv: year.basePv ?? ctx.series.basePv }
		: ctx.series;
	const sim = simulate(series, systemConfig(ctx, sc));
	const b = ctx.baseline;
	const baseSim =
		b && year
			? simulate(series, { kwc: 0, inverterAcMax: Infinity, battery: null, devices: b.devices })
			: (b?.sim ?? null);

	const investment = sc.investment ?? estimateInvestment(sc, e, ctx.routerAdded);
	const premium = sc.premium && e.sellPrice > 0 && sc.kwc > 0 ? Math.round(premiumFor(sc.kwc)) : 0;
	const replacements = [];
	if (sc.kwc > 0 && e.inverterYear > 0 && e.inverterYear < e.years)
		replacements.push({ year: e.inverterYear, cost: sc.kwc * e.inverterPerKwc });
	if (sc.battery.capacity > 0 && e.batteryYear > 0 && e.batteryYear < e.years)
		replacements.push({
			year: e.batteryYear,
			cost: sc.battery.capacity * e.pricePerKwh * e.batteryShare
		});

	let billBefore: number;
	let billAfter = energyCost(sim.flows.import, ctx.price);
	let savings: number;
	let exportRevenue: number;
	let exportRevenueAfter: { year: number; value: number } | undefined;
	if (b && baseSim) {
		billBefore = energyCost(baseSim.flows.import, b.price);
		savings = billBefore + b.tariff.subscription - (billAfter + ctx.tariff.subscription);
		// le surplus d'aujourd'hui reste vendu au prix du contrat ; le surplus en plus, au prix actuel
		const c = b.settings.contractPrice;
		const before = baseSim.export;
		const kept = Math.min(sim.export, before);
		exportRevenue = kept * c + Math.max(0, sim.export - before) * e.sellPrice - before * c;
		const left = b.settings.contractEnd > 0 ? b.settings.contractEnd - thisYear : 0;
		if (c !== e.sellPrice && left < e.years)
			exportRevenueAfter = {
				year: Math.max(1, left + 1),
				value: (sim.export - before) * e.sellPrice
			};
	} else {
		billBefore = energyCost(ctx.series.load, ctx.price);
		savings = billBefore - billAfter;
		exportRevenue = sim.export * e.sellPrice;
	}
	billAfter = Math.round(billAfter * 100) / 100;

	const f = finance({
		investment: investment - premium,
		savings,
		exportRevenue,
		exportRevenueAfter,
		inflation: e.inflation,
		degradation: e.degradation,
		years: e.years,
		discountRate: e.discountRate,
		yearlyCosts: sc.kwc > 0 ? e.yearlyCosts : 0,
		replacements
	});
	return {
		sim,
		investment,
		premium,
		billBefore,
		billAfter,
		savings,
		exportRevenue,
		finance: f,
		baseline: baseSim
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
	for (const y of years)
		for (const inflation of [Math.max(0, e.inflation - 0.02), e.inflation, e.inflation + 0.02]) {
			const o = outcome(ctx, { ...e, inflation }, sc, y);
			samples.push({
				year: y.year,
				inflation,
				netGain: o.finance.netGain,
				payback: o.finance.payback,
				production: o.sim.production
			});
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
/** Panneaux ajoutés à une installation existante (0 = batterie ou pilotage seuls). */
export const MAP_KWC_ADDED = [0, 1, 2, 3, 4, 5, 6, 8];
export const MAP_BATTERY = [0, 2.5, 5, 7.5, 10, 12.5, 15];

/** Toutes les combinaisons panneaux × batterie, au prix d'estimation. */
export function explore(ctx: Context, e: Economics, base: Scenario, caps = MAP_BATTERY): MapCell[] {
	const kwcs = ctx.baseline ? MAP_KWC_ADDED : MAP_KWC;
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
