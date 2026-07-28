const amazonAuth = require('./amazon-auth.service');
const logger = require('./amazon-logger.service');

function isValidGTINChecksum(code) {
  if (!code) return false;
  const clean = String(code).trim().replace(/[- ]/g, '');
  
  // ISBN-13 or EAN-13
  if (/^\d{13}$/.test(clean)) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(clean[i], 10);
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(clean[12], 10);
  }
  
  // UPC-12
  if (/^\d{12}$/.test(clean)) {
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      const digit = parseInt(clean[i], 10);
      sum += (i % 2 === 0) ? digit * 3 : digit;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(clean[11], 10);
  }

  // ISBN-10
  if (/^\d{9}[\dX]$/i.test(clean)) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(clean[i], 10) * (10 - i);
    }
    const lastChar = clean[9].toUpperCase();
    const lastVal = lastChar === 'X' ? 10 : parseInt(lastChar, 10);
    sum += lastVal;
    return sum % 11 === 0;
  }

  return false;
}

class AmazonListingService {
  /**
   * Create or update product listing on Amazon using Listings Items API (2021-08-01)
   * PUT /listings/2021-08-01/items/{sellerId}/{sku}
   */
  async createListing(productData) {
    const startTime = Date.now();
    const client = await amazonAuth.getClient();
    const marketplaceId = amazonAuth.getMarketplaceId();
    const sellerId = await amazonAuth.getSellerId();

    try {
      const targetProductType = productData.productType || 'ELECTRONIC_BOOK_READER';
      
      console.log('📤 [AMAZON LISTING] PUT_LISTINGS_ITEM_REQUEST', {
        timestamp: new Date().toISOString(),
        sku: productData.sku,
        title: productData.title,
        productType: targetProductType,
        sellerId,
        marketplaceId
      });
      logger.logRequest('CreateListing (Listings Items API)', { sku: productData.sku, title: productData.title, productType: targetProductType, sellerId });

      // Clean and validate barcode / ASIN checksum
      const rawBarcode = productData.barcode ? String(productData.barcode).trim().replace(/[- ]/g, '') : null;
      const validBarcode = isValidGTINChecksum(rawBarcode) ? rawBarcode : null;
      const validAsin = productData.asin ? String(productData.asin).trim() : null;

      // Determine requirements: LISTING_OFFER_ONLY if matching by valid Barcode/ASIN, else LISTING
      const hasIdentifier = !!(validBarcode || validAsin);
      const requirementsMode = productData.requirements || (hasIdentifier ? 'LISTING_OFFER_ONLY' : 'LISTING');

      // Construct JSON payload conforming to user's verified ELECTRONIC_BOOK_READER / ABIS_BOOK schema
      const payload = {
        productType: targetProductType,
        requirements: requirementsMode,
        attributes: {
          condition_type: [
            {
              value: 'new_new',
              marketplace_id: marketplaceId
            }
          ],
          fulfillment_availability: [
            {
              fulfillment_channel_code: 'DEFAULT',
              quantity: productData.quantity !== undefined ? productData.quantity : 10
            }
          ]
        }
      };

      // Offer price & List price
      if (productData.price) {
        payload.attributes.purchasable_offer = [
          {
            marketplace_id: marketplaceId,
            currency: 'EGP',
            our_price: [
              {
                schedule: [
                  {
                    value_with_tax: productData.price
                  }
                ]
              }
            ]
          }
        ];
      }

      // Valid ASIN
      if (validAsin) {
        payload.attributes.merchant_suggested_asin = [
          {
            value: validAsin,
            marketplace_id: marketplaceId
          }
        ];
      }

      // Valid Barcode / External Product Identifier (ISBN / UPC / EAN)
      if (validBarcode) {
        let identifierType = 'ean';
        if (validBarcode.length === 13 || validBarcode.length === 10) {
          identifierType = 'isbn';
        } else if (validBarcode.length === 12) {
          identifierType = 'upc';
        }

        payload.attributes.externally_assigned_product_identifier = [
          {
            type: identifierType,
            value: validBarcode,
            marketplace_id: marketplaceId
          }
        ];
      }

      // Main image locator if image URL exists
      const imageUrl = productData.imageUrl || productData.mainImage || (Array.isArray(productData.images) && productData.images[0]);
      if (imageUrl) {
        payload.attributes.main_product_image_locator = [
          {
            media_location: imageUrl,
            marketplace_id: marketplaceId
          }
        ];
      }

      // Additional catalog attributes when creating new standalone catalog listing
      if (requirementsMode === 'LISTING') {
        payload.attributes.item_name = [
          {
            value: productData.title,
            language_tag: 'ar_AE',
            marketplace_id: marketplaceId
          }
        ];

        // If there's no valid barcode, we must use GTIN exemption which requires the exact approved generic brand name ('عام')
        const finalBrand = (!validBarcode && !validAsin) ? 'عام' : (productData.brand || 'عام');

        payload.attributes.brand = [
          {
            value: finalBrand,
            language_tag: 'ar_AE',
            marketplace_id: marketplaceId
          }
        ];

        // Also force manufacturer to generic if using GTIN Exemption
        const finalManufacturer = (!validBarcode && !validAsin) ? 'generic' : (productData.publisher || 'generic');

        payload.attributes.manufacturer = [
          {
            value: finalManufacturer,
            language_tag: 'ar_AE',
            marketplace_id: marketplaceId
          }
        ];

        payload.attributes.part_number = [
          {
            value: productData.sku || 'TEST123',
            marketplace_id: marketplaceId
          }
        ];

        payload.attributes.number_of_items = [
          {
            value: 1,
            marketplace_id: marketplaceId
          }
        ];

        payload.attributes.country_of_origin = [
          {
            value: 'EG',
            marketplace_id: marketplaceId
          }
        ];

        payload.attributes.batteries_required = [
          {
            value: false,
            marketplace_id: marketplaceId
          }
        ];

        // GTIN Exemption if barcode/ASIN is missing or invalid
        if (!validBarcode && !validAsin) {
          payload.attributes.supplier_declared_has_product_identifier_exemption = [
            {
              value: true,
              marketplace_id: marketplaceId
            }
          ];
        }

        payload.attributes.supplier_declared_dg_hz_regulation = [
          {
            value: 'other',
            marketplace_id: marketplaceId
          }
        ];

        payload.attributes.warranty_description = [
          {
            value: '15 يوما',
            language_tag: 'ar_AE',
            marketplace_id: marketplaceId
          }
        ];

        payload.attributes.product_description = [
          {
            value: productData.description || productData.title || 'كتاب أصلي',
            language_tag: 'ar_AE',
            marketplace_id: marketplaceId
          }
        ];

        payload.attributes.bullet_point = [
          {
            value: productData.title || 'كتاب أصلي',
            language_tag: 'ar_AE',
            marketplace_id: marketplaceId
          }
        ];

        payload.attributes.included_components = [
          {
            value: 'كتاب',
            language_tag: 'ar_AE',
            marketplace_id: marketplaceId
          }
        ];

        const weightGrams = productData.packageWeight || productData.weight || 450;
        payload.attributes.item_weight = [
          {
            value: weightGrams,
            unit: 'grams',
            marketplace_id: marketplaceId
          }
        ];

        payload.attributes.item_package_weight = [
          {
            value: weightGrams,
            unit: 'grams',
            marketplace_id: marketplaceId
          }
        ];

        payload.attributes.item_package_dimensions = [
          {
            length: {
              value: productData.length || 25,
              unit: 'centimeters'
            },
            width: {
              value: productData.width || 18,
              unit: 'centimeters'
            },
            height: {
              value: productData.height || 3,
              unit: 'centimeters'
            },
            marketplace_id: marketplaceId
          }
        ];

        // Add price via putListingsItem instead of Pricing API
        if (productData.price) {
          payload.attributes.purchasable_offer = [
            {
              currency: 'EGP',
              our_price: [
                {
                  schedule: [
                    {
                      value_with_tax: productData.price
                    }
                  ]
                }
              ],
              marketplace_id: marketplaceId
            }
          ];
        }

        // Add inventory via putListingsItem instead of Inventory API
        if (productData.quantity !== undefined) {
          payload.attributes.fulfillment_availability = [
            {
              fulfillment_channel_code: 'DEFAULT',
              quantity: productData.quantity,
              marketplace_id: marketplaceId
            }
          ];
        }

        // Specific fields for ABIS_BOOK if selected
        if (targetProductType === 'ABIS_BOOK') {
          if (productData.price) {
            payload.attributes.list_price = [
              {
                currency: 'EGP',
                value: productData.price
              }
            ];
          }

          payload.attributes.subject_code = [
            {
              value: 'general'
            }
          ];

          payload.attributes.author = [
            {
              value: productData.author || productData.publisher || 'عام',
              language_tag: 'ar_AE'
            }
          ];

          payload.attributes.pages = [
            {
              value: productData.pages || 100,
              unit: 'pages'
            }
          ];

          payload.attributes.binding = [
            {
              value: 'paperback'
            }
          ];
        }
      }

      // Call Listings Items API: putListingsItem
      const result = await client.callAPI({
        operation: 'putListingsItem',
        endpoint: 'listingsItems',
        path: {
          sellerId: sellerId,
          sku: productData.sku
        },
        query: {
          marketplaceIds: [marketplaceId],
          issueLocale: 'en_US'
        },
        body: payload
      });

      const executionTime = Date.now() - startTime;
      const errorIssues = (result.issues || []).filter(i => i.severity === 'ERROR');
      const hasErrors = result.status === 'INVALID' || errorIssues.length > 0;

      if (hasErrors) {
        const errorDetails = errorIssues.map(i => `${i.attributeName ? `[${i.attributeName}] ` : ''}${i.message}`).join(' | ');
        const errorMessage = errorDetails || `Listing creation invalid on Amazon (Status: ${result.status})`;

        console.error('❌ [AMAZON LISTING] PUT_LISTINGS_ITEM_VALIDATION_ERROR', {
          timestamp: new Date().toISOString(),
          sku: productData.sku,
          productType: targetProductType,
          status: result.status,
          issues: result.issues || [],
          submissionId: result.submissionId,
          executionTime
        });
        logger.logError('CreateListing', new Error(errorMessage), { sku: productData.sku, issues: result.issues });

        return {
          success: false,
          sku: productData.sku,
          status: result.status || 'INVALID',
          submissionId: result.submissionId || productData.sku,
          issues: result.issues || [],
          error: errorMessage,
          amazonResponse: result
        };
      }

      console.log('✅ [AMAZON LISTING] PUT_LISTINGS_ITEM_SUCCESS', {
        timestamp: new Date().toISOString(),
        sku: productData.sku,
        productType: targetProductType,
        status: result.status,
        issues: result.issues || [],
        submissionId: result.submissionId || result.sku || productData.sku,
        executionTime,
        responseBody: result
      });
      logger.logResponse('CreateListing', result, executionTime);

      return {
        success: true,
        sku: productData.sku,
        status: result.status || 'ACCEPTED',
        submissionId: result.submissionId || result.sku || productData.sku,
        issues: result.issues || [],
        amazonResponse: result
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('❌ [AMAZON LISTING] PUT_LISTINGS_ITEM_ERROR', {
        timestamp: new Date().toISOString(),
        sku: productData.sku,
        error: error.message,
        code: error.code,
        details: error.details || error.response?.body || error.response || error,
        stack: error.stack,
        executionTime
      });
      logger.logError('CreateListing', error, { sku: productData.sku });

      return {
        success: false,
        sku: productData.sku,
        error: error.message,
        errorCode: error.code,
        details: error.details || error.response?.body || error.response || error
      };
    }
  }

  /**
   * Get product listing details via Listings Items API
   * GET /listings/2021-08-01/items/{sellerId}/{sku}
   */
  async getListing(sku) {
    const startTime = Date.now();
    const client = await amazonAuth.getClient();
    const marketplaceId = amazonAuth.getMarketplaceId();
    const sellerId = await amazonAuth.getSellerId();

    try {
      logger.logRequest('GetListing', { sku });

      const result = await client.callAPI({
        operation: 'getListingsItem',
        endpoint: 'listingsItems',
        path: {
          sellerId: sellerId,
          sku: sku
        },
        query: {
          marketplaceIds: [marketplaceId],
          includedData: 'summaries,issues,offers',
          issueLocale: 'en_US'
        }
      });

      const executionTime = Date.now() - startTime;
      logger.logResponse('GetListing', result, executionTime);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.logError('GetListing', error, { sku });

      return {
        success: false,
        error: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * Delete product listing via Listings Items API
   * DELETE /listings/2021-08-01/items/{sellerId}/{sku}
   */
  async deleteListing(sku) {
    const startTime = Date.now();
    const client = await amazonAuth.getClient();
    const marketplaceId = amazonAuth.getMarketplaceId();
    const sellerId = await amazonAuth.getSellerId();

    try {
      logger.logRequest('DeleteListing', { sku });

      const result = await client.callAPI({
        operation: 'deleteListingsItem',
        endpoint: 'listingsItems',
        path: {
          sellerId: sellerId,
          sku: sku
        },
        query: {
          marketplaceIds: [marketplaceId]
        }
      });

      const executionTime = Date.now() - startTime;
      logger.logResponse('DeleteListing', result, executionTime);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.logError('DeleteListing', error, { sku });

      return {
        success: false,
        error: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * Get Schema definition for a Product Type using Product Type Definitions API (2020-09-01)
   * GET /definitions/2020-09-01/productTypes/{productType}
   */
  async getProductTypeSchema(productType = 'ELECTRONIC_BOOK_READER') {
    const client = await amazonAuth.getClient();
    const marketplaceId = amazonAuth.getMarketplaceId();

    try {
      const result = await client.callAPI({
        operation: 'getDefinitionsProductType',
        endpoint: 'productTypeDefinitions',
        path: {
          productType: productType
        },
        query: {
          marketplaceIds: [marketplaceId],
          requirements: 'LISTING'
        }
      });

      return {
        success: true,
        schema: result
      };
    } catch (error) {
      logger.logError('GetProductTypeSchema', error, { productType });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if ASIN exists for SKU
   */
  async hasAsin(sku) {
    const result = await this.getListing(sku);
    if (!result.success) {
      return false;
    }
    const summaries = result.data?.summaries || [];
    return summaries.some(s => !!s.asin);
  }

  /**
   * Get ASIN for SKU
   */
  async getAsin(sku) {
    const result = await this.getListing(sku);
    if (!result.success) {
      return null;
    }
    const summaries = result.data?.summaries || [];
    const summaryWithAsin = summaries.find(s => !!s.asin);
    return summaryWithAsin?.asin || null;
  }
}

module.exports = new AmazonListingService();
