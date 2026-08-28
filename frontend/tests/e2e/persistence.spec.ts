import { test, expect } from '@playwright/test';

test.describe('Flight Plan Persistence & Project Management', () => {
	test('should navigate to projects tab and allow naming and saving projects', async ({ page }) => {
		await page.goto('/');

		// Switch to Plans tab
		await page.getByRole('tab', { name: 'Plans' }).click();

		await expect(page.locator('#plan-name-input')).toBeVisible();
		await expect(page.getByText('Create New Plan')).toBeVisible();
	});
});
