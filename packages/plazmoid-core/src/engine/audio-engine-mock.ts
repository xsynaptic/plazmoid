import type { Mock } from 'vitest';

import { vi } from 'vitest';

import type { AudioEngine, AudioEngineCallbacks, CreateAudioEngine } from '#engine/audio-engine.ts';

// Members as properties, not methods, so a test can hand one to `expect` unbound
type MockedEngine = {
	[Key in keyof AudioEngine]: AudioEngine[Key] extends (
		...parameters: infer Parameters
	) => infer Result
		? Mock<(...parameters: Parameters) => Result>
		: AudioEngine[Key];
};

export interface MockEngine {
	callbacks: { current: AudioEngineCallbacks | undefined };
	createEngine: CreateAudioEngine;
	engine: MockedEngine;
	setTime: (seconds: number) => void;
}

// Annotated because the inferred type names a private vitest chunk, which a published declaration cannot
export function createMockEngine(): MockEngine {
	let time = 0;
	const callbacks: MockEngine['callbacks'] = { current: undefined };
	const engine: MockedEngine = {
		canPlay: vi.fn(() => true),
		currentTime: vi.fn(() => time),
		element: document.createElement('audio'),
		load: vi.fn(() => Promise.resolve()),
		pause: vi.fn(),
		play: vi.fn(() => Promise.resolve()),
		reset: vi.fn(() => {
			time = 0;
		}),
		seek: vi.fn((seconds: number) => {
			time = seconds;
		}),
		setMuted: vi.fn(),
		setVolume: vi.fn(),
	};

	const createEngine: CreateAudioEngine = (given) => {
		callbacks.current = given;

		return engine;
	};

	return {
		callbacks,
		createEngine,
		engine,
		setTime: (seconds: number) => {
			time = seconds;
		},
	};
}
