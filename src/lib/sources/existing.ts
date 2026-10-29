/**
 * Avec des panneaux déjà en autoconsommation, le compteur ne voit que l'achat :
 * la vraie consommation = achat + production − injection.
 */
export interface ReconstructInput {
	localHour: number[];
	localDay: string[];
	/** Achat au réseau mesuré, kWh par pas. */
	import: number[];
	/** Production des panneaux existants (mesurée ou modélisée), kWh par pas. */
	production: ArrayLike<number>;
	/** Injection mesurée (courbe Enedis de production), kWh par pas, si connue. */
	export?: (number | undefined)[];
}

/** Seuil sous lequel on considère que la maison n'achète rien (la production couvre tout). */
const ZERO = 0.02;

export function reconstructLoad(x: ReconstructInput): number[] {
	const n = x.import.length;
	const load = new Array<number>(n);
	// consommation type (mois, heure) apprise sur les heures où l'achat prouve que la production ne suffit pas
	const acc = new Map<string, [number, number]>();
	for (let i = 0; i < n; i++) {
		if (x.import[i] <= ZERO) continue;
		const k = `${x.localDay[i].slice(5, 7)}-${x.localHour[i]}`;
		const a = acc.get(k) ?? [0, 0];
		a[0] += x.import[i] + x.production[i];
		a[1]++;
		acc.set(k, a);
	}
	for (let i = 0; i < n; i++) {
		const exp = x.export?.[i];
		if (exp !== undefined) {
			load[i] = Math.max(0, x.import[i] + x.production[i] - exp);
		} else if (x.import[i] > ZERO) {
			// l'achat prouve que toute la production a été consommée
			load[i] = x.import[i] + x.production[i];
		} else {
			// rien acheté : la maison a consommé au plus la production, estimée par la consommation type
			const a = acc.get(`${x.localDay[i].slice(5, 7)}-${x.localHour[i]}`);
			load[i] = Math.min(x.production[i], a ? a[0] / a[1] : 0.3);
		}
	}
	return load;
}
