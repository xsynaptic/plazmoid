export function guarded<Value>(listener: (value: Value) => void): (value: Value) => void {
	return (value) => {
		try {
			listener(value);
		} catch (error) {
			reportError(error);
		}
	};
}
