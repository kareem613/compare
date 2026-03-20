import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { calculateDelta, calculateScenario, createScenarioRecord, estimateTax, HORIZON_YEARS, REGION_OPTIONS } from './model'
import { deleteScenarioRecord, listScenarioRecords, saveScenarioRecord } from './scenarioStore'

const PAGE_OPTIONS = ['current', 'offer', 'delta']
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

function formatScenarioUpdated(value) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
        <div>
          <p className="eyebrow">Configuration</p>
          <h2>{title}</h2>
        </div>
        <p>Everything on this page recalculates instantly from these assumptions.</p>
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
          <p className="eyebrow">Trajectory</p>
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

function EquityStackChart({ title, subtitle, stacking }) {
  const maxTotal = Math.max(1, ...stacking.map((row) => row.total))

  return (
    <section className="chart-card">
      <div className="chart-card__header">
        <div>
          <p className="eyebrow">Equity stacking</p>
          <h3>{title}</h3>
        </div>
        <p>{subtitle}</p>
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
    <section className="table-card table-card--full">
      <div className="chart-card__header">
        <div>
          <p className="eyebrow">Yearly detail</p>
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

function ScenarioToolbar({
  activeScenario,
  records,
  onSelect,
  onRename,
  onCreate,
  onDuplicate,
  onDelete,
}) {
  return (
    <div className="scenario-toolbar">
      <div className="scenario-toolbar__group scenario-toolbar__group--grow">
        <label className="scenario-select">
          <span>Scenario</span>
          <select value={activeScenario.id} onChange={(event) => onSelect(event.target.value)}>
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {record.name}
              </option>
            ))}
          </select>
        </label>
        <label className="scenario-title-input">
          <span>Label</span>
          <input value={activeScenario.name} onChange={(event) => onRename(event.target.value)} />
        </label>
      </div>

      <div className="scenario-toolbar__group">
        <button type="button" className="toolbar-button toolbar-button--accent" onClick={onCreate} aria-label="Create scenario">
          +
        </button>
        <button type="button" className="toolbar-button" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="toolbar-button toolbar-button--danger" onClick={() => void onDelete()} disabled={records.length === 1}>
          Delete
        </button>
      </div>
    </div>
  )
}

