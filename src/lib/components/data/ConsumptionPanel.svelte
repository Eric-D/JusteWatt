<script lang="ts">
	import { app } from '#lib/app/store.svelte.js';
	import { defaultEndMonth } from '#lib/app/pipeline.js';
	import { fmt, monthLabel } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import ManualMonths from '#lib/components/ManualMonths.svelte';

	const s = $derived(app.settings);
	const cons = $derived(app.prepared?.cons);
	const total = $derived(cons ? cons.load.reduce((a, v) => a + v, 0) : 0);
	const pil = $derived(cons ? cons.pilotable.reduce((a, v) => a + v, 0) : 0);
	let editManual = $state(false);

	const METHOD: Record<string, { label: string; hint: string }> = {
		ha: { label: 'Mesurée', hint: 'Forme horaire mesurée, calée sur le volume officiel' },
		borrowed: { label: 'Empruntée', hint: 'Volume officiel, forme du mois mesuré le plus proche' },
		excluded: {
			label: 'Écartée',
			hint: 'Mesure incohérente avec le compteur : volume officiel, forme empruntée'
		},
		profile: { label: 'Profil type', hint: 'Aucune mesure horaire : profil moyen d’un logement' }
	};
	const sourceLabel = $derived(
		{
			none: 'Aucune',
			demo: 'Démonstration',
			ha: 'Home Assistant',
			enedis: 'Fichier Enedis',
			manual: 'Factures saisies',
			shared: 'Reçue par lien'
		}[s.source.kind]
	);
	const endOptions = $derived.by(() => {
		const out = [];
		const d = new Date();
		for (let i = 0; i < 24; i++) {
			const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
			out.push(x.toISOString().slice(0, 7));
		}
		return out;
	});
	const autoEnd = $derived(defaultEndMonth($state.snapshot(s), app.raw.enedis));
	const prevMonth = (m: string) => {
		const [y, mo] = m.split('-').map(Number);
		return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
	};

	async function addEnedis(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (f) await app.importEnedis(f);
	}
	function togglePilotable(id: string, on: boolean) {
		s.source.haPilotable = on
			? [...s.source.haPilotable, id]
			: s.source.haPilotable.filter((x) => x !== id);
	}
</script>

