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

test('buildModelMaterialEntryLabelHtml renders selected material color in modal label', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const fnSource = extractFunctionSource(indexContent, 'buildModelMaterialEntryLabelHtml', 'renderModelMaterialsModalRows');

    const context = {
        escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },
        translateUiText(value) {
            return value;
        },
        findMaterialById(id) {
            return id === '42'
                ? { id: '42', color: '#123456', name: 'PETG Black' }
                : null;
        }
    };

    vm.createContext(context);
    vm.runInContext(`${fnSource}; this.buildModelMaterialEntryLabelHtml = buildModelMaterialEntryLabelHtml;`, context);

    const html = context.buildModelMaterialEntryLabelHtml('42', 0);
    assert.match(html, /PETG Black/);
    assert.match(html, /background:\s*#123456/i);
    assert.doesNotMatch(html, /Материал 1/);
});
