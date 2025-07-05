import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// Building data now includes a description
const buildingData = [
    { x: -15, z: -10, w: 8, h: 16, d: 8, name: 'Library', description: 'Home to thousands of books and quiet study areas.' },
    { x: 5, z: -20, w: 12, h: 22, d: 10, name: 'Science Hall', description: 'State-of-the-art labs for chemistry, physics, and biology.' },
    { x: 25, z: 0, w: 10, h: 12, d: 15, name: 'Admin Building', description: 'The central hub for all administrative and student services.' },
    { x: -5, z: 20, w: 15, h: 10, d: 10, name: 'Arts Center', description: 'A creative space for visual and performing arts.' },
];

const App = () => {
    const mountRef = useRef(null);
    const [selectedBuilding, setSelectedBuilding] = useState(null);
    const [viewMode, setViewMode] = useState('orbit'); // 'orbit', '2d', 'fps'
    const [isFPSEnabled, setIsFPSEnabled] = useState(false); 

    // Refs to get the latest state inside the animation loop & event listeners
    const viewModeRef = useRef(viewMode);
    useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
    
    const selectedBuildingRef = useRef(selectedBuilding);
    useEffect(() => { selectedBuildingRef.current = selectedBuilding; }, [selectedBuilding]);

    // Ref to store three.js objects and other non-state variables
    const threeRef = useRef({
        renderer: null, scene: null,
        perspectiveCamera: null, orthographicCamera: null,
        orbitControls: null, pointerLockControls: null,
        raycaster: null, mouse: null,
        buildingMeshes: [], hoveredBuilding: null,
        keysPressed: {}, clock: new THREE.Clock(),
        isDragging: false, isMouseDown: false,
        mouseDownPos: new THREE.Vector2(),
        buildingBoundingBoxes: [],
    });

    // Main setup effect, runs only once
    useEffect(() => {
        if (!mountRef.current) return;
        const t = threeRef.current;
        const currentMount = mountRef.current;

        // === CORE SETUP ===
        t.renderer = new THREE.WebGLRenderer({ antialias: true });
        t.scene = new THREE.Scene();
        // t.scene.background = new THREE.Color(0x1a202c);
        // t.scene.background = new THREE.Color(0xf0f2f5);
        t.scene.background = new THREE.Color(0xc0c0c0);
        t.renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        t.renderer.shadowMap.enabled = true;
        currentMount.appendChild(t.renderer.domElement);
        currentMount.style.cursor = 'grab';

        // === CAMERAS ===
        t.perspectiveCamera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        t.perspectiveCamera.position.set(20, 25, 40);
        const aspect = currentMount.clientWidth / currentMount.clientHeight;
        const frustumSize = 50;
        t.orthographicCamera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 1, 1000);
        t.orthographicCamera.position.set(0, 100, 0);
        t.orthographicCamera.lookAt(t.scene.position);

        // === CONTROLS ===
        t.orbitControls = new OrbitControls(t.perspectiveCamera, t.renderer.domElement);
        t.orbitControls.enableDamping = true;
        t.pointerLockControls = new PointerLockControls(t.perspectiveCamera, document.body);
        t.orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;

        // === LIGHTING & GEOMETRY ===
        t.scene.add(new THREE.AmbientLight(0x666666, 1.5));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
        directionalLight.position.set(50, 50, 25);
        directionalLight.castShadow = true;
        t.scene.add(directionalLight);
        
        // const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x2d3748 }));
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xb0bec5 }));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        t.scene.add(ground);

        // const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x718096, emissive: 0x000000 });
        const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x607d8b, emissive: 0x000000 });
        buildingData.forEach(b => {
            const geometry = new THREE.BoxGeometry(b.w, b.h, b.d); 
            const building = new THREE.Mesh(geometry, buildingMaterial.clone());
            building.position.set(b.x, b.h / 2, b.z);
            building.castShadow = true;
            building.receiveShadow = true;
            building.userData = { id: b.name, name: b.name, description: b.description };
            t.scene.add(building);
            t.buildingMeshes.push(building);

            const box = new THREE.Box3().setFromObject(building);
            t.buildingBoundingBoxes.push(box);
        });

        // === INTERACTIVITY SETUP ===
        t.raycaster = new THREE.Raycaster();
        t.mouse = new THREE.Vector2();

        // === EVENT LISTENERS ===
        const onMouseDown = (e) => {
            t.isMouseDown = true;
            t.isDragging = false; 
            t.mouseDownPos.set(e.clientX, e.clientY);
            if (viewModeRef.current !== 'fps') currentMount.style.cursor = 'grabbing';
        };
        const onMouseUp = () => {
            t.isMouseDown = false;
            // **FIX:** The `isDragging` flag is reset here, immediately allowing raycasting to resume.
            t.isDragging = false;
            if (viewModeRef.current !== 'fps') currentMount.style.cursor = 'grab';
        };
        const onMouseMove = (e) => {
            if (t.isMouseDown) t.isDragging = true;
            if (viewModeRef.current === 'fps' && t.pointerLockControls.isLocked) return;
            const rect = t.renderer.domElement.getBoundingClientRect();
            t.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            t.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        };
        const onClick = (e) => {
            const clickPos = new THREE.Vector2(e.clientX, e.clientY);
            if (t.mouseDownPos.distanceTo(clickPos) > 5) return;

            if (e.target.closest('.info-panel')) return;
            if (selectedBuildingRef.current) { setSelectedBuilding(null); return; }
            if (t.hoveredBuilding) setSelectedBuilding(t.hoveredBuilding.userData);
        };
        const onKeyDown = (e) => { t.keysPressed[e.code] = true; };
        const onKeyUp = (e) => { t.keysPressed[e.code] = false; };
        const onPointerLock = () => setIsFPSEnabled(true);
        const onPointerUnlock = () => {
            setIsFPSEnabled(false);
            setViewMode('orbit');
        };

        currentMount.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);
        t.pointerLockControls.addEventListener('lock', onPointerLock);
        t.pointerLockControls.addEventListener('unlock', onPointerUnlock);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('click', onClick);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        // === ANIMATION LOOP ===
        let animationFrameId;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const delta = t.clock.getDelta();
            
            if (viewModeRef.current === 'orbit' || viewModeRef.current === '2d') {
                t.orbitControls.update();
            } else if (viewModeRef.current === 'fps' && t.pointerLockControls.isLocked) {
                updateFPSMovement(delta);
            }
            
            updateRaycasting();

            const currentCamera = viewModeRef.current === '2d' ? t.orthographicCamera : t.perspectiveCamera;
            t.renderer.render(t.scene, currentCamera);
        };
        
        // === COLLISION DETECTION & MOVEMENT LOGIC ===
        const checkCollision = (moveVec) => {
            const playerPos = t.perspectiveCamera.position;
            const playerBox = new THREE.Box3(
                new THREE.Vector3(playerPos.x - 1, playerPos.y - 1, playerPos.z - 1),
                new THREE.Vector3(playerPos.x + 1, playerPos.y, playerPos.z + 1)
            );
            playerBox.translate(moveVec);
            for (const buildingBox of t.buildingBoundingBoxes) {
                if (playerBox.intersectsBox(buildingBox)) {
                    return true;
                }
            }
            return false;
        };

        const updateFPSMovement = (delta) => {
            const moveSpeed = 20 * delta;
            const forwardVector = new THREE.Vector3();
            t.pointerLockControls.getDirection(forwardVector);
            forwardVector.y = 0;
            forwardVector.normalize();

            const rightVector = new THREE.Vector3().crossVectors(t.perspectiveCamera.up, forwardVector).normalize();

            let moveZ = 0;
            let moveX = 0;

            if (t.keysPressed['KeyW'] || t.keysPressed['ArrowUp']) moveZ = 1;
            if (t.keysPressed['KeyS'] || t.keysPressed['ArrowDown']) moveZ = -1;
            if (t.keysPressed['KeyA'] || t.keysPressed['ArrowLeft']) moveX = 1;
            if (t.keysPressed['KeyD'] || t.keysPressed['ArrowRight']) moveX = -1;
            
            const moveVecZ = new THREE.Vector3().copy(forwardVector).multiplyScalar(moveZ * moveSpeed);
            const moveVecX = new THREE.Vector3().copy(rightVector).multiplyScalar(moveX * moveSpeed);

            if (!checkCollision(moveVecZ)) {
                t.perspectiveCamera.position.add(moveVecZ);
            }
            if (!checkCollision(moveVecX)) {
                t.perspectiveCamera.position.add(moveVecX);
            }
        };

        const updateRaycasting = () => {
            if (t.isDragging) {
                if (t.hoveredBuilding) {
                    t.hoveredBuilding.material.emissive.setHex(0x000000);
                    t.hoveredBuilding = null;
                }
                return;
            }

            const currentView = viewModeRef.current;
            if (currentView === 'fps' && t.pointerLockControls.isLocked) {
                t.raycaster.setFromCamera({ x: 0, y: 0 }, t.perspectiveCamera);
            } else if (currentView !== 'fps') {
                const cam = currentView === '2d' ? t.orthographicCamera : t.perspectiveCamera;
                t.raycaster.setFromCamera(t.mouse, cam);
            } else { return; }

            const intersects = t.raycaster.intersectObjects(t.buildingMeshes);
            if (intersects.length > 0) {
                const first = intersects[0].object;
                if (t.hoveredBuilding !== first) {
                    if (t.hoveredBuilding) t.hoveredBuilding.material.emissive.setHex(0x000000);
                    t.hoveredBuilding = first;
                    t.hoveredBuilding.material.emissive.setHex(0xffeb3b);
                }
                currentMount.style.cursor = 'pointer';
            } else {
                if (t.hoveredBuilding) t.hoveredBuilding.material.emissive.setHex(0x000000);
                t.hoveredBuilding = null;
                currentMount.style.cursor = currentView === 'fps' ? 'default' : 'grab';
            }
        };

        animate();
        
        const handleResize = () => {
            if (currentMount) {
                const w = currentMount.clientWidth;
                const h = currentMount.clientHeight;
                t.renderer.setSize(w, h);
                t.perspectiveCamera.aspect = w / h;
                t.perspectiveCamera.updateProjectionMatrix();
                const aspect = w / h;
                t.orthographicCamera.left = frustumSize * aspect / -2;
                t.orthographicCamera.right = frustumSize * aspect / 2;
                t.orthographicCamera.updateProjectionMatrix();
            }
        };
        window.addEventListener('resize', handleResize);
        
        return () => {
            cancelAnimationFrame(animationFrameId);
            currentMount.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('click', onClick);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('resize', handleResize);
            if (t.pointerLockControls) {
                t.pointerLockControls.removeEventListener('lock', onPointerLock);
                t.pointerLockControls.removeEventListener('unlock', onPointerUnlock);
                t.pointerLockControls.dispose();
            }
            if (t.orbitControls) t.orbitControls.dispose();
            if (currentMount && t.renderer) currentMount.removeChild(t.renderer.domElement);
            t.renderer.dispose();
        };
    }, []);

    // Effect to handle view mode changes
    useEffect(() => {
        const t = threeRef.current;
        if (!t.orbitControls || !mountRef.current) return;
        
        const currentMount = mountRef.current;
        t.orbitControls.enabled = false;
        
        if (viewMode === 'orbit') {
            t.orbitControls.enabled = true;
            t.orbitControls.object = t.perspectiveCamera;
            t.perspectiveCamera.position.set(20, 25, 40);
            t.orbitControls.target.set(0, 0, 0);
            t.orbitControls.enableRotate = true;
            t.orbitControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
            t.orbitControls.touches.ONE = THREE.TOUCH.ROTATE;
            t.orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
            currentMount.style.cursor = 'grab';
            if (t.pointerLockControls.isLocked) t.pointerLockControls.unlock();

        } else if (viewMode === '2d') {
            t.orbitControls.enabled = true;
            t.orbitControls.object = t.orthographicCamera;
            t.orthographicCamera.position.set(0, 100, 0);
            t.orthographicCamera.lookAt(t.scene.position);
            t.orbitControls.target.set(0, 0, 0);
            t.orbitControls.enableRotate = false; 
            t.orbitControls.mouseButtons.LEFT = THREE.MOUSE.PAN; 
            t.orbitControls.touches.ONE = THREE.TOUCH.PAN; 
            t.orbitControls.maxPolarAngle = Math.PI;
            currentMount.style.cursor = 'grab';
            if (t.pointerLockControls.isLocked) t.pointerLockControls.unlock();

        } else if (viewMode === 'fps') {
            t.perspectiveCamera.position.set(0, 5, 50);
            currentMount.style.cursor = 'default';
        }
        
        t.orbitControls.update();
    }, [viewMode]);

    return (
        <div className="w-screen h-screen bg-gray-900 text-white flex flex-col relative overflow-hidden">
            <div ref={mountRef} className="w-full h-full" />
            
            {/* UI Overlays */}
            <div className="absolute top-0 left-0 p-4 z-10 w-full flex justify-between items-start pointer-events-none">
                <div className="pointer-events-auto">
                    <h1 className="text-xl md:text-2xl font-bold">Campus Map</h1>
                    <p className="text-sm text-gray-300">View: <span className="font-semibold text-yellow-300">{viewMode.toUpperCase()}</span></p>
                </div>
                <div className="flex gap-2 bg-gray-800/70 p-2 rounded-lg pointer-events-auto backdrop-blur-sm">
                    <button onClick={() => setViewMode('orbit')} className={`cursor-pointer px-3 py-1 rounded ${viewMode === 'orbit' ? 'bg-yellow-500 text-black' : 'bg-gray-800 hover:bg-gray-500'} transition-colors`}>3D</button>
                    <button onClick={() => setViewMode('2d')} className={`cursor-pointer px-3 py-1 rounded ${viewMode === '2d' ? 'bg-yellow-500 text-black' : 'bg-gray-800 hover:bg-gray-500'} transition-colors`}>2D</button>
                    <button onClick={() => setViewMode('fps')} className={`cursor-pointer px-3 py-1 rounded ${viewMode === 'fps' ? 'bg-yellow-500 text-black' : 'bg-gray-800 hover:bg-gray-500'} transition-colors`}>FPS</button>
                </div>
            </div>

            <div 
                className={`info-panel absolute top-0 right-0 h-full w-full max-w-sm bg-gray-800/70 backdrop-blur-sm shadow-2xl p-8 z-20 transition-transform duration-300 ease-in-out transform ${selectedBuilding ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {selectedBuilding && (
                    <div key={selectedBuilding.id}>
                        <div className="flex justify-between items-start mb-4">
                            <h2 className="text-2xl font-bold text-yellow-300">{selectedBuilding.name}</h2>
                            <button onClick={() => setSelectedBuilding(null)} className="text-gray-400 hover:text-white transition-colors text-3xl leading-none">&times;</button>
                        </div>
                        <p className="text-gray-200">{selectedBuilding.description}</p>
                    </div>
                )}
            </div>
            
            {viewMode === 'fps' && !isFPSEnabled && (
                <div onClick={() => threeRef.current.pointerLockControls.lock()} className="absolute inset-0 bg-black/40 flex justify-center items-center z-30 cursor-pointer">
                    <div className="text-center">
                        <h2 className="text-3xl font-bold">First-Person View</h2>
                        <p className="mt-2 text-lg">Click to enter and explore</p>
                        <p className="mt-4 text-sm text-gray-400">Use WASD to move, Mouse to look, and ESC to exit.</p>
                    </div>
                </div>
            )}

            {viewMode === 'fps' && isFPSEnabled && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 z-20 pointer-events-none">
                    <div className="w-full h-[2px] bg-white bg-opacity-75 absolute top-1/2 -translate-y-1/2"></div>
                    <div className="h-full w-[2px] bg-white bg-opacity-75 absolute left-1/2 -translate-x-1/2"></div>
                </div>
            )}
        </div>
    );
};

export default App;
