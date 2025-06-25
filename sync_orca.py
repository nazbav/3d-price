import os
import json
import glob
import argparse
import random
import string

ORCA_FILAMENT_DIR = os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'user', 'default', 'filament')
ORCA_MACHINE_DIR = os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'user', 'default', 'machine')

DEFAULT_INPUT = 'calc_data.json'
DEFAULT_OUTPUT = "calc_data_synced.json"


def gen_id():
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(random.choices(alphabet, k=16))


def select_item(prompt, options, multi=False):
    if not options:
        return [] if multi else None
    for idx, opt in enumerate(options, 1):
        print(f"{idx}) {opt}")
    if multi:
        raw = input(f"{prompt} (comma numbers, 0 to skip): ").strip()
        if not raw or raw == '0':
            return []
        result = []
        for part in raw.split(','):
            part = part.strip()
            if part.isdigit():
                i = int(part)
                if 1 <= i <= len(options):
                    result.append(i - 1)
        return result
    else:
        raw = input(f"{prompt} [0 skip]: ").strip()
        if not raw or not raw.isdigit():
            return None
        i = int(raw)
        if i == 0 or i > len(options):
            return None
        return i - 1



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
    host_key = (data.get('print_host') or data.get('inherits') or '').lower()
    return name, host_key, data

