const crypto = require('crypto');

class AmazonSkuGenerator {
  /**
   * Generate a random SKU in format: XXXX-XXXXX-XXXXX
   * Example: Q8-L4PK-7RZA
   */
  static generate() {
    const segment1 = this.generateSegment(2);
    const segment2 = this.generateSegment(4);
    const segment3 = this.generateSegment(4);
    
    return `${segment1}-${segment2}-${segment3}`;
  }

  /**
   * Generate a random alphanumeric segment
   */
  static generateSegment(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate SKU with collision check
   */
  static async generateUnique(ProductModel) {
    let sku;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      sku = this.generate();
      const existing = await ProductModel.findOne({ amazonSku: sku });
      if (!existing) {
        return sku;
      }
      attempts++;
    }

    throw new Error('Failed to generate unique SKU after maximum attempts');
  }
}

module.exports = AmazonSkuGenerator;
