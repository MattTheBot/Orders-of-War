import * as THREE from 'three';

export class Terrain {
    constructor(scene) {
        this.scene = scene;
        this.size = 100;
        this.segments = 100;
        this.mesh = null;
        this.contourMesh = null;
        this.generate();
    }

    // Simple pseudo-random noise for continuous terrain
    noise(x, z) {
        return Math.sin(x * 0.05) * Math.cos(z * 0.05) * 2 + 
               Math.sin(x * 0.1) * Math.cos(z * 0.1) * 0.5;
    }

    // Quantize height to create distinct topographic layers
    getSteppedHeight(x, z) {
        let rawHeight = this.noise(x, z);
        // Multiply by 10 to get 10 distinct layers, then divide back down
        let steppedHeight = Math.floor(rawHeight * 10) / 10; 
        return steppedHeight;
    }

    generate() {
        const geometry = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
        geometry.rotateX(-Math.PI / 2); // Lay flat

        const positionAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        
        // Arrays for contour lines
        const contourVertices = [];
        const contourColors = [];

        const colorBottom = new THREE.Color('#2a3b5c');
        const colorTop = new THREE.Color('#7a8fa6');
        const colors = [];

        // Displace vertices
        for (let i = 0; i < positionAttribute.count; i++) {
            vertex.fromBufferAttribute(positionAttribute, i);
            
            // Get stepped height
            const y = this.getSteppedHeight(vertex.x, vertex.z);
            positionAttribute.setY(i, y);

            // Vertex coloring based on height
            const t = (y + 3) / 6; // Normalize height roughly between 0 and 1
            const color = colorBottom.clone().lerp(colorTop, t);
            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        // Material
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true, // Gives it that sharp, stepped look
            roughness: 0.8,
            metalness: 0.2
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        this.generateContours();
    }

    generateContours() {
        // A simple grid-based line generator to simulate contour lines
        const points = [];
        const step = 2; // Density of contour lines
        const levels = [-2, -1, 0, 1, 2]; // Height levels to draw lines at

        // This is a simplified contour generation. 
        // For a full production game, you'd use marching squares algorithm.
        // For V0.1, we'll draw horizontal lines at specific Y heights.
        
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4a5568, transparent: true, opacity: 0.5 });
        
        levels.forEach(level => {
            const levelPoints = [];
            for (let i = -this.size/2; i <= this.size/2; i += step) {
                for (let j = -this.size/2; j <= this.size/2; j += step) {
                    const height = this.getSteppedHeight(i, j);
                    if (Math.abs(height - level) < 0.1) {
                        levelPoints.push(new THREE.Vector3(i, level + 0.01, j)); // +0.01 to avoid z-fighting
                    }
                }
            }
            if (levelPoints.length > 0) {
                const geo = new THREE.BufferGeometry().setFromPoints(levelPoints);
                const lines = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x718096, size: 0.2 }));
                this.scene.add(lines);
            }
        });
    }

    // Raycast helper to get exact height at a given X, Z
    getHeightAt(x, z) {
        return this.getSteppedHeight(x, z);
    }
}
