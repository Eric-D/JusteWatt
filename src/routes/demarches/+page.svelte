<script lang="ts">
	import { resolve } from '$app/paths';
	import { app } from '#lib/app/store.svelte.js';
	import { PANEL_M2, PANEL_WC } from '#lib/app/model.js';
	import { FR } from '#lib/rules/fr.js';
	import { at, bracket } from '#lib/rules/types.js';
	import { fmt } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';

	const s = $derived(app.settings);
	const sc = $derived(app.settings.current);
	const r = $derived(app.result);
	const today = new Date().toISOString().slice(0, 10);
	const done = $derived(FR.steps.filter((x) => s.steps[x.id]).length);
	const panels = $derived(Math.round((sc.kwc * 1000) / PANEL_WC));
	const vat = $derived(at(FR.vat, today)!);
	const surplus = $derived(at(FR.surplus, today)!);
	const premium = $derived(at(FR.premium, today)!);
	const DIRS = ['sud', 'sud-ouest', 'ouest', 'nord-ouest', 'nord', 'nord-est', 'est', 'sud-est'];
	const dir = (az: number) => DIRS[((Math.round(az / 45) % 8) + 8) % 8];
	const d = (x: string) => new Date(x).toLocaleDateString('fr-FR');
</script>

<svelte:head><title>Démarches · JusteWatt</title></svelte:head>

<div class="grid gap-6">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Démarches</h1>
			<p class="text-sm text-muted-foreground">
				{FR.label} · {done}/{FR.steps.length} étapes faites
			</p>
		</div>
		<Button variant="outline" class="no-print" onclick={() => print()}
			>Imprimer la fiche projet</Button
		>
	</div>

	<div class="grid gap-6 lg:grid-cols-[1fr_360px]">
		<ol class="grid content-start gap-3">
			{#each FR.steps as st, i (st.id)}
				<li
					class="grid grid-cols-[auto_1fr] gap-4 rounded-xl border bg-card p-4 {s.steps[st.id]
						? 'opacity-60'
						: ''}"
				>
					<input
						type="checkbox"
						class="mt-1 size-4 accent-foreground"
						bind:checked={s.steps[st.id]}
						aria-label="Étape faite : {st.title}"
					/>
					<div class="grid gap-1">
						<div class="flex flex-wrap items-baseline gap-x-3">
							<span class="num font-mono text-xs text-muted-foreground"
								>{String(i + 1).padStart(2, '0')}</span
							>
							<h2 class="font-medium {s.steps[st.id] ? 'line-through' : ''}">{st.title}</h2>
						</div>
						<p class="text-xs text-muted-foreground">{st.who} · {st.when}</p>
						<p class="text-sm text-pretty">{st.detail}</p>
						{#if st.link}<a
								class="no-print text-sm underline"
								href={st.link}
								target="_blank"
								rel="noreferrer">Ouvrir le site</a
							>{/if}
					</div>
				</li>
			{/each}
		</ol>

		<aside class="grid content-start gap-4">
			<section class="grid gap-3 rounded-xl border bg-card p-5">
				<h2 class="font-semibold">Fiche projet</h2>
				<p class="text-xs text-muted-foreground">
					À joindre à la déclaration préalable et à la demande de raccordement (scénario « {sc.name} »).
				</p>
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
					<dt class="text-muted-foreground">Puissance crête</dt>
					<dd class="num font-mono">{fmt.kwc(sc.kwc)}</dd>
					<dt class="text-muted-foreground">Panneaux</dt>
					<dd class="num font-mono">{panels} × {PANEL_WC} Wc · {fmt.dec(panels * PANEL_M2)} m²</dd>
					{#each s.site.planes as p (p.id)}
						<dt class="text-muted-foreground">{p.name}</dt>
						<dd>{p.tilt}° · {dir(p.azimuth)}</dd>
					{/each}
					<dt class="text-muted-foreground">Batterie</dt>
					<dd class="num font-mono">
						{sc.battery.capacity
							? `${fmt.dec(sc.battery.capacity)} kWh · ${fmt.dec(sc.battery.power)} kW`
							: 'aucune'}
					</dd>
					<dt class="text-muted-foreground">Injection max</dt>
					<dd class="num font-mono">
						{sc.inverterAcMax ? `${fmt.dec(sc.inverterAcMax)} kVA` : fmt.kwc(sc.kwc)}
					</dd>
					{#if r}
						<dt class="text-muted-foreground">Production</dt>
						<dd class="num font-mono">{fmt.kwh(r.sim.production)}/an</dd>
						<dt class="text-muted-foreground">Autoconsommée</dt>
						<dd class="num font-mono">{fmt.pct(r.sim.selfConsumption)}</dd>
						<dt class="text-muted-foreground">Surplus injecté</dt>
						<dd class="num font-mono">{fmt.kwh(r.sim.export)}/an</dd>
					{/if}
					<dt class="text-muted-foreground">Raccordement</dt>
					<dd>Autoconsommation avec vente du surplus</dd>
				</dl>
			</section>

			<section class="grid gap-3 rounded-xl border bg-card p-5 text-sm">
				<h2 class="font-semibold">Règles en vigueur</h2>
				<div>
					<p>
						TVA : {fmt.dec((bracket(vat.value, sc.kwc)?.rate ?? 0) * 100)} % pour {fmt.kwc(sc.kwc)}
						{#if bracket(vat.value, sc.kwc)?.note}<span class="text-muted-foreground"
								>({bracket(vat.value, sc.kwc)?.note})</span
							>{/if}
					</p>
					<p class="text-xs text-muted-foreground">{vat.source} · depuis le {d(vat.from)}</p>
				</div>
				<div>
					<p>
						Revente du surplus : {fmt.price(bracket(surplus.value, sc.kwc)?.price ?? 0)}/kWh pendant
						20 ans
					</p>
					<p class="text-xs text-muted-foreground">
						{surplus.source} · depuis le {d(surplus.from)}
					</p>
				</div>
				<div>
					<p>
						Prime : {fmt.eur(bracket(premium.value, sc.kwc)?.perKwc ?? 0)}/kWc, soit {fmt.eur(
							(bracket(premium.value, sc.kwc)?.perKwc ?? 0) * sc.kwc
						)}
					</p>
					<p class="text-xs text-muted-foreground">
						{premium.source} · depuis le {d(premium.from)}
					</p>
				</div>
				<p class="text-xs text-muted-foreground">
					Valeurs vérifiées le {d(FR.checked)}. Les tarifs changent chaque trimestre : confirmez-les
					avec votre installateur.
				</p>
			</section>
			{#if !app.hasData}
				<p class="text-sm text-muted-foreground">
					<a class="underline" href={resolve('/')}>Ajoutez vos données</a> pour remplir la fiche.
				</p>
			{/if}
		</aside>
	</div>
</div>
