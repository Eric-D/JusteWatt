/** Une valeur réglementaire avec sa période de validité et sa source. */
export interface Dated<T> {
	value: T;
	/** Date d'entrée en vigueur (AAAA-MM-JJ). */
	from: string;
	/** Fin de validité, exclue ; absent = toujours en vigueur à notre connaissance. */
	to?: string;
	source: string;
}

export interface CountryRules {
	country: string;
	label: string;
	/** Dernière vérification des valeurs. */
	checked: string;
	tariffs: {
		base: Dated<{ price: number; subscription: number }>[];
		hphc: Dated<{ hp: number; hc: number; subscription: number }>[];
		tempo: Dated<{
			bleu: { hp: number; hc: number };
			blanc: { hp: number; hc: number };
			rouge: { hp: number; hc: number };
			subscription: number;
		}>[];
	};
	/** Revente du surplus, €/kWh, par tranche de puissance (kWc max inclus). */
	surplus: Dated<{ upTo: number; price: number }[]>[];
	/** Prime à l'autoconsommation, €/kWc, par tranche. */
	premium: Dated<{ upTo: number; perKwc: number }[]>[];
	/** TVA sur l'installation selon la puissance. */
	vat: Dated<{ upTo: number; rate: number; note?: string }[]>[];
	/** Démarches administratives, dans l'ordre. */
	steps: { id: string; title: string; who: string; when: string; detail: string; link?: string }[];
}

/** Valeur en vigueur à une date donnée (la plus récente qui la couvre). */
export function at<T>(list: Dated<T>[], date: string): Dated<T> | undefined {
	return list
		.filter((x) => x.from <= date && (!x.to || date < x.to))
		.sort((a, b) => b.from.localeCompare(a.from))[0];
}

export function bracket<T extends { upTo: number }>(list: T[], kwc: number): T | undefined {
	return [...list].sort((a, b) => a.upTo - b.upTo).find((x) => kwc <= x.upTo);
}
