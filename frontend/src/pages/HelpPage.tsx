import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IconSearch, IconArrowRight, IconX } from '@tabler/icons-react';
import { helpArticles, helpFaqs, helpTopics, searchHelpArticles } from './helpContent';
import './HelpPage.css';

const articleUrl = (id: string) => `/help?article=${encodeURIComponent(id)}`;
const topicUrl = (id: string) => `/help?topic=${encodeURIComponent(id)}`;

function ContactHelp() {
  return (
    <div className="hp-contact">
      <div>
        <span className="hp-eyebrow">A HUMAN CAN HELP, TOO</span>
        <h2>Still need a hand?</h2>
        <p>Contact the business for visit details. Come to us for account or app issues.</p>
      </div>
      <Link to="/contact">Contact GetPrio <IconArrowRight size={18} aria-hidden="true" /></Link>
    </div>
  );
}

export default function HelpPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const selectedTopic = params.get('topic') || '';
  const selectedArticle = params.get('article') || '';
  const topic = helpTopics.find(item => item.id === selectedTopic);
  const article = helpArticles.find(item => item.id === selectedArticle);
  const heading = useRef<HTMLHeadingElement>(null);
  const missing = Boolean((selectedArticle && !article) || (selectedTopic && !topic));
  const results = searchHelpArticles(query, topic?.id);
  const browsing = !query.trim() && !topic;

  useEffect(() => {
    document.title = `${article?.title || topic?.title || 'Help Center'} | GetPrio`;
    return () => { document.title = 'GetPrio'; };
  }, [article, topic]);

  useEffect(() => {
    if (selectedArticle || selectedTopic) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'start' });
    }
  }, [selectedArticle, selectedTopic]);

  function changeQuery(value: string) {
    const next = new URLSearchParams();
    if (value) next.set('q', value);
    setParams(next, { replace: true });
  }

  return (
    <div className="hp">
      <div className="hp-wrap">
        {missing ? (
          <section className="hp-empty">
            <h1 ref={heading} tabIndex={-1}>We couldn’t find that guide.</h1>
            <p>Browse the Help Center or contact our team for a hand.</p>
            <Link to="/help">Browse all topics →</Link>
            <Link to="/contact">Contact support →</Link>
          </section>
        ) : article ? (
          <>
            <nav className="hp-breadcrumb" aria-label="Breadcrumb">
              <Link to="/help">Help Center</Link><span aria-hidden="true">/</span>
              <Link to={topicUrl(article.topic)}>{helpTopics.find(item => item.id === article.topic)?.title}</Link>
            </nav>
            <div className="hp-reading">
              <article>
                <span className="hp-eyebrow">GETPRIO GUIDE</span>
                <h1 ref={heading} tabIndex={-1}>{article.title}</h1>
                <p className="hp-intro">{article.intro}</p>
                <ol>{article.steps.map(step => <li key={step}>{step}</li>)}</ol>
                <aside className="hp-note"><strong>Good to know</strong><p>{article.note}</p></aside>
                {article.link && <Link className="hp-inline-link" to={article.link} reloadDocument={article.link.includes('#')}>{article.linkLabel} →</Link>}
                <div><Link className="hp-feedback-link" to="/contact">Still have a question? Contact support →</Link></div>
              </article>
              <aside className="hp-related" aria-label="Related help">
                <span className="hp-eyebrow">KEEP EXPLORING</span>
                {helpArticles.filter(item => item.topic === article.topic && item.id !== article.id).map(item => (
                  <Link key={item.id} to={articleUrl(item.id)}>{item.title} →</Link>
                ))}
                <Link to="/contact">Talk to our team →</Link>
                <Link to="/privacy-policy">Privacy Policy</Link>
                <Link to="/terms">Terms of Service</Link>
              </aside>
            </div>
          </>
        ) : (
          <>
            <header className="hp-hero">
              <span className="hp-eyebrow">THE GETPRIO HELP CENTER</span>
              <h1>A little guidance.<br /><em>A smoother day.</em></h1>
              <p>Find answers, get unstuck, and get on with your day.</p>
              <div className="hp-search" role="search">
                <IconSearch size={21} aria-hidden="true" />
                <input type="search" aria-label="Search help articles" placeholder="Search queues, bookings, payments…" value={query} onChange={event => changeQuery(event.target.value)} />
                {query ? <button aria-label="Clear search" onClick={() => changeQuery('')}><IconX size={18} aria-hidden="true" /></button> : <kbd aria-hidden="true">SEARCH</kbd>}
              </div>
              <div className="hp-quick">Popular:
                <Link to={articleUrl('join')}>Joining a queue</Link>
                <Link to={articleUrl('refund')}>Refunds</Link>
                <Link to={articleUrl('signin')}>Sign-in help</Link>
              </div>
            </header>
            {browsing ? (
              <>
                <div className="hp-section-head"><h2>What can we help with?</h2><span>START WITH A TOPIC</span></div>
                <div className="hp-grid">
                  {helpTopics.map(({ id, title, description, Icon }) => (
                    <Link key={id} to={topicUrl(id)}>
                      <Icon size={28} stroke={1.5} aria-hidden="true" />
                      <h3>{title}</h3><p>{description}</p>
                      <span>Explore guides <IconArrowRight size={17} aria-hidden="true" /></span>
                    </Link>
                  ))}
                </div>
                <section className="hp-faq" id="faq">
                  <span className="hp-eyebrow">QUICK ANSWERS</span>
                  <h2>A few things you might be wondering.</h2>
                  {helpFaqs.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
                </section>
              </>
            ) : (
              <section className="hp-guides" aria-label="Help articles">
                <div className="hp-section-head">
                  <h2 ref={heading} tabIndex={-1}>{topic?.title || 'Search results'}</h2>
                  <span role="status">{results.length} {results.length === 1 ? 'GUIDE' : 'GUIDES'}</span>
                </div>
                <Link className="hp-reset" to="/help">← All topics</Link>
                <div className="hp-article-list">
                  {results.map(item => (
                    <Link key={item.id} to={articleUrl(item.id)}>
                      <span><small>{helpTopics.find(category => category.id === item.topic)?.title}</small><strong>{item.title}</strong></span>
                      <IconArrowRight size={19} aria-hidden="true" />
                    </Link>
                  ))}
                  {!results.length && <div className="hp-empty"><h2>No matching guides yet.</h2><p>Try “queue”, “booking”, or “account”, or contact our team.</p><Link to="/help">Browse all topics →</Link><Link to="/contact">Contact support →</Link></div>}
                </div>
              </section>
            )}
          </>
        )}
        <ContactHelp />
      </div>
    </div>
  );
}
