/** Masque d'horizon : hauteur du relief (degrés) tous les `360 / n` degrés d'azimut. */
export interface Horizon {
	/** Index 0 = sud, puis vers l'ouest (convention Open-Meteo, pas de 360/n). */
	angles: number[];
}

const EARTH = 6_371_000;
/** Distances d'échantillonnage du relief, m : proche (collines) à lointain (montagnes). */
export const HORIZON_DISTANCES = [500, 1500, 4000, 10000];
export const HORIZON_SECTORS = 24;

/** Points à interroger (API elevation d'Open-Meteo, 100 points max par appel). */
export function horizonSamplePoints(latitude: number, longitude: number) {
	const pts: { latitude: number; longitude: number; sector: number; distance: number }[] = [];
	for (let s = 0; s < HORIZON_SECTORS; s++) {
		// azimut depuis le sud vers l'ouest → cap géographique depuis le nord
		const bearing = ((180 + (s * 360) / HORIZON_SECTORS) * Math.PI) / 180;
		for (const d of HORIZON_DISTANCES) {
			const dLat = (d * Math.cos(bearing)) / EARTH;
			const dLon = (d * Math.sin(bearing)) / (EARTH * Math.cos((latitude * Math.PI) / 180));
			pts.push({
				latitude: latitude + (dLat * 180) / Math.PI,
				longitude: longitude + (dLon * 180) / Math.PI,
				sector: s,
				distance: d
			});
		}
	}
	return pts;
}

export function elevationUrl(points: { latitude: number; longitude: number }[]): string {
	const lat = points.map((p) => p.latitude.toFixed(5)).join(',');
	const lon = points.map((p) => p.longitude.toFixed(5)).join(',');
	return `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
}

/** Hauteur angulaire du relief par secteur, courbure terrestre comprise. */
export function horizonFromElevations(
	siteElevation: number,
	points: { sector: number; distance: number }[],
	elevations: number[]
): Horizon {
	const angles = new Array<number>(HORIZON_SECTORS).fill(0);
	points.forEach((p, i) => {
		const drop = (p.distance * p.distance) / (2 * EARTH);
		const a = (Math.atan2(elevations[i] - siteElevation - drop, p.distance) * 180) / Math.PI;
		angles[p.sector] = Math.max(angles[p.sector], a);
	});
	return { angles: angles.map((a) => Math.round(a * 10) / 10) };
}

/** Hauteur du masque dans la direction `azimuth` (interpolation linéaire). */
export function horizonAt(h: Horizon, azimuth: number): number {
	const n = h.angles.length;
	const x = ((((azimuth % 360) + 360) % 360) * n) / 360;
	const i = Math.floor(x) % n;
	const f = x - Math.floor(x);
	return h.angles[i] * (1 - f) + h.angles[(i + 1) % n] * f;
}
