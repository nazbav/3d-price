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

    # --- Materials & filament profiles ---------------------------------------------------------
    material_profiles = data.get('materialProfiles', [])
    if not isinstance(material_profiles, list):
        material_profiles = []

    # Keep the FULL materials list (no dedup by name)
    materials = data.get('materials', [])
    if not isinstance(materials, list):
        materials = []

    # Convert old-format materials that embed Orca config
    for m in materials:
        if 'orca' in m or 'orcaInfo' in m:
            prof = {
                'id': gen_id(),
                'config': m.get('orca', {}) or {},
                'info': m.get('orcaInfo', '') or ''
            }
            material_profiles.append(prof)
            m['profileIds'] = [prof['id']]
            m.pop('orca', None)
            m.pop('orcaInfo', None)
        else:
            if not isinstance(m.get('profileIds'), list):
                m['profileIds'] = []

    # Build profile lookup by filament profile name (normalized)
    pf_map = {}
    for p in material_profiles:
        cfg = p.get('config')
        if not isinstance(cfg, dict):
            cfg = {}
        nm_val = cfg.get('filament_settings_id') or cfg.get('name')
        nm = normalize_name(nm_val).lower()
        if nm:
            pf_map[nm] = p

    # Build material name -> list[materials] mapping for linking,
    # plus a deduped "display list" of names for the menu.
    seen_names = set()
    display_names = []
    materials_by_name = {}
    for m in materials:
        nm = (m.get('name') or '').strip()
        key = nm.lower()
        if key not in seen_names:
            seen_names.add(key)
            display_names.append(nm)
        materials_by_name.setdefault(key, []).append(m)

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
        key = name.lower().strip()

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

        # Which materials are already linked to this profile?
        linked = []
        for mats in materials_by_name.values():
            for m in mats:
                if prof['id'] in (m.get('profileIds') or []):
                    linked.append(m.get('name') or '')
                    break  # show each name once
        if linked:
            names = ', '.join(linked)
            ans = input(f"  already linked to {names or '?'}; change? [y/N]: ").strip().lower()
            if ans not in ('y', 'yes'):
                continue
            # Unlink from all
            for mats in materials_by_name.values():
                for m in mats:
                    if prof['id'] in (m.get('profileIds') or []):
                        m['profileIds'] = [x for x in (m.get('profileIds') or []) if x != prof['id']]

        sel = select_item('Assign to materials', display_names, multi=True)
        for idx in sel:
            if 0 <= idx < len(display_names):
                nm = display_names[idx]
                mats = materials_by_name.get(nm.lower().strip(), [])
                for mat in mats:
                    if not isinstance(mat.get('profileIds'), list):
                        mat['profileIds'] = []
                    if prof['id'] not in mat['profileIds']:
                        mat['profileIds'].append(prof['id'])

    data['materials'] = materials  # keep full list
    data['materialProfiles'] = material_profiles

    # --- Printers & machine profiles -----------------------------------------------------------
    printer_profiles = data.get('printerProfiles', [])
    if not isinstance(printer_profiles, list):
        printer_profiles = []

    pr_profile_keys = {}
    pair_to_profile = {}

    # Helper maps
    pr_map = {}    # host_key -> printer
    name_map = {}  # lower(name) -> printer

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
        pair = (host_key, (name or '').lower())

        existing = pair_to_profile.get(pair)
        if existing:
            old_p = pr_id_map.get(existing.get('printerId'))
            msg = f"linked to {old_p.get('name', '')}" if old_p else 'already imported'
            ans = input(f"  {msg}. Change? [y/N]: ").strip().lower()
            if ans in ('y', 'yes'):
                if old_p and existing['id'] in old_p.get('profileIds', []):
                    old_p['profileIds'].remove(existing['id'])
                # choose a target printer for reassignment
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

        # Create a new machine profile -> we MUST pick a target printer safely.
        target = None
        # 1) try host match
        if host_key and host_key in pr_map:
            target = pr_map[host_key]
        # 2) if only one printer exists, pick it
        if not target and len(printer_list) == 1:
            target = printer_list[0]
        # 3) ask the user
        if not target:
            sel = select_item('Select printer', [p.get('name', '') for p in printer_list], multi=False)
            target = printer_list[sel] if sel is not None else None
        if not target:
            print("  skipped: no printer selected.")
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

    # Keep all printers; just clean helper flag
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
