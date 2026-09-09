import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './ConnectedScreensParallax.css';

gsap.registerPlugin(ScrollTrigger);
const artwork = '/illustrations/parallax/connected-layered-static.png';
// Registered RGBA cutouts include reconstructed surfaces behind occluding objects.
const layers = [
  { name: 'background', depth: 12 },
  { name: 'midground', depth: 60 },
  { name: 'foreground', depth: 132 },
];

export default function ConnectedScreensParallax() {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const media = gsap.matchMedia();
    media.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      element.classList.add('is-layered');
      const timeline = gsap.timeline({
        scrollTrigger: { trigger: element, start: 'top bottom', end: 'bottom top', scrub: .85 },
      });
      layers.forEach(layer => {
        timeline.fromTo(element.querySelector(`[data-depth="${layer.name}"]`),
          { y: layer.depth * .5 }, { y: -layer.depth * .5, duration: 1, ease: 'none' }, 0);
      });
      return () => element.classList.remove('is-layered');
    }, root);
    return () => media.revert();
  }, []);

  return <div ref={root} className="connected-parallax" data-reveal role="img" aria-label="GetPrio public queue board, mobile Home showing Emma’s ticket LIM007, and vendor Live queue dashboard, with customers and reception staff">
    <img className="connected-parallax-static" src={artwork} alt="" width="1690" height="931" loading="lazy" />
    <div className="connected-parallax-layers" aria-hidden="true">
      {layers.map(layer => <img
        key={layer.name}
        data-depth={layer.name}
        src={`/illustrations/parallax/connected-${layer.name}.png`}
        width="1690"
        height="931"
        alt=""
        loading="lazy"
      />)}
    </div>
  </div>;
}
