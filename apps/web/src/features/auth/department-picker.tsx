'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
const suggested = [
  'Departamento Pessoal',
  'Fiscal',
  'Contábil',
  'Societário',
  'BPO Financeiro',
  'Compliance',
  'Administração',
];
export function DepartmentPicker({
  name = 'departments',
  defaultSelected = suggested.slice(0, 4),
}: {
  name?: string;
  defaultSelected?: string[];
}) {
  const [options, setOptions] = useState(suggested);
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [draft, setDraft] = useState('');
  function toggle(department: string) {
    setSelected((current) =>
      current.includes(department) ? current.filter((d) => d !== department) : [...current, department],
    );
  }
  function addCustom() {
    const value = draft.trim();
    if (!value) return;
    if (!options.includes(value)) setOptions((current) => [...current, value]);
    if (!selected.includes(value)) setSelected((current) => [...current, value]);
    setDraft('');
  }
  return (
    <div className="field span-full">
      <label id="departments-label">Departamentos</label>
      <div className="chip-group" role="group" aria-labelledby="departments-label">
        {options.map((department) => (
          <button
            type="button"
            key={department}
            className={`chip ${selected.includes(department) ? 'chip-selected' : ''}`}
            aria-pressed={selected.includes(department)}
            onClick={() => toggle(department)}
          >
            {department}
          </button>
        ))}
      </div>
      <div className="chip-add">
        <input
          className="input"
          placeholder="Outro departamento…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addCustom();
            }
          }}
          aria-label="Adicionar novo departamento"
        />
        <button
          type="button"
          className="button button-secondary button-icon"
          onClick={addCustom}
          aria-label="Adicionar departamento"
        >
          <Plus size={16} />
        </button>
      </div>
      <span className="field-hint">Clique para selecionar os departamentos usados no seu escritório.</span>
      <input type="hidden" name={name} value={selected.join(',')} />
    </div>
  );
}
