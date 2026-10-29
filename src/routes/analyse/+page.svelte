<script lang="ts">
	import { resolve } from '$app/paths';
	import { app } from '#lib/app/store.svelte.js';
	import { analyse, SEASONS, type Season } from '#lib/app/analysis.js';
	import { defaultTariff } from '#lib/app/model.js';
	import type { Tariff, TariffKind } from '#lib/engine/tariffs.js';
	import { fmt, monthLabel } from '#lib/format.js';
	import Stat from '#lib/components/Stat.svelte';
	import Heatmap from '#lib/components/charts/Heatmap.svelte';
	import Legend from '#lib/components/charts/Legend.svelte';
	import Lines24 from '#lib/components/charts/Lines24.svelte';
	import TempScatter from '#lib/components/charts/TempScatter.svelte';
	import UsageMonths from '#lib/components/charts/UsageMonths.svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	const p = $derived(app.prepared);
	const ex = $derived(app.settings.existing);
	/** Le tarif payé aujourd'hui : celui de l'installation existante s'il est renseigné. */
	const current = $derived<Tariff>(
		ex.enabled && ex.currentTariff ? ex.currentTariff : app.settings.economics.tariff
	);
	const KINDS: TariffKind[] = ['base', 'hphc', 'tempo'];
	const KIND_LABEL: Record<TariffKind, string> = {
		base: 'Base',
		hphc: 'Heures creuses',
		tempo: 'Tempo'
	};

	const a = $derived.by(() => {
		if (!p) return null;
		const c = $state.snapshot(current) as Tariff;
		return analyse({
			cons: p.cons,
			temp: p.temp,
			pvPerKwc: p.pv,
			basePv: ex.enabled ? p.basePv : undefined,
			tariffs: KINDS.map((k) => (k === c.kind ? c : defaultTariff(k))),
			hcHours: c.kind === 'base' ? defaultTariff('hphc').hcHours : c.hcHours
		});
	});

	let selected = $state('');
	$effect(() => {
		if (a && !a.daily.some((d) => d.day === selected)) selected = a.peak.day;
	});

	const seasonOf = (d: string): Season => {
		const m = Number(d.slice(5, 7));
		return m === 12 || m <= 2 ? 'hiver' : m <= 5 ? 'printemps' : m <= 8 ? 'été' : 'automne';
	};
	const dayDetail = $derived.by(() => {
		if (!p || !a || !selected) return null;
		const v = new Array<number>(24).fill(0);
		const c = p.cons;
		for (let i = 0; i < c.load.length; i++)
			if (c.localDay[i] === selected) v[c.localHour[i]] += c.load[i];
		const stat = a.daily.find((d) => d.day === selected)!;
		const typical = a.profiles[seasonOf(selected)][stat.weekend ? 'weekend' : 'weekday'];
		return { v, typical, stat };
	});

	const profileMax = $derived(
		a
			? Math.max(
					0.5,
					...SEASONS.flatMap((s) => [...a.profiles[s].weekday, ...a.profiles[s].weekend])
				) * 1.1
			: 1
	);

	const yearCost = $derived(a?.tariffs.find((t) => t.kind === current.kind));
	const cheapest = $derived(a ? [...a.tariffs].sort((x, y) => x.total - y.total)[0] : null);
	const costMax = $derived(a ? Math.max(...a.tariffs.map((t) => t.total)) : 1);
	const price = $derived(yearCost && a ? yearCost.energy / a.total : current.base);
	const heatShare = $derived(a?.heating ? a.heating.total / a.total : 0);

	const longDay = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
	const shortDay = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		});
	const watts = (kwhPerHour: number) => `${fmt.int(kwhPerHour * 1000)} W`;
	const SEASON_LABEL: Record<Season, string> = {
		hiver: 'Hiver',
		printemps: 'Printemps',
		été: 'Été',
		automne: 'Automne'
	};
</script>

<svelte:head><title>Analyse · JusteWatt</title></svelte:head>

