<script lang="ts">
	/** Infobulle de graphique : la valeur d'abord, le libellé ensuite, clé en trait. */
	let {
		x,
		y,
		width,
		title,
		rows
	}: {
		x: number;
		y: number;
		width: number;
		title: string;
		rows: { label: string; value: string; color?: string; dash?: boolean }[];
	} = $props();
	const left = $derived(Math.min(Math.max(x + 12, 0), width - 190));
</script>

<div
	class="pointer-events-none absolute z-10 w-[180px] rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
	style:left="{left}px"
	style:top="{Math.max(0, y - 10)}px"
	role="status"
>
	<div class="mb-1 font-medium">{title}</div>
	{#each rows as r (r.label)}
		<div class="flex items-center gap-2 py-0.5">
			{#if r.color}<span
					class="h-0.5 w-3 shrink-0 rounded"
					style:background={r.color}
					style:opacity={r.dash ? 0.6 : 1}
				></span>{/if}
			<span class="num font-mono font-semibold">{r.value}</span>
			<span class="truncate text-muted-foreground">{r.label}</span>
		</div>
	{/each}
</div>
