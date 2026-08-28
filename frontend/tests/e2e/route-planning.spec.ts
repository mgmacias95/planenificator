import { test, expect } from '@playwright/test';

test.describe('VFR Route Planning & Waypoint Management', () => {
	test('should render cockpit layout, map, and accept waypoint creation and parameters', async ({
		page
	}) => {
		await page.goto('/');

		// Verify Title & HUD Header
		await expect(page.locator('h1')).toContainText('PLANENIFICATOR');

		// Verify Map container exists
		const mapEl = page.locator('#map');
		await expect(mapEl).toBeVisible();

		// Verify Default Segment 1 is displayed
		await expect(page.getByText('Segment 1')).toBeVisible();

		// Input Departure & Destination
		const depInput = page.locator('#dep-input');
		await depInput.fill('LEBA');
		await expect(depInput).toHaveValue('LEBA');

		const destInput = page.locator('#dest-input');
		await destInput.fill('LEMD');
		await expect(destInput).toHaveValue('LEMD');

		// Add New Segment
		await page.getByRole('button', { name: '+ New Segment' }).click();
		await expect(page.getByText('Add New Route Segment')).toBeVisible();
		await page.getByRole('button', { name: 'Save Altitude' }).click();

		// Verify Segment 2 added
		await expect(page.getByText('Segment 2')).toBeVisible();
	});
});

test.describe('iPad route planning', () => {
	test.use({
		viewport: { width: 768, height: 1024 },
		hasTouch: true
	});

	test('keeps the map visible and adds a waypoint with a single tap', async ({ page }) => {
		await page.goto('/');

		const sidebar = page.locator('aside');
		const mapEl = page.locator('#map');
		await expect(sidebar).toBeVisible();
		await expect(mapEl).toBeVisible();

		const sidebarBox = await sidebar.boundingBox();
		const mapBox = await mapEl.boundingBox();
		expect(sidebarBox).not.toBeNull();
		expect(mapBox).not.toBeNull();
		expect(mapBox!.y).toBeGreaterThanOrEqual(sidebarBox!.y + sidebarBox!.height);
		expect(mapBox!.height).toBeGreaterThanOrEqual(280);

		const addWaypointButton = page.getByRole('button', { name: 'Add waypoint' });
		await expect(addWaypointButton).toHaveAttribute('aria-pressed', 'true');

		await page.touchscreen.tap(mapBox!.x + mapBox!.width * 0.45, mapBox!.y + mapBox!.height * 0.45);
		await expect(page.locator('.custom-wp-marker')).toHaveCount(1);
	});
});
