<script lang="ts">
	import { app } from '#lib/app/store.svelte.js';
	import { fetchHorizon, searchPlace, type Place } from '#lib/app/pipeline.js';
	import { uid, PANEL_M2, PANEL_WC } from '#lib/app/model.js';
	import { fmt } from '#lib/format.js';
	import Field from '#lib/components/Field.svelte';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';

	const s = $derived(app.settings);
	const site = $derived(app.settings.site);
	let query = $state('');
	let places = $state<Place[]>([]);
	let searching = $state(false);
	let horizonBusy = $state(false);

	const yieldKwc = $derived(app.prepared ? app.prepared.pv.reduce((a, v) => a + v, 0) : null);
	const maxKwc = $derived((Math.floor(site.surface / PANEL_M2) * PANEL_WC) / 1000);

	const DIRS = ['Sud', 'Sud-ouest', 'Ouest', 'Nord-ouest', 'Nord', 'Nord-est', 'Est', 'Sud-est'];
	const dir = (az: number) => DIRS[((Math.round(az / 45) % 8) + 8) % 8];

	async function search(e: SubmitEvent) {
		e.preventDefault();
		if (query.trim().length < 3) return;
		searching = true;
		try {
			places = await searchPlace(query);
			if (!places.length) app.error = 'Adresse introuvable';
		} catch {
			app.error = 'Recherche d’adresse indisponible';
		} finally {
			searching = false;
		}
	}
	function choose(p: Place) {
		site.latitude = Math.round(p.latitude * 10000) / 10000;
		site.longitude = Math.round(p.longitude * 10000) / 10000;
		site.name = p.label;
		site.horizon = null;
		places = [];
		query = '';
	}
	function locate() {
		navigator.geolocation.getCurrentPosition(
			(pos) =>
				choose({
					label: 'Ma position',
					latitude: pos.coords.latitude,
					longitude: pos.coords.longitude
				}),
			() => (app.error = 'Position refusée ou indisponible')
		);
	}
	async function horizon() {
		horizonBusy = true;
		try {
			const h = await fetchHorizon(site.latitude, site.longitude);
			site.horizon = h.angles;
			site.elevation = h.elevation;
			site.useHorizon = true;
		} catch (e) {
			app.error = e instanceof Error ? e.message : 'Relief indisponible';
		} finally {
			horizonBusy = false;
		}
	}
	function addPlane() {
		const n = site.planes.length;
		site.planes = [
			...site.planes,
			{ id: uid(), name: `Pan ${n + 1}`, tilt: 30, azimuth: n % 2 ? 90 : -90, share: 0.5 }
		];
	}

	// masque d'horizon, de l'est (−180) à l'ouest (+180) en passant par le sud (0)
	const W = 320;
	const H = 90;
	const hx = (az: number) => ((az + 180) / 360) * W;
	const hy = (a: number) => H - 14 - (Math.max(0, a) / 20) * (H - 24);
	const horizonPath = $derived.by(() => {
		if (!site.horizon) return '';
		const n = site.horizon.length;
		const pts = Array.from({ length: n + 1 }, (_, k) => {
			const az = -180 + (k * 360) / n;
			const idx = ((Math.round((az * n) / 360) % n) + n) % n;
			return `${hx(az)},${hy(site.horizon![idx])}`;
		});
		return `M0,${H - 14} L${pts.join(' L')} L${W},${H - 14} Z`;
	});
</script>

