<script lang="ts">
	import { app } from '#lib/app/store.svelte.js';
	import { download, needsPassword } from '#lib/app/share.js';
	import { idb } from '#lib/app/idb.js';
	import { fmt } from '#lib/format.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import Share from '@lucide/svelte/icons/share-2';

	let open = $state(false);
	let withData = $state(true);
	let withSite = $state(true);
	let withHa = $state(false);
	let password = $state('');
	let link = $state('');
	let copied = $state(false);
	let building = $state(false);
	let withFileData = $state(false);
	let confirmReset = $state(false);

	const token = $derived(open ? app.token() : null);
	const options = $derived({
		data: withData && !!app.prepared,
		site: withSite,
		ha: withHa ? token : null
	});
	const mustProtect = $derived(needsPassword(options));
	const weak = $derived(password.length > 0 && password.length < 10);
	const blocked = $derived((mustProtect && !password) || weak);

	$effect(() => {
		// toute modification des options invalide le lien déjà fabriqué
		void [withData, withSite, withHa, password];
		link = '';
	});

	async function make() {
		building = true;
		try {
			const frag = await app.shareFragment($state.snapshot(options), password);
			link = `${location.href.split('#')[0].replace(/[^/]*$/, '')}#${frag}`;
			await navigator.clipboard.writeText(link).then(
				() => {
					copied = true;
					setTimeout(() => (copied = false), 2500);
				},
				() => {}
			);
		} finally {
			building = false;
		}
	}

	async function exportJson() {
		const data = withFileData
			? { ha: await idb.get('raw.ha'), enedis: await idb.get('raw.enedis') }
			: undefined;
		download(
			`justewatt-${new Date().toISOString().slice(0, 10)}.json`,
			JSON.stringify(
				{ app: 'justewatt', version: 1, settings: $state.snapshot(app.settings), data },
				null,
				1
			)
		);
	}

	async function importJson(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!f) return;
		try {
			const j = JSON.parse(await f.text());
			if (j.app !== 'justewatt') throw new Error();
			if (j.data?.ha) await idb.set('raw.ha', j.data.ha);
			if (j.data?.enedis) await idb.set('raw.enedis', j.data.enedis);
			app.raw = {
				...app.raw,
				ha: j.data?.ha ?? app.raw.ha,
				enedis: j.data?.enedis ?? app.raw.enedis
			};
			app.settings = j.settings;
			open = false;
			await app.recompute();
		} catch {
			app.error = 'Ce fichier n’est pas un export JusteWatt';
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button variant="ghost" size="sm" {...props}
				><Share /> <span class="hidden sm:inline">Partager</span></Button
			>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Partager ce projet</Dialog.Title>
			<Dialog.Description>
				Tout est dans le lien, après le « # » : rien ne passe par un serveur. Le destinataire en
				reçoit une copie de travail.
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-4">
			<fieldset class="grid gap-3 rounded-lg border p-3">
				<legend class="px-1 text-xs text-muted-foreground">Contenu du lien</legend>
				<p class="text-sm">
					Hypothèses, toit, scénarios et {app.settings.quotes.length} devis
					<span class="text-muted-foreground">· toujours</span>
				</p>
				<label class="flex items-center justify-between gap-3 text-sm">
					<span
						>Consommation heure par heure <span class="block text-xs text-muted-foreground"
							>{app.prepared
								? fmt.kwh(app.prepared.cons.load.reduce((a, v) => a + v, 0)) + ' sur 12 mois'
								: 'non calculée'}</span
						></span
					>
					<Switch bind:checked={withData} disabled={!app.prepared} />
				</label>
				<label class="flex items-center justify-between gap-3 text-sm">
					<span
						>Position du toit <span class="block text-xs text-muted-foreground"
							>{app.settings.site.name || 'coordonnées'} · horizon</span
						></span
					>
					<Switch bind:checked={withSite} />
				</label>
				<label class="flex items-center justify-between gap-3 text-sm">
					<span
						>Connexion Home Assistant <span class="block text-xs text-muted-foreground"
							>{token
								? 'adresse et jeton (accès complet à HA)'
								: 'aucune connexion enregistrée'}</span
						></span
					>
					<Switch bind:checked={withHa} disabled={!token} />
				</label>
			</fieldset>

			<div class="grid gap-1.5">
				<label for="share-pw" class="text-sm font-medium">
					Mot de passe {mustProtect ? '(obligatoire)' : '(facultatif)'}
				</label>
				<Input id="share-pw" type="password" bind:value={password} autocomplete="new-password" />
				<p class="text-xs {weak ? 'text-destructive' : 'text-muted-foreground'}">
					{#if weak}10 caractères minimum.{:else if mustProtect}Exigé dès que le lien contient la
						position ou la connexion HA. Chiffrement AES-256 dans votre navigateur ; transmettez le
						mot de passe par un autre canal.{:else}Sans mot de passe, quiconque voit le lien voit
						son contenu.{/if}
				</p>
				{#if withHa}
					<p class="rounded-md bg-destructive/10 px-2 py-1.5 text-xs">
						Le destinataire pourra piloter votre maison. Réservez ce lien à vos appareils ; un jeton
						se révoque dans le profil HA.
					</p>
				{/if}
			</div>

			<Button onclick={make} disabled={blocked || building}>
				{building ? 'Chiffrement…' : copied ? 'Lien copié' : 'Créer et copier le lien'}
			</Button>
			{#if link}
				<div class="grid gap-1">
					<Input
						readonly
						value={link}
						onfocus={(e) => e.currentTarget.select()}
						aria-label="Lien de partage"
						class="font-mono text-xs"
					/>
					<p class="text-xs text-muted-foreground">
						{fmt.int(link.length)} caractères{link.length > 8000
							? ' : passe par mail ou messagerie, pas par SMS'
							: ''}.
					</p>
				</div>
			{/if}

			<details class="text-sm">
				<summary class="cursor-pointer text-muted-foreground"
					>Imprimer, fichier JSON, effacer</summary
				>
				<div class="mt-3 grid gap-3">
					<Button
						variant="outline"
						onclick={() => {
							open = false;
							setTimeout(() => print(), 50);
						}}>Imprimer ou enregistrer en PDF</Button
					>
					<label class="flex items-center justify-between gap-3">
						Inclure les mesures brutes dans le fichier
						<Switch bind:checked={withFileData} />
					</label>
					<Button variant="outline" onclick={exportJson}>Exporter en JSON</Button>
					<label class="cursor-pointer text-center text-muted-foreground underline">
						Importer un fichier JSON
						<input
							type="file"
							accept="application/json,.json"
							class="sr-only"
							onchange={importJson}
						/>
					</label>
					{#if confirmReset}
						<div class="flex items-center gap-2">
							<span>Tout effacer sur cet appareil ?</span>
							<Button
								variant="destructive"
								size="sm"
								onclick={async () => {
									await app.reset();
									open = false;
									confirmReset = false;
								}}>Effacer</Button
							>
							<Button variant="ghost" size="sm" onclick={() => (confirmReset = false)}
								>Annuler</Button
							>
						</div>
					{:else}
						<Button
							variant="ghost"
							size="sm"
							class="text-muted-foreground"
							onclick={() => (confirmReset = true)}
						>
							Effacer mes données de cet appareil
						</Button>
					{/if}
				</div>
			</details>
		</div>
	</Dialog.Content>
</Dialog.Root>
