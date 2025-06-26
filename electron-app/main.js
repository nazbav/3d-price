const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseGcode } = require('./parseGcode');
const Database = require('sqlite3').Database;

const dbPath = path.join(app.getPath('userData'), 'calc.db');
let db;

function initDb() {
  db = new Database(dbPath);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS data(key TEXT PRIMARY KEY, value TEXT)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_data_key ON data(key)`);
  });
}

function createWindow(params) {
  const win = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  const search = new URLSearchParams(params).toString();
  win.loadFile(path.join('..', 'test.html'), { search });
}

function handleArgs() {
  const args = process.argv.slice(1);
  const files = args.filter(a => a.endsWith('.gcode'));
  if (!files.length) {
    return {};
  }
  const models = files.map(f => parseGcode(fs.readFileSync(f, 'utf8')));
  const p = new URLSearchParams();
  if (models[0].printer) p.set('printer', models[0].printer);
  models.forEach(m => {
    p.append('model_status[]', m.status || 'new');
    p.append('model_name[]', m.name || m.id);
    p.append('model_id[]', m.id);
    if (m.thumbnail) p.append('model_thumbnail[]', m.thumbnail);
    if (m.time) p.append('model_time[]', m.time);
    if (m.weight) p.append('model_weight[]', m.weight);
    if (m.material) p.append('model_filament[]', m.material);
  });
  return Object.fromEntries(p.entries());
}

app.whenReady().then(() => {
  initDb();
  const params = handleArgs();
  createWindow(params);
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-data', (event, key) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM data WHERE key=?', [key], (err, row) => {
      if (err) reject(err); else resolve(row ? row.value : null);
    });
  });
});

ipcMain.handle('set-data', (event, key, value) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN IMMEDIATE TRANSACTION');
      db.run('REPLACE INTO data(key,value) VALUES(?,?)', [key, value], err => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
        } else {
          db.run('COMMIT', err2 => err2 ? reject(err2) : resolve());
        }
      });
    });
  });
});

ipcMain.handle('remove-data', (event, key) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN IMMEDIATE TRANSACTION');
      db.run('DELETE FROM data WHERE key=?', [key], err => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
        } else {
          db.run('COMMIT', err2 => err2 ? reject(err2) : resolve());
        }
      });
    });
  });
});

ipcMain.handle('get-all', () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT key, value FROM data', (err, rows) => {
      if (err) reject(err); else resolve(Object.fromEntries(rows.map(r => [r.key, r.value])));
    });
  });
});

ipcMain.handle('clear-all', () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN IMMEDIATE TRANSACTION');
      db.run('DELETE FROM data', err => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
        } else {
          db.run('COMMIT', err2 => err2 ? reject(err2) : resolve());
        }
      });
    });
  });
});

ipcMain.handle('sync-orca', () => {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', 'sync_orca.py');
    const { execFile } = require('child_process');
    const proc = execFile('python', [script]);
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', code => {
      if (code === 0) resolve(out.trim()); else reject(err.trim());
    });
  });
});
