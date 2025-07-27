/**
 * 3D Print Cost Calculator - Fluid Plugin
 * Comprehensive cost calculation for 3D printing with material tracking,
 * printer management, and order history.
 */

// Global application data
let appData = {
  printers: [],
  materials: [],
  materialProfiles: [],
  printerProfiles: [],
  additionalGlobal: [],
  clients: [],
  calcHistory: [],
  counters: {},
  calcSettings: {
    operatorRate: 100,
    workHoursDay: 8,
    costKwh: 6,
    taxPercent: 0,
    printLabels: false,
    labelCost: 0,
    companyName: '',
    chatLink: '',
    bankDetails: ''
  }
};

// Theme management
const THEME_STORAGE_KEY = "themePreference";

function setTheme(theme) {
  document.documentElement.setAttribute("data-bs-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.innerText = theme === "dark" ? "☀️ Light Theme" : "🌙 Dark Theme";
  }
}

// Utility functions
function getNextId(type) {
  if (!appData.counters) appData.counters = {};
  if (!appData.counters[type]) appData.counters[type] = 0;
  return ++appData.counters[type];
}

function safeFixed(num, digits = 2) {
  if (isNaN(num) || num === null || num === undefined) return '0.00';
  return parseFloat(num).toFixed(digits);
}

function formatCurrency(amount) {
  return `${safeFixed(amount)} ₽`;
}

function formatNumber(num, digits = 2) {
  return safeFixed(num, digits);
}

