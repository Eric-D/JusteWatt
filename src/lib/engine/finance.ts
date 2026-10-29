export interface FinanceInput {
	investment: number;
	/** Facture évitée l'année 1, € (indexée sur l'inflation ensuite). */
	savings: number;
	/** Revente du surplus l'année 1, € (prix garanti, non indexé). */
	exportRevenue: number;
	/** Revente à partir d'une année donnée (fin d'un contrat d'achat, par ex.). */
	exportRevenueAfter?: { year: number; value: number };
	/** Hausse annuelle du prix d'achat (0.03 = 3 %). */
	inflation: number;
	/** Perte annuelle de production (0.005 = 0,5 %). */
	degradation: number;
	years: number;
	/** Taux d'actualisation (0.024 = Livret A). */
	discountRate: number;
	/** Coûts récurrents, €/an (assurance, entretien), indexés sur l'inflation. */
	yearlyCosts: number;
	/** Remplacements ponctuels : année (1 = fin de la 1re année) et coût. */
	replacements: { year: number; cost: number }[];
}

export interface FinanceResult {
	/** Flux de trésorerie par année, index 0 = investissement. */
	cashflows: number[];
	cumulative: number[];
	netGain: number;
	npv: number;
	/** Taux de rendement interne, null s'il n'existe pas. */
	irr: number | null;
	/** Retour sur investissement en années décimales, null si jamais atteint. */
	payback: number | null;
}

export function finance(f: FinanceInput): FinanceResult {
	const cashflows = [-f.investment];
	for (let t = 1; t <= f.years; t++) {
		const deg = Math.pow(1 - f.degradation, t - 1);
		const infl = Math.pow(1 + f.inflation, t - 1);
		let cf =
			(f.savings * infl +
				(f.exportRevenueAfter && t >= f.exportRevenueAfter.year
					? f.exportRevenueAfter.value
					: f.exportRevenue)) *
				deg -
			f.yearlyCosts * infl;
		for (const r of f.replacements) if (r.year === t) cf -= r.cost;
		cashflows.push(cf);
	}

	const cumulative: number[] = [];
	let acc = 0;
	let payback: number | null = null;
	cashflows.forEach((cf, t) => {
		const prev = acc;
		acc += cf;
		cumulative.push(acc);
		if (payback === null && t > 0 && prev < 0 && acc >= 0) payback = t - 1 + -prev / cf;
	});

	const npvAt = (r: number) => cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
	return {
		cashflows,
		cumulative,
		netGain: acc,
		npv: npvAt(f.discountRate),
		irr: irr(npvAt),
		payback
	};
}

/** Racine de la VAN par dichotomie entre −99 % et +1000 %. */
function irr(npvAt: (r: number) => number): number | null {
	let lo = -0.99;
	let hi = 10;
	let flo = npvAt(lo);
	if (flo * npvAt(hi) > 0) return null;
	for (let i = 0; i < 200; i++) {
		const mid = (lo + hi) / 2;
		const fm = npvAt(mid);
		if (Math.abs(fm) < 1e-7) return mid;
		if (flo * fm < 0) hi = mid;
		else {
			lo = mid;
			flo = fm;
		}
	}
	return (lo + hi) / 2;
}
