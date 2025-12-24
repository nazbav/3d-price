const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function normalizeName(value) {
  return String(Array.isArray(value) ? value[0] : value || '').trim().toLowerCase();
}

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

async function readTextSafe(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function collectEntries(dirPath, handler) {
  const entries = [];
  if (!dirPath || !fs.existsSync(dirPath)) return entries;
  const list = await fsp.readdir(dirPath, { withFileTypes: true });
  for (const entry of list) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.json')) continue;
    const full = path.join(dirPath, entry.name);
    const json = await readJsonSafe(full);
    if (!json) continue;
    const infoPath = full.replace(/\.json$/i, '.info');
    const info = await readTextSafe(infoPath);
    const prepared = handler({
      filePath: full,
      fileName: entry.name,
      json,
      info
    });
    if (prepared) entries.push(prepared);
  }
  return entries;
}

function buildFilamentEntry({ filePath, fileName, json, info }) {
  const displayName = json.filament_settings_id || json.name || path.basename(fileName, '.json');
  const matchKey = normalizeName(displayName) || normalizeName(fileName);
  const key = `filament:${sha1Hex(filePath)}`;
  return {
    type: 'filament',
    key,
    matchKey,
    displayName,
    fileName,
    path: filePath,
    config: json,
    infoText: info
  };
}

function buildMachineEntry({ filePath, fileName, json, info }) {
  const name = json.printer_settings_id || json.name || path.basename(fileName, '.json');
  const hostKey = normalizeName(json.print_host || json.inherits || '');
  const matchKey = `${hostKey}::${normalizeName(name)}`;
  const key = `machine:${sha1Hex(filePath)}`;
  return {
    type: 'machine',
    key,
    matchKey,
    displayName: name,
    hostLabel: hostKey ? (json.print_host || json.inherits || '') : '',
    fileName,
    path: filePath,
    config: json,
    infoText: info
  };
}

async function scanOrcaProfiles(basePath) {
  if (!basePath) {
    return { basePath: '', exists: false, filaments: [], machines: [] };
  }
  const exists = fs.existsSync(basePath);
  const filamentDir = path.join(basePath, 'filament');
  const machineDir = path.join(basePath, 'machine');
  const filaments = await collectEntries(filamentDir, buildFilamentEntry);
  const machines = await collectEntries(machineDir, buildMachineEntry);
  return {
    basePath,
    exists,
    filaments,
    machines
  };
}

function registerMatchKey(map, rawKey, entry) {
  if (!map || typeof map.set !== 'function') return;
  if (typeof rawKey !== 'string' || !rawKey.trim()) return;
  const normalized = normalizeName(rawKey);
  if (!normalized) return;
  if (!map.has(normalized)) map.set(normalized, entry);
}

function resolveFilamentSelection(profile, matchMap) {
  if (!profile) return null;
  if (profile?.orcaMeta?.key) return profile.orcaMeta.key;
  const cfg = profile.config || {};
  const hints = [
    profile?.orcaMeta?.matchKey,
    cfg.filament_settings_id,
    cfg.name,
    profile?.name
  ];
  for (const hint of hints) {
    if (!hint) continue;
    const entry = matchMap.get(normalizeName(hint));
    if (entry) return entry.key;
  }
  return null;
}

function resolveMachineSelection(profile, matchMap, nameMap) {
  if (!profile) return null;
  if (profile?.orcaMeta?.key) return profile.orcaMeta.key;
  const cfg = profile.config || {};
  const host = normalizeName(cfg.print_host || cfg.inherits || profile?.orcaMeta?.hostLabel || '');
  const printerName = normalizeName(cfg.printer_settings_id || cfg.name || '');
  const hints = [];
  if (profile?.orcaMeta?.matchKey) hints.push(profile.orcaMeta.matchKey);
  if (printerName) {
    hints.push(host ? `${host}::${printerName}` : printerName);
  }
  for (const hint of hints) {
    if (!hint) continue;
    const key = normalizeName(hint);
    const entry = matchMap.get(key);
    if (entry) return entry.key;
    if (!key.includes('::')) {
      const fallback = nameMap.get(key);
      if (fallback) return fallback.key;
    }
  }
  return null;
}

function extractProfileName(profile) {
  const cfg = profile?.config || {};
  return cfg.filament_settings_id || cfg.name || cfg.printer_settings_id || cfg.id || profile?.id || '';
}

function profileDisplay(profile) {
  const name = extractProfileName(profile);
  return name ? String(name) : String(profile?.id || '');
}

