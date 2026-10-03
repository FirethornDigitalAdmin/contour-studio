import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Settings } from './types';
import { toDrawing, tracingHeight } from './tracing';
export default function TraceSketch({ settings }: {
    settings: Settings;
}) {
    const host = useRef<HTMLDivElement>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const el = host.current;
        if (!el)
            return;
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        }
        catch {
            setError('3D sketch needs WebGL. Your outlines can still be saved and printed.');
            return;
        }
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#e7eae2');
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
        const h = tracingHeight(settings.bounds) / 5;
        const controls = new OrbitControls(camera, renderer.domElement);
        camera.position.set(240, 250, Math.max(230, h));
        controls.target.set(0, 0, 0);
        controls.update();
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        el.appendChild(renderer.domElement);
        renderer.domElement.setAttribute('aria-label', 'Live 3D sketch of added buildings. Drag to rotate.');
        scene.add(new THREE.HemisphereLight(0xffffff, 0x667254, 3));
        const light = new THREE.DirectionalLight(0xffffff, 3);
        light.position.set(50, 200, 100);
        scene.add(light);
        const base = new THREE.Mesh(new THREE.BoxGeometry(200, 3, h), new THREE.MeshStandardMaterial({ color: settings.colour_ground, roughness: 0.85 }));
        base.position.y = -1.5;
        scene.add(base);
        const centreLat = (settings.bounds.north + settings.bounds.south) / 2;
        const span = (settings.bounds.east - settings.bounds.west + 360) % 360;
        const groundWidth = Math.max(1, span * 111320 * Math.max(0.001, Math.cos(centreLat * Math.PI / 180)));
        const inset = settings.frame_mode === 'none' ? 0 : settings.frame_width;
        const printWidth = settings.width - 2 * inset, printHeight = settings.height - 2 * inset;
        for (const b of settings.custom_buildings ?? []) {
            const pts = b.points.map(p => toDrawing(p, settings.bounds));
            if (pts.every(p => p[0] < 0 || p[0] > 1000 || p[1] < 0 || p[1] > h * 5))
                continue;
            const shape = new THREE.Shape();
            pts.forEach((p, i) => { const x = p[0] / 5 - 100, y = h / 2 - p[1] / 5; if (!i)
                shape.moveTo(x, y);
            else
                shape.lineTo(x, y); });
            shape.closePath();
            const groundHeight = groundWidth * tracingHeight(settings.bounds) / 1000;
            const scale = Math.min(printWidth / groundWidth, printHeight / groundHeight);
            const rise = Math.max(settings.building_min_height, b.height * scale * settings.building_exaggeration) * 200 / printWidth;
            const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: rise, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: settings.colour_buildings, roughness: 0.75 }));
            mesh.rotation.x = -Math.PI / 2;
            scene.add(mesh);
        }
        const render = () => renderer.render(scene, camera);
        controls.addEventListener('change', render);
        const resize = new ResizeObserver(() => { camera.aspect = el.clientWidth / Math.max(1, el.clientHeight); camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); render(); });
        resize.observe(el);
        render();
        return () => { resize.disconnect(); controls.dispose(); scene.traverse(o => { if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            for (const m of Array.isArray(o.material) ? o.material : [o.material])
                m.dispose();
        } }); renderer.dispose(); renderer.domElement.remove(); };
    }, [settings.custom_buildings, settings.bounds, settings.width, settings.height, settings.frame_mode, settings.frame_width, settings.colour_ground, settings.colour_buildings, settings.building_min_height, settings.building_exaggeration]);
    return <div className="trace-sketch"><div ref={host} className="trace-sketch-canvas"/>{error && <p>{error}</p>}<small>Live sketch · added buildings on a flat base. Generate the model to see terrain and final print detail.</small></div>;
}
