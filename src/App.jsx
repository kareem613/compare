import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { calculateDelta, calculateScenario, createScenarioRecord, HORIZON_YEARS, normalizeScenarioRecord, REGION_OPTIONS } from './model'
import { deleteScenarioRecord, listScenarioRecords, saveScenarioRecord } from './scenarioStore'

const PAGE_OPTIONS = ['current', 'offer', 'delta']
const COMP_VIEW_OPTIONS = ['gross', 'net']
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

function modeLabel(compView) {
  return compView === 'gross' ? 'gross' : 'net'
}

function modeLabelTitle(compView) {
  return compView === 'gross' ? 'Gross' : 'Net'
}

function scenarioValueForMode(row, compView) {
  if (!row) return 0
  return compView === 'gross' ? row.totalGross : row.netWithRsu
}

function deltaValueForMode(row, compView) {
  if (!row) return 0
  return compView === 'gross' ? row.totalGrossDelta : row.netDelta
}

function deltaCumulativeValueForMode(row, compView) {
  if (!row) return 0
  return compView === 'gross' ? row.cumulativeGrossDelta : row.cumulativeNetDelta
}

function sumRows(rows, valueForRow, limit) {
  return rows.slice(0, limit).reduce((total, row) => total + valueForRow(row), 0)
}

function cumulativeCompLabel(years, compView) {
  return compView === 'gross' ? `${years}Y cumulative gross comp` : `${years}Y cumulative net income`
}

function cumulativeCompDetail(years, compView) {
  return compView === 'gross'
    ? `Sum of years 1-${years} gross compensation, including vested equity.`
    : `Sum of years 1-${years} after-tax income, including vested equity.`
}

function yearOneCompLabel(compView) {
  return compView === 'gross' ? 'Year 1 gross comp' : 'Year 1 take-home'
}

function yearOneCompDetail(compView) {
  return compView === 'gross'
    ? 'Year 1 total gross compensation, including vested equity.'
    : 'Year 1 total gross minus estimated tax.'
}

function TooltipChip({ label, tooltip, nativeOnly = false }) {
  return (
    <span
      className={nativeOnly ? 'tooltip-chip tooltip-chip--native' : 'tooltip-chip'}
      tabIndex={0}
      aria-label={`${label}: ${tooltip}`}
      data-tooltip={nativeOnly ? undefined : tooltip}
      title={nativeOnly ? tooltip : undefined}
    >
      ?
    </span>
  )
}

function NumberField({ label, value, suffix, step = 1, min = 0, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field__input-shell">
        <input className="field__input" type="number" min={min} step={step} value={value} onChange={(event) => onChange(event.target.value)} />
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
    <section className={`config-panel config-panel--${accent}`}>
      <div className="panel-head">
        <p className="eyebrow">Setup</p>
        <h2>{title}</h2>
        <p>Change the assumptions here. The page beside it re-runs immediately.</p>
      </div>
      <div className="field-grid">
        <SelectField label="Region" value={settings.regionCode} options={REGION_OPTIONS} onChange={(value) => onChange('regionCode', value)} />
        <NumberField label="Base salary" value={settings.baseSalary} suffix="CAD" step={1000} onChange={(value) => onChange('baseSalary', value)} />
        <NumberField label="Monthly spend" value={settings.monthlySpend} suffix="CAD" step={100} onChange={(value) => onChange('monthlySpend', value)} />
        <NumberField label="Annual raise" value={settings.annualRaisePct} suffix="%" step={0.5} onChange={(value) => onChange('annualRaisePct', value)} />
        <NumberField label="Variable target" value={settings.variableTargetPct} suffix="%" step={1} onChange={(value) => onChange('variableTargetPct', value)} />
        <NumberField label="Quota attainment" value={settings.quotaAttainmentPct} suffix="%" step={1} onChange={(value) => onChange('quotaAttainmentPct', value)} />
        <NumberField label="Initial equity" value={settings.initialGrantValue} suffix="CAD" step={5000} onChange={(value) => onChange('initialGrantValue', value)} />
        <NumberField label="Vesting" value={settings.vestingYears} suffix="yrs" step={1} min={1} onChange={(value) => onChange('vestingYears', value)} />
        <NumberField label="Refresher" value={settings.refresherGrantValue} suffix="CAD" step={5000} onChange={(value) => onChange('refresherGrantValue', value)} />
        <NumberField label="Refresh start" value={settings.refresherStartYear} suffix="yr" step={1} min={2} onChange={(value) => onChange('refresherStartYear', value)} />
        <NumberField label="Stock growth" value={settings.stockGrowthPct} suffix="%" step={0.5} onChange={(value) => onChange('stockGrowthPct', value)} />
      </div>
    </section>
  )
}

