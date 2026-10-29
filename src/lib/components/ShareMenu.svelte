<script lang="ts">
	import { app } from '#lib/app/store.svelte.js';
	import { download, shareUrl } from '#lib/app/share.js';
	import { idb } from '#lib/app/idb.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import Share from '@lucide/svelte/icons/share-2';

	let open = $state(false);
	let copied = $state(false);
	let withData = $state(false);
	let confirmReset = $state(false);

	async function copyLink() {
		const base = location.href.split('#')[0];
		await navigator.clipboard.writeText(await shareUrl($state.snapshot(app.settings), base));
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function exportJson() {
		const data = withData
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
			app.raw = { ha: j.data?.ha ?? app.raw.ha, enedis: j.data?.enedis ?? app.raw.enedis };
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
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Partager et sauvegarder</Dialog.Title>
			<Dialog.Description
				>Rien n’est envoyé à un serveur : le lien contient le projet, le fichier reste chez vous.</Dialog.Description
			>
		</Dialog.Header>
		<div class="grid gap-4">
			<div class="grid gap-1.5">
				<Button onclick={copyLink}>{copied ? 'Lien copié' : 'Copier un lien vers ce projet'}</Button
				>
				<p class="text-xs text-muted-foreground">
					Toit, hypothèses, scénarios et devis. Sans votre consommation ni votre adresse.
				</p>
			</div>
			<Button
				variant="outline"
				onclick={() => {
					open = false;
					setTimeout(() => print(), 50);
				}}
			>
				Imprimer ou enregistrer en PDF
			</Button>
			<div class="grid gap-2 rounded-lg border p-3">
				<label class="flex items-center justify-between gap-3 text-sm">
					Inclure les mesures de consommation
					<Switch bind:checked={withData} />
				</label>
				<Button variant="outline" onclick={exportJson}>Exporter en JSON</Button>
				<label class="cursor-pointer text-center text-sm text-muted-foreground underline">
					Importer un fichier JSON
					<input
						type="file"
						accept="application/json,.json"
						class="sr-only"
						onchange={importJson}
					/>
				</label>
			</div>
			<div class="border-t pt-3">
				{#if confirmReset}
					<div class="flex items-center gap-2">
						<span class="text-sm">Tout effacer sur cet appareil ?</span>
						<Button
							variant="destructive"
							size="sm"
							onclick={async () => {
								await app.reset();
								open = false;
								confirmReset = false;
								location.hash = '';
							}}>Effacer</Button
						>
						<Button variant="ghost" size="sm" onclick={() => (confirmReset = false)}>Annuler</Button
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
		</div>
	</Dialog.Content>
</Dialog.Root>
