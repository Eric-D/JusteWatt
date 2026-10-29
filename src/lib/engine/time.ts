const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
	let f = formatters.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			hourCycle: 'h23'
		});
		formatters.set(tz, f);
	}
	return f;
}

/** Jour (AAAA-MM-JJ) et heure locale d'un instant UTC. */
export function localParts(utcMs: number, tz: string): { day: string; hour: number } {
	const p: Record<string, string> = {};
	for (const x of formatter(tz).formatToParts(utcMs)) p[x.type] = x.value;
	return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** Pas horaires UTC de `startMs` (inclus) à `endMs` (exclu). */
export function hourlySteps(startMs: number, endMs: number): number[] {
	const out: number[] = [];
	for (let t = startMs; t < endMs; t += 3_600_000) out.push(t);
	return out;
}
