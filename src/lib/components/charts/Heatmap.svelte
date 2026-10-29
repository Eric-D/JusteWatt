<script lang="ts">
	import { onMount } from 'svelte';
	import { fmt, monthShort } from '#lib/format.js';
	import Tooltip from './Tooltip.svelte';

	/**
	 * Carte de chaleur heure × jour : chaque colonne est un jour, chaque ligne une heure.
	 * Dessinée sur un canvas (8 760 cases) ; l'infobulle suit le pointeur.
	 */
	let {
		load,
		localDay,
		localHour,
		temp,
		selected = $bindable('')
	}: {
		load: number[];
		localDay: string[];
		localHour: number[];
		temp: number[];
		selected?: string;
	} = $props();

	const grid = $derived.by(() => {
		const days: string[] = [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- table locale au calcul
		const index = new Map<string, number>();
		for (const d of localDay)
			if (!index.has(d)) {
				index.set(d, days.length);
				days.push(d);
			}
		const v = new Float32Array(days.length * 24).fill(NaN);
		const t = new Float32Array(days.length);
		for (let i = 0; i < load.length; i++) {
			const k = index.get(localDay[i])! * 24 + localHour[i];
			// heure doublée au changement d'heure : on additionne
			v[k] = Number.isNaN(v[k]) ? load[i] : v[k] + load[i];
			t[index.get(localDay[i])!] += (temp[i] ?? 0) / 24;
		}
		// échelle bornée au 98e centile : un pic isolé ne doit pas éteindre le reste
		const sorted = Array.from(v)
			.filter((x) => !Number.isNaN(x))
			.sort((a, b) => a - b);
		const max = Math.max(0.1, sorted[Math.floor(sorted.length * 0.98)] ?? 1);
		return { days, v, t, max };
	});

	let width = $state(300);
	let dark = $state(false);
	let canvas: HTMLCanvasElement | undefined = $state();
	const pad = { l: 30, r: 4, t: 4, b: 20 };
	const cell = 9;
	const height = pad.t + 24 * cell + pad.b;
	const cw = $derived((width - pad.l - pad.r) / Math.max(1, grid.days.length));

	/** Rampe séquentielle bleue, du fond vers l'encre (inversée en sombre). */
	function color(x: number) {
		const s = Math.min(1, Math.max(0, x));
		return dark
			? `oklch(${0.24 + 0.62 * s} ${0.02 + 0.12 * s} ${255 - 15 * s})`
			: `oklch(${0.96 - 0.6 * s} ${0.02 + 0.14 * s} ${250 + 15 * s})`;
	}

	$effect(() => {
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		const g = canvas.getContext('2d');
		if (!g) return;
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, width, height);
		const { days, v, max } = grid;
		for (let d = 0; d < days.length; d++)
			for (let h = 0; h < 24; h++) {
				const x = v[d * 24 + h];
				if (Number.isNaN(x)) continue;
				g.fillStyle = color(x / max);
				// cases jointives : on déborde d'un demi-pixel pour éviter les liserés
				g.fillRect(pad.l + d * cw, pad.t + h * cell, cw + 0.5, cell);
			}
		const sel = days.indexOf(selected);
		if (sel >= 0) {
			g.strokeStyle = dark ? '#fff' : '#000';
			g.lineWidth = 1.5;
			g.strokeRect(pad.l + sel * cw - 1, pad.t - 1, cw + 2, 24 * cell + 2);
		}
	});

	onMount(() => {
		const html = document.documentElement;
		dark = html.classList.contains('dark');
		const obs = new MutationObserver(() => (dark = html.classList.contains('dark')));
		obs.observe(html, { attributes: true, attributeFilter: ['class'] });
		return () => obs.disconnect();
	});

	const monthTicks = $derived(
		grid.days.map((d, i) => ({ d, i })).filter(({ d }) => d.endsWith('-01'))
	);
	let hover = $state<{ d: number; h: number } | null>(null);
	function locate(e: PointerEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const d = Math.floor((e.clientX - r.left - pad.l) / cw);
		const h = Math.floor((e.clientY - r.top - pad.t) / cell);
		hover = d >= 0 && d < grid.days.length && h >= 0 && h < 24 ? { d, h } : null;
	}
	const dayLabel = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		});
	function pick(e: KeyboardEvent) {
		const i = Math.max(0, grid.days.indexOf(selected));
		const step = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 }[e.key];
		if (!step) return;
		e.preventDefault();
		selected = grid.days[Math.min(grid.days.length - 1, Math.max(0, i + step))];
	}
</script>

<div class="grid min-w-0 gap-3">
	<div class="relative w-full min-w-0 overflow-hidden" bind:clientWidth={width}>
		<canvas
			bind:this={canvas}
			style:width="{width}px"
			style:height="{height}px"
			class="block cursor-crosshair touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
			tabindex="0"
			role="slider"
			aria-label="Jour affiché en détail (carte de la consommation heure par heure)"
			aria-valuemin={0}
			aria-valuemax={grid.days.length - 1}
			aria-valuenow={Math.max(0, grid.days.indexOf(selected))}
			aria-valuetext={selected ? dayLabel(selected) : ''}
			onpointermove={locate}
			onpointerdown={(e) => {
				locate(e);
				if (hover) selected = grid.days[hover.d];
			}}
			onpointerleave={() => (hover = null)}
			onkeydown={pick}
		></canvas>
		<svg class="pointer-events-none absolute inset-0" {width} {height} aria-hidden="true">
			{#each [0, 6, 12, 18] as h (h)}
				<text
					x={pad.l - 5}
					y={pad.t + h * cell + cell - 1}
					text-anchor="end"
					class="fill-muted-foreground text-[10px]">{h} h</text
				>
			{/each}
			<text
				x={pad.l - 5}
				y={pad.t + 24 * cell}
				text-anchor="end"
				class="fill-muted-foreground text-[10px]">24 h</text
			>
			{#each monthTicks as m (m.d)}
				<line
					x1={pad.l + m.i * cw}
					x2={pad.l + m.i * cw}
					y1={pad.t + 24 * cell}
					y2={pad.t + 24 * cell + 4}
					class="stroke-muted-foreground"
				/>
				{#if cw * 30 > 26 || (cw * 90 > 26 && Number(m.d.slice(5, 7)) % 3 === 1)}
					<text x={pad.l + m.i * cw + 2} y={height - 4} class="fill-muted-foreground text-[10px]"
						>{monthShort(m.d.slice(0, 7))}</text
					>
				{/if}
			{/each}
		</svg>
		{#if hover}
			{@const day = grid.days[hover.d]}
			{@const v = grid.v[hover.d * 24 + hover.h]}
			<Tooltip
				x={pad.l + hover.d * cw}
				y={pad.t + hover.h * cell}
				{width}
				title="{dayLabel(day)}, {hover.h} h"
				rows={[
					{ label: 'consommés', value: Number.isNaN(v) ? '—' : `${fmt.dec(v)} kWh` },
					{ label: 'ce jour-là', value: `${fmt.dec(grid.t[hover.d])} °C` }
				]}
			/>
		{/if}
	</div>
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
		<span>0</span>
		<span
			class="h-2.5 w-32 rounded-sm"
			style:background="linear-gradient(to right, {[0, 0.25, 0.5, 0.75, 1]
				.map((x) => color(x))
				.join(', ')})"
		></span>
		<span class="num font-mono">{fmt.dec(grid.max)} kWh par heure et plus</span>
		<span class="ml-auto">Touchez un jour pour l’afficher en détail.</span>
	</div>
</div>
