import {
	HORIZON_SECTORS,
	elevationUrl,
	horizonFromElevations,
	horizonSamplePoints
} from '#lib/engine/horizon.js';
import {
	onSteps,
	openMeteoUrl,
	pvFromWeather,
	shiftYears,
	weatherFromOpenMeteo,
	type WeatherHours
} from '#lib/engine/pv.js';
import { localParts } from '#lib/engine/time.js';
import {
	buildConsumption,
	currentMonth,
	yearBefore,
	type Consumption
} from '#lib/sources/consumption.js';
import { demoHours } from '#lib/sources/demo.js';
import { monthlyFromDaily, type EnedisData } from '#lib/sources/enedis.js';
import type { HourSample } from '#lib/engine/fusion.js';
import type { Prepared } from './compute';
import { unpackSeries, type SharedData } from './share';
import { idb } from './idb';
import type { Plane, ProjectSettings, SiteSettings } from './model';
import { reconstructLoad } from '#lib/sources/existing.js';

const DAY = 86_400_000;

/** Données brutes importées, conservées sur l'appareil. */
export interface RawHa {
	hours: [number, number, number][];
	solar: [number, number][];
}
export interface RawEnedis {
	kind: EnedisData['kind'];
	hourly: [number, number][];
	daily: [string, number][];
	first: string;
	last: string;
}

export const toRawEnedis = (e: EnedisData): RawEnedis => ({
	kind: e.kind,
	hourly: [...e.hourly],
	daily: [...e.daily],
	first: e.first,
	last: e.last
});

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Météo d'une plage de dates pour un pan, avec cache local. */
async function weather(
	site: SiteSettings,
	plane: Plane,
	startMs: number,
	endMs: number
): Promise<WeatherHours> {
	const from = isoDay(startMs - DAY);
	const to = isoDay(Math.min(endMs + DAY, Date.now() - 2 * DAY));
	const key = `meteo:${site.latitude.toFixed(3)},${site.longitude.toFixed(3)}:${plane.tilt}:${plane.azimuth}:${from}:${to}`;
	const cached = await idb.get<WeatherHours>(key);
	if (cached) return cached;
	const res = await fetch(openMeteoUrl(site, plane, from, to));
	if (!res.ok) throw new Error(`Open-Meteo indisponible (${res.status})`);
	const w = weatherFromOpenMeteo(await res.json());
	await idb.set(key, w);
	return w;
}

/** Mois exclu qui termine l'année simulée : celui des dernières données complètes. */
export function defaultEndMonth(
	s: ProjectSettings,
	enedis: RawEnedis | null,
	now = Date.now()
): string {
	const tz = s.site.tz;
	if (s.source.kind === 'enedis' && enedis) {
		// mois qui suit le dernier mois couvert jusqu'au bout
		const last = enedis.last;
		const next = new Date(Date.parse(last + 'T12:00:00Z') + DAY);
		const m = next.toISOString().slice(0, 7);
		return next.getUTCDate() === 1 ? m : last.slice(0, 7);
	}
	if (s.source.kind === 'manual') {
		const months = Object.keys(s.source.manualMonthly).sort();
		if (months.length) {
			const [y, m] = months[months.length - 1].split('-').map(Number);
			return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
		}
	}
	// la météo d'archive a quelques jours de retard
	return currentMonth(tz, now - 7 * DAY);
}

export interface PrepareResult {
	prepared: Prepared;
	/** Production existante mesurée / modélisée (calage), si connue. */
	measuredRatio: number | null;
	/** D'où vient le calage des panneaux existants. */
	calibratedBy: 'ha' | 'annual' | null;
}

