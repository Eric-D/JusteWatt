<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { app } from '#lib/app/store.svelte.js';
	import { decodeShare, shareKind, WrongPassword, type SharePayload } from '#lib/app/share.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import ManualMonths from '#lib/components/ManualMonths.svelte';
	import { onMount } from 'svelte';

	let url = $state(app.settings.source.haUrl || '');
	let token = $state('');
	let showManual = $state(false);
	let shared = $state<SharePayload | null>(null);
	let locked = $state(false);
	let sharePw = $state('');
	let unlocking = $state(false);
	let shareError = $state('');

	onMount(async () => {
		const k = shareKind(location.hash);
		if (k === 'encrypted') locked = true;
		else if (k === 'plain') shared = await decodeShare(location.hash).catch(() => null);
	});

	async function unlock(e: SubmitEvent) {
		e.preventDefault();
		unlocking = true;
		shareError = '';
		try {
			shared = await decodeShare(location.hash, sharePw);
			locked = false;
		} catch (err) {
			shareError =
				err instanceof WrongPassword ? 'Mot de passe incorrect' : 'Lien illisible ou incomplet';
		} finally {
			unlocking = false;
		}
	}

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
		const p = $state.snapshot(shared);
		shared = null;
		await app.openShared(p);
		// remplace l'entrée d'historique : le lien (et son contenu) quitte la barre d'adresse
		if (!app.error)
			await goto(resolve(p.project.quotes.length ? '/devis' : '/simulateur'), {
				replaceState: true
			});
	}
</script>

<svelte:head>
	<title>JusteWatt — simulateur solaire</title>
</svelte:head>

{#if locked}
	<form
		class="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-end"
		onsubmit={unlock}
	>
		<div class="grid gap-1.5">
			<label for="open-pw" class="font-medium">Projet partagé protégé</label>
			<Input
				id="open-pw"
				type="password"
				bind:value={sharePw}
				placeholder="Mot de passe"
				autocomplete="off"
				required
			/>
			{#if shareError}<p class="text-sm text-destructive" role="alert">{shareError}</p>{/if}
		</div>
		<Button type="submit" disabled={unlocking}
			>{unlocking ? 'Déchiffrement…' : 'Déverrouiller'}</Button
		>
	</form>
{/if}
{#if shared}
	<div class="mb-6 grid gap-3 rounded-xl border bg-card p-4">
		<div class="font-medium">Projet partagé</div>
		<ul class="grid gap-0.5 text-sm text-muted-foreground">
			<li>
				{shared.project.quotes.length} devis · {shared.project.scenarios.length} scénarios · hypothèses
				et toit
			</li>
			{#if shared.data}<li>
					Consommation heure par heure ({shared.data.sources.join(' + ')})
				</li>{/if}
			{#if shared.site}<li>Position : {shared.site.name || 'coordonnées du toit'}</li>{/if}
			{#if shared.ha}<li class="text-foreground">
					Connexion Home Assistant : {shared.ha.url}
				</li>{/if}
			{#if !shared.data && !shared.ha}<li>
					Sans consommation : rejoué sur les données de démonstration
				</li>{/if}
		</ul>
		<div class="flex flex-wrap items-center gap-3">
			<Button onclick={applyShared} disabled={!!app.busy}>Ouvrir ce projet</Button>
			{#if app.hasData}<span class="text-xs text-muted-foreground"
					>Remplace le projet enregistré sur cet appareil.</span
				>{/if}
		</div>
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
		<div class="grid gap-2">
			<span class="text-sm font-medium" id="mode-label">Mon projet</span>
			<div class="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="mode-label">
				{#each [[false, 'Je n’ai pas de panneaux', 'Dimensionner une installation'], [true, 'J’ai déjà des panneaux', 'Batterie, extension, pilotage']] as [on, t, d] (t)}
					<button
						role="radio"
						aria-checked={app.settings.existing.enabled === on}
						class="grid gap-0.5 rounded-xl border bg-card p-3 text-left transition-colors hover:border-foreground/30 aria-checked:border-foreground aria-checked:ring-1 aria-checked:ring-foreground"
						onclick={() => app.setExisting(on as boolean)}
					>
						<span class="text-sm font-medium">{t}</span>
						<span class="text-xs text-muted-foreground">{d}</span>
					</button>
				{/each}
			</div>
		</div>
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
