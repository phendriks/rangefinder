// Bounded, in-memory cache. Reading an entry makes it the most recently used.
class LruCache {
	constructor(maxEntries, maxBytes = Infinity) {
		this.maxEntries = maxEntries;
		this.maxBytes = maxBytes;
		this.entries = new Map();
		this.bytes = 0;
	}
	get(key) {
		const entry = this.entries.get(key);
		if (!entry) return undefined;
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.value;
	}
	set(key, value, bytes = 0) {
		this.delete(key);
		if (bytes > this.maxBytes) return;
		this.entries.set(key, { value, bytes });
		this.bytes += bytes;
		while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
			this.delete(this.entries.keys().next().value);
		}
	}
	delete(key) {
		const entry = this.entries.get(key);
		if (!entry) return;
		this.bytes -= entry.bytes;
		this.entries.delete(key);
	}
	clear() {
		this.entries.clear();
		this.bytes = 0;
	}
}
