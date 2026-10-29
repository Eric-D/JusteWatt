<script lang="ts">
	import { resolve } from '$app/paths';
	import { app } from '#lib/app/store.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import ConsumptionPanel from '#lib/components/data/ConsumptionPanel.svelte';
	import RoofPanel from '#lib/components/data/RoofPanel.svelte';
	import EvolutionsPanel from '#lib/components/data/EvolutionsPanel.svelte';
	import TariffPanel from '#lib/components/data/TariffPanel.svelte';

	let tab = $state('conso');
</script>

<svelte:head><title>Données · JusteWatt</title></svelte:head>

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
				<h1 class="text-2xl font-semibold tracking-tight">Données</h1>
				<p class="text-sm text-muted-foreground">
					Consommation, toit, évolutions du foyer et tarif.
				</p>
			</div>
			{#if app.dirty || !app.prepared}
				<Button onclick={() => app.recompute()} disabled={!!app.busy}
					>Recalculer avec ces réglages</Button
				>
			{:else}
				<Button href={resolve('/simulateur')} variant="outline">Voir la simulation</Button>
			{/if}
		</div>
		<Tabs.Root bind:value={tab}>
			<Tabs.List class="w-full justify-start overflow-x-auto sm:w-auto">
				<Tabs.Trigger value="conso">Consommation</Tabs.Trigger>
				<Tabs.Trigger value="toit">Toit</Tabs.Trigger>
				<Tabs.Trigger value="evolutions">Évolutions</Tabs.Trigger>
				<Tabs.Trigger value="tarif">Tarif</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="conso" class="pt-4"><ConsumptionPanel /></Tabs.Content>
			<Tabs.Content value="toit" class="pt-4"><RoofPanel /></Tabs.Content>
			<Tabs.Content value="evolutions" class="pt-4"><EvolutionsPanel /></Tabs.Content>
			<Tabs.Content value="tarif" class="pt-4"><TariffPanel /></Tabs.Content>
		</Tabs.Root>
	</div>
{/if}
