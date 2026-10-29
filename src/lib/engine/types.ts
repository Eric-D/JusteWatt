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
	/** Production pour 1 kWc, kWh par pas. */
	pvPerKwc: number[];
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

export interface Router {
	enabled: boolean;
	/** Puissance max absorbée par la charge pilotée, kW. */
	power: number;
	/** Heure locale où le reliquat non couvert est forcé sur le réseau. */
	fallbackHour: number;
}

export interface SystemConfig {
	kwc: number;
	/** Puissance AC max de l'onduleur, kW (Infinity = pas d'écrêtage). */
	inverterAcMax: number;
	battery: Battery | null;
	router: Router;
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
	months: Record<string, MonthTotals>;
	/** Achat réseau par pas, kWh (pour la tarification). */
	importSeries: Float64Array;
	exportSeries: Float64Array;
}
