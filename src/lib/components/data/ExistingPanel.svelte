<script lang="ts">
	import { app } from '#lib/app/store.svelte.js';
	import { defaultTariff } from '#lib/app/model.js';
	import { fmt } from '#lib/format.js';
	import Field from '#lib/components/Field.svelte';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';

	const s = $derived(app.settings);
	const ex = $derived(app.settings.existing);
	const base = $derived(app.result?.baseline ?? null);
	const DIRS = ['Sud', 'Sud-ouest', 'Ouest', 'Nord-ouest', 'Nord', 'Nord-est', 'Est', 'Sud-est'];
	const dir = (az: number) => DIRS[((Math.round(az / 45) % 8) + 8) % 8];
	const KINDS = { same: 'La même', base: 'Base', hphc: 'Heures creuses', tempo: 'Tempo' } as const;
	const hasHaSolar = $derived(!!app.raw.ha?.solar.length);

	async function injection(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (f) await app.importInjection(f);
	}
	function setCurrentTariff(v: string) {
		ex.currentTariff = !v || v === 'same' ? null : defaultTariff(v as 'base' | 'hphc' | 'tempo');
	}
</script>

<div class="grid gap-6 lg:grid-cols-2">
	<section class="grid content-start gap-4 rounded-xl border bg-card p-5">
		<div class="flex items-center justify-between gap-3">
			<div>
				<h2 class="font-semibold">Mes panneaux actuels</h2>
				<p class="text-sm text-muted-foreground">
					Tout est ensuite compté par rapport à aujourd’hui.
				</p>
			</div>
			<Switch bind:checked={ex.enabled} aria-label="J’ai déjà des panneaux" />
		</div>
		{#if ex.enabled}
			<NumberInput
				label="Panneaux en autoconsommation"
				bind:value={ex.kwc}
				step={0.1}
				suffix="kWc"
			/>
			<Field
				label="Inclinaison"
				bind:value={ex.tilt}
				min={0}
				max={60}
				step={1}
				display={(v) => `${v}°`}
			/>
			<Field
				label="Orientation"
				bind:value={ex.azimuth}
				min={-180}
				max={180}
				step={5}
				display={(v) => `${dir(v)} (${v > 0 ? '+' : ''}${v}°)`}
			/>
			<label class="flex items-center justify-between text-sm">
				Un routeur pilote déjà mon cumulus
				<Switch bind:checked={ex.router} />
			</label>
			<NumberInput
				label="Panneaux en vente totale (compteur à part)"
				bind:value={ex.totalSaleKwc}
				step={0.1}
				suffix="kWc"
			/>
			{#if ex.totalSaleKwc > 0}
				<p class="rounded-md bg-secondary px-3 py-2 text-xs text-pretty">
					En vente totale, la production part directement sur le réseau par son propre compteur :
					elle ne change pas votre consommation et une batterie ne peut pas la stocker. Elle n’entre
					donc pas dans le calcul. À la fin du contrat, on peut la passer en autoconsommation :
					ajoutez alors ces kWc ci-dessus pour simuler ce cas.
				</p>
			{/if}
		{/if}
	</section>

	{#if ex.enabled}
		<div class="grid content-start gap-4">
			<section class="grid gap-3 rounded-xl border bg-card p-5">
				<h3 class="text-sm font-semibold">Production mesurée</h3>
				{#if hasHaSolar}
					<p class="text-sm">Lue dans le tableau Énergie de Home Assistant, heure par heure.</p>
				{:else}
					<div class="flex items-center justify-between gap-2 text-sm">
						<span class="truncate" title={s.source.injectionFile}
							>{s.source.injectionFile
								? 'Injection : ' + s.source.injectionFile
								: 'Courbe Enedis d’injection (30 min)'}</span
						>
						<div class="flex shrink-0 gap-1">
							<label
								class="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs font-medium hover:bg-secondary"
							>
								{s.source.injectionFile ? 'Remplacer' : 'Importer'}
								<input type="file" accept=".csv,text/csv" class="sr-only" onchange={injection} />
							</label>
							{#if s.source.injectionFile}<Button
									size="sm"
									variant="ghost"
									onclick={() => app.clearInjection()}>Retirer</Button
								>{/if}
						</div>
					</div>
					<NumberInput
						label="Production annuelle relevée (onduleur, appli)"
						bind:value={ex.annualProduction}
						step={50}
						suffix="kWh/an"
					/>
					<p class="text-xs text-muted-foreground">
						Le compteur ne voit que ce que vous achetez : la production sert à retrouver votre vraie
						consommation. La courbe d’injection la rend exacte ; sans elle, la part consommée sur
						place est estimée.
					</p>
				{/if}
				{#if app.measuredRatio !== null}
					<p class="text-sm">
						Modèle calé sur votre mesure : <strong class="num font-mono"
							>×{app.measuredRatio.toFixed(2)}</strong
						>
						<span class="text-muted-foreground"
							>({app.calibratedBy === 'ha' ? 'Home Assistant' : 'production annuelle'})</span
						>
					</p>
					{#if Math.abs(app.measuredRatio - 1) > 0.25}
						<p class="text-xs text-destructive">
							Écart important : vérifiez la puissance, la pente et l’orientation.
						</p>
					{/if}
				{:else}
					<p class="text-xs text-muted-foreground">
						Sans mesure, la production vient du modèle (calé sur PVGIS).
					</p>
				{/if}
				{#if base}
					<dl class="num grid grid-cols-3 gap-2 border-t pt-3 font-mono text-sm">
						<div>
							<dt class="font-sans text-xs text-muted-foreground">Production</dt>
							<dd>{fmt.kwh(base.production)}</dd>
						</div>
						<div>
							<dt class="font-sans text-xs text-muted-foreground">Autonomie</dt>
							<dd>{fmt.pct(base.autonomy)}</dd>
						</div>
						<div>
							<dt class="font-sans text-xs text-muted-foreground">Surplus</dt>
							<dd>{fmt.kwh(base.export)}</dd>
						</div>
					</dl>
				{/if}
			</section>

			<section class="grid gap-3 rounded-xl border bg-card p-5">
				<h3 class="text-sm font-semibold">Contrat et tarif actuels</h3>
				<div class="grid grid-cols-2 gap-2">
					<NumberInput
						label="Revente du surplus"
						bind:value={ex.contractPrice}
						step={0.01}
						suffix="€/kWh"
					/>
					<NumberInput label="Fin du contrat" bind:value={ex.contractEnd} step={1} suffix="année" />
				</div>
				<p class="text-xs text-muted-foreground">
					Le surplus d’aujourd’hui reste payé ce prix jusqu’à la fin du contrat : ce qu’une batterie
					stocke n’est plus vendu. Le surplus en plus est compté au prix actuel ({fmt.price(
						s.economics.sellPrice
					)}/kWh, souvent 0).
				</p>
				<div class="grid gap-1.5">
					<span class="text-xs text-muted-foreground">Option tarifaire d’aujourd’hui</span>
					<ToggleGroup.Root
						type="single"
						variant="outline"
						value={ex.currentTariff?.kind ?? 'same'}
						onValueChange={setCurrentTariff}
						class="w-full"
					>
						{#each Object.entries(KINDS) as [k, l] (k)}
							<ToggleGroup.Item value={k} class="flex-1 text-xs">{l}</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					<p class="text-xs text-muted-foreground">
						« La même » : pas de changement d’option. Sinon, le passage à l’option simulée (onglet
						Tarif) compte dans le gain.
					</p>
				</div>
				<NumberInput
					label="Prix d’un routeur (si le pilotage est ajouté)"
					bind:value={s.economics.routerCost}
					step={50}
					suffix="€"
				/>
			</section>
		</div>
	{/if}
</div>
