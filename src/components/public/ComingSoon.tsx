/** Lightweight placeholder for routes not yet built (sub-plan 05 scope). */
export function ComingSoon({ feature }: { feature: string }) {
  return (
    <article className="coming-soon">
      <h1>{feature}</h1>
      <p role="status">Coming soon — this feature is not built yet.</p>
    </article>
  );
}
