#!/usr/bin/env python3
"""
discover_endpoints.py — Schema discovery for GIS ETL endpoints

Queries all target ArcGIS REST endpoints and prints field schemas,
record counts, and spatial reference information.

Usage:
    python3 discover_endpoints.py           # Discover all endpoints
    python3 discover_endpoints.py --flum    # FLUM only
    python3 discover_endpoints.py --aadt    # AADT + Roadways only
    python3 discover_endpoints.py --boundaries  # City/ETJ only
    python3 discover_endpoints.py --infra   # TX Infrastructure only
"""

import argparse
import json
import requests
from gis_etl_utils import configure_stdout, discover_endpoint

# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINT DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════

ENDPOINTS = {
    'flum': {
        'name': 'Austin Future Land Use Map (FLUM)',
        'url': 'https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/FLUM/FeatureServer/0',
        'alt_url': 'https://maps.austintexas.gov/gis/rest/PropertyProfile/LongRangePlanning/MapServer/4',
    },
    'aadt_points': {
        'name': 'Travis County AADT Points',
        'url': 'https://gis.traviscountytx.gov/server1/rest/services/Public_Works/TxDOT_24HR_Annual_Avg_Daily_Traffic_AADT/MapServer/0',
    },
    'aadt_roadways': {
        'name': 'TxDOT Roadways (Statewide)',
        'url': 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer/0',
    },
    'city_limits': {
        'name': 'Travis County City Limits',
        'url': 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/Municipal_Jurisdictions_Annexations/MapServer/0',
    },
    'etj': {
        'name': 'Travis County ETJ Boundaries',
        'url': 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/Municipal_Jurisdictions_Annexations/MapServer/1',
    },
    'etj_released': {
        'name': 'Travis County ETJ Released',
        'url': 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/Municipal_Jurisdictions_Annexations/MapServer/2',
    },
}

TX_INFRA_ITEM_ID = 'fed99b46668242a59ddb80bac5e8b71a'


def print_endpoint_info(name, info):
    """Print formatted endpoint information."""
    print(f"\n{'='*70}")
    print(f"  {name}")
    print(f"{'='*70}")

    if 'error' in info:
        print(f"  ERROR: {info['error']}")
        return

    print(f"  Geometry Type: {info.get('geometryType', 'Unknown')}")
    print(f"  Record Count:  {info.get('count', 'Unknown')}")

    sr = info.get('spatialReference', {})
    wkid = sr.get('wkid') or sr.get('latestWkid') or 'Unknown'
    print(f"  Spatial Ref:   WKID {wkid}")

    fields = info.get('fields', [])
    if fields:
        print(f"\n  Fields ({len(fields)}):")
        print(f"  {'Name':<30} {'Type':<20} {'Alias'}")
        print(f"  {'-'*30} {'-'*20} {'-'*30}")
        for f in fields:
            fname = f.get('name', '')[:30]
            ftype = f.get('type', '').replace('esriFieldType', '')[:20]
            falias = f.get('alias', '')[:30]
            print(f"  {fname:<30} {ftype:<20} {falias}")


def discover_flum():
    """Discover Austin FLUM endpoint."""
    print("\n" + "="*70)
    print("  AUSTIN FLUM DISCOVERY")
    print("="*70)

    # Try primary URL first
    url = ENDPOINTS['flum']['url']
    print(f"\n  Trying primary URL: {url}")
    info = discover_endpoint(url)

    if 'error' in info:
        print(f"  Primary URL failed: {info['error']}")
        # Try alternate URL
        url = ENDPOINTS['flum']['alt_url']
        print(f"\n  Trying alternate URL: {url}")
        info = discover_endpoint(url)

    print_endpoint_info(ENDPOINTS['flum']['name'], info)

    # Identify FLU field
    if 'fields' in info:
        flu_candidates = ['FLUM', 'FLU', 'LAND_USE', 'CATEGORY', 'DESCRIPTION', 'STATUS', 'KEY']
        print("\n  Potential FLU designation fields:")
        for f in info['fields']:
            fname = f.get('name', '').upper()
            if any(c in fname for c in flu_candidates):
                print(f"    -> {f.get('name')} ({f.get('alias', '')})")


def discover_aadt():
    """Discover AADT endpoints."""
    print("\n" + "="*70)
    print("  AADT DISCOVERY")
    print("="*70)

    for key in ['aadt_points', 'aadt_roadways']:
        url = ENDPOINTS[key]['url']
        print(f"\n  Querying: {url}")
        info = discover_endpoint(url)
        print_endpoint_info(ENDPOINTS[key]['name'], info)

        # Identify AADT and road name fields
        if 'fields' in info:
            aadt_candidates = ['AADT', 'ADT', 'TRAFFIC', 'COUNT', 'VOLUME']
            road_candidates = ['ROAD', 'RTE', 'STREET', 'NAME', 'RDBD']
            print("\n  Potential AADT fields:")
            for f in info['fields']:
                fname = f.get('name', '').upper()
                if any(c in fname for c in aadt_candidates):
                    print(f"    -> {f.get('name')} ({f.get('alias', '')})")
            print("  Potential road name fields:")
            for f in info['fields']:
                fname = f.get('name', '').upper()
                if any(c in fname for c in road_candidates):
                    print(f"    -> {f.get('name')} ({f.get('alias', '')})")


