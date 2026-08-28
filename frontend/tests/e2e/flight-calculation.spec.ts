import { test, expect } from '@playwright/test';
import windsMock from '../fixtures/open-meteo-winds.json' with { type: 'json' };
import notamsMock from '../fixtures/enaire-notams.json' with { type: 'json' };

test.describe('Flight Calculation & Safety Briefing', () => {
	test('should display calculation button and handle empty waypoint validation', async ({
		page
	}) => {
		// Intercept Open-Meteo & ENAIRE APIs with deterministic mock fixtures
		await page.route('**/api.open-meteo.com/**', async (route) => {
			await route.fulfill({ json: windsMock });
		});
		await page.route('**/servais.enaire.es/**', async (route) => {
			await route.fulfill({ json: notamsMock });
		});

		await page.goto('/');

		const calcBtn = page.locator('#calculate-btn');
		await expect(calcBtn).toBeVisible();

		// Verify NavLog table placeholder is present
		await expect(page.locator('#nav-log-table')).toBeVisible();
		await expect(page.getByText('No route calculated yet')).toBeVisible();

		// Safety tab checks
		await page.getByRole('button', { name: 'Safety' }).click();
		await expect(
			page.getByText('Calculate a route to perform semicircular rule safety checks')
		).toBeVisible();
	});
});
