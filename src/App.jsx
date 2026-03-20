import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { calculateDelta, calculateScenario, createScenarioRecord, estimateTax, HORIZON_YEARS, REGION_OPTIONS } from './model'
import { deleteScenarioRecord, listScenarioRecords, saveScenarioRecord } from './scenarioStore'

const VIEW_OPTIONS = ['overview', 'current', 'offer', 'delta']
const CURRENCY = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
})
const PERCENT = new Intl.NumberFormat('en-CA', {
  style: 'percent',
  maximumFractionDigits: 1,
})

function formatMoney(value) {
  return CURRENCY.format(value)
}

function formatPercent(value) {
  return PERCENT.format(value)
}

function formatCompactMoney(value) {
  const absolute = Math.abs(value)
  if (absolute >= 1000000) return `${value < 0 ? '-' : ''}$${(absolute / 1000000).toFixed(1)}M`
  if (absolute >= 1000) return `${value < 0 ? '-' : ''}$${Math.round(absolute / 1000)}k`
  return formatMoney(value)
}

function NumberField({ label, value, suffix, step = 1, min = 0, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field__input-shell">
        <input
          className="field__input"
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="field__suffix">{suffix}</span> : null}
      </div>
    </label>
  )
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="field__input field__input--select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ScenarioForm({ title, accent, settings, onChange }) {
  return (
    <section className={`config-card config-card--${accent}`}>
      <div className="config-card__header">
        <p className="eyebrow">Comp configuration</p>
        <h2>{title}</h2>
        <p>Use the same modeling frame for both sides of the decision so the delta stays honest.</p>
      </div>

      <div className="field-grid">
        <SelectField label="Province / region" value={settings.regionCode} options={REGION_OPTIONS} onChange={(value) => onChange('regionCode', value)} />
        <NumberField label="Base salary" value={settings.baseSalary} suffix="CAD" step={1000} onChange={(value) => onChange('baseSalary', value)} />
        <NumberField label="Annual raise" value={settings.annualRaisePct} suffix="%" step={0.5} onChange={(value) => onChange('annualRaisePct', value)} />
        <NumberField label="Variable target" value={settings.variableTargetPct} suffix="%" step={1} onChange={(value) => onChange('variableTargetPct', value)} />
        <NumberField label="Quota attainment" value={settings.quotaAttainmentPct} suffix="%" step={1} onChange={(value) => onChange('quotaAttainmentPct', value)} />
        <NumberField label="Initial equity grant" value={settings.initialGrantValue} suffix="CAD" step={5000} onChange={(value) => onChange('initialGrantValue', value)} />
        <NumberField label="Vesting schedule" value={settings.vestingYears} suffix="yrs" step={1} min={1} onChange={(value) => onChange('vestingYears', value)} />
        <NumberField label="Annual refresher" value={settings.refresherGrantValue} suffix="CAD" step={5000} onChange={(value) => onChange('refresherGrantValue', value)} />
        <NumberField label="Refresher start year" value={settings.refresherStartYear} suffix="yr" step={1} min={2} onChange={(value) => onChange('refresherStartYear', value)} />
        <NumberField label="Stock growth" value={settings.stockGrowthPct} suffix="%" step={0.5} onChange={(value) => onChange('stockGrowthPct', value)} />
      </div>
    </section>
  )
}

function MetricCard({ label, value, detail, tone = 'neutral' }) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  )
}

