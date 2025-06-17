import sys
import os
import re
import urllib.parse
import webbrowser

if len(sys.argv) < 2:
    print(f"Usage: {os.path.basename(sys.argv[0])} <gcode_file>")
    sys.exit(1)

file_path = sys.argv[1]

printer = "Unknown"
print_time = ""
filament_weight = ""
filament_type = ""
filament_settings = ""

after_exec = False
in_config = False

with open(file_path, 'r', encoding='utf-8', errors='ignore') as fh:
    for line in fh:
        line = line.strip()
        if line == '; EXECUTABLE_BLOCK_END':
            after_exec = True
            continue
        if not after_exec:
            continue
        if line == '; CONFIG_BLOCK_START':
            in_config = True
            continue
        if line == '; CONFIG_BLOCK_END':
            in_config = False
            continue
        if line.startswith('; estimated printing time') and '=' in line:
            m = re.search(r'=\s*(.+)$', line)
            if m:
                print_time = m.group(1).strip()
        elif line.startswith('; total filament used [g]') and '=' in line:
            m = re.search(r'=\s*([0-9.]+)', line)
            if m:
                filament_weight = m.group(1)
        elif in_config:
            if 'printer_settings_id' in line and '=' in line:
                m = re.search(r'=\s*"?([^";]+)', line)
                if m:
                    printer = m.group(1).strip()
            elif line.startswith('; filament_type') and '=' in line:
                m = re.search(r'=\s*"?([^";]+)', line)
                if m:
                    filament_type = m.group(1).strip()
            elif 'filament_settings_id' in line and '=' in line:
                m = re.search(r'=\s*"?([^";]+)', line)
                if m:
                    filament_settings = m.group(1).strip()

model_name = os.path.basename(file_path)
model_name = re.sub(r'\.gcode(\.pp)?$', '', model_name, flags=re.IGNORECASE)

final_filament = f"{filament_settings}".strip('_')

params = {
    'printer': printer,
    'model_status[]': 'new',
    'model_name[]': model_name,
    'model_time[]': print_time,
    'model_weight[]': filament_weight,
    'model_filament[]': final_filament,
}

url = 'https://nazbav.github.io/3d-price/test.html?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
print('Opening:', url)
webbrowser.open(url)
