/**
 * ID normalization utilities for 3D Price Calculator
 * Ensures all IDs are numeric, unique, and sequential within each entity type
 */

/**
 * Ensures all ID fields are converted to numbers
 * @param {Object} appData - The application data object
 * @returns {Object} - Modified appData with numeric IDs
 */
function ensureNumericIds(appData) {
  // Helper function to convert ID to number
  const toNumericId = (id) => {
    if (id === null || id === undefined) return null;
    const numId = Number(id);
    return isNaN(numId) ? null : numId;
  };

  // Convert printer IDs
  if (Array.isArray(appData.printers)) {
    appData.printers.forEach(printer => {
      if (printer.id !== undefined) {
        printer.id = toNumericId(printer.id);
      }
      // Convert profileIds array
      if (Array.isArray(printer.profileIds)) {
        printer.profileIds = printer.profileIds.map(toNumericId).filter(id => id !== null);
      }
    });
  }

  // Convert material IDs
  if (Array.isArray(appData.materials)) {
    appData.materials.forEach(material => {
      if (material.id !== undefined) {
        material.id = toNumericId(material.id);
      }
      // Convert printers array (IDs of printers this material is available for)
      if (Array.isArray(material.printers)) {
        material.printers = material.printers.map(toNumericId).filter(id => id !== null);
      }
      // Convert profileIds array
      if (Array.isArray(material.profileIds)) {
        material.profileIds = material.profileIds.map(toNumericId).filter(id => id !== null);
      }
    });
  }

  // Convert materialProfile IDs
  if (Array.isArray(appData.materialProfiles)) {
    appData.materialProfiles.forEach(profile => {
      if (profile.id !== undefined) {
        profile.id = toNumericId(profile.id);
      }
    });
  }

  // Convert printerProfile IDs
  if (Array.isArray(appData.printerProfiles)) {
    appData.printerProfiles.forEach(profile => {
      if (profile.id !== undefined) {
        profile.id = toNumericId(profile.id);
      }
      if (profile.printerId !== undefined) {
        profile.printerId = toNumericId(profile.printerId);
      }
    });
  }

  // Convert additional global IDs
  if (Array.isArray(appData.additionalGlobal)) {
    appData.additionalGlobal.forEach(additional => {
      if (additional.id !== undefined) {
        additional.id = toNumericId(additional.id);
      }
      // Convert printers array
      if (Array.isArray(additional.printers)) {
        additional.printers = additional.printers.map(toNumericId).filter(id => id !== null);
      }
    });
  }

  // Convert client IDs
  if (Array.isArray(appData.clients)) {
    appData.clients.forEach(client => {
      if (client.id !== undefined) {
        client.id = toNumericId(client.id);
      }
    });
  }

  // Convert calcHistory IDs and references
  if (Array.isArray(appData.calcHistory)) {
    appData.calcHistory.forEach(history => {
      if (history.id !== undefined) {
        history.id = toNumericId(history.id);
      }
      if (history.clientId !== undefined) {
        history.clientId = toNumericId(history.clientId);
      }
      
      // Convert details array
      if (Array.isArray(history.details)) {
        history.details.forEach(detail => {
          if (detail.printerId !== undefined) {
            detail.printerId = toNumericId(detail.printerId);
          }
          if (detail.materialId !== undefined) {
            detail.materialId = toNumericId(detail.materialId);
          }
        });
      }

      // Convert calcData object keys (printer IDs)
      if (history.calcData && typeof history.calcData === 'object') {
        const newCalcData = {};
        Object.keys(history.calcData).forEach(printerId => {
          const numericId = toNumericId(printerId);
          if (numericId !== null) {
            newCalcData[numericId] = history.calcData[printerId];
            // Also convert material IDs within each model
            if (Array.isArray(newCalcData[numericId])) {
              newCalcData[numericId].forEach(model => {
                if (model.materialId !== undefined) {
                  model.materialId = toNumericId(model.materialId);
                }
              });
            }
          }
        });
        history.calcData = newCalcData;
      }
    });
  }

  return appData;
}

/**
 * Normalizes IDs to be sequential starting from 1 within each entity type
 * @param {Object} appData - The application data object
 * @returns {Object} - Modified appData with normalized IDs
 */
