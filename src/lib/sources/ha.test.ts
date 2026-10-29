import { describe, expect, it } from 'vitest';
import { parseEnergyPrefs } from './ha';

describe('tableau Énergie de Home Assistant', () => {
	it('noms d’appareils lisibles', () => {
		const e = parseEnergyPrefs(
			{
				energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.achat' }],
				device_consumption: [
					{ stat_consumption: 'sensor.salon_energie' },
					{ stat_consumption: 'sensor.clim' },
					{ stat_consumption: 'sensor.pac', name: 'Pompe à chaleur' }
				]
			},
			{ 'sensor.salon_energie': 'Salon Énergie', 'sensor.clim': 'ESP32_Clim Energy usage' }
		);
		expect(e.gridImport).toEqual(['sensor.achat']);
		expect(e.devices.map((d) => d.name)).toEqual(['Salon', 'ESP32_Clim', 'Pompe à chaleur']);
	});
});
