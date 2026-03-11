// minHeap.js
// Shared heap implementation.
//TODO: store functions in a central helper database

class MinHeap {
	constructor() { this.items = []; }
	push(node) { this.items.push(node); this.bubbleUp(this.items.length - 1); }
	pop() {
		if (!this.items.length) return null;
		const top = this.items[0];
		const last = this.items.pop();
		if (this.items.length) {
			this.items[0] = last;
			this.sinkDown(0);
		}
		return top;
	}
	bubbleUp(i) {
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (this.items[p].cost <= this.items[i].cost) break;
			[this.items[p], this.items[i]] = [this.items[i], this.items[p]];
			i = p;
		}
	}
	sinkDown(i) {
		const n = this.items.length;
		while (true) {
			const l = i * 2 + 1;
			const r = i * 2 + 2;
			let m = i;
			if (l < n && this.items[l].cost < this.items[m].cost) m = l;
			if (r < n && this.items[r].cost < this.items[m].cost) m = r;
			if (m === i) break;
			[this.items[m], this.items[i]] = [this.items[i], this.items[m]];
			i = m;
		}
	}
}
