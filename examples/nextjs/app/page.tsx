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
      <div className="note">
        GA4, Meta Pixel and Clarity use fake public IDs here. Grant consent to see each adapter
        outcome; “sent” does not prove provider acceptance.
      </div>
    </section>
  );
}
