/**
 * Client Home Assistant minimal (websocket, jeton longue durée).
 * Lecture seule : configuration, tableau Énergie, statistiques horaires.
 */
export class HaError extends Error {}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class HaClient {
	private ws!: WebSocket;
	private id = 1;
	private pending = new Map<number, Pending>();
	version = '';

	static async connect(url: string, token: string, timeoutMs = 15000): Promise<HaClient> {
		const c = new HaClient();
		await c.open(url, token, timeoutMs);
		return c;
	}

	private open(url: string, token: string, timeoutMs: number) {
		const wsUrl = normalizeUrl(url).replace(/^http/, 'ws') + '/api/websocket';
		return new Promise<void>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new HaError('Pas de réponse de Home Assistant (adresse ou certificat ?)')),
				timeoutMs
			);
			try {
				this.ws = new WebSocket(wsUrl);
			} catch {
				clearTimeout(timer);
				reject(new HaError('Adresse invalide'));
				return;
			}
			this.ws.onerror = () => {
				clearTimeout(timer);
				reject(new HaError('Connexion impossible (adresse, HTTPS ou certificat client ?)'));
			};
			this.ws.onclose = () => {
				for (const p of this.pending.values()) p.reject(new HaError('Connexion fermée'));
				this.pending.clear();
			};
			this.ws.onmessage = (e) => {
				const m = JSON.parse(e.data);
				if (m.type === 'auth_required') {
					this.ws.send(JSON.stringify({ type: 'auth', access_token: token }));
				} else if (m.type === 'auth_ok') {
					clearTimeout(timer);
					this.version = m.ha_version;
					resolve();
				} else if (m.type === 'auth_invalid') {
					clearTimeout(timer);
					reject(new HaError('Jeton refusé par Home Assistant'));
				} else if (m.type === 'result') {
					const p = this.pending.get(m.id);
					if (!p) return;
					this.pending.delete(m.id);
					if (m.success) p.resolve(m.result);
					else p.reject(new HaError(m.error?.message ?? 'Erreur Home Assistant'));
				}
			};
		});
	}

	call<T>(type: string, data: Record<string, unknown> = {}): Promise<T> {
		const id = this.id++;
		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
			this.ws.send(JSON.stringify({ id, type, ...data }));
		});
	}

	close() {
		this.ws?.close();
	}
}