function buildPreview(calcData, orcaData) {
  const materials = Array.isArray(calcData.materials) ? calcData.materials : [];
  const materialProfiles = Array.isArray(calcData.materialProfiles) ? calcData.materialProfiles : [];
  const printers = Array.isArray(calcData.printers) ? calcData.printers : [];
  const printerProfiles = Array.isArray(calcData.printerProfiles) ? calcData.printerProfiles : [];

  const mpById = new Map(materialProfiles.map(p => [String(p.id), p]));
  const ppById = new Map(printerProfiles.map(p => [String(p.id), p]));

  const filamentsByMatch = new Map();
  for (const f of orcaData.filaments) {
    registerMatchKey(filamentsByMatch, f.matchKey, f);
    registerMatchKey(filamentsByMatch, f.displayName, f);
    if (typeof f.fileName === 'string') {
      registerMatchKey(filamentsByMatch, f.fileName.replace(/\.json$/i, ''), f);
    }
  }
  const machinesByMatch = new Map();
  const machinesByName = new Map();
  for (const m of orcaData.machines) {
    registerMatchKey(machinesByMatch, m.matchKey, m);
    if (m.hostLabel) {
      registerMatchKey(machinesByMatch, `${normalizeName(m.hostLabel)}::${normalizeName(m.displayName)}`, m);
    }
    const [, nameOnly] = m.matchKey.split('::');
    registerMatchKey(machinesByName, nameOnly, m);
    registerMatchKey(machinesByName, m.displayName, m);
  }

  const materialPreview = materials.map(mat => {
    const pidList = Array.isArray(mat.profileIds) ? mat.profileIds : [];
    const currentProfiles = [];
    const selections = [];
    let status = 'none';
    for (const pid of pidList) {
      const pf = mpById.get(String(pid));
      if (!pf) continue;
      currentProfiles.push(profileDisplay(pf));
      const resolved = resolveFilamentSelection(pf, filamentsByMatch);
      if (resolved && !selections.includes(resolved)) {
        selections.push(resolved);
        status = 'linked';
      }
    }
    if (!selections.length) {
      const candidate = filamentsByMatch.get(normalizeName(mat.name));
      if (candidate) {
        selections.push(candidate.key);
        status = 'suggested';
      }
    }
    return {
      materialId: mat.id,
      name: mat.name || '(без названия)',
      currentProfiles,
      selections,
      status
    };
  });

  const printerPreview = printers.map(pr => {
    const pidList = Array.isArray(pr.profileIds) ? pr.profileIds : [];
    const currentProfiles = [];
    const selections = [];
    let status = 'none';
    for (const pid of pidList) {
      const pf = ppById.get(String(pid));
      if (!pf) continue;
      currentProfiles.push(profileDisplay(pf));
      const resolved = resolveMachineSelection(pf, machinesByMatch, machinesByName);
      if (resolved && !selections.includes(resolved)) {
        selections.push(resolved);
        status = 'linked';
      }
    }
    if (!selections.length) {
      const candidate = machinesByName.get(normalizeName(pr.name));
      if (candidate) {
        selections.push(candidate.key);
        status = 'suggested';
      }
    }
    return {
      printerId: pr.id,
      name: pr.name || '(без названия)',
      currentProfiles,
      selections,
      status
    };
  });

  const filamentOptions = orcaData.filaments.map(f => ({
    key: f.key,
    label: f.displayName,
    fileName: f.fileName,
    hostLabel: ''
  }));
  const machineOptions = orcaData.machines.map(m => ({
    key: m.key,
    label: m.displayName,
    fileName: m.fileName,
    hostLabel: m.hostLabel || ''
  }));

  return {
    materials: materialPreview,
    printers: printerPreview,
    filamentOptions,
    machineOptions
  };
}

function findOrCreateProfile(collection, predicate, factory) {
  let item = collection.find(predicate);
  if (item) return item;
  item = factory();
  collection.push(item);
  return item;
}

