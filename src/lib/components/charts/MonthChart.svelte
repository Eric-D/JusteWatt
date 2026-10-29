<script lang="ts">
	import type { Flows } from '#lib/engine/types.js';
	import { fmt, monthLabel, monthShort } from '#lib/format.js';
	import Legend from './Legend.svelte';
	import Tooltip from './Tooltip.svelte';

	/** Consommation de chaque mois selon sa provenance, et production. */
	let { flows, localDay }: { flows: Flows; localDay: string[] } = $props();

	const data = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- table locale au calcul
		const m = new Map<
			string,
			{ direct: number; battery: number; grid: number; prod: number; exp: number }
		>();
		for (let i = 0; i < localDay.length; i++) {
			const k = localDay[i].slice(0, 7);
			const a = m.get(k) ?? { direct: 0, battery: 0, grid: 0, prod: 0, exp: 0 };
			a.direct += flows.direct[i];
			a.battery += flows.discharge[i];
			a.grid += flows.import[i];
			a.prod += flows.production[i];
			a.exp += flows.export[i];
			m.set(k, a);
		}
		return [...m].map(([month, a]) => ({ month, ...a }));
	});

	let width = $state(300);
	const height = 220;
	const pad = { l: 44, r: 8, t: 18, b: 22 };
	const max = $derived(
		Math.max(1, ...data.map((d) => Math.max(d.direct + d.battery + d.grid, d.prod))) * 1.08
	);
	const bw = $derived((width - pad.l - pad.r) / Math.max(1, data.length));
	const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
	let hover = $state<number | null>(null);
	const ticks = $derived([0, max / 2, max].map((v) => Math.round(v / 50) * 50));
</script>

<div class="grid min-w-0 gap-3">
	<div class="relative w-full min-w-0 overflow-hidden" bind:clientWidth={width}>
		<svg
			class="block"
			{width}
			{height}
			role="img"
			aria-label="Consommation et production mois par mois"
		>
			{#each ticks as t (t)}
				<line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} class="stroke-border" />
				<text x={pad.l - 6} y={y(t) + 3} text-anchor="end" class="fill-muted-foreground text-[10px]"
					>{fmt.int(t)}</text
				>
			{/each}
			{#each data as d, i (d.month)}
				{@const w = Math.min(24, bw - 6)}
				{@const x = pad.l + bw * i + (bw - w) / 2}
				{@const parts = [
					{ v: d.direct, c: 'var(--solar)' },
					{ v: d.battery, c: 'var(--battery)' },
					{ v: d.grid, c: 'var(--grid)' }
				]}
				{@const total = d.direct + d.battery + d.grid}
				{#each parts as s, k (k)}
					{@const below = parts.slice(0, k).reduce((a, p) => a + p.v, 0)}
					{#if s.v > 0.5}
						<rect
							{x}
							y={y(below + s.v) + (k ? 1 : 0)}
							width={w}
							height={Math.max(0, y(below) - y(below + s.v) - (k ? 1 : 0))}
							fill={s.c}
							rx={k === 2 ? 4 : 0}
							opacity={hover === null || hover === i ? 1 : 0.55}
						/>
					{/if}
				{/each}
				<line
					x1={x - 2}
					x2={x + w + 2}
					y1={y(d.prod)}
					y2={y(d.prod)}
					stroke="var(--foreground)"
					stroke-width="2"
				/>
				<text
					x={x + w / 2}
					y={y(Math.max(total, d.prod)) - 5}
					text-anchor="middle"
					class="num fill-muted-foreground text-[10px]"
					>{fmt.pct(total ? (d.direct + d.battery) / total : 0)}</text
				>
				<text
					x={x + w / 2}
					y={height - 6}
					text-anchor="middle"
					class="fill-muted-foreground text-[10px]">{monthShort(d.month)}</text
				>
				<rect
					x={pad.l + bw * i}
					y={pad.t}
					width={bw}
					height={height - pad.t - pad.b}
					fill="transparent"
					role="presentation"
					onpointerenter={() => (hover = i)}
					onpointerleave={() => (hover = null)}
				/>
			{/each}
		</svg>
		{#if hover !== null}
			{@const d = data[hover]}
			<Tooltip
				x={pad.l + bw * (hover + 1)}
				y={y(Math.max(d.prod, d.direct + d.battery + d.grid))}
				{width}
				title={monthLabel(d.month)}
				rows={[
					{ label: 'solaire direct', value: fmt.kwh(d.direct), color: 'var(--solar)' },
					{ label: 'batterie', value: fmt.kwh(d.battery), color: 'var(--battery)' },
					{ label: 'réseau', value: fmt.kwh(d.grid), color: 'var(--grid)' },
					{ label: 'production', value: fmt.kwh(d.prod), color: 'var(--foreground)' },
					{ label: 'surplus', value: fmt.kwh(d.exp) }
				]}
			/>
		{/if}
	</div>
	<Legend
		items={[
			{ label: 'Solaire direct', color: 'var(--solar)' },
			{ label: 'Batterie', color: 'var(--battery)' },
			{ label: 'Réseau', color: 'var(--grid)' },
			{ label: 'Production', color: 'var(--foreground)', line: true }
		]}
	/>
	<p class="text-xs text-muted-foreground">
		Le pourcentage au-dessus de chaque mois est la part couverte sans le réseau.
	</p>
</div>
