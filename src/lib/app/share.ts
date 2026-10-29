import type { MonthReport } from '#lib/engine/fusion.js';
import type { Consumption } from '#lib/sources/consumption.js';
import type { ProjectSettings, SiteSettings } from './model';

/**
 * Partage sans serveur : tout voyage dans l'URL après « # » (jamais envoyé au serveur).
 * - `#p=` : contenu compressé, lisible par quiconque a le lien ;
 * - `#e=` : contenu compressé puis chiffré (AES-GCM 256, clé PBKDF2 depuis un mot de passe).
 * Le mot de passe est obligatoire dès que le lien contient la position ou la connexion HA.
 */

/** Hypothèses, toit, scénarios et devis : jamais identifiant à eux seuls. */
export type SharedProject = Pick<
	ProjectSettings,
	'economics' | 'current' | 'scenarios' | 'quotes' | 'evolutions' | 'cumulus' | 'gridCharge'
> & {
	planes: SiteSettings['planes'];
	surface: number;
};

export interface SharedData {
	tz: string;
	/** Début du premier pas, UTC ms. */
	start: number;
	/** Consommation horaire en Wh, codée en écarts successifs. */
	load: number[];
	pilotable: number[];
	months: MonthReport[];
	sources: string[];
}

export interface SharePayload {
	v: 2;
	project: SharedProject;
	site?: Pick<
		SiteSettings,
		'name' | 'latitude' | 'longitude' | 'elevation' | 'tz' | 'horizon' | 'useHorizon'
	>;
	data?: SharedData;
	ha?: { url: string; token: string };
}

export interface ShareOptions {
	data: boolean;
	site: boolean;
	ha: { url: string; token: string } | null;
}

export const needsPassword = (o: ShareOptions) => o.site || !!o.ha;

// --- encodage

const b64 = (bytes: Uint8Array) => {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (s: string) =>
	Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream) {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(t);
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
const deflate = (text: string) =>
	pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw'));
const inflate = async (bytes: Uint8Array) =>
	new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')));

/** Wh entiers en écarts successifs : se compresse bien et garde la précision du kWh. */
export function packSeries(kwh: ArrayLike<number>): number[] {
	const out = new Array<number>(kwh.length);
	let prev = 0;
	for (let i = 0; i < kwh.length; i++) {
		const wh = Math.round(kwh[i] * 1000);
		out[i] = wh - prev;
		prev = wh;
	}
	return out;
}
export function unpackSeries(d: number[]): number[] {
	const out = new Array<number>(d.length);
	let acc = 0;
	for (let i = 0; i < d.length; i++) out[i] = (acc += d[i]) / 1000;
	return out;
}

// --- chiffrement

const ITERATIONS = 310_000;
async function key(password: string, salt: Uint8Array) {
	const base = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export class WrongPassword extends Error {}

export async function encodeShare(payload: SharePayload, password: string): Promise<string> {
	const packed = await deflate(JSON.stringify(payload));
	if (!password) return `p=${b64(packed)}`;
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const sealed = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(password, salt), packed)
	);
	return `e=${b64(salt)}.${b64(iv)}.${b64(sealed)}`;
}

/** Ce que contient le fragment d'URL : rien, un lien lisible, ou un lien chiffré. */
export function shareKind(hash: string): 'none' | 'plain' | 'encrypted' {
	if (/[#&]e=/.test(hash)) return 'encrypted';
	if (/[#&]p=/.test(hash)) return 'plain';
	return 'none';
}

export async function decodeShare(hash: string, password = ''): Promise<SharePayload | null> {
	const e = hash.match(/[#&]e=([\w-]+)\.([\w-]+)\.([\w-]+)/);
	const p = hash.match(/[#&]p=([\w-]+)/);
	let packed: Uint8Array;
	if (e) {
		try {
			const plain = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv: unb64(e[2]) as BufferSource },
				await key(password, unb64(e[1])),
				unb64(e[3]) as BufferSource
			);
			packed = new Uint8Array(plain);
		} catch {
			throw new WrongPassword('Mot de passe incorrect');
		}
	} else if (p) packed = unb64(p[1]);
	else return null;
	const json = JSON.parse(await inflate(packed));
	// liens de la première version : projet seul
	if (json.v !== 2)
		return { v: 2, project: { ...json, surface: 30, cumulus: undefined!, gridCharge: undefined! } };
	return json;
}

export function buildPayload(
	s: ProjectSettings,
	cons: Consumption | null,
	o: ShareOptions
): SharePayload {
	const payload: SharePayload = {
		v: 2,
		project: {
			economics: s.economics,
			current: s.current,
			scenarios: s.scenarios,
			quotes: s.quotes,
			evolutions: s.evolutions,
			cumulus: s.cumulus,
			gridCharge: s.gridCharge,
			planes: s.site.planes,
			surface: s.site.surface
		}
	};
	if (o.site) {
		const { name, latitude, longitude, elevation, tz, horizon, useHorizon } = s.site;
		payload.site = { name, latitude, longitude, elevation, tz, horizon, useHorizon };
	}
	if (o.data && cons) {
		payload.data = {
			tz: cons.tz,
			start: cons.steps[0],
			load: packSeries(cons.load),
			pilotable: packSeries(cons.pilotable),
			months: cons.months,
			sources: cons.sources
		};
	}
	if (o.ha) payload.ha = o.ha;
	return payload;
}

export function download(name: string, content: string, type = 'application/json') {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const a = Object.assign(document.createElement('a'), { href: url, download: name });
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
