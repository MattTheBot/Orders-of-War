import * as THREE from 'three';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

export class OSMData {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        scene.add(this.group);
    }

    // Fetch roads and places within a bounding box.
    async fetch(bbox) {
        const query = `
            [out:json][timeout:25];
            (
                way["highway"~"primary|secondary|tertiary|motorway"](${bbox});
                node["place"~"city|town|village"](${bbox});
                way["waterway"~"river|stream"](${bbox});
            );
            out body;
            >;
            out skel qt;
        `;

        const resp = await fetch(OVERPASS, {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
        });
        const data = await resp.json();
        this.render(data);
    }

    render(data) {
        const nodes = {};
        data.elements.filter(e => e.type === 'node').forEach(n => {
            nodes[n.id] = { x: n.lon, y: n.lat };
        });

        // Convert lon/lat to local XY (simplified equirectangular)
        const refLon = data.elements.find(e => e.type === 'node')?.lon || 0;
        const refLat = data.elements.find(e => e.type === 'node')?.lat || 0;
        const cosLat = Math.cos(refLat * Math.PI / 180);
        const scale = 111320; // metres per degree

        const toXY = (lon, lat) => ({
            x: (lon - refLon) * cosLat * scale,
            z: -(lat - refLat) * scale,
        });

        // ── Roads ──
        const roadMat = new THREE.LineBasicMaterial({ color: 0xd0d8e0, linewidth: 1 });
        data.elements.filter(e => e.type === 'way' && e.tags?.highway).forEach(way => {
            const pts = way.nodes.map(id => {
                const n = nodes[id];
                if (!n) return null;
                const p = toXY(n.x, n.y);
                return new THREE.Vector3(p.x, 0.3, p.z);
            }).filter(Boolean);

            if (pts.length < 2) return;
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            this.group.add(new THREE.Line(geo, roadMat));
        });

        // ── Cities ──
        const cityMat = new THREE.MeshBasicMaterial({ color: 0xbae1ff });
        data.elements.filter(e => e.type === 'node' && e.tags?.place).forEach(node => {
            const p = toXY(node.lon, node.lat);
            const marker = new THREE.Mesh(
                new THREE.CircleGeometry(8, 16),
                cityMat
            );
            marker.rotation.x = -Math.PI / 2;
            marker.position.set(p.x, 0.5, p.z);
            this.group.add(marker);
        });
    }
}
