<script lang="ts">
	let { items }: { items: { label: string; color: string; line?: boolean }[] } = $props();
</script>

<ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
	{#each items as it (it.label)}
		<li class="flex items-center gap-1.5">
			{#if it.line}
				<span class="h-0.5 w-3.5 rounded" style:background={it.color}></span>
			{:else}
				<span class="size-2.5 rounded-[3px]" style:background={it.color}></span>
			{/if}
			{it.label}
		</li>
	{/each}
</ul>
