import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

class TacticalGame {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#141b26');
        this.scene.fog = new THREE.FogExp2('#141b26', 0.005);

        this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
        this.camera.position.set(0, 80, 100);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(innerWidth, innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2.5; // Default Municipal limit

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.terrainMesh = null;
        this.towns = [];
        this.mode = 'town'; // 'town' or 'view'

        this.initLighting();
        this.initEvents();
        this.animate();
    }

    initLighting() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        this.scene.add(sun);
    }

    initEvents() {
        window.addEventListener('resize', () => {
            this.camera.aspect = innerWidth / innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(innerWidth, innerHeight);
        });

        document.getElementById('heightmap-upload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.loadHeightmap(file);
        });

        document.getElementById('btn-mode-town').addEventListener('click', (e) => {
            this.mode = 'town';
            e.target.classList.add('active');
            document.getElementById('btn-mode-view').classList.remove('active');
            document.getElementById('status-text').textContent = "Click on the terrain to generate a town.";
        });

        document.getElementById('btn-mode-view').addEventListener('click', (e) => {
            this.mode = 'view';
            e.target.classList.add('active');
            document.getElementById('btn-mode-town').classList.remove('active');
            document.getElementById('status-text').textContent = "Panning mode. Drag to move, scroll to zoom.";
        });

        this.renderer.domElement.addEventListener('pointerdown', (e) => {
            if (this.mode !== 'town' || !this.terrainMesh) return;

            this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);

            const hits = this.raycaster.intersectObject(this.terrainMesh);
            if (hits.length > 0) {
                const p = hits[0].point;
                this.generateTown(p.x, p.z);
                document.getElementById('status-text').textContent = `Town generated at X:${p.x.toFixed(0)} Z:${p.z.toFixed(0)}`;
            }
        });
    }

    // ── 1. HEIGHTMAP TO STEPPED TERRAIN ──
    loadHeightmap(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, img.width, img.height).data;

                this.buildTerrain(data, img.width, img.height);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    buildTerrain(pixelData, width, height) {
        if (this.terrainMesh) this.scene.remove(this.terrainMesh);

        const size = 120;
        const segments = 120; // Resolution of the 3D mesh
        const stepCount = 12; // Number of distinct contour bands

        const geo = new THREE.PlaneGeometry(size, size, segments, segments);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const colors = [];

        const cLow = new THREE.Color('#1e2d45');
        const cMid = new THREE.Color('#3b5272');
        const cHigh = new THREE.Color('#7a8fa6');

        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vz = pos.getZ(i);

            // Map 3D position to 2D image pixel
            const u = (vx + size / 2) / size;
            const v = (vz + size / 2) / size;
            const px = Math.floor(u * width);
            const py = Math.floor(v * height);
            
            // Read grayscale value (0-255)
            const idx = (py * width + px) * 4;
            let brightness = pixelData[idx] / 255; // 0 (black) to 1 (white)
            if (pixelData[idx] === 0 && pixelData[idx+1] === 0 && pixelData[idx+2] === 0) brightness = 0;

            // Quantize to create stepped contour layers
            const step = Math.floor(brightness * stepCount) / stepCount;
            const y = step * 15; // Max height is 15

            pos.setY(i, y);

            // Color by elevation
            const t = y / 15;
            const col = t < 0.5 
                ? cLow.clone().lerp(cMid, t * 2) 
                : cMid.clone().lerp(cHigh, (t - 0.5) * 2);
            colors.push(col.r, col.g, col.b);
        }

        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true, // Crucial for the blocky look
            roughness: 0.8,
            metalness: 0.1
        });

        this.terrainMesh = new THREE.Mesh(geo, mat);
        this.terrainMesh.receiveShadow = true;
        this.scene.add(this.terrainMesh);
    }

    getHeightAt(x, z) {
        if (!this.terrainMesh) return 0;
        // Raycast downwards to find terrain height
        const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
        const hits = raycaster.intersectObject(this.terrainMesh);
        return hits.length > 0 ? hits[0].point.y : 0;
    }

    // ── 2. PROCEDURAL TOWN GENERATOR ──
    // Adapted from fantasy town generator logic: 
    // Find flat area -> lay main road -> branch side roads -> place buildings.
    generateTown(centerX, centerZ) {
        const townGroup = new THREE.Group();
        const baseY = this.getHeightAt(centerX, centerZ);

        // Check flatness: don't build on steep slopes
        const h1 = this.getHeightAt(centerX + 5, centerZ);
        const h2 = this.getHeightAt(centerX, centerZ + 5);
        if (Math.abs(baseY - h1) > 1.5 || Math.abs(baseY - h2) > 1.5) {
            document.getElementById('status-text').textContent = "Terrain too steep to generate a town here!";
            return;
        }

        const roadMat = new THREE.LineBasicMaterial({ color: 0xd0d8e0, linewidth: 2 });
        const buildingMat = new THREE.MeshStandardMaterial({ 
            color: 0xffb3ba, // Pastel red for buildings
            roughness: 0.6,
            flatShading: true
        });

        // 1. Main Road (Horizontal)
        const mainRoadLength = 30;
        const mainRoadPts = [
            new THREE.Vector3(centerX - mainRoadLength/2, baseY + 0.2, centerZ),
            new THREE.Vector3(centerX + mainRoadLength/2, baseY + 0.2, centerZ)
        ];
        const mainRoadGeo = new THREE.BufferGeometry().setFromPoints(mainRoadPts);
        townGroup.add(new THREE.Line(mainRoadGeo, roadMat));

        // 2. Side Roads (Vertical) and Buildings
        const numBlocks = 6;
        const blockSpacing = mainRoadLength / numBlocks;

        for (let i = 1; i < numBlocks; i++) {
            const roadX = centerX - mainRoadLength/2 + (i * blockSpacing);
            
            // Side road going North
            const northPts = [
                new THREE.Vector3(roadX, baseY + 0.2, centerZ),
                new THREE.Vector3(roadX, baseY + 0.2, centerZ - 10)
            ];
            townGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(northPts), roadMat));

            // Side road going South
            const southPts = [
                new THREE.Vector3(roadX, baseY + 0.2, centerZ),
                new THREE.Vector3(roadX, baseY + 0.2, centerZ + 10)
            ];
            townGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(southPts), roadMat));

            // Place Buildings along side roads
            for (let j = 1; j <= 3; j++) {
                // North side buildings
                this.placeBuilding(townGroup, roadX - 1.5, centerZ - (j * 3), baseY, buildingMat);
                this.placeBuilding(townGroup, roadX + 1.5, centerZ - (j * 3), baseY, buildingMat);
                
                // South side buildings
                this.placeBuilding(townGroup, roadX - 1.5, centerZ + (j * 3), baseY, buildingMat);
                this.placeBuilding(townGroup, roadX + 1.5, centerZ + (j * 3), baseY, buildingMat);
            }
        }

        this.scene.add(townGroup);
        this.towns.push({ x: centerX, z: centerZ, group: townGroup });
    }

    placeBuilding(parentGroup, x, z, y, material) {
        // Randomize building size slightly
        const w = 1.5 + Math.random() * 0.8;
        const d = 1.5 + Math.random() * 0.8;
        const h = 2 + Math.random() * 3;

        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, material);
        
        // Snap building to terrain height
        const terrainY = this.getHeightAt(x, z);
        mesh.position.set(x, terrainY + h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        parentGroup.add(mesh);
    }

    // ── 3. LAYER SYSTEM (MUNICIPAL vs TOWN) ──
    updateCameraConstraints() {
        const dist = this.camera.position.distanceTo(this.controls.target);

        if (dist > 60) {
            // MUNICIPAL LAYER: Wide view, 45 degree lateral pan
            this.controls.maxPolarAngle = Math.PI / 2.5; 
            this.controls.minDistance = 20;
            this.controls.maxDistance = 200;
        } else if (dist <= 40 && dist > 15) {
            // TOWN LAYER (OUTSKIRTS): Restrict view, 45 degree max
            this.controls.maxPolarAngle = Math.PI / 3;
            this.controls.minDistance = 10;
            this.controls.maxDistance = 60;
        } else {
            // TOWN LAYER (STREETS): Strict top-down tactical view (10-20 degrees lateral pan)
            // 0 is perfectly top down. Math.PI/2 is horizontal. 
            // 10 degrees = Math.PI/18. Let's allow up to 20 degrees lateral tilt.
            this.controls.maxPolarAngle = Math.PI / 2 - 0.35; 
            this.controls.minDistance = 5;
            this.controls.maxDistance = 25;
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.updateCameraConstraints();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

new TacticalGame();
