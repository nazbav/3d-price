const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function extractFunctionSource(fileContent, functionName, nextFunctionName) {
    const signature = `function ${functionName}(`;
    const start = fileContent.indexOf(signature);
    assert.notStrictEqual(start, -1, `Function ${functionName} not found in index.html`);

    const nextSignature = `function ${nextFunctionName}(`;
    const end = fileContent.indexOf(nextSignature, start);
    assert.notStrictEqual(end, -1, `Function ${nextFunctionName} not found after ${functionName}`);

    return fileContent.slice(start, end).trim();
}

test('shouldShowDesktopAppBanner only returns true for Windows outside Electron', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const fnSource = extractFunctionSource(indexContent, 'shouldShowDesktopAppBanner', 'ensureElectronToastHost');

    const context = {};
    vm.createContext(context);
    vm.runInContext(`${fnSource}; this.shouldShowDesktopAppBanner = shouldShowDesktopAppBanner;`, context);

    assert.equal(context.shouldShowDesktopAppBanner({ platform: 'Win32', userAgent: 'Mozilla/5.0', isElectron: false }), true);
    assert.equal(context.shouldShowDesktopAppBanner({ platform: 'MacIntel', userAgent: 'Mozilla/5.0', isElectron: false }), false);
    assert.equal(context.shouldShowDesktopAppBanner({ platform: 'Win64', userAgent: 'Mozilla/5.0', isElectron: true }), false);
    assert.equal(context.shouldShowDesktopAppBanner({ platform: '', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', isElectron: false }), true);
});