<div class="grid gap-6 lg:grid-cols-[1fr_340px]">
	<section class="grid content-start gap-4 rounded-xl border bg-card p-5">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 class="font-semibold">Votre année de consommation</h2>
				<p class="text-sm text-muted-foreground">
					{cons?.sources.join(' + ') || sourceLabel} · {fmt.kwh(total)}{pil > 0
						? ` dont ${fmt.kwh(pil)} pilotables`
						: ''}
				</p>
			</div>
			<label class="grid gap-1 text-xs text-muted-foreground">
				Année simulée
				<select
					bind:value={s.source.endMonth}
					class="rounded-md border bg-background px-2 py-1 text-sm text-foreground"
				>
					<option value="">Automatique (→ {monthLabel(prevMonth(autoEnd))})</option>
					{#each endOptions as m (m)}<option value={m}
							>12 mois jusqu’à {monthLabel(prevMonth(m))}</option
						>{/each}
				</select>
			</label>
		</div>
		<p class="text-sm text-pretty text-muted-foreground">
			Le compteur Enedis donne les bons volumes, Home Assistant (ou la courbe Enedis) la forme de
			chaque journée. Chaque mois garde exactement le volume officiel et le répartit heure par heure
			selon la forme mesurée.
		</p>
		{#if cons}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="text-left text-xs text-muted-foreground">
						<tr>
							<th class="py-2 font-normal">Mois</th>
							<th class="py-2 text-right font-normal">kWh</th>
							<th class="py-2 pl-4 font-normal">Forme horaire</th>
							<th class="py-2 text-right font-normal">Mesuré</th>
							<th class="py-2 text-right font-normal">Facteur</th>
						</tr>
					</thead>
					<tbody>
						{#each cons.months as m (m.month)}
							{@const kwh = cons.load.reduce(
								(a, v, i) => (cons.localDay[i].startsWith(m.month) ? a + v : a),
								0
							)}
							<tr class="border-t">
								<td class="py-1.5">{monthLabel(m.month)}</td>
								<td class="num py-1.5 text-right font-mono">{fmt.int(kwh)}</td>
								<td class="py-1.5 pl-4" title={METHOD[m.method].hint}>
									<span
										class="rounded-full px-2 py-0.5 text-xs {m.method === 'ha'
											? 'bg-battery/15 text-battery'
											: m.method === 'excluded'
												? 'bg-destructive/10 text-destructive'
												: 'bg-secondary text-muted-foreground'}">{METHOD[m.method].label}</span
									>
								</td>
								<td class="num py-1.5 text-right font-mono text-muted-foreground"
									>{fmt.pct(m.coverage)}</td
								>
								<td class="num py-1.5 text-right font-mono text-muted-foreground"
									>{m.factor !== null && Number.isFinite(m.factor)
										? '×' + m.factor.toFixed(2)
										: '—'}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if !cons.sources.some( (x) => x.includes('Enedis') ) && cons.months.some((m) => m.method === 'borrowed' || m.coverage < 0.9)}
				<p class="rounded-lg bg-solar/10 px-3 py-2 text-sm">
					Certains mois n’ont pas (ou peu) de mesures : leur volume est estimé. Importez un fichier
					Enedis ou saisissez vos factures pour caler chaque mois sur le compteur.
				</p>
			{/if}
			{#if cons.months.some((m) => m.method === 'excluded')}
				<p class="text-xs text-muted-foreground">
					Mois écarté : la mesure de Home Assistant s’écarte de plus de 10 % du compteur (capteur
					arrêté, coupure…). Son volume officiel est conservé.
				</p>
			{/if}
		{/if}
	</section>

	<div class="grid content-start gap-4">
		<section class="grid gap-3 rounded-xl border bg-card p-4">
			<h3 class="text-sm font-semibold">Sources</h3>
			{#if s.source.kind === 'ha' || app.raw.ha}
				<div class="grid gap-2 text-sm">
					<div class="flex items-center justify-between gap-2">
						<span>Home Assistant {app.ha ? `· ${app.ha.energy.devices.length} appareils` : ''}</span
						>
						<Button
							size="sm"
							variant="outline"
							onclick={() => app.refreshHa()}
							disabled={!!app.busy || !app.token()}>Relire</Button
						>
					</div>
					{#if app.ha}
						<details>
							<summary class="cursor-pointer text-xs text-muted-foreground"
								>Appareils pilotables (cumulus…)</summary
							>
							<ul class="mt-2 grid max-h-48 gap-1 overflow-y-auto">
								{#each app.ha.energy.devices as d (d.id)}
									<li>
										<label class="flex items-center gap-2 text-xs">
											<input
												type="checkbox"
												checked={s.source.haPilotable.includes(d.id)}
												onchange={(e) => togglePilotable(d.id, e.currentTarget.checked)}
											/>
											{d.name}
										</label>
									</li>
								{/each}
							</ul>
							<p class="mt-1 text-xs text-muted-foreground">
								Puis « Relire » pour lire leur historique.
							</p>
						</details>
					{/if}
				</div>
			{/if}
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="truncate" title={s.source.enedisFile}
					>{s.source.enedisFile ? 'Enedis : ' + s.source.enedisFile : 'Fichier Enedis'}</span
				>
				<div class="flex shrink-0 gap-1">
					<label
						class="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs font-medium hover:bg-secondary"
					>
						{s.source.enedisFile ? 'Remplacer' : 'Importer'}
						<input type="file" accept=".csv,text/csv" class="sr-only" onchange={addEnedis} />
					</label>
					{#if s.source.enedisFile}<Button
							size="sm"
							variant="ghost"
							onclick={() => app.clearEnedis()}>Retirer</Button
						>{/if}
				</div>
			</div>
			<details bind:open={editManual}>
				<summary class="cursor-pointer text-sm">Factures saisies à la main</summary>
				<div class="mt-2">
					<ManualMonths initial={s.source.manualMonthly} onsubmit={(m) => app.useManual(m)} />
				</div>
			</details>
			<a
				href="https://mon-compte-particulier.enedis.fr/"
				class="text-xs text-muted-foreground underline"
				target="_blank"
				rel="noreferrer">Télécharger mes données sur le site Enedis</a
			>
		</section>

		<section class="grid gap-3 rounded-xl border bg-card p-4">
			<h3 class="text-sm font-semibold">Cumulus piloté sur le surplus</h3>
			<label class="flex items-center justify-between text-sm">
				Router le cumulus
				<Switch bind:checked={s.cumulus.enabled} />
			</label>
			<div class="grid grid-cols-2 gap-2">
				<NumberInput label="Puissance" bind:value={s.cumulus.power} step={0.1} suffix="kW" />
				<NumberInput
					label="Relance réseau à"
					bind:value={s.cumulus.fallbackHour}
					min={0}
					max={23}
					suffix="h"
				/>
			</div>
			<p class="text-xs text-muted-foreground">
				{pil > 0
					? `${fmt.kwh(pil)}/an déplaçables vers les heures de soleil.`
					: 'Aucune part pilotable mesurée : choisissez le cumulus dans les appareils Home Assistant.'}
			</p>
		</section>

		<section class="grid gap-3 rounded-xl border bg-card p-4">
			<h3 class="text-sm font-semibold">Installation existante</h3>
			<NumberInput
				label="Panneaux déjà installés"
				bind:value={s.source.existingKwc}
				step={0.1}
				suffix="kWc"
			/>
			<p class="text-xs text-muted-foreground">
				Leur production (tableau Énergie) est rajoutée à la consommation pour simuler à partir de
				zéro.
			</p>
			{#if app.measuredRatio !== null}
				<p class="text-sm">
					Production mesurée = <strong class="num font-mono">{fmt.pct(app.measuredRatio)}</strong> du
					modèle.
				</p>
				<Button
					size="sm"
					variant="outline"
					onclick={() =>
						(s.source.calibration =
							Math.round(s.source.calibration * app.measuredRatio! * 1000) / 1000)}
					>Caler le modèle sur cette mesure</Button
				>
			{/if}
			{#if s.source.calibration !== 1}
				<p class="text-xs text-muted-foreground">
					Calage actuel ×{s.source.calibration.toFixed(3)} ·
					<button class="underline" onclick={() => (s.source.calibration = 1)}
						>revenir au modèle</button
					>
				</p>
			{/if}
		</section>
	</div>
</div>
