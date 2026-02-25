# ScoutGPT Neon Database Audit
Generated: 2026-02-22T00:15:40.864Z

## Summary

- **Tables with data (>1K rows):** properties (444,312), property_details (444,312), ownership (444,312), sales_transactions (1,521,885), current_loans (359,725), tax_assessments (444,312), property_valuations (344,536), foreclosure_records (45,744), climate_risk (415,847), building_permits (3,528,225), parcel_boundaries (428,529), fema_flood_zones (14,043), school_districts (1,020), mortgage_records (1,146,011)
- **Tables with some data (≤1K rows):** none
- **Empty tables (0 rows):** none

- **Total active filters:** 96
- **Filters OK:** 75
- **Filters BLOCKED:** 20 — condition, has-loading-platform, has-overhead-door, quality-grade, climate-risk-total, foreclosure-status, estimated-balance, loan-due-date, loan-term, monthly-payment, cbsa, congressional-district, county, owner-occupied, zoning, tax-delinquent, tax-delinquent-year, tax-rate, avm-confidence, avm-value
- **Filters WARNING:** 1 — effective-year-built

## Filters Registry Impact

| Filter Slug | Category | Source Table | Status | Reason |
|---|---|---|---|---|
| condition | building_details | property_details | BLOCKED | All source columns are 0% populated: condition |
| construction-type | building_details | property_details | OK |  |
| garage-type | building_details | property_details | OK |  |
| has-elevator | building_details | property_details | OK |  |
| has-loading-platform | building_details | property_details | BLOCKED | All source columns are 0% populated: has_loading_platform |
| has-overhead-door | building_details | property_details | BLOCKED | All source columns are 0% populated: has_overhead_door |
| has-pool | building_details | property_details | OK |  |
| quality-grade | building_details | property_details | BLOCKED | All source columns are 0% populated: quality_grade |
| climate-risk-total | climate | climate_risk | BLOCKED | All source columns are 0% populated: total_risk_score |
| flood-risk-score | climate | climate_risk | OK |  |
| heat-risk-score | climate | climate_risk | OK |  |
| storm-risk-score | climate | climate_risk | OK |  |
| wildfire-risk-score | climate | climate_risk | OK |  |
| auction-bid | distress | foreclosure_records | OK |  |
| auction-date | distress | foreclosure_records | OK |  |
| default-amount | distress | foreclosure_records | OK |  |
| foreclosure-date | distress | foreclosure_records | OK |  |
| foreclosure-estimated-value | distress | foreclosure_records | OK |  |
| foreclosure-loan-balance | distress | foreclosure_records | OK |  |
| foreclosure-record-type | distress | foreclosure_records | OK |  |
| foreclosure-status | distress | foreclosure_records | BLOCKED | All source columns are 0% populated: status |
| estimated-balance | financing | current_loans | BLOCKED | All source columns are 0% populated: estimated_balance |
| interest-rate | financing | current_loans | OK |  |
| interest-rate-type | financing | current_loans | OK |  |
| lender-name | financing | current_loans | OK |  |
| loan-amount | financing | current_loans | OK |  |
| loan-due-date | financing | current_loans | BLOCKED | All source columns are 0% populated: due_date |
| loan-term | financing | current_loans | BLOCKED | All source columns are 0% populated: loan_term |
| loan-type | financing | current_loans | OK |  |
| monthly-payment | financing | current_loans | BLOCKED | All source columns are 0% populated: estimated_monthly_payment |
| nearest-sewer | infrastructure | properties | OK |  |
| nearest-storm | infrastructure | properties | OK |  |
| nearest-water | infrastructure | properties | OK |  |
| cbsa | location | properties | BLOCKED | All source columns are 0% populated: cbsa_name |
| census-tract | location | properties | OK |  |
| city | location | properties | OK |  |
| congressional-district | location | properties | BLOCKED | All source columns are 0% populated: congressional_district |
| county | location | properties | BLOCKED | All source columns are 0% populated: county_name |
| fips-code | location | properties | OK |  |
| state | location | properties | OK |  |
| zip-code | location | properties | OK |  |
| absentee-owner | ownership | ownership | OK |  |
| corporate-owner | ownership | ownership | OK |  |
| mailing-state | ownership | ownership | OK |  |
| owner-name | ownership | ownership | OK |  |
| owner-occupied | ownership | ownership | BLOCKED | All source columns are 0% populated: is_owner_occupied |
| ownership-duration | ownership | ownership | OK |  |
| ownership-type | ownership | ownership | OK |  |
| trust-owned | ownership | ownership | OK |  |
| permit-date | permits | building_permits | OK |  |
| permit-job-value | permits | building_permits | OK |  |
| permit-status | permits | building_permits | OK |  |
| permit-type | permits | building_permits | OK |  |
| bathrooms | physical | properties | OK |  |
| bedrooms | physical | properties | OK |  |
| building-sqft | physical | properties | OK |  |
| effective-year-built | physical | properties | WARNING | Sparse data: effective_year_built (1.1%) |
| flood-zone | physical | properties | OK |  |
| in-floodplain | physical | properties | OK |  |
| lot-size-acres | physical | properties | OK |  |
| lot-size-sf | physical | properties | OK |  |
| rooms | physical | properties | OK |  |
| year-built | physical | properties | OK |  |
| zoning | physical | properties | BLOCKED | All source columns are 0% populated: zoning |
| zoning-local | physical | properties | OK |  |
| buildings-count | property_type | properties | OK |  |
| property-use-group | property_type | properties | OK |  |
| property-use-standardized | property_type | properties | OK |  |
| stories-count | property_type | properties | OK |  |
| unit-count | property_type | properties | OK |  |
| disabled-exemption | tax | tax_assessments | OK |  |
| homestead-exemption | tax | tax_assessments | OK |  |
| senior-exemption | tax | tax_assessments | OK |  |
| tax-amount | tax | tax_assessments | OK |  |
| tax-delinquent | tax | tax_assessments | BLOCKED | All source columns are 0% populated: tax_delinquent_year |
| tax-delinquent-year | tax | tax_assessments | BLOCKED | All source columns are 0% populated: tax_delinquent_year |
| tax-rate | tax | tax_assessments | BLOCKED | All source columns are 0% populated: tax_rate |
| veteran-exemption | tax | tax_assessments | OK |  |
| arms-length | transactions | sales_transactions | OK |  |
| distressed-sale | transactions | sales_transactions | OK |  |
| down-payment | transactions | sales_transactions | OK |  |
| foreclosure-auction-sale | transactions | sales_transactions | OK |  |
| investor-buyer | transactions | sales_transactions | OK |  |
| last-sale-date | transactions | properties | OK |  |
| last-sale-price | transactions | properties | OK |  |
| purchase-ltv | transactions | sales_transactions | OK |  |
| sale-price-transaction | transactions | sales_transactions | OK |  |
| available-equity | valuation | property_valuations | OK |  |
| avm-confidence | valuation | property_valuations | BLOCKED | All source columns are 0% populated: confidence_score |
| avm-value | valuation | property_valuations | BLOCKED | All source columns are 0% populated: estimated_value |
| lendable-equity | valuation | property_valuations | OK |  |
| ltv | valuation | property_valuations | OK |  |
| market-value | valuation | tax_assessments | OK |  |
| market-value-land | valuation | tax_assessments | OK |  |
| rental-value | valuation | property_valuations | OK |  |
| tax-assessed-value | valuation | properties | OK |  |

