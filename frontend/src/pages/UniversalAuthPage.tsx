import { useEffect, useRef, useState, type FormEvent } from 'react';
import googleIcon from '../assets/auth/google.svg';
import facebookIcon from '../assets/auth/facebook.svg';
import { UNIVERSAL_AUTH_ENABLED, canEnter, safeNext, type AuthResult, type OtpChallenge, type Surface, type UniversalAuthFakeAdapter } from '../auth/universalAuthPolicy';
import './universal-auth.css';

/** Unmounted fake-adapter prototype. Never pass real transport until security gates are satisfied. */
export function UniversalAuthPreparation({ adapter, onComplete, surface = 'customer', next = null }: { adapter: UniversalAuthFakeAdapter; onComplete: (path: string) => void; surface?: Surface; next?: string | null }) {
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [code, setCode] = useState('');
  const generation = useRef(0);
  const flight = useRef(false);
  useEffect(() => () => { generation.current += 1; flight.current = false; }, []);
  async function run<T>(request: () => Promise<T>, success: (value: T) => void) {
    if (flight.current || unknown) return;
    flight.current = true; setBusy(true); const current = generation.current;
    try { const result = await request(); if (current === generation.current) success(result); }
    catch { if (current === generation.current) setUnknown(true); }
    finally { if (current === generation.current) { flight.current = false; setBusy(false); } }
  }
  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    const payload = { name: String(values.get('name') || ''), username: String(values.get('username') || ''), email: String(values.get('email') || ''), password: String(values.get('password') || '') };
    form.reset(); void run(() => adapter.startCustomer(payload), value => setChallenge(value));
  }
  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!challenge || !/^\d{6}$/.test(code) || Date.parse(challenge.expiresAt) <= Date.now()) return;
    void run(() => adapter.verifyCustomer(challenge.challengeId, code), (result: AuthResult) => { setCode(''); setChallenge(null); if (canEnter(surface, result)) onComplete(safeNext(next, surface)); });
  }
  return <section className="universal-auth-preparation"><h1>Create Customer account</h1>{unknown ? <p role="alert">We could not confirm the result. Return to sign in and try again later.</p> : challenge ? <form onSubmit={verify}><p>Enter the code sent to {challenge.deliveryTarget}.</p><label>Verification code<input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" inputMode="numeric" /></label><button disabled={busy || code.length !== 6}>Verify</button><button type="button" disabled={busy} onClick={() => void run(() => adapter.resendCustomer(challenge.challengeId), value => { setChallenge(value); setCode(''); })}>Send a new code</button></form> : <form onSubmit={start}><label>Name<input name="name" required autoComplete="name" /></label><label>Username<input name="username" required autoComplete="username" /></label><label>Email<input name="email" type="email" required autoComplete="email" /></label><label>Password<input name="password" type="password" required autoComplete="new-password" /></label><button disabled={busy}>Continue</button></form>}<div aria-label="Social sign-in preview"><button type="button" aria-label="Continue with Google" disabled><img src={googleIcon} alt="" width={32} height={32} /></button><button type="button" aria-label="Continue with Facebook" disabled><img src={facebookIcon} alt="" width={32} height={32} /></button></div></section>;
}
/** This component is intentionally unmounted and cannot be enabled by configuration. */
export default function UniversalAuthPage() { return UNIVERSAL_AUTH_ENABLED ? <p>Unavailable</p> : null; }
