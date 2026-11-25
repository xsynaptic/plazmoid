import { SonicWaveform } from '@xsynaptic/sonic-ui';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { scopeSurfaceModule } from '#elements/scope/scope-module.ts';
import { LazyModuleError } from '#lib/lazy-module.ts';
import { landDetail, mount, sampleTrack } from '#test/mount.ts';
import { sampleWaveform } from '#test/wavedata.ts';

function mountPlaying(width: number) {
	Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
		configurable: true,
		value: width,
	});

	const mounted = mount('pzm-scope');

	mounted.store.getState().playTrack([sampleTrack('a')], 'a');

	return mounted;
}

function traced(part: HTMLElement): Promise<SonicWaveform> {
	return vi.waitFor(() => {
		const waveform = part.querySelector('sonic-waveform');

		if (!(waveform instanceof SonicWaveform)) throw new TypeError('The scope has no waveform yet');

		return waveform;
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
	Reflect.deleteProperty(HTMLDivElement.prototype, 'clientWidth');
});

describe('<pzm-scope>', () => {
	test('holds no waveform until it plays, then scrolls an inert one only while playing', async () => {
		const { fake, part } = mountPlaying(96);

		await scopeSurfaceModule.load();

		expect(part.querySelector('sonic-waveform')).toBeNull();

		fake.callbacks.current?.onStatus('playing');

		const waveform = await traced(part);

		expect(waveform.inert).toBe(true);
		expect(waveform.playing).toBe(true);

		fake.callbacks.current?.onStatus('paused');

		expect(waveform.playing).toBe(false);
	});

	test('a press stops the trace once it has faded, and a second press starts it again', async () => {
		const { fake, part } = mountPlaying(96);

		fake.callbacks.current?.onStatus('playing');

		const waveform = await traced(part);

		vi.spyOn(HTMLDivElement.prototype, 'getAnimations').mockReturnValue([new Animation()]);

		part.querySelector('button')?.click();

		expect(waveform.playing).toBe(true);

		part.querySelector('.pzm-scope-trace')?.dispatchEvent(new Event('transitionend'));

		expect(waveform.playing).toBe(false);

		part.querySelector('button')?.click();

		expect(waveform.playing).toBe(true);
	});

	test('draws the loaded track from its peaks with its body and its bands', async () => {
		const { fake, part, store } = mountPlaying(96);

		landDetail(store, 'a', {
			waveform: sampleWaveform('scope', { bands: { medians: [180, 140, 100] } }),
		});
		fake.callbacks.current?.onStatus('playing');

		const waveform = await traced(part);

		expect(waveform.peaks?.pairsPerSecond).toBe(100);
		expect(waveform.peaks?.rms).toHaveLength(20_000);
		expect(waveform.bands?.medians).toEqual([180, 140, 100]);
	});

	test('a press stops the trace at once where the skin runs no fade', async () => {
		const { fake, part } = mountPlaying(96);

		fake.callbacks.current?.onStatus('playing');

		const waveform = await traced(part);

		part.querySelector('button')?.click();

		expect(waveform.playing).toBe(false);
	});

	test('turns itself off and reports once when its chunk fails, and a press loads it again', async () => {
		const offline = new LazyModuleError('scope', 'offline');
		const reportError = vi.fn();

		vi.spyOn(scopeSurfaceModule, 'load').mockRejectedValueOnce(offline);
		vi.stubGlobal('reportError', reportError);

		const { fake, part } = mountPlaying(96);
		const toggle = part.querySelector('button');

		fake.callbacks.current?.onStatus('playing');

		await vi.waitFor(() => {
			expect(toggle?.getAttribute('aria-pressed')).toBe('false');
		});

		fake.callbacks.current?.onStatus('paused');
		fake.callbacks.current?.onStatus('playing');
		await Promise.resolve();

		expect(reportError).toHaveBeenCalledExactlyOnceWith(offline);

		toggle?.click();

		const waveform = await traced(part);

		expect(waveform.playing).toBe(true);
	});

	test('loads nothing while it has no width', async () => {
		const { fake, part } = mountPlaying(0);

		fake.callbacks.current?.onStatus('playing');
		await scopeSurfaceModule.load();
		await Promise.resolve();

		expect(part.querySelector('sonic-waveform')).toBeNull();
	});
});
