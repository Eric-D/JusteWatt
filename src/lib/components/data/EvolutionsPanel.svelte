<script lang="ts">
	import { app } from '#lib/app/store.svelte.js';
	import { uid } from '#lib/app/model.js';
	import { EVOLUTION_LABELS, type Evolution } from '#lib/engine/evolutions.js';
	import { fmt } from '#lib/format.js';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';

	const s = $derived(app.settings);
	const totals = $derived(app.ctx?.evolutionTotals ?? {});

	const PRESETS: { kind: Evolution['kind']; desc: string; make: () => Evolution }[] = [
		{
			kind: 've',
			desc: '10 000 km/an, recharge le soir',
			make: () => ({
				id: uid(),
				kind: 've',
				kmPerYear: 10000,
				kwhPer100km: 17,
				mode: 'soir',
				power: 3.7
			})
		},
		{
			kind: 'pac',
			desc: 'Remplace un chauffage non électrique',
			make: () => ({ id: uid(), kind: 'pac', kwhPerYear: 3500 })
		},
		{
			kind: 'clim',
			desc: 'Surtout les après-midi chauds',
			make: () => ({ id: uid(), kind: 'clim', kwhPerYear: 600 })
		},
		{
			kind: 'piscine',
			desc: 'Filtration de mai à septembre, pilotable',
			make: () => ({ id: uid(), kind: 'piscine', kwhPerDay: 6, power: 1 })
		},
		{
			kind: 'autre',
			desc: 'Consommation répartie toute l’année',
			make: () => ({ id: uid(), kind: 'autre', label: 'Nouvel usage', kwhPerYear: 500 })
		}
	];
	const remove = (id: string) => (s.evolutions = s.evolutions.filter((e) => e.id !== id));
</script>

<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
	<section class="grid content-start gap-4 rounded-xl border bg-card p-5">
		<div>
			<h2 class="font-semibold">Ce qui va changer chez vous</h2>
			<p class="text-sm text-muted-foreground">
				Ajoutées à la consommation mesurée, avec un profil horaire réaliste (température réelle pour
				le chauffage et la climatisation). Les usages pilotables profitent du surplus solaire.
			</p>
		</div>
		{#if !s.evolutions.length}
			<p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
				Aucune évolution prévue.
			</p>
		{/if}
		{#each s.evolutions as ev (ev.id)}
			<div class="grid gap-3 rounded-lg border p-4">
				<div class="flex items-center justify-between gap-2">
					<span class="font-medium"
						>{ev.kind === 'autre' ? ev.label : EVOLUTION_LABELS[ev.kind]}</span
					>
					<span class="flex items-center gap-3">
						{#if totals[ev.id] !== undefined}<span
								class="num font-mono text-sm text-muted-foreground"
								>+{fmt.kwh(totals[ev.id])}/an</span
							>{/if}
						<Button size="sm" variant="ghost" onclick={() => remove(ev.id)}>Retirer</Button>
					</span>
				</div>
				{#if ev.kind === 've'}
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
						<NumberInput label="Distance" bind:value={ev.kmPerYear} step={500} suffix="km/an" />
						<NumberInput
							label="Consommation"
							bind:value={ev.kwhPer100km}
							step={1}
							suffix="kWh/100"
						/>
						<NumberInput label="Puissance de charge" bind:value={ev.power} step={0.1} suffix="kW" />
					</div>
					<ToggleGroup.Root type="single" variant="outline" bind:value={ev.mode} class="w-full">
						<ToggleGroup.Item value="soir" class="flex-1">Le soir</ToggleGroup.Item>
						<ToggleGroup.Item value="nuit" class="flex-1">La nuit (HC)</ToggleGroup.Item>
						<ToggleGroup.Item value="midi" class="flex-1">Sur le surplus</ToggleGroup.Item>
					</ToggleGroup.Root>
				{:else if ev.kind === 'piscine'}
					<div class="grid grid-cols-2 gap-2">
						<NumberInput
							label="Énergie par jour"
							bind:value={ev.kwhPerDay}
							step={0.5}
							suffix="kWh"
						/>
						<NumberInput label="Puissance pompe" bind:value={ev.power} step={0.1} suffix="kW" />
					</div>
				{:else if ev.kind === 'autre'}
					<div class="grid grid-cols-2 gap-2">
						<Input bind:value={ev.label} aria-label="Nom de l’usage" />
						<NumberInput label="Énergie" bind:value={ev.kwhPerYear} step={100} suffix="kWh/an" />
					</div>
				{:else}
					<NumberInput
						label="Énergie électrique"
						bind:value={ev.kwhPerYear}
						step={100}
						suffix="kWh/an"
					/>
				{/if}
			</div>
		{/each}
	</section>
	<section class="grid content-start gap-2">
		<h3 class="text-sm font-semibold">Ajouter</h3>
		{#each PRESETS as p (p.kind)}
			<button
				class="grid gap-0.5 rounded-lg border bg-card p-3 text-left transition-colors hover:border-foreground/30"
				onclick={() => (s.evolutions = [...s.evolutions, p.make()])}
			>
				<span class="text-sm font-medium">{EVOLUTION_LABELS[p.kind]}</span>
				<span class="text-xs text-muted-foreground">{p.desc}</span>
			</button>
		{/each}
	</section>
</div>
