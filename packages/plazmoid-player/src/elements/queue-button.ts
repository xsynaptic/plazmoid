import type { SonicButton } from '@xsynaptic/sonic-ui';

import type { ViewStore } from '#view/view-store.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { trayModule } from '#elements/tray/tray-module.ts';
import { bindButton } from '#lib/bind-button.ts';
import { bindPreload } from '#lib/bind-preload.ts';
import { bindDismiss } from '#lib/dismiss.ts';
import { cloneIcon } from '#lib/icons.ts';
import { openModule } from '#lib/lazy-module.ts';
import { requireChild, template } from '#lib/render.ts';
import { renderSonicButton } from '#lib/sonic-button.ts';
import { supersede } from '#lib/supersede.ts';

interface QueueParts {
	control: HTMLDivElement;
	trigger: SonicButton;
}

const renderControl = template('<div class="pzm-queue"></div>', HTMLDivElement);

const renderPopover = template(
	/* HTML */ `
		<div class="pzm-popover pzm-queue-popover">
			<div class="pzm-header">
				<span class="pzm-header-title"></span><pzm-queue-actions></pzm-queue-actions>
			</div>
			<pzm-tray></pzm-tray>
		</div>
	`,
	HTMLDivElement,
);

export class PlayerQueueButton extends PlayerElement {
	readonly #parts = renderQueueParts();

	protected connect(signal: AbortSignal): void {
		const { labels, store, view } = playerContext(this);
		const { control, trigger } = this.#parts;
		const opened = supersede(signal);

		this.appendOnce(control);
		trigger.setAttribute('aria-label', labels.queue);
		bindPreload({ preload: trayModule.preload, store, trigger }, signal);
		bindDismiss(
			{
				container: control,
				isOpen: () => view.getState().isTrayOpen,
				onDismiss: () => {
					view.getState().setTrayOpen(false);
				},
				trigger,
			},
			signal,
		);
		bindButton(
			{
				apply: (isOpen) => {
					trigger.setAttribute('expanded', String(isOpen));
					opened.cancel();
					if (!isOpen) return;

					const traySignal = opened.next();

					void openModule(trayModule, {
						onFailure: () => {
							view.getState().setTrayOpen(false);
						},
						onOpen: () => {
							showTray(control, labels.queue, traySignal);
						},
						signal: traySignal,
					});
				},
				button: trigger,
				press: (state) => {
					state.toggleTray();
				},
				select: isTrayOpen,
				store: view,
			},
			signal,
		);
	}
}

function isTrayOpen(state: ViewStore): boolean {
	return state.isTrayOpen;
}

function showTray(control: HTMLElement, title: string, signal: AbortSignal): void {
	const popover = renderPopover();

	requireChild(popover, '.pzm-header-title', HTMLElement).textContent = title;
	control.prepend(popover);
	signal.addEventListener(
		'abort',
		() => {
			popover.remove();
		},
		{ once: true },
	);
}

function renderQueueParts(): QueueParts {
	const control = renderControl();
	const trigger = renderSonicButton({ icons: [cloneIcon('queue')] });

	control.append(trigger);

	return { control, trigger };
}