## Table Details

### properties
**Rows:** 444,312 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| attom_id | bigint | 100% | 204172, 205382, 206235 | ok |
| fips_code | character varying | 100% | 48453 | ok |
| parcel_number_raw | character varying | 100% | 0000112027, 01000301050000, 01000301090000 | ok |
| parcel_number_formatted | character varying | 0% | - | DEAD COLUMN |
| address_full | character varying | 100% | 1 APPLEGREEN CT, 1 ASHBROOK PL, 1 AUTUMN OAKS PL | ok |
| address_house_number | character varying | 93% | 12533, 247, 21930 | ok |
| address_street_direction | character varying | 5.4% | E, N, NORTH | ok |
| address_street_name | character varying | 100% | HOFFMAN, CALICHE, FOREST BEND | ok |
| address_street_suffix | character varying | 96% | ALY, AVE, BLF | ok |
| address_unit_prefix | character varying | 16.9% | #, APT, BLDG | ok |
| address_unit_number | character varying | 17% | 1, 1-1, 1-1-A | ok |
| address_city | character varying | 99.7% | AUSTIN, BEAUKISS, BEE CAVE | ok |
| address_state | character varying | 100% | TX | ok |
| address_zip | character varying | 99.7% | 76574, 78610, 78612 | ok |
| address_zip4 | character varying | 88.6% | 2571, 3226, 3542 | ok |
| latitude | double precision | 88.5% | 30.293267, 30.268916, 30.451723 | ok |
| longitude | double precision | 88.5% | -97.985447, -97.83547, -97.676172 | ok |
| location | USER-DEFINED | N/A | GEOMETRY - not sampled | GEOMETRY |
| census_tract | character varying | 88.5% | 0, 1000, 101 | ok |
| census_block | character varying | 88.5% | 1000, 1001, 1002 | ok |
| legal_subdivision | character varying | 98.8% | 5000 BAKER SITE CONDOMINIUMS, CANTERBURY COMMONS CONDOMINIUMS, BAR-K RANCHES PLAT 7 AMENDED PLAT OF LTS | ok |
| property_use_code | character varying | 0% | - | DEAD COLUMN |
| property_use_standardized | character varying | 100% | 109, 117, 120 | ok |
| property_use_group | character varying | 100% | AGRICULTURE / FARMING, COMMERCIAL, Commercial | ok |
| zoning | character varying | 0% | - | DEAD COLUMN |
| year_built | integer | 91.4% | 1800, 1805, 1840 | ok |
| effective_year_built | integer | 1.1% | 1910, 1924, 1930 | sparse |
| bedrooms_count | integer | 100% | 0, 1, 2 | ok |
| bath_count | numeric | 100% | 0.0, 1.0, 2.0 | ok |
| bath_full_count | integer | 0% | - | DEAD COLUMN |
| bath_half_count | integer | 100% | 0, 1, 2 | ok |
| rooms_count | integer | 100% | 0 | ok |
| stories_count | numeric | 94.5% | 0.0, 1.0, 2.0 | ok |
| area_building | integer | 100% | 0, 1, 2 | ok |
| area_lot_sf | integer | 100% | 528470, 30052, 72397 | ok |
| area_lot_acres | numeric | 100% | 0.0000, 0.0005, 0.0006 | ok |
| units_count | integer | 100% | 0 | ok |
| tax_assessed_value_total | numeric | 100% | 0.00, 1.00, 5.00 | ok |
| last_sale_date | date | 87% | Mon Feb 27 1995 00:00:00 GMT-0600 (Central Standard Time), Thu Nov 21 1974 00:00:00 GMT-0600 (Central Standard Time), Mon Feb 11 2013 00:00:00 GMT-0600 (Central Standard Time) | ok |
| last_sale_price | numeric | 95.7% | -1.00, 0.00, 195.00 | ok |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 22:20:57 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:20:57 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:20:57 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 22:20:57 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:20:57 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:20:57 GMT-0600 (Central Standard Time) | ok |
| buildings_count | integer | 11.9% | 2, 3, 4 | ok |
| zoning_local | text | 51.9% | 12702 Trails End Road, 13402 Anderson Mill, 1431 Inc | ok |
| zoning_jurisdiction | text | 51.9% | Cedar Park, City of Austin, Pflugerville | ok |
| flood_zone | text | 88.4% | A, AE, AO | ok |
| flood_zone_desc | text | 88.4% | Areas identified in a community's FIS as areas of moderate or minimal hazard ..., Areas with a 1% annual chance of flooding and a 26% chance of flooding over t..., River or stream flood hazard areas, and areas with a 1% or greater chance of ... | ok |
| in_floodplain | boolean | 100% | false, true | ok |
| nearest_water_ft | numeric | 88.5% | 0.0, 0.1, 0.2 | ok |
| nearest_water_diam | numeric | 3.2% | -99, 1, 1.5 | sparse |
| nearest_water_material | text | 2.7% | AC, C900, COP | sparse |
| nearest_sewer_ft | numeric | 88.5% | 0.1, 0.2, 0.3 | ok |
| nearest_sewer_diam | numeric | 9.2% | 0, 2, 3 | ok |
| nearest_storm_ft | numeric | 88.5% | 0.1, 0.2, 0.3 | ok |
| nearest_storm_diam | numeric | 3.6% | -99, 8, 9 | sparse |
| gis_enriched_at | timestamp with time zone | 88.5% | Mon Feb 16 2026 04:54:04 GMT-0600 (Central Standard Time), Mon Feb 16 2026 04:54:26 GMT-0600 (Central Standard Time), Mon Feb 16 2026 04:54:44 GMT-0600 (Central Standard Time) | ok |
| state_code | text | 0% | - | DEAD COLUMN |
| county_name | text | 0% | - | DEAD COLUMN |
| jurisdiction_name | text | 0% | - | DEAD COLUMN |
| cbsa_name | text | 0% | - | DEAD COLUMN |
| cbsa_code | text | 0% | - | DEAD COLUMN |
| census_block_group | text | 0% | - | DEAD COLUMN |
| census_place_code | text | 0% | - | DEAD COLUMN |
| neighborhood_code | text | 0% | - | DEAD COLUMN |
| parcel_account_number | text | 0% | - | DEAD COLUMN |
| geo_quality_code | text | 0% | - | DEAD COLUMN |
| congressional_district | text | 0% | - | DEAD COLUMN |
| lot_depth | numeric | 0% | - | DEAD COLUMN |
| lot_width | numeric | 0% | - | DEAD COLUMN |
| parcel_shell_record | text | 0% | - | DEAD COLUMN |
| last_sale_transaction_id | bigint | 0% | - | DEAD COLUMN |
| last_transfer_transaction_id | bigint | 0% | - | DEAD COLUMN |
| last_transfer_document_number | text | 0% | - | DEAD COLUMN |
| last_sale_book | text | 0% | - | DEAD COLUMN |
| last_sale_page | text | 0% | - | DEAD COLUMN |
| last_sale_document_number | text | 0% | - | DEAD COLUMN |
| nearest_road_name | character varying | 65.9% | 011AA0273, 011AA1811, 028AA0316 | ok |
| nearest_road_aadt | integer | 63% | 79, 98, 325 | ok |
| nearest_road_ft | numeric | 65.9% | 1478.26, 7460.47, 5968.51 | ok |
| future_land_use | character varying | 13.2% | 100, 108, 111 | ok |
| flu_jurisdiction | character varying | 0% | - | DEAD COLUMN |
| city_jurisdiction | character varying | 88.5% | City of Austin, City of Bee Cave, City of Cedar Park | ok |
| in_etj | boolean | 100% | false, true | ok |
| etj_city | character varying | 7.7% | Bee Cave ETJ, Briarcliff ETJ, Buda ETJ | ok |
| etj_released | boolean | 100% | false, true | ok |

