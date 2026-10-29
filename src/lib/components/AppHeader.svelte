<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { app } from '#lib/app/store.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import ShareMenu from './ShareMenu.svelte';

	const links = [
		{ href: '/simulateur', label: 'Simulateur' },
		{ href: '/carte', label: 'Carte' },
		{ href: '/devis', label: 'Devis' },
		{ href: '/donnees', label: 'Données' },
		{ href: '/demarches', label: 'Démarches' }
	] as const;

	let dark = $state(
		typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
	);
	function toggleTheme() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		try {
			localStorage.setItem('justewatt.theme', dark ? 'dark' : 'light');
		} catch {
			/* préférence non mémorisée */
		}
	}
	const active = (href: string) => page.url.pathname.endsWith(href);
</script>

<header class="no-print sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
	<div class="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
		<a href={resolve('/')} class="flex items-center gap-2 font-semibold tracking-tight">
			<img src="{resolve('/')}icon.svg" alt="" class="size-6" />
			JusteWatt
		</a>
		{#if app.hasData}
			<nav class="hidden items-center gap-1 md:flex" aria-label="Sections">
				{#each links as l (l.href)}
					<a
						href={resolve(l.href)}
						aria-current={active(l.href) ? 'page' : undefined}
						class="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-secondary aria-[current=page]:font-medium aria-[current=page]:text-foreground"
						>{l.label}</a
					>
				{/each}
			</nav>
		{/if}
		<div class="ml-auto flex items-center gap-1">
			{#if app.busy}
				<span class="hidden items-center gap-2 text-xs text-muted-foreground sm:flex" role="status">
					<span class="size-2 animate-pulse rounded-full bg-solar"></span>{app.busy}…
				</span>
			{/if}
			{#if app.hasData}<ShareMenu />{/if}
			<Button
				variant="ghost"
				size="icon"
				onclick={toggleTheme}
				aria-label={dark ? 'Thème clair' : 'Thème sombre'}
			>
				{#if dark}<Sun />{:else}<Moon />{/if}
			</Button>
		</div>
	</div>
	{#if app.hasData}
		<nav class="flex gap-1 overflow-x-auto border-t px-2 py-1 md:hidden" aria-label="Sections">
			{#each links as l (l.href)}
				<a
					href={resolve(l.href)}
					aria-current={active(l.href) ? 'page' : undefined}
					class="shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground aria-[current=page]:bg-secondary aria-[current=page]:text-foreground"
					>{l.label}</a
				>
			{/each}
		</nav>
	{/if}
</header>
