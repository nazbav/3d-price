const pages = document.querySelectorAll('.page');
const navItems = document.querySelectorAll('#sidebar li');
navItems.forEach(li => li.addEventListener('click', () => {
  navItems.forEach(i => i.classList.remove('active'));
  li.classList.add('active');
  pages.forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + li.dataset.page).classList.add('active');
}));

let appData = JSON.parse(localStorage.getItem('appData') || '{}');
if(!appData.printers) appData.printers=[];
if(!appData.materials) appData.materials=[];
if(!appData.additional) appData.additional=[];
if(!appData.clients) appData.clients=[];
if(!appData.calcSettings) appData.calcSettings={operatorRate:0,costKwh:0,taxPercent:0};
if(!appData.history) appData.history=[];

function saveData(){
  localStorage.setItem('appData', JSON.stringify(appData));
}

function refreshSelects(){
  const prSel=document.getElementById('calcPrinter');
  const matSel=document.getElementById('calcMaterial');
  prSel.innerHTML = appData.printers.map((p,i)=>`<option value="${i}">${p.name}</option>`).join('');
  matSel.innerHTML = appData.materials.map((m,i)=>`<option value="${i}">${m.name}</option>`).join('');
}

function refreshTables(){
  const pTable=document.getElementById('printersTable');
  pTable.innerHTML='<tr><th>Название</th><th>Цена</th><th>Мощность</th><th>Окуп, ч</th></tr>'+
    appData.printers.map((p,i)=>`<tr><td>${p.name}</td><td>${p.cost}</td><td>${p.power}</td><td>${p.hours}</td></tr>`).join('');
  const mTable=document.getElementById('materialsTable');
  mTable.innerHTML='<tr><th>Название</th><th>Цена/кг</th></tr>'+
    appData.materials.map((m,i)=>`<tr><td>${m.name}</td><td>${m.costKg}</td></tr>`).join('');
  const aTable=document.getElementById('additionalTable');
  aTable.innerHTML='<tr><th>Название</th><th>Цена/ч</th></tr>'+
    appData.additional.map((a,i)=>`<tr><td>${a.name}</td><td>${a.cost}</td></tr>`).join('');
  const cList=document.getElementById('clientsList');
  cList.innerHTML=appData.clients.map(c=>`<li>${c}</li>`).join('');
  const hTable=document.getElementById('historyTable').querySelector('tbody');
  hTable.innerHTML=appData.history.map(h=>`<tr><td>${new Date(h.date).toLocaleString()}</td><td>${h.name}</td><td>${h.total.toFixed(2)}</td></tr>`).join('');
}

function addPrinter(){
  const name=prompt('Название');
  const cost=parseFloat(prompt('Стоимость, ₽'))||0;
  const power=parseFloat(prompt('Мощность, Вт'))||0;
  const hours=parseFloat(prompt('Часов окупаемости'))||0;
  appData.printers.push({name,cost,power,hours});
  saveData();
  refreshSelects();
  refreshTables();
}
function addMaterial(){
  const name=prompt('Название');
  const costKg=parseFloat(prompt('Цена за кг'))||0;
  appData.materials.push({name,costKg});
  saveData();
  refreshSelects();
  refreshTables();
}
function addAdditional(){
  const name=prompt('Название');
  const cost=parseFloat(prompt('Цена за час'))||0;
  appData.additional.push({name,cost});
  saveData();
  refreshTables();
}
function addClient(){
  const name=document.getElementById('clientName').value.trim();
  if(name){
    appData.clients.push(name);
    document.getElementById('clientName').value='';
    saveData();
    refreshTables();
  }
}
function saveSettings(){
  appData.calcSettings={
    operatorRate:parseFloat(document.getElementById('setOperator').value)||0,
    costKwh:parseFloat(document.getElementById('setKwh').value)||0,
    taxPercent:parseFloat(document.getElementById('setTax').value)||0
  };
  saveData();
}
function loadSettings(){
  document.getElementById('setOperator').value=appData.calcSettings.operatorRate;
  document.getElementById('setKwh').value=appData.calcSettings.costKwh;
  document.getElementById('setTax').value=appData.calcSettings.taxPercent;
}
function calculate(){
  const p=appData.printers[document.getElementById('calcPrinter').value];
  const m=appData.materials[document.getElementById('calcMaterial').value];
  const hours=parseFloat(document.getElementById('calcHours').value)||0;
  const grams=parseFloat(document.getElementById('calcGrams').value)||0;
  const shipping=parseFloat(document.getElementById('calcShipping').value)||0;
  const waste=parseFloat(document.getElementById('calcWaste').value)||0;
  const operatorPart=hours*appData.calcSettings.operatorRate;
  const printerPart=p?hours*(p.cost/p.hours):0;
  const materialPart=m?grams*(1+waste/100)*(m.costKg/1000):0;
  const electric=p?((p.power/1000)*hours*appData.calcSettings.costKwh):0;
  const additional=appData.additional.reduce((sum,a)=>sum+a.cost*hours,0);
  const subTotal=operatorPart+printerPart+materialPart+electric+additional+shipping;
  const tax=subTotal*(appData.calcSettings.taxPercent/100);
  const total=subTotal+tax;
  document.getElementById('calcResult').textContent=`Итого: ${total.toFixed(2)} ₽`;
  appData.history.push({date:Date.now(),name:'Модель',total});
  saveData();
  refreshTables();
}

document.getElementById('addPrinterBtn').onclick=addPrinter;
document.getElementById('addMaterialBtn').onclick=addMaterial;
document.getElementById('addAdditionalBtn').onclick=addAdditional;
document.getElementById('addClientBtn').onclick=addClient;
document.getElementById('saveSettingsBtn').onclick=saveSettings;
document.getElementById('calcBtn').onclick=calculate;

refreshSelects();
refreshTables();
loadSettings();
