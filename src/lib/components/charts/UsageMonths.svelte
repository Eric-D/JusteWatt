<script lang="ts">
	import type { MonthStat } from '#lib/app/analysis.js';
	import { fmt, monthLabel, monthShort } from '#lib/format.js';
	import Legend from './Legend.svelte';
	import Tooltip from './Tooltip.svelte';

	/** Consommation mois par mois, découpée par usage estimé. */
	let { months }: { months: MonthStat[] } = $props();

	// chaque usage garde sa couleur, qu'il soit présent ou non
	const ALL = [
		{ key: 'other', label: 'Autres usages', color: 'var(--surplus)' },
		{ key: 'pilotable', label: 'Eau chaude pilotable', color: 'var(--q3)' },
		{ key: 'heating', label: 'Chauffage (estimé)', color: 'var(--q2)' },
		{ key: 'cooling', label: 'Climatisation (estimée)', color: 'var(--q1)' }
	] as const;
	const series = $derived(ALL.filter((s) => months.some((m) => m[s.key] > 0.5)));

	let width = $state(300);
	const height = 240;
	const pad = { l: 44, r: 8, t: 10, b: 22 };
	const max = $derived(Math.max(1, ...months.map((m) => m.kwh)) * 1.08);
	const bw = $derived((width - pad.l - pad.r) / Math.max(1, months.length));
	const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
	const ticks = $derived(
		[0, max / 2, max].map((v) => Math.round(v / 50) * 50).filter((v, i, a) => a.indexOf(v) === i)
	);
	let hover = $state<number | null>(null);
	const estimated = (m: MonthStat) => m.method === 'profile' || m.method === 'borrowed';
</script>

<div class="grid min-w-0 gap-3">
	<div class="relative w-full min-w-0 overflow-hidden" bind:clientWidth={width}>
		<svg class="block" {width} {height} role="img" aria-label="Consommation mensuelle par usage">
			<defs>
				<pattern
					id="hachures"
					width="5"
					height="5"
					patternUnits="userSpaceOnUse"
					patternTransform="rotate(45)"
				>
					<line x1="0" y1="0" x2="0" y2="5" stroke="var(--background)" stroke-width="1.5" />
				</pattern>
			</defs>
			{#each ticks as t (t)}
				<line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} class="stroke-border" />
				<text x={pad.l - 6} y={y(t) + 3} text-anchor="end" class="fill-muted-foreground text-[10px]"
					>{fmt.int(t)}</text
				>
			{/each}
			{#each months as m, i (m.month)}
				{@const w = Math.min(28, bw - 6)}
				{@const x = pad.l + bw * i + (bw - w) / 2}
				{#each series as s, k (s.key)}
					{@const below = series.slice(0, k).reduce((a, p) => a + m[p.key], 0)}
					{@const top = k === series.length - 1 || series.slice(k + 1).every((p) => m[p.key] < 0.5)}
					{#if m[s.key] > 0.5}
						<rect
							{x}
							y={y(below + m[s.key]) + (k ? 1 : 0)}
							width={w}
							height={Math.max(0, y(below) - y(below + m[s.key]) - (k ? 1 : 0))}
							fill={s.color}
							rx={top ? 3 : 0}
							opacity={hover === null || hover === i ? 1 : 0.55}
						/>
					{/if}
				{/each}
				{#if estimated(m)}
					<rect
						{x}
						y={y(m.kwh)}
						width={w}
						height={y(0) - y(m.kwh)}
						fill="url(#hachures)"
						opacity="0.6"
					/>
				{/if}
				<text
					x={x + w / 2}
					y={height - 6}
					text-anchor="middle"
					class="fill-muted-foreground text-[10px]">{monthShort(m.month)}</text
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
			{@const m = months[hover]}
			<Tooltip
				x={pad.l + bw * (hover + 1)}
				y={y(m.kwh)}
				{width}
				title="{monthLabel(m.month)}{estimated(m) ? ' · estimé' : ''}"
				rows={[
					{ label: 'au total', value: fmt.kwh(m.kwh) },
					...[...series].reverse().map((s) => ({
						label: s.label.replace(/ \(.*\)/, '').toLowerCase(),
						value: fmt.kwh(m[s.key]),
						color: s.color
					}))
				]}
			/>
		{/if}
	</div>
	<Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
	{#if months.some(estimated)}
		<p class="text-xs text-muted-foreground">
			Mois hachurés : forme horaire reconstituée (relevé incomplet ou incohérent), le total reste
			celui du compteur quand il est connu.
		</p>
	{/if}
</div>
