import os
import json
import glob
import time
import argparse

ORCA_FILAMENT_DIR = os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'user', 'default', 'filament')
ORCA_MACHINE_DIR = os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'user', 'default', 'machine')

DEFAULT_INPUT = 'calc_data.json'
DEFAULT_OUTPUT = 'calc_data_synced.json'

ORCA_FIELDS = [
    'type','filament_id','setting_id','name','from','instantiation','inherits',
    'filament_diameter','filament_density','filament_start_gcode','filament_end_gcode',
    'filament_flow_ratio','filament_max_volumetric_speed','slow_down_layer_time',
    'support_material_interface_fan_speed','slow_down_min_speed','enable_pressure_advance',
    'pressure_advance','temperature_vitrification','hot_plate_temp_initial_layer',
    'hot_plate_temp','compatible_printers'
]

PRINTER_FIELDS = [
    'before_layer_change_gcode','change_filament_gcode','machine_start_gcode',
    'machine_end_gcode','print_host','print_host_webui','printer_settings_id'
]

def load_json(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

def normalize_value(val, key):
    if isinstance(val, list):
        if key == 'compatible_printers':
            return ', '.join(val)
        return val[0] if val else ''
    return val

def convert_filament(data):
    orca = {}
    for k in ORCA_FIELDS:
        if k in data:
            orca[k] = normalize_value(data[k], k)
    name = data.get('filament_settings_id') or data.get('name') or 'material'
    return name, orca

def convert_machine(data):
    orca = {}
    for k in PRINTER_FIELDS:
        if k in data:
            orca[k] = normalize_value(data[k], k)
    name = data.get('printer_settings_id') or data.get('name') or 'printer'
    return name, orca

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
        name, orca = convert_filament(cfg)
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
