<script lang="ts">
	import { resolve } from '$app/paths';
	import { app } from '#lib/app/store.svelte.js';
	import { estimateInvestment } from '#lib/app/compute.js';
	import { PANEL_M2, PANEL_WC } from '#lib/app/model.js';
	import { fmt, monthLabel } from '#lib/format.js';
	import Field from '#lib/components/Field.svelte';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import Stat from '#lib/components/Stat.svelte';
	import DayChart from '#lib/components/charts/DayChart.svelte';
	import MonthChart from '#lib/components/charts/MonthChart.svelte';
	import CashChart from '#lib/components/charts/CashChart.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';

	const s = $derived(app.settings);
	const sc = $derived(app.settings.current);
	const e = $derived(app.settings.economics);
	const r = $derived(app.result);
	const cons = $derived(app.prepared?.cons);

	const panels = $derived(Math.round((sc.kwc * 1000) / PANEL_WC));
	const area = $derived(panels * PANEL_M2);
	let month = $state('');
	const months = $derived(cons ? [...new Set(cons.localDay.map((d) => d.slice(0, 7)))] : []);
	let saveName = $state('');

	// répartition annuelle de la consommation
	const shares = $derived.by(() => {
		if (!r) return null;
		const f = r.sim.flows;
		let d = 0,
			b = 0,
			g = 0;
		for (let i = 0; i < f.load.length; i++) {
			d += f.direct[i];
			b += f.discharge[i];
			g += f.import[i];
		}
		const t = d + b + g || 1;
		return { direct: d / t, battery: b / t, grid: g / t };
	});

	function setMode(v: string) {
		if (v === 'estimation') sc.investment = null;
		else if (v === 'devis' && sc.investment === null) sc.investment = estimateInvestment(sc, e);
	}
	$effect(() => {
		// la puissance batterie suit la capacité tant qu'elle n'a pas été réglée au-delà
		if (sc.battery.capacity > 0 && sc.battery.power === 0)
			sc.battery.power = Math.max(2.5, sc.battery.capacity / 2);
	});
</script>

<svelte:head><title>Simulateur · JusteWatt</title></svelte:head>

