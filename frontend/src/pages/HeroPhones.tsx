import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './HeroPhones.css';

gsap.registerPlugin(ScrollTrigger);
const screens = ['/mobile-app/getprio-ios-join-queue.png', '/mobile-app/Getprio-ss02.png'];

export default function HeroPhones() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = root.current;
    const hero = host?.closest('.lp-hero');
    if (!host || !hero) return;
    let disposed = false;
    let cleanup = () => {};
    void Promise.all([import('three'), import('three/addons/geometries/RoundedBoxGeometry.js')]).then(async ([T, { RoundedBoxGeometry }]) => {
      if (disposed) return;
      let renderer: InstanceType<typeof T.WebGLRenderer>;
      try { renderer = new T.WebGLRenderer({ alpha: true, antialias: true }); } catch { return; }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(32, 1, .1, 100);
      camera.position.set(0, 0, 13);
      const geometries: InstanceType<typeof T.BufferGeometry>[] = [];
      const materials: InstanceType<typeof T.Material>[] = [];
      const textures: InstanceType<typeof T.Texture>[] = [];
      let frame = 0;
      let released = false;
      let trigger: ScrollTrigger | undefined;
      let observer: IntersectionObserver | undefined;
      let resizeObserver: ResizeObserver | undefined;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const state = { rotation: 0 };
      let inView = true;
      let elapsed = 0;
      let lastTime = 0;
      const release = () => {
        if (released) return;
        released = true;
        cancelAnimationFrame(frame); trigger?.kill(); observer?.disconnect(); resizeObserver?.disconnect();
        document.removeEventListener('visibilitychange', wake);
        reduced.removeEventListener('change', motionChange);
        geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
        renderer.dispose(); renderer.domElement.remove(); host.classList.remove('has-3d');
      };
      cleanup = release;
      const phones: InstanceType<typeof T.Group>[] = [];
      function render(time: number) {
        frame = 0;
        if (disposed) return;
        if (lastTime && !reduced.matches) elapsed += Math.min((time - lastTime) / 1000, .05);
        lastTime = time;
        phones.forEach((phone, i) => {
          const phase = elapsed * .55 + i * 1.7;
          phone.position.y = (i ? -.28 : .22) + (reduced.matches ? 0 : Math.sin(phase) * .12);
          phone.rotation.set(reduced.matches ? 0 : Math.sin(phase * .7) * .045,
            (i ? -.18 : .18) + (reduced.matches ? 0 : state.rotation * (i ? -1 : 1) + Math.sin(phase * .65) * .065),
            (i ? -.1 : .1) + (reduced.matches ? 0 : Math.sin(phase) * .025));
        });
        renderer.render(scene, camera);
        if (inView && !document.hidden && !reduced.matches) frame = requestAnimationFrame(render);
      }
      function wake() {
        if (disposed) return;
        lastTime = 0;
        if (!frame && !document.hidden) frame = requestAnimationFrame(render);
      }
      function motionChange() { wake(); }
      try {
        const loaded = await Promise.all(screens.map(async url => {
          const texture = await new T.TextureLoader().loadAsync(url);
          if (disposed || released) { texture.dispose(); return null; }
          textures.push(texture); texture.colorSpace = T.SRGBColorSpace; return texture;
        }));
        if (disposed) return;
        scene.add(new T.HemisphereLight('#ffffff', '#74604b', 2.2));
        const key = new T.DirectionalLight('#fff4e5', 4); key.position.set(-4, 6, 8); scene.add(key);
        const rim = new T.DirectionalLight('#ffffff', 3); rim.position.set(4, 2, -5); scene.add(rim);
        function material(options: ConstructorParameters<typeof T.MeshStandardMaterial>[0]) {
          const m = new T.MeshStandardMaterial(options); materials.push(m); return m;
        }
        function box(w: number, h: number, d: number, radius: number, mat: InstanceType<typeof T.Material>) {
          const geometry = new RoundedBoxGeometry(w, h, d, 5, radius); geometries.push(geometry); return new T.Mesh(geometry, mat);
        }
        loaded.forEach((texture, i) => {
          if (!texture) return;
          const phone = new T.Group(); phones.push(phone); scene.add(phone);
          phone.position.x = i ? 1.03 : -1.03; phone.position.z = i ? -.35 : .2;
          const corner = i ? .085 : .17;
          const frameColor = i ? '#bdb7ad' : '#666762';
          phone.add(box(1.9, 4.04, .19, corner, material({ color: frameColor, metalness: .85, roughness: .28 })));
          const back = box(1.81, 3.95, .035, corner, material({ color: i ? '#d6caba' : '#242522', metalness: .3, roughness: .38 }));
          back.position.z = -.108; phone.add(back);
          // A rounded screen mesh retains the screenshot's full portrait aspect ratio.
          const w = 1.77, h = w * texture.image.height / texture.image.width, r = i ? .055 : .14;
          const shape = new T.Shape();
          shape.moveTo(-w / 2 + r, -h / 2); shape.lineTo(w / 2 - r, -h / 2);
          shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); shape.lineTo(w / 2, h / 2 - r);
          shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); shape.lineTo(-w / 2 + r, h / 2);
          shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); shape.lineTo(-w / 2, -h / 2 + r);
          shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
          const geometry = new T.ShapeGeometry(shape, 24); geometries.push(geometry);
          const pos = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
          for (let v = 0; v < pos.count; v++) uv.setXY(v, (pos.getX(v) + w / 2) / w, (pos.getY(v) + h / 2) / h);
          const screenMat = new T.MeshBasicMaterial({ map: texture, toneMapped: false }); materials.push(screenMat);
          const screen = new T.Mesh(geometry, screenMat); screen.position.z = .102; phone.add(screen);
          const buttons = box(.045, .38, .09, .018, material({ color: '#89857e', metalness: .9, roughness: .25 }));
          buttons.position.set(.96, .7, 0); phone.add(buttons);
          // Distinct silhouettes: iPhone-inspired island and square camera bump,
          // Galaxy-inspired punch hole, squarer corners, and individual rear rings.
          function disc(radius: number, depth: number, x: number, y: number, z: number, color: string) {
            const g = new T.CylinderGeometry(radius, radius, depth, 32); geometries.push(g);
            const lens = new T.Mesh(g, material({ color, metalness: .65, roughness: .18 }));
            lens.rotation.x = Math.PI / 2; lens.position.set(x, y, z); phone.add(lens);
          }
          if (i === 0) {
            const island = box(.43, .105, .018, .05, material({ color: '#070809', roughness: .25 }));
            island.position.set(0, h / 2 - .12, .12); phone.add(island);
            const plate = box(.78, .83, .08, .16, material({ color: '#474a46', metalness: .45, roughness: .32 }));
            plate.position.set(.43, 1.43, -.155); phone.add(plate);
            [[.23, 1.67], [.23, 1.2], [.64, 1.44]].forEach(([x, y]) => {
              disc(.175, .055, x, y, -.22, '#9b9d96');
              disc(.135, .015, x, y, -.255, '#090f1c');
              disc(.06, .006, x - .02, y + .02, -.265, '#203449');
            });
            disc(.055, .012, .66, 1.73, -.205, '#eee3cc');
            const home = box(.55, .025, .009, .01, material({ color: '#292a28' }));
            home.position.set(0, -h / 2 + .045, .12); phone.add(home);
          } else {
            disc(.048, .015, 0, h / 2 - .11, .12, '#070b12');
            [1.59, 1.13, .67].forEach(y => {
              disc(.165, .075, .57, y, -.155, '#777973');
              disc(.13, .012, .57, y, -.2, '#090f18');
              disc(.057, .006, .55, y + .025, -.21, '#203449');
            });
            disc(.045, .012, .19, 1.37, -.135, '#f1e4c8');
          }
          const volume = box(.045, .5, .08, .015, material({ color: frameColor, metalness: .8, roughness: .25 }));
          volume.position.set(i ? .96 : -.96, 1.23, 0); phone.add(volume);

        });
        host.appendChild(renderer.domElement); host.classList.add('has-3d');
        const resize = () => {
          const { width, height } = host.getBoundingClientRect();
          if (!width || !height) return;
          camera.aspect = width / height;
          camera.position.z = Math.max(10.7, 5.15 / (2 * Math.tan(T.MathUtils.degToRad(16)) * camera.aspect));
          camera.updateProjectionMatrix(); renderer.setSize(width, height); wake();
        };
        resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize();
        trigger = ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom top', onUpdate: self => { state.rotation = self.progress * Math.PI * 2; wake(); } });
        state.rotation = trigger.progress * Math.PI * 2;
        observer = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; if (inView) wake(); }, { rootMargin: '100px' }); observer.observe(host);
        document.addEventListener('visibilitychange', wake); reduced.addEventListener('change', motionChange); wake();
      } catch { release(); }
    }).catch(() => { /* Keep both static phones if WebGL is unavailable. */ });
    return () => { disposed = true; cleanup(); };
  }, []);
  return <div className="hero-phones" ref={root} role="img" aria-label="An iPhone-style phone showing a vendor queue and a Samsung Galaxy-style phone showing a confirmed GetPrio ticket">
    <div className="hero-phones-fallback" aria-hidden="true">{screens.map(src => <img src={src} key={src} alt="" />)}</div>
  </div>;
}
