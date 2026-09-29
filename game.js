/**
 * ORDERS OF WAR
 * Municipal & Town Layer Prototype
 * Engine: Three.js
 */

class OrdersOfWar {
    constructor() {
        this.container = document.getElementById('game-container');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#0f141e');
        this.scene.fog = new THREE.FogExp2('#0f141e', 0.003);

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 100, 120);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2.5; // Default Municipal limit
        this.controls.minDistance = 10;
        this.controls.maxDistance = 300;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Game State
        this.terrainMesh = null;
        this.towns = [];
        this.units = [];
        this.currentLayer = 'Municipal';

        this.initLighting();
        this.generateWorld();
        this.initEvents();
        
        this.clock = new THREE.Clock();
        this.animate();
    }

    initLighting() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(80, 150, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.left = -150;
        sun.shadow.camera.right = 150;
        sun.shadow.camera.top = 150;
        sun.shadow.camera.bottom = -150;
        sun.shadow.camera.far = 400;
        this.scene.add(sun);

        // Add a subtle rim light for the tactical map feel
        const rimLight = new THREE.DirectionalLight(0xbae1ff, 0.3);
        rimLight.position.set(-50, 50, -50);
        this.scene.add(rimLight);
    }

    initEvents() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        document.getElementById('btn-regenerate').addEventListener('click', () => {
            this.generateWorld();
        });
    }

    // ── TERRAIN GENERATION (Vienna Basin Proxy) ──
    generateWorld() {
        // Clear existing
        if (this.terrainMesh) this.scene.remove(this.terrainMesh);
        this.towns.forEach(t => this.scene.remove(t.group));
        this.units.forEach(u => this.scene.remove(u.mesh));
        this.towns = [];
        this.units = [];

        this.buildTerrain();
        this.placeProceduralTowns();
        this.spawnInitialUnits();
    }

    buildTerrain() {
        const size = 200;
        const segments = 150; // High resolution for detailed contouring
        const stepCount = 15; // Number of distinct topographic layers

        const geo = new THREE.PlaneGeometry(size, size, segments, segments);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const colors = [];

        const cValley = new THREE.Color('#1a2639'); // Deep river valley
        const cMid = new THREE.Color('#3b5272');    // Rolling hills
        const cHigh = new THREE.Color('#7a8fa6');   // High plateau

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);

            // Mathematical proxy for Vienna Basin / Danube Valley
            // A river valley running through the middle, surrounded by hills
            let rawHeight = 0;
            
            // Base rolling hills (Bavaria/Vienna area)
            rawHeight += Math.sin(x * 0.03) * Math.cos(z * 0.03) * 2.0;
            rawHeight += Math.sin(x * 0.08 + 1.3) * Math.cos(z * 0.06 - 0.5) * 1.0;
            rawHeight += Math.sin(x * 0.15 - 0.8) * Math.cos(z * 0.12 + 0.9) * 0.5;

            // Carve a river valley (The Danube)
            const riverDist = Math.abs(z - Math.sin(x * 0.05) * 20); // River snakes
            if (riverDist < 15) {
                const valleyDepth = (15 - riverDist) / 15;
                rawHeight -= valleyDepth * 4.0; // Deepen the valley
            }

            // Normalize rawHeight to 0-1 range for stepping
            let normalized = (rawHeight + 4) / 8; 
            normalized = Math.max(0, Math.min(1, normalized));

            // Quantize to create stepped contour bands
            const step = Math.floor(normalized * stepCount) / stepCount;
            const y = step * 20; // Max height is 20

            pos.setY(i, y);

            // Vertex Coloring
            const t = y / 20;
            let col;
            if (t < 0.3) {
                col = cValley.clone().lerp(cMid, t / 0.3);
            } else {
                col = cMid.clone().lerp(cHigh, (t - 0.3) / 0.7);
            }
            colors.push(col.r, col.g, col.b);
        }

        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true, // Crucial for the blocky, stepped tactical map look
            roughness: 0.85,
            metalness: 0.1
        });

        this.terrainMesh = new THREE.Mesh(geo, mat);
        this.terrainMesh.receiveShadow = true;
        this.scene.add(this.terrainMesh);
    }

    // ── TOWN GENERATOR ──
    placeProceduralTowns() {
        // Scan the terrain for flat areas suitable for towns
        const size = 200;
        const checkStep = 15; // Check every 15 units
        const candidateLocations = [];

        for (let x = -size/2 + 20; x <= size/2 - 20; x += checkStep) {
            for (let z = -size/2 + 20; z <= size/2 - 20; z += checkStep) {
                // Don't place towns in the river valley (z near 0)
                if (Math.abs(z - Math.sin(x * 0.05) * 20) < 20) continue;

                const h1 = this.getHeightAt(x, z);
                const h2 = this.getHeightAt(x + 5, z);
                const h3 = this.getHeightAt(x, z + 5);

                // If the area is relatively flat (low slope), it's a candidate
                if (Math.abs(h1 - h2) < 1.0 && Math.abs(h1 - h3) < 1.0) {
                    candidateLocations.push({ x, z, h: h1 });
                }
            }
        }

        // Place 3-4 towns randomly from the candidates
        const numTowns = 4;
        for (let i = 0; i < numTowns; i++) {
            if (candidateLocations.length === 0) break;
            const randIndex = Math.floor(Math.random() * candidateLocations.length);
            const loc = candidateLocations.splice(randIndex, 1)[0];
            this.generateTown(loc.x, loc.z);
        }
    }

    generateTown(centerX, centerZ) {
        const townGroup = new THREE.Group();
        const baseY = this.getHeightAt(centerX, centerZ);

        const roadMat = new THREE.LineBasicMaterial({ color: 0xd0d8e0, linewidth: 1, transparent: true, opacity: 0.6 });
        
        // Colors for buildings based on faction
        const buildingMatBlue = new THREE.MeshStandardMaterial({ color: 0xbae1ff, roughness: 0.7, flatShading: true });
        const buildingMatRed = new THREE.MeshStandardMaterial({ color: 0xffb3ba, roughness: 0.7, flatShading: true });

        const isFriendly = Math.random() > 0.5;
        const buildingMat = isFriendly ? buildingMatBlue : buildingMatRed;

        // 1. Main Road
        const mainRoadLength = 40;
        const mainRoadPts = [
            new THREE.Vector3(centerX - mainRoadLength/2, baseY + 0.5, centerZ),
            new THREE.Vector3(centerX + mainRoadLength/2, baseY + 0.5, centerZ)
        ];
        townGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(mainRoadPts), roadMat));

        // 2. Side Roads and Buildings
        const numBlocks = 8;
        const blockSpacing = mainRoadLength / numBlocks;

        for (let i = 1; i < numBlocks; i++) {
            const roadX = centerX - mainRoadLength/2 + (i * blockSpacing);
            
            // Side roads
            const northPts = [new THREE.Vector3(roadX, baseY + 0.5, centerZ), new THREE.Vector3(roadX, baseY + 0.5, centerZ - 15)];
            const southPts = [new THREE.Vector3(roadX, baseY + 0.5, centerZ), new THREE.Vector3(roadX, baseY + 0.5, centerZ + 15)];
            townGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(northPts), roadMat));
            townGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(southPts), roadMat));

            // Place Buildings
            for (let j = 1; j <= 4; j++) {
                this.placeBuilding(townGroup, roadX - 2, centerZ - (j * 3), buildingMat);
                this.placeBuilding(townGroup, roadX + 2, centerZ - (j * 3), buildingMat);
                this.placeBuilding(townGroup, roadX - 2, centerZ + (j * 3), buildingMat);
                this.placeBuilding(townGroup, roadX + 2, centerZ + (j * 3), buildingMat);
            }
        }

        this.scene.add(townGroup);
        this.towns.push({ x: centerX, z: centerZ, group: townGroup, faction: isFriendly ? 'Blue' : 'Red' });
    }

    placeBuilding(parentGroup, x, z, material) {
        const w = 2 + Math.random() * 1.5;
        const d = 2 + Math.random() * 1.5;
        const h = 3 + Math.random() * 4;

        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, material);
        
        const terrainY = this.getHeightAt(x, z);
        mesh.position.set(x, terrainY + h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        parentGroup.add(mesh);
    }

    // ── UNIT SYSTEM ──
    spawnInitialUnits() {
        // Spawn a Blue Tank
        this.createUnit('tank', -60, 60, 0xbae1ff);
        // Spawn a Red Tank
        this.createUnit('tank', 60, -60, 0xffb3ba);
        // Spawn Blue Infantry
        this.createUnit('infantry', -50, 50, 0xbae1ff);
        // Spawn Green Infantry
        this.createUnit('infantry', 0, 80, 0xbaffc9);
    }

    createUnit(type, x, z, color) {
        const y = this.getHeightAt(x, z);
        
        let geo, maxSlope, speed;
        if (type === 'tank') {
            geo = new THREE.BoxGeometry(2, 1.5, 3); // Tank shape
            maxSlope = 0.15; // Tanks only handle flat terrain
            speed = 10;
        } else {
            geo = new THREE.CylinderGeometry(0.8, 0.8, 1.5, 8); // Infantry marker
            maxSlope = 0.6; // Infantry can climb steep hills
            speed = 15;
        }

        const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, metalness: 0.3 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + 1, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Add a directional marker (a small cone on top)
        const markerGeo = new THREE.ConeGeometry(0.3, 0.8, 4);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.y = type === 'tank' ? 1.2 : 1.0;
        marker.rotation.x = Math.PI / 2;
        mesh.add(marker);

        this.scene.add(mesh);

        this.units.push({
            mesh: mesh,
            type: type,
            maxSlope: maxSlope,
            speed: speed,
            target: null,
            path: []
        });
    }

    // ── TERRAIN QUERY ──
    getHeightAt(x, z) {
        if (!this.terrainMesh) return 0;
        // Raycast downwards from high above
        const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
        const hits = raycaster.intersectObject(this.terrainMesh);
        return hits.length > 0 ? hits[0].point.y : 0;
    }

    getSlope(x1, z1, x2, z2) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.001) return 0;
        const dy = Math.abs(this.getHeightAt(x2, z2) - this.getHeightAt(x1, z1));
        return dy / dist;
    }

    // ── LAYER SYSTEM (Camera Constraints) ──
    updateCameraConstraints() {
        const dist = this.camera.position.distanceTo(this.controls.target);
        const layerDisplay = document.getElementById('layer-display');

        if (dist > 80) {
            // MUNICIPAL LAYER: Wide view, 45 degree lateral pan
            if (this.currentLayer !== 'Municipal') {
                this.currentLayer = 'Municipal';
                layerDisplay.textContent = "Municipal Layer (Strategic)";
                layerDisplay.style.color = "#bae1ff";
            }
            this.controls.maxPolarAngle = Math.PI / 2.5; 
            this.controls.minDistance = 30;
            this.controls.maxDistance = 300;
        } else if (dist <= 80 && dist > 30) {
            // TRANSITION ZONE
            this.controls.maxPolarAngle = Math.PI / 3;
            this.controls.minDistance = 15;
            this.controls.maxDistance = 100;
        } else {
            // TOWN LAYER: Strict top-down tactical view (10-20 degrees lateral pan)
            if (this.currentLayer !== 'Town') {
                this.currentLayer = 'Town';
                layerDisplay.textContent = "Town Layer (Tactical)";
                layerDisplay.style.color = "#ffb3ba";
            }
            // 0 is top down. Math.PI/2 is horizontal. 
            // Restrict to roughly 20 degrees from top-down.
            this.controls.maxPolarAngle = Math.PI / 2 - 0.35; 
            this.controls.minDistance = 5;
            this.controls.maxDistance = 40;
        }
    }

    // ── MAIN LOOP ──
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        const delta = this.clock.getDelta();

        // Unit Logic (Basic movement for demonstration)
        this.units.forEach(unit => {
            if (unit.target) {
                const dx = unit.target.x - unit.mesh.position.x;
                const dz = unit.target.z - unit.mesh.position.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                
                if (dist < 0.5) {
                    unit.target = null;
                } else {
                    const dirX = dx / dist;
                    const dirZ = dz / dist;
                    
                    // Check slope before moving
                    const slope = this.getSlope(unit.mesh.position.x, unit.mesh.position.z, unit.mesh.position.x + dirX, unit.mesh.position.z + dirZ);
                    
                    if (slope <= unit.maxSlope) {
                        const moveAmount = unit.speed * delta;
                        unit.mesh.position.x += dirX * moveAmount;
                        unit.mesh.position.z += dirZ * moveAmount;
                        unit.mesh.position.y = this.getHeightAt(unit.mesh.position.x, unit.mesh.position.z) + 1;
                        
                        // Rotate to face target
                        const angle = Math.atan2(dirX, dirZ);
                        unit.mesh.rotation.y = angle;
                    } else {
                        // Slope too steep, stop
                        unit.target = null;
                    }
                }
            }
        });

        this.updateCameraConstraints();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the game when the window loads
window.addEventListener('load', () => {
    new OrdersOfWar();
});