def discover_boundaries():
    """Discover boundary endpoints."""
    print("\n" + "="*70)
    print("  BOUNDARIES DISCOVERY")
    print("="*70)

    for key in ['city_limits', 'etj', 'etj_released']:
        url = ENDPOINTS[key]['url']
        print(f"\n  Querying: {url}")
        info = discover_endpoint(url)
        print_endpoint_info(ENDPOINTS[key]['name'], info)

        # Identify city/jurisdiction fields
        if 'fields' in info:
            city_candidates = ['CITY', 'NAME', 'JURISDICTION', 'MUNI', 'ETJ']
            print("\n  Potential city/jurisdiction fields:")
            for f in info['fields']:
                fname = f.get('name', '').upper()
                if any(c in fname for c in city_candidates):
                    print(f"    -> {f.get('name')} ({f.get('alias', '')})")


def discover_tx_infrastructure():
    """Discover Texas Infrastructure Map."""
    print("\n" + "="*70)
    print("  TEXAS INFRASTRUCTURE MAP DISCOVERY")
    print("="*70)

    # Get item info
    item_url = f"https://www.arcgis.com/sharing/rest/content/items/{TX_INFRA_ITEM_ID}?f=json"
    print(f"\n  Querying item: {item_url}")

    try:
        resp = requests.get(item_url, timeout=30)
        item = resp.json()

        if 'error' in item:
            print(f"  ERROR: {item['error'].get('message', 'Unknown error')}")
            return

        print(f"  Item Type: {item.get('type', 'Unknown')}")
        print(f"  Title: {item.get('title', 'Unknown')}")
        print(f"  URL: {item.get('url', 'None')}")

        # If it's a web map, get the data to find operational layers
        if item.get('type') == 'Web Map':
            print("\n  This is a Web Map. Fetching operational layers...")
            data_url = f"https://www.arcgis.com/sharing/rest/content/items/{TX_INFRA_ITEM_ID}/data?f=json"
            data_resp = requests.get(data_url, timeout=30)
            data = data_resp.json()

            op_layers = data.get('operationalLayers', [])
            print(f"\n  Found {len(op_layers)} operational layers:")
            for i, layer in enumerate(op_layers):
                print(f"\n  [{i}] {layer.get('title', 'Untitled')}")
                print(f"      URL: {layer.get('url', 'None')}")
                print(f"      Type: {layer.get('layerType', 'Unknown')}")

                # Check if it's a priority infrastructure type
                title = layer.get('title', '').lower()
                priority = []
                if any(k in title for k in ['electric', 'transmission', 'power']):
                    priority.append('electric_transmission')
                if any(k in title for k in ['gas', 'pipeline']):
                    priority.append('gas_pipelines')
                if any(k in title for k in ['rail', 'railroad', 'freight']):
                    priority.append('rail_lines')
                if any(k in title for k in ['telecom', 'fiber', 'communication']):
                    priority.append('telecom')
                if any(k in title for k in ['water', 'wastewater', 'sewer', 'storm']):
                    priority.append('SKIP (already have)')

                if priority:
                    print(f"      Priority: {', '.join(priority)}")

        elif item.get('url'):
            # It's a feature service directly
            print("\n  This is a Feature Service. Enumerating layers...")
            service_url = item.get('url')
            info = discover_endpoint(service_url)
            print_endpoint_info("TX Infrastructure Service", info)

    except Exception as e:
        print(f"  ERROR: {e}")


def main():
    configure_stdout()

    parser = argparse.ArgumentParser(description='Discover GIS ETL endpoints')
    parser.add_argument('--flum', action='store_true', help='FLUM only')
    parser.add_argument('--aadt', action='store_true', help='AADT + Roadways only')
    parser.add_argument('--boundaries', action='store_true', help='City/ETJ only')
    parser.add_argument('--infra', action='store_true', help='TX Infrastructure only')
    args = parser.parse_args()

    # If no specific flag, discover all
    discover_all = not (args.flum or args.aadt or args.boundaries or args.infra)

    print("\n" + "="*70)
    print("  GIS ENDPOINT DISCOVERY")
    print("="*70)

    if discover_all or args.flum:
        discover_flum()

    if discover_all or args.aadt:
        discover_aadt()

    if discover_all or args.boundaries:
        discover_boundaries()

    if discover_all or args.infra:
        discover_tx_infrastructure()

    print("\n" + "="*70)
    print("  DISCOVERY COMPLETE")
    print("="*70 + "\n")


if __name__ == '__main__':
    main()
