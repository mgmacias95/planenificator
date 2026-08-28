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

function forecastFixture(requestUrl: string) {
	const url = new URL(requestUrl);
	const latitudes = url.searchParams.get('latitude')?.split(',').map(Number) ?? [];
	const longitudes = url.searchParams.get('longitude')?.split(',').map(Number) ?? [];
	const firstHour = Math.floor(Date.now() / 3_600_000) * 3600;
	const times = Array.from({ length: 16 }, (_, index) => firstHour + index * 3600);

	return latitudes.map((latitude, pointIndex) => ({
		latitude,
		longitude: longitudes[pointIndex],
		hourly: {
			time: times,
			precipitation: times.map((_, frameIndex) => frameIndex + pointIndex / 100),
			precipitation_probability: times.map((_, frameIndex) =>
				Math.min(100, 20 + frameIndex * 5 + pointIndex)
			),
			wind_speed_10m: times.map((_, frameIndex) => 8 + frameIndex + pointIndex / 5),
			wind_direction_10m: times.map(
				(_, frameIndex) => (210 + pointIndex * 4 + frameIndex * 3) % 360
			),
			...Object.fromEntries(
				['925hPa', '850hPa', '700hPa', '500hPa'].flatMap((level, levelIndex) => [
					[
						`wind_speed_${level}`,
						times.map((_, frameIndex) => 18 + levelIndex * 10 + frameIndex + pointIndex / 5)
					],
					[
						`wind_direction_${level}`,
						times.map(
							(_, frameIndex) => (240 + levelIndex * 15 + pointIndex * 4 + frameIndex * 3) % 360
						)
					]
				])
			)
		}
	}));
}