function MetricCard({ label, value, detail, tone = 'neutral' }) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <span className="metric-card__label">
        {label}
        {detail ? <TooltipChip label={label} tooltip={detail} /> : null}
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function TrajectoryChart({ title, subtitle, rows, lines }) {
  const width = 860
  const height = 248
  const padding = 20
  const points = rows.length
  const maxValue = Math.max(1, ...lines.flatMap((line) => rows.map((row, index) => Math.abs(line.value(row, index)))))

  const x = (index) => padding + (index * (width - padding * 2)) / Math.max(points - 1, 1)
  const y = (value) => height - padding - (Math.abs(value) / maxValue) * (height - padding * 2)

  return (
    <section className="chart-card">
      <div className="panel-head panel-head--inline">
        <div>
          <p className="eyebrow">Chart</p>
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
          <text key={row.year} x={x(index)} y={height - 4} textAnchor="middle" className="trajectory-chart__label">
            {row.year}
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
      <div className="panel-head panel-head--inline">
        <div>
          <p className="eyebrow">Equity</p>
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
                  style={{ height: `${(segment.vested / maxTotal) * 100}%`, background: segment.color }}
                  title={`${segment.label}: ${formatMoney(segment.vested)}`}
                />
              ))}
            </div>
            <span>{row.year}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function DataTable({ title, columns, rows, renderRow }) {
  return (
    <section className="table-card table-card--full">
      <div className="panel-head panel-head--inline">
        <div>
          <p className="eyebrow">Table</p>
          <h3>{title}</h3>
        </div>
        <p>{rows.length} yearly rows.</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.label}>
                  <span className="table-heading">
                    {column.label}
                    <TooltipChip label={column.label} tooltip={column.tooltip} nativeOnly />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows.map(renderRow)}</tbody>
        </table>
      </div>
    </section>
  )
}

function CommandBar({ activeScenario, compView, page, records, onCompViewChange, onPageChange, onSelect, onCreate, onDuplicate, onDelete }) {
  const labels = {
    current: 'Current',
    offer: 'Offer',
    delta: 'Delta',
  }

  return (
    <header className="command-bar">
      <div className="command-bar__brand">
        <span className="command-bar__kicker">Career Wealth Delta Simulator</span>
      </div>

      <nav className="command-bar__tabs" aria-label="Simulator pages">
        {PAGE_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={page === option ? 'tab-button tab-button--active' : 'tab-button'}
            onClick={() => onPageChange(option)}
          >
            {labels[option]}
          </button>
        ))}
      </nav>

      <div className="command-bar__mode" role="tablist" aria-label="Gross or net view">
        {COMP_VIEW_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={compView === option}
            className={compView === option ? 'tab-button tab-button--active' : 'tab-button'}
            onClick={() => onCompViewChange(option)}
          >
            {modeLabelTitle(option)}
          </button>
        ))}
      </div>

      <div className="command-bar__scenario">
        <select value={activeScenario.id} onChange={(event) => onSelect(event.target.value)} aria-label="Select scenario">
          {records.map((record) => (
            <option key={record.id} value={record.id}>
              {record.name}
            </option>
          ))}
        </select>
        <button type="button" className="icon-button" onClick={onCreate} aria-label="Create scenario">
          +
        </button>
        <button type="button" className="chip-button" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="icon-button icon-button--danger" onClick={() => void onDelete()} disabled={records.length === 1} aria-label="Delete scenario">
          -
        </button>
      </div>
    </header>
  )
}

function SidebarMeta({ activeScenario, storageStatus, storageTone }) {
  return (
    <section className="meta-panel">
      <div>
        <p className="eyebrow">Scenario</p>
        <h2>{activeScenario.name}</h2>
      </div>
      <div className="meta-panel__info">
        <span>Updated {formatScenarioUpdated(activeScenario.updatedAt)}</span>
        <span className={`status-inline status-inline--${storageTone}`}>{storageStatus}</span>
      </div>
    </section>
  )
}

function TransparencyCard() {
  return (
    <section className="meta-panel meta-panel--notes">
      <p className="eyebrow">Model notes</p>
      <ul>
        <li>Progressive federal and provincial tax bands with basic personal amounts.</li>
        <li>CPP, EI, and extra deductions are excluded for clarity.</li>
        <li>Scenario data is saved locally only.</li>
      </ul>
    </section>
  )
}