function TrajectoryChart({ title, subtitle, rows, lines }) {
  const width = 860
  const height = 320
  const padding = 28
  const points = rows.length
  const maxValue = Math.max(1, ...lines.flatMap((line) => rows.map((row, index) => Math.abs(line.value(row, index)))))

  const x = (index) => padding + (index * (width - padding * 2)) / Math.max(points - 1, 1)
  const y = (value) => height - padding - (Math.abs(value) / maxValue) * (height - padding * 2)

  return (
    <section className="chart-card">
      <div className="chart-card__header">
        <div>
          <p className="eyebrow">Income trajectory</p>
          <h3>{title}</h3>
        </div>
        <p>{subtitle}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trajectory-chart" role="img" aria-label={title}>
        {[0.25, 0.5, 0.75, 1].map((tick) => (
          <line
            key={tick}
            x1={padding}
            x2={width - padding}
            y1={height - padding - tick * (height - padding * 2)}
            y2={height - padding - tick * (height - padding * 2)}
            className="trajectory-chart__grid"
          />
        ))}
        {lines.map((line) => (
          <polyline
            key={line.label}
            className="trajectory-chart__line"
            style={{ '--line': line.color }}
            points={rows.map((row, index) => `${x(index)},${y(line.value(row, index))}`).join(' ')}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {rows.map((row, index) => (
          <text key={row.year} x={x(index)} y={height - 6} textAnchor="middle" className="trajectory-chart__label">
            Y{row.year}
          </text>
        ))}
      </svg>
      <div className="legend-row">
        {lines.map((line) => (
          <span key={line.label} className="legend-chip">
            <i style={{ background: line.color }} />
            {line.label}
          </span>
        ))}
      </div>
    </section>
  )
}

function EquityStackChart({ title, stacking }) {
  const maxTotal = Math.max(1, ...stacking.map((row) => row.total))

  return (
    <section className="chart-card">
      <div className="chart-card__header">
        <div>
          <p className="eyebrow">Equity stacking</p>
          <h3>{title}</h3>
        </div>
        <p>Each bar shows vested equity recognized that year, layered by grant origin.</p>
      </div>
      <div className="stack-chart">
        {stacking.map((row) => (
          <div key={row.year} className="stack-chart__column">
            <div className="stack-chart__bar" title={`Year ${row.year}: ${formatMoney(row.total)}`}>
              {row.segments.map((segment) => (
                <div
                  key={segment.id}
                  className="stack-chart__segment"
                  style={{
                    height: `${(segment.vested / maxTotal) * 100}%`,
                    background: segment.color,
                  }}
                  title={`${segment.label}: ${formatMoney(segment.vested)}`}
                />
              ))}
            </div>
            <span>Y{row.year}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function DataTable({ title, columns, rows, renderRow }) {
  return (
    <section className="table-card">
      <div className="chart-card__header">
        <div>
          <p className="eyebrow">Detail view</p>
          <h3>{title}</h3>
        </div>
        <p>{rows.length} yearly rows across the {HORIZON_YEARS}-year horizon.</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>{rows.map(renderRow)}</tbody>
        </table>
      </div>
    </section>
  )
}

function ScenarioPill({ active, label, meta, onClick }) {
  return (
    <button type="button" className={`scenario-pill ${active ? 'scenario-pill--active' : ''}`} onClick={onClick}>
      <strong>{label}</strong>
      <span>{meta}</span>
    </button>
  )
}

function ViewToggle({ value, onChange }) {
  const labels = {
    overview: 'Overview',
    current: 'Current',
    offer: 'New offer',
    delta: 'Delta',
  }

  return (
    <div className="view-toggle" role="tablist" aria-label="Simulator views">
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={value === option}
          className={value === option ? 'view-toggle__button view-toggle__button--active' : 'view-toggle__button'}
          onClick={() => onChange(option)}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

function App() {
  const [records, setRecords] = useState([])
  const [activeScenarioId, setActiveScenarioId] = useState(null)
  const [view, setView] = useState('overview')
  const [storageStatus, setStorageStatus] = useState('Opening local vault…')
  const [storageTone, setStorageTone] = useState('neutral')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const saved = await listScenarioRecords()
        const seeded = saved.length > 0 ? saved : [createScenarioRecord('Base case')]

        if (saved.length === 0) {
          await saveScenarioRecord(seeded[0])
        }

        if (!cancelled) {
          setRecords(seeded)
          setActiveScenarioId(seeded[0].id)
          setStorageStatus('Scenario settings autosave to local IndexedDB only.')
          setStorageTone('success')
        }
      } catch (error) {
        if (!cancelled) {
          setStorageStatus(`IndexedDB unavailable: ${error instanceof Error ? error.message : String(error)}`)
          setStorageTone('warning')
          const fallback = createScenarioRecord('In-memory draft')
          setRecords([fallback])
          setActiveScenarioId(fallback.id)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const activeScenario = useMemo(
    () => records.find((record) => record.id === activeScenarioId) ?? records[0] ?? null,
    [activeScenarioId, records],
  )

  const currentProjection = useMemo(
    () => (activeScenario ? calculateScenario(activeScenario.settings.current) : null),
    [activeScenario],
  )
  const offerProjection = useMemo(
    () => (activeScenario ? calculateScenario(activeScenario.settings.offer) : null),
    [activeScenario],
  )
  const deltaRows = useMemo(
    () => (currentProjection && offerProjection ? calculateDelta(currentProjection, offerProjection) : []),
    [currentProjection, offerProjection],
  )

  const saveRecord = async (record, nextStatus = 'Scenario saved locally.') => {
    try {
      await saveScenarioRecord(record)
      setStorageStatus(nextStatus)
      setStorageTone('success')
    } catch (error) {
      setStorageStatus(`Local save failed: ${error instanceof Error ? error.message : String(error)}`)
      setStorageTone('warning')
    }
  }

  const updateScenario = (section, key, rawValue) => {
    if (!activeScenario) return
    const nextRecord = {
      ...activeScenario,
      updatedAt: new Date().toISOString(),
      settings: {
        ...activeScenario.settings,
        [section]: {
          ...activeScenario.settings[section],
          [key]: key === 'regionCode'
            ? rawValue
            : rawValue === ''
              ? ''
              : Number(rawValue),
        },
      },
    }

    setRecords((current) => current.map((record) => (record.id === nextRecord.id ? nextRecord : record)))
    void saveRecord(nextRecord)
  }

  const renameScenario = (name) => {
    if (!activeScenario) return
    const trimmed = name.trim()
    const nextRecord = {
      ...activeScenario,
      name: trimmed || activeScenario.name,
      updatedAt: new Date().toISOString(),
    }
    setRecords((current) => current.map((record) => (record.id === nextRecord.id ? nextRecord : record)))
    void saveRecord(nextRecord, 'Scenario title updated locally.')
  }

  const addScenario = () => {
    const nextRecord = createScenarioRecord(`Scenario ${records.length + 1}`)
    setRecords((current) => [nextRecord, ...current])
    setActiveScenarioId(nextRecord.id)
    void saveRecord(nextRecord, 'New scenario created in IndexedDB.')
  }

  const duplicateScenario = () => {
    if (!activeScenario) return
    const nextRecord = {
      ...structuredClone(activeScenario),
      id: crypto.randomUUID(),
      name: `${activeScenario.name} copy`,
      updatedAt: new Date().toISOString(),
    }
    setRecords((current) => [nextRecord, ...current])
    setActiveScenarioId(nextRecord.id)
    void saveRecord(nextRecord, 'Scenario duplicated locally.')
  }

  const removeScenario = async () => {
    if (!activeScenario || records.length === 1) return
    const nextRecords = records.filter((record) => record.id !== activeScenario.id)
    setRecords(nextRecords)
    setActiveScenarioId(nextRecords[0]?.id ?? null)

    try {
      await deleteScenarioRecord(activeScenario.id)
      setStorageStatus('Scenario removed from local IndexedDB.')
      setStorageTone('success')
    } catch (error) {
      setStorageStatus(`Delete failed: ${error instanceof Error ? error.message : String(error)}`)
      setStorageTone('warning')
    }
  }

  if (!activeScenario || !currentProjection || !offerProjection) {
    return <main className="loading-shell">Loading simulator…</main>
  }

  const cumulativeDeltaGross = deltaRows.at(-1)?.cumulativeGrossDelta ?? 0
  const cumulativeDeltaNet = deltaRows.at(-1)?.cumulativeNetDelta ?? 0
  const yearOneDelta = deltaRows[0]?.netDelta ?? 0
  const tenthYearDelta = deltaRows.at(-1)?.netDelta ?? 0
  const currentTaxRate = estimateTax(currentProjection.rows[0].totalGross, activeScenario.settings.current.regionCode).effectiveRate
  const offerTaxRate = estimateTax(offerProjection.rows[0].totalGross, activeScenario.settings.offer.regionCode).effectiveRate

  return (
    <main className="simulator-shell">
      <aside className="scenario-rail">
        <div className="scenario-rail__header">
          <p className="eyebrow">Local vault</p>
          <h1>Career Wealth Delta Simulator</h1>
          <p className={`status-chip status-chip--${storageTone}`}>{storageStatus}</p>
        </div>

        <div className="scenario-actions">
          <button type="button" className="secondary-button" onClick={addScenario}>New scenario</button>
          <button type="button" className="secondary-button" onClick={duplicateScenario}>Duplicate</button>
          <button type="button" className="secondary-button secondary-button--danger" onClick={() => void removeScenario()} disabled={records.length === 1}>
            Delete
          </button>
        </div>

        <div className="scenario-list">
          {records.map((record) => (
            <ScenarioPill
              key={record.id}
              active={record.id === activeScenario.id}
              label={record.name}
              meta={new Date(record.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              onClick={() => setActiveScenarioId(record.id)}
            />
          ))}
        </div>

        <label className="scenario-name-field">
          <span>Scenario name</span>
          <input value={activeScenario.name} onChange={(event) => renameScenario(event.target.value)} />
        </label>

        <section className="assumption-card">
          <p className="eyebrow">Transparency</p>
          <h2>What this model assumes</h2>
          <ul>
            <li>Taxes use progressive federal + provincial income tax bands with basic personal amounts.</li>
            <li>CPP, EI, retirement plan deductions, and deductions/credits beyond BPA are intentionally excluded.</li>
            <li>RSU value represents vested equity recognized as income in that year.</li>
            <li>Only scenario settings are persisted, locally, in IndexedDB. All projections are recalculated live.</li>
          </ul>
        </section>
      </aside>

      <section className="workspace">
        <header className="hero-panel">
          <div>
            <p className="eyebrow">Decision memo</p>
            <h2>Compare your current comp baseline against the offer that wants to rewrite your next decade.</h2>
          </div>
          <p>
            Tune base, variable, vesting, refreshers, stock growth, and region assumptions. The simulator translates those into ten-year gross,
            net, equity stacking, and cumulative delta views instantly.
          </p>
        </header>

        <section className="metrics-grid">
          <MetricCard label="10Y gross delta" value={formatCompactMoney(cumulativeDeltaGross)} detail="Offer minus current, including vested equity." tone={cumulativeDeltaGross >= 0 ? 'positive' : 'negative'} />
          <MetricCard label="10Y net delta" value={formatCompactMoney(cumulativeDeltaNet)} detail="Estimated after progressive tax modeling." tone={cumulativeDeltaNet >= 0 ? 'positive' : 'negative'} />
          <MetricCard label="Year 1 take-home delta" value={formatCompactMoney(yearOneDelta)} detail="Immediate annualized change in net comp." tone={yearOneDelta >= 0 ? 'positive' : 'negative'} />
          <MetricCard label="Year 10 take-home delta" value={formatCompactMoney(tenthYearDelta)} detail="How the model finishes once raises and equity stack." tone={tenthYearDelta >= 0 ? 'positive' : 'negative'} />
        </section>

        <section className="config-grid">
          <ScenarioForm title="Current role" accent="current" settings={activeScenario.settings.current} onChange={(key, value) => updateScenario('current', key, value)} />
          <ScenarioForm title="New offer" accent="offer" settings={activeScenario.settings.offer} onChange={(key, value) => updateScenario('offer', key, value)} />
        </section>

        <ViewToggle value={view} onChange={setView} />

        {view === 'overview' ? (
          <div className="view-grid">
            <TrajectoryChart
              title="Gross and net earnings race"
              subtitle="Both compensation stories over ten years, with cash + vested equity separated by take-home impact."
              rows={currentProjection.rows}
              lines={[
                { label: 'Current net', color: '#ffdf8c', value: (_, index) => currentProjection.rows[index].netWithRsu },
                { label: 'Offer net', color: '#5ce1e6', value: (_, index) => offerProjection.rows[index].netWithRsu },
                { label: 'Current gross', color: '#8c7452', value: (_, index) => currentProjection.rows[index].totalGross },
                { label: 'Offer gross', color: '#2dbfc5', value: (_, index) => offerProjection.rows[index].totalGross },
              ]}
            />
            <TrajectoryChart
              title="Net delta by year"
              subtitle="Positive years mean the offer is ahead after tax. Negative years flag dilution, vest cliffs, or weaker cash mix."
              rows={deltaRows}
              lines={[
                { label: 'Annual net delta', color: '#f27dbb', value: (row) => row.netDelta },
                { label: 'Cumulative net delta', color: '#92a8ff', value: (row) => row.cumulativeNetDelta },
              ]}
            />
            <EquityStackChart title="Current equity stack" stacking={currentProjection.stacking} />
            <EquityStackChart title="Offer equity stack" stacking={offerProjection.stacking} />
          </div>
        ) : null}

        {view === 'current' ? (
          <div className="view-grid">
            <TrajectoryChart
              title="Current role income trajectory"
              subtitle={`Estimated first-year effective tax ${formatPercent(currentTaxRate)} in ${currentProjection.region.label}.`}
              rows={currentProjection.rows}
              lines={[
                { label: 'Gross incl. RSU', color: '#ffdf8c', value: (row) => row.totalGross },
                { label: 'Net incl. RSU', color: '#5ce1e6', value: (row) => row.netWithRsu },
              ]}
            />
            <EquityStackChart title="Current role vested equity" stacking={currentProjection.stacking} />
            <DataTable
              title="Current scenario yearly breakdown"
              columns={['Year', 'Base', 'Variable', 'RSU Grant', 'Gross (Base+Var)', 'Total Gross', 'Tax Rate', 'Net (Base+Var)', 'Net (inc. RSU)']}
              rows={currentProjection.rows}
              renderRow={(row) => (
                <tr key={row.year}>
                  <td>Y{row.year}</td>
                  <td>{formatMoney(row.base)}</td>
                  <td>{formatMoney(row.variable)}</td>
                  <td>{formatMoney(row.rsuGrant)}</td>
                  <td>{formatMoney(row.gross)}</td>
                  <td>{formatMoney(row.totalGross)}</td>
                  <td>{formatPercent(row.taxRate)}</td>
                  <td>{formatMoney(row.net)}</td>
                  <td>{formatMoney(row.netWithRsu)}</td>
                </tr>
              )}
            />
          </div>
        ) : null}

        {view === 'offer' ? (
          <div className="view-grid">
            <TrajectoryChart
              title="Offer income trajectory"
              subtitle={`Estimated first-year effective tax ${formatPercent(offerTaxRate)} in ${offerProjection.region.label}.`}
              rows={offerProjection.rows}
              lines={[
                { label: 'Gross incl. RSU', color: '#5ce1e6', value: (row) => row.totalGross },
                { label: 'Net incl. RSU', color: '#ff7fa9', value: (row) => row.netWithRsu },
              ]}
            />
            <EquityStackChart title="Offer vested equity" stacking={offerProjection.stacking} />
            <DataTable
              title="Offer scenario yearly breakdown"
              columns={['Year', 'Base', 'Variable', 'RSU Grant', 'Gross (Base+Var)', 'Total Gross', 'Tax Rate', 'Net (Base+Var)', 'Net (inc. RSU)']}
              rows={offerProjection.rows}
              renderRow={(row) => (
                <tr key={row.year}>
                  <td>Y{row.year}</td>
                  <td>{formatMoney(row.base)}</td>
                  <td>{formatMoney(row.variable)}</td>
                  <td>{formatMoney(row.rsuGrant)}</td>
                  <td>{formatMoney(row.gross)}</td>
                  <td>{formatMoney(row.totalGross)}</td>
                  <td>{formatPercent(row.taxRate)}</td>
                  <td>{formatMoney(row.net)}</td>
                  <td>{formatMoney(row.netWithRsu)}</td>
                </tr>
              )}
            />
          </div>
        ) : null}

        {view === 'delta' ? (
          <div className="view-grid">
            <TrajectoryChart
              title="Delta trajectory"
              subtitle="How much more — or less — wealth the offer generates each year once comp structure and tax drag are applied."
              rows={deltaRows}
              lines={[
                { label: 'Gross delta', color: '#ffdf8c', value: (row) => row.totalGrossDelta },
                { label: 'Net delta', color: '#5ce1e6', value: (row) => row.netDelta },
                { label: 'Cumulative net delta', color: '#f27dbb', value: (row) => row.cumulativeNetDelta },
              ]}
            />
            <DataTable
              title="Delta yearly breakdown"
              columns={['Year', 'Base Delta', 'Variable Delta', 'RSU Delta', 'Gross Delta', 'Total Gross Delta', 'Net Delta', 'Cum. Gross Delta', 'Cum. Net Delta']}
              rows={deltaRows}
              renderRow={(row) => (
                <tr key={row.year}>
                  <td>Y{row.year}</td>
                  <td>{formatMoney(row.baseDelta)}</td>
                  <td>{formatMoney(row.variableDelta)}</td>
                  <td>{formatMoney(row.rsuDelta)}</td>
                  <td>{formatMoney(row.grossDelta)}</td>
                  <td>{formatMoney(row.totalGrossDelta)}</td>
                  <td>{formatMoney(row.netDelta)}</td>
                  <td>{formatMoney(row.cumulativeGrossDelta)}</td>
                  <td>{formatMoney(row.cumulativeNetDelta)}</td>
                </tr>
              )}
            />
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
