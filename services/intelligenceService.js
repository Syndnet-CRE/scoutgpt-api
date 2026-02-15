// ══════════════════════════════════════════════════════════════
// ScoutGPT v2 — CRE Intelligence Service
// File: services/intelligenceService.js
// 
// Drop into ~/scoutgpt-api/services/
// Provides: getPropertyIntelligence, getComparableSales,
//           getOwnerPortfolio, getDistressedProperties,
//           getOpportunityProperties
//
// All SQL uses parameterized queries against Neon PostgreSQL.
// Column names match ATTOM schema exactly.
// ══════════════════════════════════════════════════════════════

const pool = require('../db/pool');

// ──────────────────────────────────────────────────────────────
// HELPER: Owner name normalization (mirrors the SQL function)
// ──────────────────────────────────────────────────────────────
function normalizeOwnerName(raw) {
  if (!raw) return null;
  return raw
    .toUpperCase()
    .trim()
    .replace(/\s+(LLC|L\.L\.C\.|INC|INCORPORATED|CORP|CORPORATION|LTD|LIMITED|LP|L\.P\.|LLP|TRUST|TRUSTEE|REVOCABLE|IRREVOCABLE|LIVING TRUST|FAMILY TRUST|CO|COMPANY|ENTERPRISES|HOLDINGS|PROPERTIES|GROUP|PARTNERS|PARTNERSHIP|ASSOCIATES|MGMT|MANAGEMENT|INVESTMENTS|CAPITAL|REALTY|REAL ESTATE|DEVELOPMENT|DEV|VENTURES)\s*$/gi, '')
    .replace(/,\s*$/, '')
    .replace(/\.\s*$/, '')
    .replace(/^THE\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ──────────────────────────────────────────────────────────────
// 1. PROPERTY INTELLIGENCE — All derived metrics for one property
// ──────────────────────────────────────────────────────────────
async function getPropertyIntelligence(attomId) {
  const query = `
    WITH latest_valuation AS (
      SELECT 
        estimated_value,
        estimated_min_value,
        estimated_max_value,
        confidence_score,
        estimated_rental_value,
        available_equity AS avm_available_equity,
        lendable_equity AS avm_lendable_equity,
        ltv AS avm_ltv,
        valuation_date
      FROM property_valuations
      WHERE attom_id = $1
      ORDER BY valuation_date DESC
      LIMIT 1
    ),
    latest_tax AS (
      SELECT 
        tax_year,
        assessed_value_total,
        assessed_value_land,
        assessed_value_improvements,
        market_value_total,
        market_value_land,
        market_value_improvements,
        tax_amount_billed,
        has_homeowner_exemption,
        has_senior_exemption,
        tax_delinquent_year
      FROM tax_assessments
      WHERE attom_id = $1
      ORDER BY tax_year DESC
      LIMIT 1
    ),
    loan_summary AS (
      SELECT
        COUNT(*) AS loan_count,
        SUM(estimated_balance) AS total_loan_balance,
        SUM(loan_amount) AS total_original_amount,
        MAX(interest_rate) AS highest_rate,
        MIN(recording_date) AS earliest_origination
      FROM current_loans
      WHERE attom_id = $1
    ),
    current_owner AS (
      SELECT
        owner1_name_full,
        owner2_name_full,
        ownership_type,
        company_flag,
        trust_flag,
        is_owner_occupied,
        is_absentee_owner,
        mail_address_full,
        ownership_transfer_date
      FROM ownership
      WHERE attom_id = $1 AND ownership_sequence = 1
    ),
    latest_sale AS (
      SELECT
        sale_price,
        recording_date,
        is_arms_length,
        is_distressed,
        is_foreclosure_auction,
        grantee_investor_flag,
        grantor1_name_full,
        grantee1_name_full
      FROM sales_transactions
      WHERE attom_id = $1 AND sale_price > 0
      ORDER BY recording_date DESC
      LIMIT 1
    ),
    sale_count AS (
      SELECT COUNT(*) AS total_sales
      FROM sales_transactions
      WHERE attom_id = $1 AND is_arms_length = true AND sale_price > 0
    ),
    foreclosure_check AS (
      SELECT
        id,
        record_type,
        foreclosure_recording_date,
        auction_date,
        default_amount,
        loan_balance,
        status
      FROM foreclosure_records
      WHERE attom_id = $1
      ORDER BY foreclosure_recording_date DESC
      LIMIT 1
    ),
    permit_summary AS (
      SELECT
        COUNT(*) AS total_permits,
        SUM(COALESCE(job_value, 0)) AS total_permit_value,
        MAX(effective_date) AS most_recent_permit,
        COUNT(*) FILTER (WHERE effective_date > CURRENT_DATE - INTERVAL '3 years') AS recent_permits_3yr,
        SUM(COALESCE(job_value, 0)) FILTER (WHERE effective_date > CURRENT_DATE - INTERVAL '3 years') AS recent_permit_value_3yr
      FROM building_permits
      WHERE attom_id = $1
    ),
    climate AS (
      SELECT
        total_risk_score,
        flood_risk_score,
        heat_risk_score,
        storm_risk_score,
        drought_risk_score,
        wildfire_risk_score
      FROM climate_risk
      WHERE attom_id = $1
    ),
    flip_check AS (
      SELECT
        s1.sale_price AS buy_price,
        s1.recording_date AS buy_date,
        s2.sale_price AS sell_price,
        s2.recording_date AS sell_date,
        (s2.recording_date - s1.recording_date) AS hold_days,
        ROUND(((s2.sale_price - s1.sale_price)::numeric / NULLIF(s1.sale_price, 0) * 100), 1) AS return_pct
      FROM sales_transactions s1
      JOIN sales_transactions s2
        ON s1.attom_id = s2.attom_id
        AND s2.recording_date > s1.recording_date
        AND s2.recording_date <= s1.recording_date + INTERVAL '24 months'
      WHERE s1.attom_id = $1
        AND s1.is_arms_length = true
        AND s2.is_arms_length = true
        AND s1.sale_price > 10000
        AND s2.sale_price > s1.sale_price
      ORDER BY s2.recording_date DESC
      LIMIT 1
    )
    SELECT
      -- Core property
      p.attom_id,
      p.address_full,
      p.property_use_standardized,
      p.year_built,
      p.area_building,
      p.area_lot_sf,
      p.last_sale_price,
      p.last_sale_date,
      p.bedrooms_count,
      p.bath_count,

      -- ═══ DERIVED METRIC 1: Estimated Equity Position ═══
      v.estimated_value AS avm_value,
      ls.total_loan_balance,
      (v.estimated_value - COALESCE(ls.total_loan_balance, 0)) AS estimated_equity,
      CASE 
        WHEN v.estimated_value > 0 THEN
          ROUND(((v.estimated_value - COALESCE(ls.total_loan_balance, 0)) / v.estimated_value * 100)::numeric, 1)
        ELSE NULL
      END AS equity_percent,
      CASE
        WHEN COALESCE(ls.total_loan_balance, 0) = 0 THEN 'FREE_AND_CLEAR'
        WHEN v.estimated_value > 0 AND (v.estimated_value - COALESCE(ls.total_loan_balance, 0)) / v.estimated_value > 0.7 THEN 'HIGH_EQUITY'
        WHEN v.estimated_value > 0 AND (v.estimated_value - COALESCE(ls.total_loan_balance, 0)) / v.estimated_value > 0.4 THEN 'MODERATE_EQUITY'
        WHEN v.estimated_value > 0 AND (v.estimated_value - COALESCE(ls.total_loan_balance, 0)) / v.estimated_value > 0.2 THEN 'LOW_EQUITY'
        WHEN v.estimated_value > 0 AND (v.estimated_value - COALESCE(ls.total_loan_balance, 0)) / v.estimated_value > 0 THEN 'THIN_EQUITY'
        WHEN v.estimated_value > 0 THEN 'UNDERWATER'
        ELSE 'UNKNOWN'
      END AS equity_band,

      -- ═══ DERIVED METRIC 2: Price Per SF / Acre ═══
      CASE
        WHEN p.property_use_standardized ILIKE '%vacant%' OR p.property_use_standardized ILIKE '%land%'
          OR p.area_building IS NULL OR p.area_building = 0
        THEN ROUND((p.last_sale_price / NULLIF(p.area_lot_sf / 43560.0, 0))::numeric, 0)
        ELSE ROUND((p.last_sale_price / NULLIF(p.area_building, 0))::numeric, 2)
      END AS price_per_unit,
      CASE
        WHEN p.property_use_standardized ILIKE '%vacant%' OR p.property_use_standardized ILIKE '%land%'
          OR p.area_building IS NULL OR p.area_building = 0
        THEN 'per_acre'
        ELSE 'per_sf'
      END AS price_unit_type,

      -- ═══ DERIVED METRIC 3: Assessed-to-Market Ratio ═══
      t.market_value_total AS county_market_value,
      CASE WHEN v.estimated_value > 0 THEN
        ROUND((t.market_value_total::numeric / v.estimated_value), 3)
      ELSE NULL END AS assessment_ratio,
      CASE
        WHEN t.market_value_total < v.estimated_value * 0.7 THEN 'UNDER_ASSESSED'
        WHEN t.market_value_total > v.estimated_value * 1.15 THEN 'OVER_ASSESSED'
        ELSE 'ALIGNED'
      END AS assessment_signal,

      -- ═══ DERIVED METRIC 4: Dynamic LTV ═══
      CASE WHEN v.estimated_value > 0 AND ls.total_loan_balance IS NOT NULL THEN
        ROUND((ls.total_loan_balance / v.estimated_value * 100)::numeric, 1)
      ELSE NULL END AS current_ltv,
      CASE
        WHEN ls.total_loan_balance IS NULL OR ls.total_loan_balance = 0 THEN 'NO_DEBT'
        WHEN v.estimated_value > 0 AND ls.total_loan_balance / v.estimated_value > 1.0 THEN 'UNDERWATER'
        WHEN v.estimated_value > 0 AND ls.total_loan_balance / v.estimated_value > 0.9 THEN 'HIGH_RISK'
        WHEN v.estimated_value > 0 AND ls.total_loan_balance / v.estimated_value > 0.8 THEN 'ELEVATED'
        ELSE 'NORMAL'
      END AS ltv_risk_band,

      -- ═══ DERIVED METRIC 5: Ownership Duration ═══
      o.owner1_name_full,
      o.ownership_transfer_date,
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, o.ownership_transfer_date))::int AS years_held,
      EXTRACT(DAY FROM AGE(CURRENT_DATE, o.ownership_transfer_date))::int AS days_held,
      CASE
        WHEN o.ownership_transfer_date < CURRENT_DATE - INTERVAL '15 years' THEN 'LONG_TERM_15PLUS'
        WHEN o.ownership_transfer_date < CURRENT_DATE - INTERVAL '10 years' THEN 'SEASONED_10_15'
        WHEN o.ownership_transfer_date < CURRENT_DATE - INTERVAL '5 years' THEN 'MID_TERM_5_10'
        WHEN o.ownership_transfer_date < CURRENT_DATE - INTERVAL '2 years' THEN 'RECENT_2_5'
        ELSE 'VERY_RECENT'
      END AS hold_signal,

      -- ═══ DERIVED METRIC 6: Effective Tax Rate ═══
      t.tax_amount_billed,
      CASE WHEN t.market_value_total > 0 THEN
        ROUND((t.tax_amount_billed::numeric / t.market_value_total * 100), 3)
      ELSE NULL END AS effective_tax_rate,
      CASE
        WHEN t.market_value_total > 0 AND t.tax_amount_billed::numeric / t.market_value_total > 0.025 THEN 'HIGH_TAX'
        WHEN t.market_value_total > 0 AND t.tax_amount_billed::numeric / t.market_value_total < 0.015 THEN 'LOW_TAX'
        ELSE 'NORMAL_TAX'
      END AS tax_burden_signal,

      -- ═══ DERIVED METRIC 7: Improvement Ratio ═══
      t.assessed_value_land,
      t.assessed_value_improvements,
      CASE WHEN t.assessed_value_total > 0 THEN
        ROUND((t.assessed_value_improvements::numeric / t.assessed_value_total * 100), 1)
      ELSE NULL END AS improvement_ratio,
      CASE
        WHEN t.assessed_value_total > 0 AND t.assessed_value_improvements::numeric / t.assessed_value_total < 0.20 THEN 'REDEVELOPMENT_CANDIDATE'
        WHEN t.assessed_value_total > 0 AND t.assessed_value_improvements::numeric / t.assessed_value_total < 0.40 THEN 'UNDER_IMPROVED'
        WHEN t.assessed_value_total > 0 AND t.assessed_value_improvements::numeric / t.assessed_value_total > 0.80 THEN 'HEAVILY_IMPROVED'
        ELSE 'BALANCED'
      END AS improvement_signal,

      -- ═══ DERIVED METRIC 8: Investment Property Detection ═══
      o.company_flag,
      o.trust_flag,
      o.is_owner_occupied,
      o.is_absentee_owner,
      t.has_homeowner_exemption,
      (
        CASE WHEN o.is_absentee_owner = true THEN 25 ELSE 0 END +
        CASE WHEN o.company_flag = true THEN 25 ELSE 0 END +
        CASE WHEN o.trust_flag = true THEN 10 ELSE 0 END +
        CASE WHEN o.is_owner_occupied = false THEN 15 ELSE 0 END +
        CASE WHEN t.has_homeowner_exemption = false OR t.has_homeowner_exemption IS NULL THEN 15 ELSE 0 END +
        CASE WHEN sale.grantee_investor_flag = true THEN 10 ELSE 0 END
      ) AS investment_confidence,
      CASE
        WHEN o.company_flag = true AND o.is_absentee_owner = true THEN 'DEFINITE_INVESTOR'
        WHEN o.is_absentee_owner = true AND (t.has_homeowner_exemption = false OR t.has_homeowner_exemption IS NULL) THEN 'LIKELY_INVESTOR'
        WHEN o.is_owner_occupied = true AND t.has_homeowner_exemption = true THEN 'OWNER_OCCUPIED'
        ELSE 'INDETERMINATE'
      END AS investor_classification,

      -- ═══ DERIVED METRIC 9: Building Class Estimate ═══
      CASE
        WHEN p.year_built >= 2015 THEN 'A'
        WHEN p.year_built >= 1995 THEN 'B'
        WHEN p.year_built >= 1975 THEN 'C'
        WHEN p.year_built IS NOT NULL THEN 'D'
        ELSE NULL
      END AS building_class,
      (EXTRACT(YEAR FROM CURRENT_DATE) - p.year_built)::int AS building_age,

      -- ═══ DERIVED METRIC 10: Renovation Activity ═══
      ps.total_permits,
      ps.total_permit_value,
      ps.most_recent_permit,
      ps.recent_permits_3yr,
      ps.recent_permit_value_3yr,
      CASE
        WHEN ps.recent_permits_3yr >= 3 AND ps.recent_permit_value_3yr > 100000 THEN 'HIGH_ACTIVITY'
        WHEN ps.recent_permits_3yr >= 1 THEN 'MODERATE_ACTIVITY'
        WHEN ps.total_permits = 0 AND p.year_built < EXTRACT(YEAR FROM CURRENT_DATE) - 30 THEN 'DEFERRED_MAINTENANCE'
        ELSE 'LOW_ACTIVITY'
      END AS renovation_signal,

      -- ═══ DERIVED METRIC 11: Days Since Last Sale ═══
      CASE WHEN p.last_sale_date IS NOT NULL THEN
        (CURRENT_DATE - p.last_sale_date::date)::int
      ELSE NULL END AS days_since_last_sale,

      -- ═══ COMPOSITE: Distress Score (0-100) ═══
      (
        CASE WHEN fc.id IS NOT NULL AND fc.foreclosure_recording_date > CURRENT_DATE - INTERVAL '2 years' THEN 30 ELSE 0 END +
        CASE WHEN t.tax_delinquent_year IS NOT NULL THEN
          CASE WHEN t.tax_delinquent_year::int < EXTRACT(YEAR FROM CURRENT_DATE) - 2 THEN 20 ELSE 15 END
        ELSE 0 END +
        CASE
          WHEN v.estimated_value > 0 AND ls.total_loan_balance > v.estimated_value THEN 20
          WHEN v.estimated_value > 0 AND ls.total_loan_balance > v.estimated_value * 0.9 THEN 15
          WHEN v.estimated_value > 0 AND ls.total_loan_balance > v.estimated_value * 0.8 THEN 10
          ELSE 0 END +
        CASE WHEN sale.is_distressed = true THEN 10 ELSE 0 END +
        CASE WHEN o.ownership_transfer_date < CURRENT_DATE - INTERVAL '15 years'
          AND ls.earliest_origination < CURRENT_DATE - INTERVAL '12 years' THEN 5 ELSE 0 END +
        CASE WHEN p.year_built < EXTRACT(YEAR FROM CURRENT_DATE) - 30
          AND ps.total_permits = 0 THEN 5 ELSE 0 END
      ) AS distress_score,

      -- ═══ COMPOSITE: Opportunity Score (0-100) ═══
      (
        CASE WHEN v.estimated_value > 0 AND (v.estimated_value - COALESCE(ls.total_loan_balance, 0)) / v.estimated_value > 0.5 THEN 20 ELSE 0 END +
        CASE WHEN COALESCE(ls.total_loan_balance, 0) = 0 THEN 10 ELSE 0 END +
        CASE WHEN o.is_absentee_owner = true THEN 15 ELSE 0 END +
        CASE WHEN o.ownership_transfer_date < CURRENT_DATE - INTERVAL '10 years' THEN 10 ELSE 0 END +
        CASE WHEN v.estimated_value > 0 AND t.market_value_total < v.estimated_value * 0.7 THEN 10 ELSE 0 END +
        CASE WHEN p.year_built < EXTRACT(YEAR FROM CURRENT_DATE) - 30 THEN 10 ELSE 0 END +
        CASE WHEN ps.recent_permits_3yr = 0 THEN 10 ELSE 0 END +
        CASE WHEN cl.total_risk_score < 30 OR cl.total_risk_score IS NULL THEN 5 ELSE 0 END +
        CASE WHEN v.confidence_score > 80 THEN 5 ELSE 0 END +
        CASE WHEN o.company_flag = true OR o.trust_flag = true THEN 5 ELSE 0 END
      ) AS opportunity_score,

      -- ═══ COMPOSITE: Seller Motivation Score (0-100) ═══
      (
        CASE WHEN fc.id IS NOT NULL THEN 25 ELSE 0 END +
        CASE WHEN t.tax_delinquent_year IS NOT NULL THEN 15 ELSE 0 END +
        CASE WHEN o.is_absentee_owner = true AND o.ownership_transfer_date < CURRENT_DATE - INTERVAL '10 years' THEN 15 ELSE 0 END +
        CASE WHEN o.trust_flag = true THEN 10 ELSE 0 END +
        CASE WHEN COALESCE(ls.total_loan_balance, 0) = 0 AND p.year_built < 1990 THEN 10 ELSE 0 END +
        CASE WHEN t.market_value_total > 0 AND t.tax_amount_billed::numeric / t.market_value_total > 0.025 THEN 10 ELSE 0 END +
        CASE WHEN v.estimated_value > 0 AND ls.total_loan_balance > v.estimated_value * 0.8 THEN 10 ELSE 0 END +
        CASE WHEN o.is_absentee_owner = true AND (t.has_homeowner_exemption = false OR t.has_homeowner_exemption IS NULL) THEN 5 ELSE 0 END
      ) AS motivation_score,

      -- ═══ Flip Detection ═══
      flip.buy_price AS flip_buy_price,
      flip.buy_date AS flip_buy_date,
      flip.sell_price AS flip_sell_price,
      flip.sell_date AS flip_sell_date,
      flip.hold_days AS flip_hold_days,
      flip.return_pct AS flip_return_pct,

      -- ═══ Vacancy/Abandonment Probability Score ═══
      (
        CASE WHEN o.is_absentee_owner = true THEN 20 ELSE 0 END +
        CASE WHEN t.has_homeowner_exemption = false OR t.has_homeowner_exemption IS NULL THEN 15 ELSE 0 END +
        CASE WHEN t.tax_delinquent_year IS NOT NULL THEN 25 ELSE 0 END +
        CASE WHEN ps.total_permits = 0 AND p.year_built < EXTRACT(YEAR FROM CURRENT_DATE) - 20 THEN 20 ELSE 0 END +
        CASE WHEN v.confidence_score < 50 OR v.confidence_score IS NULL THEN 10 ELSE 0 END +
        CASE WHEN sc.total_sales = 0 THEN 10 ELSE 0 END
      ) AS vacancy_probability,

      -- ═══ Raw sub-query data for frontend ═══
      v.estimated_min_value AS avm_low,
      v.estimated_max_value AS avm_high,
      v.confidence_score AS avm_confidence,
      v.estimated_rental_value,
      v.valuation_date AS avm_date,
      v.avm_available_equity,
      v.avm_lendable_equity,
      ls.loan_count,
      ls.highest_rate AS highest_loan_rate,
      ls.earliest_origination,
      t.tax_year,
      t.assessed_value_total,
      t.tax_delinquent_year,
      t.has_senior_exemption,
      o.mail_address_full,
      o.ownership_type,
      o.owner2_name_full,
      fc.record_type AS foreclosure_type,
      fc.foreclosure_recording_date,
      fc.auction_date,
      fc.default_amount AS foreclosure_default,
      fc.status AS foreclosure_status,
      cl.total_risk_score AS climate_total,
      cl.flood_risk_score AS climate_flood,
      cl.heat_risk_score AS climate_heat,
      cl.storm_risk_score AS climate_storm,
      cl.drought_risk_score AS climate_drought,
      cl.wildfire_risk_score AS climate_wildfire,
      sale.grantee_investor_flag

    FROM properties p
    LEFT JOIN latest_valuation v ON true
    LEFT JOIN latest_tax t ON true
    LEFT JOIN loan_summary ls ON true
    LEFT JOIN current_owner o ON true
    LEFT JOIN latest_sale sale ON true
    LEFT JOIN sale_count sc ON true
    LEFT JOIN foreclosure_check fc ON true
    LEFT JOIN permit_summary ps ON true
    LEFT JOIN climate cl ON true
    LEFT JOIN flip_check flip ON true
    WHERE p.attom_id = $1;
  `;

  const { rows } = await pool.query(query, [attomId]);
  if (rows.length === 0) return null;
  
  const row = rows[0];

  // Format the response with camelCase for API consistency
  return {
    attomId: row.attom_id,
    addressFull: row.address_full,
    propertyUse: row.property_use_standardized,
    yearBuilt: row.year_built,
    areaBuilding: row.area_building,
    areaLotSf: row.area_lot_sf,
    buildingAge: row.building_age,
    buildingClass: row.building_class,

    // Equity & Valuation
    equity: {
      avmValue: Number(row.avm_value) || null,
      avmLow: Number(row.avm_low) || null,
      avmHigh: Number(row.avm_high) || null,
      avmConfidence: Number(row.avm_confidence) || null,
      avmDate: row.avm_date,
      estimatedRentalValue: Number(row.estimated_rental_value) || null,
      totalLoanBalance: Number(row.total_loan_balance) || null,
      estimatedEquity: Number(row.estimated_equity) || null,
      equityPercent: Number(row.equity_percent) || null,
      equityBand: row.equity_band,
      availableEquity: Number(row.avm_available_equity) || null,
      lendableEquity: Number(row.avm_lendable_equity) || null,
      currentLtv: Number(row.current_ltv) || null,
      ltvRiskBand: row.ltv_risk_band,
      loanCount: Number(row.loan_count) || 0,
      highestLoanRate: Number(row.highest_loan_rate) || null,
      earliestOrigination: row.earliest_origination,
    },

    // Price Analysis
    priceAnalysis: {
      lastSalePrice: Number(row.last_sale_price) || null,
      lastSaleDate: row.last_sale_date,
      pricePerUnit: Number(row.price_per_unit) || null,
      priceUnitType: row.price_unit_type,
      daysSinceLastSale: row.days_since_last_sale,
    },

    // Tax & Assessment
    taxAnalysis: {
      taxYear: row.tax_year,
      assessedValueTotal: Number(row.assessed_value_total) || null,
      assessedValueLand: Number(row.assessed_value_land) || null,
      assessedValueImprovements: Number(row.assessed_value_improvements) || null,
      countyMarketValue: Number(row.county_market_value) || null,
      taxAmountBilled: Number(row.tax_amount_billed) || null,
      effectiveTaxRate: Number(row.effective_tax_rate) || null,
      taxBurdenSignal: row.tax_burden_signal,
      assessmentRatio: Number(row.assessment_ratio) || null,
      assessmentSignal: row.assessment_signal,
      improvementRatio: Number(row.improvement_ratio) || null,
      improvementSignal: row.improvement_signal,
      hasHomeownerExemption: row.has_homeowner_exemption,
      hasSeniorExemption: row.has_senior_exemption,
      taxDelinquentYear: row.tax_delinquent_year,
    },

    // Ownership Intelligence
    ownership: {
      ownerName: row.owner1_name_full,
      owner2Name: row.owner2_name_full,
      ownershipType: row.ownership_type,
      companyFlag: row.company_flag,
      trustFlag: row.trust_flag,
      isOwnerOccupied: row.is_owner_occupied,
      isAbsenteeOwner: row.is_absentee_owner,
      mailAddress: row.mail_address_full,
      transferDate: row.ownership_transfer_date,
      yearsHeld: row.years_held,
      daysHeld: row.days_held,
      holdSignal: row.hold_signal,
      investmentConfidence: row.investment_confidence,
      investorClassification: row.investor_classification,
    },

    // Composite Scores
    scores: {
      distressScore: row.distress_score,
      opportunityScore: row.opportunity_score,
      motivationScore: row.motivation_score,
      vacancyProbability: row.vacancy_probability,
    },

    // Activity & Condition
    activity: {
      totalPermits: Number(row.total_permits) || 0,
      totalPermitValue: Number(row.total_permit_value) || 0,
      mostRecentPermit: row.most_recent_permit,
      recentPermits3yr: Number(row.recent_permits_3yr) || 0,
      recentPermitValue3yr: Number(row.recent_permit_value_3yr) || 0,
      renovationSignal: row.renovation_signal,
    },

    // Distress Indicators
    distressIndicators: {
      foreclosureType: row.foreclosure_type || null,
      foreclosureDate: row.foreclosure_recording_date || null,
      auctionDate: row.auction_date || null,
      foreclosureDefault: Number(row.foreclosure_default) || null,
      foreclosureStatus: row.foreclosure_status || null,
    },

    // Flip Detection
    flipHistory: row.flip_buy_price ? {
      buyPrice: Number(row.flip_buy_price),
      buyDate: row.flip_buy_date,
      sellPrice: Number(row.flip_sell_price),
      sellDate: row.flip_sell_date,
      holdDays: row.flip_hold_days,
      returnPct: Number(row.flip_return_pct),
    } : null,

    // Climate Risk
    climateRisk: {
      total: Number(row.climate_total) || null,
      flood: Number(row.climate_flood) || null,
      heat: Number(row.climate_heat) || null,
      storm: Number(row.climate_storm) || null,
      drought: Number(row.climate_drought) || null,
      wildfire: Number(row.climate_wildfire) || null,
    },
  };
}


// ──────────────────────────────────────────────────────────────
// 2. COMPARABLE SALES ENGINE — PostGIS spatial + structural match
// ──────────────────────────────────────────────────────────────
async function getComparableSales(attomId, options = {}) {
  const {
    radiusMiles = 3,
    sfTolerance = 0.3,
    yearTolerance = 15,
    monthsBack = 24,
    limit = 10
  } = options;

  const radiusMeters = Math.round(radiusMiles * 1609.34);
  const sfLow = (1 - sfTolerance).toFixed(2);
  const sfHigh = (1 + sfTolerance).toFixed(2);
  const maxDaysSince = Math.round(monthsBack * 30.44);

  const query = `
    WITH subject AS (
      SELECT p.attom_id, p.address_full, p.latitude, p.longitude, p.location,
             p.area_building, p.year_built, p.property_use_standardized,
             p.address_city, p.address_zip
      FROM properties p
      WHERE p.attom_id = $1
    ),
    comps AS (
      SELECT
        p2.attom_id,
        p2.address_full,
        p2.address_city,
        p2.address_zip,
        p2.latitude,
        p2.longitude,
        p2.area_building,
        p2.area_lot_acres,
        p2.year_built,
        p2.property_use_standardized,
        p2.bedrooms_count,
        p2.bath_count,
        p2.stories_count,
        st.sale_price,
        st.recording_date,
        st.is_arms_length,
        st.grantor1_name_full,
        st.grantee1_name_full,
        ROUND((ST_Distance(p2.location::geography, s.location::geography) / 1609.34)::numeric, 2) AS distance_miles,
        CASE WHEN p2.area_building > 0 THEN ROUND((st.sale_price / p2.area_building)::numeric, 2) ELSE NULL END AS price_per_sf
      FROM subject s
      CROSS JOIN LATERAL (
        SELECT p2.*
        FROM properties p2
        WHERE p2.attom_id != s.attom_id
          AND p2.location IS NOT NULL
          AND s.location IS NOT NULL
          AND ST_DWithin(p2.location::geography, s.location::geography, ${radiusMeters})
          AND p2.area_building BETWEEN s.area_building * ${sfLow} AND s.area_building * ${sfHigh}
          AND p2.year_built BETWEEN s.year_built - ${yearTolerance} AND s.year_built + ${yearTolerance}
      ) p2
      INNER JOIN sales_transactions st ON st.attom_id = p2.attom_id
        AND st.is_arms_length = true
        AND st.sale_price > 0
        AND st.recording_date > CURRENT_DATE - INTERVAL '${monthsBack} months'
    )
    SELECT c.*,
      ROUND((
        (1 - LEAST(c.distance_miles / ${radiusMiles}.0, 1.0)) * 30 +
        CASE WHEN c.area_building > 0 AND (SELECT area_building FROM subject) > 0
          THEN (1 - ABS(c.area_building - (SELECT area_building FROM subject))::numeric / GREATEST((SELECT area_building FROM subject), 1)) * 25
          ELSE 0 END +
        (1 - ABS(c.year_built - (SELECT year_built FROM subject))::numeric / ${yearTolerance}.0) * 15 +
        CASE WHEN c.property_use_standardized = (SELECT property_use_standardized FROM subject) THEN 10 ELSE 0 END +
        (1 - LEAST((CURRENT_DATE - c.recording_date::date)::numeric / ${maxDaysSince}.0, 1.0)) * 20
      )::numeric, 1) AS similarity_score
    FROM comps c
    ORDER BY similarity_score DESC
    LIMIT $2;
  `;

  try {
    const { rows } = await pool.query(query, [attomId, limit]);
    return rows;
  } catch (error) {
    console.error('[INTELLIGENCE] Comps query error:', error.message);
    return [];
  }
}


// ──────────────────────────────────────────────────────────────
// 3. OWNER PORTFOLIO — Find all properties by same owner
// ──────────────────────────────────────────────────────────────
async function getOwnerPortfolio(attomId) {
  const query = `
    WITH subject_owner AS (
      SELECT
        owner1_name_full,
        mail_address_full
      FROM ownership
      WHERE attom_id = $1 AND ownership_sequence = 1
    )
    SELECT
      p.attom_id,
      p.address_full,
      p.address_city,
      p.address_zip,
      p.property_use_standardized,
      p.area_building,
      p.area_lot_sf,
      p.year_built,
      p.last_sale_price,
      p.last_sale_date,
      o.owner1_name_full,
      o.mail_address_full,
      o.is_absentee_owner,
      o.company_flag,
      ta.assessed_value_total,
      ta.market_value_total,
      CASE
        WHEN UPPER(TRIM(o.owner1_name_full)) = UPPER(TRIM(so.owner1_name_full))
          AND o.mail_address_full = so.mail_address_full
          AND so.mail_address_full IS NOT NULL
          THEN 'EXACT_MATCH'
        WHEN UPPER(TRIM(o.owner1_name_full)) = UPPER(TRIM(so.owner1_name_full))
          THEN 'NAME_MATCH'
        WHEN o.mail_address_full = so.mail_address_full
          AND so.mail_address_full IS NOT NULL
          AND so.mail_address_full != ''
          THEN 'ADDRESS_MATCH'
      END AS match_type
    FROM subject_owner so
    JOIN ownership o ON o.ownership_sequence = 1
      AND (
        UPPER(TRIM(o.owner1_name_full)) = UPPER(TRIM(so.owner1_name_full))
        OR (o.mail_address_full = so.mail_address_full
            AND so.mail_address_full IS NOT NULL
            AND so.mail_address_full != '')
      )
    JOIN properties p ON p.attom_id = o.attom_id
    LEFT JOIN tax_assessments ta ON ta.attom_id = o.attom_id
      AND ta.tax_year = (SELECT MAX(tax_year) FROM tax_assessments WHERE attom_id = o.attom_id)
    WHERE p.fips_code = '48453'
    ORDER BY ta.assessed_value_total DESC NULLS LAST
    LIMIT 200;
  `;

  const { rows } = await pool.query(query, [attomId]);

  // Compute portfolio summary
  const totalAssessed = rows.reduce((sum, r) => sum + (Number(r.assessed_value_total) || 0), 0);
  const totalMarket = rows.reduce((sum, r) => sum + (Number(r.market_value_total) || 0), 0);
  const propertyTypes = [...new Set(rows.map(r => r.property_use_standardized).filter(Boolean))];
  const zipCodes = [...new Set(rows.map(r => r.address_zip).filter(Boolean))];

  return {
    ownerName: rows[0]?.owner1_name_full || null,
    portfolioSummary: {
      totalProperties: rows.length,
      totalAssessedValue: totalAssessed,
      totalMarketValue: totalMarket,
      avgPropertyValue: rows.length ? Math.round(totalAssessed / rows.length) : 0,
      propertyTypes,
      zipCodeSpread: zipCodes.length,
      zipCodes,
    },
    properties: rows.map(r => ({
      attomId: r.attom_id,
      addressFull: r.address_full,
      city: r.address_city,
      zip: r.address_zip,
      propertyUse: r.property_use_standardized,
      areaBuilding: r.area_building,
      yearBuilt: r.year_built,
      lastSalePrice: Number(r.last_sale_price) || null,
      lastSaleDate: r.last_sale_date,
      assessedValue: Number(r.assessed_value_total) || null,
      marketValue: Number(r.market_value_total) || null,
      matchType: r.match_type,
      isAbsentee: r.is_absentee_owner,
      isCorporate: r.company_flag,
    })),
  };
}


// ──────────────────────────────────────────────────────────────
// 4. TOP PORTFOLIO OWNERS — Ranked by property count
// ──────────────────────────────────────────────────────────────
async function getTopPortfolioOwners(options = {}) {
  const { minProperties = 5, limit = 50 } = options;

  // Pre-compute numeric values to inject via template literals (safe - all from validated defaults)
  const minPropsNum = Number(minProperties);
  const limitNum = Number(limit);

  const query = `
    SELECT
      UPPER(TRIM(o.owner1_name_full)) AS normalized_name,
      COUNT(DISTINCT o.attom_id) AS property_count,
      SUM(ta.assessed_value_total) AS total_assessed_value,
      ARRAY_AGG(DISTINCT p.property_use_standardized) AS property_types,
      COUNT(DISTINCT p.address_zip) AS zip_code_spread,
      MIN(o.ownership_transfer_date) AS earliest_acquisition,
      MAX(o.ownership_transfer_date) AS latest_acquisition,
      bool_or(o.company_flag) AS is_corporate,
      bool_or(o.trust_flag) AS is_trust
    FROM ownership o
    JOIN properties p ON p.attom_id = o.attom_id
    LEFT JOIN tax_assessments ta ON ta.attom_id = o.attom_id
      AND ta.tax_year = (SELECT MAX(tax_year) FROM tax_assessments WHERE attom_id = o.attom_id)
    WHERE o.ownership_sequence = 1
      AND p.fips_code = '48453'
      AND o.owner1_name_full IS NOT NULL
      AND o.owner1_name_full != ''
    GROUP BY UPPER(TRIM(o.owner1_name_full))
    HAVING COUNT(DISTINCT o.attom_id) >= ${minPropsNum}
    ORDER BY property_count DESC
    LIMIT ${limitNum};
  `;

  const { rows } = await pool.query(query);

  return rows.map(r => ({
    ownerName: r.normalized_name,
    propertyCount: Number(r.property_count),
    totalAssessedValue: Number(r.total_assessed_value) || 0,
    propertyTypes: r.property_types,
    zipCodeSpread: Number(r.zip_code_spread),
    earliestAcquisition: r.earliest_acquisition,
    latestAcquisition: r.latest_acquisition,
    isCorporate: r.is_corporate,
    isTrust: r.is_trust,
  }));
}


// ──────────────────────────────────────────────────────────────
// 5. DISTRESSED PROPERTY SEARCH — Top distressed by score
// ──────────────────────────────────────────────────────────────
async function getDistressedProperties(options = {}) {
  const { minScore = 30, limit = 50, bbox = null } = options;

  // Pre-compute numeric values to inject via template literals (safe - all from validated defaults)
  const minScoreNum = Number(minScore);
  const limitNum = Number(limit);

  let bboxFilter = '';
  let bboxFilterCTE = '';
  const params = [];

  if (bbox) {
    bboxFilter = `AND p.longitude BETWEEN $1 AND $2 AND p.latitude BETWEEN $3 AND $4`;
    bboxFilterCTE = `AND p.longitude BETWEEN $1 AND $2 AND p.latitude BETWEEN $3 AND $4`;
    params.push(bbox.west, bbox.east, bbox.south, bbox.north);
  }

  const query = `
    -- CTE: Pre-filter to properties with at least one distress signal
    WITH candidates AS (
      SELECT p.attom_id
      FROM properties p
      LEFT JOIN foreclosure_records fc ON fc.attom_id = p.attom_id
      LEFT JOIN tax_assessments ta ON ta.attom_id = p.attom_id
      LEFT JOIN ownership o ON o.attom_id = p.attom_id AND o.ownership_sequence = 1
      WHERE p.fips_code = '48453'
        ${bboxFilterCTE}
        AND (
          fc.attom_id IS NOT NULL
          OR ta.tax_delinquent_year IS NOT NULL
          OR o.is_absentee_owner = true
        )
      GROUP BY p.attom_id
      LIMIT 5000
    )
    SELECT
      p.attom_id,
      p.address_full,
      p.address_city,
      p.address_zip,
      p.property_use_standardized,
      p.area_building,
      p.year_built,
      p.last_sale_price,
      o.owner1_name_full,
      o.is_absentee_owner,
      o.company_flag,
      -- Distress Score
      (
        CASE WHEN fc.id IS NOT NULL AND fc.foreclosure_recording_date > CURRENT_DATE - INTERVAL '2 years' THEN 30 ELSE 0 END +
        CASE WHEN ta.tax_delinquent_year IS NOT NULL THEN
          CASE WHEN ta.tax_delinquent_year::int < EXTRACT(YEAR FROM CURRENT_DATE) - 2 THEN 20 ELSE 15 END
        ELSE 0 END +
        CASE
          WHEN pv.estimated_value > 0 AND cl_sum.total_balance > pv.estimated_value THEN 20
          WHEN pv.estimated_value > 0 AND cl_sum.total_balance > pv.estimated_value * 0.9 THEN 15
          WHEN pv.estimated_value > 0 AND cl_sum.total_balance > pv.estimated_value * 0.8 THEN 10
          ELSE 0 END +
        CASE WHEN ls.is_distressed = true THEN 10 ELSE 0 END +
        CASE WHEN o.ownership_transfer_date < CURRENT_DATE - INTERVAL '15 years' THEN 5 ELSE 0 END +
        CASE WHEN p.year_built < EXTRACT(YEAR FROM CURRENT_DATE) - 30
          AND bp_count.cnt = 0 THEN 5 ELSE 0 END
      ) AS distress_score,
      pv.estimated_value AS avm_value,
      ta.assessed_value_total,
      ta.tax_delinquent_year,
      fc.record_type AS foreclosure_type,
      fc.auction_date
    FROM candidates c
    JOIN properties p ON p.attom_id = c.attom_id
    JOIN ownership o ON o.attom_id = p.attom_id AND o.ownership_sequence = 1
    LEFT JOIN tax_assessments ta ON ta.attom_id = p.attom_id
      AND ta.tax_year = (SELECT MAX(tax_year) FROM tax_assessments WHERE attom_id = p.attom_id)
    LEFT JOIN LATERAL (
      SELECT estimated_value FROM property_valuations
      WHERE attom_id = p.attom_id ORDER BY valuation_date DESC LIMIT 1
    ) pv ON true
    LEFT JOIN LATERAL (
      SELECT SUM(estimated_balance) AS total_balance FROM current_loans WHERE attom_id = p.attom_id
    ) cl_sum ON true
    LEFT JOIN LATERAL (
      SELECT id, foreclosure_recording_date, record_type, auction_date
      FROM foreclosure_records WHERE attom_id = p.attom_id
      ORDER BY foreclosure_recording_date DESC LIMIT 1
    ) fc ON true
    LEFT JOIN LATERAL (
      SELECT is_distressed FROM sales_transactions
      WHERE attom_id = p.attom_id ORDER BY recording_date DESC LIMIT 1
    ) ls ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM building_permits
      WHERE attom_id = p.attom_id AND effective_date > CURRENT_DATE - INTERVAL '10 years'
    ) bp_count ON true
    GROUP BY
      p.attom_id,
      p.address_full,
      p.address_city,
      p.address_zip,
      p.property_use_standardized,
      p.area_building,
      p.year_built,
      p.last_sale_price,
      o.owner1_name_full,
      o.is_absentee_owner,
      o.company_flag,
      o.ownership_transfer_date,
      pv.estimated_value,
      ta.assessed_value_total,
      ta.tax_delinquent_year,
      fc.id,
      fc.foreclosure_recording_date,
      fc.record_type,
      fc.auction_date,
      cl_sum.total_balance,
      ls.is_distressed,
      bp_count.cnt
    HAVING (
      CASE WHEN fc.id IS NOT NULL AND fc.foreclosure_recording_date > CURRENT_DATE - INTERVAL '2 years' THEN 30 ELSE 0 END +
      CASE WHEN ta.tax_delinquent_year IS NOT NULL THEN
        CASE WHEN ta.tax_delinquent_year::int < EXTRACT(YEAR FROM CURRENT_DATE) - 2 THEN 20 ELSE 15 END
      ELSE 0 END +
      CASE
        WHEN pv.estimated_value > 0 AND cl_sum.total_balance > pv.estimated_value THEN 20
        WHEN pv.estimated_value > 0 AND cl_sum.total_balance > pv.estimated_value * 0.9 THEN 15
        WHEN pv.estimated_value > 0 AND cl_sum.total_balance > pv.estimated_value * 0.8 THEN 10
        ELSE 0 END +
      CASE WHEN ls.is_distressed = true THEN 10 ELSE 0 END +
      CASE WHEN o.ownership_transfer_date < CURRENT_DATE - INTERVAL '15 years' THEN 5 ELSE 0 END +
      CASE WHEN p.year_built < EXTRACT(YEAR FROM CURRENT_DATE) - 30
        AND bp_count.cnt = 0 THEN 5 ELSE 0 END
    ) >= ${minScoreNum}
    ORDER BY distress_score DESC
    LIMIT ${limitNum};
  `;

  const { rows } = await pool.query(query, params);

  return rows.map(r => ({
    attomId: r.attom_id,
    addressFull: r.address_full,
    city: r.address_city,
    zip: r.address_zip,
    propertyUse: r.property_use_standardized,
    areaBuilding: r.area_building,
    yearBuilt: r.year_built,
    lastSalePrice: Number(r.last_sale_price) || null,
    ownerName: r.owner1_name_full,
    isAbsentee: r.is_absentee_owner,
    isCorporate: r.company_flag,
    distressScore: Number(r.distress_score),
    avmValue: Number(r.avm_value) || null,
    assessedValue: Number(r.assessed_value_total) || null,
    taxDelinquentYear: r.tax_delinquent_year,
    foreclosureType: r.foreclosure_type,
    auctionDate: r.auction_date,
  }));
}


// ──────────────────────────────────────────────────────────────
// EXPORTS
// ──────────────────────────────────────────────────────────────
module.exports = {
  getPropertyIntelligence,
  getComparableSales,
  getOwnerPortfolio,
  getTopPortfolioOwners,
  getDistressedProperties,
  normalizeOwnerName,
};
