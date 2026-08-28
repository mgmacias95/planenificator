import type { WeatherForecast, WindLevel } from './weather-forecast';

export interface ScreenPoint {
	x: number;
	y: number;
}

interface WindVector {
	u: number;
	v: number;
	speed: number;
}

interface WindSample extends WindVector, ScreenPoint {}

interface Particle extends ScreenPoint {
	age: number;
	maxAge: number;
}

export function windComponents(speed: number, direction: number): WindVector {
	const radians = (direction * Math.PI) / 180;
	return {
		u: -speed * Math.sin(radians),
		v: speed * Math.cos(radians),
		speed
	};
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.max(minimum, Math.min(maximum, value));
}

export class WindFlowAnimator {
	private context: CanvasRenderingContext2D;
	private animationFrame: number | null = null;
	private particles: Particle[] = [];
	private field: WindVector[] = [];
	private columns = 0;
	private rows = 0;
	private width = 0;
	private height = 0;
	private cellSize = 34;
	private opacity = 0.58;
	private lastFrameTime = 0;
	private reducedMotion = false;

	constructor(private canvas: HTMLCanvasElement) {
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Wind rendering is unavailable');
		this.context = context;
		this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	update(
		forecast: WeatherForecast,
		frameIndex: number,
		windLevel: WindLevel,
		project: (latitude: number, longitude: number) => ScreenPoint,
		width: number,
		height: number,
		opacity: number
	) {
		this.stop();
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.opacity = clamp(opacity / 100, 0.2, 0.9);
		this.resizeCanvas();

		const samples = forecast.points.map<WindSample>((point) => ({
			...project(point.latitude, point.longitude),
			...windComponents(
				point.winds[windLevel].speed[frameIndex] ?? 0,
				point.winds[windLevel].direction[frameIndex] ?? 0
			)
		}));
		this.buildField(samples);
		this.seedParticles();
		this.context.clearRect(0, 0, this.width, this.height);
		if (this.reducedMotion) {
			this.drawStaticFlow();
			return;
		}
		this.lastFrameTime = performance.now();
		this.animationFrame = requestAnimationFrame(this.animate);
	}

	stop(clear = false) {
		if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
		this.animationFrame = null;
		if (clear) this.context.clearRect(0, 0, this.width, this.height);
	}

	destroy() {
		this.stop(true);
		this.field = [];
		this.particles = [];
	}

	private resizeCanvas() {
		const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
		this.canvas.width = Math.round(this.width * pixelRatio);
		this.canvas.height = Math.round(this.height * pixelRatio);
		this.canvas.style.width = `${this.width}px`;
		this.canvas.style.height = `${this.height}px`;
		this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
	}

	private buildField(samples: WindSample[]) {
		this.columns = Math.ceil(this.width / this.cellSize) + 1;
		this.rows = Math.ceil(this.height / this.cellSize) + 1;
		this.field = new Array(this.columns * this.rows);
		for (let row = 0; row < this.rows; row += 1) {
			for (let column = 0; column < this.columns; column += 1) {
				const x = Math.min(this.width, column * this.cellSize);
				const y = Math.min(this.height, row * this.cellSize);
				let totalWeight = 0;
				let u = 0;
				let v = 0;
				for (const sample of samples) {
					const deltaX = x - sample.x;
					const deltaY = y - sample.y;
					const weight = 1 / Math.pow(deltaX * deltaX + deltaY * deltaY + 1600, 1.15);
					totalWeight += weight;
					u += sample.u * weight;
					v += sample.v * weight;
				}
				u = totalWeight > 0 ? u / totalWeight : 0;
				v = totalWeight > 0 ? v / totalWeight : 0;
				this.field[row * this.columns + column] = {
					u,
					v,
					speed: Math.hypot(u, v)
				};
			}
		}
	}

	private vectorAt(x: number, y: number): WindVector {
		if (this.field.length === 0) return { u: 0, v: 0, speed: 0 };
		const gridX = clamp(x / this.cellSize, 0, this.columns - 1);
		const gridY = clamp(y / this.cellSize, 0, this.rows - 1);
		const left = Math.floor(gridX);
		const top = Math.floor(gridY);
		const right = Math.min(this.columns - 1, left + 1);
		const bottom = Math.min(this.rows - 1, top + 1);
		const mixX = gridX - left;
		const mixY = gridY - top;
		const topLeft = this.field[top * this.columns + left];
		const topRight = this.field[top * this.columns + right];
		const bottomLeft = this.field[bottom * this.columns + left];
		const bottomRight = this.field[bottom * this.columns + right];
		const interpolate = (key: 'u' | 'v') =>
			(topLeft[key] * (1 - mixX) + topRight[key] * mixX) * (1 - mixY) +
			(bottomLeft[key] * (1 - mixX) + bottomRight[key] * mixX) * mixY;
		const u = interpolate('u');
		const v = interpolate('v');
		return { u, v, speed: Math.hypot(u, v) };
	}

	private seedParticles() {
		const particleCount = clamp(Math.round((this.width * this.height) / 1800), 100, 480);
		this.particles = Array.from({ length: particleCount }, () => this.newParticle(true));
	}

	private newParticle(randomAge = false): Particle {
		const maxAge = 70 + Math.random() * 100;
		return {
			x: Math.random() * this.width,
			y: Math.random() * this.height,
			age: randomAge ? Math.random() * maxAge : 0,
			maxAge
		};
	}

	private resetParticle(particle: Particle) {
		Object.assign(particle, this.newParticle());
	}

	private animate = (timestamp: number) => {
		const delta = clamp((timestamp - this.lastFrameTime) / 16.67, 0.4, 2.2);
		this.lastFrameTime = timestamp;
		this.context.globalCompositeOperation = 'destination-out';
		this.context.fillStyle = `rgba(0, 0, 0, ${0.055 * delta})`;
		this.context.fillRect(0, 0, this.width, this.height);
		this.context.globalCompositeOperation = 'source-over';

		const paths = [new Path2D(), new Path2D(), new Path2D()];
		for (const particle of this.particles) {
			if (particle.age >= particle.maxAge) this.resetParticle(particle);
			const vector = this.vectorAt(particle.x, particle.y);
			if (vector.speed < 0.2) {
				this.resetParticle(particle);
				continue;
			}
			const distance = (0.35 + Math.min(60, vector.speed) * 0.04) * delta;
			const nextX = particle.x + (vector.u / vector.speed) * distance;
			const nextY = particle.y + (vector.v / vector.speed) * distance;
			if (nextX < -4 || nextX > this.width + 4 || nextY < -4 || nextY > this.height + 4) {
				this.resetParticle(particle);
				continue;
			}
			const bucket = vector.speed >= 25 ? 2 : vector.speed >= 12 ? 1 : 0;
			paths[bucket].moveTo(particle.x, particle.y);
			paths[bucket].lineTo(nextX, nextY);
			particle.x = nextX;
			particle.y = nextY;
			particle.age += delta;
		}

		const colors = [
			`rgba(103, 232, 249, ${0.48 * this.opacity})`,
			`rgba(224, 242, 254, ${0.72 * this.opacity})`,
			`rgba(196, 181, 253, ${0.86 * this.opacity})`
		];
		paths.forEach((path, index) => {
			this.context.strokeStyle = colors[index];
			this.context.lineWidth = index === 2 ? 1.35 : 1.05;
			this.context.lineCap = 'round';
			this.context.stroke(path);
		});
		this.animationFrame = requestAnimationFrame(this.animate);
	};

	private drawStaticFlow() {
		this.context.strokeStyle = `rgba(224, 242, 254, ${0.7 * this.opacity})`;
		this.context.fillStyle = `rgba(224, 242, 254, ${0.8 * this.opacity})`;
		this.context.lineWidth = 1.25;
		for (let y = 42; y < this.height; y += 68) {
			for (let x = 42; x < this.width; x += 68) {
				const vector = this.vectorAt(x, y);
				if (vector.speed < 0.2) continue;
				const length = 8 + Math.min(18, vector.speed * 0.45);
				const endX = x + (vector.u / vector.speed) * length;
				const endY = y + (vector.v / vector.speed) * length;
				this.context.beginPath();
				this.context.moveTo(x, y);
				this.context.lineTo(endX, endY);
				this.context.stroke();
				this.context.beginPath();
				this.context.arc(endX, endY, 1.8, 0, Math.PI * 2);
				this.context.fill();
			}
		}
	}
}
