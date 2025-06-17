import os
import json
import glob
import time
import argparse

ORCA_FILAMENT_DIR = os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'user', 'default', 'filament')
ORCA_MACHINE_DIR = os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'user', 'default', 'machine')

DEFAULT_INPUT = 'calc_data.json'
DEFAULT_OUTPUT = 'calc_data_synced.json'



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

def convert_filament(data):
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
    for fp in glob.glob(os.path.join(fil_dir, '*.json')):
        cfg = load_json(fp)
        if not cfg:
            continue
        info_path = os.path.splitext(fp)[0] + '.info'
        info_text = ''
        if os.path.exists(info_path):
            try:
                with open(info_path, 'r', encoding='utf-8', errors='ignore') as f:
                    info_text = f.read()
            except Exception:
                info_text = ''
        name, orca = convert_filament(cfg)
        key = name.lower()
        if key in mat_map:
            mat_map[key]['orca'] = orca
            mat_map[key]['orcaInfo'] = info_text
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
                'orca': orca,
                'orcaInfo': info_text
            }
    data['materials'] = list(mat_map.values())

    pr_map = {p.get('name','').lower(): p for p in data.get('printers', [])}
    mach_dir = os.path.join(args.orca_path, 'machine')
    for fp in glob.glob(os.path.join(mach_dir, '*.json')):
        cfg = load_json(fp)
        if not cfg:
            continue
        info_path = os.path.splitext(fp)[0] + '.info'
        info_text = ''
        if os.path.exists(info_path):
            try:
                with open(info_path, 'r', encoding='utf-8', errors='ignore') as f:
                    info_text = f.read()
            except Exception:
                info_text = ''
        name, orca = convert_machine(cfg)
        key = name.lower()
        if key in pr_map:
            pr_map[key]['orca'] = orca
            pr_map[key]['orcaInfo'] = info_text
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
                'orca': orca,
                'orcaInfo': info_text
            }
    data['printers'] = list(pr_map.values())

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('Saved', args.output)

if __name__ == '__main__':
    main()