**Dead columns (0% populated):** parcel_number_formatted, property_use_code, zoning, bath_full_count, state_code, county_name, jurisdiction_name, cbsa_name, cbsa_code, census_block_group, census_place_code, neighborhood_code, parcel_account_number, geo_quality_code, congressional_district, lot_depth, lot_width, parcel_shell_record, last_sale_transaction_id, last_transfer_transaction_id, last_transfer_document_number, last_sale_book, last_sale_page, last_sale_document_number, flu_jurisdiction

### property_details
**Rows:** 444,312 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| attom_id | bigint | 100% | 204172, 205382, 206235 | ok |
| legal_description | text | 99.6% | (1.27AC) LAKEWAY SEC 4-E, (ALLEY) PLEASANT GROVE ADDN, (COMMON AREA OF) LOT 18 BLK D LT 21-22 BLK B COURTYARD PHS 1 THE COMMON AREA ... | ok |
| legal_lot | character varying | 88.8% | 2571, 247, 39-4 | ok |
| legal_block | character varying | 68.3% | 1, 1&1A, 1&2 | ok |
| legal_section | character varying | 0% | - | DEAD COLUMN |
| construction_type | character varying | 78.9% | 0, 1, 15 | ok |
| exterior_walls | character varying | 78.9% | 0A, 3B, 4Y | ok |
| interior_walls | character varying | 0% | - | DEAD COLUMN |
| foundation | character varying | 69.3% | 100, 400, 920 | ok |
| roof_type | character varying | 68.9% | 120, 197, 251 | ok |
| roof_material | character varying | 69.1% | 102, 104, 105 | ok |
| floor_type | character varying | 0% | - | DEAD COLUMN |
| garage_type | character varying | 68% | 11, 12, 189 | ok |
| garage_area | integer | 88.2% | 0, 1, 2 | ok |
| parking_spaces | integer | 100% | 0, 1, 2 | ok |
| pool_type | character varying | 79.2% | 0, 220, 230 | ok |
| has_pool | boolean | 100% | false, true | ok |
| has_spa | boolean | 100% | false | ok |
| has_elevator | boolean | 100% | false, true | ok |
| has_fireplace | boolean | 100% | false, true | ok |
| fireplace_count | integer | 76.2% | 0, 1, 2 | ok |
| hvac_cooling | character varying | 73% | 103, 112 | ok |
| hvac_heating | character varying | 90% | 108, 109, 111 | ok |
| hvac_fuel | character varying | 0% | - | DEAD COLUMN |
| quality_grade | character varying | 0% | - | DEAD COLUMN |
| condition | character varying | 0% | - | DEAD COLUMN |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 22:25:55 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:25:56 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:25:56 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 22:25:55 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:25:56 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:25:56 GMT-0600 (Central Standard Time) | ok |
| gross_area | numeric | 76.3% | 8100, 16336, 2747 | ok |
| attic_area | numeric | 0% | - | DEAD COLUMN |
| has_attic | text | 0% | - | DEAD COLUMN |
| carport_type | text | 0% | - | DEAD COLUMN |
| carport_area | numeric | 0% | - | DEAD COLUMN |
| parking_space_count | integer | 0% | - | DEAD COLUMN |
| driveway_area | numeric | 0% | - | DEAD COLUMN |
| driveway_material | text | 0% | - | DEAD COLUMN |
| fire_resistance_class | text | 0% | - | DEAD COLUMN |
| has_fire_sprinklers | text | 0% | - | DEAD COLUMN |
| sewage_type | text | 0% | - | DEAD COLUMN |
| water_source | text | 0% | - | DEAD COLUMN |
| mobile_home_hookup | text | 0% | - | DEAD COLUMN |
| view_description | text | 0% | - | DEAD COLUMN |
| topography_code | text | 0% | - | DEAD COLUMN |
| has_deck | text | 0% | - | DEAD COLUMN |
| deck_area | numeric | 0% | - | DEAD COLUMN |
| has_balcony | text | 0% | - | DEAD COLUMN |
| balcony_area | numeric | 0% | - | DEAD COLUMN |
| fence_type | text | 0% | - | DEAD COLUMN |
| fence_area | numeric | 0% | - | DEAD COLUMN |
| has_sauna | text | 0% | - | DEAD COLUMN |
| has_security_alarm | text | 0% | - | DEAD COLUMN |
| is_handicap_accessible | text | 0% | - | DEAD COLUMN |
| has_storm_shutters | text | 0% | - | DEAD COLUMN |
| has_overhead_door | text | 0% | - | DEAD COLUMN |
| loading_platform_area | numeric | 0% | - | DEAD COLUMN |
| has_loading_platform | text | 0% | - | DEAD COLUMN |
| guest_house_area | numeric | 0% | - | DEAD COLUMN |
| has_guest_house | text | 0% | - | DEAD COLUMN |
| storage_building_area | numeric | 0% | - | DEAD COLUMN |
| has_storage_building | text | 0% | - | DEAD COLUMN |
| has_community_rec_room | text | 0% | - | DEAD COLUMN |
| has_escalator | text | 0% | - | DEAD COLUMN |
| has_wet_bar | text | 0% | - | DEAD COLUMN |
| legal_phase | text | 0% | - | DEAD COLUMN |
| legal_tract | text | 0% | - | DEAD COLUMN |
| legal_unit | text | 0% | - | DEAD COLUMN |
| legal_quarter | text | 0% | - | DEAD COLUMN |
| legal_quarter_quarter | text | 0% | - | DEAD COLUMN |
| legal_township | text | 0% | - | DEAD COLUMN |
| legal_range | text | 0% | - | DEAD COLUMN |