export async function prepare(
	s: ProjectSettings,
	raw: {
		ha: RawHa | null;
		enedis: RawEnedis | null;
		injection: RawEnedis | null;
		shared: SharedData | null;
	},
	progress: (msg: string) => void
): Promise<PrepareResult> {
	const tz = s.site.tz;
	const endMonth = s.source.endMonth || defaultEndMonth(s, raw.enedis);
	const { startMs, endMs } = yearBefore(endMonth, tz);
	const shared = s.source.kind === 'shared' ? raw.shared : null;

	progress('Reconstruction de la consommation');
	let cons: Consumption;
	const ha = new Map<number, HourSample>(
		(raw.ha?.hours ?? []).map(([t, load, pilotable]) => [t, { load, pilotable }])
	);
	if (shared) {
		cons = consumptionFromShared(shared);
	} else if (s.source.kind === 'demo') {
		cons = buildConsumption({ tz, startMs, endMs, ha: demoHours(startMs, endMs, tz) });
		cons.sources = ['Démonstration'];
	} else {
		let monthly: Record<string, number> | undefined;
		let curve: Map<number, number> | undefined;
		if (raw.enedis && s.source.kind !== 'manual') {
			const mm = monthlyFromDaily(new Map(raw.enedis.daily));
			monthly = {};
			for (const [m, v] of Object.entries(mm)) {
				const [y, mo] = m.split('-').map(Number);
				const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
				// mois presque complet : extrapolé ; sinon ignoré
				if (v.days >= days - 3) monthly[m] = (v.kwh * days) / v.days;
			}
			if (raw.enedis.kind === 'curve') curve = new Map(raw.enedis.hourly);
		}
		if (s.source.kind === 'manual') monthly = { ...s.source.manualMonthly };
		cons = buildConsumption({ tz, startMs, endMs, curve, ha: ha.size ? ha : undefined, monthly });
	}

	progress('Ensoleillement de votre toit (Open-Meteo)');
	const site = s.site;
	const horizon = s.site.useHorizon && s.site.horizon ? { angles: s.site.horizon } : null;
	const planes = s.site.planes.filter((p) => p.share > 0);

	const ex = s.existing;
	const hasExisting = ex.enabled && ex.kwc > 0;
	const existingPlane = {
		id: 'existant',
		name: 'Existant',
		tilt: ex.tilt,
		azimuth: ex.azimuth,
		share: 1
	};

	/** Production par kWc d'un ensemble de pans, `yearsBack` années avant la consommation. */
	const yearPv = async (list: Plane[], yearsBack: number) => {
		const steps = yearsBack ? shiftYears(cons.steps, yearsBack) : cons.steps;
		const pv = new Array<number>(steps.length).fill(0);
		const sum = list.reduce((a, p) => a + p.share, 0) || 1;
		let temp: number[] = [];
		for (const plane of list) {
			const w = await weather(site, plane, steps[0], steps[steps.length - 1] + 3_600_000);
			const per = pvFromWeather(w, site, plane, horizon, 0.8111 * s.source.calibration);
			onSteps(steps, w, per).forEach((v, i) => (pv[i] += (v * plane.share) / sum));
			if (!temp.length) temp = onSteps(steps, w, w.temp);
		}
		return { pv, temp };
	};
	const main = await yearPv(planes, 0);
	const year0 = Number(localParts(endMs - 1, tz).day.slice(0, 4));

	// --- panneaux déjà installés : production calée sur la mesure, puis vraie consommation
	let measuredRatio: number | null = null;
	let calibratedBy: PrepareResult['calibratedBy'] = null;
	let factor = 1;
	let basePv: number[] | undefined;
	if (hasExisting) {
		progress('Production de vos panneaux actuels');
		const model = (await yearPv([existingPlane], 0)).pv.map((v) => v * ex.kwc);
		const modelTotal = model.reduce((a, v) => a + v, 0);
		if (raw.ha?.solar.length) {
			const idx = new Map(cons.steps.map((t, i) => [t, i]));
			let meas = 0;
			let mod = 0;
			for (const [t, v] of raw.ha.solar) {
				const i = idx.get(t);
				if (i === undefined) continue;
				meas += v;
				mod += model[i];
			}
			if (mod > 50) {
				measuredRatio = meas / mod;
				calibratedBy = 'ha';
			}
		} else if (ex.annualProduction > 0 && modelTotal > 0) {
			measuredRatio = ex.annualProduction / modelTotal;
			calibratedBy = 'annual';
		}
		factor = measuredRatio ?? 1;
		basePv = model.map((v) => v * factor);

		// le compteur ne voit que l'achat : on rajoute ce que les panneaux ont fourni
		const loadIncludesSolar =
			s.source.kind === 'demo' || !!shared || (s.source.kind === 'ha' && !!raw.ha?.solar.length);
		if (!loadIncludesSolar) {
			const inj = raw.injection ? new Map(raw.injection.hourly) : null;
			cons.load = reconstructLoad({
				localHour: cons.localHour,
				localDay: cons.localDay,
				import: cons.load,
				production: basePv,
				export: inj ? cons.steps.map((t) => inj.get(t)) : undefined
			});
			cons.pilotable = cons.pilotable.map((v, i) => Math.min(v, cons.load[i]));
			cons.sources = [...cons.sources, raw.injection ? 'injection Enedis' : 'production estimée'];
		}
	}

	const pvYears = [{ year: year0, pv: main.pv, basePv }];
	for (let k = 1; k <= s.source.weatherYears; k++) {
		progress(`Météo des années passées (${k}/${s.source.weatherYears})`);
		try {
			const y = await yearPv(planes, k);
			const b = hasExisting
				? (await yearPv([existingPlane], k)).pv.map((v) => v * ex.kwc * factor)
				: undefined;
			pvYears.push({ year: year0 - k, pv: y.pv, basePv: b });
		} catch {
			break;
		}
	}

	return {
		prepared: { cons, temp: main.temp, pv: main.pv, basePv, pvYears },
		measuredRatio,
		calibratedBy
	};
}

