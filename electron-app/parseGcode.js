const crypto = require('crypto');

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function parseGcode(text) {
  const lines = text.split(/\r?\n/);
  let modelId = null;
  if (lines[0] && lines[0].startsWith('; MODEL_CODE: ')) {
    modelId = lines[0].split('=')[1].trim();
  } else {
    modelId = generateId();
  }
  let inConfig = false;
  let afterExec = false;
  const result = { id: modelId };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '; EXECUTABLE_BLOCK_END') { afterExec = true; continue; }
    if (!afterExec) continue;
    if (line === '; CONFIG_BLOCK_START') { inConfig = true; continue; }
    if (line === '; CONFIG_BLOCK_END') { inConfig = false; continue; }
    if (line.startsWith('; estimated printing time') && line.includes('=')) {
      result.time = line.split('=')[1].trim();
    } else if (line.startsWith('; total filament used [g]') && line.includes('=')) {
      result.weight = line.split('=')[1].trim();
    } else if (inConfig) {
      if (line.includes('printer_settings_id') && line.includes('=')) {
        result.printer = line.split('=')[1].replace(/"/g, '').trim();
      }
      if (line.startsWith('; filament_type') && line.includes('=')) {
        result.material = line.split('=')[1].replace(/"/g, '').trim();
      }
      if (line.includes('filament_settings_id') && line.includes('=')) {
        result.material = line.split('=')[1].replace(/"/g, '').trim();
      }
    }
  }
  return result;
}

module.exports = { parseGcode };
