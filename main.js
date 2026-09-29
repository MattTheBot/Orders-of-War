import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Terrain } from './terrain.js';
import { Unit } from './units.js';

class Game {
    constructor() {
        this.container = document.getElementById('game-container');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#1a202c'); // Dark blue-gray
        this.scene.fog = new THREE.FogExp2('#1a202c', 0.02);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 40, 40);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2.2; // Default limit

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.units = [];
        this.selectedUnit = null;
        this.currentLayer = 'regional';

        this.initLighting();
        this.initWorld();
        this.initEvents();
        this.setLayer('regional');
        
        this.clock = new THREE.Clock();
        this.animate();
    }

    initLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(20, 50, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        this.scene.add(dirLight);
    }

    initWorld() {
        this.terrain = new Terrain(this.scene);

        // Spawn Units
        // Pastel Red Tank
        const tank = new Unit(this.scene, 'tank', new THREE.Vector3(-10, 0, 0), 0xffb3ba);
        tank.mesh.position.y = this.terrain.getHeightAt(-10, 0);
        this.units.push(tank);

        // Pastel Blue Infantry
        const infantry = new Unit(this.scene, 'infantry', new THREE.Vector3(10, 0, 10), 0xbae1ff);
        infantry.mesh.position.y = this.terrain.getHeightAt(10, 10);
        this.units.push(infantry);

        // Pastel Green Infantry
        const infantry2 = new Unit(this.scene, 'infantry', new THREE.Vector3(5, 0, -15), 0xbaffc9);
        infantry2.mesh.position.y = this.terrain.getHeightAt(5, -15);
        this.units.push(infantry2);
    }

    initEvents() {
        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));

        document.getElementById('btn-regional').addEventListener('click', () => this.setLayer('regional'));
        document.getElementById('btn-municipal').addEventListener('click', () => this.setLayer('municipal'));
        document.getElementById('btn-town').addEventListener('click', () => this.setLayer('town'));
    }

    setLayer(layerName) {
        this.currentLayer = layerName;
        
        // Update UI
        document.querySelectorAll('#layer-controls button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`btn-${layerName}`).classList.add('active');

        // Camera constraints based on layer
        if (layerName === 'regional') {
            // Regional: High view, wide angle, free panning
            this.controls.minDistance = 30;
            this.controls.maxDistance = 100;
            this.controls.maxPolarAngle = Math.PI / 2.5; // Can look fairly flat
            this.camera.fov = 45;
        } else if (layerName === 'municipal') {
            // Municipal: Closer, 45 degrees lateral pan restriction
            this.controls.minDistance = 15;
            this.controls.maxDistance = 40;
            // 45 degrees from horizontal means 90 - 45 = 45 degrees polar angle
            this.controls.maxPolarAngle = Math.PI / 4; 
            this.camera.fov = 35;
        } else if (layerName === 'town') {
            // Town: Strict top-down (10-20 degrees lateral pan)
            this.controls.minDistance = 5;
            this.controls.maxDistance = 20;
            // 10-20 degrees from top down. 0 is perfectly top down in OrbitControls.
            this.controls.maxPolarAngle = Math.PI / 2 - 0.3; 
            this.camera.fov = 25;
        }
        
        this.camera.updateProjectionMatrix();
    }

    onPointerDown(event) {
        // Calculate mouse position in normalized device coordinates (-1 to +1)
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // 1. Check if we clicked on a unit
        const unitMeshes = this.units.map(u => u.mesh);
        const unitIntersects = this.raycaster.intersectObjects(unitMeshes, true);

        if (unitIntersects.length > 0) {
            // Find the root unit mesh
            let hitObject = unitIntersects[0].object;
            while (hitObject.parent && !this.units.find(u => u.mesh === hitObject)) {
                hitObject = hitObject.parent;
            }
            const selected = this.units.find(u => u.mesh === hitObject);
            if (selected) {
                this.selectedUnit = selected;
                document.getElementById('selected-unit').textContent = selected.type.toUpperCase();
                document.getElementById('selected-unit').style.color = `#${selected.color.toString(16).padStart(6, '0')}`;
            }
            return;
        }

        // 2. If a unit is selected, check if we clicked on the terrain to move
        if (this.selectedUnit) {
            const terrainIntersects = this.raycaster.intersectObject(this.terrain.mesh);
            if (terrainIntersects.length > 0) {
                const point = terrainIntersects[0].point;
                this.selectedUnit.setTarget(point);
                
                // Update UI info
                const terrainInfo = document.getElementById('terrain-info');
                const height = this.terrain.getHeightAt(point.x, point.z).toFixed(2);
                terrainInfo.textContent = `Target: X:${point.x.toFixed(1)} Z:${point.z.toFixed(1)} (Elev: ${height})`;
            }
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        const delta = this.clock.getDelta();
        
        // Update units
        this.units.forEach(unit => {
            unit.update(delta, this.terrain);
        });

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the game
new Game();