function applyAssignments(calcData, assignments, orcaData) {
  const result = {
    updatedMaterials: 0,
    updatedPrinters: 0,
    createdProfiles: 0
  };
  const materials = Array.isArray(calcData.materials) ? calcData.materials : [];
  const printers = Array.isArray(calcData.printers) ? calcData.printers : [];
  const materialProfiles = Array.isArray(calcData.materialProfiles) ? calcData.materialProfiles : (calcData.materialProfiles = []);
  const printerProfiles = Array.isArray(calcData.printerProfiles) ? calcData.printerProfiles : (calcData.printerProfiles = []);
  const mpById = new Map(materialProfiles.map(p => [String(p.id), p]));
  const ppById = new Map(printerProfiles.map(p => [String(p.id), p]));

  const materialsById = new Map(materials.map(m => [String(m.id), m]));
  const printersById = new Map(printers.map(p => [String(p.id), p]));

  const filamentsByKey = new Map(orcaData.filaments.map(f => [f.key, f]));
  const machinesByKey = new Map(orcaData.machines.map(m => [m.key, m]));

  const MatSelections = Array.isArray(assignments.materials) ? assignments.materials : [];
  for (const sel of MatSelections) {
    const material = materialsById.get(String(sel.materialId));
    if (!material) continue;
    const selectedKeys = Array.isArray(sel.selectedKeys) ? sel.selectedKeys.filter(Boolean) : [];
    const newProfileIds = [];
    for (const selectionKey of selectedKeys) {
      const filament = filamentsByKey.get(selectionKey);
      if (!filament) continue;
      const profile = findOrCreateProfile(
        materialProfiles,
        (p) => p?.orcaMeta?.key === filament.key,
        () => {
          result.createdProfiles++;
          const created = {
            id: genId(),
            config: filament.config,
            info: filament.infoText,
            orcaMeta: {
              type: 'filament',
              key: filament.key,
              matchKey: filament.matchKey,
              fileName: filament.fileName,
              path: filament.path,
              importedAt: new Date().toISOString()
            }
          };
          mpById.set(String(created.id), created);
          return created;
        }
      );
      profile.config = filament.config;
      profile.info = filament.infoText;
      profile.orcaMeta = {
        type: 'filament',
        key: filament.key,
        matchKey: filament.matchKey,
        fileName: filament.fileName,
        path: filament.path,
        updatedAt: new Date().toISOString()
      };
      newProfileIds.push(profile.id);
    }
    if (!Array.isArray(material.profileIds)) material.profileIds = [];
    const before = material.profileIds.slice().map(String);
    const preserved = material.profileIds
      .map((pid) => String(pid))
      .filter((pid) => {
        const existing = mpById.get(pid);
        return !existing || existing?.orcaMeta?.type !== 'filament';
      });
    const merged = [...preserved];
    newProfileIds.forEach((pid) => {
      if (!merged.includes(pid)) merged.push(pid);
    });
    material.profileIds = merged;
    if (before.join(',') !== material.profileIds.join(',')) {
      result.updatedMaterials++;
    }
  }

  const printerSelections = Array.isArray(assignments.printers) ? assignments.printers : [];
  for (const sel of printerSelections) {
    const printer = printersById.get(String(sel.printerId));
    if (!printer) continue;
    const selectedKeys = Array.isArray(sel.selectedKeys) ? sel.selectedKeys.filter(Boolean) : [];
    const newProfileIds = [];
    for (const selectionKey of selectedKeys) {
      const machine = machinesByKey.get(selectionKey);
      if (!machine) continue;
      const profile = findOrCreateProfile(
        printerProfiles,
        (p) => p?.orcaMeta?.key === machine.key,
        () => {
          result.createdProfiles++;
          const created = {
            id: genId(),
            config: machine.config,
            info: machine.infoText,
            orcaMeta: {
              type: 'machine',
              key: machine.key,
              matchKey: machine.matchKey,
              fileName: machine.fileName,
              path: machine.path,
              importedAt: new Date().toISOString()
            }
          };
          ppById.set(String(created.id), created);
          return created;
        }
      );
      profile.config = machine.config;
      profile.info = machine.infoText;
      profile.orcaMeta = {
        type: 'machine',
        key: machine.key,
        matchKey: machine.matchKey,
        fileName: machine.fileName,
        path: machine.path,
        updatedAt: new Date().toISOString()
      };
      newProfileIds.push(profile.id);
      profile.printerId = printer.id;
    }
    if (!Array.isArray(printer.profileIds)) printer.profileIds = [];
    const before = printer.profileIds.slice().map(String);
    const preserved = printer.profileIds
      .map((pid) => String(pid))
      .filter((pid) => {
        const existing = ppById.get(pid);
        return !existing || existing?.orcaMeta?.type !== 'machine';
      });
    const merged = [...preserved];
    newProfileIds.forEach((pid) => {
      if (!merged.includes(pid)) merged.push(pid);
    });
    printer.profileIds = merged;
    if (before.join(',') !== printer.profileIds.join(',')) {
      result.updatedPrinters++;
    }
  }

  return { updatedData: calcData, summary: result };
}

module.exports = {
  scanOrcaProfiles,
  buildPreview,
  applyAssignments
};