{#if !app.ready || (!app.prepared && app.busy)}
	<p class="text-muted-foreground" role="status">{app.busy || 'Chargement'}…</p>
{:else if !app.hasData}
	<p>
		Choisissez d’abord une source de données sur <a class="underline" href={resolve('/')}
			>l’accueil</a
		>.
	</p>
{:else if !r || !cons}
	<div class="grid gap-3">
		<p class="text-muted-foreground">Les données ne sont pas encore calculées.</p>
		<div><Button onclick={() => app.recompute()}>Calculer</Button></div>
	</div>
{:else}
	<div class="grid gap-6 lg:grid-cols-[320px_1fr]">
		<!-- réglages -->
		<aside
			class="grid content-start gap-5 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto lg:pr-2"
		>
			<div class="grid gap-1">
				<span class="text-xs text-muted-foreground">Scénario</span>
				<Input bind:value={sc.name} class="font-medium" aria-label="Nom du scénario" />
			</div>

			<section class="grid gap-4 rounded-xl border bg-card p-4">
				<h2 class="text-sm font-semibold">Installation</h2>
				<Field
					label="Panneaux"
					bind:value={sc.kwc}
					min={0}
					max={18}
					step={0.5}
					display={fmt.kwc}
					hint="{panels} × {PANEL_WC} Wc · {fmt.int(area)} m² sur {fmt.int(
						s.site.surface
					)} m²{area > s.site.surface ? ' — dépasse la surface du toit' : ''}"
				/>
				<Field
					label="Batterie"
					bind:value={sc.battery.capacity}
					min={0}
					max={25}
					step={0.5}
					display={(v) => (v ? `${fmt.dec(v)} kWh` : 'aucune')}
				/>
				{#if sc.battery.capacity > 0}
					<Field
						label="Puissance batterie"
						bind:value={sc.battery.power}
						min={0.5}
						max={12}
						step={0.5}
						display={(v) => `${fmt.dec(v)} kW`}
					/>
				{/if}
				<Field
					label="Puissance max onduleur"
					bind:value={sc.inverterAcMax}
					min={0}
					max={18}
					step={0.5}
					display={(v) => (v ? `${fmt.dec(v)} kW` : 'sans limite')}
					hint={r.sim.clipped > 1 ? `${fmt.kwh(r.sim.clipped)} écrêtés par an` : ''}
				/>
			</section>

			<section class="grid gap-4 rounded-xl border bg-card p-4">
				<h2 class="text-sm font-semibold">Prix et durée</h2>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					value={sc.investment === null ? 'estimation' : 'devis'}
					onValueChange={setMode}
					class="w-full"
				>
					<ToggleGroup.Item value="estimation" class="flex-1">Estimation</ToggleGroup.Item>
					<ToggleGroup.Item value="devis" class="flex-1">Mon montant</ToggleGroup.Item>
				</ToggleGroup.Root>
				{#if sc.investment === null}
					<div class="grid grid-cols-2 gap-2">
						<NumberInput label="Panneaux" bind:value={e.pricePerKwc} step={50} suffix="€/kWc" />
						<NumberInput label="Batterie" bind:value={e.pricePerKwh} step={25} suffix="€/kWh" />
						<NumberInput label="Forfait pose" bind:value={e.priceFixed} step={100} suffix="€" />
					</div>
				{:else}
					<NumberInput
						label="Investissement TTC"
						bind:value={sc.investment}
						step={100}
						suffix="€"
					/>
				{/if}
				<label class="flex items-center justify-between text-sm">
					Déduire la prime ({fmt.eur(r.premium)})
					<Switch bind:checked={sc.premium} />
				</label>
				<Field
					label="Inflation de l’électricité"
					bind:value={e.inflation}
					min={0}
					max={0.08}
					step={0.005}
					display={(v) => `${fmt.dec(v * 100)} %/an`}
				/>
				<Field
					label="Durée d’amortissement"
					bind:value={e.years}
					min={5}
					max={30}
					step={1}
					display={(v) => `${v} ans`}
				/>
				<NumberInput
					label="Revente du surplus"
					bind:value={e.sellPrice}
					step={0.005}
					suffix="€/kWh"
				/>
				<details class="group text-sm">
					<summary class="cursor-pointer text-muted-foreground">Réglages avancés</summary>
					<div class="mt-3 grid grid-cols-2 gap-3">
						<NumberInput
							label="Rendement batterie"
							bind:value={sc.battery.efficiency}
							scale={100}
							suffix="%"
						/>
						<NumberInput
							label="Profondeur de décharge"
							bind:value={sc.battery.depthOfDischarge}
							scale={100}
							suffix="%"
						/>
						<NumberInput label="Réserve" bind:value={sc.battery.reserve} scale={100} suffix="%" />
						<NumberInput label="Veille batterie" bind:value={sc.battery.standbyW} suffix="W" />
						<NumberInput
							label="Perte panneaux"
							bind:value={e.degradation}
							scale={100}
							step={0.1}
							suffix="%/an"
						/>
						<NumberInput
							label="Actualisation"
							bind:value={e.discountRate}
							scale={100}
							step={0.1}
							suffix="%/an"
						/>
						<NumberInput label="Assurance, entretien" bind:value={e.yearlyCosts} suffix="€/an" />
						<NumberInput label="Onduleurs remplacés" bind:value={e.inverterYear} suffix="an" />
						<NumberInput label="Coût onduleurs" bind:value={e.inverterPerKwc} suffix="€/kWc" />
						<NumberInput label="Batterie remplacée" bind:value={e.batteryYear} suffix="an" />
					</div>
				</details>
			</section>

			<form
				class="flex gap-2"
				onsubmit={(ev) => {
					ev.preventDefault();
					app.saveScenario(saveName || sc.name);
					saveName = '';
				}}
			>
				<Input
					bind:value={saveName}
					placeholder="Nom du scénario"
					aria-label="Nom du scénario à enregistrer"
				/>
				<Button type="submit" variant="outline">Enregistrer</Button>
			</form>
			{#if s.scenarios.length}
				<ul class="grid gap-1 text-sm">
					{#each s.scenarios as x (x.id)}
						<li
							class="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-secondary"
						>
							<button class="truncate text-left" onclick={() => app.open(x)}>{x.name}</button>
							<span class="num shrink-0 font-mono text-xs text-muted-foreground"
								>{fmt.kwc(x.kwc)} · {fmt.dec(x.battery.capacity)} kWh</span
							>
							<button
								class="text-xs text-muted-foreground hover:text-destructive"
								aria-label="Supprimer {x.name}"
								onclick={() => (s.scenarios = s.scenarios.filter((y) => y.id !== x.id))}>✕</button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>

		<!-- résultats -->
		<div class="grid min-w-0 content-start gap-6">
			<div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
				<Stat
					label="Autonomie"
					value={fmt.pct(r.sim.autonomy)}
					sub="{fmt.pct(r.sim.selfConsumption)} de la production consommée"
				/>
				<Stat
					label="Économie la 1re année"
					value={fmt.eur(r.savings + r.exportRevenue)}
					sub="dont {fmt.eur(r.exportRevenue)} de revente"
				/>
				<Stat
					label="Retour sur investissement"
					value={fmt.years(r.finance.payback)}
					sub="{fmt.eur(r.investment - r.premium)} investis"
				/>
				<Stat
					label="Gain net sur {e.years} ans"
					value={fmt.eur(r.finance.netGain)}
					sub="VAN {fmt.eur(r.finance.npv)} · TRI {r.finance.irr === null
						? '—'
						: fmt.dec(r.finance.irr * 100) + ' %'}"
				/>
			</div>

			<section class="grid gap-4 rounded-xl border bg-card p-5">
				<div class="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 class="font-semibold">D’où vient votre électricité</h2>
						<p class="text-sm text-muted-foreground">
							Consommation {fmt.kwh(r.sim.load)} · production {fmt.kwh(r.sim.production)} · achat {fmt.kwh(
								r.sim.import
							)} · surplus {fmt.kwh(r.sim.export)}
						</p>
					</div>
					{#if shares}
						<div
							class="flex w-full max-w-sm overflow-hidden rounded-full"
							role="img"
							aria-label="Solaire {fmt.pct(shares.direct)}, batterie {fmt.pct(
								shares.battery
							)}, réseau {fmt.pct(shares.grid)}"
						>
							<div class="h-2.5 bg-solar" style:width="{shares.direct * 100}%"></div>
							<div class="ml-0.5 h-2.5 bg-battery" style:width="{shares.battery * 100}%"></div>
							<div class="ml-0.5 h-2.5 bg-grid" style:width="{shares.grid * 100}%"></div>
						</div>
					{/if}
				</div>
				<MonthChart flows={r.sim.flows} localDay={cons.localDay} />
			</section>

			<section class="grid gap-4 rounded-xl border bg-card p-5">
				<div class="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 class="font-semibold">Une journée type</h2>
						<p class="text-sm text-muted-foreground">
							Moyenne heure par heure {month ? `en ${monthLabel(month)}` : 'sur l’année'}.
						</p>
					</div>
					<select
						bind:value={month}
						class="rounded-md border bg-background px-2 py-1 text-sm"
						aria-label="Mois affiché"
					>
						<option value="">Toute l’année</option>
						{#each months as m (m)}<option value={m}>{monthLabel(m)}</option>{/each}
					</select>
				</div>
				<DayChart flows={r.sim.flows} localHour={cons.localHour} localDay={cons.localDay} {month} />
			</section>

			<section class="grid gap-4 rounded-xl border bg-card p-5">
				<div class="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 class="font-semibold">Rentabilité</h2>
						<p class="text-sm text-muted-foreground">
							Trésorerie cumulée : facture évitée, revente, remplacements et entretien compris.
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={() => app.computeSpread()}
						disabled={!!app.busy}
					>
						Incertitude météo et inflation
					</Button>
				</div>
				<CashChart
					series={[{ name: sc.name, color: 'var(--q1)', cumulative: r.finance.cumulative }]}
				/>
				{#if app.spread}
					{@const sp = app.spread}
					<div class="grid gap-2 rounded-lg bg-secondary/60 p-4 text-sm">
						<p>
							Sur {sp.samples.length / 3} années météo ({Math.min(
								...sp.samples.map((x) => x.year)
							)}–{Math.max(...sp.samples.map((x) => x.year))}) et une inflation de {fmt.dec(
								Math.max(0, e.inflation - 0.02) * 100
							)} à {fmt.dec((e.inflation + 0.02) * 100)} %/an :
						</p>
						<p class="num font-mono">
							Gain net : <strong>{fmt.eur(sp.p10)}</strong> (prudent, P10) ·
							<strong>{fmt.eur(sp.p50)}</strong>
							(médian) ·
							<strong>{fmt.eur(sp.p90)}</strong> (favorable, P90)
						</p>
						<p class="num font-mono">
							Retour : de {fmt.years(sp.paybackP10)} à {fmt.years(sp.paybackP90)}
						</p>
						<div class="relative mt-2 h-6" aria-hidden="true">
							{#each sp.samples as x, i (i)}
								{@const lo = Math.min(...sp.samples.map((y) => y.netGain))}
								{@const hi = Math.max(...sp.samples.map((y) => y.netGain))}
								<span
									class="absolute top-1 size-3 rounded-full border-2 border-card bg-q1"
									style:left="calc({hi > lo ? ((x.netGain - lo) / (hi - lo)) * 100 : 50}% - 6px)"
									title="{x.year} · inflation {fmt.dec(x.inflation * 100)} % · {fmt.eur(x.netGain)}"
								></span>
							{/each}
						</div>
					</div>
				{/if}
				<p class="text-xs text-muted-foreground">
					Facture d’énergie {fmt.eur(r.billBefore)} → {fmt.eur(r.billAfter)} par an (hors abonnement),
					tarif
					{e.tariff.kind === 'base'
						? 'Base'
						: e.tariff.kind === 'hphc'
							? 'Heures creuses'
							: 'Tempo'}.
					<a class="underline" href={resolve('/donnees')}>Modifier</a>
				</p>
			</section>
		</div>
	</div>
{/if}
