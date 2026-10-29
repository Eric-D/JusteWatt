import type { ProjectSettings } from './model';

/** Partage sans serveur : la configuration voyage dans l'URL (après #), jamais les mesures. */
async function deflate(text: string): Promise<string> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function inflate(b64: string): Promise<string> {
	const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Response(stream).text();
}

/** Ce qui est partagé : toit, hypothèses, scénarios et devis. Ni adresse HA, ni position précise. */
export type SharedProject = Pick<
	ProjectSettings,
	'economics' | 'current' | 'scenarios' | 'quotes' | 'evolutions'
> & {
	planes: ProjectSettings['site']['planes'];
};

export function shareable(s: ProjectSettings): SharedProject {
	return {
		economics: s.economics,
		current: s.current,
		scenarios: s.scenarios,
		quotes: s.quotes,
		evolutions: s.evolutions,
		planes: s.site.planes
	};
}

export async function shareUrl(s: ProjectSettings, base: string): Promise<string> {
	return `${base}#p=${await deflate(JSON.stringify(shareable(s)))}`;
}

export async function readShared(hash: string): Promise<SharedProject | null> {
	const m = hash.match(/[#&]p=([\w-]+)/);
	if (!m) return null;
	try {
		return JSON.parse(await inflate(m[1]));
	} catch {
		return null;
	}
}

export function download(name: string, content: string, type = 'application/json') {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const a = Object.assign(document.createElement('a'), { href: url, download: name });
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