**Dead columns (0% populated):** legal_section, interior_walls, floor_type, hvac_fuel, quality_grade, condition, attic_area, has_attic, carport_type, carport_area, parking_space_count, driveway_area, driveway_material, fire_resistance_class, has_fire_sprinklers, sewage_type, water_source, mobile_home_hookup, view_description, topography_code, has_deck, deck_area, has_balcony, balcony_area, fence_type, fence_area, has_sauna, has_security_alarm, is_handicap_accessible, has_storm_shutters, has_overhead_door, loading_platform_area, has_loading_platform, guest_house_area, has_guest_house, storage_building_area, has_storage_building, has_community_rec_room, has_escalator, has_wet_bar, legal_phase, legal_tract, legal_unit, legal_quarter, legal_quarter_quarter, legal_township, legal_range

### ownership
**Rows:** 444,312 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| attom_id | bigint | 100% | 204172, 205382, 206235 | ok |
| ownership_sequence | integer | 100% | 1 | ok |
| owner1_name_full | character varying | 100% | & SS FAMILY TRUST, 01107 LLC-SERIES 405 MILTON, 02/04 BLUE CREST LLC | ok |
| owner1_name_first | character varying | 85.9% | LIZY, HOFFMAN, JARD | ok |
| owner1_name_last | character varying | 98.6% | & SS FAMILY TRUST, 01107 LLC-SERIES 405 MILTON, 02/04 BLUE CREST LLC | ok |
| owner2_name_full | character varying | 23.3% | NADINE A HERBST, BRENDA BECKMANN, SANDRA N THOMAS | ok |
| owner2_name_first | character varying | 22.3% | NURIA, SAVITRI, NOELIX | ok |
| owner2_name_last | character varying | 23.3% | HAIMES, HOFFMAN, MORTELLARO | ok |
| ownership_type | character varying | 78.3% | COMPANY, Company, INDIVIDUAL | ok |
| company_flag | boolean | 100% | false, true | ok |
| trust_flag | boolean | 100% | false, true | ok |
| mail_address_full | character varying | 99.9% | #3A WATER WOODS APARTMENTS #195 LAUGHING WATERS LA, 01041 SW PALATINE HILL RD, 0720 SW GAINES ST UNIT 501 | ok |
| mail_address_city | character varying | 99.8% | ABBOTT, ABILENE, ABINGTON | ok |
| mail_address_state | character varying | 100% |  , AA, AE | ok |
| mail_address_zip | character varying | 100% |  , 00603, 00646 | ok |
| is_owner_occupied | boolean | 0% | - | DEAD COLUMN |
| is_absentee_owner | boolean | 100% | false | ok |
| ownership_transfer_date | date | 94.7% | Mon Feb 27 1995 00:00:00 GMT-0600 (Central Standard Time), Tue Sep 27 2016 00:00:00 GMT-0500 (Central Daylight Time), Mon Feb 11 2013 00:00:00 GMT-0600 (Central Standard Time) | ok |
| effective_from | date | 0% | - | DEAD COLUMN |
| effective_to | date | 0% | - | DEAD COLUMN |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 22:28:06 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:28:06 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:28:06 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 22:28:06 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:28:06 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:28:06 GMT-0600 (Central Standard Time) | ok |
| trust_description | text | 14.7% | ESTATE, Estate, Name is a Trust | ok |
| vesting_relation_code | text | 100% |   | ok |
| owner1_name_middle | text | 48.6% | MING JEN, PATRICK TONG, HOFFMAN | ok |
| owner1_name_suffix | text | 2% | D C, D D, EE | sparse |
| owner3_name_full | text | 25.2% | BRYAN & SANDRA FORRESTER TRUST, ANUSHREE METRANI, MEREDITH CAGE | ok |
| owner4_name_full | text | 1.5% | 10 SQUARE HOLDINGS LLC, 1002 PALOS VERDES DR TRUST, 12 DBA | sparse |
| owner_type_description_2 | text | 30% | COMPANY, Company, INDIVIDUAL | ok |
| mail_county | text | 99.8% | ACADIA, ADA, ADAMS | ok |
| mail_fips | text | 99.8% | 01001, 01003, 01013 | ok |
| mail_house_number | text | 96.4% | 12533, 247, 2275 | ok |
| mail_street_name | text | 99.9% | 232ND, CANTERA GOLF, TIERRA VERDE | ok |
| mail_street_suffix | text | 93.3% | ALY, AVDA, AVE | ok |
| mail_zip4 | text | 100% | 2571, 3542, 3226 | ok |
| deed_owner1_name_full | text | 98.9% | & PROPERTY OWNERS ASSOCIATION INC, & REALTY MANAGEMENT LLC, & SS FAMILY TRUST | ok |
| deed_owner2_name_full | text | 43.7% | 1001 CONGRESS DBA, 1005 CONGRESS DBA, 10085 CIRCLEVIEW DRIVE TRUST | ok |

**Dead columns (0% populated):** is_owner_occupied, effective_from, effective_to

