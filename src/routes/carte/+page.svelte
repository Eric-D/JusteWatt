<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { app } from '#lib/app/store.svelte.js';
	import { MAP_BATTERY, MAP_KWC, MAP_KWC_ADDED, type MapCell } from '#lib/app/compute.js';
	import { fmt } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import Tooltip from '#lib/components/charts/Tooltip.svelte';

	type Metric = 'gain' | 'payback' | 'autonomy';
	const upgrade = $derived(!!app.ctx?.baseline);
	const KWCS = $derived(upgrade ? MAP_KWC_ADDED : MAP_KWC);
	let metric = $state<Metric>('gain');
	let hover = $state<{ c: MapCell; x: number; y: number } | null>(null);
	let width = $state(800);

	$effect(() => {
		if (app.ctx && !app.map && !app.busy) app.explore();
	});

	const cells = $derived(app.map?.cells ?? []);
	const get = (k: number, b: number) => cells.find((c) => c.kwc === k && c.capacity === b);
	const best = $derived(
		cells.length ? cells.reduce((a, c) => (c.netGain > a.netGain ? c : a)) : null
	);
	const value = (c: MapCell) =>
		metric === 'gain' ? c.netGain : metric === 'payback' ? (c.payback ?? Infinity) : c.autonomy;
	const range = $derived.by(() => {
		const v = cells.map(value).filter((x) => Number.isFinite(x));
		return { lo: Math.min(...v), hi: Math.max(...v) };
	});
	/** Niveau 0-1 (1 = meilleur), null = jamais rentable / perte. */
	function level(c: MapCell): number | null {
		const v = value(c);
		if (!Number.isFinite(v) || (metric === 'gain' && v < 0)) return null;
		if (metric === 'gain') return v / (range.hi || 1);
		const t = (v - range.lo) / (range.hi - range.lo || 1);
		return metric === 'payback' ? 1 - t : t;
	}
	/** Rampe séquentielle à une teinte : clair = faible, foncé = meilleur. */
	function fill(c: MapCell) {
		const t = level(c);
		if (t === null) return 'var(--secondary)';
		const hue = metric === 'autonomy' ? 185 : 62;
		return `oklch(${0.95 - 0.45 * t} ${0.03 + 0.12 * t} ${hue})`;
	}
	const ink = (c: MapCell) => ((level(c) ?? 0) > 0.55 ? 'white' : 'var(--foreground)');
	const label = (c: MapCell) =>
		metric === 'gain'
			? fmt.dec(c.netGain / 1000)
			: metric === 'payback'
				? c.payback === null
					? '—'
					: fmt.dec(c.payback)
				: fmt.int(c.autonomy * 100);
	const unit = $derived(metric === 'gain' ? 'k€' : metric === 'payback' ? 'ans' : '%');

	const perBattery = $derived(
		MAP_BATTERY.map((b) => {
			const row = cells.filter((c) => c.capacity === b);
			return row.length ? row.reduce((a, c) => (c.netGain > a.netGain ? c : a)) : null;
		}).filter((x): x is MapCell => !!x)
	);

	/** Libellé d'une combinaison ; en mode ajout, « +3 kWc », « pilotage seul »… */
	function label3(c: MapCell) {
		const bat = c.capacity ? `${fmt.dec(c.capacity)} kWh` : '';
		if (!upgrade) return `${fmt.kwc(c.kwc)} + ${bat || 'sans batterie'}`;
		const parts = [c.kwc ? `+${fmt.kwc(c.kwc)}` : '', bat ? `batterie ${bat}` : ''].filter(Boolean);
		return parts.length ? parts.join(' + ') : 'Pilotage seul';
	}

	function open(c: MapCell) {
		const sc = app.settings.current;
		sc.kwc = c.kwc;
		sc.battery.capacity = c.capacity;
		sc.battery.power = c.capacity > 0 ? Math.max(2.5, c.capacity / 2) : sc.battery.power;
		sc.investment = null;
		goto(resolve('/simulateur'));
	}
</script>

<svelte:head><title>Carte · JusteWatt</title></svelte:head>

