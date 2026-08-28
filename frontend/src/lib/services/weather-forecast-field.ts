import type { WeatherForecast } from './weather-forecast';

interface NormalizedForecastPoint {
	x: number;
	y: number;
	precipitation: number;
	probability: number;
}

const COLOR_STOPS = [
	{ at: 0, color: [56, 189, 248] },
	{ at: 0.28, color: [37, 99, 235] },
	{ at: 0.55, color: [124, 58, 237] },
	{ at: 0.78, color: [244, 63, 94] },
	{ at: 1, color: [250, 204, 21] }
] as const;

function clamp(value: number, minimum = 0, maximum = 1) {
	return Math.max(minimum, Math.min(maximum, value));
}

function gradientColor(value: number) {
	const normalized = clamp(value);
	const upperIndex = COLOR_STOPS.findIndex((stop) => stop.at >= normalized);
	if (upperIndex <= 0) return COLOR_STOPS[0].color;
	const lower = COLOR_STOPS[upperIndex - 1];
	const upper = COLOR_STOPS[upperIndex];
	const mix = (normalized - lower.at) / (upper.at - lower.at);
	return lower.color.map((channel, index) =>
		Math.round(channel + (upper.color[index] - channel) * mix)
	);
}

function normalizedPoints(forecast: WeatherForecast, frameIndex: number) {
	const { south, west, north, east } = forecast.bounds;
	const latitudeSpan = Math.max(0.001, north - south);
	const longitudeSpan = Math.max(0.001, east - west);
	return forecast.points.map<NormalizedForecastPoint>((point) => ({
		x: clamp((point.longitude - west) / longitudeSpan),
		y: clamp((north - point.latitude) / latitudeSpan),
		precipitation: point.precipitation[frameIndex] ?? 0,
		probability: point.precipitationProbability[frameIndex] ?? 0
	}));
}

function interpolate(points: NormalizedForecastPoint[], x: number, y: number) {
	let totalWeight = 0;
	let precipitation = 0;
	let probability = 0;
	for (const point of points) {
		const deltaX = x - point.x;
		const deltaY = y - point.y;
		const distanceSquared = deltaX * deltaX + deltaY * deltaY;
		const weight = 1 / Math.pow(distanceSquared + 0.003, 1.35);
		totalWeight += weight;
		precipitation += point.precipitation * weight;
		probability += point.probability * weight;
	}
	return {
		precipitation: precipitation / totalWeight,
		probability: probability / totalWeight
	};
}

export function renderForecastField(
	forecast: WeatherForecast,
	frameIndex: number,
	opacity: number
) {
	const longitudeSpan = Math.max(0.001, forecast.bounds.east - forecast.bounds.west);
	const latitudeSpan = Math.max(0.001, forecast.bounds.north - forecast.bounds.south);
	const aspectRatio = clamp(longitudeSpan / latitudeSpan, 0.65, 1.8);
	const width = Math.round(280 * Math.sqrt(aspectRatio));
	const height = Math.round(280 / Math.sqrt(aspectRatio));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Forecast rendering is unavailable');

	const points = normalizedPoints(forecast, frameIndex);
	const pixels = context.createImageData(width, height);
	const opacityScale = clamp(opacity / 100);
	for (let row = 0; row < height; row += 1) {
		const y = row / Math.max(1, height - 1);
		for (let column = 0; column < width; column += 1) {
			const x = column / Math.max(1, width - 1);
			const sample = interpolate(points, x, y);
			const wetness = clamp(Math.log1p(sample.precipitation) / Math.log(7));
			const chance = clamp((sample.probability - 15) / 85);
			const alpha =
				sample.precipitation >= 0.02 ? clamp(0.1 + wetness * 0.82 + chance * 0.08) : chance * 0.14;
			if (alpha < 0.012) continue;

			const [red, green, blue] = gradientColor(wetness);
			const offset = (row * width + column) * 4;
			pixels.data[offset] = red;
			pixels.data[offset + 1] = green;
			pixels.data[offset + 2] = blue;
			pixels.data[offset + 3] = Math.round(255 * alpha * opacityScale);
		}
	}
	context.putImageData(pixels, 0, 0);
	return canvas.toDataURL('image/png');
}