### sales_transactions
**Rows:** 1,521,885 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| transaction_id | bigint | 100% | 115559, 115560, 115561 | ok |
| attom_id | bigint | 100% | 204172, 205382, 206235 | ok |
| recording_date | date | 61.7% | Tue Mar 23 1965 00:00:00 GMT-0600 (Central Daylight Time), Tue Oct 05 1965 00:00:00 GMT-0500 (Central Daylight Time), Fri Jun 09 1967 00:00:00 GMT-0500 (Central Daylight Time) | ok |
| document_number | character varying | 83.4% | 0000000001, 0000000002, 0000000003 | ok |
| document_type | character varying | 100% | DTAD, DTAF, DTAG | ok |
| sale_price | numeric | 61.7% | 0.00, 10.00, 13.00 | ok |
| sale_price_description | character varying | 0.2% | 101, 103, 106 | sparse |
| is_arms_length | boolean | 100% | false, true | ok |
| is_foreclosure_auction | boolean | 100% | false, true | ok |
| is_distressed | boolean | 100% | false, true | ok |
| is_multi_parcel | boolean | 100% | false | ok |
| grantor1_name_full | character varying | 59% | SHAW,RUSSELL L & SUSAN D, MARILYN G ORR, ACOSTA,JOSE G & VERA H | ok |
| grantor2_name_full | character varying | 10.4% | #13 MEDICAL ARTS SQUARE PARTNERSHIP, 1 A SERIES OF BG & G SERIES LLC, 1003 E 39TH TRUST | ok |
| grantee1_name_full | character varying | 100% | & SS FAMILY TRUST, ., 00AGENTATX CORP | ok |
| grantee2_name_full | character varying | 46.2% |  , 1000 WALNUT LTD, 1003 E 39TH TRUST | ok |
| grantee_investor_flag | boolean | 100% | false, true | ok |
| title_company_standardized | character varying | 60.4% | 2020 TITLE LLC, 7 TITLE, A CLEAR TITLE COMPANY | ok |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:30:02 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:30:02 GMT-0600 (Central Standard Time) | ok |
| down_payment | numeric | 100% | 0, 1, 3 | ok |
| purchase_ltv | numeric | 100% | 0.0000, 4.8474, 5.2336 | ok |
| instrument_number | text | 30.4% | 1, 10, 100000 | ok |
| book | text | 5.3% | 000003, 000805, 000854 | ok |
| page | text | 0.1% | 000001, 000003, 000005 | sparse |
| transfer_tax_total | numeric | 55.7% | 0.00, 4.50, 5.00 | ok |
| transfer_tax_city | numeric | 20.4% | 0.00 | ok |
| transfer_tax_county | numeric | 20.4% | 0.00 | ok |
| grantor_owner_type | text | 12.9% | AB, AC, AD | ok |
| grantee_owner_type | text | 20.6% | AB, AC, AD | ok |
| grantor2_entity_type | text | 10.4% | IND, NON | ok |
| grantee2_entity_type | text | 46.2% | IND, NON | ok |
| grantee_vesting | text | 8.5% | 101, 103, 104 | ok |
| grantee_vesting_2 | text | 0% | - | DEAD COLUMN |
| grantee_entity_count | integer | 36.2% | 0 | ok |
| grantor_grantee_relationship | text | 0% | - | DEAD COLUMN |
| title_company_code | text | 99.8% | 0, 10, 100 | ok |
| grantor_address | text | 8% | 2339 S US HIGHWAY 281, 1403 DWYCE DR, 1710 DEERFIELD RD | ok |
| grantee_mail_address | text | 65.4% | *, , 1221 HUSONG RD, JIUTING INDUSTRY PARK, 0 BRIARWOOD LN AUSTIN TX 78757 | ok |
| grantee_care_of | text | 0.1% | ., 1, 1101 E PARMER LANE | sparse |
| legal_description | text | 49.6% | #3    L, -289, .5 | ok |
| legal_subdivision | text | 73.7% | HIGHLAND PARK PHASE D SECTION ONE, PFLUGERVILLE INDUSTRIAL PARK, BIG CRK 02 | ok |
| document_number_legacy | text | 83.4% | 0000000001, 0000000002, 0000000003 | ok |
| apn_original | text | 0% | - | DEAD COLUMN |
| recorder_map_reference | text | 18% | VOL 70 PG 43, DOC 2020045515, VOL82 PG182 | ok |

**Dead columns (0% populated):** grantee_vesting_2, grantor_grantee_relationship, apn_original

### current_loans
**Rows:** 359,725 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| attom_id | bigint | 100% | 204172, 206235, 206771 | ok |
| loan_position | integer | 100% | 1 | ok |
| loan_amount | numeric | 100% | 323901.00, 153030.00, 203327.00 | ok |
| loan_type | character varying | 8% | E, P, R | ok |
| mortgage_type | character varying | 52.4% | 0, 10, 101 | ok |
| recording_date | date | 75.7% | Tue Sep 27 2016 00:00:00 GMT-0500 (Central Daylight Time), Mon Feb 11 2013 00:00:00 GMT-0600 (Central Standard Time), Mon Oct 11 2010 00:00:00 GMT-0500 (Central Daylight Time) | ok |
| document_number | character varying | 73.9% | 0000000000, 0000000003, 0000000004 | ok |
| lender_name_first | character varying | 1.2% | 1, 1ST FINANCIAL REVERSE MORTGAGE, A J III | sparse |
| lender_name_standardized | character varying | 75.7% | AUSTIN HABITATA FOR HUMANITY INC, CZ FUNDING, HOLCOMB | ok |
| lender_code | character varying | 0% | - | DEAD COLUMN |
| interest_rate | numeric | 100% | 0.000, 0.120, 0.280 | ok |
| interest_rate_type | character varying | 28.9% | 0, 1, 2 | ok |
| loan_term | integer | 0% | - | DEAD COLUMN |
| due_date | date | 0% | - | DEAD COLUMN |
| estimated_balance | numeric | 0% | - | DEAD COLUMN |
| estimated_monthly_payment | numeric | 0% | - | DEAD COLUMN |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:02:41 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:02:41 GMT-0600 (Central Standard Time) | ok |

**Dead columns (0% populated):** lender_code, loan_term, due_date, estimated_balance, estimated_monthly_payment

