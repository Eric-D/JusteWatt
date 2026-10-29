import { expect, test } from '@playwright/test';
import { mockApis } from './mock';

test.beforeEach(async ({ page }) => {
	await mockApis(page);
});

test('accueil : les trois sources sont proposées', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('La juste puissance');
	await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
	await expect(page.getByText('Importer un CSV Enedis')).toBeVisible();
	await expect(page.getByRole('button', { name: /démonstration/ })).toBeVisible();
});

test('démonstration → simulateur → carte → devis → démarches', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /démonstration/ }).click();
	await expect(page).toHaveURL(/simulateur/);
	await expect(page.getByText('Autonomie', { exact: true })).toBeVisible();
	await expect(page.getByText('D’où vient votre électricité')).toBeVisible();

	// la batterie augmente l'autonomie
	const autonomy = async () =>
		Number(
			(await page.locator('text=Autonomie >> xpath=../div[2]').textContent())!.replace(/\D/g, '')
		);
	const before = await autonomy();
	const slider = page.getByRole('slider', { name: 'Batterie', exact: true });
	await slider.focus();
	for (let i = 0; i < 10; i++) await slider.press('ArrowRight');
	await expect.poll(autonomy).toBeGreaterThan(before);

	await page.getByRole('link', { name: 'Carte' }).first().click();
	await expect(page.getByText(/77 configurations simulées/)).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText('Meilleur gain', { exact: true })).toBeVisible();

	await page.getByRole('link', { name: 'Devis' }).first().click();
	await page.getByRole('button', { name: 'Nouveau devis' }).click();
	await expect(page.getByText('Total TTC')).toBeVisible();
	await expect(page.getByText('Trésorerie cumulée')).toBeVisible();

	await page.getByRole('link', { name: 'Démarches' }).first().click();
	await expect(page.getByText('Déclaration préalable de travaux')).toBeVisible();
	await page.getByRole('checkbox', { name: /Comparer au moins deux devis/ }).check();
	await expect(page.getByText('1/7 étapes faites')).toBeVisible();
});

test('les réglages survivent au rechargement', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /démonstration/ }).click();
	await page.getByLabel('Nom du scénario', { exact: true }).first().fill('Mon essai');
	await page.reload();
	await expect(page.getByLabel('Nom du scénario', { exact: true }).first()).toHaveValue(
		'Mon essai'
	);
});

test('import d’une courbe Enedis 30 min', async ({ page }) => {
	const lines = [
		'Identifiant PRM;Type;Debut;Fin;Grandeur;Metier;Etape;Unite',
		'x;Courbe;;;;;;W',
		'Horodate;Valeur'
	];
	const t0 = Date.UTC(2025, 8, 30, 22);
	for (let i = 1; i <= 2 * 24 * 365; i++) {
		const t = new Date(t0 + i * 1_800_000);
		const h = (t.getUTCHours() + 2) % 24;
		lines.push(`${t.toISOString().slice(0, 19)}Z;${h >= 18 && h <= 21 ? 2500 : 700}`);
	}
	await page.goto('/');
	await page
		.locator('input[type=file]')
		.first()
		.setInputFiles({
			name: 'enedis.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(lines.join('\n'))
		});
	await expect(page).toHaveURL(/donnees/);
	await expect(page.getByText(/Courbe Enedis/)).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText('Mesurée').first()).toBeVisible();
});

test('mode sombre et page sans débordement sur mobile', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await page.goto('/');
	await page.getByRole('button', { name: /démonstration/ }).click();
	await expect(page.getByText('Autonomie', { exact: true })).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
	await page.getByRole('button', { name: 'Thème sombre' }).click();
	await expect(page.locator('html')).toHaveClass(/dark/);
});
