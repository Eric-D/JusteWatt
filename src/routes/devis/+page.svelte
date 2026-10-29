<script lang="ts">
	import { resolve } from '$app/paths';
	import { app } from '#lib/app/store.svelte.js';
	import { outcome } from '#lib/app/compute.js';
	import { defaultBattery, uid, type Scenario } from '#lib/app/model.js';
	import { fmt } from '#lib/format.js';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import CashChart from '#lib/components/charts/CashChart.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';

	const s = $derived(app.settings);
	const e = $derived(app.settings.economics);
	const COLORS = ['var(--q1)', 'var(--q2)', 'var(--q3)', 'var(--q4)'];
	const MAX = 4;

	const results = $derived.by(() => {
		if (!app.ctx) return [];
		const econ = $state.snapshot(e);
		return s.quotes.map((q) => ({ q, o: outcome(app.ctx!, econ, $state.snapshot(q)) }));
	});
	const best = $derived(
		results.length
			? results.reduce((a, r) => (r.o.finance.netGain > a.o.finance.netGain ? r : a)).q.id
			: ''
	);

	const total = (q: Scenario) =>
		q.lines?.length ? q.lines.reduce((a, l) => a + (l.amount || 0), 0) : (q.investment ?? 0);
	function sync(q: Scenario) {
		q.investment = total(q);
	}
	function add() {
		s.quotes = [
			...s.quotes,
			{
				id: uid(),
				name: `Devis ${s.quotes.length + 1}`,
				kwc: 3,
				battery: defaultBattery(0),
				inverterAcMax: 0,
				investment: 7000,
				premium: true,
				lines: [
					{ label: 'Panneaux', amount: 0 },
					{ label: 'Onduleurs', amount: 0 },
					{ label: 'Batterie', amount: 0 },
					{ label: 'Pose et démarches', amount: 7000 }
				]
			}
		];
	}
	function fromSimulator() {
		const c = $state.snapshot(s.current);
		const inv = c.investment ?? app.result?.investment ?? 0;
		s.quotes = [
			...s.quotes,
			{ ...c, id: uid(), name: c.name, investment: inv, lines: [{ label: 'Total', amount: inv }] }
		];
	}
	const remove = (id: string) => (s.quotes = s.quotes.filter((q) => q.id !== id));
</script>