### tax_assessments
**Rows:** 444,312 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| attom_id | bigint | 100% | 204172, 205382, 206235 | ok |
| tax_year | integer | 100% | 2023, 2025 | ok |
| assessed_value_total | numeric | 100% | 0.00, 1.00, 5.00 | ok |
| assessed_value_land | numeric | 100% | 257820.00, 327926.00, 282804.00 | ok |
| assessed_value_improvements | numeric | 100% | 165443.00, 201395.00, 189314.00 | ok |
| market_value_total | numeric | 100% | 0.00, 1.00, 5.00 | ok |
| market_value_land | numeric | 100% | 257820.00, 327926.00, 282804.00 | ok |
| market_value_improvements | numeric | 100% | 165443.00, 201395.00, 189314.00 | ok |
| tax_amount_billed | numeric | 88.5% | 1.00, 1.01, 1.02 | ok |
| tax_rate | numeric | 0% | - | DEAD COLUMN |
| tax_delinquent_year | integer | 0% | - | DEAD COLUMN |
| has_homeowner_exemption | boolean | 100% | false | ok |
| has_senior_exemption | boolean | 100% | false | ok |
| has_veteran_exemption | boolean | 100% | false | ok |
| has_disabled_exemption | boolean | 100% | false | ok |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 22:30:04 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:30:04 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:30:05 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 22:30:04 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:30:04 GMT-0600 (Central Standard Time), Mon Feb 09 2026 22:30:05 GMT-0600 (Central Standard Time) | ok |
| previous_assessed_value | numeric | 97.8% | 219308, 105796, 400437 | ok |
| assessed_improvements_pct | numeric | 100% | 0.00, 1.00, 2.00 | ok |
| market_improvements_pct | numeric | 100% | 0.00, 1.00, 2.00 | ok |
| market_value_year | integer | 100% | 2025 | ok |
| fiscal_year | integer | 100% | 2023, 2024 | ok |
| tax_rate_area | text | 100% | 02 05 2J 68, 02 09 10 1G 2J 39, 02 09 10 2J 39 | ok |
| additional_exemptions | text | 4.8% | 1 | sparse |
| prior_sale_date | date | 100% | Mon Feb 27 1995 00:00:00 GMT-0600 (Central Standard Time), Tue Sep 27 2016 00:00:00 GMT-0500 (Central Daylight Time), Mon Feb 11 2013 00:00:00 GMT-0600 (Central Standard Time) | ok |
| prior_sale_amount | numeric | 100% | -1, 0, 131 | ok |

**Dead columns (0% populated):** tax_rate, tax_delinquent_year

### property_valuations
**Rows:** 344,536 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| attom_id | bigint | 100% | 204172, 206235, 206771 | ok |
| valuation_date | date | 100% | Mon Mar 24 2025 00:00:00 GMT-0500 (Central Daylight Time), Mon Apr 21 2025 00:00:00 GMT-0500 (Central Daylight Time), Mon Jul 21 2025 00:00:00 GMT-0500 (Central Daylight Time) | ok |
| estimated_value | numeric | 0% | - | DEAD COLUMN |
| estimated_min_value | numeric | 0% | - | DEAD COLUMN |
| estimated_max_value | numeric | 0% | - | DEAD COLUMN |
| confidence_score | numeric | 0% | - | DEAD COLUMN |
| estimated_rental_value | numeric | 100% | 12616.00, 12567.00, 8100.00 | ok |
| ltv | numeric | 93.4% | 0.00, 1.00, 2.00 | ok |
| available_equity | numeric | 93.4% | 7392771.00, 1055561.00, 1401238.00 | ok |
| lendable_equity | numeric | 93.4% | 339658.00, 304270.00, 396534.00 | ok |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:03:12 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:03:12 GMT-0600 (Central Standard Time) | ok |

**Dead columns (0% populated):** estimated_value, estimated_min_value, estimated_max_value, confidence_score

### foreclosure_records
**Rows:** 45,744 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| id | bigint | 100% | 1, 2, 3 | ok |
| attom_id | bigint | 100% | 244336, 244342, 253537 | ok |
| record_type | character varying | 100% | LIS, NOD, NTS | ok |
| foreclosure_recording_date | date | 96.7% | Mon Apr 04 2005 00:00:00 GMT-0500 (Central Daylight Time), Mon Aug 01 2005 00:00:00 GMT-0500 (Central Daylight Time), Wed Aug 31 2005 00:00:00 GMT-0500 (Central Daylight Time) | ok |
| case_number | character varying | 0% | - | DEAD COLUMN |
| document_number | character varying | 27.6% | 201341656, 201441377, 201541173 | ok |
| original_loan_amount | numeric | 100% | 157103.00, 64966.00, 72080.00 | ok |
| original_loan_recording_date | date | 27% | Thu Jan 29 2004 00:00:00 GMT-0600 (Central Standard Time), Fri Feb 10 1995 00:00:00 GMT-0600 (Central Standard Time), Fri Aug 09 2002 00:00:00 GMT-0500 (Central Daylight Time) | ok |
| loan_balance | numeric | 8.7% | 130102.00, 166316.00, 512050.00 | ok |
| default_amount | numeric | 100% | 4669.00, 0.00 | ok |
| borrower_name | character varying | 96.2% | JOHN COLLINS AND MISSY COLLINS, Juan Antonio Garcia, Gary Rodriguez, Jennifer Zavala | ok |
| lender_name_standardized | character varying | 94.4% | Gilberto Franco And Lucia Franco, Sallis Partnership Ltd, Susser Bank | ok |
| trustee_name | character varying | 99.7% | L DAVID SMITH, Brown & Shapiro, MARC K WHYTE | ok |
| auction_date | date | 33.7% | Tue Apr 01 2003 00:00:00 GMT-0600 (Central Standard Time), Tue Jul 01 2003 00:00:00 GMT-0500 (Central Daylight Time), Tue Aug 05 2003 00:00:00 GMT-0500 (Central Daylight Time) | ok |
| auction_opening_bid | numeric | 30.4% | 117000.00, 190133.00, 107775.00 | ok |
| auction_address | character varying | 94.3% | AREA UNDER THE REAR PORTICO OF THE TRAVIS COUNTY COURTHOUSE ON THE WEST SIDE, Bastrop County Courthouse-803 Pine St- North Door, Https://search.kofile.com/48215/home/index/13 | ok |
| status | character varying | 0% | - | DEAD COLUMN |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:03:44 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:03:44 GMT-0600 (Central Standard Time) | ok |
| estimated_value | numeric | 49% | 447102.00, 442689.00, 64966.00 | ok |
| loan_maturity_date | date | 1.5% | Fri Jan 01 2049 00:00:00 GMT-0600 (Central Standard Time), Sun Feb 01 2032 00:00:00 GMT-0600 (Central Standard Time), Tue May 01 2040 00:00:00 GMT-0500 (Central Daylight Time) | sparse |
| original_loan_interest_rate | numeric | 0% | - | DEAD COLUMN |
| original_loan_instrument_number | text | 39.2% | 2005032195, 2017033733, 2007013099 | ok |
| original_loan_book_page | text | 1.2% | 65/49, 85/638, 10798/366 | sparse |
| original_loan_number | text | 0.7% | 0122105806, 0555862191, 0888002500 | sparse |
| foreclosure_instrument_date | date | 0% | - | DEAD COLUMN |
| foreclosure_book_page | text | 0.5% | CF# 2003008470, GI 7483-283, VOL 10278 PG 552 | sparse |
| trustee_reference_number | text | 73.2% | 2012-65200, 2571, 202540088 | ok |
| courthouse | text | 0% | - | DEAD COLUMN |
| auction_time | text | 95.3% | 12:30 PM, 10:15 AM, 10:30 AM | ok |
| auction_city | text | 90% | Round Rock, GEORGETOWN, SAN MARCOS | ok |
| servicer_name | text | 19.9% | RUSHMORE LOAN MANAGEMENT SERIVCES LLC, AMERICQUEST MORT SECURITIES INC, HORNET SERVICING | ok |
| servicer_address | text | 36.9% | 101 West Louis Henna Suite 450, 9990 Richmond Avenue Ste 400 South, 14801 Quorum Drive, 300 | ok |
| servicer_city | text | 8.7% | SANTA ANA, ANAHEIN HILLS, MIAMISBURY | ok |
| servicer_state | text | 8.7% | CA, OR, TX | ok |
| servicer_zip | text | 8.7% | 60606, 76137, 78728 | ok |
| servicer_phone | text | 0.2% | (877) 744-2506, 8003277861, 8556905900 | sparse |
| lender_address | text | 25.1% | 180 E. Fifth St, P.o. Box 1007, 4425 Ponce Deleon Blvd 5 Th Floor | ok |
| lender_phone | text | 3.2% | 9497271100, 8012648111, 8179872177 | sparse |
| trustee_address | text | 47.9% | 3333 Lee Pkwy #8 Th Floor, 1610 E Saint Andrew Pl #150 F, 8300 Old Mcgregor Rd Suite Ia | ok |
| trustee_phone | text | 6% | 8172360064, 2149549540, 2547723722 | ok |
| property_use_group | text | 100% | AGRICULTURE / FARMING, Residential, COMMERCIAL | ok |
| property_use_standardized | text | 100% | 172, 167, 136 | ok |

