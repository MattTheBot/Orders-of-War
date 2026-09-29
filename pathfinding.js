// Build a visibility graph from sample points across the terrain.
// Nodes are terrain samples; edges connect nearby samples.
// Edge cost = distance * (1 + slopePenalty).

export class TerrainGraph {
    constructor(terrain, options = {}) {
        this.terrain = terrain;
        this.step = options.step || 3;     // sample spacing
        this.radius = options.radius || 5;  // connection radius
        this.nodes = [];
        this.build();
    }

    build() {
        const half = this.terrain.size / 2;
        for (let x = -half; x <= half; x += this.step) {
            for (let z = -half; z <= half; z += this.step) {
                this.nodes.push({
                    x, z,
                    y: this.terrain.getHeightAt(x, z),
                    neighbours: [],
                });
            }
        }
        // Connect nearby nodes
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const dx = this.nodes[j].x - this.nodes[i].x;
                const dz = this.nodes[j].z - this.nodes[i].z;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d <= this.radius) {
                    this.nodes[i].neighbours.push({ node: this.nodes[j], dist: d });
                    this.nodes[j].neighbours.push({ node: this.nodes[i], dist: d });
                }
            }
        }
    }

    // Heuristic: straight-line distance
    heuristic(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
    }

    // Slope-weighted cost between two adjacent nodes
    cost(from, to, unitType = 'infantry') {
        const slope = this.terrain.getSlope(from.x, from.z, to.x, to.z);
        let penalty = 1.0;

        if (unitType === 'tank') {
            if (slope > 0.15) return Infinity; // impassable
            penalty = 1.0 + slope * 8;
        } else {
            penalty = 1.0 + slope * 4;
        }
        return to.dist * penalty;
    }

    findPath(startPos, endPos, unitType = 'infantry') {
        const start = this.nearestNode(startPos.x, startPos.z);
        const goal  = this.nearestNode(endPos.x, endPos.z);
        if (!start || !goal) return [];

        const open = new Set([start]);
        const cameFrom = new Map();
        const gScore = new Map([[start, 0]]);
        const fScore = new Map([[start, this.heuristic(start, goal)]]);

        while (open.size > 0) {
            // Get node with lowest fScore
            let current = null;
            let bestF = Infinity;
            for (const n of open) {
                const f = fScore.get(n) ?? Infinity;
                if (f < bestF) { bestF = f; current = n; }
            }
            if (current === goal) return this.reconstruct(cameFrom, current);
            open.delete(current);

            for (const { node: nb, dist } of current.neighbours) {
                const moveCost = this.cost(current, nb, unitType);
                if (moveCost === Infinity) continue;
                const tentative = (gScore.get(current) ?? Infinity) + moveCost;
                if (tentative < (gScore.get(nb) ?? Infinity)) {
                    cameFrom.set(nb, current);
                    gScore.set(nb, tentative);
                    fScore.set(nb, tentative + this.heuristic(nb, goal));
                    open.add(nb);
                }
            }
        }
        return []; // no path
    }

    nearestNode(x, z) {
        let best = null, bestD = Infinity;
        for (const n of this.nodes) {
            const d = (n.x - x) ** 2 + (n.z - z) ** 2;
            if (d < bestD) { bestD = d; best = n; }
        }
        return best;
    }

    reconstruct(cameFrom, current) {
        const path = [current];
        while (cameFrom.has(current)) {
            current = cameFrom.get(current);
            path.unshift(current);
        }
        return path.map(n => ({ x: n.x, y: n.y, z: n.z }));
    }
}
