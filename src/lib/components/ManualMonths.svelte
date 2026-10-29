<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { monthLabel } from '#lib/format.js';

	let {
		onsubmit,
		initial = {}
	}: { onsubmit: (m: Record<string, number>) => void; initial?: Record<string, number> } = $props();

	// les 12 derniers mois complets
	const now = new Date();
	const months = Array.from({ length: 12 }, (_, i) => {
		const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12 + i, 1));
		return d.toISOString().slice(0, 7);
	});
	let values = $state<Record<string, number | null>>(
		Object.fromEntries(months.map((m) => [m, initial[m] ?? null]))
	);
	const filled = $derived(months.filter((m) => (values[m] ?? 0) > 0).length);
</script>

<form
	class="grid gap-3 rounded-2xl border bg-card p-4"
	onsubmit={(e) => {
		e.preventDefault();
		onsubmit(Object.fromEntries(months.map((m) => [m, values[m] ?? 0])));
	}}
>
	<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
		{#each months as m (m)}
			<label class="grid gap-1 text-xs text-muted-foreground">
				{monthLabel(m)}
				<Input
					type="number"
					inputmode="numeric"
					min="0"
					class="num font-mono"
					bind:value={values[m]}
					placeholder="kWh"
				/>
			</label>
		{/each}
	</div>
	<Button type="submit" disabled={filled < 12}>Utiliser ces {filled}/12 mois</Button>
</form>