// Data persistence
function saveToLocalStorage() {
  try {
    localStorage.setItem('3d-calc-data', JSON.stringify(appData));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

function loadFromLocalStorage() {
  try {
    const stored = localStorage.getItem('3d-calc-data');
    if (stored) {
      const parsed = JSON.parse(stored);
      appData = { ...appData, ...parsed };
      migrateOldData(appData);
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
  }
}

// Data migration for backward compatibility
function migrateOldData(obj) {
  if (!Array.isArray(obj.printers)) obj.printers = [];
  if (!Array.isArray(obj.materials)) obj.materials = [];
  if (!Array.isArray(obj.additionalGlobal)) obj.additionalGlobal = [];
  if (!Array.isArray(obj.clients)) obj.clients = [];
  if (!Array.isArray(obj.calcHistory)) obj.calcHistory = [];
  if (!Array.isArray(obj.materialProfiles)) obj.materialProfiles = [];
  if (!Array.isArray(obj.printerProfiles)) obj.printerProfiles = [];

  if (!obj.counters) {
    obj.counters = {
      printers: obj.printers.length,
      clients: obj.clients.length,
      materials: obj.materials.length,
      additionalGlobal: obj.additionalGlobal.length,
      materialProfiles: obj.materialProfiles.length,
      printerProfiles: obj.printerProfiles.length
    };
  }

  // Ensure all entities have proper structure
  obj.materials.forEach(m => {
    if (!m.printers) m.printers = [];
    if (!m.profileIds) m.profileIds = [];
  });

  obj.printers.forEach(p => {
    if (!p.profileIds) p.profileIds = [];
  });

  obj.additionalGlobal.forEach(a => {
    if (!a.printers) a.printers = [];
  });

  return obj;
}

// Printer management
function onAddPrinter() {
  showPrinterModal();
}

function showPrinterModal(printerId = null) {
  const modal = new bootstrap.Modal(document.getElementById('printerModal'));
  const isEdit = printerId !== null;
  
  // Set modal title and populate fields if editing
  document.querySelector('#printerModal .modal-title').textContent = isEdit ? 'Edit Printer' : 'Add Printer';
  
  if (isEdit) {
    const printer = appData.printers.find(p => p.id === printerId);
    if (printer) {
      document.getElementById('printerNameInput').value = printer.name || '';
      document.getElementById('printerCostInput').value = printer.cost || '';
      document.getElementById('printerHoursInput').value = printer.hoursToRecoup || '';
      document.getElementById('printerPowerInput').value = printer.power || '';
      document.getElementById('printerMaintInput').value = printer.maintCostHour || '';
    }
  } else {
    // Clear fields for new printer
    document.getElementById('printerNameInput').value = '';
    document.getElementById('printerCostInput').value = '';
    document.getElementById('printerHoursInput').value = '';
    document.getElementById('printerPowerInput').value = '';
    document.getElementById('printerMaintInput').value = '';
  }
  
  // Set up save handler
  document.getElementById('savePrinterBtn').onclick = () => savePrinterFromModal(printerId);
  
  modal.show();
}

function savePrinterFromModal(printerId = null) {
  const name = document.getElementById('printerNameInput').value.trim();
  const cost = parseFloat(document.getElementById('printerCostInput').value) || 0;
  const hoursToRecoup = parseFloat(document.getElementById('printerHoursInput').value) || 0;
  const power = parseFloat(document.getElementById('printerPowerInput').value) || 0;
  const maintCostHour = parseFloat(document.getElementById('printerMaintInput').value) || 0;

  if (!name) {
    alert('Please enter printer name');
    return;
  }

  const printerData = {
    name,
    cost,
    hoursToRecoup,
    power,
    maintCostHour,
    profileIds: []
  };

  if (printerId) {
    // Edit existing printer
    const printer = appData.printers.find(p => p.id === printerId);
    if (printer) {
      Object.assign(printer, printerData);
    }
  } else {
    // Add new printer
    printerData.id = getNextId('printers');
    appData.printers.push(printerData);
  }

  saveToLocalStorage();
  renderPrintersTable();
  
  const modal = bootstrap.Modal.getInstance(document.getElementById('printerModal'));
  modal.hide();
}

function renderPrintersTable() {
  const tbody = document.querySelector('#printersTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  appData.printers.forEach(printer => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" class="form-check-input printer-checkbox" value="${printer.id}"></td>
      <td>${printer.name || ''}</td>
      <td>${formatCurrency(printer.cost || 0)}</td>
      <td>${printer.hoursToRecoup || 0}</td>
      <td>${printer.power || 0}</td>
      <td>${formatCurrency(printer.maintCostHour || 0)}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="showPrinterModal(${printer.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deletePrinter(${printer.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function deletePrinter(printerId) {
  if (confirm('Are you sure you want to delete this printer?')) {
    appData.printers = appData.printers.filter(p => p.id !== printerId);
    saveToLocalStorage();
    renderPrintersTable();
  }
}

// Material management
function onAddGlobalMaterial() {
  showMaterialModal();
}

function showMaterialModal(materialId = null) {
  const modal = new bootstrap.Modal(document.getElementById('materialModal'));
  const isEdit = materialId !== null;
  
  document.querySelector('#materialModal .modal-title').textContent = isEdit ? 'Edit Material' : 'Add Material';
  
  if (isEdit) {
    const material = appData.materials.find(m => m.id === materialId);
    if (material) {
      document.getElementById('matMaterialTypeInput').value = material.materialType || '';
      document.getElementById('matNameInput').value = material.name || '';
      document.getElementById('matCostInput').value = material.costPerKg || '';
      document.getElementById('matBalanceInput').value = material.balance || '';
      document.getElementById('matDeclaredInput').value = material.declaredWeight || '';
      document.getElementById('matColorInput').value = material.color || '#ffffff';
      document.getElementById('matManufInput').value = material.manufacturer || '';
      document.getElementById('matProdDateInput').value = material.productionDate || '';
    }
  } else {
    document.getElementById('matMaterialTypeInput').value = '';
    document.getElementById('matNameInput').value = '';
    document.getElementById('matCostInput').value = '';
    document.getElementById('matBalanceInput').value = '';
    document.getElementById('matDeclaredInput').value = '';
    document.getElementById('matColorInput').value = '#ffffff';
    document.getElementById('matManufInput').value = '';
    document.getElementById('matProdDateInput').value = '';
  }
  
  // Populate printers select
  const printersSelect = document.getElementById('matPrintersSelect');
  if (printersSelect) {
    printersSelect.innerHTML = '';
    appData.printers.forEach(printer => {
      const option = document.createElement('option');
      option.value = printer.id;
      option.textContent = printer.name;
      if (isEdit) {
        const material = appData.materials.find(m => m.id === materialId);
        if (material && material.printers && material.printers.includes(String(printer.id))) {
          option.selected = true;
        }
      }
      printersSelect.appendChild(option);
    });
  }
  
  document.getElementById('saveMaterialBtn').onclick = () => saveMaterialFromModal(materialId);
  modal.show();
}

function saveMaterialFromModal(materialId = null) {
  const materialType = document.getElementById('matMaterialTypeInput').value.trim();
  const name = document.getElementById('matNameInput').value.trim();
  const costPerKg = parseFloat(document.getElementById('matCostInput').value) || 0;
  const balance = parseFloat(document.getElementById('matBalanceInput').value) || 0;
  const declaredWeight = parseFloat(document.getElementById('matDeclaredInput').value) || 0;
  const color = document.getElementById('matColorInput').value;
  const manufacturer = document.getElementById('matManufInput').value.trim();
  const productionDate = document.getElementById('matProdDateInput').value.trim();
  
  const printersSelect = document.getElementById('matPrintersSelect');
  const selectedPrinters = Array.from(printersSelect.selectedOptions).map(opt => opt.value);

  if (!name) {
    alert('Please enter material name');
    return;
  }

  const materialData = {
    materialType,
    name,
    costPerKg,
    balance,
    declaredWeight,
    color,
    manufacturer,
    productionDate,
    printers: selectedPrinters,
    profileIds: []
  };

  if (materialId) {
    const material = appData.materials.find(m => m.id === materialId);
    if (material) {
      Object.assign(material, materialData);
    }
  } else {
    materialData.id = getNextId('materials');
    appData.materials.push(materialData);
  }

  saveToLocalStorage();
  renderGlobalMaterialsTable();
  
  const modal = bootstrap.Modal.getInstance(document.getElementById('materialModal'));
  modal.hide();
}

function renderGlobalMaterialsTable() {
  const tbody = document.querySelector('#materialsTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  appData.materials.forEach(material => {
    const printerNames = (material.printers || [])
      .map(pid => {
        const printer = appData.printers.find(p => String(p.id) === String(pid));
        return printer ? printer.name : pid;
      })
      .join(', ');
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" class="form-check-input material-checkbox" value="${material.id}"></td>
      <td>${material.name || ''}</td>
      <td>${material.materialType || ''}</td>
      <td>${formatCurrency(material.costPerKg || 0)}</td>
      <td>${formatNumber((material.balance || 0) * 1000, 0)} g</td>
      <td>${formatNumber(material.declaredWeight || 0, 2)} kg</td>
      <td>${material.manufacturer || ''}</td>
      <td>${material.productionDate || ''}</td>
      <td><small>${printerNames}</small></td>
      <td><small>${(material.profileIds || []).length} profiles</small></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="showMaterialModal(${material.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteMaterial(${material.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function deleteMaterial(materialId) {
  if (confirm('Are you sure you want to delete this material?')) {
    appData.materials = appData.materials.filter(m => m.id !== materialId);
    saveToLocalStorage();
    renderGlobalMaterialsTable();
  }
}

// Additional costs management
function onAddGlobalAdditional() {
  const description = prompt('Enter cost description:');
  if (!description) return;
  
  const cost = parseFloat(prompt('Enter cost amount (₽):')) || 0;
  const hoursToRecoup = parseFloat(prompt('Enter hours to recoup:')) || 0;
  
  const additionalData = {
    id: getNextId('additionalGlobal'),
    description,
    cost,
    hoursToRecoup,
    includeInCalc: true,
    printers: []
  };
  
  appData.additionalGlobal.push(additionalData);
  saveToLocalStorage();
  renderAdditionalGlobalTable();
}

function renderAdditionalGlobalTable() {
  const tbody = document.querySelector('#additionalGlobalTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  appData.additionalGlobal.forEach(additional => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" class="form-check-input additional-checkbox" value="${additional.id}"></td>
      <td>${additional.description || ''}</td>
      <td>${formatCurrency(additional.cost || 0)}</td>
      <td>${additional.hoursToRecoup || 0}</td>
      <td>${additional.includeInCalc ? 'Yes' : 'No'}</td>
      <td><small>${(additional.printers || []).length} printers</small></td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteAdditional(${additional.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function deleteAdditional(additionalId) {
  if (confirm('Are you sure you want to delete this additional cost?')) {
    appData.additionalGlobal = appData.additionalGlobal.filter(a => a.id !== additionalId);
    saveToLocalStorage();
    renderAdditionalGlobalTable();
  }
}

// Client management
function onAddClient() {
  const name = prompt('Enter client name:');
  if (!name) return;
  
  const phone = prompt('Enter client phone (optional):') || '';
  const links = prompt('Enter client links (optional):') || '';
  
  const clientData = {
    id: getNextId('clients'),
    name,
    phone,
    links
  };
  
  appData.clients.push(clientData);
  saveToLocalStorage();
  renderClientsTable();
  updateClientsDatalist();
}

function renderClientsTable() {
  const tbody = document.querySelector('#clientsTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  appData.clients.forEach(client => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${client.name || ''}</td>
      <td>${client.phone || ''}</td>
      <td><small>${client.links || ''}</small></td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteClient(${client.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function deleteClient(clientId) {
  if (confirm('Are you sure you want to delete this client?')) {
    appData.clients = appData.clients.filter(c => c.id !== clientId);
    saveToLocalStorage();
    renderClientsTable();
    updateClientsDatalist();
  }
}

function updateClientsDatalist() {
  const datalist = document.getElementById('clientsList');
  if (!datalist) return;
  
  datalist.innerHTML = '';
  appData.clients.forEach(client => {
    const option = document.createElement('option');
    option.value = client.name;
    datalist.appendChild(option);
  });
}

function quickAddClient() {
  onAddClient();
}

// Calculator functionality
function startNewCalculation() {
  document.getElementById('calcName').value = '';
  document.getElementById('calcClientName').value = '';
  document.getElementById('calcOrderStatus').value = 'new';
  document.getElementById('calcOrderId').value = '';
  document.getElementById('calcShipping').value = '';
  document.getElementById('calcStartDate').value = '';
  document.getElementById('calcParallelPrinting').value = 'no';
  document.getElementById('calcMarkupPercent').value = '';
  document.getElementById('calcDiscountPercent').value = '';
  
  // Clear printer containers
  const container = document.getElementById('calcPrintersContainer');
  if (container) {
    container.innerHTML = '';
  }
  
  // Hide result
  const result = document.getElementById('calcResult');
  if (result) {
    result.style.display = 'none';
  }
  
  renderCalculatorPrinters();
}

function renderCalculatorPrinters() {
  const container = document.getElementById('calcPrintersContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  appData.printers.forEach(printer => {
    const printerDiv = document.createElement('div');
    printerDiv.className = 'card mb-3';
    printerDiv.innerHTML = `
      <div class="card-header">
        <h5>${printer.name}</h5>
      </div>
      <div class="card-body">
        <p>Cost: ${formatCurrency(printer.cost || 0)} | Power: ${printer.power || 0}W | Maintenance: ${formatCurrency(printer.maintCostHour || 0)}/h</p>
        <div class="table-responsive">
          <table class="table table-sm" id="calcModelsTable_${printer.id}">
            <thead>
              <tr>
                <th>Model</th>
                <th>Material</th>
                <th>Weight (g)</th>
                <th>Time (h)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <button class="btn btn-sm btn-primary" onclick="addModelRow(${printer.id})">Add Model</button>
      </div>
    `;
    container.appendChild(printerDiv);
  });
}

function addModelRow(printerId, modelData = null) {
  const tbody = document.querySelector(`#calcModelsTable_${printerId} tbody`);
  if (!tbody) return;
  
  const modelId = modelData ? modelData.id : getNextId('models');
  
  const row = document.createElement('tr');
  row.dataset.modelId = modelId;
  
  // Create material select options
  let materialOptions = '<option value="">Select material</option>';
  appData.materials.forEach(material => {
    if (!material.printers || material.printers.length === 0 || material.printers.includes(String(printerId))) {
      const selected = modelData && modelData.materialId === material.id ? 'selected' : '';
      materialOptions += `<option value="${material.id}" ${selected}>${material.name}</option>`;
    }
  });
  
  row.innerHTML = `
    <td><input type="text" class="form-control form-control-sm" value="${modelData ? modelData.name || '' : ''}" placeholder="Model name"></td>
    <td><select class="form-select form-select-sm">${materialOptions}</select></td>
    <td><input type="number" class="form-control form-control-sm" value="${modelData ? modelData.weight || '' : ''}" placeholder="0" min="0" step="0.1"></td>
    <td><input type="number" class="form-control form-control-sm" value="${modelData ? modelData.hours || '' : ''}" placeholder="0" min="0" step="0.1"></td>
    <td><button class="btn btn-sm btn-danger" onclick="removeModelRow(this)">Remove</button></td>
  `;
  
  tbody.appendChild(row);
}

function removeModelRow(button) {
  const row = button.closest('tr');
  if (row) {
    row.remove();
  }
}

function onCalculateAll() {
  // Collect all model data
  const calculationData = {
    name: document.getElementById('calcName').value.trim(),
    clientName: document.getElementById('calcClientName').value.trim(),
    orderStatus: document.getElementById('calcOrderStatus').value,
    shipping: parseFloat(document.getElementById('calcShipping').value) || 0,
    startDate: document.getElementById('calcStartDate').value,
    parallelPrinting: document.getElementById('calcParallelPrinting').value === 'yes',
    markupPercent: parseFloat(document.getElementById('calcMarkupPercent').value) || 0,
    discountPercent: parseFloat(document.getElementById('calcDiscountPercent').value) || 0,
    printers: {}
  };
  
  let totalCost = 0;
  let totalTime = 0;
  let hasModels = false;
  
  // Process each printer
  appData.printers.forEach(printer => {
    const tbody = document.querySelector(`#calcModelsTable_${printer.id} tbody`);
    if (!tbody) return;
    
    const models = [];
    const rows = tbody.querySelectorAll('tr');
    
    rows.forEach(row => {
      const nameInput = row.querySelector('input[type="text"]');
      const materialSelect = row.querySelector('select');
      const weightInput = row.querySelector('input[placeholder="0"]:nth-of-type(1)');
      const timeInput = row.querySelector('input[placeholder="0"]:nth-of-type(2)');
      
      const name = nameInput ? nameInput.value.trim() : '';
      const materialId = materialSelect ? materialSelect.value : '';
      const weight = weightInput ? parseFloat(weightInput.value) || 0 : 0;
      const time = timeInput ? parseFloat(timeInput.value) || 0 : 0;
      
      if (name && materialId && weight > 0 && time > 0) {
        const material = appData.materials.find(m => String(m.id) === String(materialId));
        if (material) {
          const materialCost = (weight / 1000) * (material.costPerKg || 0);
          const printerCost = (printer.cost || 0) / (printer.hoursToRecoup || 1) * time;
          const operatorCost = (appData.calcSettings.operatorRate || 0) * time;
          const powerCost = ((printer.power || 0) / 1000) * time * (appData.calcSettings.costKwh || 0);
          const maintCost = (printer.maintCostHour || 0) * time;
          
          const modelTotal = materialCost + printerCost + operatorCost + powerCost + maintCost;
          
          models.push({
            name,
            materialId,
            materialName: material.name,
            weight,
            time,
            cost: modelTotal
          });
          
          totalCost += modelTotal;
          totalTime = Math.max(totalTime, time); // For parallel printing
          hasModels = true;
        }
      }
    });
    
    if (models.length > 0) {
      calculationData.printers[printer.id] = {
        printerName: printer.name,
        models
      };
    }
  });
  
  if (!hasModels) {
    alert('Please add at least one model to calculate');
    return;
  }
  
  // Add shipping cost
  totalCost += calculationData.shipping;
  
  // Apply tax
  const taxAmount = totalCost * (appData.calcSettings.taxPercent || 0) / 100;
  totalCost += taxAmount;
  
  // Apply markup and discount
  const markupAmount = totalCost * calculationData.markupPercent / 100;
  const discountAmount = totalCost * calculationData.discountPercent / 100;
  totalCost = totalCost + markupAmount - discountAmount;
  
  // Generate order ID
  const orderId = Date.now().toString().slice(-8);
  document.getElementById('calcOrderId').value = orderId;
  
  // Show result
  const resultDiv = document.getElementById('calcResult');
  if (resultDiv) {
    resultDiv.innerHTML = `
      <h4>Calculation Result</h4>
      <p><strong>Total Cost:</strong> ${formatCurrency(totalCost)}</p>
      <p><strong>Total Time:</strong> ${formatNumber(totalTime, 1)} hours</p>
      <p><strong>Tax Amount:</strong> ${formatCurrency(taxAmount)}</p>
      ${calculationData.markupPercent > 0 ? `<p><strong>Markup:</strong> ${formatCurrency(markupAmount)} (${calculationData.markupPercent}%)</p>` : ''}
      ${calculationData.discountPercent > 0 ? `<p><strong>Discount:</strong> -${formatCurrency(discountAmount)} (${calculationData.discountPercent}%)</p>` : ''}
      <p><strong>Order ID:</strong> ${orderId}</p>
    `;
    resultDiv.style.display = 'block';
  }
  
  // Save to history
  const historyEntry = {
    id: getNextId('calcHistory'),
    timestamp: Date.now(),
    dateStr: new Date().toLocaleDateString(),
    orderId,
    calcName: calculationData.name || 'Unnamed Calculation',
    clientName: calculationData.clientName,
    orderStatus: calculationData.orderStatus,
    total: totalCost,
    totalTime,
    taxAmount,
    markupPercent: calculationData.markupPercent,
    discountPercent: calculationData.discountPercent,
    shipping: calculationData.shipping,
    details: calculationData.printers
  };
  
  appData.calcHistory.push(historyEntry);
  saveToLocalStorage();
  renderHistoryTable();
}

// History management
function renderHistoryTable() {
  const tbody = document.querySelector('#historyTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  const sortedHistory = [...appData.calcHistory].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  
  sortedHistory.forEach(entry => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(entry.timestamp || 0).toLocaleString()}</td>
      <td>${entry.orderId || ''}</td>
      <td>${entry.calcName || ''}</td>
      <td>${entry.clientName || ''}</td>
      <td><span class="badge bg-secondary">${entry.orderStatus || 'new'}</span></td>
      <td>${formatCurrency(entry.total || 0)}</td>
      <td><button class="btn btn-sm btn-info">Receipt</button></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewHistoryDetails(${entry.id})">View</button>
        <button class="btn btn-sm btn-danger" onclick="deleteHistoryEntry(${entry.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function viewHistoryDetails(entryId) {
  const entry = appData.calcHistory.find(h => h.id === entryId);
  if (!entry) return;
  
  let details = `<h4>${entry.calcName}</h4>`;
  details += `<p><strong>Client:</strong> ${entry.clientName || 'N/A'}</p>`;
  details += `<p><strong>Total:</strong> ${formatCurrency(entry.total || 0)}</p>`;
  details += `<p><strong>Time:</strong> ${formatNumber(entry.totalTime || 0, 1)} hours</p>`;
  
  if (entry.details) {
    details += '<h5>Models:</h5>';
    for (const printerId in entry.details) {
      const printerData = entry.details[printerId];
      details += `<h6>${printerData.printerName}</h6><ul>`;
      printerData.models.forEach(model => {
        details += `<li>${model.name} - ${model.materialName} - ${model.weight}g - ${formatCurrency(model.cost)}</li>`;
      });
      details += '</ul>';
    }
  }
  
  alert(details); // Could be replaced with a proper modal
}

function deleteHistoryEntry(entryId) {
  if (confirm('Are you sure you want to delete this history entry?')) {
    appData.calcHistory = appData.calcHistory.filter(h => h.id !== entryId);
    saveToLocalStorage();
    renderHistoryTable();
  }
}

function onClearCalcHistory() {
  if (confirm('Are you sure you want to clear all calculation history?')) {
    appData.calcHistory = [];
    saveToLocalStorage();
    renderHistoryTable();
  }
}

// Settings management
function saveBrandingSettings() {
  appData.calcSettings.companyName = document.getElementById('companyNameInput').value.trim();
  appData.calcSettings.chatLink = document.getElementById('chatLinkInput').value.trim();
  appData.calcSettings.bankDetails = document.getElementById('bankDetailsInput').value.trim();
  appData.calcSettings.workHoursDay = parseFloat(document.getElementById('calcWorkHoursDay').value) || 8;
  
  saveToLocalStorage();
  alert('Branding settings saved');
}

function saveCalcSettings() {
  appData.calcSettings.printLabels = document.getElementById('printLabelsCheckbox').checked;
  appData.calcSettings.labelCost = parseFloat(document.getElementById('labelCostInput').value) || 0;
  appData.calcSettings.operatorRate = parseFloat(document.getElementById('calcOperatorRate').value) || 100;
  appData.calcSettings.costKwh = parseFloat(document.getElementById('calcCostKwh').value) || 6;
  appData.calcSettings.taxPercent = parseFloat(document.getElementById('calcTaxPercent').value) || 0;
  
  saveToLocalStorage();
  alert('Calculation settings saved');
}

function loadSettings() {
  const settings = appData.calcSettings || {};
  
  // Branding settings
  const companyNameInput = document.getElementById('companyNameInput');
  if (companyNameInput) companyNameInput.value = settings.companyName || '';
  
  const chatLinkInput = document.getElementById('chatLinkInput');
  if (chatLinkInput) chatLinkInput.value = settings.chatLink || '';
  
  const bankDetailsInput = document.getElementById('bankDetailsInput');
  if (bankDetailsInput) bankDetailsInput.value = settings.bankDetails || '';
  
  const workHoursInput = document.getElementById('calcWorkHoursDay');
  if (workHoursInput) workHoursInput.value = settings.workHoursDay || 8;
  
  // Calculation settings
  const printLabelsCheckbox = document.getElementById('printLabelsCheckbox');
  if (printLabelsCheckbox) printLabelsCheckbox.checked = settings.printLabels || false;
  
  const labelCostInput = document.getElementById('labelCostInput');
  if (labelCostInput) labelCostInput.value = settings.labelCost || 0;
  
  const operatorRateInput = document.getElementById('calcOperatorRate');
  if (operatorRateInput) operatorRateInput.value = settings.operatorRate || 100;
  
  const costKwhInput = document.getElementById('calcCostKwh');
  if (costKwhInput) costKwhInput.value = settings.costKwh || 6;
  
  const taxPercentInput = document.getElementById('calcTaxPercent');
  if (taxPercentInput) taxPercentInput.value = settings.taxPercent || 0;
}

// Import/Export functionality
function onExportJson() {
  const exportArea = document.getElementById('exportArea');
  if (exportArea) {
    exportArea.value = JSON.stringify(appData, null, 2);
  }
}

function onImportJson() {
  const importArea = document.getElementById('importArea');
  if (!importArea) return;
  
  try {
    const imported = JSON.parse(importArea.value);
    appData = { ...appData, ...imported };
    migrateOldData(appData);
    saveToLocalStorage();
    initAll();
    alert('Data imported successfully');
  } catch (e) {
    alert('Invalid JSON data');
  }
}

function importFromFile() {
  const fileInput = document.getElementById('importJsonFile');
  if (!fileInput || !fileInput.files[0]) return;
  
  const file = fileInput.files[0];
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      appData = { ...appData, ...imported };
      migrateOldData(appData);
      saveToLocalStorage();
      initAll();
      alert('Data imported successfully from file');
    } catch (err) {
      alert('Invalid JSON file');
    }
  };
  
  reader.readAsText(file);
}

function downloadJsonFile() {
  const dataStr = JSON.stringify(appData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = '3d-calc-data.json';
  link.click();
  
  URL.revokeObjectURL(url);
}

// Summary/Statistics
function updateSummaryPane() {
  const summaryContent = document.getElementById('summaryContent');
  if (!summaryContent) return;
  
  const completedOrders = appData.calcHistory.filter(h => h.orderStatus === 'done' || h.orderStatus === 'paid');
  const totalRevenue = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
  const totalOrders = completedOrders.length;
  
  const materialStats = {};
  const printerStats = {};
  
  // Analyze completed orders
  completedOrders.forEach(order => {
    if (order.details) {
      for (const printerId in order.details) {
        const printerData = order.details[printerId];
        
        if (!printerStats[printerId]) {
          printerStats[printerId] = {
            name: printerData.printerName,
            totalTime: 0,
            totalRevenue: 0,
            orderCount: 0
          };
        }
        
        printerStats[printerId].orderCount++;
        
        printerData.models.forEach(model => {
          printerStats[printerId].totalTime += model.time || 0;
          printerStats[printerId].totalRevenue += model.cost || 0;
          
          const materialId = model.materialId;
          if (materialId) {
            if (!materialStats[materialId]) {
              materialStats[materialId] = {
                name: model.materialName,
                totalWeight: 0,
                totalCost: 0,
                usageCount: 0
              };
            }
            materialStats[materialId].totalWeight += model.weight || 0;
            materialStats[materialId].usageCount++;
          }
        });
      }
    }
  });
  
  let summaryHtml = `
    <div class="row mb-4">
      <div class="col-md-3">
        <div class="card text-center">
          <div class="card-body">
            <h5 class="card-title">${totalOrders}</h5>
            <p class="card-text">Completed Orders</p>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center">
          <div class="card-body">
            <h5 class="card-title">${formatCurrency(totalRevenue)}</h5>
            <p class="card-text">Total Revenue</p>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center">
          <div class="card-body">
            <h5 class="card-title">${appData.printers.length}</h5>
            <p class="card-text">Printers</p>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center">
          <div class="card-body">
            <h5 class="card-title">${appData.materials.length}</h5>
            <p class="card-text">Materials</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  if (Object.keys(printerStats).length > 0) {
    summaryHtml += `
      <h5>Printer Statistics</h5>
      <div class="table-responsive mb-4">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Printer</th>
              <th>Orders</th>
              <th>Total Time</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    for (const printerId in printerStats) {
      const stats = printerStats[printerId];
      summaryHtml += `
        <tr>
          <td>${stats.name}</td>
          <td>${stats.orderCount}</td>
          <td>${formatNumber(stats.totalTime, 1)}h</td>
          <td>${formatCurrency(stats.totalRevenue)}</td>
        </tr>
      `;
    }
    
    summaryHtml += `
          </tbody>
        </table>
      </div>
    `;
  }
  
  if (Object.keys(materialStats).length > 0) {
    summaryHtml += `
      <h5>Material Usage</h5>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Material</th>
              <th>Usage Count</th>
              <th>Total Weight</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    for (const materialId in materialStats) {
      const stats = materialStats[materialId];
      summaryHtml += `
        <tr>
          <td>${stats.name}</td>
          <td>${stats.usageCount}</td>
          <td>${formatNumber(stats.totalWeight, 1)}g</td>
        </tr>
      `;
    }
    
    summaryHtml += `
          </tbody>
        </table>
      </div>
    `;
  }
  
  summaryContent.innerHTML = summaryHtml;
}

// Utility functions for table operations
function filterTable(tableId, searchValue) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const rows = table.querySelectorAll('tbody tr');
  const filter = searchValue.toLowerCase();
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? '' : 'none';
  });
}

function sortTable(tableId, columnIndex) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  
  rows.sort((a, b) => {
    const aVal = a.cells[columnIndex]?.textContent.trim() || '';
    const bVal = b.cells[columnIndex]?.textContent.trim() || '';
    
    // Try to parse as numbers
    const aNum = parseFloat(aVal.replace(/[^\d.-]/g, ''));
    const bNum = parseFloat(bVal.replace(/[^\d.-]/g, ''));
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }
    
    return aVal.localeCompare(bVal);
  });
  
  rows.forEach(row => tbody.appendChild(row));
}

function selectAll(checkbox, type) {
  const checkboxes = document.querySelectorAll(`.${type}-checkbox`);
  checkboxes.forEach(cb => cb.checked = checkbox.checked);
}

function massDelete(type) {
  const checkboxes = document.querySelectorAll(`.${type}-checkbox:checked`);
  if (checkboxes.length === 0) {
    alert('Please select items to delete');
    return;
  }
  
  if (!confirm(`Are you sure you want to delete ${checkboxes.length} items?`)) {
    return;
  }
  
  const idsToDelete = Array.from(checkboxes).map(cb => parseInt(cb.value));
  
  switch (type) {
    case 'printers':
      appData.printers = appData.printers.filter(p => !idsToDelete.includes(p.id));
      renderPrintersTable();
      break;
    case 'globalMaterials':
      appData.materials = appData.materials.filter(m => !idsToDelete.includes(m.id));
      renderGlobalMaterialsTable();
      break;
    case 'globalAdditional':
      appData.additionalGlobal = appData.additionalGlobal.filter(a => !idsToDelete.includes(a.id));
      renderAdditionalGlobalTable();
      break;
  }
  
  saveToLocalStorage();
}

function massEdit(type) {
  alert('Mass edit functionality not implemented yet');
}

// Additional placeholder functions for compatibility
function toggleFinalFields(status) {
  const finalCostGroup = document.getElementById('finalCostGroup');
  if (finalCostGroup) {
    finalCostGroup.style.display = (status === 'done' || status === 'paid') ? 'block' : 'none';
  }
}

function updateHistoryStats() {
  // Placeholder for history filtering functionality
  alert('History filtering not implemented yet');
}

function onExportHistory() {
  const exportArea = document.getElementById('exportArea');
  if (exportArea) {
    exportArea.value = JSON.stringify(appData.calcHistory, null, 2);
  }
}

function onImportHistory() {
  const importArea = document.getElementById('importArea');
  if (!importArea) return;
  
  try {
    const imported = JSON.parse(importArea.value);
    if (Array.isArray(imported)) {
      appData.calcHistory = imported;
      saveToLocalStorage();
      renderHistoryTable();
      alert('History imported successfully');
    } else {
      alert('Invalid history data - must be an array');
    }
  } catch (e) {
    alert('Invalid JSON data');
  }
}

// Cloud sync placeholder functions
function generateSyncLinkAndQR() {
  alert('Cloud sync functionality requires Supabase integration');
}

function saveSettingsToCloud() {
  alert('Cloud sync functionality requires Supabase integration');
}

function loadSettingsFromCloud() {
  alert('Cloud sync functionality requires Supabase integration');
}

// Tax integration placeholder functions
function saveMyNalogSettings() {
  alert('Tax integration not implemented yet');
}

function checkMyNalogStatus() {
  alert('Tax integration not implemented yet');
}

// Initialize all tables and UI
function initAll() {
  renderPrintersTable();
  renderGlobalMaterialsTable();
  renderAdditionalGlobalTable();
  renderClientsTable();
  renderHistoryTable();
  renderCalculatorPrinters();
  updateClientsDatalist();
  updateSummaryPane();
  loadSettings();
}

// Main initialization
document.addEventListener('DOMContentLoaded', function() {
  // Set up theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-bs-theme');
      setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
  }
  
  // Load saved theme
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
  setTheme(savedTheme);
  
  // Load data and initialize
  loadFromLocalStorage();
  initAll();
  
  // Set up event listeners for import/export
  const downloadJsonBtn = document.getElementById('downloadJsonFileBtn');
  if (downloadJsonBtn) {
    downloadJsonBtn.addEventListener('click', downloadJsonFile);
  }
  
  const importFileInput = document.getElementById('importJsonFile');
  if (importFileInput) {
    importFileInput.addEventListener('change', importFromFile);
  }
  
  console.log('3D Print Cost Calculator initialized');
});

// Fluid plugin integration hooks
if (window.FluidPlugin) {
  window.FluidPlugin.onReady = function() {
    console.log('Fluid plugin ready');
    initAll();
  };
  
  window.FluidPlugin.onData = function(data) {
    if (data.type === 'printer_status') {
      // Handle printer status updates from Fluid
      console.log('Printer status update:', data);
    }
  };
}