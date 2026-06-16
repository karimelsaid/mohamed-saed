/**
 * Fast MongoDB update: set price_cost = product_price * 0.9 for all publisher products
 * Uses proper $nin query and bulkWrite for speed.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('products');

    // Step 1: Count all products with a publisher
    const allPublisher = await collection.find({
        publisher: { $exists: true, $nin: ['', null] }
    }).toArray();
    console.log(`📊 Total products with publisher: ${allPublisher.length}`);

    // Step 2: Find those where price_cost is effectively 0
    const zeroCost = allPublisher.filter(p => {
        const cost = parseFloat(p.price_cost);
        return !cost || cost === 0 || isNaN(cost);
    });
    console.log(`🔍 Products with publisher and price_cost = 0: ${zeroCost.length}`);

    // Step 3: Also find those where price_cost needs recalculating (not equal to price * 0.9)
    const needsUpdate = allPublisher.filter(p => {
        const price = parseFloat(p.product_price) || 0;
        const cost = parseFloat(p.price_cost) || 0;
        const expected = Math.round(price * 0.9 * 100) / 100;
        return price > 0 && cost !== expected;
    });
    console.log(`🔧 Products with publisher where price_cost ≠ price * 0.9: ${needsUpdate.length}`);

    // Preview zero-cost products
    if (zeroCost.length > 0) {
        console.log('\n--- Zero price_cost samples ---');
        zeroCost.slice(0, 10).forEach(p => {
            console.log(`  [${p.barcode || p.products_id}] ${p.product_name} | price: ${p.product_price} | cost: ${p.price_cost} | publisher: ${p.publisher}`);
        });
    }

    // Update ALL publisher products where price_cost = 0 and product_price > 0
    const toUpdate = allPublisher.filter(p => {
        const price = parseFloat(p.product_price) || 0;
        const cost = parseFloat(p.price_cost) || 0;
        return price > 0 && cost === 0;
    });

    console.log(`\n📝 Will update ${toUpdate.length} products (publisher + price > 0 + cost = 0)`);

    if (toUpdate.length > 0) {
        // Preview
        toUpdate.slice(0, 15).forEach(p => {
            const price = parseFloat(p.product_price) || 0;
            const newCost = Math.round(price * 0.9 * 100) / 100;
            console.log(`  - ${p.product_name} | price: ${price} → cost: ${newCost} | publisher: ${p.publisher}`);
        });

        const ops = toUpdate.map(p => {
            const price = parseFloat(p.product_price) || 0;
            const newCost = Math.round(price * 0.9 * 100) / 100;
            return {
                updateOne: {
                    filter: { _id: p._id },
                    update: { $set: { price_cost: newCost } }
                }
            };
        });

        for (let i = 0; i < ops.length; i += 500) {
            const chunk = ops.slice(i, i + 500);
            const result = await collection.bulkWrite(chunk);
            console.log(`  ✅ Batch ${Math.floor(i/500) + 1}: ${result.modifiedCount} updated`);
        }
    }

    await mongoose.disconnect();
    console.log('\n🎉 Done!');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
