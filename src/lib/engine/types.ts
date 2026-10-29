/** Série horaire (ou plus fine) alignée sur un même calendrier. */
export interface TimeSeries {
	/** Début du premier pas, ISO 8601 UTC. */
	start: string;
	/** Durée d'un pas en minutes (60 = horaire). */
	stepMinutes: number;
	/** Heure locale (0-23) de chaque pas. */
	localHour: number[];
	/** Jour local (AAAA-MM-JJ) de chaque pas. */
	localDay: string[];
	/** Consommation totale du logement, kWh par pas. */
	load: number[];
	/** Part pilotable par le routeur (cumulus…), incluse dans `load`, kWh par pas. */
	pilotable: number[];
	/** Production pour 1 kWc, kWh par pas (panneaux simulés). */
	pvPerKwc: number[];
	/** Production des panneaux déjà installés, kWh par pas (hors écrêtage simulé). */
	basePv?: ArrayLike<number>;
}

export interface Battery {
	/** Capacité nominale, kWh. */
	capacity: number;
	/** Puissance max de charge et de décharge, kW. */
	power: number;
	/** Rendement dans chaque sens (0-1). */
	efficiency: number;
	/** Part de la capacité réellement utilisable (0-1). */
	depthOfDischarge: number;
	/** Réserve conservée en permanence, part de la capacité (0-1). */
	reserve: number;
	/** Consommation de veille, W. */
	standbyW: number;
}

/** Appareil piloté sur le surplus (cumulus, voiture, piscine…), par ordre de priorité. */
export interface Device {
	name: string;
	/** Puissance max absorbée, kW. */
	power: number;
	/** Heure locale où le reliquat non couvert est forcé sur le réseau. */
	fallbackHour: number;
	/** Énergie de l'appareil par pas, kWh (incluse dans `load`) : le total de chaque jour est déplaçable. */
	profile: ArrayLike<number>;
}

/** Recharge de la batterie sur le réseau (heures creuses, veille de jour Tempo rouge…). */
export interface GridCharge {
	/** Heures locales autorisées (24 booléens). */
	hours: boolean[];
	/** Charge visée, part de la capacité (0-1). */
	targetSoc: number;
	/** Jours locaux concernés (AAAA-MM-JJ) ; absent = tous les jours. */
	days?: Set<string>;
}

export interface SystemConfig {
	kwc: number;
	/** Puissance AC max de l'onduleur, kW (Infinity = pas d'écrêtage). */
	inverterAcMax: number;
	battery: Battery | null;
	/** Appareils pilotés, dans l'ordre de priorité. */
	devices: Device[];
	gridCharge?: GridCharge | null;
}

export interface MonthTotals {
	production: number;
	import: number;
	export: number;
	load: number;
}

export interface SimulationResult {
	production: number;
	clipped: number;
	import: number;
	export: number;
	load: number;
	/** Part de la consommation couverte sans réseau (0-1). */
	autonomy: number;
	/** Part de la production consommée sur place (0-1). */
	selfConsumption: number;
	/** Achat pour recharger la batterie (inclus dans `import`). */
	gridCharged: number;
	months: Record<string, MonthTotals>;
	/** Flux par pas, kWh. */
	flows: Flows;
}

export interface Flows {
	production: Float32Array;
	/** Production consommée immédiatement (appareils pilotés compris). */
	direct: Float32Array;
	/** Production stockée dans la batterie. */
	charge: Float32Array;
	/** Consommation couverte par la batterie. */
	discharge: Float32Array;
	/** Achat réseau (consommation + recharge éventuelle). */
	import: Float32Array;
	export: Float32Array;
	/** Consommation réelle du pas, appareils déplacés compris. */
	load: Float32Array;
}
