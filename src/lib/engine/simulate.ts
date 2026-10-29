import type { MonthTotals, SimulationResult, SystemConfig, TimeSeries } from './types';

/**
 * Rejoue la série pas à pas : solaire direct → routeur → batterie → réseau.
 * Avec une batterie idéale (DoD 1, réserve 0, veille 0) et sans écrêtage,
 * le résultat est identique au script Python de référence (tests/fixtures/rejeu.py).
 */
export function simulate(series: TimeSeries, cfg: SystemConfig): SimulationResult {
	const n = series.load.length;
	const dt = series.stepMinutes / 60;
	const bat = cfg.battery;
	const eff = bat?.efficiency ?? 1;
	const cap = bat?.capacity ?? 0;
	const pmax = bat ? bat.power * dt : 0;
	const socMin = bat ? cap * Math.max(1 - bat.depthOfDischarge, bat.reserve) : 0;
	const standby = bat ? (bat.standbyW / 1000) * dt : 0;
	const acMax = cfg.inverterAcMax * dt;
	const router = cfg.router.enabled;
	const routerMax = cfg.router.power * dt;

	const importSeries = new Float64Array(n);
	const exportSeries = new Float64Array(n);
	const months: Record<string, MonthTotals> = {};

	// énergie pilotable de chaque jour, à placer dans la journée
	const dayBank = new Map<string, number>();
	if (router) {
		for (let i = 0; i < n; i++) {
			const d = series.localDay[i];
			dayBank.set(d, (dayBank.get(d) ?? 0) + series.pilotable[i]);
		}
	}

	let soc = socMin;
	let bank = 0;
	let day = '';
	let production = 0;
	let clipped = 0;
	let imp = 0;
	let exp = 0;
	let load = 0;

	for (let i = 0; i < n; i++) {
		const d = series.localDay[i];
		if (d !== day) {
			day = d;
			bank = router ? (dayBank.get(d) ?? 0) : 0;
		}

		const raw = series.pvPerKwc[i] * cfg.kwc;
		const p = Math.min(raw, acMax);
		clipped += raw - p;
		production += p;
		load += series.load[i];

		let net = p - (series.load[i] - (router ? series.pilotable[i] : 0));
		if (router && net > 0 && bank > 0) {
			const r = Math.min(net, routerMax, bank);
			bank -= r;
			net -= r;
		}
		if (router && series.localHour[i] === cfg.router.fallbackHour && bank > 0) {
			net -= bank;
			bank = 0;
		}

		if (bat) {
			// la veille puise dans la batterie, sinon sur le réseau
			const fromBat = Math.min(standby, Math.max(0, soc - socMin));
			soc -= fromBat;
			net -= standby - fromBat;
		}

		let gi = 0;
		let ge = 0;
		if (net > 0) {
			const ch = Math.min(net * eff, cap - soc, pmax);
			soc += ch;
			ge = net - ch / eff;
		} else {
			const dis = Math.min(-net, (soc - socMin) * eff, pmax);
			soc -= dis / eff;
			gi = -net - dis;
		}
		imp += gi;
		exp += ge;
		importSeries[i] = gi;
		exportSeries[i] = ge;

		const m = d.slice(0, 7);
		const mt = (months[m] ??= { production: 0, import: 0, export: 0, load: 0 });
		mt.production += p;
		mt.import += gi;
		mt.export += ge;
		mt.load += series.load[i];
	}

	return {
		production,
		clipped,
		import: imp,
		export: exp,
		load,
		autonomy: load > 0 ? (load - imp) / load : 0,
		selfConsumption: production > 0 ? (production - exp) / production : 0,
		months,
		importSeries,
		exportSeries
	};
}
