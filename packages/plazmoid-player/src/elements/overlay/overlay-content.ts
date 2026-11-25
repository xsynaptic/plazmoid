import { overlayBodyModule } from '#elements/overlay/overlay-module.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { openModule } from '#lib/lazy-module.ts';

export class PlayerOverlayContent extends PlayerElement {
	protected connect(signal: AbortSignal): void {
		const context = playerContext(this);

		this.replaceChildren();
		void openModule(overlayBodyModule, {
			onFailure: () => {
				context.view.getState().setOverlayOpen(false);
			},
			onOpen: (connectOverlayBody) => {
				connectOverlayBody(this, context, signal);
			},
			signal,
		});
	}
}
