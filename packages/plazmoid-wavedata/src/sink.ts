type Block = Float64Array<ArrayBuffer> | Uint8Array<ArrayBuffer>;

const firstBlockLength = 4096;

// A typed array that grows, since a stream's length is unknown until it ends
export function createSink<T extends Block>(allocate: (length: number) => T) {
	let block = allocate(firstBlockLength);
	let length = 0;

	return {
		add: (value: number): void => {
			if (length === block.length) {
				const next = allocate(length * 2);

				next.set(block);
				block = next;
			}

			block[length] = value;
			length += 1;
		},
		get length() {
			return length;
		},
		read: (): T => block,
	};
}
