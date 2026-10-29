<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { app } from '#lib/app/store.svelte.js';
	import { readShared } from '#lib/app/share.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import ManualMonths from '#lib/components/ManualMonths.svelte';
	import { onMount } from 'svelte';

	let url = $state(app.settings.source.haUrl || '');
	let token = $state('');
	let showManual = $state(false);
	let shared = $state<Awaited<ReturnType<typeof readShared>>>(null);

	onMount(async () => {
		shared = await readShared(location.hash);
	});

	async function connect(e: SubmitEvent) {
		e.preventDefault();
		await app.connectHa(url, token);
		if (!app.error) goto(resolve('/donnees'));
	}
	async function demo() {
		await app.startDemo();
		if (!app.error) goto(resolve('/simulateur'));
	}
	async function enedis(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!f) return;
		await app.importEnedis(f);
		if (!app.error) goto(resolve('/donnees'));
	}
	async function applyShared() {
		if (!shared) return;
		const s = app.settings;
		Object.assign(s, {
			economics: shared.economics,
			current: shared.current,
			scenarios: shared.scenarios,
			quotes: shared.quotes,
			evolutions: shared.evolutions
		});
		s.site.planes = shared.planes;
		history.replaceState(null, '', location.pathname);
		shared = null;
		if (!app.hasData) await app.startDemoKeeping();
		else await app.recompute();
		goto(resolve('/devis'));
	}
</script>

<svelte:head>
	<title>JusteWatt — simulateur solaire</title>
</svelte:head>

{#if shared}
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
		<div>
			<div class="font-medium">Projet partagé</div>
			<div class="text-sm text-muted-foreground">
				{shared.quotes.length} devis, {shared.scenarios.length} scénarios. Il sera rejoué sur votre consommation
				(ou les données de démonstration).
			</div>
		</div>
		<Button onclick={applyShared}>Ouvrir ce projet</Button>
	</div>
{/if}

<div class="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
	<section class="grid content-start gap-6 pt-2">
		<p class="text-sm font-medium text-solar">Simulateur photovoltaïque</p>
		<h1 class="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
			La juste puissance pour vos panneaux et votre batterie.
		</h1>
		<p class="max-w-prose text-lg text-pretty text-muted-foreground">
			JusteWatt rejoue chaque heure de votre dernière année avec la météo réelle de votre toit, puis
			compare les configurations et les devis : autonomie, économie, retour sur investissement.
		</p>
		<ol class="grid gap-4 sm:grid-cols-3">
			{#each [['01', 'Votre consommation', 'Home Assistant, fichier Enedis ou factures.'], ['02', 'Votre toit', 'Adresse, pente, orientation, relief.'], ['03', 'Comparer', 'Carte des combinaisons, devis, rentabilité.']] as [n, t, d] (n)}
				<li class="grid gap-1 border-t pt-3">
					<span class="num font-mono text-xs text-muted-foreground">{n}</span>
					<span class="font-medium">{t}</span>
					<span class="text-sm text-muted-foreground">{d}</span>
				</li>
			{/each}
		</ol>
		{#if app.hasData}
			<div>
				<Button href={resolve('/simulateur')} size="lg">Reprendre mon projet</Button>
			</div>
		{/if}
	</section>

	<section class="grid content-start gap-4" aria-labelledby="sources">
		<h2 id="sources" class="sr-only">Choisir une source de données</h2>
		<form class="grid gap-4 rounded-2xl border bg-card p-5 shadow-xs" onsubmit={connect}>
			<div>
				<h3 class="font-semibold">Connecter Home Assistant</h3>
				<p class="text-sm text-muted-foreground">
					Lecture seule du tableau Énergie et de l’historique horaire.
				</p>
			</div>
			<div class="grid gap-1.5">
				<Label for="ha-url">Adresse de l’instance</Label>
				<Input
					id="ha-url"
					bind:value={url}
					placeholder="https://maison.exemple.fr"
					autocomplete="url"
					required
				/>
				<p class="text-xs text-muted-foreground">
					HTTPS obligatoire. Avec un certificat client (mTLS), le navigateur vous le demandera.
				</p>
			</div>
			<div class="grid gap-1.5">
				<Label for="ha-token">Jeton d’accès longue durée</Label>
				<Input id="ha-token" type="password" bind:value={token} autocomplete="off" required />
				<details class="text-xs text-muted-foreground">
					<summary class="cursor-pointer">Où le trouver ?</summary>
					Home Assistant → votre profil → onglet Sécurité → « Jetons d’accès longue durée » → Créer un
					jeton. Il reste sur cet appareil.
				</details>
			</div>
			<Button type="submit" disabled={!!app.busy}>Se connecter</Button>
		</form>

		<div class="grid gap-3 sm:grid-cols-2">
			<label
				class="grid cursor-pointer gap-1 rounded-2xl border border-dashed bg-card p-4 transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-foreground/30"
			>
				<span class="font-medium">Importer un CSV Enedis</span>
				<span class="text-sm text-muted-foreground"
					>Courbe de charge 30 min ou consommation journalière.</span
				>
				<input type="file" accept=".csv,text/csv" class="sr-only" onchange={enedis} />
			</label>
			<button
				class="grid gap-1 rounded-2xl border border-dashed bg-card p-4 text-left transition-colors hover:border-foreground/30"
				onclick={() => (showManual = !showManual)}
			>
				<span class="font-medium">Saisir mes factures</span>
				<span class="text-sm text-muted-foreground">12 consommations mensuelles en kWh.</span>
			</button>
		</div>
		{#if showManual}
			<ManualMonths
				onsubmit={async (m) => {
					await app.useManual(m);
					if (!app.error) goto(resolve('/donnees'));
				}}
			/>
		{/if}
		<Button variant="ghost" onclick={demo} disabled={!!app.busy}
			>Essayer avec des données de démonstration</Button
		>
		<p class="text-xs text-muted-foreground">
			Tout est calculé dans votre navigateur. Aucune donnée de consommation n’est envoyée à un
			serveur ; seules la position du toit (Open-Meteo, IGN) et l’adresse de votre Home Assistant
			sont contactées.
		</p>
	</section>
</div>
