<script lang="ts">
	import { app } from '#lib/app/store.svelte.js';
	import { buildContext, outcome } from '#lib/app/compute.js';
	import { defaultTariff } from '#lib/app/model.js';
	import { FR } from '#lib/rules/fr.js';
	import { at } from '#lib/rules/types.js';
	import { fmt } from '#lib/format.js';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';

	const s = $derived(app.settings);
	const t = $derived(app.settings.economics.tariff);
	const today = new Date().toISOString().slice(0, 10);
	const src = at(FR.tariffs.base, today)!;
	const KINDS = { base: 'Base', hphc: 'Heures creuses', tempo: 'Tempo' } as const;

	// chaque option tarifaire, sans et avec l'installation du simulateur
	const compare = $derived.by(() => {
		if (!app.prepared) return [];
		const snap = $state.snapshot(s);
		return (['base', 'hphc', 'tempo'] as const).map((kind) => {
			const tariff =
				kind === snap.economics.tariff.kind ? snap.economics.tariff : defaultTariff(kind);
			const economics = { ...snap.economics, tariff };
			const ctx = buildContext(app.prepared!, { ...snap, economics });
			const o = outcome(ctx, economics, snap.current);
			return {
				kind,
				before: o.billBefore + tariff.subscription,
				after: o.billAfter + tariff.subscription - o.exportRevenue
			};
		});
	});
	const best = $derived(
		compare.length ? compare.reduce((a, b) => (b.after < a.after ? b : a)).kind : null
	);
</script>

<div class="grid gap-6 lg:grid-cols-2">
	<section class="grid content-start gap-4 rounded-xl border bg-card p-5">
		<h2 class="font-semibold">Votre tarif</h2>
		<ToggleGroup.Root
			type="single"
			variant="outline"
			value={t.kind}
			onValueChange={(v) => v && app.setTariffKind(v as 'base' | 'hphc' | 'tempo')}
			class="w-full"
		>
			{#each Object.entries(KINDS) as [k, l] (k)}
				<ToggleGroup.Item value={k} class="flex-1">{l}</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
		<div class="grid grid-cols-2 gap-2">
			{#if t.kind === 'base'}
				<NumberInput label="Prix du kWh" bind:value={t.base} step={0.001} suffix="€" />
			{:else if t.kind === 'hphc'}
				<NumberInput label="Heures pleines" bind:value={t.hp} step={0.001} suffix="€/kWh" />
				<NumberInput label="Heures creuses" bind:value={t.hc} step={0.001} suffix="€/kWh" />
			{:else}
				{#each ['bleu', 'blanc', 'rouge'] as const as c (c)}
					<NumberInput label="{c} HP" bind:value={t.tempo[c].hp} step={0.001} suffix="€" />
					<NumberInput label="{c} HC" bind:value={t.tempo[c].hc} step={0.001} suffix="€" />
				{/each}
			{/if}
			<NumberInput label="Abonnement" bind:value={t.subscription} step={1} suffix="€/an" />
		</div>
		{#if t.kind === 'hphc'}
			<fieldset class="grid gap-2">
				<legend class="text-xs text-muted-foreground">Heures creuses (cliquez pour changer)</legend>
				<div class="grid grid-cols-12 gap-1">
					{#each t.hcHours as on, h (h)}
						<button
							class="num rounded py-1 font-mono text-[11px] {on
								? 'bg-grid text-white'
								: 'bg-secondary text-muted-foreground'}"
							aria-pressed={on}
							onclick={() => (t.hcHours[h] = !on)}>{h}h</button
						>
					{/each}
				</div>
			</fieldset>
		{/if}
		{#if t.kind === 'tempo'}
			<p class="text-xs text-muted-foreground">
				Calendrier estimé : 22 jours rouges et 43 blancs placés sur les jours ouvrés les plus froids
				de votre année météo, comme le fait RTE. Heures creuses de 22 h à 6 h.
			</p>
		{/if}
		<p class="text-xs text-muted-foreground">
			Valeurs par défaut : {src.source}, en vigueur au {new Date(src.from).toLocaleDateString(
				'fr-FR'
			)}. Vérifiez sur votre facture.
		</p>

		{#if t.kind !== 'base'}
			<div class="grid gap-3 border-t pt-4">
				<label class="flex items-center justify-between text-sm">
					Recharger la batterie sur le réseau en heures creuses
					<Switch bind:checked={s.gridCharge.enabled} />
				</label>
				{#if s.gridCharge.enabled}
					<ToggleGroup.Root
						type="single"
						variant="outline"
						bind:value={s.gridCharge.mode}
						class="w-full"
					>
						<ToggleGroup.Item value="rouge" class="flex-1" disabled={t.kind !== 'tempo'}
							>Avant un jour rouge</ToggleGroup.Item
						>
						<ToggleGroup.Item value="hc" class="flex-1">Toutes les nuits</ToggleGroup.Item>
					</ToggleGroup.Root>
					<NumberInput
						label="Charge visée"
						bind:value={s.gridCharge.targetSoc}
						scale={100}
						suffix="%"
					/>
				{/if}
			</div>
		{/if}
	</section>

	<section class="grid content-start gap-4 rounded-xl border bg-card p-5">
		<div>
			<h2 class="font-semibold">Quelle option choisir ?</h2>
			<p class="text-sm text-muted-foreground">
				Facture annuelle (abonnement compris, revente déduite) avec le scénario « {s.current.name} ».
			</p>
		</div>
		<table class="w-full text-sm">
			<thead class="text-left text-xs text-muted-foreground">
				<tr>
					<th class="py-2 font-normal">Option</th>
					<th class="py-2 text-right font-normal">Sans panneaux</th>
					<th class="py-2 text-right font-normal">Avec</th>
				</tr>
			</thead>
			<tbody>
				{#each compare as c (c.kind)}
					<tr class="border-t">
						<td class="py-2">
							{KINDS[c.kind]}
							{#if c.kind === best}<span
									class="ml-1 rounded-full bg-solar/15 px-2 py-0.5 text-xs text-solar"
									>la moins chère</span
								>{/if}
						</td>
						<td class="num py-2 text-right font-mono">{fmt.eur(c.before)}</td>
						<td class="num py-2 text-right font-mono font-semibold">{fmt.eur(c.after)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="text-xs text-muted-foreground">
			Les options non choisies utilisent les prix réglementés par défaut.
		</p>
	</section>
</div>