test.describe('weather radar overlay', () => {
	test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true, timezoneId: 'UTC' });

	test('shows a future forecast, updates the chosen hour, and plays forward', async ({ page }) => {
		const pageErrors: Error[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		await page.route('**/api.open-meteo.com/v1/forecast**', (route) =>
			route.fulfill({ json: forecastFixture(route.request().url()) })
		);

		await page.goto('/');
		await page.getByRole('button', { name: 'Weather', exact: true }).click();

		const panel = page.locator('#weather-overlay-panel');
		await expect(panel.getByRole('tab', { name: 'Forecast' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(panel.getByText('Model precipitation · hourly · next 8 days')).toBeVisible();
		await expect(page.locator('.weather-forecast-field')).toHaveCount(1);
		await expect(panel.getByRole('link', { name: 'Forecast data by Open-Meteo' })).toBeVisible();

		const datePicker = panel.getByLabel('Forecast date and time (UTC)');
		const initialValue = await datePicker.inputValue();
		const laterValue = new Date(`${initialValue}:00.000Z`);
		laterValue.setUTCHours(laterValue.getUTCHours() + 3);
		await datePicker.fill(laterValue.toISOString().slice(0, 16));
		await datePicker.press('Tab');
		await expect(panel.getByText(/Peak 4\.2 mm\/h/)).toBeVisible();

		const rainToggle = panel.getByRole('button', { name: 'Precipitation', exact: true });
		const windToggle = panel.getByRole('button', { name: 'Wind flow', exact: true });
		await expect(rainToggle).toHaveAttribute('aria-pressed', 'true');
		await expect(windToggle).toHaveAttribute('aria-pressed', 'false');
		await panel.getByRole('button', { name: 'Wind flow', exact: true }).click();
		await expect(rainToggle).toHaveAttribute('aria-pressed', 'true');
		await expect(windToggle).toHaveAttribute('aria-pressed', 'true');
		await expect(
			panel.getByText('Precipitation + animated wind · hourly · next 8 days')
		).toBeVisible();
		await expect(panel.getByText(/Mean 14 kt · peak 16 kt/)).toBeVisible();
		await expect(page.locator('.weather-forecast-field')).toHaveCount(1);
		const windCanvas = page.locator('[data-weather-layer="wind-flow"]');
		await expect(windCanvas).toBeVisible();
		const firstWindFrame = await windCanvas.evaluate((canvas: HTMLCanvasElement) =>
			canvas.toDataURL()
		);
		await page.waitForTimeout(250);
		const secondWindFrame = await windCanvas.evaluate((canvas: HTMLCanvasElement) =>
			canvas.toDataURL()
		);
		expect(secondWindFrame).not.toBe(firstWindFrame);
		await panel.getByLabel('Wind altitude').selectOption('850hPa');
		await expect(panel.getByText(/Mean 34 kt · peak 36 kt/)).toBeVisible();
		await expect(
			panel.getByRole('paragraph').filter({ hasText: '~5,000 ft MSL · 850 hPa' })
		).toBeVisible();
		await expect(panel.getByText('Pressure-level altitude is approximate')).toBeVisible();

		await rainToggle.click();
		await expect(rainToggle).toHaveAttribute('aria-pressed', 'false');
		await expect(windToggle).toHaveAttribute('aria-pressed', 'true');
		await expect(panel.getByText('Animated wind field · hourly · next 8 days')).toBeVisible();
		await expect(page.locator('.weather-forecast-field')).toHaveCount(0);
		await expect(windCanvas).toBeVisible();
		await rainToggle.click();
		await expect(page.locator('.weather-forecast-field')).toHaveCount(1);

		const timeSlider = panel.getByRole('slider', { name: 'Forecast time' });
		const frameBeforePlay = Number(await timeSlider.inputValue());
		await panel.getByRole('button', { name: 'Play future forecast', exact: true }).click();
		await expect(panel.getByRole('button', { name: 'Pause future forecast' })).toBeVisible();
		await expect
			.poll(async () => Number(await timeSlider.inputValue()), { timeout: 2500 })
			.toBeGreaterThan(frameBeforePlay);
		await panel.getByRole('button', { name: 'Pause future forecast' }).click();
		await windToggle.click();
		await expect(windCanvas).toBeHidden();
		await expect(page.locator('.weather-forecast-field')).toHaveCount(1);
		expect(pageErrors).toEqual([]);
	});

	test('shows observed radar with touch-friendly history and opacity controls', async ({
		page
	}) => {
		const pageErrors: Error[] = [];
		const tileRequests: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));
		await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
			route.fulfill({ json: radarFixture() })
		);
		await page.route('**/api.open-meteo.com/v1/forecast**', (route) =>
			route.fulfill({ json: forecastFixture(route.request().url()) })
		);
		await page.route('https://tiles.example.test/**', (route) => {
			tileRequests.push(route.request().url());
			return route.fulfill({ status: 200, contentType: 'image/png', body: transparentPixel });
		});

		await page.goto('/');
		await page.getByRole('button', { name: 'Weather', exact: true }).click();

		const panel = page.locator('#weather-overlay-panel');
		await expect(panel).toBeVisible();
		await panel.getByRole('tab', { name: 'Recent radar' }).click();
		await expect(panel.getByRole('heading', { name: 'Observed precipitation' })).toBeVisible();
		await expect(panel.locator('[role="status"]').filter({ hasText: /UTC/ })).toBeVisible();
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

		const playButton = panel.getByRole('button', { name: 'Play radar history', exact: true });
		const replayButton = panel.getByRole('button', { name: 'Replay radar history', exact: true });
		await expect(replayButton).toBeVisible();
		const playBounds = await replayButton.boundingBox();
		expect(playBounds?.height).toBeGreaterThanOrEqual(44);

		await panel.locator('summary').click();
		await panel.getByRole('slider', { name: 'Radar opacity' }).fill('40');
		await expect
			.poll(() =>
				page
					.locator('.leaflet-weather-pane .leaflet-layer')
					.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity))
			)
			.toBeCloseTo(0.4, 1);

		const datePicker = panel.getByLabel('Observation date and time (UTC)');
		await datePicker.selectOption('0');
		await expect
			.poll(() => tileRequests.some((url) => url.includes('/v2/radar/earliest/512/')))
			.toBe(true);

		const timeSlider = panel.getByRole('slider', { name: 'Radar time' });
		await expect(timeSlider).toHaveValue('0');
		await expect(playButton).toBeVisible();
		await playButton.click();
		await expect(
			panel.getByRole('button', { name: 'Pause radar history', exact: true })
		).toBeVisible();
		await expect(timeSlider).toHaveValue('0');
		await expect.poll(() => timeSlider.inputValue(), { timeout: 3000 }).toBe('1');
		await panel.getByRole('button', { name: 'Pause radar history', exact: true }).click();

		await panel.getByRole('button', { name: 'Weather layer on' }).click();
		await expect(page.locator('.weather-radar-tiles')).toHaveCount(0);
		expect(pageErrors).toEqual([]);
	});

	test('keeps radar failures inside the weather panel and retries cleanly', async ({ page }) => {
		let shouldFail = true;
		await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) => {
			if (shouldFail) return route.fulfill({ status: 503, body: 'unavailable' });
			return route.fulfill({ json: radarFixture() });
		});
		await page.route('**/api.open-meteo.com/v1/forecast**', (route) =>
			route.fulfill({ json: forecastFixture(route.request().url()) })
		);
		await page.route('https://tiles.example.test/**', (route) =>
			route.fulfill({ status: 200, contentType: 'image/png', body: transparentPixel })
		);

		await page.goto('/');
		await page.getByRole('button', { name: 'Weather', exact: true }).click();
		await page.getByRole('tab', { name: 'Recent radar' }).click();
		await expect(page.getByRole('alert')).toContainText('Radar is unavailable right now.');
		await expect(page.locator('text=Traceback')).toHaveCount(0);

		shouldFail = false;
		await page.getByRole('button', { name: 'Try again' }).click();
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(page.locator('.weather-radar-tiles')).not.toHaveCount(0);
	});
});
