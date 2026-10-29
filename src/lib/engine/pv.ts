/**
 * Modèle de production à partir de l'irradiance sur le plan des panneaux.
 * Facteur calé sur PVGIS SARAH3 2020-2023 (pertes système 14 %) : avec
 * l'irradiance et la température PVGIS, il redonne exactement la production PVGIS.
 */
export const PV_CALIBRATION = 0.8111;
const TEMP_COEFF = -0.0035; // par °C
const CELL_HEATING = 0.03; // °C par W/m²

/** kWh produits pendant une heure par 1 kWc. */
export function pvPerKwc(gtiWm2: number, airTempC: number, calibration = PV_CALIBRATION): number {
	if (gtiWm2 <= 0) return 0;
	const cell = airTempC + CELL_HEATING * gtiWm2;
	return (calibration * gtiWm2 * (1 + TEMP_COEFF * (cell - 25))) / 1000;
}

export interface RoofPlane {
	latitude: number;
	longitude: number;
	/** Inclinaison, degrés depuis l'horizontale. */
	tilt: number;
	/** Orientation, degrés : 0 = sud, −90 = est, 90 = ouest (convention Open-Meteo). */
	azimuth: number;
}

/** URL Open-Meteo (archive, appel direct depuis le navigateur). */
export function openMeteoUrl(plane: RoofPlane, startDate: string, endDate: string): string {
	const q = new URLSearchParams({
		latitude: String(plane.latitude),
		longitude: String(plane.longitude),
		start_date: startDate,
		end_date: endDate,
		hourly: 'global_tilted_irradiance,temperature_2m',
		tilt: String(plane.tilt),
		azimuth: String(plane.azimuth),
		timezone: 'UTC'
	});
	return `https://archive-api.open-meteo.com/v1/archive?${q}`;
}

interface OpenMeteoHourly {
	hourly: {
		time: string[];
		global_tilted_irradiance: (number | null)[];
		temperature_2m: (number | null)[];
	};
}

/**
 * Production par kWc indexée par début d'heure UTC (ms).
 * Open-Meteo donne la moyenne de l'heure *précédente* : on décale d'une heure.
 */
export function pvSeriesFromOpenMeteo(data: OpenMeteoHourly): Map<number, number> {
	const out = new Map<number, number>();
	const h = data.hourly;
	for (let i = 0; i < h.time.length; i++) {
		const t = Date.parse(h.time[i] + 'Z') - 3_600_000;
		out.set(t, pvPerKwc(h.global_tilted_irradiance[i] ?? 0, h.temperature_2m[i] ?? 15));
	}
	return out;
}
