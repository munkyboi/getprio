import { useLayoutEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

export function useLandingMotion(root: RefObject<HTMLDivElement | null>, pricingCount: number) {
  useLayoutEffect(() => {
    const page = root.current;
    if (!page) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const select = gsap.utils.selector(page);
      gsap.from(select('.lp-hero-line > span'), { yPercent: 110, rotate: 3, duration: 1.05, stagger: .12, ease: 'power3.out' });
      gsap.from(select('.lp-hero-copy, .lp-hero-actions'), { opacity: 0, y: 18, duration: .7, stagger: .12, delay: .35 });
      gsap.utils.toArray<HTMLElement>('[data-reveal]', page).forEach(element => {
        gsap.from(element, { y: 35, opacity: 0, duration: .8, ease: 'power2.out', scrollTrigger: { trigger: element, start: 'top 92%', once: true } });
      });
      // Batch items entering together so desktop columns stagger while stacked
      // mobile items wait until they actually enter the viewport.
      gsap.set(select('.lp-feature'), { y: 42, opacity: 0 });
      ScrollTrigger.batch(select('.lp-feature'), {
        start: 'top 90%', once: true,
        onEnter: items => gsap.to(items, { y: 0, opacity: 1, duration: .75, stagger: .14, ease: 'power3.out' }),
      });
      gsap.from(select('.wf-heading-line'), {
        opacity: 0, duration: .9, stagger: .25, ease: 'power2.out',
        scrollTrigger: { trigger: select('.wf-header'), start: 'top 85%', once: true },
      });
      gsap.from(select('[data-closing-reveal]'), {
        y: 30, opacity: 0, duration: .8, stagger: .12, ease: 'power3.out',
        scrollTrigger: { trigger: select('.lp-closing-copy'), start: 'top 85%', once: true },
      });
      gsap.from(select('.lp-closing-art'), {
        scale: .9, opacity: 0, duration: 1.2, ease: 'power3.out', transformOrigin: '50% 60%',
        scrollTrigger: { trigger: select('.lp-closing-art'), start: 'top 90%', once: true },
      });
      gsap.fromTo(select('.lp-manifesto-word'), { opacity: .7 }, { opacity: 1, stagger: .18, ease: 'none', scrollTrigger: { trigger: select('.lp-manifesto'), start: 'top 75%', end: 'bottom 65%', scrub: .5 } });
      gsap.fromTo(select('.lp-closing-logo'), { y: 65, opacity: 0 }, { y: 0, opacity: .22, ease: 'none', scrollTrigger: { trigger: select('.lp-closing-scene'), start: 'top 90%', end: 'center 60%', scrub: .7 } });
      gsap.fromTo(select('.lp-section-rule'), { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: select('#solutions'), start: 'top 85%', end: 'top 30%', scrub: .6 } });
    }, root);
    media.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      const select = gsap.utils.selector(page);
      gsap.to(select('.lp-phone'), { y: -65, rotate: 5, ease: 'none', scrollTrigger: { trigger: select('.lp-hero'), start: 'top top', end: 'bottom top', scrub: .8 } });
      gsap.from(select('.lp-closing-art'), { y: 25, ease: 'none', scrollTrigger: { trigger: select('.lp-closing'), start: 'top bottom', end: 'center center', scrub: .8 } });
    }, root);
    let mounted = true;
    const refresh = () => { if (mounted) ScrollTrigger.refresh(); };
    const images = [...page.querySelectorAll('img')];
    images.forEach(img => img.addEventListener('load', refresh));
    void document.fonts.ready.then(refresh);
    return () => { mounted = false; images.forEach(img => img.removeEventListener('load', refresh)); media.revert(); };
  }, [root]);

  useLayoutEffect(() => {
    if (!root.current || pricingCount === 0) return;
    const media = gsap.matchMedia();
    const cards = [...root.current.querySelectorAll<HTMLElement>('.prio-pricing-card')];
    const grid = cards[0]?.parentElement;
    if (!grid) return;
    media.add('(min-width: 1408px) and (prefers-reduced-motion: no-preference)', () => {
      // The fan opens into the existing grid, so prices and actions settle level.
      gsap.fromTo(cards, {
        x: (_index, card: HTMLElement) => (grid.clientWidth / 2 - card.offsetLeft - card.offsetWidth / 2) * .32,
        y: 110,
        rotation: (index: number) => (index - (cards.length - 1) / 2) * -5,
        scale: .92, opacity: .12, transformOrigin: '50% 100%',
      }, {
        x: 0, y: 0, rotation: 0, scale: 1, opacity: 1,
        stagger: .14, duration: 1, ease: 'power2.out',
        scrollTrigger: { trigger: grid, start: 'top 95%', end: 'top 25%', scrub: .45, invalidateOnRefresh: true },
      });
    });
    media.add('(max-width: 1407px) and (prefers-reduced-motion: no-preference)', () => {
      cards.forEach(card => {
        gsap.fromTo(card, { y: 55, opacity: .15 }, {
          y: 0, opacity: 1, ease: 'none',
          scrollTrigger: { trigger: card, start: 'top 96%', end: 'top 68%', scrub: .3 },
        });
      });
    });
    ScrollTrigger.refresh();
    return () => media.revert();
  }, [root, pricingCount]);
}
