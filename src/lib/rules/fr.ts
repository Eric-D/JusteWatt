import type { CountryRules } from './types';

/**
 * Règles françaises. Valeurs indicatives TTC, à vérifier sur la facture et les
 * arrêtés en vigueur : chaque valeur porte sa date et sa source, et reste modifiable
 * dans l'application.
 */
export const FR: CountryRules = {
	country: 'FR',
	label: 'France métropolitaine',
	checked: '2026-10-29',
	tariffs: {
		base: [
			{
				value: { price: 0.2016, subscription: 187.8 },
				from: '2025-02-01',
				source: 'Tarif réglementé EDF Base 6 kVA (CRE)'
			}
		],
		hphc: [
			{
				value: { hp: 0.2146, hc: 0.1696, subscription: 194.6 },
				from: '2025-02-01',
				source: 'Tarif réglementé EDF Heures creuses 6 kVA (CRE)'
			}
		],
		tempo: [
			{
				value: {
					bleu: { hp: 0.1552, hc: 0.1288 },
					blanc: { hp: 0.1792, hc: 0.1447 },
					rouge: { hp: 0.6586, hc: 0.1518 },
					subscription: 193.2
				},
				from: '2025-02-01',
				source: 'Tarif réglementé EDF Tempo 6 kVA (CRE)'
			}
		]
	},
	surplus: [
		{
			value: [
				{ upTo: 9, price: 0.04 },
				{ upTo: 100, price: 0.0731 }
			],
			from: '2025-03-28',
			source: 'Arrêté tarifaire S21, obligation d’achat EDF OA'
		}
	],
	premium: [
		{
			value: [
				{ upTo: 9, perKwc: 80 },
				{ upTo: 100, perKwc: 140 }
			],
			from: '2025-03-28',
			source: 'Arrêté tarifaire S21, prime à l’autoconsommation (versée en une fois)'
		}
	],
	vat: [
		{
			value: [
				{ upTo: 3, rate: 0.1 },
				{ upTo: 100, rate: 0.2 }
			],
			from: '2014-01-01',
			to: '2025-10-01',
			source: 'CGI art. 279-0 bis'
		},
		{
			value: [
				{ upTo: 9, rate: 0.055, note: 'Sous conditions (panneaux à faible empreinte carbone)' },
				{ upTo: 100, rate: 0.2 }
			],
			from: '2025-10-01',
			source: 'Loi de finances 2025, art. 278-0 bis'
		}
	],
	steps: [
		{
			id: 'devis',
			title: 'Comparer au moins deux devis',
			who: 'Vous',
			when: 'Avant de signer',
			detail:
				'Installateur RGE QualiPV obligatoire pour la prime et la revente. Vérifier puissance, marque des panneaux et des onduleurs, pose, raccordement et démarches incluses.',
			link: 'https://france-renov.gouv.fr/annuaires-professionnels/artisan-rge-recherche'
		},
		{
			id: 'dp',
			title: 'Déclaration préalable de travaux',
			who: 'Mairie',
			when: 'Avant la pose · 1 mois d’instruction (2 en site protégé)',
			detail:
				'Formulaire Cerfa 16702 : plan de situation, plan de masse, insertion paysagère, photos. Dépôt en ligne possible sur le guichet de la commune.',
			link: 'https://www.service-public.fr/particuliers/vosdroits/R11646'
		},
		{
			id: 'raccordement',
			title: 'Demande de raccordement en autoconsommation',
			who: 'Enedis',
			when: 'Après l’accord de la mairie',
			detail:
				'Sur le portail Enedis Raccordement : autoconsommation avec vente du surplus ou sans injection. Souvent fait par l’installateur avec un mandat.',
			link: 'https://connect-racco.enedis.fr'
		},
		{
			id: 'consuel',
			title: 'Attestation de conformité Consuel',
			who: 'Consuel',
			when: 'Après la pose',
			detail: 'Visite ou contrôle sur dossier. Obligatoire pour la mise en service avec injection.',
			link: 'https://www.consuel.com'
		},
		{
			id: 'oa',
			title: 'Contrat d’obligation d’achat',
			who: 'EDF OA',
			when: 'Après la mise en service',
			detail:
				'Création du compte sur le portail EDF OA avec le numéro de contrat Enedis, puis facturation annuelle du surplus. La prime est versée sur la première facture.',
			link: 'https://www.edf-oa.fr'
		},
		{
			id: 'assurance',
			title: 'Prévenir l’assureur habitation',
			who: 'Assureur',
			when: 'Avant la mise en service',
			detail: 'Déclarer l’installation (valeur, puissance) pour la couvrir en cas de sinistre.'
		},
		{
			id: 'impots',
			title: 'Déclaration aux impôts',
			who: 'Impôts',
			when: 'Dans les 90 jours puis chaque année',
			detail:
				'Signaler la modification du bien (formulaire H1 / « Gérer mes biens immobiliers »). La vente du surplus est exonérée jusqu’à 3 kWc, déclarée au-delà.',
			link: 'https://www.impots.gouv.fr'
		}
	]
};

export const PACKS = { FR } as const;
