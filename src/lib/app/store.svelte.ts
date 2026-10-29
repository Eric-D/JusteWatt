import { browser } from '$app/env';
import {
	buildContext,
	outcome,
	type Context,
	type MapCell,
	type Outcome,
	type Prepared,
	type Spread
} from './compute';
import { idb } from './idb';
import { defaultSettings, defaultTariff, uid, type ProjectSettings, type Scenario } from './model';
import { prepare, toRawEnedis, type RawEnedis, type RawHa } from './pipeline';
import {
	buildPayload,
	encodeShare,
	type SharedData,
	type SharePayload,
	type ShareOptions
} from './share';
import type { WorkerRequest } from './worker';
import { HaClient, readHaConsumption, readHaSetup, type HaImport } from '#lib/sources/ha.js';
import { parseEnedisCsv } from '#lib/sources/enedis.js';
import { DEMO_SITE } from '#lib/sources/demo.js';
import { yearBefore } from '#lib/sources/consumption.js';
import { defaultEndMonth } from './pipeline';

const KEY = 'justewatt.settings';
const TOKEN_KEY = 'justewatt.ha';

function load(): ProjectSettings {
	try {
		const raw = browser ? localStorage.getItem(KEY) : null;
		if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
	} catch {
		/* réglages illisibles : on repart des valeurs par défaut */
	}
	return defaultSettings();
}

type Request = WorkerRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never;
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

class AppStore {
	settings = $state<ProjectSettings>(load());
	prepared = $state.raw<Prepared | null>(null);
	raw = $state.raw<{
		ha: RawHa | null;
		enedis: RawEnedis | null;
		injection: RawEnedis | null;
		shared: SharedData | null;
	}>({ ha: null, enedis: null, injection: null, shared: null });
	ha = $state.raw<HaImport | null>(null);
	measuredRatio = $state<number | null>(null);
	calibratedBy = $state<'ha' | 'annual' | null>(null);
	busy = $state('');
	error = $state('');
	ready = $state(false);

	map = $state.raw<{ cells: MapCell[]; ms: number } | null>(null);
	/** Empreinte des réglages qui demandent de recharger les données. */
	private preparedKey = $state('');
	inputsKey = $derived(
		JSON.stringify([
			this.settings.site.latitude,
			this.settings.site.longitude,
			this.settings.site.planes,
			this.settings.site.useHorizon && this.settings.site.horizon,
			this.settings.source.calibration,
			this.settings.source.endMonth,
			this.settings.source.weatherYears,
			this.settings.source.kind,
			this.settings.existing.enabled,
			this.settings.existing.kwc,
			this.settings.existing.tilt,
			this.settings.existing.azimuth,
			this.settings.existing.annualProduction
		])
	);
	get dirty() {
		return !!this.prepared && this.preparedKey !== this.inputsKey;
	}
	spread = $state.raw<Spread | null>(null);

	private worker: Worker | null = null;
	private reqId = 1;
	private pending = new Map<number, Pending>();

	ctx: Context | null = $derived.by(() => {
		if (!this.prepared) return null;
		const s = this.settings;
		return buildContext(this.prepared, {
			evolutions: $state.snapshot(s.evolutions),
			cumulus: $state.snapshot(s.cumulus),
			gridCharge: $state.snapshot(s.gridCharge),
			economics: $state.snapshot(s.economics),
			existing: $state.snapshot(s.existing)
		});
	});

	result: Outcome | null = $derived.by(() =>
		this.ctx
			? outcome(
					this.ctx,
					$state.snapshot(this.settings.economics),
					$state.snapshot(this.settings.current)
				)
			: null
	);

	get hasData() {
		return this.settings.source.kind !== 'none';
	}