function PageNav({ value, onChange }) {
  const labels = {
    current: 'Current role',
    offer: 'New offer',
    delta: 'Delta',
  }

  return (
    <div className="page-nav" role="tablist" aria-label="Simulator pages">
      {PAGE_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={value === option}
          className={value === option ? 'page-nav__button page-nav__button--active' : 'page-nav__button'}
          onClick={() => onChange(option)}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

function TransparencyCard() {
  return (
    <section className="assumption-card">
      <p className="eyebrow">Assumptions</p>
      <h2>How to read the model</h2>
      <ul>
        <li>Taxes use progressive federal and provincial income tax bands with basic personal amounts.</li>
        <li>CPP, EI, retirement deductions, and credits beyond the BPA are intentionally excluded.</li>
        <li>Equity represents vested value recognized as income in the year it lands.</li>
        <li>Your scenario data is saved locally only; every projection is recalculated live from those settings.</li>
      </ul>
    </section>
  )
}

function ScenarioSummaryCard({ activeScenario }) {
  return (
    <section className="assumption-card assumption-card--compact">
      <p className="eyebrow">Scenario</p>
      <h2>{activeScenario.name}</h2>
      <ul>
        <li>Last updated {formatScenarioUpdated(activeScenario.updatedAt)}.</li>
        <li>Use the page tabs to focus on current role, new offer, or delta.</li>
        <li>The header keeps scenario switching compact so the sidebar can stay dedicated to assumptions.</li>
      </ul>
    </section>
  )
}

function DeltaSidebar({ activeScenario, currentProjection, offerProjection }) {
  return (
    <>
      <ScenarioSummaryCard activeScenario={activeScenario} />
      <section className="assumption-card assumption-card--compact">
        <p className="eyebrow">Compare setup</p>
        <h2>Inputs in play</h2>
        <div className="compare-notes">
          <div>
            <span>Current role</span>
            <strong>{currentProjection.region.label}</strong>
            <em>{formatMoney(activeScenario.settings.current.baseSalary)} base</em>
          </div>
          <div>
            <span>New offer</span>
            <strong>{offerProjection.region.label}</strong>
            <em>{formatMoney(activeScenario.settings.offer.baseSalary)} base</em>
          </div>
        </div>
        <p className="sidebar-note">Adjust assumptions from the Current role and New offer pages, then come back here to read the spread.</p>
      </section>
      <TransparencyCard />
    </>
  )
}

function DetailPage({
  eyebrow,
  title,
  lead,
  tone,
  projection,
  taxRate,
  rows,
  tableTitle,
  tableColumns,
  renderRow,
}) {
  const yearOne = projection.rows[0]
  const yearTen = projection.rows.at(-1)

  return (
    <>
      <header className={`hero-panel hero-panel--${tone}`}>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        <p>{lead}</p>
      </header>

      <section className="metrics-grid">
        <MetricCard label="10Y gross" value={formatCompactMoney(projection.totals.gross)} detail="Cash plus vested equity across the full horizon." tone={tone} />
        <MetricCard label="10Y net" value={formatCompactMoney(projection.totals.net)} detail="After progressive income tax estimation." tone={tone} />
        <MetricCard label="Year 1 take-home" value={formatCompactMoney(yearOne.netWithRsu)} detail={`Estimated first-year effective tax ${formatPercent(taxRate)}.`} tone="neutral" />
        <MetricCard label="10Y vested equity" value={formatCompactMoney(projection.totals.equity)} detail="Equity recognized as income over time." tone="neutral" />
      </section>

      <section className="content-grid">
        <TrajectoryChart
          title={`${title} income path`}
          subtitle={`Gross and net compensation over ${HORIZON_YEARS} years in ${projection.region.label}.`}
          rows={projection.rows}
          lines={[
            { label: 'Gross incl. RSU', color: tone === 'current' ? '#ffdf8c' : '#5ce1e6', value: (row) => row.totalGross },
            { label: 'Net incl. RSU', color: tone === 'current' ? '#ff9d82' : '#f27dbb', value: (row) => row.netWithRsu },
          ]}
        />
        <EquityStackChart
          title={`${title} vested equity`}
          subtitle={`The equity stack by grant vintage, from year 1 through year ${yearTen.year}.`}
          stacking={projection.stacking}
        />
      </section>

      <DataTable title={tableTitle} columns={tableColumns} rows={rows} renderRow={renderRow} />
    </>
  )
}

function DeltaPage({ currentProjection, offerProjection, deltaRows }) {
  const cumulativeGross = deltaRows.at(-1)?.cumulativeGrossDelta ?? 0
  const cumulativeNet = deltaRows.at(-1)?.cumulativeNetDelta ?? 0
  const yearOneDelta = deltaRows[0]?.netDelta ?? 0
  const yearTenDelta = deltaRows.at(-1)?.netDelta ?? 0

  return (
    <>
      <header className="hero-panel hero-panel--delta">
        <div>
          <p className="eyebrow">Decision spread</p>
          <h1>Delta isolates what actually changes when you take the offer.</h1>
        </div>
        <p>Read the compensation gap directly: cash mix, equity lift, tax drag, and how much of the headline package survives into your take-home over the next decade.</p>
      </header>

      <section className="metrics-grid">
        <MetricCard label="10Y gross delta" value={formatCompactMoney(cumulativeGross)} detail="Offer minus current, including vested equity." tone={cumulativeGross >= 0 ? 'positive' : 'negative'} />
        <MetricCard label="10Y net delta" value={formatCompactMoney(cumulativeNet)} detail="After tax, after vesting, across the whole horizon." tone={cumulativeNet >= 0 ? 'positive' : 'negative'} />
        <MetricCard label="Year 1 net delta" value={formatCompactMoney(yearOneDelta)} detail="Immediate annualized take-home impact." tone={yearOneDelta >= 0 ? 'positive' : 'negative'} />
        <MetricCard label="Year 10 net delta" value={formatCompactMoney(yearTenDelta)} detail="Where the model finishes once raises and refreshers stack." tone={yearTenDelta >= 0 ? 'positive' : 'negative'} />
      </section>

      <section className="content-grid">
        <TrajectoryChart
          title="Delta trajectory"
          subtitle="Positive years favor the offer. Negative years expose dilution, weaker cash mix, or vesting cliffs."
          rows={deltaRows}
          lines={[
            { label: 'Gross delta', color: '#ffdf8c', value: (row) => row.totalGrossDelta },
            { label: 'Net delta', color: '#5ce1e6', value: (row) => row.netDelta },
            { label: 'Cumulative net delta', color: '#f27dbb', value: (row) => row.cumulativeNetDelta },
          ]}
        />
        <TrajectoryChart
          title="Current vs offer take-home"
          subtitle="A direct net-income overlay so the decision reads at a glance."
          rows={currentProjection.rows}
          lines={[
            { label: 'Current net', color: '#ffdf8c', value: (_, index) => currentProjection.rows[index].netWithRsu },
            { label: 'Offer net', color: '#5ce1e6', value: (_, index) => offerProjection.rows[index].netWithRsu },
          ]}
        />
      </section>

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
    </>
  )
}

function App() {
  const [records, setRecords] = useState([])
  const [activeScenarioId, setActiveScenarioId] = useState(null)
  const [page, setPage] = useState('current')
  const [storageStatus, setStorageStatus] = useState('Opening local workspace…')
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
          setStorageStatus('Scenario data is saved locally only.')
          setStorageTone('success')
        }
      } catch (error) {
        if (!cancelled) {
          setStorageStatus(`Local save unavailable: ${error instanceof Error ? error.message : String(error)}`)
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
    const trimmed = name.trimStart()
    const nextRecord = {
      ...activeScenario,
      name: trimmed || activeScenario.name,
      updatedAt: new Date().toISOString(),
    }
    setRecords((current) => current.map((record) => (record.id === nextRecord.id ? nextRecord : record)))
    void saveRecord(nextRecord, 'Scenario label updated locally.')
  }

  const addScenario = () => {
    const nextRecord = createScenarioRecord(`Scenario ${records.length + 1}`)
    setRecords((current) => [nextRecord, ...current])
    setActiveScenarioId(nextRecord.id)
    void saveRecord(nextRecord, 'New scenario created locally.')
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
      setStorageStatus('Scenario removed from local storage.')
      setStorageTone('success')
    } catch (error) {
      setStorageStatus(`Delete failed: ${error instanceof Error ? error.message : String(error)}`)
      setStorageTone('warning')
    }
  }

  if (!activeScenario || !currentProjection || !offerProjection) {
    return <main className="loading-shell">Loading simulator…</main>
  }

  const currentTaxRate = estimateTax(currentProjection.rows[0].totalGross, activeScenario.settings.current.regionCode).effectiveRate
  const offerTaxRate = estimateTax(offerProjection.rows[0].totalGross, activeScenario.settings.offer.regionCode).effectiveRate

  const sidebarContent =
    page === 'current' ? (
      <>
        <ScenarioSummaryCard activeScenario={activeScenario} />
        <ScenarioForm title="Current role setup" accent="current" settings={activeScenario.settings.current} onChange={(key, value) => updateScenario('current', key, value)} />
        <TransparencyCard />
      </>
    ) : page === 'offer' ? (
      <>
        <ScenarioSummaryCard activeScenario={activeScenario} />
        <ScenarioForm title="New offer setup" accent="offer" settings={activeScenario.settings.offer} onChange={(key, value) => updateScenario('offer', key, value)} />
        <TransparencyCard />
      </>
    ) : (
      <DeltaSidebar activeScenario={activeScenario} currentProjection={currentProjection} offerProjection={offerProjection} />
    )

  return (
    <main className="simulator-shell">
      <aside className="control-panel">
        <div className="control-panel__header">
          <p className="eyebrow">Career Wealth Delta Simulator</p>
          <h2>Configure the assumptions, then read the result on the canvas.</h2>
          <p className={`status-chip status-chip--${storageTone}`}>{storageStatus}</p>
        </div>
        {sidebarContent}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Decision studio</p>
            <h2>Scenario-driven offer comparison for the next decade.</h2>
          </div>
          <ScenarioToolbar
            activeScenario={activeScenario}
            records={records}
            onSelect={setActiveScenarioId}
            onRename={renameScenario}
            onCreate={addScenario}
            onDuplicate={duplicateScenario}
            onDelete={removeScenario}
          />
        </header>

        <PageNav value={page} onChange={setPage} />

        {page === 'current' ? (
          <DetailPage
            eyebrow="Current role"
            title="Current role keeps the baseline honest."
            lead="This page isolates what your existing compensation stack already does on its own: cash flow, tax drag, and how much vested equity actually lands over time."
            tone="current"
            projection={currentProjection}
            taxRate={currentTaxRate}
            rows={currentProjection.rows}
            tableTitle="Current role yearly breakdown"
            tableColumns={['Year', 'Base', 'Variable', 'RSU Grant', 'Gross (Base+Var)', 'Total Gross', 'Tax Rate', 'Net (Base+Var)', 'Net (inc. RSU)']}
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
        ) : null}

        {page === 'offer' ? (
          <DetailPage
            eyebrow="New offer"
            title="New offer gets its own clean read, not a blended compromise."
            lead="Use the same structure as the baseline page, but with the new package assumptions driving every chart, stat, and table on the screen."
            tone="offer"
            projection={offerProjection}
            taxRate={offerTaxRate}
            rows={offerProjection.rows}
            tableTitle="New offer yearly breakdown"
            tableColumns={['Year', 'Base', 'Variable', 'RSU Grant', 'Gross (Base+Var)', 'Total Gross', 'Tax Rate', 'Net (Base+Var)', 'Net (inc. RSU)']}
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
        ) : null}

        {page === 'delta' ? <DeltaPage currentProjection={currentProjection} offerProjection={offerProjection} deltaRows={deltaRows} /> : null}
      </section>
    </main>
  )
}

export default App
