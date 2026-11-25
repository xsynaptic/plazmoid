import type { PlayerPress, PlayerStore, QueuedTrack } from '@xsynaptic/plazmoid-core';

import { bind, canMove, togglePress } from '@xsynaptic/plazmoid-core';

import type { PlayerContext } from '#elements/player-context.ts';
import type { RowPress } from '#elements/tray/tray-rows.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { createRowDrag } from '#elements/tray/row-drag.ts';
import { rowPressAt, trayRows } from '#elements/tray/tray-rows.ts';
import { formatTemplate } from '#lib/format.ts';
import { requireChild, requireChildren, template } from '#lib/render.ts';

interface TrayParts {
	empty: HTMLElement;
	list: HTMLUListElement;
	status: HTMLElement;
	tray: HTMLDivElement;
}

const renderTray = template(
	/* HTML */ `
		<div class="pzm-tray">
			<ul class="pzm-tray-list"></ul>
			<p class="pzm-tray-empty"></p>
			<p aria-live="polite" class="pzm-tray-status" role="status"></p>
		</div>
	`,
	HTMLDivElement,
);

export class PlayerTray extends PlayerElement {
	readonly #parts = renderTrayParts();

	protected connect(signal: AbortSignal): void {
		const context = playerContext(this);
		const parts = this.#parts;

		this.appendOnce(parts.tray);
		bindList(parts, context, signal);
		bindReorder(parts, context, signal);
	}
}

function bindList({ empty, list }: TrayParts, context: PlayerContext, signal: AbortSignal): void {
	const { labels, store } = context;

	// A reconnect starts a fresh key map, which would leave the previous connection's rows behind
	list.replaceChildren();
	empty.textContent = labels.empty;

	const render = trayRows(list, labels);

	list.addEventListener(
		'click',
		(event) => {
			const press = rowPressAt(event.target);

			if (press && press.control !== 'handle') pressRow(context, press);
		},
		{ signal },
	);
	bind(
		store,
		selectList,
		({ currentIndex, queue }) => {
			list.hidden = queue.length === 0;
			empty.hidden = queue.length > 0;
			render({ currentIndex, queue });
		},
		signal,
	);
}

function bindReorder(
	{ list, status }: TrayParts,
	{ labels, report, store }: PlayerContext,
	signal: AbortSignal,
): void {
	const move = (from: number, to: number): void => {
		const { queue } = store.getState();
		const trackId = queue[from]?.trackId;

		store.getState().moveTrack(from, to);
		status.textContent = formatTemplate(labels.moved, { position: to + 1, total: queue.length });
		if (trackId !== undefined) report({ action: 'move', from, origin: 'tray', to, trackId });
	};
	const drag = createRowDrag(() => list, move, signal);

	list.addEventListener(
		'keydown',
		(event) => {
			const press = rowPressAt(event.target);
			if (press?.control !== 'handle' || !event.altKey) return;
			if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

			const { queue } = store.getState();
			const from = indexOfQueued(queue, press.queueId);
			const to = event.key === 'ArrowUp' ? from - 1 : from + 1;
			if (!canMove(queue.length, from, to)) return;

			event.preventDefault();
			move(from, to);
		},
		{ signal },
	);
	list.addEventListener(
		'pointerdown',
		(event) => {
			const press = rowPressAt(event.target);
			if (press?.control !== 'handle') return;

			const from = indexOfQueued(store.getState().queue, press.queueId);

			drag.onPointerDown(
				{ clientY: event.clientY, currentTarget: press.button, pointerId: event.pointerId },
				from,
			);
		},
		{ signal },
	);
	list.addEventListener('pointermove', drag.onPointerMove, { signal });
	list.addEventListener('pointerup', drag.onPointerUp, { signal });
	list.addEventListener('pointercancel', drag.onPointerCancel, { signal });
}

function indexOfQueued(queue: ReadonlyArray<QueuedTrack>, queueId: string): number {
	return queue.findIndex((track) => track.queueId === queueId);
}

function pressRow({ report, store }: PlayerContext, { control, queueId }: RowPress): void {
	const state = store.getState();
	const index = indexOfQueued(state.queue, queueId);
	const trackId = state.queue[index]?.trackId;
	if (trackId === undefined) return;

	if (control === 'remove') {
		state.removeAt(index);
		report({ action: 'remove', origin: 'tray', trackId });
		return;
	}

	const press: PlayerPress | undefined =
		index === state.currentIndex
			? togglePress(state, 'tray')
			: { action: 'pick', origin: 'tray', trackId };

	state.playAt(index);
	report(press);
}

function renderTrayParts(): TrayParts {
	const tray = renderTray();
	const [empty, status] = requireChildren(tray, 'p', 2, HTMLParagraphElement);

	return { empty, list: requireChild(tray, 'ul', HTMLUListElement), status, tray };
}

function selectList(state: PlayerStore): Pick<PlayerStore, 'currentIndex' | 'queue'> {
	return { currentIndex: state.currentIndex, queue: state.queue };
}
