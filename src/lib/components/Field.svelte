<script lang="ts">
	import { Slider } from '#lib/components/ui/slider/index.js';

	let {
		label,
		value = $bindable(),
		min,
		max,
		step = 1,
		display,
		hint = ''
	}: {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		display: (v: number) => string;
		hint?: string;
	} = $props();
</script>

<div class="grid gap-2">
	<div class="flex items-baseline justify-between gap-3">
		<span class="text-sm text-muted-foreground" aria-hidden="true">{label}</span>
		<span class="num font-mono text-sm font-medium">{display(value)}</span>
	</div>
	<Slider
		type="single"
		bind:value
		{min}
		{max}
		{step}
		thumbLabel={label}
		thumbValueText={display(value)}
	/>
	{#if hint}<p class="text-xs text-muted-foreground">{hint}</p>{/if}
</div>
