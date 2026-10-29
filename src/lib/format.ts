const nf = (d: number) =>
	new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });
const n0 = nf(0);
const n1 = nf(1);
const n2 = nf(2);

export const fmt = {
	int: (v: number) => n0.format(v),
	dec: (v: number) => n1.format(v),
	eur: (v: number) => `${n0.format(v)} €`,
	keur: (v: number) => `${n1.format(v / 1000)} k€`,
	price: (v: number) => `${n2.format(v)} €`,
	kwh: (v: number) => `${n0.format(v)} kWh`,
	kwc: (v: number) => `${n1.format(v)} kWc`,
	pct: (v: number) => `${n0.format(v * 100)} %`,
	years: (v: number | null) => (v === null ? 'jamais' : `${n1.format(v)} ans`)
};

const MONTHS = [
	'janv.',
	'févr.',
	'mars',
	'avr.',
	'mai',
	'juin',
	'juil.',
	'août',
	'sept.',
	'oct.',
	'nov.',
	'déc.'
];
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
export const monthShort = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1];
