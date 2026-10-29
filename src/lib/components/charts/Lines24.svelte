<script lang="ts">
	import { fmt } from '#lib/format.js';
	import Tooltip from './Tooltip.svelte';

	/** Courbes sur 24 heures (kWh par heure), avec réticule et infobulle. */
	let {
		lines,
		max,
		label,
		title = '',
		height = 160,
		standby = 0
	}: {
		lines: { label: string; values: number[]; color: string; dash?: boolean }[];
		max: number;
		label: string;
		title?: string;
		height?: number;
		/** Talon, tracé en pointillé discret. */
		standby?: number;
	} = $props();

	let width = $state(300);
	const pad = { l: 32, r: 8, t: 8, b: 20 };
	const x = (h: number) => pad.l + ((width - pad.l - pad.r) * h) / 23;
	const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
	const path = (v: number[]) => v.map((p, h) => `${h ? 'L' : 'M'}${x(h)},${y(p)}`).join('');
	const ticks = $derived([0, max / 2, max].map((v) => Math.round(v * 10) / 10));
	let hover = $state<number | null>(null);
	function locate(e: PointerEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const h = Math.round(((e.clientX - r.left - pad.l) / (width - pad.l - pad.r)) * 23);
		hover = h >= 0 && h <= 23 ? h : null;
	}
</script>

<div class="relative w-full min-w-0 overflow-hidden" bind:clientWidth={width}>
	<svg
		class="block touch-none"
		{width}
		{height}
		role="img"
		aria-label={label}
		onpointermove={locate}
		onpointerdown={locate}
		onpointerleave={() => (hover = null)}
	>
		{#each ticks as t (t)}
			<line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} class="stroke-border" />
			<text x={pad.l - 6} y={y(t) + 3} text-anchor="end" class="fill-muted-foreground text-[10px]"
				>{fmt.dec(t)}</text
			>
		{/each}
		{#each [0, 6, 12, 18, 23] as h (h)}
			<text
				x={x(h)}
				y={height - 6}
				text-anchor={h === 23 ? 'end' : h ? 'middle' : 'start'}
				class="fill-muted-foreground text-[10px]">{h === 23 ? '23 h' : `${h} h`}</text
			>
		{/each}
		{#if standby > 0}
			<line
				x1={pad.l}
				x2={width - pad.r}
				y1={y(standby)}
				y2={y(standby)}
				class="stroke-muted-foreground"
				stroke-dasharray="2 3"
			/>
		{/if}
		{#each lines as l (l.label)}
			<path
				d={path(l.values)}
				fill="none"
				stroke={l.color}
				stroke-width="2"
				stroke-linejoin="round"
				stroke-dasharray={l.dash ? '5 4' : undefined}
			/>
		{/each}
		{#if hover !== null}
			<line
				x1={x(hover)}
				x2={x(hover)}
				y1={pad.t}
				y2={height - pad.b}
				class="stroke-muted-foreground"
			/>
			{#each lines as l (l.label)}
				<circle
					cx={x(hover)}
					cy={y(l.values[hover])}
					r="4"
					fill={l.color}
					stroke="var(--card)"
					stroke-width="2"
				/>
			{/each}
		{/if}
	</svg>
	{#if hover !== null}
		<Tooltip
			x={x(hover)}
			y={pad.t}
			{width}
			title="{title ? `${title} · ` : ''}{hover} h – {hover + 1} h"
			rows={[
				...lines.map((l) => ({
					label: l.label,
					value: `${fmt.dec(l.values[hover!])} kWh`,
					color: l.color,
					dash: l.dash
				})),
				...(standby > 0 ? [{ label: 'talon', value: `${fmt.dec(standby)} kWh` }] : [])
			]}
		/>
	{/if}
</div>
