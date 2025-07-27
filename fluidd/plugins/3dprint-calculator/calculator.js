// 3D Print Cost Calculator for Fluidd
// Data storage using localStorage
let appData = {
  printers: [],
  materials: [],
  settings: {
    operatorRate: 200,
    electricityRate: 5,
    taxPercent: 0,
    workHours: 8
  }
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
  loadData();
  renderPrinters();
  renderMaterials();
  loadSettings();
  populateDropdowns();
});

// Save data to localStorage
function saveData() {
  localStorage.setItem('fluidd_calculator_data', JSON.stringify(appData));
}

// Load data from localStorage
function loadData() {
  const saved = localStorage.getItem('fluidd_calculator_data');
  if (saved) {
    try {
      appData = { ...appData, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error loading saved data:', e);
    }
  }
}

// Generate unique IDs
function generateId() {
  return Date.now() + Math.random().toString(36).substr(2, 9);
}

// Printer Management
function addPrinter() {
  const name = document.getElementById('printerName').value.trim();
  const cost = parseFloat(document.getElementById('printerCost').value) || 0;
  const hoursToRecoup = parseFloat(document.getElementById('printerHours').value) || 1000;
  const power = parseFloat(document.getElementById('printerPower').value) || 0;
  const maintCost = parseFloat(document.getElementById('printerMaint').value) || 0;

  if (!name) {
    alert('Please enter a printer name');
    return;
  }

  const printer = {
    id: generateId(),
    name,
    cost,
    hoursToRecoup,
    power,
    maintCostHour: maintCost
  };

  appData.printers.push(printer);
  saveData();
  renderPrinters();
  populateDropdowns();
  clearPrinterForm();
}

function clearPrinterForm() {
  document.getElementById('printerName').value = '';
  document.getElementById('printerCost').value = '';
  document.getElementById('printerHours').value = '';
  document.getElementById('printerPower').value = '';
  document.getElementById('printerMaint').value = '';
}

function deletePrinter(id) {
  if (confirm('Are you sure you want to delete this printer?')) {
    appData.printers = appData.printers.filter(p => p.id !== id);
    saveData();
    renderPrinters();
    populateDropdowns();
  }
}

function renderPrinters() {
  const container = document.getElementById('printersTable');
  if (!container) return;

  if (appData.printers.length === 0) {
    container.innerHTML = '<p class="text-muted">No printers added yet.</p>';
    return;
  }

  let html = `
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Name</th>
          <th>Cost (₽)</th>
          <th>Hours to Recoup</th>
          <th>Power (W)</th>
          <th>Maintenance (₽/h)</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  appData.printers.forEach(printer => {
    html += `
      <tr>
        <td>${printer.name}</td>
        <td>${printer.cost}</td>
        <td>${printer.hoursToRecoup}</td>
        <td>${printer.power}</td>
        <td>${printer.maintCostHour}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deletePrinter('${printer.id}')">Delete</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// Material Management
function addMaterial() {
  const name = document.getElementById('materialName').value.trim();
  const costPerKg = parseFloat(document.getElementById('materialCost').value) || 0;
  const wastePercent = parseFloat(document.getElementById('materialWaste').value) || 5;
  const availableKg = parseFloat(document.getElementById('materialStock').value) || 0;

  if (!name) {
    alert('Please enter a material name');
    return;
  }

  const material = {
    id: generateId(),
    name,
    costPerKg,
    wastePercent,
    availableKg
  };

  appData.materials.push(material);
  saveData();
  renderMaterials();
  populateDropdowns();
  clearMaterialForm();
}

function clearMaterialForm() {
  document.getElementById('materialName').value = '';
  document.getElementById('materialCost').value = '';
  document.getElementById('materialWaste').value = '5';
  document.getElementById('materialStock').value = '';
}

function deleteMaterial(id) {
  if (confirm('Are you sure you want to delete this material?')) {
    appData.materials = appData.materials.filter(m => m.id !== id);
    saveData();
    renderMaterials();
    populateDropdowns();
  }
}

function renderMaterials() {
  const container = document.getElementById('materialsTable');
  if (!container) return;

  if (appData.materials.length === 0) {
    container.innerHTML = '<p class="text-muted">No materials added yet.</p>';
    return;
  }

  let html = `
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Name</th>
          <th>Cost per kg (₽)</th>
          <th>Waste (%)</th>
          <th>Stock (kg)</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  appData.materials.forEach(material => {
    html += `
      <tr>
        <td>${material.name}</td>
        <td>${material.costPerKg}</td>
        <td>${material.wastePercent}</td>
        <td>${material.availableKg}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteMaterial('${material.id}')">Delete</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// Settings Management
function saveSettings() {
  appData.settings.operatorRate = parseFloat(document.getElementById('operatorRate').value) || 200;
  appData.settings.electricityRate = parseFloat(document.getElementById('electricityRate').value) || 5;
  appData.settings.taxPercent = parseFloat(document.getElementById('taxPercent').value) || 0;
  appData.settings.workHours = parseFloat(document.getElementById('workHours').value) || 8;
  
  saveData();
  alert('Settings saved successfully!');
}

function loadSettings() {
  document.getElementById('operatorRate').value = appData.settings.operatorRate;
  document.getElementById('electricityRate').value = appData.settings.electricityRate;
  document.getElementById('taxPercent').value = appData.settings.taxPercent;
  document.getElementById('workHours').value = appData.settings.workHours;
}

// Populate dropdowns
function populateDropdowns() {
  const printerSelect = document.getElementById('calcPrinter');
  const materialSelect = document.getElementById('calcMaterial');
  
  if (printerSelect) {
    printerSelect.innerHTML = '<option value="">Select printer...</option>';
    appData.printers.forEach(printer => {
      printerSelect.innerHTML += `<option value="${printer.id}">${printer.name}</option>`;
    });
  }
  
  if (materialSelect) {
    materialSelect.innerHTML = '<option value="">Select material...</option>';
    appData.materials.forEach(material => {
      materialSelect.innerHTML += `<option value="${material.id}">${material.name}</option>`;
    });
  }
}

// Cost Calculation
function calculateCost() {
  const printerId = document.getElementById('calcPrinter').value;
  const materialId = document.getElementById('calcMaterial').value;
  const hours = parseFloat(document.getElementById('calcHours').value) || 0;
  const weight = parseFloat(document.getElementById('calcWeight').value) || 0;
  const shipping = parseFloat(document.getElementById('calcShipping').value) || 0;
  const markup = parseFloat(document.getElementById('calcMarkup').value) || 0;

  if (!printerId || !materialId || hours <= 0 || weight <= 0) {
    alert('Please fill in all required fields (printer, material, hours, weight)');
    return;
  }

  const printer = appData.printers.find(p => p.id === printerId);
  const material = appData.materials.find(m => m.id === materialId);

  if (!printer || !material) {
    alert('Selected printer or material not found');
    return;
  }

  // Calculate costs
  const calculation = performCalculation(printer, material, hours, weight, shipping, markup);
  displayResult(calculation);
}

function performCalculation(printer, material, hours, weight, shipping, markup) {
  const settings = appData.settings;
  
  // Printer amortization cost
  const costPerHourPrinter = printer.cost / printer.hoursToRecoup;
  const costPrinterPart = costPerHourPrinter * hours;
  
  // Operator cost
  const costOperatorPart = hours * settings.operatorRate;
  
  // Material cost (including waste)
  const realWeight = weight * (1 + material.wastePercent / 100);
  const costPerGram = material.costPerKg / 1000;
  const costMaterialPart = realWeight * costPerGram;
  
  // Electricity cost
  const costElectric = (printer.power / 1000) * hours * settings.electricityRate;
  
  // Maintenance cost
  const costMaintenance = printer.maintCostHour * hours;
  
  // Subtotal
  const subTotal = costPrinterPart + costOperatorPart + costMaterialPart + 
                   costElectric + costMaintenance + shipping;
  
  // Tax
  const costTax = subTotal * (settings.taxPercent / 100);
  
  // Markup
  const totalBeforeMarkup = subTotal + costTax;
  const markupAmount = totalBeforeMarkup * (markup / 100);
  
  // Final total
  const total = totalBeforeMarkup + markupAmount;

  return {
    printer: printer.name,
    material: material.name,
    hours,
    weight,
    realWeight,
    costPrinterPart,
    costOperatorPart,
    costMaterialPart,
    costElectric,
    costMaintenance,
    shipping,
    subTotal,
    costTax,
    markupAmount,
    total,
    settings
  };
}

function displayResult(calc) {
  const resultDiv = document.getElementById('calcResult');
  
  const html = `
    <div class="result-card">
      <h4>Calculation Result</h4>
      <div class="row">
        <div class="col-md-6">
          <strong>Job Details:</strong><br>
          Printer: ${calc.printer}<br>
          Material: ${calc.material}<br>
          Print Time: ${calc.hours} hours<br>
          Material Used: ${calc.realWeight.toFixed(2)}g (${calc.weight}g + ${((calc.realWeight - calc.weight)).toFixed(2)}g waste)
        </div>
        <div class="col-md-6 text-end">
          <h3 class="text-success">Total: ₽${calc.total.toFixed(2)}</h3>
        </div>
      </div>
      
      <div class="cost-breakdown">
        <h5>Cost Breakdown:</h5>
        <div class="row">
          <div class="col-md-6">
            <table class="table table-sm">
              <tr><td>Printer Amortization:</td><td>₽${calc.costPrinterPart.toFixed(2)}</td></tr>
              <tr><td>Operator Cost:</td><td>₽${calc.costOperatorPart.toFixed(2)}</td></tr>
              <tr><td>Material Cost:</td><td>₽${calc.costMaterialPart.toFixed(2)}</td></tr>
            </table>
          </div>
          <div class="col-md-6">
            <table class="table table-sm">
              <tr><td>Electricity:</td><td>₽${calc.costElectric.toFixed(2)}</td></tr>
              <tr><td>Maintenance:</td><td>₽${calc.costMaintenance.toFixed(2)}</td></tr>
              <tr><td>Shipping:</td><td>₽${calc.shipping.toFixed(2)}</td></tr>
              ${calc.costTax > 0 ? `<tr><td>Tax (${calc.settings.taxPercent}%):</td><td>₽${calc.costTax.toFixed(2)}</td></tr>` : ''}
              ${calc.markupAmount > 0 ? `<tr><td>Markup:</td><td>₽${calc.markupAmount.toFixed(2)}</td></tr>` : ''}
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
  
  resultDiv.innerHTML = html;
  resultDiv.style.display = 'block';
}

function clearCalculation() {
  document.getElementById('calcName').value = '';
  document.getElementById('calcClientName').value = '';
  document.getElementById('calcPrinter').value = '';
  document.getElementById('calcMaterial').value = '';
  document.getElementById('calcHours').value = '';
  document.getElementById('calcWeight').value = '';
  document.getElementById('calcShipping').value = '0';
  document.getElementById('calcMarkup').value = '0';
  
  const resultDiv = document.getElementById('calcResult');
  resultDiv.style.display = 'none';
}