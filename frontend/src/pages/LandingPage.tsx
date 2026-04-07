import { Link } from "react-router-dom";

const features = [
  {
    title: "QR queue entry",
    text: "Each tenant gets a join link and QR code so walk-in customers can grab a priority number in seconds."
  },
  {
    title: "Remote queueing",
    text: "Registered customers can join a vendor queue online before they arrive and keep an eye on their turn from the web app."
  },
  {
    title: "Near-turn alerts",
    text: "Email or SMS notifications fire when a customer is close to the front, reducing missed turns and lobby crowding."
  },
  {
    title: "Multi-tenant by design",
    text: "Every business has its own slug, queue settings, ticket stream, and vendor dashboard while sharing one platform."
  }
] as const;

export default function LandingPage() {
  return (
    <div className="stack gap-xl">
      <section className="hero-grid card hero-card">
        <div className="stack gap-md">
          <span className="eyebrow">MERN multi-tenant queueing</span>
          <h1>Digital priority numbers for walk-ins, online customers, and fast-moving service teams.</h1>
          <p className="lead">
            Prio gives each vendor a tenant-aware queue board, customer join page, QR code entry point,
            and near-turn notifications through email or SMS.
          </p>
          <div className="row gap-sm wrap">
            <Link className="primary-button" to="/register/vendor">
              Launch vendor workspace
            </Link>
            <Link className="secondary-button" to="/register/customer">
              Create customer account
            </Link>
          </div>
        </div>

        <div className="hero-panel">
          <div className="hero-stat">
            <span>Now serving</span>
            <strong>P018</strong>
          </div>
          <div className="hero-stat soft">
            <span>Waiting online</span>
            <strong>12</strong>
          </div>
          <div className="hero-stat accent">
            <span>Alert threshold</span>
            <strong>2 away</strong>
          </div>
        </div>
      </section>

      <section className="grid two-up">
        {features.map((feature) => (
          <article className="card stack gap-sm" key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      <section className="card stack gap-md">
        <span className="eyebrow">Suggested flow</span>
        <div className="grid four-up compact-grid">
          <div>
            <h3>1. Vendor onboard</h3>
            <p>Create a tenant, set queue prefix and average service time, then share the QR code.</p>
          </div>
          <div>
            <h3>2. Customer joins</h3>
            <p>Walk-ins scan the QR or join online with their account and contact preferences.</p>
          </div>
          <div>
            <h3>3. Queue updates live</h3>
            <p>The public board and vendor dashboard stream queue movement in real time.</p>
          </div>
          <div>
            <h3>4. Notifications trigger</h3>
            <p>Email or SMS alerts go out when a customer is almost next or actively called.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
