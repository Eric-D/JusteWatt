import { describe, expect, it } from 'vitest';
import {
	decodeShare,
	encodeShare,
	packSeries,
	unpackSeries,
	WrongPassword,
	type SharePayload
} from './share';
import { defaultSettings } from './model';

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
