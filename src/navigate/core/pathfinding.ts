/**
 * Pathfinding on an 8-connected grid: A* with an octile-distance heuristic.
 *
 * The heuristic is admissible when every edge costs at least its length (true for every mode of
 * the cost model), so the path found is optimal for the given cost field.
 *
 * Searches are cooperative: they pause every `yieldEvery` expansions so a Web Worker can receive a
 * newer request, and stop when the abort signal is raised.
 */

export interface CostGraph {
  readonly cols: number;
  readonly rows: number;
  /** Cost of moving between neighbouring cells (≥ the move's length in cellM units); Infinity = blocked */
  edgeCost(a: number, b: number, diagonal: boolean): number;
}

export interface SearchOptions {
  /** Metres per cell, scales the heuristic (edge costs are in metres) */
  cellM: number;
  signal?: { aborted: boolean };
  yieldEvery?: number;
  /** How to pause between batches; defaults to a macrotask so worker messages can arrive */
  pause?: () => Promise<void>;
}

export interface SearchResult {
  /** Cell indices from start to goal inclusive */
  path: number[];
  cost: number;
  expanded: number;
}

export class AbortedError extends Error {
  constructor() {
    super('Route computation was superseded');
    this.name = 'AbortedError';
  }
}

const defaultPause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Binary min-heap of node ids keyed by float priorities. */
class MinHeap {
  private ids: Int32Array;
  private keys: Float64Array;
  size = 0;
  constructor(capacity: number) {
    this.ids = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
  }
  clear() {
    this.size = 0;
  }
  push(id: number, key: number) {
    if (this.size === this.ids.length) {
      const ids = new Int32Array(this.size * 2);
      const keys = new Float64Array(this.size * 2);
      ids.set(this.ids);
      keys.set(this.keys);
      this.ids = ids;
      this.keys = keys;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.ids[i] = id;
    this.keys[i] = key;
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids[--this.size];
    const lastKey = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= lastKey) break;
      this.ids[i] = this.ids[c];
      this.keys[i] = this.keys[c];
      i = c;
    }
    this.ids[i] = lastId;
    this.keys[i] = lastKey;
    return top;
  }
}

/**
 * Reusable A* search over one grid size. Buffers are allocated once and reset with a generation
 * stamp, so repeated searches (rerouting, multi-leg routes) don't reallocate megabytes each time.
 */
export class Pathfinder {
  readonly cols: number;
  readonly rows: number;
  private g: Float64Array;
  private parent: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private generation = 0;
  private heap: MinHeap;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    const n = cols * rows;
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new MinHeap(1 << 14);
  }

  /** Octile distance between cells, in metres. */
  heuristic(a: number, b: number, cellM: number): number {
    const dx = Math.abs((a % this.cols) - (b % this.cols));
    const dy = Math.abs(Math.floor(a / this.cols) - Math.floor(b / this.cols));
    return cellM * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
  }

  /** Optimal path from start to goal, or null when the goal can't be reached. */
  async search(graph: CostGraph, start: number, goal: number, options: SearchOptions): Promise<SearchResult | null> {
    if (graph.cols !== this.cols || graph.rows !== this.rows) throw new Error('Grid size mismatch');
    const { cellM, signal, yieldEvery = 40000, pause = defaultPause } = options;
    const gen = ++this.generation;
    const { g, parent, stamp, closed, heap, cols, rows } = this;
    heap.clear();

    stamp[start] = gen;
    g[start] = 0;
    parent[start] = -1;
    heap.push(start, this.heuristic(start, goal, cellM));
    let expanded = 0;

    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) {
        const path: number[] = [];
        for (let k = goal; k !== -1; k = parent[k]) path.push(k);
        path.reverse();
        return { path, cost: g[goal], expanded };
      }
      if (++expanded % yieldEvery === 0) {
        await pause();
        if (signal?.aborted) throw new AbortedError();
      }
      const cx = cur % cols;
      const cy = (cur - cx) / cols;
      const gc = g[cur];
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nb = ny * cols + nx;
        if (closed[nb] === gen) continue;
        const w = graph.edgeCost(cur, nb, d >= 4);
        if (!(w < Infinity)) continue;
        const ng = gc + w;
        if (stamp[nb] !== gen || ng < g[nb]) {
          stamp[nb] = gen;
          g[nb] = ng;
          parent[nb] = cur;
          heap.push(nb, ng + this.heuristic(nb, goal, cellM));
        }
      }
    }
    if (signal?.aborted) throw new AbortedError();
    return null;
  }
}

/**
 * Plain Dijkstra over the same graph, used by the tests as an independent reference for A*.
 */
export function dijkstraCost(graph: CostGraph, start: number, goal: number): number {
  const n = graph.cols * graph.rows;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const heap = new MinHeap(256);
  dist[start] = 0;
  heap.push(start, 0);
  while (heap.size > 0) {
    const cur = heap.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === goal) return dist[cur];
    const cx = cur % graph.cols;
    const cy = (cur - cx) / graph.cols;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= graph.cols || ny >= graph.rows) continue;
      const nb = ny * graph.cols + nx;
      const w = graph.edgeCost(cur, nb, d >= 4);
      if (!(w < Infinity)) continue;
      if (dist[cur] + w < dist[nb]) {
        dist[nb] = dist[cur] + w;
        heap.push(nb, dist[nb]);
      }
    }
  }
  return Infinity;
}
