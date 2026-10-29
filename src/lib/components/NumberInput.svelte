<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';

	let {
		label,
		value = $bindable(),
		step = 1,
		min,
		max,
		suffix = '',
		scale = 1
	}: {
		label: string;
		value: number;
		step?: number;
		min?: number;
		max?: number;
		suffix?: string;
		/** 100 pour saisir un pourcentage stocké en fraction. */
		scale?: number;
	} = $props();
	const id = $props.id();
	let shown = $derived(Math.round(value * scale * 10000) / 10000);
</script>

<div class="grid gap-1.5">
	<label for={id} class="text-xs text-muted-foreground">{label}</label>
	<div class="relative">
		<Input
			{id}
			type="number"
			inputmode="decimal"
			class="num font-mono {suffix ? (suffix.length > 3 ? 'pr-16' : 'pr-10') : ''}"
			value={shown}
			{step}
			{min}
			{max}
			oninput={(e) => {
				const v = Number((e.currentTarget as HTMLInputElement).value);
				if (Number.isFinite(v)) value = v / scale;
			}}
		/>
		{#if suffix}
			<span
				class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
				>{suffix}</span
			>
		{/if}
	</div>
</div>