export function normalizeUrl(url: string): string {
	let u = url.trim().replace(/\/+$/, '');
	if (!/^https?:\/\//.test(u)) u = 'https://' + u;
	return u;
}

export interface HaConfig {
	latitude: number;
	longitude: number;
	elevation: number;
	time_zone: string;
	location_name: string;
	currency: string;
}

/** Statistiques lues dans le tableau Énergie. */
export interface EnergyStats {
	gridImport: string[];
	gridExport: string[];
	solar: string[];
	devices: { id: string; name: string }[];
	/** Prix fixe du kWh saisi dans le tableau Énergie, s'il existe. */
	price: number | null;
}

interface GridSource {
	type: 'grid';
	stat_energy_from?: string | null;
	stat_energy_to?: string | null;
	flow_from?: { stat_energy_from: string }[];
	flow_to?: { stat_energy_to: string }[];
	number_energy_price?: number | null;
}
interface EnergyPrefs {
	energy_sources: ({ type: string; stat_energy_from?: string } & Partial<GridSource>)[];
	device_consumption: { stat_consumption: string; name?: string }[];
}

/** Accepte l'ancien format (flow_from/flow_to) et le nouveau (stat_energy_from/to). */
export function parseEnergyPrefs(
	prefs: EnergyPrefs,
	names: Record<string, string> = {}
): EnergyStats {
	const out: EnergyStats = { gridImport: [], gridExport: [], solar: [], devices: [], price: null };
	for (const s of prefs.energy_sources) {
		if (s.type === 'grid') {
			if (s.stat_energy_from) out.gridImport.push(s.stat_energy_from);
			if (s.stat_energy_to) out.gridExport.push(s.stat_energy_to);
			for (const f of s.flow_from ?? []) out.gridImport.push(f.stat_energy_from);
			for (const f of s.flow_to ?? []) out.gridExport.push(f.stat_energy_to);
			if (s.number_energy_price) out.price ??= s.number_energy_price;
		} else if (s.type === 'solar' && s.stat_energy_from) out.solar.push(s.stat_energy_from);
	}
	out.devices = prefs.device_consumption.map((d) => ({
		id: d.stat_consumption,
		name: d.name || names[d.stat_consumption] || d.stat_consumption
	}));
	return out;
}

const HOUR = 3_600_000;

/** Variation horaire de statistiques cumulées, kWh, indexée par début d'heure UTC. */
export async function hourlyChanges(
	ha: HaClient,
	ids: string[],
	startMs: number,
	endMs: number
): Promise<Map<string, Map<number, number>>> {
	const out = new Map<string, Map<number, number>>(ids.map((id) => [id, new Map()]));
	if (!ids.length) return out;
	// par tranches de 3 mois pour garder des réponses raisonnables
	for (let t = startMs; t < endMs; t += 92 * 24 * HOUR) {
		const r = await ha.call<Record<string, { start: number; change: number | null }[]>>(
			'recorder/statistics_during_period',
			{
				start_time: new Date(t).toISOString(),
				end_time: new Date(Math.min(endMs, t + 92 * 24 * HOUR)).toISOString(),
				statistic_ids: ids,
				period: 'hour',
				types: ['change'],
				units: { energy: 'kWh' }
			}
		);
		for (const [id, rows] of Object.entries(r)) {
			const m = out.get(id)!;
			// une remise à zéro du compteur donne une valeur négative ou aberrante : ignorée
			for (const row of rows)
				if (row.change !== null && row.change >= 0 && row.change < 50) m.set(row.start, row.change);
		}
	}
	return out;
}

export interface HaImport {
	config: HaConfig;
	energy: EnergyStats;
}

export async function readHaSetup(ha: HaClient): Promise<HaImport> {
	const [config, prefs, meta] = await Promise.all([
		ha.call<HaConfig>('get_config'),
		ha.call<EnergyPrefs>('energy/get_prefs'),
		ha.call<{ statistic_id: string; name: string | null }[]>('recorder/list_statistic_ids', {
			statistic_type: 'sum'
		})
	]);
	const names = Object.fromEntries(
		meta.filter((m) => m.name).map((m) => [m.statistic_id, m.name!])
	);
	return { config, energy: parseEnergyPrefs(prefs, names) };
}

/**
 * Consommation réelle du logement par heure : achat − revente + production solaire
 * existante. `pilotable` = appareil choisi (cumulus…), plafonné à la consommation.
 */
export async function readHaConsumption(
	ha: HaClient,
	energy: EnergyStats,
	pilotableIds: string[],
	startMs: number,
	endMs: number
): Promise<{
	hours: Map<number, { load: number; pilotable: number }>;
	solar: Map<number, number>;
}> {
	const ids = [...energy.gridImport, ...energy.gridExport, ...energy.solar, ...pilotableIds];
	const ch = await hourlyChanges(ha, [...new Set(ids)], startMs, endMs);
	const hours = new Map<number, { load: number; pilotable: number }>();
	const solar = new Map<number, number>();
	const first = energy.gridImport[0];
	if (!first) return { hours, solar };
	for (const t of ch.get(first)!.keys()) {
		const sum = (list: string[]) => list.reduce((s, id) => s + (ch.get(id)?.get(t) ?? 0), 0);
		const sol = sum(energy.solar);
		const load = Math.max(0, sum(energy.gridImport) - sum(energy.gridExport) + sol);
		if (sol) solar.set(t, sol);
		hours.set(t, { load, pilotable: Math.min(load, sum(pilotableIds)) });
	}
	return { hours, solar };
}
