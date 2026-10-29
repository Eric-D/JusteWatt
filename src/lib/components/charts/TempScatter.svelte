<script lang="ts">
	import type { DayStat, ThermalFit } from '#lib/app/analysis.js';
	import { fmt } from '#lib/format.js';
	import Legend from './Legend.svelte';
	import Tooltip from './Tooltip.svelte';

	/** Consommation de chaque jour selon sa température moyenne, et la droite ajustée. */
	let {
		days,
		heating,
		cooling,
		selected = $bindable('')
	}: {
		days: DayStat[];
		heating: ThermalFit | null;
		cooling: ThermalFit | null;
		selected?: string;
	} = $props();

	const pts = $derived(days.filter((d) => Number.isFinite(d.temp)));
	let width = $state(300);
	const height = 240;
	const pad = { l: 36, r: 8, t: 10, b: 22 };
	const tMin = $derived(Math.floor(Math.min(...pts.map((d) => d.temp), 0) / 5) * 5);
	const tMax = $derived(Math.ceil(Math.max(...pts.map((d) => d.temp), 25) / 5) * 5);
	const max = $derived(Math.max(1, ...pts.map((d) => d.kwh)) * 1.08);
	const x = (t: number) => pad.l + ((width - pad.l - pad.r) * (t - tMin)) / (tMax - tMin);
	const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
	const xStep = $derived(width < 480 ? 10 : 5);
	const xTicks = $derived(
		Array.from({ length: (tMax - tMin) / 5 + 1 }, (_, i) => tMin + i * 5).filter(
			(t) => t % xStep === 0
		)
	);
	const yTicks = $derived([0, max / 2, max].map((v) => Math.round(v / 5) * 5));
	const fit = (f: ThermalFit, sign: 1 | -1) => {
		const end = sign < 0 ? tMin : tMax;
		return `M${x(f.threshold)},${y(f.baseline)}L${x(end)},${y(f.baseline + f.slope * Math.abs(end - f.threshold))}`;
	};
	let hover = $state<DayStat | null>(null);
	function locate(e: PointerEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const px = e.clientX - r.left;
		const py = e.clientY - r.top;
		let best: DayStat | null = null;
		let bd = 14 ** 2; // cible plus large que le point
		for (const d of pts) {
			const dd = (x(d.temp) - px) ** 2 + (y(d.kwh) - py) ** 2;
			if (dd < bd) {
				bd = dd;
				best = d;
			}
		}
		hover = best;
	}
	const dayLabel = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		});
</script>

<div class="grid min-w-0 gap-3">
	<div class="relative w-full min-w-0 overflow-hidden" bind:clientWidth={width}>
		<svg
			class="block touch-none"
			{width}
			{height}
			role="img"
			aria-label="Consommation de chaque jour selon la température extérieure"
			onpointermove={locate}
			onpointerdown={(e) => {
				locate(e);
				if (hover) selected = hover.day;
			}}
			onpointerleave={() => (hover = null)}
		>
			{#each yTicks as t (t)}
				<line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} class="stroke-border" />
				<text x={pad.l - 6} y={y(t) + 3} text-anchor="end" class="fill-muted-foreground text-[10px]"
					>{fmt.int(t)}</text
				>
			{/each}
			{#each xTicks as t (t)}
				<text x={x(t)} y={height - 6} text-anchor="middle" class="fill-muted-foreground text-[10px]"
					>{t} °C</text
				>
			{/each}
			{#each pts as d (d.day)}
				<circle
					cx={x(d.temp)}
					cy={y(d.kwh)}
					r={d.day === selected ? 5 : 3}
					fill="var(--foreground)"
					opacity={d.day === selected ? 1 : 0.35}
					stroke={d.day === selected ? 'var(--card)' : 'none'}
					stroke-width="2"
				/>
			{/each}
			{#if heating}
				<path d={fit(heating, -1)} stroke="var(--q2)" stroke-width="2.5" fill="none" />
			{/if}
			{#if cooling}
				<path d={fit(cooling, 1)} stroke="var(--q1)" stroke-width="2.5" fill="none" />
			{/if}
			{#if heating || cooling}
				{@const f = (heating ?? cooling)!}
				<line
					x1={x(heating?.threshold ?? tMin)}
					x2={x(cooling?.threshold ?? tMax)}
					y1={y(f.baseline)}
					y2={y(f.baseline)}
					stroke="var(--muted-foreground)"
					stroke-width="2"
				/>
			{/if}
			{#if hover}
				<circle
					cx={x(hover.temp)}
					cy={y(hover.kwh)}
					r="6"
					fill="none"
					stroke="var(--foreground)"
					stroke-width="2"
				/>
			{/if}
		</svg>
		{#if hover}
			<Tooltip
				x={x(hover.temp)}
				y={y(hover.kwh)}
				{width}
				title={dayLabel(hover.day)}
				rows={[
					{ label: 'consommés', value: fmt.kwh(hover.kwh) },
					{ label: 'en moyenne', value: `${fmt.dec(hover.temp)} °C` },
					...(hover.heating > 0.5
						? [{ label: 'chauffage estimé', value: fmt.kwh(hover.heating), color: 'var(--q2)' }]
						: []),
					...(hover.cooling > 0.5
						? [{ label: 'clim estimée', value: fmt.kwh(hover.cooling), color: 'var(--q1)' }]
						: [])
				]}
			/>
		{/if}
	</div>
	<Legend
		items={[
			{ label: 'Un jour', color: 'var(--foreground)' },
			...(heating || cooling
				? [{ label: 'Sans chauffage ni clim', color: 'var(--muted-foreground)', line: true }]
				: []),
			...(heating ? [{ label: 'Effet du froid', color: 'var(--q2)', line: true }] : []),
			...(cooling ? [{ label: 'Effet de la chaleur', color: 'var(--q1)', line: true }] : [])
		]}
	/>
</div>
