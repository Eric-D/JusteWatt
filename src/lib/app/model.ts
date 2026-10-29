import type { Evolution } from '#lib/engine/evolutions.js';
import { DEFAULT_HC_HOURS, type Tariff } from '#lib/engine/tariffs.js';
import { at, bracket } from '#lib/rules/types.js';
import { FR } from '#lib/rules/fr.js';

export interface Plane {
	id: string;
	name: string;
	tilt: number;
	/** 0 = sud, −90 = est, 90 = ouest. */
	azimuth: number;
	/** Part des panneaux sur ce pan (0-1). */
	share: number;
}

export interface SiteSettings {
	name: string;
	latitude: number;
	longitude: number;
	elevation: number;
	tz: string;
	planes: Plane[];
	/** Surface utile de toit, m². */
	surface: number;
	/** Masque d'horizon (24 secteurs depuis le sud vers l'ouest) ou null. */
	horizon: number[] | null;
	useHorizon: boolean;
}

export interface BatterySettings {
	capacity: number;
	power: number;
	efficiency: number;
	depthOfDischarge: number;
	reserve: number;
	standbyW: number;
}

/** Une configuration simulée (curseurs du simulateur, scénario enregistré ou devis). */
export interface Scenario {
	id: string;
	name: string;
	kwc: number;
	battery: BatterySettings;
	/** Puissance AC max des onduleurs, kW (0 = sans limite). */
	inverterAcMax: number;
	/** Investissement saisi (devis) ; null = estimation automatique. */
	investment: number | null;
	/** Lignes du devis, si c'en est un. */
	lines?: { label: string; amount: number }[];
	/** Prime déduite automatiquement. */
	premium: boolean;
}

export interface Economics {
	tariff: Tariff;
	sellPrice: number;
	/** Inflation du prix d'achat, par an. */
	inflation: number;
	degradation: number;
	years: number;
	discountRate: number;
	/** Assurance + entretien, €/an. */
	yearlyCosts: number;
	/** Remplacement des onduleurs : année et coût en €/kWc. */
	inverterYear: number;
	inverterPerKwc: number;
	/** Remplacement batterie : année et part du prix d'origine. */
	batteryYear: number;
	batteryShare: number;
	/** Estimation : €/kWc, €/kWh de batterie, forfait. */
	pricePerKwc: number;
	pricePerKwh: number;
	priceFixed: number;
}

export interface CumulusSettings {
	enabled: boolean;
	power: number;
	fallbackHour: number;
}

export interface GridChargeSettings {
	enabled: boolean;
	/** hc = toutes les nuits en heures creuses ; rouge = seulement avant un jour Tempo rouge. */
	mode: 'hc' | 'rouge';
	targetSoc: number;
}

export interface SourceSettings {
	kind: 'none' | 'demo' | 'ha' | 'enedis' | 'manual';
	haUrl: string;
	/** Statistiques HA choisies comme pilotables (cumulus…). */
	haPilotable: string[];
	/** Puissance déjà installée (pour retirer la production existante et caler le modèle). */
	existingKwc: number;
	/** Facteur de calage du modèle (1 = PVGIS). */
	calibration: number;
	enedisFile: string;
	/** Saisie manuelle, kWh par mois (AAAA-MM). */
	manualMonthly: Record<string, number>;
	/** Mois exclu qui termine l'année simulée (AAAA-MM). */
	endMonth: string;
	/** Nombre d'années météo passées pour l'incertitude. */
	weatherYears: number;
}

export interface ProjectSettings {
	version: 1;
	source: SourceSettings;
	site: SiteSettings;
	evolutions: Evolution[];
	cumulus: CumulusSettings;
	gridCharge: GridChargeSettings;
	economics: Economics;
	current: Scenario;
	scenarios: Scenario[];
	quotes: Scenario[];
	steps: Record<string, boolean>;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

const today = new Date().toISOString().slice(0, 10);

export function defaultTariff(kind: Tariff['kind'] = 'base'): Tariff {
	const base = at(FR.tariffs.base, today)!.value;
	const hphc = at(FR.tariffs.hphc, today)!.value;
	const tempo = at(FR.tariffs.tempo, today)!.value;
	return {
		kind,
		subscription:
			kind === 'base'
				? base.subscription
				: kind === 'hphc'
					? hphc.subscription
					: tempo.subscription,
		base: base.price,
		hp: hphc.hp,
		hc: hphc.hc,
		hcHours: [...DEFAULT_HC_HOURS],
		tempo: { bleu: { ...tempo.bleu }, blanc: { ...tempo.blanc }, rouge: { ...tempo.rouge } }
	};
}

export function surplusPrice(kwc: number): number {
	return bracket(at(FR.surplus, today)!.value, kwc)?.price ?? 0;
}

export function premiumFor(kwc: number): number {
	const b = bracket(at(FR.premium, today)!.value, kwc);
	return b ? b.perKwc * kwc : 0;
}

export const defaultBattery = (capacity = 0): BatterySettings => ({
	capacity,
	power: Math.max(2.5, capacity / 2),
	efficiency: 0.95,
	depthOfDischarge: 0.9,
	reserve: 0.05,
	standbyW: 10
});

export function defaultScenario(): Scenario {
	return {
		id: uid(),
		name: 'Mon projet',
		kwc: 4,
		battery: defaultBattery(0),
		inverterAcMax: 0,
		investment: null,
		premium: true
	};
}

export function defaultSettings(): ProjectSettings {
	return {
		version: 1,
		source: {
			kind: 'none',
			haUrl: '',
			haPilotable: [],
			existingKwc: 0,
			calibration: 1,
			enedisFile: '',
			manualMonthly: {},
			endMonth: '',
			weatherYears: 5
		},
		site: {
			name: '',
			latitude: 46.6,
			longitude: 2.4,
			elevation: 0,
			tz: 'Europe/Paris',
			planes: [{ id: uid(), name: 'Pan principal', tilt: 30, azimuth: 0, share: 1 }],
			surface: 30,
			horizon: null,
			useHorizon: true
		},
		evolutions: [],
		cumulus: { enabled: true, power: 2.4, fallbackHour: 21 },
		gridCharge: { enabled: false, mode: 'rouge', targetSoc: 0.8 },
		economics: {
			tariff: defaultTariff('base'),
			sellPrice: surplusPrice(6),
			inflation: 0.03,
			degradation: 0.005,
			years: 20,
			discountRate: 0.024,
			yearlyCosts: 30,
			inverterYear: 15,
			inverterPerKwc: 120,
			batteryYear: 12,
			batteryShare: 0.6,
			pricePerKwc: 1500,
			pricePerKwh: 450,
			priceFixed: 1000
		},
		current: defaultScenario(),
		scenarios: [],
		quotes: [],
		steps: {}
	};
}

/** Surface d'un panneau courant (≈ 430 Wc), m². */
export const PANEL_M2 = 1.95;
export const PANEL_WC = 430;
