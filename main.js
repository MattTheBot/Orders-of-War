import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Terrain } from './terrain.js';
import { OSMData } from './osm.js';
import { TerrainGraph } from './pathfinding.js';

class MunicipalLayer {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#141b26');
        this.scene.fog = new THREE.FogExp2('#141b26', 0.008);

        this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
        this.camera.position.set(0, 60, 80);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(innerWidth, innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.maxPolarAngle = Math.PI / 2.5;
        this.controls.minDistance = 30;
        this.controls.maxDistance = 200;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.initLighting();
        this.initWorld();
        this.initEvents();

        this.clock = new THREE.Clock();
        this.animate();
    }

    initLighting() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(40, 80, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -80;
        sun.shadow.camera.right = 80;
        sun.shadow.camera.top = 80;
        sun.shadow.camera.bottom = -80;
        this.scene.add(sun);
    }

    initWorld() {
        this.terrain = new Terrain(this.scene, {
            size: 120,
            segments: 120,
            stepCount: 12,
            heightScale: 7,
        });

        this.graph = new TerrainGraph(this.terrain, { step: 4, radius: 6 });

        // Try to fetch real OSM data for a region.
        // For demo, use a small bbox around a European area.
        this.osm = new OSMData(this.scene);
        this.osm.fetch('48.10,11.50,48.20,11.60').catch(() => {
            console.log('OSM fetch failed — using procedural terrain only.');
        });
    }

    initEvents() {
        addEventListener('resize', () => {
            this.camera.aspect = innerWidth / innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(innerWidth, innerHeight);
        });

        this.renderer.domElement.addEventListener('pointerdown', e => {
            this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / innerHeight) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hits = this.raycaster.intersectObject(this.terrain.mesh);
            if (hits.length > 0) {
                const p = hits[0].point;
                const slope = this.terrain.getSlope(0, 0, p.x, p.z);
                document.getElementById('terrain-info').textContent =
                    `Terrain: X ${p.x.toFixed(1)}  Z ${p.z.toFixed(1)}  ` +
                    `Elev ${p.y.toFixed(2)}  Slope ${slope.toFixed(3)}`;
            }
        });
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

new MunicipalLayer();
