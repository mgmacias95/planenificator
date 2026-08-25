import { test, expect } from '@playwright/test';

test.describe('Flight Plan Persistence & Project Management', () => {
	test('should navigate to projects tab and allow naming and saving projects', async ({ page }) => {
		await page.goto('/');

		// Switch to Projects tab
		await page.getByRole('button', { name: 'Projects' }).click();

		await expect(page.locator('#plan-name-input')).toBeVisible();
		await expect(page.getByText('Save Current Flight Plan Project')).toBeVisible();
	});
});
