export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando operação" className="stack">
      <div className="skeleton" style={{ width: 240, height: 32 }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 300 }} />
    </div>
  );
}
