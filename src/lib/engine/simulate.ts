import type { MonthTotals, SimulationResult, SystemConfig, TimeSeries } from './types';

/**
 * Rejoue la série pas à pas : solaire direct → appareils pilotés → batterie → réseau.
 * Avec une batterie idéale (DoD 1, réserve 0, veille 0), sans écrêtage et un seul
 * appareil (2,4 kW, reliquat à 21 h), le résultat est identique au moteur Python de
 * référence (tests/fixtures/reference.py).
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
	const devices = cfg.devices;
	const gc = bat ? cfg.gridCharge : null;

	const flows = {
		production: new Float32Array(n),
		direct: new Float32Array(n),
		charge: new Float32Array(n),
		discharge: new Float32Array(n),
		import: new Float32Array(n),
		export: new Float32Array(n),
		load: new Float32Array(n)
	};
	const months: Record<string, MonthTotals> = {};

	// énergie de chaque appareil pour chaque jour, à placer dans la journée
	const dayBanks = devices.map((dev) => {
		const m = new Map<string, number>();
		for (let i = 0; i < n; i++) {
			const d = series.localDay[i];
			m.set(d, (m.get(d) ?? 0) + dev.profile[i]);
		}
		return m;
	});
	const bank = new Float64Array(devices.length);

	let soc = socMin;
	let day = '';
	let production = 0;
	let clipped = 0;
	let imp = 0;
	let exp = 0;
	let load = 0;
	let gridCharged = 0;

	for (let i = 0; i < n; i++) {
		const d = series.localDay[i];
		if (d !== day) {
			day = d;
			for (let k = 0; k < devices.length; k++) bank[k] = dayBanks[k].get(d) ?? 0;
		}

		const raw = series.pvPerKwc[i] * cfg.kwc;
		const added = Math.min(raw, acMax);
		clipped += raw - added;
		const p = added + (series.basePv ? series.basePv[i] : 0);
		production += p;

		// consommation hors appareils pilotés, puis appareils servis par priorité
		let base = series.load[i];
		for (const dev of devices) base -= dev.profile[i];
		let net = p - base;
		let shifted = 0;
		for (let k = 0; k < devices.length; k++) {
			if (net > 0 && bank[k] > 0) {
				const r = Math.min(net, devices[k].power * dt, bank[k]);
				bank[k] -= r;
				net -= r;
				shifted += r;
			}
			if (series.localHour[i] === devices[k].fallbackHour && bank[k] > 0) {
				net -= bank[k];
				shifted += bank[k];
				bank[k] = 0;
			}
		}
		const stepLoad = base + shifted;
		load += stepLoad;

		if (bat) {
			// la veille puise dans la batterie, sinon sur le réseau
			const fromBat = Math.min(standby, Math.max(0, soc - socMin));
			soc -= fromBat;
			net -= standby - fromBat;
		}

		let gi = 0;
		let ge = 0;
		let ch = 0;
		let dis = 0;
		if (net > 0) {
			ch = Math.min(net * eff, cap - soc, pmax);
			soc += ch;
			ge = net - ch / eff;
		} else {
			dis = Math.min(-net, (soc - socMin) * eff, pmax);
			soc -= dis / eff;
			gi = -net - dis;
		}

		// recharge réseau : seulement si la batterie ne travaille pas déjà à pleine puissance
		if (gc && gc.hours[series.localHour[i]] && (!gc.days || gc.days.has(d))) {
			const target = Math.max(socMin, cap * gc.targetSoc);
			const room = Math.min(target - soc, pmax - ch - dis);
			if (room > 0) {
				soc += room;
				gi += room / eff;
				gridCharged += room / eff;
			}
		}

		imp += gi;
		exp += ge;
		flows.production[i] = p;
		flows.charge[i] = net > 0 ? ch / eff : 0;
		flows.direct[i] = p - ge - flows.charge[i];
		flows.discharge[i] = dis;
		flows.import[i] = gi;
		flows.export[i] = ge;
		flows.load[i] = stepLoad;

		const m = d.slice(0, 7);
		const mt = (months[m] ??= { production: 0, import: 0, export: 0, load: 0 });
		mt.production += p;
		mt.import += gi;
		mt.export += ge;
		mt.load += stepLoad;
	}

	const consumed = load - (imp - gridCharged);
	return {
		production,
		clipped,
		import: imp,
		export: exp,
		load,
		autonomy: load > 0 ? consumed / load : 0,
		selfConsumption: production > 0 ? (production - exp) / production : 0,
		gridCharged,
		months,
		flows
	};
}