<div class="grid gap-6 lg:grid-cols-2">
	<section class="grid content-start gap-4 rounded-xl border bg-card p-5">
		<h2 class="font-semibold">Emplacement</h2>
		<form class="flex gap-2" onsubmit={search}>
			<Input
				bind:value={query}
				placeholder="Adresse ou commune"
				aria-label="Rechercher une adresse"
			/>
			<Button type="submit" variant="outline" disabled={searching}>Chercher</Button>
		</form>
		{#if places.length}
			<ul class="grid gap-1 rounded-lg border p-1">
				{#each places as p (p.label + p.latitude)}
					<li>
						<button
							class="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
							onclick={() => choose(p)}>{p.label}</button
						>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="grid grid-cols-2 gap-2">
			<NumberInput label="Latitude" bind:value={site.latitude} step={0.0001} suffix="°N" />
			<NumberInput label="Longitude" bind:value={site.longitude} step={0.0001} suffix="°E" />
		</div>
		<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
			<span class="text-muted-foreground">{site.name || 'Position non nommée'}</span>
			<Button size="sm" variant="ghost" onclick={locate}>Utiliser ma position</Button>
		</div>

		<div class="grid gap-3 border-t pt-4">
			<div class="flex items-center justify-between gap-2">
				<h3 class="text-sm font-semibold">Relief et horizon</h3>
				<Button size="sm" variant="outline" onclick={horizon} disabled={horizonBusy}
					>{horizonBusy
						? 'Calcul…'
						: site.horizon
							? 'Recalculer'
							: 'Calculer depuis le relief'}</Button
				>
			</div>
			{#if site.horizon}
				<svg
					viewBox="0 0 {W} {H}"
					class="w-full"
					role="img"
					aria-label="Hauteur du relief autour de la maison"
				>
					<line x1="0" x2={W} y1={H - 14} y2={H - 14} class="stroke-border" />
					<path
						d={horizonPath}
						class="fill-muted-foreground/25 stroke-muted-foreground"
						stroke-width="1.5"
					/>
					{#each [[-180, 'N'], [-90, 'E'], [0, 'S'], [90, 'O'], [180, 'N']] as [az, l] (az)}
						<text
							x={hx(+az)}
							y={H - 2}
							text-anchor="middle"
							class="fill-muted-foreground text-[10px]">{l}</text
						>
					{/each}
				</svg>
				<p class="text-xs text-muted-foreground">
					Relief le plus haut : {fmt.dec(Math.max(...site.horizon))}° · données Copernicus 90 m,
					sans les arbres ni les bâtiments voisins.
				</p>
				<label class="flex items-center justify-between text-sm">
					Retirer le soleil direct quand il passe derrière le relief
					<Switch bind:checked={site.useHorizon} />
				</label>
			{:else}
				<p class="text-xs text-muted-foreground">
					Collines et montagnes peuvent cacher le soleil en hiver. Le calcul interroge 96 points
					d’altitude autour de vous.
				</p>
			{/if}
		</div>
	</section>

	<section class="grid content-start gap-4 rounded-xl border bg-card p-5">
		<div class="flex items-center justify-between gap-2">
			<h2 class="font-semibold">Toit</h2>
			{#if yieldKwc !== null}
				<span class="num font-mono text-sm">{fmt.int(yieldKwc)} kWh/kWc/an</span>
			{/if}
		</div>
		<Field
			label="Surface utile"
			bind:value={site.surface}
			min={5}
			max={150}
			step={1}
			display={(v) => `${v} m²`}
			hint="≈ {Math.floor(site.surface / PANEL_M2)} panneaux · {fmt.kwc(maxKwc)} max"
		/>
		{#each site.planes as p, i (p.id)}
			<div class="grid gap-3 rounded-lg border p-3">
				<div class="flex items-center gap-2">
					<Input bind:value={p.name} class="h-8" aria-label="Nom du pan" />
					{#if site.planes.length > 1}
						<Button
							size="sm"
							variant="ghost"
							aria-label="Supprimer {p.name}"
							onclick={() => (site.planes = site.planes.filter((x) => x.id !== p.id))}
							>Retirer</Button
						>
					{/if}
				</div>
				<Field
					label="Inclinaison"
					bind:value={p.tilt}
					min={0}
					max={60}
					step={1}
					display={(v) => `${v}°`}
				/>
				<Field
					label="Orientation"
					bind:value={p.azimuth}
					min={-180}
					max={180}
					step={5}
					display={(v) => `${dir(v)} (${v > 0 ? '+' : ''}${v}°)`}
				/>
				{#if site.planes.length > 1}
					<Field
						label="Part des panneaux"
						bind:value={p.share}
						min={0}
						max={1}
						step={0.05}
						display={(v) => fmt.pct(v / (site.planes.reduce((a, x) => a + x.share, 0) || 1))}
					/>
				{/if}
				{#if i === 0 && site.planes.length === 1}
					<p class="text-xs text-muted-foreground">0° = plein sud, −90° = est, +90° = ouest.</p>
				{/if}
			</div>
		{/each}
		<Button variant="outline" onclick={addPlane}>Ajouter un pan (est / ouest…)</Button>
		<details class="text-sm">
			<summary class="cursor-pointer text-muted-foreground">Années météo pour l’incertitude</summary
			>
			<div class="mt-3">
				<Field
					label="Années passées rejouées"
					bind:value={s.source.weatherYears}
					min={0}
					max={10}
					step={1}
					display={(v) => `${v}`}
				/>
			</div>
		</details>
	</section>
</div>
