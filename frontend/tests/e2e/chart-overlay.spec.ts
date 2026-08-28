import { test, expect } from '@playwright/test';

test.describe('ENAIRE VFR Chart Overlays & Management', () => {
	test('should navigate to Charts tab and display catalog selector and dropzone', async ({
		page
	}) => {
		await page.goto('/');

		// Switch to Charts Tab
<<<<<<< HEAD
		await page.getByRole('tab', { name: 'Charts' }).click();

		// Verify Catalog select and Dropzone are visible
		await expect(page.locator('#catalog-select')).toBeVisible();
		await expect(page.getByText('Choose chart files')).toBeVisible();
=======
		await page.getByRole('button', { name: 'Charts' }).click();

		// Verify Catalog select and Dropzone are visible
		await expect(page.locator('#catalog-select')).toBeVisible();
		await expect(page.getByText('Drop ENAIRE VFR ZIP')).toBeVisible();
>>>>>>> 0577d7b (feat: Implement Svelte Frontend (#16))
	});
});
