export const HORIZON_YEARS = 10

const DEFAULT_SCENARIO_SETTINGS = {
  current: {
    regionCode: 'ON',
    baseSalary: 162000,
    monthlySpend: 0,
    annualRaisePct: 4,
    variableTargetPct: 12,
    quotaAttainmentPct: 100,
    initialGrantValue: 90000,
    vestingYears: 4,
    refresherGrantValue: 28000,
    refresherStartYear: 2,
    stockGrowthPct: 8,
  },
  offer: {
    regionCode: 'ON',
    baseSalary: 198000,
    monthlySpend: 0,
    annualRaisePct: 5,
    variableTargetPct: 15,
    quotaAttainmentPct: 105,
    initialGrantValue: 220000,
    vestingYears: 4,
    refresherGrantValue: 55000,
    refresherStartYear: 2,
    stockGrowthPct: 11,
  },
}

const FEDERAL_TAX = {
  basicPersonalAmount: 15705,
  brackets: [
    { upTo: 57375, rate: 0.15 },
    { upTo: 114750, rate: 0.205 },
    { upTo: 177882, rate: 0.26 },
    { upTo: 253414, rate: 0.29 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.33 },
  ],
}

export const REGION_OPTIONS = [
  {
    code: 'ON',
    label: 'Ontario',
    basicPersonalAmount: 12399,
    brackets: [
      { upTo: 52886, rate: 0.0505 },
      { upTo: 105775, rate: 0.0915 },
      { upTo: 150000, rate: 0.1116 },
      { upTo: 220000, rate: 0.1216 },
      { upTo: Number.POSITIVE_INFINITY, rate: 0.1316 },
    ],
  },
  {
    code: 'BC',
    label: 'British Columbia',
    basicPersonalAmount: 12580,
    brackets: [
      { upTo: 47937, rate: 0.0506 },
      { upTo: 95875, rate: 0.077 },
      { upTo: 110076, rate: 0.105 },
      { upTo: 133664, rate: 0.1229 },
      { upTo: 181232, rate: 0.147 },
      { upTo: Number.POSITIVE_INFINITY, rate: 0.168 },
    ],
  },
  {
    code: 'AB',
    label: 'Alberta',
    basicPersonalAmount: 21885,
    brackets: [
      { upTo: 151234, rate: 0.1 },
      { upTo: 181481, rate: 0.12 },
      { upTo: 241974, rate: 0.13 },
      { upTo: 362961, rate: 0.14 },
      { upTo: Number.POSITIVE_INFINITY, rate: 0.15 },
    ],
  },
  {
    code: 'QC',
    label: 'Quebec',
    basicPersonalAmount: 18056,
    brackets: [
      { upTo: 53255, rate: 0.14 },
      { upTo: 106495, rate: 0.19 },
      { upTo: 129590, rate: 0.24 },
      { upTo: Number.POSITIVE_INFINITY, rate: 0.2575 },
    ],
  },
  {
    code: 'NS',
    label: 'Nova Scotia',
    basicPersonalAmount: 8744,
    brackets: [
      { upTo: 29590, rate: 0.0879 },
      { upTo: 59180, rate: 0.1495 },
      { upTo: 93000, rate: 0.1667 },
      { upTo: 150000, rate: 0.175 },
      { upTo: Number.POSITIVE_INFINITY, rate: 0.21 },
    ],
  },
]

const STACK_COLORS = ['#ffdf8c', '#5ce1e6', '#92a8ff', '#f4a5ff', '#85f1b1', '#ff9d82']

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clampPercent(value) {
  return number(value) / 100
}

function computeBracketTax(income, brackets) {
  let remaining = Math.max(0, income)
  let lowerBound = 0
  let total = 0

  for (const bracket of brackets) {
    if (remaining <= 0) break
    const ceiling = bracket.upTo
    const taxableSlice = Math.min(remaining, ceiling - lowerBound)
    total += taxableSlice * bracket.rate
    remaining -= taxableSlice
    lowerBound = ceiling
  }

  return total
}

function findRegion(regionCode) {
  return REGION_OPTIONS.find((region) => region.code === regionCode) ?? REGION_OPTIONS[0]
}

export function estimateTax(income, regionCode) {
  const region = findRegion(regionCode)
  const federalRaw = computeBracketTax(income, FEDERAL_TAX.brackets)
  const regionalRaw = computeBracketTax(income, region.brackets)
  const federalCredit = FEDERAL_TAX.basicPersonalAmount * FEDERAL_TAX.brackets[0].rate
  const regionalCredit = region.basicPersonalAmount * region.brackets[0].rate
  const totalTax = Math.max(0, federalRaw - federalCredit) + Math.max(0, regionalRaw - regionalCredit)

  return {
    amount: totalTax,
    effectiveRate: income > 0 ? totalTax / income : 0,
    region,
  }
}

function vestGrantValue(grantValue, yearsSinceGrant, vestYears, stockGrowthRate) {
  if (yearsSinceGrant < 0 || yearsSinceGrant >= vestYears) return 0
  const annualVestValue = grantValue / vestYears
  return annualVestValue * Math.pow(1 + stockGrowthRate, yearsSinceGrant)
}

