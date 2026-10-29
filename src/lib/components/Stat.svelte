<script lang="ts">
	let {
		label,
		value,
		sub = '',
		tone = ''
	}: { label: string; value: string; sub?: string; tone?: string } = $props();
</script>

<div class="rounded-xl border bg-card p-4">
	<div class="flex items-center gap-2 text-xs text-muted-foreground">
		{#if tone}<span class="size-2 rounded-full" style:background={tone}></span>{/if}
		{label}
	</div>
	<div class="num mt-1 font-mono text-2xl font-semibold tracking-tight">{value}</div>
	{#if sub}<div class="mt-0.5 text-xs text-muted-foreground">{sub}</div>{/if}
</div>
