<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { app } from '#lib/app/store.svelte.js';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	onMount(() => {
		app.init();
	});
</script>

<a
	href="#contenu"
	class="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-card focus:p-2"
>
	Aller au contenu
</a>
<AppHeader />
{#if app.error}
	<div class="no-print mx-auto mt-4 max-w-6xl px-4" role="alert">
		<div
			class="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
		>
			<span>{app.error}</span>
			<button class="text-muted-foreground hover:text-foreground" onclick={() => (app.error = '')}
				>Fermer</button
			>
		</div>
	</div>
{/if}
<main id="contenu" class="mx-auto w-full max-w-6xl px-4 pt-6 pb-16">
	{@render children()}
</main>
<footer class="no-print mx-auto max-w-6xl px-4 pb-8 text-xs text-muted-foreground">
	Calculs faits dans votre navigateur · Météo <a class="underline" href="https://open-meteo.com/"
		>Open-Meteo</a
	>
	(CC BY 4.0) · Relief Copernicus · Adresses IGN ·
	<a class="underline" href="https://github.com/Eric-D/JusteWatt">Code source</a>
</footer>
