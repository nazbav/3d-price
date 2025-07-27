# 3D Print Cost Calculator - Fluid Plugin

A comprehensive 3D print cost calculator plugin for Fluid UI that provides complete cost tracking, material management, and order history for 3D printing operations.

## Features

- **Cost Calculation**: Calculate comprehensive printing costs including materials, printer depreciation, electricity, operator time, and additional costs
- **Printer Management**: Configure multiple printers with individual cost parameters
- **Material Database**: Track material costs, inventory, and usage
- **Order History**: Save and manage calculation history with client information
- **Export/Import**: Backup and restore data in JSON format
- **Responsive Design**: Optimized for use within Fluid's interface

## Installation

1. Copy this entire directory to your Fluid plugins folder:
   ```bash
   cp -r 3dprint-calculator /path/to/fluid/plugins/
   ```

2. Restart Fluid to load the plugin

3. The calculator will appear as "3D Cost Calculator" in the Fluid navigation sidebar

## Usage

1. **Setup Printers**: Add your printers with cost, power consumption, and maintenance costs
2. **Configure Materials**: Add materials with cost per kg, remaining amounts, and printer assignments
3. **Create Calculations**: Add models to printers, specify materials and print times
4. **Review Costs**: Calculate comprehensive costs including all factors
5. **Save History**: Store calculations for future reference and client management

## Configuration

Edit `plugin.json` to modify:
- Plugin name and title
- Navigation icon and order
- Version requirements
- Permissions

## Files

- `plugin.json` - Plugin manifest and configuration
- `calculator.html` - Main interface with all tabs and modals
- `calculator.js` - Core JavaScript functionality
- `normalizeIds.js` - Utility functions for data consistency

## Data Storage

All data is stored in browser localStorage with automatic saving. Data can be exported/imported as JSON for backup and migration.

## Compatibility

- Requires Fluid v1.0.0 or higher
- Compatible with all modern browsers
- Responsive design works on desktop and mobile devices

## Support

For issues or feature requests, visit: https://github.com/nazbav/3d-price