function DeltaSidebar({ activeScenario, currentProjection, offerProjection, storageStatus, storageTone }) {
  return (
    <>
      <SidebarMeta activeScenario={activeScenario} storageStatus={storageStatus} storageTone={storageTone} />
      <section className="meta-panel meta-panel--notes">
        <p className="eyebrow">Inputs in play</p>
        <div className="compare-notes">
          <div>
            <span>Current</span>
            <strong>{currentProjection.region.label}</strong>
            <em>{formatMoney(activeScenario.settings.current.baseSalary)} base</em>
          </div>
          <div>
            <span>Offer</span>
            <strong>{offerProjection.region.label}</strong>
            <em>{formatMoney(activeScenario.settings.offer.baseSalary)} base</em>
          </div>
        </div>
        <p className="side-note">Adjust assumptions from the Current or Offer page, then return here to inspect the spread.</p>
      </section>
      <TransparencyCard />
    </>
  )
}

function SummaryStrip({ eyebrow, title, detail }) {
  return (
    <section className="summary-strip">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <p>{detail}</p>
    </section>
  )
}

function DetailPage({ eyebrow, title, detail, tone, projection, rows, tableTitle, tableColumns, renderRow, compView }) {
  const yearOne = projection.rows[0]
  const selectedFiveYear = sumRows(projection.rows, (row) => scenarioValueForMode(row, compView), 5)
  const selectedTenYear = sumRows(projection.rows, (row) => scenarioValueForMode(row, compView), 10)
  const savingsFiveYear = sumRows(projection.rows, (row) => row.savings, 5)
  const savingsTenYear = sumRows(projection.rows, (row) => row.savings, 10)

  return (
    <>
      <SummaryStrip eyebrow={eyebrow} title={title} detail={detail} />

      <section className="metrics-grid metrics-grid--detail">
        <MetricCard
          label={yearOneCompLabel(compView)}
          value={formatCompactMoney(scenarioValueForMode(yearOne, compView))}
          detail={yearOneCompDetail(compView)}
          tone={tone}
        />
        <MetricCard label={cumulativeCompLabel(5, compView)} value={formatCompactMoney(selectedFiveYear)} detail={cumulativeCompDetail(5, compView)} tone="neutral" />
        <MetricCard label="5Y savings" value={formatCompactMoney(savingsFiveYear)} detail="Sum of years 1-5 savings after spending." tone="neutral" />
        <MetricCard label={cumulativeCompLabel(10, compView)} value={formatCompactMoney(selectedTenYear)} detail={cumulativeCompDetail(10, compView)} tone="neutral" />
        <MetricCard label="10Y savings" value={formatCompactMoney(savingsTenYear)} detail="Sum of years 1-10 savings after spending." tone="neutral" />
        <MetricCard label="10Y vested equity" value={formatCompactMoney(projection.totals.equity)} detail="Sum of vested equity across 10 years." tone="neutral" />
      </section>

      <section className="content-grid">
        <TrajectoryChart
          title={`${eyebrow} ${modeLabel(compView)} path`}
          subtitle={`${modeLabelTitle(compView)} compensation over ${HORIZON_YEARS} years in ${projection.region.label}.`}
          rows={projection.rows}
          lines={[
            {
              label: `${modeLabelTitle(compView)} incl. RSU`,
              color: tone === 'current' ? '#e6c470' : '#58d0d6',
              value: (row) => scenarioValueForMode(row, compView),
            },
          ]}
        />
        <EquityStackChart title={`${eyebrow} vested equity`} subtitle="Stacked by grant vintage." stacking={projection.stacking} />
      </section>

      <DataTable title={tableTitle} columns={tableColumns} rows={rows} renderRow={renderRow} />
    </>
  )
}

