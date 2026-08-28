import { test, expect } from '@playwright/test';

test.describe('Multi-Language Localization Switching', () => {
	test('should toggle between English and Spanish seamlessly', async ({ page }) => {
		await page.goto('/');

		// Verify initial English strings
<<<<<<< HEAD
		await expect(page.getByRole('tab', { name: 'Route' })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'Charts' })).toBeVisible();
=======
		await expect(page.getByRole('button', { name: 'Route' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Charts' })).toBeVisible();
>>>>>>> 0577d7b (feat: Implement Svelte Frontend (#16))

		// Click Language Toggle
		const langBtn = page.locator('button[title*="Language"]');
		await expect(langBtn).toBeVisible();
		await langBtn.click();

		// Verify Spanish strings update
<<<<<<< HEAD
		await expect(page.getByRole('tab', { name: 'Ruta' })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'Cartas' })).toBeVisible();
=======
		await expect(page.getByRole('button', { name: 'Ruta' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Cartas' })).toBeVisible();
>>>>>>> 0577d7b (feat: Implement Svelte Frontend (#16))
	});
});
