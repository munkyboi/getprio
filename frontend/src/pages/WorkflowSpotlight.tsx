import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './WorkflowSpotlight.css';

gsap.registerPlugin(ScrollTrigger);

const scenes = [
  { title: 'Scan to join', headline: 'Your place starts here.', copy: 'One quick scan. Join the queue from your phone and let your day keep moving.', tag: 'A little scan. A lot less waiting.', status: '✓  You’re in the queue' },
  { title: 'See your place', headline: 'Make the wait your own.', copy: 'Find a seat. Take a breath. Keep an eye on your place without keeping an eye on the counter.', tag: 'Less standing around. More you-time.', status: '03  Your place in line' },
  { title: 'Get alerted', headline: 'A heads-up, right on time.', copy: 'Your phone lets you know when your turn is close. Head back feeling ready.', tag: 'Stay in the moment. Stay in the loop.', status: '↗  You’re up next' },
  { title: 'Get served', headline: 'Your turn. All yours.', copy: 'Walk up when you’re called. A calmer arrival for you, a smoother day for the team.', tag: 'From first scan to a friendly hello.', status: '✓  Ready at the counter' },
];

function Art({ index }: { index: number }) {
  return <div className="wf-art" role="img" aria-label={`Illustration: ${scenes[index].title}`}><img alt="" src="/illustrations/generated/workflow-strip.png" style={{ left: `${index * -100}%` }} /></div>;
}

export default function WorkflowSpotlight() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    const section = root.current;
    if (!section) return;
    const mm = gsap.matchMedia();
    // Static stacked scenes are the default, including reduced motion and short screens.
    mm.add('(min-width: 768px) and (min-height: 650px) and (prefers-reduced-motion: no-preference)', () => {
      section.classList.add('is-pinned');
      const cards = gsap.utils.toArray<HTMLElement>('.wf-scene', section);
      const timeline = gsap.timeline({
        onUpdate: () => setActive(Math.min(3, Math.floor(timeline.time()))),
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=2100',
          pin: true,
          pinSpacing: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      });
      gsap.set(cards.slice(1), { autoAlpha: 0, y: 65 });
      for (let i = 1; i < cards.length; i++) {
        timeline.to(cards[i - 1], { autoAlpha: 0, y: -45, duration: 0.35 }, i);
        timeline.to(cards[i], { autoAlpha: 1, y: 0, duration: 0.65 }, i + 0.1);
      }
      timeline.to({}, { duration: 0.8 });
      timeline.fromTo(section.querySelector('.wf-progress-fill'),
        { scaleX: 0 }, { scaleX: 1, duration: timeline.duration(), ease: 'none' }, 0);
      return () => section.classList.remove('is-pinned');
    }, root);
    let mounted = true;
    void document.fonts.ready.then(() => { if (mounted) ScrollTrigger.refresh(); });
    return () => { mounted = false; mm.revert(); };
  }, []);

  return <>
    {/* A block parent keeps GSAP pin spacing out of the landing page flex stack. */}
    <div className="wf-scroll-shell">
    <section ref={root} className="wf-spotlight" id="workflow" aria-label="How GetPrio works">
      <div className="wf-wrap">
        <header className="wf-header"><div><p className="wf-eyebrow">03 / THE GETPRIO WAY</p><h2>A little less waiting.<br /><em>A little more living.</em></h2></div><p className="wf-intro">From scan to served<br />in four simple moments.<span>Scroll to follow the journey ↓</span></p></header>
        <div className="wf-scenes">{scenes.map((scene, i) => <article className={`wf-scene ${active === i ? 'is-active' : ''}`} key={scene.title}>
          <div className="wf-image"><Art index={i} /><span className="wf-status">{scene.status}</span></div>
          <div className="wf-copy"><div className="wf-step"><span>0{i + 1}</span>{scene.title}</div><h3>{scene.headline}</h3><p>{scene.copy}</p><small>{scene.tag}</small></div>
        </article>)}</div>
        <footer className="wf-footer"><div className="wf-progress"><div className="wf-progress-fill" /></div><span className="wf-counter">0{active + 1} <i>/ 04</i></span><p>Good service starts before your turn.</p><span className="wf-scroll">KEEP SCROLLING ↓</span></footer>
      </div>
    </section>
    </div>
  </>;
}
