import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './LandingRibbons.css';

gsap.registerPlugin(ScrollTrigger);

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

export default function LandingRibbons() {
  const back = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rearHost = back.current;
    const page = rearHost?.closest('.lp-page');
    if (!rearHost || !page) return;
    rearHost.style.removeProperty('mask-image');
    rearHost.style.removeProperty('clip-path');
    const media = gsap.matchMedia();
    media.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      let disposed = false;
      let cleanup = () => {};
      void import('three').then(THREE => {
        if (disposed) return;
        const renderers: InstanceType<typeof THREE.WebGLRenderer>[] = [];
        try {
          for (const host of [rearHost, rearHost]) {
            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
            renderer.setClearColor(0x000000, 0);
            host.appendChild(renderer.domElement);
            renderers.push(renderer);
          }
        } catch {
          renderers.forEach(r => { r.dispose(); r.domElement.remove(); });
          return;
        }
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(0, innerWidth, 0, innerHeight, -1000, 1000);
        camera.position.z = 500;
        const ambient = new THREE.HemisphereLight('#ffffff', '#ddd8d0', 2.2);
        ambient.layers.enableAll();
        scene.add(ambient);
        const light = new THREE.DirectionalLight('#fff3dd', 3);
        light.position.set(-200, -400, 500);
        light.layers.enableAll();
        scene.add(light);
        const rim = new THREE.DirectionalLight('#ffffff', 2);
        rim.position.set(innerWidth, 300, -200);
        rim.layers.enableAll();
        scene.add(rim);
        const segments = 900;
        const crossSegments = 8;
        const rowSize = crossSegments + 1;
        const ribbons = ['#282729', '#fd7e14'].map((color, index) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segments + 1) * rowSize * 3), 3).setUsage(THREE.DynamicDrawUsage));
          const indices: number[] = [];
          for (let i = 0; i < segments; i++) {
            for (let j = 0; j < crossSegments; j++) {
              const k = i * rowSize + j;
              indices.push(k, k + 1, k + rowSize, k + 1, k + rowSize + 1, k + rowSize);
            }
          }
          geometry.setIndex(indices);
          const material = new THREE.MeshPhysicalMaterial({
            color, roughness: .38, metalness: 0,
            emissive: color, emissiveIntensity: .8,
            clearcoat: .35, clearcoatRoughness: .48,
            sheen: .45, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), .35),
            sheenRoughness: .65, side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.layers.set(index);
          mesh.frustumCulled = false;
          scene.add(mesh);
          return { geometry, material, points: Array.from({ length: segments + 1 }, () => new THREE.Vector3()) };
        });
        const state = { scroll: window.scrollY };
        let targetScroll = state.scroll;
        let frame = 0;
        let lastTime = 0;
        let closingTop = 0;
        const tangent = new THREE.Vector3();
        const flatNormal = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const surfaceNormal = new THREE.Vector3();
        // Geometry is authored in document space and rebuilt only on layout changes.
        // The moving reveal follows the scroll; the route itself never swims around.
        const buildRoute = () => {
          const width = innerWidth, height = innerHeight;
          const bounds = (selector: string) => {
            const el = page.querySelector(selector);
            const rect = el?.getBoundingClientRect();
            return { top: (rect?.top ?? 0) + window.scrollY, height: rect?.height ?? height };
          };
          const hero = bounds('.lp-hero');
          const closing = bounds('.lp-closing');
          closingTop = closing.top;
          const phone = page.querySelector('.lp-hero-visual')?.getBoundingClientRect();
          const phoneX = phone ? phone.left + phone.width / 2 : width * .73;
          const phoneY = hero.top + hero.height * .4;
          const startY = hero.top - height;
          const endY = closing.top + closing.height + height;
          // One continuous curve with continuous curvature. No section detours,
          // straight joins, or tight corners: content is layered above the sweep.
          const amplitude = width * .34;
          const centerX = phoneX - amplitude;
          ribbons.forEach(({ geometry, points }, ribbonIndex) => {
            points.forEach((point, i) => {
              const y = startY + (endY - startY) * i / segments;
              const phase = (y - phoneY) / (height * .92);
              const x = centerX + amplitude * Math.cos(phase);
              const near = .5 + .5 * Math.sin(y / (height * 1.05) - .8);
              point.set(x, y, near * 140 - 70 + ribbonIndex * 8);
            });
            const positions = geometry.getAttribute('position');
            points.forEach((p, i) => {
              tangent.copy(points[Math.min(i + 1, segments)]).sub(points[Math.max(0, i - 1)]).normalize();
              flatNormal.set(-tangent.y, tangent.x, 0).normalize();
              const twist = Math.sin(p.y / height * 1.4) * .4;
              normal.copy(flatNormal).applyAxisAngle(tangent, twist);
              surfaceNormal.crossVectors(tangent, normal).normalize();
              const near = .5 + .5 * Math.sin(p.y / (height * 1.05) - .8);
              const perspectiveScale = .65 + near * 1.25;
              const halfWidth = Math.min(36, width * .027) * perspectiveScale;
              const separation = (ribbonIndex ? -39 : 39) * perspectiveScale;
              for (let j = 0; j <= crossSegments; j++) {
                const across = j / crossSegments * 2 - 1;
                const camber = (1 - across * across) * halfWidth * .18;
                positions.setXYZ(i * rowSize + j,
                  p.x + flatNormal.x * separation + normal.x * halfWidth * across + surfaceNormal.x * camber,
                  p.y + flatNormal.y * separation + normal.y * halfWidth * across + surfaceNormal.y * camber,
                  p.z + normal.z * halfWidth * across + surfaceNormal.z * camber);
              }
            });
            positions.needsUpdate = true;
            geometry.computeVertexNormals();
          });
        };
        const draw = () => {
          const height = innerHeight;
          const arrival = smooth((height * .95 - (closingTop - state.scroll)) / (height * .6));
          // Camera tracks native scroll exactly so the ribbon stays aligned to content.
          camera.position.y = window.scrollY;
          ribbons.forEach(({ geometry, points }, index) => {
            // The leading end starts above the viewport and advances down through
            // the hero before settling into the continuing page-space reveal.
            // Enter promptly, then decelerate toward a visible on-screen tip.
            // Exponential approach has no slow-start dead zone or abrupt speed change.
            const entrance = 1 - Math.exp(-Math.max(0, state.scroll) / (height * .14));
            const lead = -height * .06 + entrance * height * (index ? .78 : .71);
            const endY = state.scroll + lead;
            const end = points.findIndex(p => p.y > endY);
            geometry.setDrawRange(0, (end < 0 ? segments : Math.max(0, end - 1)) * crossSegments * 6);
            const canvas = renderers[index].domElement;
            const near = .5 + .5 * Math.sin((state.scroll + height * .5) / (height * 1.05) - .8);
            const focusBlur = .15 + (1 - near) * 2.5 + arrival * 13;
            const shadowOffset = 7 + near * 22 + arrival * 12;
            const shadowBlur = 9 + near * 23 + arrival * 12;
            canvas.style.filter = `drop-shadow(4px ${shadowOffset.toFixed(1)}px ${shadowBlur.toFixed(1)}px rgba(22, 18, 14, .42)) blur(${focusBlur.toFixed(2)}px)`;
            canvas.style.opacity = '1';
          });
          renderers.forEach((renderer, index) => { camera.layers.set(index); renderer.render(scene, camera); });
        };
        // One frame-rate-independent follower; scroll events never restart easing.
        const tick = (time: number) => {
          frame = 0;
          const dt = lastTime ? Math.min((time - lastTime) / 1000, .1) : 1 / 60;
          lastTime = time;
          state.scroll += (targetScroll - state.scroll) * (1 - Math.exp(-dt / .09));
          if (Math.abs(targetScroll - state.scroll) < .08) state.scroll = targetScroll;
          draw();
          if (state.scroll !== targetScroll) frame = requestAnimationFrame(tick);
          else lastTime = 0;
        };
        const resize = () => {
          buildRoute();
          camera.right = innerWidth; camera.bottom = innerHeight; camera.updateProjectionMatrix();
          renderers.forEach(r => r.setSize(innerWidth, innerHeight));
          draw();
        };
        const updateScroll = () => { targetScroll = window.scrollY; if (!frame) frame = requestAnimationFrame(tick); };
        window.addEventListener('scroll', updateScroll, { passive: true });
        window.addEventListener('resize', resize);
        ScrollTrigger.addEventListener('refresh', resize);
        const observer = new ResizeObserver(resize);
        observer.observe(page);
        page.classList.add('has-ribbons');
        resize();
        cleanup = () => {
          window.removeEventListener('scroll', updateScroll); window.removeEventListener('resize', resize);
          ScrollTrigger.removeEventListener('refresh', resize); observer.disconnect(); cancelAnimationFrame(frame);
          ribbons.forEach(r => { r.geometry.dispose(); r.material.dispose(); });
          renderers.forEach(r => { r.dispose(); r.domElement.remove(); });
          page.classList.remove('has-ribbons');
        };
      }).catch(() => { /* The page remains fully usable without decorative WebGL. */ });
      return () => { disposed = true; cleanup(); };
    });
    return () => media.revert();
  }, []);
  return <div className="lp-ribbons lp-ribbons-back" ref={back} aria-hidden="true" />;
}
