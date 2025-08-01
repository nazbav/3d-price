import sys
import os
import re
import urllib.parse
import webbrowser
import random
import string

def generate_uuid():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=8)) + \
           ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))


if len(sys.argv) < 2:
    print(f"Usage: {os.path.basename(sys.argv[0])} <gcode_file>")
    sys.exit(1)

file_path = sys.argv[1]

# Read file and ensure unique model code at the very top
with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

model_code = None
if lines and (lines[0].startswith('; MODEL_CODE: ') or lines[0].startswith('; MODEL_CODE=')):
    if '=' in lines[0]:
        model_code = lines[0].split('=', 1)[1].strip()
    elif ':' in lines[0]:
        model_code = lines[0].split(':', 1)[1].strip()
else:
    model_code = generate_uuid()
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
in_executable_block = False
executable_line_count = 0
plate_name = None

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

    if line.startswith('; EXECUTABLE_BLOCK_START'):
        in_executable_block = True
        executable_line_count = 0
        continue
    if line == '; EXECUTABLE_BLOCK_END':
        in_executable_block = False
        after_exec = True
        continue
    
    # Check for plate_name within first 50 lines after EXECUTABLE_BLOCK_START
    if in_executable_block:
        executable_line_count += 1
        if executable_line_count <= 50 and plate_name is None:
            # Look for plate_name=<name> pattern
            plate_match = re.search(r';\s*plate_name\s*=\s*(.+)', line)
            if plate_match:
                plate_name = plate_match.group(1).strip()
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

model_name = plate_name if plate_name else model_code  # use plate_name if available, otherwise use unique code

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