	/** À appeler une fois au démarrage (navigateur). */
	async init() {
		if (!browser || this.ready) return;
		$effect.root(() => {
			$effect(() => {
				const json = JSON.stringify(this.settings);
				try {
					localStorage.setItem(KEY, json);
				} catch {
					/* stockage plein ou interdit : l'application marche quand même */
				}
			});
		});
		const [ha, enedis, injection, shared] = await Promise.all([
			idb.get<RawHa>('raw.ha'),
			idb.get<RawEnedis>('raw.enedis'),
			idb.get<RawEnedis>('raw.injection'),
			idb.get<SharedData>('raw.shared')
		]);
		this.raw = {
			ha: ha ?? null,
			enedis: enedis ?? null,
			injection: injection ?? null,
			shared: shared ?? null
		};
		this.ready = true;
		if (this.hasData) await this.recompute();
	}

	token(): { url: string; token: string } | null {
		try {
			return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null');
		} catch {
			return null;
		}
	}

	private async run(label: string, fn: () => Promise<void>) {
		this.error = '';
		this.busy = label;
		try {
			await fn();
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.busy = '';
		}
	}

	async recompute() {
		await this.run('Calcul', async () => {
			this.preparedKey = this.inputsKey;
			const r = await prepare($state.snapshot(this.settings), this.raw, (m) => (this.busy = m));
			this.prepared = r.prepared;
			this.measuredRatio = r.measuredRatio;
			this.calibratedBy = r.calibratedBy;
			this.map = null;
			this.spread = null;
			await this.syncWorker();
		});
	}

	async startDemo() {
		const s = defaultSettings();
		s.current = { ...s.current, name: 'Démonstration', kwc: 4.5 };
		if (this.settings.existing.enabled) {
			s.existing = { ...s.existing, enabled: true };
			this.prepareUpgrade(s);
		}
		this.settings = s;
		await this.startDemoKeeping();
	}

	/** Mode « j'ai déjà des panneaux » : le scénario devient un ajout, sans revente. */
	setExisting(on: boolean) {
		const s = this.settings;
		s.existing.enabled = on;
		if (on) this.prepareUpgrade(s);
	}

	private prepareUpgrade(s: ProjectSettings) {
		s.economics.sellPrice = 0;
		s.current = {
			...s.current,
			name: 'Batterie',
			kwc: 0,
			battery: { ...s.current.battery, capacity: 5, power: 2.5 },
			investment: null,
			premium: false
		};
	}

	/** Données de démonstration, en gardant toit, hypothèses, scénarios et devis. */
	async startDemoKeeping() {
		const s = this.settings;
		s.source.kind = 'demo';
		Object.assign(s.site, {
			name: DEMO_SITE.name,
			latitude: DEMO_SITE.latitude,
			longitude: DEMO_SITE.longitude,
			elevation: DEMO_SITE.elevation,
			horizon: null
		});
		await this.recompute();
	}

	async connectHa(url: string, token: string) {
		await this.run('Connexion à Home Assistant', async () => {
			const client = await HaClient.connect(url, token);
			try {
				this.busy = 'Lecture du tableau Énergie';
				const setup = await readHaSetup(client);
				if (!setup.energy.gridImport.length)
					throw new Error('Aucun compteur réseau dans le tableau Énergie de Home Assistant');
				this.ha = setup;
				localStorage.setItem(TOKEN_KEY, JSON.stringify({ url, token }));
				const s = this.settings;
				s.source.kind = 'ha';
				s.source.haUrl = url;
				s.site.latitude = setup.config.latitude;
				s.site.longitude = setup.config.longitude;
				s.site.elevation = setup.config.elevation;
				s.site.tz = setup.config.time_zone;
				s.site.name = 'Position de Home Assistant';
				s.site.horizon = null;
				if (!s.source.haPilotable.length)
					s.source.haPilotable = setup.energy.devices
						.filter((d) => /cumulus|ballon|chauffe|eau chaude|ecs/i.test(d.name + d.id))
						.map((d) => d.id);
				if (setup.energy.price) s.economics.tariff.base = setup.energy.price;
				await this.loadHaHistory(client);
			} finally {
				client.close();
			}
		});
		if (!this.error) await this.recompute();
	}