**Dead columns (0% populated):** case_number, status, original_loan_interest_rate, foreclosure_instrument_date, courthouse

### climate_risk
**Rows:** 415,847 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| attom_id | bigint | 100% | 204172, 205382, 206235 | ok |
| heat_risk_score | integer | 100% | -1, 95, 96 | ok |
| storm_risk_score | integer | 100% | -1, 41, 42 | ok |
| wildfire_risk_score | integer | 100% | -1, 1, 21 | ok |
| drought_risk_score | integer | 100% | -1, 30, 31 | ok |
| flood_risk_score | integer | 100% | -1, 1, 10 | ok |
| wind_risk_score | integer | 0% | - | DEAD COLUMN |
| air_quality_risk_score | integer | 0% | - | DEAD COLUMN |
| total_risk_score | integer | 0% | - | DEAD COLUMN |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:03:29 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:03:29 GMT-0600 (Central Standard Time) | ok |
| flood_chance_future | numeric | 100% | 0.00, 0.06, 0.11 | ok |
| fema_flood_risk | text | 94.3% | '', 0.2 percent flood zone, 1 percent flood zone | ok |
| heat_threshold_fahrenheit | numeric | 100% | -1 | ok |
| heat_baseline_avg | numeric | 100% | 7.00 | ok |
| heat_future_avg | numeric | 100% | 39.00, 40.00, 41.00 | ok |
| storm_baseline_avg_counts | numeric | 100% | 10.00, 11.00 | ok |
| storm_baseline_avg_totals | numeric | 100% | 14.20, 14.30, 14.40 | ok |
| storm_future_avg_counts | numeric | 100% | 10.00, 11.00 | ok |
| storm_future_avg_totals | numeric | 100% | 14.90, 15.00, 15.10 | ok |
| wildfire_baseline_avg | numeric | 0% | - | DEAD COLUMN |
| wildfire_future_avg | numeric | 0% | - | DEAD COLUMN |
| drought_baseline_avg | numeric | 100% | 0.03, 0.04, 0.05 | ok |
| drought_future_avg | numeric | 100% | 0.04, 0.05, 0.06 | ok |
| flood_high_tide_future | numeric | 100% | 0.00 | ok |
| flood_depth_future | numeric | 100% | 0.00, 0.90, 1.00 | ok |

**Dead columns (0% populated):** wind_risk_score, air_quality_risk_score, total_risk_score, wildfire_baseline_avg, wildfire_future_avg

### building_permits
**Rows:** 3,528,225 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| permit_id | bigint | 100% | 79474, 79475, 79476 | ok |
| attom_id | bigint | 86.5% | 204172, 205382, 206235 | ok |
| address_full | character varying | 100% | 6905 SHADYWOOD DR, 2202 CADIZ CIR, 8617 DEJA AVE | ok |
| fips_code | character varying | 100% | 48453 | ok |
| permit_number | character varying | 100% | 00007739, 006-12, 01112845|11 | ok |
| effective_date | date | 100% | Mon Jan 01 1900 00:00:00 GMT-0600 (Central Standard Time), Tue Jan 01 1901 00:00:00 GMT-0600 (Central Standard Time), Thu Jan 03 1901 00:00:00 GMT-0600 (Central Standard Time) | ok |
| status | character varying | 99.1% | ACTIVE, APPROVED, Aborted | ok |
| status_date | date | 0% | - | DEAD COLUMN |
| permit_type | character varying | 98.5% | 18, 1st re-inspection, electrical - commercial. Temp. Meter loops/service upgrade..., 2 cabins | ok |
| permit_sub_type | character varying | 95% | 1 BedRm, 1 Bath Addn, 1 bedroom apartment, 1 family residence | ok |
| description | text | 98.5% |  plumbingpermit - -  plumbingbkl's 6-10 #6 17336-17340 #7 17341-17345 #8 1734...,  plumbingpermit - - addition st fl. Family room kitchen entryway. Addition 2n...,  plumbingpermit - - city sewer cus over for existing resd. Only. - residential | ok |
| job_value | numeric | 34.9% | 0.00, 1.00, 2.00 | ok |
| fees | numeric | 67.8% | 0.00, 1.00, 2.00 | ok |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:22:23 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:22:23 GMT-0600 (Central Standard Time) | ok |
| project_name | text | 80% | # 300, #1 Custom Homes Inc, #1 Custom Homes, Inc | ok |
| business_name | text | 47.3% | & Damon Chavez, & Damon Chavez; Aztec Electric, & Gretchen Vaden | ok |
| homeowner_flag | text | 0.8% | (Adriana Longoria), (Adriana Longoria);, (Alicia Doak) | sparse |
| county_name | text | 87.8% | Travis | ok |

**Dead columns (0% populated):** status_date

