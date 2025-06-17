import os
import json
import glob
import time
import argparse

ORCA_FILAMENT_DIR = os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'user', 'default', 'filament')
ORCA_MACHINE_DIR = os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'user', 'default', 'machine')

DEFAULT_INPUT = 'calc_data.json'
DEFAULT_OUTPUT = 'calc_data_synced.json'


def build_system_filament_map(system_root):
    mapping = {}
    for fp in glob.glob(os.path.join(system_root, '**', '*.json'), recursive=True):
        cfg = load_json(fp)
        if not cfg or 'name' not in cfg:
            continue
        name = cfg['name']
        if name not in mapping:
            mapping[name] = cfg
    return mapping

def merge_inherited(cfg, mapping, seen=None):
    if seen is None:
        seen = set()
    parent = cfg.get('inherits')
    if not parent or parent in seen:
        return cfg
    base = mapping.get(parent)
    if base:
        seen.add(parent)
        base = merge_inherited(dict(base), mapping, seen)
        for k, v in base.items():
            cfg.setdefault(k, v)
    return cfg

def load_json(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

def normalize_name(value):
    if isinstance(value, list):
        return value[0] if value else ''
    return value or ''

def convert_filament(data, mapping=None):
    if mapping:
        data = merge_inherited(dict(data), mapping)
    name_val = data.get('filament_settings_id') or data.get('name')
    name = normalize_name(name_val) or 'material'
    return name, data

def convert_machine(data):
    name_val = data.get('printer_settings_id') or data.get('name')
    name = normalize_name(name_val) or 'printer'
    return name, data

def main():
    parser = argparse.ArgumentParser(description='Sync Orca Slicer data with calculator export')
    parser.add_argument('--input', default=DEFAULT_INPUT, help='path to calc_data.json')
    parser.add_argument('--output', default=DEFAULT_OUTPUT, help='name of generated file')
    parser.add_argument('--orca-path', default=os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'user', 'default'), help='OrcaSlicer user path')
    args = parser.parse_args()

    data = load_json(args.input) or {
        'printers': [],
        'materials': [],
        'additionalGlobal': [],
        'calcSettings': {},
        'labelSettings': {},
        'calcHistory': []
    }

    mat_map = {m.get('name','').lower(): m for m in data.get('materials', [])}
    fil_dir = os.path.join(args.orca_path, 'filament')
    system_dir = os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'system')
    system_filaments = build_system_filament_map(system_dir)
    for fp in glob.glob(os.path.join(fil_dir, '*.json')):
        cfg = load_json(fp)
        if not cfg:
            continue
        name, orca = convert_filament(cfg, system_filaments)
        key = name.lower()
        if key in mat_map:
            mat_map[key]['orca'] = orca
        else:
            mat_map[key] = {
                'id': int(time.time()*1000) + len(mat_map),
                'name': name,
                'costPerKg': 0,
                'balance': 0,
                'declaredWeight': 0,
                'wastePercent': 0,
                'manufacturer': '',
                'productionDate': '',
                'orca': orca
            }
    data['materials'] = list(mat_map.values())

    pr_map = {p.get('name','').lower(): p for p in data.get('printers', [])}
    mach_dir = os.path.join(args.orca_path, 'machine')
    for fp in glob.glob(os.path.join(mach_dir, '*.json')):
        cfg = load_json(fp)
        if not cfg:
            continue
        name, orca = convert_machine(cfg)
        key = name.lower()
        if key in pr_map:
            pr_map[key]['orca'] = orca
        else:
            pr_map[key] = {
                'id': int(time.time()*1000) + len(pr_map),
                'name': name,
                'cost': 0,
                'hoursToRecoup': 1000,
                'power': 0,
                'maintCostHour': 0,
                'additional': [],
                'materials': [],
                'orca': orca
            }
    data['printers'] = list(pr_map.values())

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('Saved', args.output)

if __name__ == '__main__':
    main()
