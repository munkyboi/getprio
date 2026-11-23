import { useEffect, useRef } from 'react';
import gsap from 'gsap';

// Decorative, rendered on demand: no perpetual animation loop or mobile WebGL.
export default function LandingOrbit({ variant = 'hero' }: { variant?: 'hero' | 'closing' }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const media = gsap.matchMedia();
    media.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      let disposed = false;
      let cleanup = () => {};
      void import('three').then(THREE => {
        if (disposed) return;
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); }
        catch { return; }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
        camera.position.z = 8;
        const geometry = new THREE.TorusGeometry(1.9, variant === 'closing' ? .055 : .24, 24, 100);
        const material = new THREE.MeshStandardMaterial({ color: '#ff8c2d', roughness: .28, metalness: .25 });
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.set(.5, -.65, -.3);
        if (variant === 'closing') {
          const innerRing = new THREE.Mesh(geometry, material);
          innerRing.scale.setScalar(.82);
          innerRing.rotation.set(.7, -.6, .4);
          ring.add(innerRing);
        }
        scene.add(ring, new THREE.HemisphereLight('#fff8e8', '#b74b05', 3));
        const light = new THREE.DirectionalLight('#fff8ec', 5);
        light.position.set(-3, 5, 6);
        scene.add(light);
        element.appendChild(renderer.domElement);
        const render = () => renderer.render(scene, camera);
        const resize = () => {
          if (!element.clientWidth || !element.clientHeight) return;
          renderer.setSize(element.clientWidth, element.clientHeight);
          camera.aspect = element.clientWidth / element.clientHeight;
          camera.updateProjectionMatrix();
          render();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        resize();
        element.classList.add('has-webgl');
        const tween = gsap.to(ring.rotation, {
          x: 1.15, y: .65, z: .5, ease: 'none', onUpdate: render,
          scrollTrigger: { trigger: element.closest(variant === 'closing' ? '.lp-closing' : '.lp-hero'), start: variant === 'closing' ? 'top bottom' : 'top top', end: 'bottom top', scrub: .7 },
        });
        cleanup = () => {
          tween.scrollTrigger?.kill(); tween.kill(); observer.disconnect();
          geometry.dispose(); material.dispose(); renderer.dispose();
          renderer.domElement.remove(); element.classList.remove('has-webgl');
        };
      }).catch(() => { /* The CSS orbit remains visible if WebGL cannot load. */ });
      return () => { disposed = true; cleanup(); };
    });
    return () => media.revert();
  }, [variant]);
  return <div ref={host} className={`lp-orbit${variant === 'closing' ? ' lp-closing-orbit' : ''}`} aria-hidden="true" />;
}