### parcel_boundaries
**Rows:** 428,529 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| id | bigint | 100% | 1, 2, 3 | ok |
| fips_state | character varying | 100% | 48 | ok |
| fips_county | character varying | 100% | 453 | ok |
| apn | character varying | 100% | 0, 100008, 100012 | ok |
| address_line1 | character varying | 99.7% | (HOA - STREET) THURMAN BLUFF DR, 0 BARTON CREEK BLVD, 0 LIME CREEK RD | ok |
| city | character varying | 99.8% | AUSTIN, BARTON CREEK, BEAR CREEK | ok |
| state | character varying | 100% | TX | ok |
| zip5 | character varying | 100% | 76574, 77578, 77835 | ok |
| attom_id | bigint | 98.9% | 204172, 205382, 206235 | ok |
| geometry | USER-DEFINED | N/A | GEOMETRY - not sampled | GEOMETRY |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:59:18 GMT-0600 (Central Standard Time) | ok |
| apn2 | text | 0% | - | DEAD COLUMN |
| county | text | 100% | Travis | ok |
| source_id | text | 100% | 00000834-0202-4e84-a581-427920e2ccc9, 0000afe5-5eaf-459b-aa94-7e4ffbb0fdc0, 0000b41d-7735-4eef-978c-e1f3e2d1f528 | ok |
| latitude | numeric | 100% | 30.352424, 30.452031, 30.123193 | ok |
| longitude | numeric | 100% | -97.683633, -97.758655, -97.577658 | ok |

**Dead columns (0% populated):** apn2

### fema_flood_zones
**Rows:** 14,043 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| id | bigint | 100% | 2, 3, 4 | ok |
| dfirm_id | text | 100% | 48187C, 48287C, 48055C | ok |
| zone_type | text | 100% | X, AREA NOT INCLUDED, AO | ok |
| zone_description | text | 100% | River or stream flood hazard areas, and areas with a 1% or greater chance of ..., Areas identified in a community's FIS as areas of moderate or minimal hazard ..., Areas located within a community or county that are not mapped on any publish... | ok |
| is_sfha | boolean | 100% | false, true | ok |
| static_bfe | numeric | 100% | 527.70, 962.60, 639.00 | ok |
| county_fips | text | 0% | - | DEAD COLUMN |
| panel_number | text | 0% | - | DEAD COLUMN |
| geometry | USER-DEFINED | N/A | GEOMETRY - not sampled | GEOMETRY |
| created_at | timestamp with time zone | 100% | Tue Feb 10 2026 00:33:22 GMT-0600 (Central Standard Time) | ok |
| zone_subtype | text | 74.9% | AREA OF MINIMAL FLOOD HAZARD, FLOODWAY, 0.2 PCT ANNUAL CHANCE FLOOD HAZARD | ok |
| depth | numeric | 100% | 2.00, -9999.00 | ok |
| velocity | numeric | 100% | -9999.00 | ok |
| dual_zone_indicator | text | 0% | - | DEAD COLUMN |
| flood_area_id | text | 100% | 48021C_3401, 48091C_624, 48453C_4844 | ok |

**Dead columns (0% populated):** county_fips, panel_number, dual_zone_indicator

### school_districts
**Rows:** 1,020 | **Sampled:** 1,020

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| nces_district_id | text | 100% | 4800001, 4800002, 4800003 | ok |
| name | text | 100% | McLean Independent School District, Monte Alto Independent School District, Wylie Independent School District | ok |
| level | text | 100% | Elementary, Secondary, Unified | ok |
| state_fips | text | 100% | 48 | ok |
| geometry | USER-DEFINED | N/A | GEOMETRY - not sampled | GEOMETRY |
| created_at | timestamp with time zone | 100% | Tue Feb 10 2026 00:35:49 GMT-0600 (Central Standard Time) | ok |

### mortgage_records
**Rows:** 1,146,011 | **Sampled:** 10,000

| Column | Type | Population % | Samples | Notes |
|---|---|---|---|---|
| transaction_id | bigint | 100% | 115559, 115560, 115561 | ok |
| mortgage_position | integer | 100% | 1 | ok |
| document_number | character varying | 95.4% | 0000000000, 0000000002, 0000000003 | ok |
| recording_date | date | 47.8% | Tue Sep 27 2016 00:00:00 GMT-0500 (Central Daylight Time), Mon Feb 11 2013 00:00:00 GMT-0600 (Central Standard Time), Mon Oct 11 2010 00:00:00 GMT-0500 (Central Daylight Time) | ok |
| loan_amount | numeric | 100% | 323717.00, 220821.00, 239970.00 | ok |
| loan_type | character varying | 53.6% | 0, 10, 101 | ok |
| mortgage_type | character varying | 53.6% | 0, 10, 101 | ok |
| deed_type | character varying | 0% | - | DEAD COLUMN |
| lender_name_standardized | character varying | 100% | UNIVERSITY CREDIT UN, MARIE CRESWELL, GEORGE FAZZIO | ok |
| lender_code | character varying | 100% | -1, 0, 10000 | ok |
| interest_rate | numeric | 59.8% | 0.000, 0.060, 0.120 | ok |
| interest_rate_type | character varying | 59% | 0, 1, 2 | ok |
| loan_term | integer | 56.9% | 0, 1, 2 | ok |
| loan_term_type | character varying | 52% | M | ok |
| due_date | date | 52% | Thu Oct 03 2030 00:00:00 GMT-0500 (Central Daylight Time), Sun Jun 25 2051 00:00:00 GMT-0500 (Central Daylight Time), Sat Mar 25 2034 00:00:00 GMT-0500 (Central Daylight Time) | ok |
| created_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:33:42 GMT-0600 (Central Standard Time) | ok |
| updated_at | timestamp with time zone | 100% | Mon Feb 09 2026 23:33:42 GMT-0600 (Central Standard Time) | ok |
| has_prepayment_penalty | text | 0.2% | 1 | sparse |
| prepayment_term | text | 5.8% | 0, 00, 02 | ok |
| is_interest_only | text | 0% | - | DEAD COLUMN |
| interest_only_period | text | 0% | - | DEAD COLUMN |
| is_seller_carryback | text | 70.7% | 0, 1 | ok |
| lender_entity_type | text | 82.8% | B, C, D | ok |
| instrument_number | text | 50.1% | 100, 1000, 100000 | ok |
| initial_rate_type | text | 0% | - | DEAD COLUMN |
| conversion_rate | numeric | 1.6% | 101, 102, 103 | sparse |
| lender_name_first | text | 1.7% | -ELEN, 1, 1ST FINANCIAL REVERSE MORTGAGE | sparse |
| lender_name_last | text | 91.6% | ECHELON MORTGAGE CORP, PROSPERITY BANK A TEXAS BANKING ASSOCIAT, HOFFMAN | ok |

**Dead columns (0% populated):** deed_type, is_interest_only, interest_only_period, initial_rate_type

