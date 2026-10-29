import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Stat from './Stat.svelte';

describe('Stat', () => {
	it('affiche la valeur et le détail', async () => {
		const screen = render(Stat, { label: 'Autonomie', value: '47 %', sub: 'sur l’année' });
		await expect.element(screen.getByText('47 %')).toBeVisible();
		await expect.element(screen.getByText('sur l’année')).toBeVisible();
	});
});
