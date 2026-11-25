import type { PlayerStore } from '@xsynaptic/plazmoid-core';
import type { SonicButton } from '@xsynaptic/sonic-ui';

import { isAwaitingPlayback, togglePress } from '@xsynaptic/plazmoid-core';

import { buttonPart } from '#elements/button-part.ts';
import { controlOrigin, playbackStore } from '#elements/player-context.ts';
import { legendIcons, renderSonicButton } from '#lib/sonic-button.ts';

interface PlayButtonView {
	isDisabled: boolean;
	isPaused: boolean;
	isWaiting: boolean;
}

export const PlayerPlayButton = buttonPart((element) => ({
	apply: (button: SonicButton, view: PlayButtonView, labels) => {
		button.disabled = view.isDisabled;
		button.legend = view.isPaused ? 'play' : 'pause';
		button.setAttribute('aria-label', view.isPaused ? labels.play : labels.pause);
		button
			.querySelector('.sonic-button-cap')
			?.toggleAttribute('data-pzm-essential-motion', view.isWaiting);
	},
	press: (state: PlayerStore, { report }) => {
		const press = togglePress(state, controlOrigin(element));

		state.togglePaused();
		report(press);
	},
	render: () =>
		renderSonicButton({
			className: 'pzm-button-primary',
			icons: legendIcons(['play', 'pause']),
		}),
	select: selectPlayButton,
	store: playbackStore,
}));

function selectPlayButton(state: PlayerStore): PlayButtonView {
	return {
		isDisabled: state.queue.length === 0,
		isPaused: state.isPaused,
		isWaiting: isAwaitingPlayback(state),
	};
}
