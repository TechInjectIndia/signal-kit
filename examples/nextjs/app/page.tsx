import Link from 'next/link';
export default function Page() {
  return (
    <section>
      <p className="eyebrow">01 / INSTRUMENTATION LAB</p>
      <h1>
        Every signal.
        <br />A clear outcome.
      </h1>
      <p className="intro">
        Consent first. Pages and requests captured automatically. Business events emitted
        deliberately.
      </p>
      <Link className="action" href="/catalog">
        Open the sample store →
      </Link>
      <div className="note">Local recorder only. No events are sent to advertising providers.</div>
    </section>
  );
}