	/** Relit l'historique (14 mois) avec la connexion enregistrée. */
	async refreshHa() {
		const t = this.token();
		if (!t) return;
		await this.run('Lecture de Home Assistant', async () => {
			const client = await HaClient.connect(t.url, t.token);
			try {
				this.ha = await readHaSetup(client);
				await this.loadHaHistory(client);
				this.settings.source.kind = 'ha';
			} finally {
				client.close();
			}
		});
		if (!this.error) await this.recompute();
	}

	private async loadHaHistory(client: HaClient) {
		const s = this.settings;
		const end = s.source.endMonth || defaultEndMonth($state.snapshot(s), null);
		const { startMs, endMs } = yearBefore(end, s.site.tz);
		this.busy = 'Lecture de l’historique horaire';
		const r = await readHaConsumption(
			client,
			this.ha!.energy,
			$state.snapshot(s.source.haPilotable),
			startMs - 31 * 86_400_000,
			endMs
		);
		const raw: RawHa = {
			hours: [...r.hours].map(([t, v]) => [t, v.load, v.pilotable]),
			solar: [...r.solar]
		};
		await idb.set('raw.ha', raw);
		this.raw = { ...this.raw, ha: raw };
	}

	async importEnedis(file: File) {
		await this.run('Lecture du fichier Enedis', async () => {
			const data = parseEnedisCsv(await file.text(), this.settings.site.tz);
			const raw = toRawEnedis(data);
			await idb.set('raw.enedis', raw);
			this.raw = { ...this.raw, enedis: raw };
			const s = this.settings;
			if (s.source.kind === 'none' || s.source.kind === 'demo' || s.source.kind === 'manual')
				s.source.kind = 'enedis';
			s.source.enedisFile = `${file.name} · ${data.kind === 'curve' ? 'courbe de charge' : 'journalier'} · ${data.first} → ${data.last}`;
		});
		if (!this.error) await this.recompute();
	}

	async clearEnedis() {
		await idb.del('raw.enedis');
		this.raw = { ...this.raw, enedis: null };
		this.settings.source.enedisFile = '';
		if (this.settings.source.kind === 'enedis')
			this.settings.source.kind = this.raw.ha ? 'ha' : 'none';
		if (this.hasData) await this.recompute();
	}

	/** Courbe Enedis de production injectée (panneaux existants). */
	async importInjection(file: File) {
		await this.run('Lecture de la courbe d’injection', async () => {
			const data = parseEnedisCsv(await file.text(), this.settings.site.tz);
			if (data.kind !== 'curve')
				throw new Error('Il faut la courbe de production au pas de 30 min');
			const raw = toRawEnedis(data);
			await idb.set('raw.injection', raw);
			this.raw = { ...this.raw, injection: raw };
			this.settings.source.injectionFile = `${file.name} · ${data.first} → ${data.last}`;
		});
		if (!this.error && this.hasData) await this.recompute();
	}

	async clearInjection() {
		await idb.del('raw.injection');
		this.raw = { ...this.raw, injection: null };
		this.settings.source.injectionFile = '';
		if (this.hasData) await this.recompute();
	}

	async useManual(monthly: Record<string, number>) {
		this.settings.source.kind = 'manual';
		this.settings.source.manualMonthly = monthly;
		await this.recompute();
	}

	/** Efface tout : réglages, jeton et données importées. */
	async reset() {
		localStorage.removeItem(KEY);
		localStorage.removeItem(TOKEN_KEY);
		await idb.clear();
		this.settings = defaultSettings();
		this.prepared = null;
		this.raw = { ha: null, enedis: null, injection: null, shared: null };
		this.ha = null;
		this.map = null;
		this.spread = null;
	}

	// --- partage par lien

	/** Fragment d'URL (« p=… » ou « e=… ») pour l'état actuel. */
	async shareFragment(o: ShareOptions, password: string): Promise<string> {
		const payload = buildPayload($state.snapshot(this.settings), this.prepared?.cons ?? null, o);
		return encodeShare(payload, password);
	}

