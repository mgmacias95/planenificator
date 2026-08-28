import { expect, test } from '@playwright/test';

const transparentPixel = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2tH2WQAAAABJRU5ErkJggg==',
	'base64'
);

function radarFixture() {
	const latest = Math.floor(Date.now() / 600_000) * 600;
	return {
		version: '2.0',
		generated: latest,
		host: 'https://tiles.example.test',
		radar: {
			past: [
				{ time: latest - 3000, path: '/v2/radar/earliest' },
				{ time: latest - 2400, path: '/v2/radar/older-2' },
				{ time: latest - 1800, path: '/v2/radar/older-1' },
				{ time: latest - 1200, path: '/v2/radar/earlier' },
				{ time: latest - 600, path: '/v2/radar/recent' },
				{ time: latest, path: '/v2/radar/latest' }
			]
		}
	};
}

test.describe('weather radar overlay', () => {
	test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true, timezoneId: 'UTC' });

	test('shows observed radar with touch-friendly history and opacity controls', async ({
		page
	}) => {
		const pageErrors: Error[] = [];
		const tileRequests: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
			route.fulfill({ json: radarFixture() })
		);
		await page.route('https://tiles.example.test/**', (route) => {
			tileRequests.push(route.request().url());
			return route.fulfill({ status: 200, contentType: 'image/png', body: transparentPixel });
		});

		await page.goto('/');
		await page.getByRole('button', { name: 'Weather', exact: true }).click();

		const panel = page.locator('#weather-overlay-panel');
		await expect(panel).toBeVisible();
		await expect(panel.getByRole('heading', { name: 'Precipitation radar' })).toBeVisible();
		await expect(panel.getByText(/UTC$/)).toBeVisible();
		await expect(page.locator('.weather-radar-tiles')).not.toHaveCount(0);
		await expect(panel.getByRole('link', { name: 'Weather data by RainViewer' })).toBeVisible();

		const mapBounds = await page.locator('#map').boundingBox();
		const panelBounds = await panel.boundingBox();
		expect(mapBounds).not.toBeNull();
		expect(panelBounds).not.toBeNull();
		expect(panelBounds!.x).toBeGreaterThanOrEqual(mapBounds!.x);
		expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(
			mapBounds!.x + mapBounds!.width
		);
		expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(
			mapBounds!.y + mapBounds!.height
		);

		const playButton = panel.getByRole('button', { name: 'Play radar history' });
		const playBounds = await playButton.boundingBox();
		expect(playBounds?.height).toBeGreaterThanOrEqual(44);

		await panel.getByRole('slider', { name: 'Radar opacity' }).fill('40');
		await expect
			.poll(() =>
				page
					.locator('.leaflet-weather-pane .leaflet-layer')
					.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity))
			)
			.toBeCloseTo(0.4, 1);

		const datePicker = panel.getByLabel('Observation date and time (UTC)');
		const earliestDate = await datePicker.getAttribute('min');
		expect(earliestDate).not.toBeNull();
		await datePicker.fill(earliestDate!);
		await expect
			.poll(() => tileRequests.some((url) => url.includes('/v2/radar/earliest/512/')))
			.toBe(true);

		const timeSlider = panel.getByRole('slider', { name: 'Radar time' });
		await expect(timeSlider).toHaveValue('0');
		await playButton.click();
		await expect(panel.getByRole('button', { name: 'Pause radar history' })).toBeVisible();
		await expect(timeSlider).toHaveValue('0');
		await expect.poll(() => timeSlider.inputValue(), { timeout: 3000 }).toBe('1');
		await panel.getByRole('button', { name: 'Pause radar history' }).click();

		await panel.getByRole('button', { name: 'Radar on' }).click();
		await expect(page.locator('.weather-radar-tiles')).toHaveCount(0);
		expect(pageErrors).toEqual([]);
	});

	test('keeps radar failures inside the weather panel and retries cleanly', async ({ page }) => {
		let shouldFail = true;
		await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) => {
			if (shouldFail) return route.fulfill({ status: 503, body: 'unavailable' });
			return route.fulfill({ json: radarFixture() });
		});
		await page.route('https://tiles.example.test/**', (route) =>
			route.fulfill({ status: 200, contentType: 'image/png', body: transparentPixel })
		);

		await page.goto('/');
		await page.getByRole('button', { name: 'Weather', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText('Radar is unavailable right now.');
		await expect(page.locator('text=Traceback')).toHaveCount(0);

		shouldFail = false;
		await page.getByRole('button', { name: 'Try again' }).click();
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(page.locator('.weather-radar-tiles')).not.toHaveCount(0);
	});
});
