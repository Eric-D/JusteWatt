import { describe, expect, it } from 'vitest';
import {
	buildPayload,
	decodeShare,
	encodeShare,
	packSeries,
	unpackSeries,
	WrongPassword,
	type SharePayload
} from './share';
import { defaultSettings } from './model';
import { consumptionFromShared } from './pipeline';

const s = defaultSettings();
const payload: SharePayload = {
	v: 2,
	project: { ...s, planes: s.site.planes, surface: 30 },
	site: { ...s.site },
	data: {
		tz: 'Europe/Paris',
		start: 0,
		load: packSeries([0.5, 1.2345, 0.8]),
		pilotable: packSeries([0, 0, 0.4]),
		months: [],
		sources: ['Home Assistant']
	},
	ha: { url: 'https://maison.exemple.fr', token: 'secret' }
};

describe('lien de partage', () => {
	it('séries au Wh près', () => {
		expect(unpackSeries(packSeries([0.5, 1.2345, 0.8]))).toEqual([0.5, 1.235, 0.8]);
	});

	it('lien lisible : aller-retour', async () => {
		const h = '#' + (await encodeShare(payload, ''));
		expect(h.startsWith('#p=')).toBe(true);
		expect((await decodeShare(h))?.ha?.token).toBe('secret');
	});

	it('lien chiffré : rien de lisible, mot de passe exigé', async () => {
		const h = '#' + (await encodeShare(payload, 'correct horse'));
		expect(h.startsWith('#e=')).toBe(true);
		expect(h).not.toContain('secret');
		expect((await decodeShare(h, 'correct horse'))?.site?.latitude).toBe(s.site.latitude);
		await expect(decodeShare(h, 'faux')).rejects.toBeInstanceOf(WrongPassword);
	});
});

describe('détail par appareil', () => {
	const cons = {
		tz: 'Europe/Paris',
		steps: [0, 3_600_000, 7_200_000],
		localHour: [1, 2, 3],
		localDay: ['2025-01-01', '2025-01-01', '2025-01-01'],
		load: [0.5, 1.2, 0.8],
		pilotable: [0, 0, 0],
		months: [],
		sources: ['Home Assistant'],
		devices: [{ name: 'Clim chambre', kwh: [NaN, 0.4, 0] }]
	};
	const opts = { data: true, site: false, ha: null };

	it('absent par défaut', () => {
		expect(buildPayload(s, cons, opts).data?.devices).toBeUndefined();
	});

	it('aller-retour, heures non mesurées comprises', () => {
		const d = buildPayload(s, cons, { ...opts, devices: true }).data!;
		const back = consumptionFromShared(d).devices!;
		expect(back[0].name).toBe('Clim chambre');
		expect(Number.isNaN(back[0].kwh[0])).toBe(true);
		expect(back[0].kwh.slice(1)).toEqual([0.4, 0]);
	});
});
