# Amazon SP-API Integration Setup Guide

## Overview

This guide explains how to set up and use the Amazon Selling Partner API integration for the Kenouz Books platform. The integration allows administrators to publish products directly to Amazon with one click.

## Prerequisites

1. **Redis Server** - Required for the Bull queue system
2. **Amazon Seller Central Account** - With SP-API access
3. **Amazon SP-API Credentials** - Client ID, Client Secret, Refresh Token
4. **Node.js** - Version 18 or higher
5. **MongoDB** - Database connection

## Installation

### 1. Install Dependencies

The required packages are already installed in `package.json`:
- `amazon-sp-api` - Amazon SP-API SDK
- `bull` - Queue system
- `axios` - HTTP client
- `crypto-js` - Cryptographic functions

### 2. Configure Environment Variables

Add the following variables to your `.env` file:

```bash
# Amazon SP-API Configuration
AMAZON_SP_API_REFRESH_TOKEN=your_refresh_token_here
AMAZON_SP_API_CLIENT_ID=your_client_id_here
AMAZON_SP_API_CLIENT_SECRET=your_client_secret_here
AMAZON_SP_API_MARKETPLACE_ID=ARBP9OOSHTCHU
AMAZON_SP_API_REGION=eu
AMAZON_SP_API_ROLE_ARN=  # Optional: If using IAM role
AMAZON_SP_API_SELLER_ID=  # Optional: Your Amazon seller ID

# Redis Configuration (for queue system)
REDIS_URL=redis://localhost:6379
```

**Important:**
- **No sandbox mode** - The integration uses production SP-API only
- **Access token is generated dynamically** from refresh token (no need to store in .env)
- **Amazon price percentage** is configured in SystemSettings (default: 20%)

### 3. Start Redis Server

```bash
# On macOS with Homebrew
brew services start redis

# Or start manually
redis-server
```

### 4. Update Database Schema

The Product model has been updated with the following Amazon fields:

- `amazonSku` - Unique SKU for Amazon
- `amazonAsin` - Amazon ASIN
- `amazonStatus` - Publishing status (pending, publishing, published, retry, failed, suppressed)
- `amazonLastError` - Last error message
- `amazonSubmissionId` - Amazon submission ID
- `amazonSyncedAt` - Last sync timestamp
- `amazonRetryCount` - Number of retry attempts

Run a database migration if needed to add these fields to existing documents.

## Architecture

### Service Layer

The integration follows a clean architecture with dedicated services:

1. **AmazonWorkflowService** (`services/amazon/amazon-workflow.service.js`)
   - Orchestrates complete publishing workflow
   - Calculates Amazon price from SystemSettings
   - Handles both new product publishing and existing product sync
   - Manages product dimensions with fallbacks

2. **AmazonAuthService** (`services/amazon/amazon-auth.service.js`)
   - Manages SP-API authentication
   - Generates access tokens dynamically from refresh token
   - Provides API client
   - Always uses production mode (no sandbox)

3. **AmazonListingService** (`services/amazon/amazon-listing.service.js`)
   - Creates product listings
   - Retrieves listing details
   - Checks ASIN availability

4. **AmazonOfferService** (`services/amazon/amazon-offer.service.js`)
   - Uploads product offers/pricing
   - Manages feed submissions

5. **AmazonInventoryService** (`services/amazon/amazon-inventory.service.js`)
   - Updates inventory levels
   - Manages stock quantities

6. **AmazonImageService** (`services/amazon/amazon-image.service.js`)
   - Uploads product images
   - Manages image feeds

7. **AmazonPollingService** (`services/amazon/amazon-polling.service.js`)
   - Polls for ASIN availability
   - Polls for BUYABLE status
   - Handles timeout logic

8. **AmazonSkuGenerator** (`services/amazon/amazon-sku-generator.service.js`)
   - Generates random SKUs
   - Ensures uniqueness

9. **AmazonLogger** (`services/amazon/amazon-logger.service.js`)
   - Logs all Amazon operations
   - Stores in `logs/amazon.log`

### Queue System

The publishing process uses Bull queues for background processing:

