const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function extractFunctionSource(fileContent, functionName) {
    const signature = `function ${functionName}(`;
    const start = fileContent.indexOf(signature);
    assert.notStrictEqual(start, -1, `Function ${functionName} not found in index.html`);

    let braceIndex = fileContent.indexOf('{', start);
    assert.notStrictEqual(braceIndex, -1, `Function ${functionName} body not found`);

    let depth = 0;
    for (let i = braceIndex; i < fileContent.length; i++) {
        const char = fileContent[i];
        if (char === '{') depth++;
        if (char === '}') {
            depth--;
            if (depth === 0) {
                return fileContent.slice(start, i + 1);
            }
        }
    }

    throw new Error(`Function ${functionName} is not closed properly`);
}

test('buildModelMaterialSummaryHtml renders compact stacked material labels', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const fnSource = extractFunctionSource(indexContent, 'buildModelMaterialSummaryHtml');

    const context = {
        escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },
        safeFixed(value) {
            const num = Number(value);
            return Number.isFinite(num) ? num.toFixed(2).replace(/\.?0+$/, '') : '0';
        },
        translateUiText(value) {
            return value;
        }
    };

    vm.createContext(context);
    vm.runInContext(`${fnSource}; this.buildModelMaterialSummaryHtml = buildModelMaterialSummaryHtml;`, context);

    const html = context.buildModelMaterialSummaryHtml([
        {
            matName: 'PLA White',
            weight: 12.5,
            sourceTool: 'T0',
            materialData: { color: '#ffffff', name: 'PLA White' }
        },
        {
            matName: 'PETG Black',
            weight: 7,
            materialData: { color: '#111111', name: 'PETG Black' }
        },
        {
            matName: 'ABS Gray',
            weight: 4,
            sourceTool: 'T3',
            materialData: { color: '#888888', name: 'ABS Gray' }
        }
    ]);

    assert.match(html, /background:\s*#ffffff/i);
    assert.match(html, /background:\s*#111111/i);
    assert.match(html, /PLA White/);
    assert.match(html, /PETG Black/);
    assert.match(html, /\+1 ещё/);
    assert.doesNotMatch(html, /12\.5г/);
    assert.doesNotMatch(html, /7г/);
    assert.doesNotMatch(html, /\[T0\]/);
    assert.doesNotMatch(html, /ABS Gray/);
});
