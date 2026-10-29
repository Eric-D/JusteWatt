/**
 * Lecture des exports Enedis (espace client « Mes données », CSV séparés par « ; »).
 * - Courbe de charge : puissance moyenne en W par pas de 30 min (horodatage = fin du pas).
 * - Consommation journalière : énergie en Wh par jour.
 * Le lecteur est tolérant : il cherche les lignes « date ; nombre » et déduit le pas.
 */
export type EnedisKind = 'curve' | 'daily';

export interface EnedisData {
	kind: EnedisKind;
	/** Courbe : énergie par heure UTC (ms), kWh. */
	hourly: Map<number, number>;
	/** Énergie par jour local (AAAA-MM-JJ), kWh. */
	daily: Map<string, number>;
	first: string;
	last: string;
	rows: number;
}

const HOUR = 3_600_000;

function parseDate(s: string): number | null {
	const t = s.trim().replace(/^"|"$/g, '');
	// 2025-10-01T00:30:00+02:00 · 2025-10-01 · 01/10/2025 00:30
	const fr = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
	if (fr) {
		const [, d, m, y, hh = '00', mm = '00'] = fr;
		return Date.parse(`${y}-${m}-${d}T${hh}:${mm}:00`);
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return Date.parse(t + 'T00:00:00Z');
	const v = Date.parse(t);
	return Number.isNaN(v) ? null : v;
}

export function parseEnedisCsv(text: string, tz = 'Europe/Paris'): EnedisData {
	const lines = text.split(/\r?\n/);
	const unitLine = lines.slice(0, 5).join(' ').toLowerCase();
	const rows: { t: number; v: number; raw: string }[] = [];
	for (const line of lines) {
		const cells = line.split(/[;,\t]/);
		if (cells.length < 2) continue;
		const t = parseDate(cells[0]);
		const v = Number(cells[1].trim().replace(/^"|"$/g, '').replace(',', '.'));
		if (t === null || cells[1].trim() === '' || !Number.isFinite(v)) continue;
		rows.push({ t, v, raw: cells[0].trim() });
	}
	if (rows.length < 2) throw new Error('Aucune mesure reconnue dans ce fichier');
	rows.sort((a, b) => a.t - b.t);

	const gaps = rows
		.slice(1)
		.map((r, i) => r.t - rows[i].t)
		.filter((g) => g > 0)
		.sort((a, b) => a - b);
	const step = gaps[Math.floor(gaps.length / 2)];
	const kind: EnedisKind = step <= 2 * HOUR ? 'curve' : 'daily';
	const inKwh = /kwh/.test(unitLine);
	const hourly = new Map<number, number>();
	const daily = new Map<string, number>();
	const dayFmt = new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});

	for (const r of rows) {
		if (kind === 'curve') {
			// puissance moyenne (W) sur le pas qui se termine à r.t
			const kwh = inKwh ? r.v : (r.v * step) / HOUR / 1000;
			const startOfStep = r.t - step;
			const hour = Math.floor(startOfStep / HOUR) * HOUR;
			hourly.set(hour, (hourly.get(hour) ?? 0) + kwh);
			const d = dayFmt.format(startOfStep);
			daily.set(d, (daily.get(d) ?? 0) + kwh);
		} else {
			const kwh = inKwh ? r.v : r.v / 1000;
			const d = /^\d{4}-\d{2}-\d{2}$/.test(r.raw.replace(/"/g, ''))
				? r.raw.replace(/"/g, '')
				: dayFmt.format(r.t);
			daily.set(d, (daily.get(d) ?? 0) + kwh);
		}
	}
	const days = [...daily.keys()].sort();
	return { kind, hourly, daily, first: days[0], last: days[days.length - 1], rows: rows.length };
}

/** Totaux mensuels (AAAA-MM) des jours présents, avec la part de jours couverts. */
export function monthlyFromDaily(
	daily: Map<string, number>
): Record<string, { kwh: number; days: number }> {
	const out: Record<string, { kwh: number; days: number }> = {};
	for (const [d, v] of daily) {
		const m = d.slice(0, 7);
		out[m] ??= { kwh: 0, days: 0 };
		out[m].kwh += v;
		out[m].days++;
	}
	return out;
}