function normalizeIds(appData) {
  const idMappings = {};
  
  // Helper function to create a mapping of old IDs/references to new IDs
  const createIdMapping = (entities, entityType) => {
    if (!Array.isArray(entities)) return;
    
    idMappings[entityType] = {};
    
    // Create mapping for existing IDs and also store original entities for reference lookup
    entities.forEach((entity, index) => {
      const newId = index + 1;
      const oldId = entity.id;
      
      // Map old ID to new ID (if it exists)
      if (oldId !== undefined && oldId !== null) {
        idMappings[entityType][String(oldId)] = newId;
      }
      
      // Also create reverse lookup for entity properties (name-based fallback)
      if (entity.name) {
        idMappings[entityType][`name:${entity.name}`] = newId;
      }
      if (entity.description) {
        idMappings[entityType][`desc:${entity.description}`] = newId;
      }
      
      // Store entity reference for complex lookups
      idMappings[entityType][`entity:${index}`] = { entity, newId };
    });
  };

  // Helper function to resolve ID using various lookup strategies
  const resolveId = (oldId, entityType, fallbackValue = null) => {
    if (!idMappings[entityType]) return fallbackValue;
    
    // Direct ID lookup
    const directMatch = idMappings[entityType][String(oldId)];
    if (directMatch !== undefined) return directMatch;
    
    // If direct lookup fails, return fallback
    return fallbackValue;
  };

  // Create ID mappings for all entity types first
  createIdMapping(appData.printers, 'printers');
  createIdMapping(appData.materials, 'materials');
  createIdMapping(appData.materialProfiles, 'materialProfiles');
  createIdMapping(appData.printerProfiles, 'printerProfiles');
  createIdMapping(appData.additionalGlobal, 'additionalGlobal');
  createIdMapping(appData.clients, 'clients');
  createIdMapping(appData.calcHistory, 'calcHistory');

  // Now assign new IDs to all entities
  const assignNewIds = (entities) => {
    if (!Array.isArray(entities)) return;
    entities.forEach((entity, index) => {
      entity.id = index + 1;
    });
  };

  assignNewIds(appData.printers);
  assignNewIds(appData.materials);
  assignNewIds(appData.materialProfiles);
  assignNewIds(appData.printerProfiles);
  assignNewIds(appData.additionalGlobal);
  assignNewIds(appData.clients);
  assignNewIds(appData.calcHistory);

  // Update all cross-references using the mappings
  
  // Update printer profileIds
  if (Array.isArray(appData.printers)) {
    appData.printers.forEach(printer => {
      if (Array.isArray(printer.profileIds)) {
        printer.profileIds = printer.profileIds
          .map(id => resolveId(id, 'printerProfiles'))
          .filter(id => id !== null);
      }
    });
  }

  // Update material printers and profileIds
  if (Array.isArray(appData.materials)) {
    appData.materials.forEach(material => {
      if (Array.isArray(material.printers)) {
        material.printers = material.printers
          .map(id => resolveId(id, 'printers'))
          .filter(id => id !== null);
      }
      if (Array.isArray(material.profileIds)) {
        material.profileIds = material.profileIds
          .map(id => resolveId(id, 'materialProfiles'))
          .filter(id => id !== null);
      }
    });
  }

  // Update printerProfile printerId
  if (Array.isArray(appData.printerProfiles)) {
    appData.printerProfiles.forEach(profile => {
      if (profile.printerId !== undefined) {
        profile.printerId = resolveId(profile.printerId, 'printers', profile.printerId);
      }
    });
  }

  // Update additionalGlobal printers
  if (Array.isArray(appData.additionalGlobal)) {
    appData.additionalGlobal.forEach(additional => {
      if (Array.isArray(additional.printers)) {
        additional.printers = additional.printers
          .map(id => resolveId(id, 'printers'))
          .filter(id => id !== null);
      }
    });
  }

  // Update calcHistory references
  if (Array.isArray(appData.calcHistory)) {
    appData.calcHistory.forEach(history => {
      // Update clientId
      if (history.clientId !== undefined) {
        history.clientId = resolveId(history.clientId, 'clients', history.clientId);
      }

      // Update details
      if (Array.isArray(history.details)) {
        history.details.forEach(detail => {
          if (detail.printerId !== undefined) {
            detail.printerId = resolveId(detail.printerId, 'printers', detail.printerId);
          }
          if (detail.materialId !== undefined) {
            detail.materialId = resolveId(detail.materialId, 'materials', detail.materialId);
          }
        });
      }

      // Update calcData
      if (history.calcData && typeof history.calcData === 'object') {
        const newCalcData = {};
        Object.keys(history.calcData).forEach(printerId => {
          const newPrinterId = resolveId(printerId, 'printers', printerId);
          newCalcData[newPrinterId] = history.calcData[printerId];
          
          // Update material IDs within models
          if (Array.isArray(newCalcData[newPrinterId])) {
            newCalcData[newPrinterId].forEach(model => {
              if (model.materialId !== undefined) {
                model.materialId = resolveId(model.materialId, 'materials', model.materialId);
              }
            });
          }
        });
        history.calcData = newCalcData;
      }
    });
  }

  // Update counters to reflect new maximum IDs
  if (!appData.counters) appData.counters = {};
  appData.counters.printers = appData.printers ? appData.printers.length : 0;
  appData.counters.materials = appData.materials ? appData.materials.length : 0;
  appData.counters.materialProfiles = appData.materialProfiles ? appData.materialProfiles.length : 0;
  appData.counters.printerProfiles = appData.printerProfiles ? appData.printerProfiles.length : 0;
  appData.counters.additionalGlobal = appData.additionalGlobal ? appData.additionalGlobal.length : 0;
  appData.counters.clients = appData.clients ? appData.clients.length : 0;
  appData.counters.calcHistory = appData.calcHistory ? appData.calcHistory.length : 0;

  return appData;
}

