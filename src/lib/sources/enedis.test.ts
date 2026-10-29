import { describe, expect, it } from 'vitest';
import { monthlyFromDaily, parseEnedisCsv } from './enedis';

describe('CSV Enedis', () => {
	it('courbe de charge 30 min en W', () => {
		const csv = [
			'Identifiant PRM;Type de donnees;Date de debut;Date de fin;Grandeur physique;Grandeur metier;Etape metier;Unite',
			'00000000000000;Courbe de charge;01/01/2025;02/01/2025;Energie active;Consommation;Comptage Brut;W',
			'Horodate;Valeur',
			'2025-01-01T00:30:00+01:00;1000',
			'2025-01-01T01:00:00+01:00;3000',
			'2025-01-01T01:30:00+01:00;2000'
		].join('\n');
		const r = parseEnedisCsv(csv);
		expect(r.kind).toBe('curve');
		// 1000 W et 3000 W pendant 30 min = 2 kWh sur l'heure 00:00 locale
		expect(r.hourly.get(Date.parse('2024-12-31T23:00:00Z'))).toBeCloseTo(2, 6);
		expect(r.daily.get('2025-01-01')).toBeCloseTo(3, 6);
	});

	it('consommation journalière en Wh', () => {
		const csv = ['Horodate;Valeur', '2025-01-01;12000', '2025-01-02;8000', '2025-02-01;10000'].join(
			'\n'
		);
		const r = parseEnedisCsv(csv);
		expect(r.kind).toBe('daily');
		expect(monthlyFromDaily(r.daily)['2025-01']).toEqual({ kwh: 20, days: 2 });
	});

	it('fichier illisible', () => {
		expect(() => parseEnedisCsv('bonjour\nau revoir')).toThrow();
	});
});
