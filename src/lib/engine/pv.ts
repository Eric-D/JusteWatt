import { horizonAt, type Horizon } from './horizon';
import { cosIncidence, sunPosition } from './sun';

/**
 * Modèle de production à partir de l'irradiance sur le plan des panneaux.
 * Facteur calé sur PVGIS SARAH3 2020-2023 (pertes système 14 %) : avec
 * l'irradiance et la température PVGIS, il redonne exactement la production PVGIS.
 */
export const PV_CALIBRATION = 0.8111;
const TEMP_COEFF = -0.0035; // par °C
const CELL_HEATING = 0.03; // °C par W/m²
const HOUR = 3_600_000;

/** kWh produits pendant une heure par 1 kWc. */
export function pvPerKwc(gtiWm2: number, airTempC: number, calibration = PV_CALIBRATION): number {
	if (gtiWm2 <= 0) return 0;
	const cell = airTempC + CELL_HEATING * gtiWm2;
	return (calibration * gtiWm2 * (1 + TEMP_COEFF * (cell - 25))) / 1000;
}

export interface RoofPlane {
	/** Inclinaison, degrés depuis l'horizontale. */
	tilt: number;
	/** Orientation, degrés : 0 = sud, −90 = est, 90 = ouest (convention Open-Meteo). */
	azimuth: number;
}

export interface Site {
	latitude: number;
	longitude: number;
}

/** URL Open-Meteo (archive, appel direct depuis le navigateur). */
export function openMeteoUrl(
	site: Site,
	plane: RoofPlane,
	startDate: string,
	endDate: string
): string {
	const q = new URLSearchParams({
		latitude: site.latitude.toFixed(4),
		longitude: site.longitude.toFixed(4),
		start_date: startDate,
		end_date: endDate,
		hourly: 'global_tilted_irradiance,direct_normal_irradiance,temperature_2m',
		tilt: String(plane.tilt),
		azimuth: String(plane.azimuth),
		timezone: 'UTC'
	});
	return `https://archive-api.open-meteo.com/v1/archive?${q}`;
}

export interface OpenMeteoHourly {
	elevation?: number;
	hourly: {
		time: string[];
		global_tilted_irradiance: (number | null)[];
		direct_normal_irradiance?: (number | null)[];
		temperature_2m: (number | null)[];
	};
}

/** Météo horaire contiguë ; `start` = début de la première heure, UTC ms. */
export interface WeatherHours {
	start: number;
	gti: Float32Array;
	dni: Float32Array;
	temp: Float32Array;
}

/** Open-Meteo donne la moyenne de l'heure *précédente* : on décale d'une heure. */
export function weatherFromOpenMeteo(data: OpenMeteoHourly): WeatherHours {
	const h = data.hourly;
	const n = h.time.length;
	const w = {
		start: Date.parse(h.time[0] + 'Z') - HOUR,
		gti: new Float32Array(n),
		dni: new Float32Array(n),
		temp: new Float32Array(n)
	};
	for (let i = 0; i < n; i++) {
		w.gti[i] = h.global_tilted_irradiance[i] ?? 0;
		w.dni[i] = h.direct_normal_irradiance?.[i] ?? 0;
		w.temp[i] = h.temperature_2m[i] ?? 15;
	}
	return w;
}

/** Concatène des tranches contiguës (une requête par année). */
export function concatWeather(parts: WeatherHours[]): WeatherHours {
	const sorted = [...parts].sort((a, b) => a.start - b.start);
	const start = sorted[0].start;
	const last = sorted[sorted.length - 1];
	const n = (last.start - start) / HOUR + last.gti.length;
	const w = {
		start,
		gti: new Float32Array(n),
		dni: new Float32Array(n),
		temp: new Float32Array(n).fill(15)
	};
	for (const p of sorted) {
		const o = (p.start - start) / HOUR;
		w.gti.set(p.gti, o);
		w.dni.set(p.dni, o);
		w.temp.set(p.temp, o);
	}
	return w;
}

/**
 * Production par kWc pour chaque heure de la météo.
 * Quand le soleil est sous le relief, la part directe est retirée (il reste le diffus).
 */
export function pvFromWeather(
	w: WeatherHours,
	site: Site,
	plane: RoofPlane,
	horizon: Horizon | null,
	calibration = PV_CALIBRATION
): Float32Array {
	const out = new Float32Array(w.gti.length);
	for (let i = 0; i < out.length; i++) {
		let g = w.gti[i];
		if (g <= 0) continue;
		if (horizon) {
			const sun = sunPosition(w.start + i * HOUR + HOUR / 2, site.latitude, site.longitude);
			if (sun.elevation > 0 && sun.elevation < horizonAt(horizon, sun.azimuth)) {
				g = Math.max(0, g - w.dni[i] * Math.max(0, cosIncidence(sun, plane.tilt, plane.azimuth)));
			}
		}
		out[i] = pvPerKwc(g, w.temp[i], calibration);
	}
	return out;
}

/** Valeur horaire pour chaque pas UTC (0 hors de la plage). */
export function onSteps(steps: number[], w: WeatherHours, values: Float32Array): number[] {
	return steps.map((t) => {
		const i = Math.round((t - w.start) / HOUR);
		return i >= 0 && i < values.length ? values[i] : 0;
	});
}

/** Même pas, `years` années plus tôt (même jour, même heure UTC). */
export function shiftYears(steps: number[], years: number): number[] {
	return steps.map((t) => {
		const d = new Date(t);
		d.setUTCFullYear(d.getUTCFullYear() - years);
		return d.getTime();
	});
}