/** Année reçue par un lien de partage : déjà fusionnée, on recalcule seulement le calendrier local. */
export function consumptionFromShared(d: SharedData): Consumption {
	const load = unpackSeries(d.load);
	const steps = load.map((_, i) => d.start + i * 3_600_000);
	const parts = steps.map((t) => localParts(t, d.tz));
	return {
		tz: d.tz,
		steps,
		localHour: parts.map((p) => p.hour),
		localDay: parts.map((p) => p.day),
		load,
		pilotable: unpackSeries(d.pilotable),
		months: d.months,
		sources: [...d.sources, 'reçue par lien']
	};
}

/** Masque d'horizon depuis le relief (API elevation d'Open-Meteo, données Copernicus 90 m). */
export async function fetchHorizon(
	lat: number,
	lon: number
): Promise<{ angles: number[]; elevation: number }> {
	const pts = horizonSamplePoints(lat, lon);
	const all = [{ latitude: lat, longitude: lon }, ...pts];
	const elev: number[] = [];
	for (let i = 0; i < all.length; i += 100) {
		const r = await fetch(elevationUrl(all.slice(i, i + 100)));
		if (!r.ok) throw new Error('Relief indisponible');
		elev.push(...((await r.json()) as { elevation: number[] }).elevation);
	}
	// panneaux sur le toit : environ 6 m au-dessus du sol
	const site = elev[0] + 6;
	const h = horizonFromElevations(site, pts, elev.slice(1));
	if (h.angles.length !== HORIZON_SECTORS) throw new Error('Relief incomplet');
	return { angles: h.angles, elevation: elev[0] };
}

export interface Place {
	label: string;
	latitude: number;
	longitude: number;
}

/** Adresse française (Géoplateforme IGN), sinon commune (Open-Meteo). */
export async function searchPlace(q: string): Promise<Place[]> {
	try {
		const r = await fetch(
			`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=5`
		);
		if (r.ok) {
			const j = await r.json();
			const out = (j.features ?? []).map(
				(f: { properties: { label: string }; geometry: { coordinates: [number, number] } }) => ({
					label: f.properties.label,
					latitude: f.geometry.coordinates[1],
					longitude: f.geometry.coordinates[0]
				})
			);
			if (out.length) return out;
		}
	} catch {
		/* repli ci-dessous */
	}
	const r = await fetch(
		`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=fr`
	);
	const j = await r.json();
	return (j.results ?? []).map(
		(x: {
			name: string;
			admin1?: string;
			country?: string;
			latitude: number;
			longitude: number;
		}) => ({
			label: [x.name, x.admin1, x.country].filter(Boolean).join(', '),
			latitude: x.latitude,
			longitude: x.longitude
		})
	);
}
