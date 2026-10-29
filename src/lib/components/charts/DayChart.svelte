<script lang="ts">
	import type { Flows } from '#lib/engine/types.js';
	import { fmt } from '#lib/format.js';
	import Legend from './Legend.svelte';
	import Tooltip from './Tooltip.svelte';

	/** Journée moyenne : d'où vient chaque kWh consommé, heure par heure. */
	let {
		flows,
		localHour,
		localDay,
		month = ''
	}: { flows: Flows; localHour: number[]; localDay: string[]; month?: string } = $props();

	const data = $derived.by(() => {
		const acc = Array.from({ length: 24 }, () => ({
			direct: 0,
			battery: 0,
			grid: 0,
			prod: 0,
			charge: 0,
			n: 0
		}));
		for (let i = 0; i < localHour.length; i++) {
			if (month && !localDay[i].startsWith(month)) continue;
			const a = acc[localHour[i]];
			a.direct += flows.direct[i];
			a.battery += flows.discharge[i];
			a.grid += flows.import[i];
			a.prod += flows.production[i];
			a.charge += flows.charge[i];
			a.n++;
		}
		return acc.map((a) => {
			const k = a.n ? 1 / a.n : 0;
			return {
				direct: a.direct * k,
				battery: a.battery * k,
				grid: a.grid * k,
				prod: a.prod * k,
				charge: a.charge * k
			};
		});
	});

	let width = $state(300);
	const height = 220;
	const pad = { l: 36, r: 8, t: 8, b: 22 };
	const max = $derived(
		Math.max(0.5, ...data.map((d) => Math.max(d.direct + d.battery + d.grid, d.prod))) * 1.1
	);
	const bw = $derived((width - pad.l - pad.r) / 24);
	const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
	const ticks = $derived([0, max / 2, max].map((v) => Math.round(v * 10) / 10));
	let hover = $state<number | null>(null);

	const segs = (d: (typeof data)[number]) => [
		{ v: d.direct, c: 'var(--solar)' },
		{ v: d.battery, c: 'var(--battery)' },
		{ v: d.grid, c: 'var(--grid)' }
	];
	const line = $derived(
		data.map((d, h) => `${h ? 'L' : 'M'}${pad.l + bw * (h + 0.5)},${y(d.prod)}`).join('')
	);
	const kw = (v: number) => `${fmt.dec(v)} kWh`;
</script>

<div class="grid min-w-0 gap-3">
	<div class="relative w-full min-w-0 overflow-hidden" bind:clientWidth={width}>
		<svg
			class="block"
			{width}
			{height}
			role="img"
			aria-label="Consommation moyenne par heure et sa provenance"
		>
			{#each ticks as t (t)}
				<line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} class="stroke-border" />
				<text x={pad.l - 6} y={y(t) + 3} text-anchor="end" class="fill-muted-foreground text-[10px]"
					>{fmt.dec(t)}</text
				>
			{/each}
			{#each data as d, h (h)}
				{@const w = Math.min(18, bw - 2)}
				{@const x = pad.l + bw * h + (bw - w) / 2}
				{@const parts = segs(d)}
				{#each parts as s, k (k)}
					{@const below = parts.slice(0, k).reduce((a, p) => a + p.v, 0)}
					{#if s.v > 0.001}
						<rect
							{x}
							y={y(below + s.v) + (k ? 1 : 0)}
							width={w}
							height={Math.max(0, y(below) - y(below + s.v) - (k ? 1 : 0))}
							fill={s.c}
							rx={k === parts.length - 1 || parts.slice(k + 1).every((p) => p.v <= 0.001) ? 3 : 0}
							opacity={hover === null || hover === h ? 1 : 0.55}
						/>
					{/if}
				{/each}
				{#if h % 3 === 0}
					<text
						x={pad.l + bw * (h + 0.5)}
						y={height - 6}
						text-anchor="middle"
						class="fill-muted-foreground text-[10px]">{h} h</text
					>
				{/if}
				<rect
					x={pad.l + bw * h}
					y={pad.t}
					width={bw}
					height={height - pad.t - pad.b}
					fill="transparent"
					role="presentation"
					onpointerenter={() => (hover = h)}
					onpointerleave={() => (hover = null)}
				/>
			{/each}
			<path
				d={line}
				fill="none"
				stroke="var(--solar)"
				stroke-width="2"
				stroke-dasharray="4 3"
				stroke-linejoin="round"
			/>
		</svg>
		{#if hover !== null}
			{@const d = data[hover]}
			<Tooltip
				x={pad.l + bw * (hover + 1)}
				y={y(Math.max(d.prod, d.direct + d.battery + d.grid))}
				{width}
				title="{hover} h – {hover + 1} h"
				rows={[
					{ label: 'production', value: kw(d.prod), color: 'var(--solar)', dash: true },
					{ label: 'solaire direct', value: kw(d.direct), color: 'var(--solar)' },
					{ label: 'batterie', value: kw(d.battery), color: 'var(--battery)' },
					{ label: 'réseau', value: kw(d.grid), color: 'var(--grid)' }
				]}
			/>
		{/if}
	</div>
	<Legend
		items={[
			{ label: 'Solaire direct', color: 'var(--solar)' },
			{ label: 'Batterie', color: 'var(--battery)' },
			{ label: 'Réseau', color: 'var(--grid)' },
			{ label: 'Production (pointillés)', color: 'var(--solar)', line: true }
		]}
	/>
</div>