{#if !app.ready || (!p && app.busy)}
	<p class="text-muted-foreground" role="status">{app.busy || 'Chargement'}…</p>
{:else if !app.hasData}
	<p>
		Choisissez d’abord une source de données sur <a class="underline" href={resolve('/')}
			>l’accueil</a
		>.
	</p>
{:else if !p || !a}
	<div class="grid gap-3">
		<p class="text-muted-foreground">Les données ne sont pas encore calculées.</p>
		<div><Button onclick={() => app.recompute()}>Calculer</Button></div>
	</div>
{:else}
	<div class="grid gap-8">
		<header class="grid gap-1">
			<h1 class="text-2xl font-semibold tracking-tight">Votre consommation, en détail</h1>
			<p class="text-sm text-muted-foreground">
				Du {longDay(a.daily[0].day)} au {longDay(a.daily[a.daily.length - 1].day)} · {p.cons.sources.join(
					' · '
				)}{a.existing ? ' · production de vos panneaux incluse' : ''}
			</p>
		</header>

		<section
			class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"
			aria-label="Chiffres clés"
		>
			<Stat
				label="Sur un an"
				value={fmt.kwh(a.total)}
				sub={yearCost ? `≈ ${fmt.eur(yearCost.total)} en ${KIND_LABEL[current.kind]}` : ''}
			/>
			<Stat
				label="Par jour"
				value="{fmt.dec(a.perDay)} kWh"
				sub="{fmt.dec(a.weekday)} en semaine · {fmt.dec(a.weekend)} le week-end"
			/>
			<Stat
				label="Talon (veille)"
				value={watts(a.standby)}
				sub="{fmt.kwh(a.standbyKwh)} · {fmt.eur(a.standbyKwh * price)} par an"
			/>
			<Stat
				label="Heure la plus chargée"
				value="{fmt.dec(a.peak.kwh)} kWh"
				sub="{shortDay(a.peak.day)}, {a.peak.hour} h"
			/>
			<Stat
				label="Chauffage"
				value={a.heating ? fmt.pct(heatShare) : 'non détecté'}
				sub={a.heating
					? `≈ ${fmt.kwh(a.heating.total)} · +${fmt.dec(a.heating.slope)} kWh/jour par °C`
					: 'pas de lien net avec le froid'}
				tone={a.heating ? 'var(--q2)' : ''}
			/>
			<Stat
				label="Aux heures de soleil"
				value={fmt.pct(a.sunShare)}
				sub="{fmt.pct(a.nightShare)} la nuit (0-6 h)"
				tone="var(--solar)"
			/>
		</section>

		<section class="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
			<div class="grid gap-1">
				<h2 class="font-semibold">L’année heure par heure</h2>
				<p class="text-sm text-muted-foreground">
					Chaque colonne est un jour, de minuit en haut à minuit en bas. Plus c’est foncé, plus la
					maison consomme.
				</p>
			</div>
			<Heatmap
				load={p.cons.load}
				localDay={p.cons.localDay}
				localHour={p.cons.localHour}
				temp={p.temp}
				bind:selected
			/>
			{#if dayDetail}
				<div class="grid gap-3 border-t pt-4 md:grid-cols-[1fr_240px]">
					<div class="grid min-w-0 gap-2">
						<h3 class="text-sm font-medium first-letter:uppercase">{longDay(selected)}</h3>
						<Lines24
							label="Consommation du jour sélectionné comparée à une journée type"
							title={shortDay(selected)}
							max={Math.max(0.5, ...dayDetail.v, ...dayDetail.typical) * 1.1}
							standby={a.standby}
							lines={[
								{ label: 'ce jour', values: dayDetail.v, color: 'var(--foreground)' },
								{
									label: `${SEASON_LABEL[seasonOf(selected)].toLowerCase()}, ${dayDetail.stat.weekend ? 'week-end' : 'semaine'} moyen`,
									values: dayDetail.typical,
									color: 'var(--muted-foreground)',
									dash: true
								}
							]}
						/>
						<Legend
							items={[
								{ label: 'Ce jour', color: 'var(--foreground)', line: true },
								{
									label: `Journée type (${SEASON_LABEL[seasonOf(selected)].toLowerCase()}, ${dayDetail.stat.weekend ? 'week-end' : 'semaine'})`,
									color: 'var(--muted-foreground)',
									line: true
								}
							]}
						/>
					</div>
					<dl class="grid content-start gap-2 text-sm">
						<div class="flex justify-between gap-2">
							<dt class="text-muted-foreground">Consommés</dt>
							<dd class="num font-mono font-medium">{fmt.kwh(dayDetail.stat.kwh)}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-muted-foreground">Par rapport à la moyenne</dt>
							<dd class="num font-mono font-medium">
								{dayDetail.stat.kwh >= a.perDay ? '+' : '−'}{fmt.pct(
									Math.abs(dayDetail.stat.kwh / a.perDay - 1)
								)}
							</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-muted-foreground">Température moyenne</dt>
							<dd class="num font-mono font-medium">{fmt.dec(dayDetail.stat.temp)} °C</dd>
						</div>
						{#if dayDetail.stat.heating > 0.5}
							<div class="flex justify-between gap-2">
								<dt class="text-muted-foreground">Dont chauffage estimé</dt>
								<dd class="num font-mono font-medium">{fmt.kwh(dayDetail.stat.heating)}</dd>
							</div>
						{/if}
						{#if dayDetail.stat.pilotable > 0.5}
							<div class="flex justify-between gap-2">
								<dt class="text-muted-foreground">Dont eau chaude</dt>
								<dd class="num font-mono font-medium">{fmt.kwh(dayDetail.stat.pilotable)}</dd>
							</div>
						{/if}
						<p class="mt-2 text-xs text-muted-foreground">
							Jours les plus chargés :
							{#each a.topDays as d, i (d.day)}{i ? ', ' : ''}<button
									class="underline underline-offset-2 hover:text-foreground"
									onclick={() => (selected = d.day)}>{shortDay(d.day)}</button
								>{/each}.
						</p>
					</dl>
				</div>
			{/if}
		</section>

		<div class="grid gap-6 lg:grid-cols-2">
			<section class="grid min-w-0 content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
				<div class="grid gap-1">
					<h2 class="font-semibold">Mois par mois</h2>
					<p class="text-sm text-muted-foreground">
						Le chauffage et la climatisation sont déduits du lien entre la consommation et la
						température ; l’eau chaude, des relevés du cumulus quand ils existent.
					</p>
				</div>
				<UsageMonths months={a.monthly} />
				<details class="text-sm">
					<summary class="cursor-pointer text-muted-foreground">Voir le tableau</summary>
					<table class="num mt-2 w-full font-mono text-xs">
						<thead class="text-left text-muted-foreground">
							<tr>
								<th class="py-1 font-normal">Mois</th>
								<th class="text-right font-normal">Total</th>
								<th class="text-right font-normal">Chauffage</th>
								<th class="text-right font-normal">Eau chaude</th>
								<th class="text-right font-normal">Autres</th>
							</tr>
						</thead>
						<tbody>
							{#each a.monthly as m (m.month)}
								<tr class="border-t">
									<td class="py-1 font-sans">{monthLabel(m.month)}</td>
									<td class="text-right">{fmt.int(m.kwh)}</td>
									<td class="text-right">{fmt.int(m.heating)}</td>
									<td class="text-right">{fmt.int(m.pilotable)}</td>
									<td class="text-right">{fmt.int(m.other + m.cooling)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</details>
			</section>

			<section class="grid min-w-0 content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
				<div class="grid gap-1">
					<h2 class="font-semibold">Sensible à la température ?</h2>
					<p class="text-sm text-muted-foreground">
						{#if a.heating}
							Sous {a.heating.threshold} °C de moyenne, chaque degré en moins ajoute environ
							<strong class="text-foreground">{fmt.dec(a.heating.slope)} kWh</strong> par jour. Le
							chauffage pèse environ {fmt.kwh(a.heating.total)} sur l’année ({fmt.pct(heatShare)}).
						{:else}
							Aucun lien net entre le froid et la consommation : le chauffage n’est probablement pas
							électrique, ou il est déjà très bien maîtrisé.
						{/if}
						{#if a.cooling}
							Au-dessus de {a.cooling.threshold} °C, la climatisation ajoute environ
							{fmt.dec(a.cooling.slope)} kWh par jour et par degré ({fmt.kwh(a.cooling.total)} sur l’année).
						{/if}
					</p>
				</div>
				<TempScatter days={a.daily} heating={a.heating} cooling={a.cooling} bind:selected />
			</section>
		</div>

		<section class="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
			<div class="grid gap-1">
				<h2 class="font-semibold">Une journée type, saison par saison</h2>
				<p class="text-sm text-muted-foreground">
					Moyenne de chaque heure. Le pointillé horizontal est le talon : ce qui tourne en
					permanence ({watts(a.standby)}).
				</p>
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				{#each SEASONS as s (s)}
					<div class="grid min-w-0 gap-1">
						<h3 class="text-sm font-medium">
							{SEASON_LABEL[s]}
							<span class="num font-mono font-normal text-muted-foreground"
								>· {fmt.dec(a.profiles[s].weekday.reduce((x, v) => x + v, 0))} kWh par jour en semaine</span
							>
						</h3>
						<Lines24
							label="Journée moyenne, {SEASON_LABEL[s].toLowerCase()}"
							title={SEASON_LABEL[s]}
							max={profileMax}
							standby={a.standby}
							lines={[
								{ label: 'semaine', values: a.profiles[s].weekday, color: 'var(--foreground)' },
								{
									label: 'week-end',
									values: a.profiles[s].weekend,
									color: 'var(--muted-foreground)',
									dash: true
								}
							]}
						/>
					</div>
				{/each}
			</div>
			<Legend
				items={[
					{ label: 'Semaine', color: 'var(--foreground)', line: true },
					{ label: 'Week-end', color: 'var(--muted-foreground)', line: true }
				]}
			/>
		</section>

		<div class="grid gap-6 lg:grid-cols-2">
			<section class="grid content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
				<div class="grid gap-1">
					<h2 class="font-semibold">Quelle option tarifaire pour cette consommation ?</h2>
					<p class="text-sm text-muted-foreground">
						Abonnement compris, aux tarifs réglementés (votre tarif saisi pour l’option actuelle).
					</p>
				</div>
				<ul class="grid gap-3">
					{#each a.tariffs as t (t.kind)}
						<li class="grid gap-1">
							<div class="flex items-baseline justify-between gap-2 text-sm">
								<span>
									{KIND_LABEL[t.kind]}
									{#if t.kind === current.kind}<span class="text-xs text-muted-foreground">
											· actuelle</span
										>{/if}
									{#if cheapest && t.kind === cheapest.kind}<span
											class="text-xs font-medium text-foreground"
										>
											· la moins chère</span
										>{/if}
								</span>
								<span class="num font-mono font-medium">{fmt.eur(t.total)}</span>
							</div>
							<div class="h-2 rounded-full bg-secondary">
								<div
									class="h-2 rounded-full"
									style:width="{(100 * t.total) / costMax}%"
									style:background={cheapest && t.kind === cheapest.kind
										? 'var(--foreground)'
										: 'var(--muted-foreground)'}
								></div>
							</div>
						</li>
					{/each}
				</ul>
				<p class="text-xs text-muted-foreground">
					{fmt.pct(a.hcShare)} de la consommation tombe en heures creuses.
					{#if a.redDays.days}
						Les {a.redDays.days} jours rouges Tempo (estimés sur les jours les plus froids) pèsent {fmt.kwh(
							a.redDays.kwh
						)}.
					{/if}
				</p>
			</section>

			<section class="grid content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
				<div class="grid gap-1">
					<h2 class="font-semibold">Ce que cela dit pour le solaire</h2>
				</div>
				<ul class="grid gap-3 text-sm">
					<li>
						<strong class="num font-mono">{fmt.pct(a.sunShare)}</strong> de la consommation a lieu quand
						le soleil produit : c’est la part que des panneaux peuvent couvrir directement.
					</li>
					<li>
						Le talon de <strong class="num font-mono">{watts(a.standby)}</strong> tourne jour et
						nuit.
						{a.standby > 0.25
							? 'Le réduire est souvent plus rentable que de le couvrir avec des panneaux.'
							: 'Il est déjà bas.'}
					</li>
					{#if a.pilotable > 1}
						<li>
							<strong class="num font-mono">{fmt.kwh(a.pilotable)}</strong> d’eau chaude par an peuvent
							être décalés en journée pour absorber le surplus.
						</li>
					{/if}
					{#if a.existing}
						<li>
							Vos panneaux produisent <strong class="num font-mono"
								>{fmt.kwh(a.existing.production)}</strong
							>
							par an ; environ {fmt.pct(a.existing.direct / a.total)} de votre consommation est déjà couverte
							sans pilotage.
						</li>
					{/if}
				</ul>
				<div class="flex flex-wrap gap-2">
					<Button href={resolve('/simulateur')}>Simuler des panneaux</Button>
					<Button variant="outline" href={resolve('/donnees')}>Vérifier les données</Button>
				</div>
			</section>
		</div>
	</div>
{/if}
