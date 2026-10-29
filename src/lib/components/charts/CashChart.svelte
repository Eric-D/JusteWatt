<script lang="ts">
	import { fmt } from '#lib/format.js';
	import Legend from './Legend.svelte';
	import Tooltip from './Tooltip.svelte';

	/** Trésorerie cumulée de chaque offre : le passage au-dessus de zéro = retour sur investissement. */
	let { series }: { series: { name: string; color: string; cumulative: number[] }[] } = $props();

	let width = $state(300);
	const height = 240;
	const pad = { l: 52, r: 24, t: 10, b: 24 };
	const years = $derived(Math.max(1, ...series.map((s) => s.cumulative.length - 1)));
	const all = $derived(series.flatMap((s) => s.cumulative));
	const lo = $derived(Math.min(0, ...all));
	const hi = $derived(Math.max(1, ...all));
	const x = (t: number) => pad.l + ((width - pad.l - pad.r) * t) / years;
	const y = (v: number) => pad.t + ((height - pad.t - pad.b) * (hi - v)) / (hi - lo || 1);
	const ticks = $derived.by(() => {
		const step = Math.pow(10, Math.floor(Math.log10((hi - lo) / 2 || 1)));
		const s = (hi - lo) / step > 6 ? step * 2 : step;
		const out = [];
		for (let v = Math.ceil(lo / s) * s; v <= hi; v += s) out.push(v);
		return out;
	});
	let hover = $state<number | null>(null);

	function move(e: PointerEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const t = Math.round(((e.clientX - r.left - pad.l) / (width - pad.l - pad.r)) * years);
		hover = Math.max(0, Math.min(years, t));
	}
</script>

<div class="grid min-w-0 gap-3">
	<div class="relative w-full min-w-0 overflow-hidden" bind:clientWidth={width}>
		<svg
			class="block"
			{width}
			{height}
			role="img"
			aria-label="Trésorerie cumulée par année"
			onpointermove={move}
			onpointerleave={() => (hover = null)}
		>
			{#each ticks as t (t)}
				<line
					x1={pad.l}
					x2={width - pad.r}
					y1={y(t)}
					y2={y(t)}
					class={t === 0 ? 'stroke-muted-foreground' : 'stroke-border'}
				/>
				<text x={pad.l - 6} y={y(t) + 3} text-anchor="end" class="fill-muted-foreground text-[10px]"
					>{fmt.keur(t)}</text
				>
			{/each}
			{#each Array.from({ length: years + 1 }, (_, i) => i).filter((i) => i % 5 === 0) as t (t)}
				<text x={x(t)} y={height - 6} text-anchor="middle" class="fill-muted-foreground text-[10px]"
					>{t} ans</text
				>
			{/each}
			{#if hover !== null}
				<line
					x1={x(hover)}
					x2={x(hover)}
					y1={pad.t}
					y2={height - pad.b}
					class="stroke-muted-foreground"
				/>
			{/if}
			{#each series as s (s.name)}
				<path
					d={s.cumulative.map((v, t) => `${t ? 'L' : 'M'}${x(t)},${y(v)}`).join('')}
					fill="none"
					stroke={s.color}
					stroke-width="2"
					stroke-linejoin="round"
					stroke-linecap="round"
				/>
				{@const last = s.cumulative.length - 1}
				<circle
					cx={x(last)}
					cy={y(s.cumulative[last])}
					r="4"
					fill={s.color}
					class="stroke-card"
					stroke-width="2"
				/>
			{/each}
		</svg>
		{#if hover !== null}
			<Tooltip
				x={x(hover)}
				y={pad.t}
				{width}
				title="Après {hover} an{hover > 1 ? 's' : ''}"
				rows={series.map((s) => ({
					label: s.name,
					value: fmt.eur(s.cumulative[hover!] ?? 0),
					color: s.color
				}))}
			/>
		{/if}
	</div>
	{#if series.length > 1}
		<Legend items={series.map((s) => ({ label: s.name, color: s.color, line: true }))} />
	{/if}
</div>