/**
 * Validates that all IDs are unique within each entity type
 * @param {Object} appData - The application data object
 * @returns {Object} - Validation result with success flag and details
 */
function validateUniqueIds(appData) {
  const result = {
    success: true,
    duplicates: {},
    errors: []
  };

  // Helper function to check for duplicates in an entity array
  const checkDuplicates = (entities, entityType) => {
    if (!Array.isArray(entities)) return;
    
    const seenIds = new Set();
    const duplicateIds = new Set();
    
    entities.forEach(entity => {
      if (entity.id !== undefined && entity.id !== null) {
        if (seenIds.has(entity.id)) {
          duplicateIds.add(entity.id);
        } else {
          seenIds.add(entity.id);
        }
      }
    });

    if (duplicateIds.size > 0) {
      result.success = false;
      result.duplicates[entityType] = Array.from(duplicateIds);
      result.errors.push(`Duplicate IDs found in ${entityType}: ${Array.from(duplicateIds).join(', ')}`);
    }
  };

  // Check all entity types
  checkDuplicates(appData.printers, 'printers');
  checkDuplicates(appData.materials, 'materials');
  checkDuplicates(appData.materialProfiles, 'materialProfiles');
  checkDuplicates(appData.printerProfiles, 'printerProfiles');
  checkDuplicates(appData.additionalGlobal, 'additionalGlobal');
  checkDuplicates(appData.clients, 'clients');
  checkDuplicates(appData.calcHistory, 'calcHistory');

  // Check for missing or invalid IDs
  const checkMissingIds = (entities, entityType) => {
    if (!Array.isArray(entities)) return;
    
    entities.forEach((entity, index) => {
      if (entity.id === undefined || entity.id === null || isNaN(Number(entity.id))) {
        result.success = false;
        result.errors.push(`Invalid or missing ID in ${entityType} at index ${index}`);
      }
    });
  };

  checkMissingIds(appData.printers, 'printers');
  checkMissingIds(appData.materials, 'materials');
  checkMissingIds(appData.materialProfiles, 'materialProfiles');
  checkMissingIds(appData.printerProfiles, 'printerProfiles');
  checkMissingIds(appData.additionalGlobal, 'additionalGlobal');
  checkMissingIds(appData.clients, 'clients');
  checkMissingIds(appData.calcHistory, 'calcHistory');

  return result;
}

// Export functions for use in the main application
window.ensureNumericIds = ensureNumericIds;
window.normalizeIds = normalizeIds;
window.validateUniqueIds = validateUniqueIds;