function createGrantSchedule(settings) {
  const grants = []
  const initialGrantValue = Math.max(0, number(settings.initialGrantValue))
  const refresherGrantValue = Math.max(0, number(settings.refresherGrantValue))
  const refresherStartYear = Math.max(2, Math.min(HORIZON_YEARS, Math.round(number(settings.refresherStartYear) || 2)))

  if (initialGrantValue > 0) {
    grants.push({ id: 'initial', label: 'Initial grant', grantYear: 1, value: initialGrantValue, color: STACK_COLORS[0] })
  }

  for (let year = refresherStartYear; year <= HORIZON_YEARS; year += 1) {
    if (refresherGrantValue <= 0) continue
    grants.push({
      id: `refresh-${year}`,
      label: `Refresh Y${year}`,
      grantYear: year,
      value: refresherGrantValue,
      color: STACK_COLORS[(year - refresherStartYear + 1) % STACK_COLORS.length],
    })
  }

  return grants
}

export function calculateScenario(settings) {
  const regionCode = settings.regionCode || REGION_OPTIONS[0].code
  const annualRaiseRate = clampPercent(settings.annualRaisePct)
  const variableTargetRate = clampPercent(settings.variableTargetPct)
  const quotaAttainmentRate = clampPercent(settings.quotaAttainmentPct)
  const stockGrowthRate = clampPercent(settings.stockGrowthPct)
  const vestYears = Math.max(1, Math.min(5, Math.round(number(settings.vestingYears) || 4)))
  const baseSalary = Math.max(0, number(settings.baseSalary))
  const annualSpend = Math.max(0, number(settings.monthlySpend)) * 12
  const grants = createGrantSchedule(settings)

  const rows = []
  const stacking = []

  for (let year = 1; year <= HORIZON_YEARS; year += 1) {
    const base = baseSalary * Math.pow(1 + annualRaiseRate, year - 1)
    const variable = base * variableTargetRate * quotaAttainmentRate
    const gross = base + variable

    const equitySegments = grants
      .map((grant) => {
        const vested = vestGrantValue(grant.value, year - grant.grantYear, vestYears, stockGrowthRate)
        return vested > 0 ? { ...grant, vested } : null
      })
      .filter(Boolean)

    const rsuGrant = equitySegments.reduce((sum, segment) => sum + segment.vested, 0)
    const totalGross = gross + rsuGrant
    const grossTax = estimateTax(gross, regionCode)
    const totalTax = estimateTax(totalGross, regionCode)
    const net = gross - grossTax.amount
    const netWithRsu = totalGross - totalTax.amount
    const savings = netWithRsu - annualSpend

    rows.push({
      year,
      base,
      variable,
      rsuGrant,
      gross,
      totalGross,
      taxRate: totalTax.effectiveRate,
      net,
      netWithRsu,
      annualSpend,
      savings,
    })

    stacking.push({
      year,
      total: rsuGrant,
      segments: equitySegments,
    })
  }

  const totals = rows.reduce(
    (accumulator, row) => ({
      gross: accumulator.gross + row.totalGross,
      net: accumulator.net + row.netWithRsu,
      savings: accumulator.savings + row.savings,
      cash: accumulator.cash + row.gross,
      cashNet: accumulator.cashNet + row.net,
      equity: accumulator.equity + row.rsuGrant,
    }),
    { gross: 0, net: 0, savings: 0, cash: 0, cashNet: 0, equity: 0 },
  )

  return {
    region: findRegion(regionCode),
    rows,
    stacking,
    totals,
    grants,
  }
}

export function calculateDelta(currentScenario, offerScenario) {
  return currentScenario.rows.map((currentRow, index) => {
    const offerRow = offerScenario.rows[index]
    return {
      year: currentRow.year,
      baseDelta: offerRow.base - currentRow.base,
      variableDelta: offerRow.variable - currentRow.variable,
      rsuDelta: offerRow.rsuGrant - currentRow.rsuGrant,
      grossDelta: offerRow.gross - currentRow.gross,
      totalGrossDelta: offerRow.totalGross - currentRow.totalGross,
      netDelta: offerRow.netWithRsu - currentRow.netWithRsu,
      savingsDelta: offerRow.savings - currentRow.savings,
    }
  }).reduce((rows, row) => {
    const previous = rows.at(-1)
    rows.push({
      ...row,
      cumulativeGrossDelta: (previous?.cumulativeGrossDelta ?? 0) + row.totalGrossDelta,
      cumulativeNetDelta: (previous?.cumulativeNetDelta ?? 0) + row.netDelta,
      cumulativeSavingsDelta: (previous?.cumulativeSavingsDelta ?? 0) + row.savingsDelta,
    })
    return rows
  }, [])
}

export function createScenarioRecord(name = 'Offer duel') {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  return {
    id,
    name,
    updatedAt: now,
    settings: structuredClone(DEFAULT_SCENARIO_SETTINGS),
  }
}

export function normalizeScenarioRecord(record) {
  const defaults = structuredClone(DEFAULT_SCENARIO_SETTINGS)

  return {
    id: record?.id ?? crypto.randomUUID(),
    name: record?.name ?? 'Offer duel',
    updatedAt: record?.updatedAt ?? new Date().toISOString(),
    settings: {
      current: {
        ...defaults.current,
        ...(record?.settings?.current ?? {}),
      },
      offer: {
        ...defaults.offer,
        ...(record?.settings?.offer ?? {}),
      },
    },
  }
}
