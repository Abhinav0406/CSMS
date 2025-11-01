# Central Stock Management System (CSMS)

## Overview

The Central Stock Management System is a comprehensive inventory management application designed to provide centralized visibility and control over product stock levels across multiple warehouse locations. The system enables businesses to track inventory quantities, manage product variants, handle returns, and prevent overselling through real-time stock monitoring and committed quantity tracking.

## Core Functionality

### Multi-Location Inventory Management
The system tracks products across multiple warehouse locations (e.g., Liberty, Warehouse A, Warehouse B). Each product can have different stock levels at each location, and the system provides both location-specific views and aggregated views across all locations.

### Product Variants Support
Products can have variants defined by attributes such as color and size. The system tracks inventory separately for each variant combination (SKU + location + color + size), allowing detailed inventory management at the variant level.

### Stock Level Tracking
The system maintains multiple inventory metrics:
- **On Hand (Current)**: The current physical stock quantity
- **On Hand (New)**: The updated or adjusted stock quantity that can be edited
- **Committed**: Stock quantity reserved for orders that cannot be sold to other customers
- **Available**: Calculated as On Hand - Committed, representing sellable inventory
- **Incoming**: Expected inventory that will arrive soon
- **Unavailable**: Stock that exists but cannot be sold

### Role-Based Access Control
The system implements two user roles:
- **Edit Role**: Users can view and modify inventory quantities, update stock levels, and manage inventory adjustments
- **View Role**: Users have read-only access to view inventory data and reports

### Master View
A comprehensive table interface showing all products with key inventory metrics. Features include:
- Search and filtering capabilities (by SKU, availability status, location, etc.)
- Grouping by variants (SKU + color combinations)
- Pagination for handling large product catalogs
- Real-time inventory calculations and displays
- Quick navigation to detailed product views

### Product Detail Pages
Individual product pages provide:
- Complete inventory information across all locations
- Visual product representation with images
- Detailed stock metrics breakdown
- Quantity adjustment capabilities for users with Edit role
- Variant filtering and management (by color, size)
- Aggregate views showing total stock across locations
- Historical and current stock comparisons

### Data Import and Export
- **CSV Import**: Bulk import inventory data from CSV files, supporting standard e-commerce format columns (Handle, Title, SKU, Location, Option names/values, stock quantities, etc.)
- **CSV Export**: Export current inventory data maintaining original CSV structure for round-trip compatibility
- Preserves original data structure and custom columns during import/export cycles

### Return Management
The system tracks product returns with status management:
- **Restocked**: Returns that have been added back to available inventory
- **Not Restocked**: Returns that remain out of circulation
- **In Transit**: Returns currently being processed

### Inventory Calculations
Automated calculations ensure accurate inventory tracking:
- Available quantity = On Hand - Committed
- Total quantity = On Hand + Returns - Committed
- Handles order placement by increasing committed quantities
- Manages order fulfillment by reducing both on-hand and committed quantities
- Processes returns based on return status

## Key Features

1. **Real-Time Inventory Visibility**: View current stock levels across all locations instantly
2. **Overselling Prevention**: Track committed quantities to prevent selling more than available
3. **Multi-Warehouse Support**: Manage inventory across multiple physical locations
4. **Variant-Level Tracking**: Detailed inventory management for products with color, size, or other variant attributes
5. **Flexible Access Control**: Role-based permissions for different user types
6. **Bulk Operations**: Import and export inventory data for efficient data management
7. **Search and Filter**: Quickly find products and filter by various criteria
8. **Visual Product Display**: Product images with automatic fallback handling
9. **Data Persistence**: Local storage with backend synchronization capabilities
10. **Round-Trip Data Integrity**: Maintains original CSV structure during import/export operations

## Use Cases

- Retail businesses managing inventory across multiple store locations or warehouses
- E-commerce operations requiring real-time stock visibility to prevent overselling
- Companies handling product variants (clothing, accessories, etc.) needing variant-level inventory tracking
- Operations requiring bulk inventory updates and data synchronization
- Businesses needing to track incoming inventory and manage return processing
- Organizations requiring role-based inventory access for different team members

## Workflow

1. Users log in with role-based credentials (Edit or View access)
2. Access the Master View to see all products in a table format
3. Search, filter, or browse products by various criteria
4. Click on any product to view detailed information including all locations
5. Users with Edit role can adjust quantities, update stock levels, and manage inventory
6. Import new inventory data via CSV upload
7. Export current inventory state for backup or reporting purposes
8. Track returns and manage their status (restocked, not restocked, in transit)
9. Monitor committed quantities to ensure accurate order fulfillment

The system provides a centralized hub for all inventory management activities, ensuring accurate stock tracking, preventing overselling, and maintaining real-time visibility across all warehouse locations.

