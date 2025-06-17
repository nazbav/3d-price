import sys
import os
import re
import urllib.parse
import webbrowser
import uuid

if len(sys.argv) < 2:
    print(f"Usage: {os.path.basename(sys.argv[0])} <gcode_file>")
    sys.exit(1)

file_path = sys.argv[1]

# Read file and ensure unique model code at the very top
with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

model_code = None
if lines and lines[0].startswith('; MODEL_CODE: '):
    model_code = lines[0].split('=', 1)[1].strip()
else:
    model_code = uuid.uuid4().hex
    lines.insert(0, f'; MODEL_CODE: {model_code}\n')
    with open(file_path, 'w', encoding='utf-8') as fw:
        fw.writelines(lines)

printer = "Unknown"
print_time = ""
filament_weight = ""
filament_type = ""
filament_settings = ""

after_exec = False
in_config = False
thumbnail_data = ""
in_thumbnail = False

for line in lines:
    line = line.strip()
    if line.startswith('; THUMBNAIL_BLOCK_START'):
        continue
    if line.startswith('; thumbnail begin'):
        in_thumbnail = True
        continue
    if line.startswith('; thumbnail end'):
        in_thumbnail = False
        continue
    if in_thumbnail:
        if line.startswith(';'):
            thumbnail_data += line[1:].strip()
        else:
            thumbnail_data += line.strip()
        continue

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

model_name = model_code  # use unique code as name

final_filament = f"{filament_settings}".strip('_')

params = {
    'printer': printer,
    'model_status[]': 'new',
    'model_name[]': model_name,
    'model_id[]': model_code,
    'model_time[]': print_time,
    'model_weight[]': filament_weight,
    'model_filament[]': final_filament,
}

if thumbnail_data:
    params['model_thumbnail[]'] = thumbnail_data

url = 'https://nazbav.github.io/3d-price/test.html?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
print('Opening:', url)
webbrowser.open(url)
