import type { Page } from '@playwright/test';

/** Open-Meteo et géocodage simulés : tests reproductibles, sans réseau. */
export async function mockApis(page: Page) {
	await page.route('https://archive-api.open-meteo.com/**', async (route) => {
		const u = new URL(route.request().url());
		const start = Date.parse(u.searchParams.get('start_date')! + 'T00:00Z');
		const end = Date.parse(u.searchParams.get('end_date')! + 'T23:00Z');
		const time: string[] = [];
		const gti: number[] = [];
		const dni: number[] = [];
		const temp: number[] = [];
		for (let t = start; t <= end; t += 3_600_000) {
			const d = new Date(t);
			const doy = (t - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000;
			const sun = Math.max(0, Math.sin(((d.getUTCHours() - 5) / 14) * Math.PI));
			const season = 0.55 + 0.45 * Math.cos((2 * Math.PI * (doy - 172)) / 365);
			time.push(d.toISOString().slice(0, 16));
			gti.push(Math.round(900 * sun * season));
			dni.push(Math.round(600 * sun * season));
			temp.push(12 - 10 * Math.cos((2 * Math.PI * (doy - 15)) / 365));
		}
		await route.fulfill({
			json: {
				hourly: {
					time,
					global_tilted_irradiance: gti,
					direct_normal_irradiance: dni,
					temperature_2m: temp
				}
			}
		});
	});
	await page.route('https://api.open-meteo.com/v1/elevation**', async (route) => {
		const n = new URL(route.request().url()).searchParams.get('latitude')!.split(',').length;
		await route.fulfill({
			json: { elevation: Array.from({ length: n }, (_, i) => 200 + (i % 7) * 15) }
		});
	});
	await page.route('https://data.geopf.fr/**', (route) =>
		route.fulfill({
			json: {
				features: [
					{
						properties: { label: '1 Place Bellecour 69002 Lyon' },
						geometry: { coordinates: [4.832, 45.757] }
					}
				]
			}
		})
	);
}
