export default function Card({ title, value, hint }) {
  return (
    <article className="metric-card">
      <span className="metric-label">{title}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-helper">{hint}</span>
    </article>
  );
}