<svelte:head><title>Devis · JusteWatt</title></svelte:head>

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
				<h1 class="text-2xl font-semibold tracking-tight">Comparer les offres</h1>
				<p class="text-sm text-muted-foreground">
					Chaque devis est simulé sur la même année de consommation et les mêmes habitudes.
				</p>
			</div>
			<div class="no-print flex gap-2">
				<Button variant="outline" onclick={() => print()}>Exporter en PDF</Button>
			</div>
		</div>

		<div class="no-print grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
			<NumberInput
				label="Inflation"
				bind:value={e.inflation}
				scale={100}
				step={0.5}
				suffix="%/an"
			/>
			<NumberInput label="Durée" bind:value={e.years} min={5} max={30} suffix="ans" />
			<NumberInput
				label="Revente du surplus"
				bind:value={e.sellPrice}
				step={0.005}
				suffix="€/kWh"
			/>
			<NumberInput
				label="Actualisation"
				bind:value={e.discountRate}
				scale={100}
				step={0.1}
				suffix="%/an"
			/>
		</div>

		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each results as { q, o }, i (q.id)}
				<article
					class="grid content-start gap-4 rounded-xl border bg-card p-5 {q.id === best &&
					results.length > 1
						? 'ring-2 ring-foreground'
						: ''}"
				>
					<div class="flex items-center gap-2">
						<span class="h-0.5 w-4 shrink-0 rounded" style:background={COLORS[i]}></span>
						<Input bind:value={q.name} class="h-8 font-medium" aria-label="Nom du devis" />
						{#if q.id === best && results.length > 1}<span
								class="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">Meilleur gain</span
							>{/if}
					</div>
					<div class="grid grid-cols-3 gap-2">
						<NumberInput label="Panneaux" bind:value={q.kwc} step={0.1} suffix="kWc" />
						<NumberInput label="Batterie" bind:value={q.battery.capacity} step={0.5} suffix="kWh" />
						<NumberInput label="Puiss. batt." bind:value={q.battery.power} step={0.5} suffix="kW" />
					</div>
					<details class="text-sm" open={!q.lines || q.lines.length <= 1 ? false : undefined}>
						<summary class="cursor-pointer text-muted-foreground">Lignes du devis</summary>
						<div class="mt-2 grid gap-1.5">
							{#each q.lines ?? [] as l, k (k)}
								<div class="flex gap-1.5">
									<Input bind:value={l.label} class="h-8" aria-label="Libellé" />
									<Input
										type="number"
										class="num h-8 w-28 text-right font-mono"
										bind:value={l.amount}
										oninput={() => sync(q)}
										aria-label="Montant TTC"
									/>
								</div>
							{/each}
							<Button
								size="sm"
								variant="ghost"
								onclick={() => (q.lines = [...(q.lines ?? []), { label: 'Ligne', amount: 0 }])}
								>Ajouter une ligne</Button
							>
						</div>
					</details>
					<label class="flex items-center justify-between text-sm">
						Prime à l’autoconsommation ({fmt.eur(o.premium)})
						<Switch bind:checked={q.premium} />
					</label>
					<dl class="num grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-sm">
						<div>
							<dt class="font-sans text-xs text-muted-foreground">Total TTC</dt>
							<dd class="text-lg font-semibold">{fmt.eur(o.investment)}</dd>
						</div>
						<div>
							<dt class="font-sans text-xs text-muted-foreground">Par kWc</dt>
							<dd class="text-lg">{q.kwc ? fmt.eur(o.investment / q.kwc) : '—'}</dd>
						</div>
						<div>
							<dt class="font-sans text-xs text-muted-foreground">Autonomie</dt>
							<dd>{fmt.pct(o.sim.autonomy)}</dd>
						</div>
						<div>
							<dt class="font-sans text-xs text-muted-foreground">Économie / an</dt>
							<dd>{fmt.eur(o.savings + o.exportRevenue)}</dd>
						</div>
						<div>
							<dt class="font-sans text-xs text-muted-foreground">Retour</dt>
							<dd>{fmt.years(o.finance.payback)}</dd>
						</div>
						<div>
							<dt class="font-sans text-xs text-muted-foreground">Gain net</dt>
							<dd class="font-semibold">{fmt.eur(o.finance.netGain)}</dd>
						</div>
						<div>
							<dt class="font-sans text-xs text-muted-foreground">TRI</dt>
							<dd>{o.finance.irr === null ? '—' : fmt.dec(o.finance.irr * 100) + ' %'}</dd>
						</div>
						<div>
							<dt class="font-sans text-xs text-muted-foreground">VAN</dt>
							<dd>{fmt.eur(o.finance.npv)}</dd>
						</div>
					</dl>
					<div class="no-print flex justify-between">
						<Button size="sm" variant="ghost" onclick={() => app.open(q)}
							>Ouvrir dans le simulateur</Button
						>
						<Button
							size="sm"
							variant="ghost"
							class="text-muted-foreground"
							onclick={() => remove(q.id)}>Supprimer</Button
						>
					</div>
				</article>
			{/each}
			{#if s.quotes.length < MAX}
				<div
					class="no-print grid content-center gap-3 rounded-xl border border-dashed p-6 text-center"
				>
					<p class="font-medium">Ajouter un devis</p>
					<p class="text-sm text-muted-foreground">
						Saisissez les lignes : panneaux, onduleurs, batterie, pose.
					</p>
					<div class="flex flex-wrap justify-center gap-2">
						<Button onclick={add}>Nouveau devis</Button>
						<Button variant="outline" onclick={fromSimulator}>Depuis le simulateur</Button>
					</div>
				</div>
			{/if}
		</div>

		{#if results.length}
			<section class="grid gap-4 rounded-xl border bg-card p-5">
				<div>
					<h2 class="font-semibold">Trésorerie cumulée</h2>
					<p class="text-sm text-muted-foreground">
						Le passage au-dessus de zéro marque le retour sur investissement.
					</p>
				</div>
				<CashChart
					series={results.map((r, i) => ({
						name: r.q.name,
						color: COLORS[i],
						cumulative: r.o.finance.cumulative
					}))}
				/>
			</section>
		{/if}
	</div>
{/if}