	/** Remplace le projet de cet appareil par celui reçu (copie de travail). */
	async openShared(received: SharePayload) {
		// copie simple : un objet réactif ne peut pas être transmis au Web Worker
		const p = structuredClone($state.snapshot(received));
		const s = defaultSettings();
		const pr = p.project;
		Object.assign(s, {
			economics: pr.economics,
			current: pr.current,
			scenarios: pr.scenarios,
			quotes: pr.quotes,
			evolutions: pr.evolutions,
			cumulus: pr.cumulus ?? s.cumulus,
			gridCharge: pr.gridCharge ?? s.gridCharge,
			existing: pr.existing ?? s.existing
		});
		s.site.planes = pr.planes;
		s.site.surface = pr.surface ?? s.site.surface;
		if (p.site) Object.assign(s.site, p.site);
		await idb.del('raw.ha');
		await idb.del('raw.enedis');
		await idb.del('raw.injection');
		if (p.data) {
			await idb.set('raw.shared', p.data);
			s.source.kind = 'shared';
		} else await idb.del('raw.shared');
		this.raw = { ha: null, enedis: null, injection: null, shared: p.data ?? null };
		if (p.ha) {
			localStorage.setItem(TOKEN_KEY, JSON.stringify(p.ha));
			s.source.haUrl = p.ha.url;
			if (!p.data) s.source.kind = 'ha';
		} else localStorage.removeItem(TOKEN_KEY);
		this.ha = null;
		this.settings = s;
		if (!p.data && !p.ha) {
			// projet seul : rejoué sur les données de démonstration
			await this.startDemoKeeping();
			return;
		}
		if (s.source.kind === 'ha') await this.refreshHa();
		else await this.recompute();
	}

	// --- calculs lourds dans un Web Worker

	private async syncWorker() {
		if (!this.prepared) return;
		if (!this.worker) {
			this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
			this.worker.onmessage = (e) => {
				const p = this.pending.get(e.data.id);
				if (!p) return;
				this.pending.delete(e.data.id);
				if (e.data.error) p.reject(new Error(e.data.error));
				else p.resolve(e.data);
			};
		}
		const s = $state.snapshot(this.settings);
		await this.ask({
			type: 'context',
			prepared: this.prepared,
			settings: {
				evolutions: s.evolutions,
				cumulus: s.cumulus,
				gridCharge: s.gridCharge,
				economics: s.economics,
				existing: s.existing
			}
		});
	}

	private ask(req: Request): Promise<{ result: unknown; ms: number }> {
		const id = this.reqId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
			this.worker!.postMessage({ ...req, id });
		});
	}

	async explore() {
		await this.run('Simulation de toutes les combinaisons', async () => {
			await this.syncWorker();
			const s = $state.snapshot(this.settings);
			const r = await this.ask({ type: 'explore', economics: s.economics, scenario: s.current });
			this.map = { cells: r.result as MapCell[], ms: r.ms };
		});
	}

	async computeSpread() {
		await this.run('Calcul de l’incertitude', async () => {
			await this.syncWorker();
			const s = $state.snapshot(this.settings);
			const r = await this.ask({ type: 'spread', economics: s.economics, scenario: s.current });
			this.spread = r.result as Spread;
		});
	}

	// --- scénarios et devis

	saveScenario(name: string) {
		const sc = { ...$state.snapshot(this.settings.current), id: uid(), name };
		this.settings.scenarios = [...this.settings.scenarios, sc];
	}

	open(sc: Scenario) {
		this.settings.current = { ...structuredClone($state.snapshot(sc)), id: uid() };
	}

	setTariffKind(kind: 'base' | 'hphc' | 'tempo') {
		const t = defaultTariff(kind);
		const old = this.settings.economics.tariff;
		this.settings.economics.tariff = { ...t, base: kind === 'base' ? old.base : t.base };
	}
}

export const app = new AppStore();