def main():
    parser = argparse.ArgumentParser(description='Sync Orca Slicer data with calculator export')
    parser.add_argument('--input', default=DEFAULT_INPUT, help='path to calc_data.json')
    parser.add_argument('--output', default=DEFAULT_OUTPUT, help='name of generated file')
    parser.add_argument('--orca-path', default=os.path.join(os.environ.get('APPDATA', ''), 'OrcaSlicer', 'user', 'default'), help='OrcaSlicer user path')
    args = parser.parse_args()

    data = load_json(args.input) or {
        'printers': [],
        'materials': [],
        'materialProfiles': [],
        'additionalGlobal': [],
        'calcSettings': {},
        'labelSettings': {},
        'calcHistory': [],
        'printerProfiles': []
    }

    material_profiles = data.get('materialProfiles', [])
    if not isinstance(material_profiles, list):
        material_profiles = []
    printer_profiles = data.get('printerProfiles', [])
    if not isinstance(printer_profiles, list):
        printer_profiles = []
    pr_profile_keys = {}
    pair_to_profile = {}
    for pf in printer_profiles:
        cfg = pf.get('config', {})
        h = (cfg.get('print_host') or cfg.get('inherits') or '').lower()
        ps = (cfg.get('printer_settings_id') or cfg.get('name') or '').lower()
        pair = (h, ps)
        pair_to_profile[pair] = pf
        pid = pf.get('printerId')
        if pid:
            pr_profile_keys.setdefault(pid, set()).add(pair)

    mat_map = {m.get('name', '').lower(): m for m in data.get('materials', [])}
    materials_list = list(mat_map.values())

    # convert old format materials with embedded Orca config
    for m in list(mat_map.values()):
        if 'orca' in m or 'orcaInfo' in m:
            prof = {
                'id': gen_id(),
                'config': m.get('orca', {}),
                'info': m.get('orcaInfo', '')
            }
            material_profiles.append(prof)
            m['profileIds'] = [prof['id']]
            if 'orca' in m:
                del m['orca']
            if 'orcaInfo' in m:
                del m['orcaInfo']
        else:
            if not isinstance(m.get('profileIds'), list):
                m['profileIds'] = []

    pf_map = {}
    for p in material_profiles:
        cfg = p.get('config')
        if not isinstance(cfg, dict):
            cfg = {}
        nm_val = cfg.get('filament_settings_id') or cfg.get('name')
        nm = normalize_name(nm_val).lower()
        if nm:
            pf_map[nm] = p

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

        print(f"\nFound filament profile '{name}' from {os.path.basename(fp)}")
        prof = pf_map.get(key)
        if not prof:
            prof = {
                'id': gen_id(),
                'config': orca,
                'info': info_text
            }
            material_profiles.append(prof)
            pf_map[key] = prof

        linked = [m for m in materials_list if prof['id'] in m.get('profileIds', [])]
        if linked:
            names = ', '.join(m.get('name', '') for m in linked)
            ans = input(f"  already linked to {names or '?'}; change? [y/N]: ").strip().lower()
            if ans not in ('y', 'yes'):
                continue
            for m in linked:
                m['profileIds'] = [x for x in m.get('profileIds', []) if x != prof['id']]

        sel = select_item('Assign to materials', [m.get('name', '') for m in materials_list], multi=True)
        for idx in sel:
            mat = materials_list[idx]
            if not isinstance(mat.get('profileIds'), list):
                mat['profileIds'] = []
            if prof['id'] not in mat['profileIds']:
                mat['profileIds'].append(prof['id'])

    data['materials'] = list(mat_map.values())
    data['materialProfiles'] = material_profiles

    pr_map = {}
    name_map = {}

    def score_printer(pr):
        fields = ['cost', 'hoursToRecoup', 'power', 'maintCostHour']
        cnt = sum(1 for f in fields if pr.get(f))
        return (cnt, pr.get('cost', 0), pr.get('hoursToRecoup', 0), pr.get('power', 0), pr.get('maintCostHour', 0))

    def merge_printers(a, b):
        if score_printer(b) > score_printer(a):
            a, b = b, a
        existing = set()
        for pid in a.get('profileIds', []):
            pf = next((x for x in printer_profiles if x['id'] == pid), None)
            if pf:
                cfg = pf.get('config', {})
                h = (cfg.get('print_host') or cfg.get('inherits') or '').lower()
                ps = (cfg.get('printer_settings_id') or cfg.get('name') or '').lower()
                pair = (h, ps)
                existing.add(pair)
                pair_to_profile[pair] = pf
        for pid in b.get('profileIds', []):
            pf = next((x for x in printer_profiles if x['id'] == pid), None)
            if pf:
                cfg = pf.get('config', {})
                h = (cfg.get('print_host') or cfg.get('inherits') or '').lower()
                ps = (cfg.get('printer_settings_id') or cfg.get('name') or '').lower()
                pair = (h, ps)
                if pair not in existing:
                    a.setdefault('profileIds', []).append(pid)
                    pf['printerId'] = a.get('id')
                    existing.add(pair)
                pair_to_profile[pair] = pf
        b['_merged'] = True
        return a

    printers_in = data.get('printers', [])
    for p in printers_in:
        if not isinstance(p.get('profileIds'), list):
            p['profileIds'] = []
        profs = []
        if isinstance(p.get('orcaProfiles'), list):
            profs = p['orcaProfiles']
        elif p.get('orca') or p.get('orcaInfo'):
            profs = [{'id': gen_id(), 'config': p.get('orca', {}), 'info': p.get('orcaInfo', '')}]
        for op in profs:
            pid = op.get('id') or gen_id()
            printer_profiles.append({'id': pid, 'config': op.get('config', {}), 'info': op.get('info', ''), 'printerId': p.get('id')})
            if pid not in p['profileIds']:
                p['profileIds'].append(pid)
            cfg = op.get('config', {})
            h = (cfg.get('print_host') or cfg.get('inherits') or '').lower()
            ps = (cfg.get('printer_settings_id') or cfg.get('name') or '').lower()
            pair = (h, ps)
            pr_profile_keys.setdefault(p.get('id'), set()).add(pair)
            pair_to_profile[pair] = printer_profiles[-1]
        p.pop('orcaProfiles', None)
        p.pop('orca', None)
        p.pop('orcaInfo', None)
        host_keys = []
        for prof in profs:
            cfg = prof.get('config', {})
            host = (cfg.get('print_host') or cfg.get('inherits') or '').lower()
            if host:
                host_keys.append(host)
        for host in host_keys:
            if host in pr_map:
                pr_map[host] = merge_printers(pr_map[host], p)
            else:
                pr_map[host] = p
        name_map[p.get('name', '').lower()] = p

    mach_dir = os.path.join(args.orca_path, 'machine')
    printer_list = list(name_map.values())
    pr_id_map = {p.get('id'): p for p in printer_list}
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
        name, host_key, orca = convert_machine(cfg)
        print(f"\nMachine profile '{name}' from {os.path.basename(fp)}")
        pair = (host_key, name.lower())
        existing = pair_to_profile.get(pair)
        if existing:
            old_p = pr_id_map.get(existing.get('printerId'))
            msg = f"linked to {old_p.get('name', '')}" if old_p else 'already imported'
            ans = input(f"  {msg}. Change? [y/N]: ").strip().lower()
            if ans in ('y', 'yes'):
                if old_p and existing['id'] in old_p.get('profileIds', []):
                    old_p['profileIds'].remove(existing['id'])
                sel = select_item('Select printer', [p.get('name', '') for p in printer_list], multi=False)
                target = printer_list[sel] if sel is not None else None
                if not target:
                    continue
                existing['printerId'] = target.get('id')
                target.setdefault('profileIds', []).append(existing['id'])
                pr_profile_keys.setdefault(target.get('id'), set()).add(pair)
                if old_p:
                    pr_profile_keys.get(old_p.get('id'), set()).discard(pair)
                pr_id_map[target.get('id')] = target
                if host_key:
                    pr_map[host_key] = target
            continue

        sel = select_item('Select printer', [p.get('name', '') for p in printer_list], multi=False)
        target = printer_list[sel] if sel is not None else None
        if not target:
            continue
        pid = gen_id()
        profile_obj = {'id': pid, 'config': orca, 'info': info_text, 'printerId': target.get('id')}
        printer_profiles.append(profile_obj)
        target.setdefault('profileIds', []).append(pid)
        pr_profile_keys.setdefault(target.get('id'), set()).add(pair)
        pair_to_profile[pair] = profile_obj
        pr_id_map[target.get('id')] = target
        if host_key:
            pr_map[host_key] = target


    # keep all printers from the input even if they were "merged" with
    # additional profiles. previously the code removed entries marked as
    # `_merged`, which could unexpectedly drop user defined printers when
    # a matching machine file existed.  Instead of filtering them out we
    # keep every printer and simply clean the helper flag.
    printers = list(name_map.values())

    for p in printers:
        if not isinstance(p.get('profileIds'), list):
            p['profileIds'] = []
        if '_merged' in p:
            del p['_merged']

    data['printers'] = printers
    data['printerProfiles'] = printer_profiles

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('Saved', args.output)

if __name__ == '__main__':
    main()