function DeltaPage({ currentProjection, offerProjection, deltaRows, compView, deltaTableColumns }) {
  const fiveYearDelta = deltaCumulativeValueForMode(deltaRows[4], compView)
  const tenYearDelta = deltaCumulativeValueForMode(deltaRows.at(-1), compView)
  const yearOneTakeHomeDelta = deltaRows[0]?.netDelta ?? 0
  const equityDelta = offerProjection.totals.equity - currentProjection.totals.equity

  return (
    <>
      <SummaryStrip
        eyebrow="Delta"
        title="The spread between staying and jumping."
        detail="Read the gap directly: cash mix, equity lift, tax drag, and the cumulative value that actually survives into take-home."
      />

      <section className="metrics-grid">
        <MetricCard label="Year 1 take-home delta" value={formatCompactMoney(yearOneTakeHomeDelta)} detail="Offer year 1 take-home minus current." tone={yearOneTakeHomeDelta >= 0 ? 'positive' : 'negative'} />
        <MetricCard label={`5Y cumulative ${modeLabel(compView)} delta`} value={formatCompactMoney(fiveYearDelta)} detail={`Offer minus current, summed for years 1-5 ${modeLabel(compView)}.`} tone={fiveYearDelta >= 0 ? 'positive' : 'negative'} />
        <MetricCard label={`10Y cumulative ${modeLabel(compView)} delta`} value={formatCompactMoney(tenYearDelta)} detail={`Offer minus current, summed for years 1-10 ${modeLabel(compView)}.`} tone={tenYearDelta >= 0 ? 'positive' : 'negative'} />
        <MetricCard label="10Y equity delta" value={formatCompactMoney(equityDelta)} detail="Offer vested equity minus current over 10 years." tone={equityDelta >= 0 ? 'positive' : 'negative'} />
      </section>

      <section className="content-grid">
        <TrajectoryChart
          title={`${modeLabelTitle(compView)} delta trajectory`}
          subtitle="Positive years favor the offer. Negative years expose dilution or weaker cash mix."
          rows={deltaRows}
          lines={[
            { label: `${modeLabelTitle(compView)} delta`, color: '#58d0d6', value: (row) => deltaValueForMode(row, compView) },
            { label: `Cumulative ${modeLabel(compView)} delta`, color: '#ee89be', value: (row) => deltaCumulativeValueForMode(row, compView) },
          ]}
        />
        <TrajectoryChart
          title={`Current vs offer ${modeLabel(compView)}`}
          subtitle={`A direct overlay of the two ${modeLabel(compView)} paths.`}
          rows={currentProjection.rows}
          lines={[
            { label: `Current ${modeLabel(compView)}`, color: '#e6c470', value: (_, index) => scenarioValueForMode(currentProjection.rows[index], compView) },
            { label: `Offer ${modeLabel(compView)}`, color: '#58d0d6', value: (_, index) => scenarioValueForMode(offerProjection.rows[index], compView) },
          ]}
        />
      </section>

      <DataTable
        title="Delta yearly breakdown"
        columns={deltaTableColumns}
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
            <td>{formatMoney(row.savingsDelta)}</td>
            <td>{formatMoney(row.cumulativeGrossDelta)}</td>
            <td>{formatMoney(row.cumulativeNetDelta)}</td>
            <td>{formatMoney(row.cumulativeSavingsDelta)}</td>
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
  const [compView, setCompView] = useState('net')
  const [storageStatus, setStorageStatus] = useState('Opening local workspace…')
  const [storageTone, setStorageTone] = useState('neutral')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const saved = await listScenarioRecords()
        const normalizedSaved = saved.map((record) => normalizeScenarioRecord(record))
        const seeded = normalizedSaved.length > 0 ? normalizedSaved : [createScenarioRecord('Base case')]

        if (saved.length === 0) {
          await saveScenarioRecord(seeded[0])
        }

        if (!cancelled) {
          setRecords(seeded)
          setActiveScenarioId(seeded[0].id)
          setStorageStatus('Saved locally only')
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

  const saveRecord = async (record, nextStatus = 'Saved locally only') => {
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
          [key]: key === 'regionCode' ? rawValue : rawValue === '' ? '' : Number(rawValue),
        },
      },
    }

    setRecords((current) => current.map((record) => (record.id === nextRecord.id ? nextRecord : record)))
    void saveRecord(nextRecord)
  }

  const addScenario = () => {
    const nextRecord = createScenarioRecord(`Scenario ${records.length + 1}`)
    setRecords((current) => [nextRecord, ...current])
    setActiveScenarioId(nextRecord.id)
    void saveRecord(nextRecord, 'New scenario saved locally')
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
    void saveRecord(nextRecord, 'Duplicate saved locally')
  }

  const removeScenario = async () => {
    if (!activeScenario || records.length === 1) return
    const nextRecords = records.filter((record) => record.id !== activeScenario.id)
    setRecords(nextRecords)
    setActiveScenarioId(nextRecords[0]?.id ?? null)

    try {
      await deleteScenarioRecord(activeScenario.id)
      setStorageStatus('Scenario removed')
      setStorageTone('success')
    } catch (error) {
      setStorageStatus(`Delete failed: ${error instanceof Error ? error.message : String(error)}`)
      setStorageTone('warning')
    }
  }

  if (!activeScenario || !currentProjection || !offerProjection) {
    return <main className="loading-shell">Loading simulator…</main>
  }

  const sidebarContent =
    page === 'current' ? (
      <>
        <SidebarMeta activeScenario={activeScenario} storageStatus={storageStatus} storageTone={storageTone} />
        <ScenarioForm title="Current role" accent="current" settings={activeScenario.settings.current} onChange={(key, value) => updateScenario('current', key, value)} />
        <TransparencyCard />
      </>
    ) : page === 'offer' ? (
      <>
        <SidebarMeta activeScenario={activeScenario} storageStatus={storageStatus} storageTone={storageTone} />
        <ScenarioForm title="New offer" accent="offer" settings={activeScenario.settings.offer} onChange={(key, value) => updateScenario('offer', key, value)} />
        <TransparencyCard />
      </>
    ) : (
      <DeltaSidebar activeScenario={activeScenario} currentProjection={currentProjection} offerProjection={offerProjection} storageStatus={storageStatus} storageTone={storageTone} />
    )

  const scenarioTableColumns = [
    { label: 'Year', tooltip: 'Projection year number.' },
    { label: 'Base', tooltip: 'Base salary for that year.' },
    { label: 'Variable', tooltip: 'Base x target x attainment.' },
    { label: 'RSU Grant', tooltip: 'Vested equity recognized that year.' },
    { label: 'Gross (Base+Var)', tooltip: 'Base plus variable only.' },
    { label: 'Total Gross', tooltip: 'Cash gross plus vested equity.' },
    { label: 'Tax Rate', tooltip: 'Estimated tax divided by total gross.' },
    { label: 'Net (Base+Var)', tooltip: 'Cash gross minus estimated tax on cash gross.' },
    { label: 'Net (inc. RSU)', tooltip: 'Total gross minus estimated tax on total gross.' },
    { label: 'Total income', tooltip: 'Total net income after tax including vested equity — the figure from which savings are derived.' },
    { label: 'Savings', tooltip: 'Net incl. RSU minus annualized monthly spend.' },
  ]

  const deltaTableColumns = [
    { label: 'Year', tooltip: 'Projection year number.' },
    { label: 'Base Delta', tooltip: 'Offer base minus current base.' },
    { label: 'Variable Delta', tooltip: 'Offer variable minus current variable.' },
    { label: 'RSU Delta', tooltip: 'Offer vested equity minus current vested equity.' },
    { label: 'Gross Delta', tooltip: 'Offer cash gross minus current cash gross.' },
    { label: 'Total Gross Delta', tooltip: 'Offer total gross minus current total gross.' },
    { label: 'Net Delta', tooltip: 'Offer net incl. RSU minus current net incl. RSU.' },
    { label: 'Savings Delta', tooltip: 'Offer savings minus current savings using annualized monthly spend.' },
    { label: 'Cum. Gross Delta', tooltip: 'Running total of total gross deltas.' },
    { label: 'Cum. Net Delta', tooltip: 'Running total of net deltas.' },
    { label: 'Cum. Savings Delta', tooltip: 'Running total of savings deltas.' },
  ]

  return (
    <main className="simulator-shell">
      <CommandBar
        activeScenario={activeScenario}
        compView={compView}
        page={page}
        records={records}
        onCompViewChange={setCompView}
        onPageChange={setPage}
        onSelect={setActiveScenarioId}
        onCreate={addScenario}
        onDuplicate={duplicateScenario}
        onDelete={removeScenario}
      />

      <div className="simulator-body">
        <aside className="control-panel">{sidebarContent}</aside>

        <section className="workspace">
          {page === 'current' ? (
            <DetailPage
              eyebrow="Current role"
              title="Current role baseline"
              detail="A clean read of what your existing package already does over the next decade."
              tone="current"
              projection={currentProjection}
              compView={compView}
              rows={currentProjection.rows}
              tableTitle="Current role yearly breakdown"
              tableColumns={scenarioTableColumns}
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
                  <td>{formatMoney(row.netWithRsu)}</td>
                  <td>{formatMoney(row.savings)}</td>
                </tr>
              )}
            />
          ) : null}

          {page === 'offer' ? (
            <DetailPage
              eyebrow="New offer"
              title="New offer package"
              detail="The same readout structure, with only the offer assumptions swapped underneath it."
              tone="offer"
              projection={offerProjection}
              compView={compView}
              rows={offerProjection.rows}
              tableTitle="New offer yearly breakdown"
              tableColumns={scenarioTableColumns}
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
                  <td>{formatMoney(row.netWithRsu)}</td>
                  <td>{formatMoney(row.savings)}</td>
                </tr>
              )}
            />
          ) : null}

          {page === 'delta' ? <DeltaPage currentProjection={currentProjection} offerProjection={offerProjection} deltaRows={deltaRows} compView={compView} deltaTableColumns={deltaTableColumns} /> : null}
        </section>
      </div>
    </main>
  )
}

export default App
