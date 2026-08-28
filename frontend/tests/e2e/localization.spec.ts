import { test, expect } from '@playwright/test';

test.describe('Multi-Language Localization Switching', () => {
	test('should toggle between English and Spanish seamlessly', async ({ page }) => {
		await page.goto('/');

		// Verify initial English strings
		await expect(page.getByRole('tab', { name: 'Route' })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'Charts' })).toBeVisible();

		// Click Language Toggle
		const langBtn = page.locator('button[title*="Language"]');
		await expect(langBtn).toBeVisible();
		await langBtn.click();

		// Verify Spanish strings update
		await expect(page.getByRole('tab', { name: 'Ruta' })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'Cartas' })).toBeVisible();
	});
});