{#if !app.hasData}
	<p>
		Choisissez d’abord une source de données sur <a class="underline" href={resolve('/')}
			>l’accueil</a
		>.
	</p>
{:else}
	<div class="grid gap-6">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight">
					{upgrade ? 'Que rajouter ?' : 'Toutes les combinaisons'}
				</h1>
				<p class="text-sm text-muted-foreground">
					{#if app.map}{cells.length} configurations simulées heure par heure en {fmt.dec(
							app.map.ms / 1000
						)} s.{:else}Simulation en cours…{/if}
					Prix d’estimation, inflation {fmt.dec(app.settings.economics.inflation * 100)} %/an, {app
						.settings.economics.years} ans.
				</p>
			</div>
			<div class="flex gap-2">
				<ToggleGroup.Root type="single" variant="outline" bind:value={metric}>
					<ToggleGroup.Item value="gain">Gain net</ToggleGroup.Item>
					<ToggleGroup.Item value="payback">Retour</ToggleGroup.Item>
					<ToggleGroup.Item value="autonomy">Autonomie</ToggleGroup.Item>
				</ToggleGroup.Root>
				<Button variant="ghost" onclick={() => app.explore()} disabled={!!app.busy}>Relancer</Button
				>
			</div>
		</div>

		<div class="grid gap-6 lg:grid-cols-[1fr_300px]">
			<section class="grid gap-3 rounded-xl border bg-card p-5" class:opacity-60={app.busy}>
				<div class="relative overflow-x-auto" bind:clientWidth={width}>
					<table
						class="w-full border-separate border-spacing-0.5 text-xs"
						aria-label="Gain, retour ou autonomie selon panneaux et batterie"
					>
						<thead>
							<tr>
								<th class="w-16 pb-1 text-left font-normal text-muted-foreground"
									>{upgrade ? 'kWc ajoutés' : 'kWc'} ↓</th
								>
								{#each MAP_BATTERY as b (b)}
									<th class="num pb-1 font-mono font-normal text-muted-foreground"
										>{b ? `${fmt.dec(b)} kWh` : 'sans'}</th
									>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each [...KWCS].reverse() as k (k)}
								<tr>
									<th class="num pr-2 text-left font-mono font-normal text-muted-foreground"
										>{fmt.dec(k)}</th
									>
									{#each MAP_BATTERY as b (b)}
										{@const c = get(k, b)}
										<td class="p-0">
											{#if c}
												<button
													class="num h-9 w-full min-w-12 rounded-[4px] font-mono transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring {best ===
													c
														? 'ring-2 ring-foreground'
														: ''}"
													style:background={fill(c)}
													style:color={ink(c)}
													onclick={() => open(c)}
													onpointerenter={(e) => {
														const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
														const p = (e.currentTarget as HTMLElement)
															.closest('.relative')!
															.getBoundingClientRect();
														hover = { c, x: r.right - p.left, y: r.top - p.top };
													}}
													onpointerleave={() => (hover = null)}
													onfocus={(e) => {
														const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
														const p = (e.currentTarget as HTMLElement)
															.closest('.relative')!
															.getBoundingClientRect();
														hover = { c, x: r.right - p.left, y: r.top - p.top };
													}}
													onblur={() => (hover = null)}
													aria-label="{fmt.kwc(k)}, batterie {fmt.dec(b)} kWh : gain {fmt.eur(
														c.netGain
													)}, retour {fmt.years(c.payback)}, autonomie {fmt.pct(c.autonomy)}"
													>{label(c)}</button
												>
											{:else}
												<div class="h-9 animate-pulse rounded-[4px] bg-secondary"></div>
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
					{#if hover}
						<Tooltip
							x={hover.x}
							y={hover.y}
							{width}
							title="{fmt.kwc(hover.c.kwc)} + {hover.c.capacity
								? fmt.dec(hover.c.capacity) + ' kWh'
								: 'sans batterie'}"
							rows={[
								{ label: 'gain net', value: fmt.eur(hover.c.netGain) },
								{ label: 'retour', value: fmt.years(hover.c.payback) },
								{ label: 'autonomie', value: fmt.pct(hover.c.autonomy) },
								{ label: 'investissement', value: fmt.eur(hover.c.investment) }
							]}
						/>
					{/if}
				</div>
				<p class="text-xs text-muted-foreground">
					Valeurs en {unit} · plus foncé = meilleur · cadre = meilleur gain · cliquez une case pour l’ouvrir
					dans le simulateur.
				</p>
			</section>

			<aside class="grid content-start gap-4">
				{#if best}
					<div class="grid gap-3 rounded-xl border bg-card p-4">
						<span class="text-xs text-muted-foreground">Meilleur gain</span>
						<span class="text-lg font-semibold">
							{label3(best)}
						</span>
						<dl class="num grid grid-cols-3 gap-2 font-mono text-sm">
							<div>
								<dt class="text-xs text-muted-foreground">Gain</dt>
								<dd>{fmt.keur(best.netGain)}</dd>
							</div>
							<div>
								<dt class="text-xs text-muted-foreground">Retour</dt>
								<dd>{fmt.years(best.payback)}</dd>
							</div>
							<div>
								<dt class="text-xs text-muted-foreground">Autonomie</dt>
								<dd>{fmt.pct(best.autonomy)}</dd>
							</div>
						</dl>
						<Button onclick={() => open(best!)}>Ouvrir dans le simulateur</Button>
					</div>
				{/if}
				{#if perBattery.length}
					<div class="grid gap-2 rounded-xl border bg-card p-4">
						<span class="text-sm font-semibold">Meilleurs panneaux pour chaque batterie</span>
						<table class="num w-full font-mono text-sm">
							<thead class="text-left text-xs text-muted-foreground">
								<tr
									><th class="font-normal">Batterie</th><th class="font-normal">kWc</th><th
										class="text-right font-normal">Gain</th
									><th class="text-right font-normal">Retour</th></tr
								>
							</thead>
							<tbody>
								{#each perBattery as c (c.capacity)}
									<tr class="border-t">
										<td class="py-1">{c.capacity ? fmt.dec(c.capacity) : '—'}</td>
										<td>{fmt.dec(c.kwc)}</td>
										<td class="text-right">{fmt.keur(c.netGain)}</td>
										<td class="text-right">{fmt.years(c.payback)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</aside>
		</div>
	</div>
{/if}