- **Queue Name**: `amazon-publishing`
- **Job Types**: 
  - `publish` - For new product publishing
  - `sync` - For syncing existing Amazon listings
- **Max Attempts**: 3
- **Backoff**: Exponential (30s base)
- **Timeout**: 15 minutes

### Publishing Workflow

1. **Generate SKU** - Create random unique SKU
2. **Create Listing** - Submit product to Amazon catalog
3. **Wait for ASIN** - Poll until ASIN is assigned (max 15 min)
4. **Upload Offer** - Submit pricing information
5. **Upload Inventory** - Update stock quantity
6. **Upload Image** - Upload main product image
7. **Wait for BUYABLE** - Poll until product is buyable (max 15 min)
8. **Complete** - Mark as published

## API Endpoints

### Publish Product to Amazon

```http
POST /api/amazon/products/:id/amazon/publish
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Product added to publishing queue",
  "jobId": "job_id_here",
  "productId": "product_id_here"
}
```

### Get Product Amazon Status

```http
GET /api/amazon/products/:id/amazon/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "publishing",
    "sku": "Q8-L4PK-7RZA",
    "asin": "B08XXXXX",
    "submissionId": "submission_id",
    "syncedAt": "2024-01-01T00:00:00Z",
    "lastError": null,
    "retryCount": 0,
    "inProgress": true,
    "amazonUrl": "https://www.amazon.eg/dp/B08XXXXX"
  }
}
```

### Retry Failed Publishing

```http
POST /api/amazon/products/:id/amazon/retry
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Product publishing retry initiated",
  "jobId": "job_id_here",
  "productId": "product_id_here"
}
```

### Sync Product to Amazon

```http
POST /api/amazon/products/:id/amazon/sync
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Product Amazon sync initiated",
  "jobId": "job_id_here",
  "productId": "product_id_here"
}
```

**Note:** This endpoint is used for products that already have an ASIN. It updates price, inventory, and image without creating a new listing.

### Get Job Progress

```http
GET /api/amazon/jobs/:jobId/progress
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job_id",
    "state": "active",
    "progress": 45,
    "data": { "productId": "product_id" },
    "failedReason": null,
    "processedOn": "2024-01-01T00:00:00Z",
    "finishedOn": null
  }
}
```

## Admin UI Usage

### Product Approval Page

The admin product approval page now includes Amazon publishing features:

1. **Amazon Status Badge** - Shows current publishing status
2. **SKU/ASIN Display** - Shows assigned identifiers
3. **Publish Button** - One-click publishing for approved physical products
4. **Retry Button** - Retry failed publishing (max 3 attempts)
5. **Error Display** - Shows last error if publishing failed
6. **Real-time Polling** - Auto-updates status every 5 seconds

### Status Colors

- **Gray**: Pending
- **Blue**: Publishing
- **Green**: Published
- **Yellow**: Retry
- **Red**: Failed
- **Purple**: Suppressed

## Product Requirements

To publish a product to Amazon, it must meet these criteria:

1. **Status**: Must be `approved`
2. **Type**: Must be `physical` (not digital)
3. **Required Fields**:
   - `product_name` - Product title
   - `product_description` - Product description
   - `product_price` - Base selling price
   - `product_quantity` - Stock quantity
   - `images` - At least one product image
   - `weight` - Product weight (grams)
   - `length`, `width`, `height` - Dimensions (cm)

### Amazon Price Calculation

The Amazon selling price is calculated automatically based on SystemSettings:

- **Default**: 20% increase over base price
- **Formula**: `amazonPrice = basePrice * (1 + percentage/100)`
- **Configurable**: Admin can change the percentage in SystemSettings
- **Dynamic**: Changes to percentage affect future listings immediately

Example:
- Base price: 100 EGP
- Percentage: 20%
- Amazon price: 120 EGP

### Default Values

The system uses these defaults if values are missing:

- **Brand**: عام
- **Manufacturer**: generic
- **Country of Origin**: EG
- **Batteries Required**: false
- **Warranty**: 15 يوما
- **Dangerous Goods Regulation**: other
- **Number of Items**: 1
- **Bullet Point**: كتاب أصلي
- **Condition**: new_new
- **GTIN Exemption**: true

- **Dimensions** (fallback):
  - Length: 20 cm
  - Width: 14 cm
  - Height: 0.5 cm
  - Weight: 450 grams
  - Package Weight: 450 grams

## Error Handling

### Common Errors

1. **13013 Error** - Product not yet in catalog
   - **Solution**: System automatically waits and retries

2. **Unauthorized** - Invalid credentials
   - **Solution**: Check .env variables

3. **Listing Suppressed** - Amazon suppressed the listing
   - **Solution**: Check Amazon Seller Central for details

4. **Missing Attributes** - Required fields missing
   - **Solution**: Ensure all required product fields are populated

5. **Timeout** - Amazon did not respond in time
   - **Solution**: System automatically retries up to 3 times

### Logging

All Amazon operations are logged to:
- `Backend/logs/amazon.log` - General logs
- `Backend/logs/amazon-error.log` - Error logs

Log format:
```json
{
  "type": "REQUEST|RESPONSE|ERROR|SUCCESS|RETRY",
  "operation": "operation_name",
  "data": {},
  "timestamp": "2024-01-01T00:00:00Z",
  "executionTime": 1234
}
```

## Testing

### Manual Testing

1. **Test Connection**:
```javascript
const amazonAuth = require('./services/amazon/amazon-auth.service');
await amazonAuth.testConnection();
```

2. **Test Single Product Publish**:
```bash
curl -X POST http://localhost:3000/api/amazon/products/{product_id}/amazon/publish \
  -H "Authorization: Bearer {token}"
```

3. **Check Status**:
```bash
curl http://localhost:3000/api/amazon/products/{product_id}/amazon/status \
  -H "Authorization: Bearer {token}"
```

## Troubleshooting

### Redis Connection Issues

If you see Redis connection errors:
```bash
# Check Redis is running
redis-cli ping

# Should return: PONG
```

### Amazon API Errors

Check the logs for detailed error messages:
```bash
tail -f Backend/logs/amazon-error.log
```

### Queue Not Processing

Ensure the queue worker is running. The queue is initialized in the job file when the application starts.

### Product Not Appearing on Amazon

1. Check the product status in the admin panel
2. Review error logs for specific issues
3. Verify all required fields are populated
4. Check Amazon Seller Central for listing status

## Security Considerations

1. **Never commit .env file** - Contains sensitive credentials
2. **Use environment variables** - All credentials are in .env
3. **Rotate tokens regularly** - Amazon tokens expire
4. **Monitor logs** - Check for unauthorized access
5. **Limit API access** - Only admin users can publish

## Production Checklist

Before deploying to production:

- [x] **Production mode only** - No sandbox mode configured
- [x] **Dynamic token generation** - Access tokens generated from refresh token
- [ ] Update Redis URL to production instance
- [ ] Configure proper logging rotation
- [ ] Set up monitoring for queue processing
- [ ] Test with a single product first
- [ ] Verify all credentials are correct
- [ ] Ensure Redis is properly secured
- [ ] Set up alerts for failed publishing
- [ ] Configure Amazon price percentage in SystemSettings
- [ ] Verify marketplace ID (ARBP9OOSHTCHU for Egypt)

## Support

For issues or questions:
1. Check the logs in `Backend/logs/amazon.log`
2. Review Amazon SP-API documentation
3. Check Amazon Seller Central for account-specific issues

## Changelog

### Version 2.0.0 (2024-01-22)
- **Production mode only** - Removed sandbox mode, always uses production SP-API
- **Dynamic token generation** - Access tokens generated automatically from refresh token
- **AmazonWorkflowService** - Centralized business logic in workflow service
- **Sync functionality** - Added ability to sync existing Amazon listings
- **Price calculation** - Amazon price calculated from SystemSettings percentage
- **Queue improvements** - Added separate job types for publish and sync
- **Clean architecture** - Job now delegates to AmazonWorkflowService

### Version 1.0.0 (2024-01-22)
- Initial implementation
- Complete publishing workflow
- Queue system integration
- Admin UI integration
- Comprehensive logging
- Error handling and retry logic
