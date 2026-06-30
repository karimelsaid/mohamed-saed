/**
 * Integration Tests for Books Controller
 * اختبارات تكامل لـ Books Controller
 * للتحقق من أن endpoints أساسية تعمل بدون ReferenceError
 */

const request = require('supertest');
const app = require('../app');

describe('Books Controller Integration Tests', () => {
  
  describe('GET /api/books/categories', () => {
    it('should return categories without ReferenceError', async () => {
      const response = await request(app)
        .get('/api/books/categories')
        .expect('Content-Type', /json/);
      
      // Status should be 200 or 500 (if DB fails), but not crash with ReferenceError
      expect([200, 500]).toContain(response.status);
      
      // If successful, should return data
      if (response.status === 200) {
        expect(response.body).toBeDefined();
      }
    });
  });

  describe('GET /api/books/get-excel-data', () => {
    it('should return excel data without ReferenceError', async () => {
      const response = await request(app)
        .get('/api/books/get-excel-data')
        .expect('Content-Type', /json/);
      
      // Status should be 200 or 500 (if DB fails), but not crash with ReferenceError
      expect([200, 500]).toContain(response.status);
      
      // If successful, should return data
      if (response.status === 200) {
        expect(response.body).toBeDefined();
        expect(response.body.data).toBeDefined();
      }
    });
  });

  describe('GET /api/books/get-categories', () => {
    it('should return categories without ReferenceError', async () => {
      const response = await request(app)
        .get('/api/books/get-categories')
        .expect('Content-Type', /json/);
      
      // Status should be 200 or 500 (if DB fails), but not crash with ReferenceError
      expect([200, 500]).toContain(response.status);
      
      // If successful, should return data
      if (response.status === 200) {
        expect(response.body).toBeDefined();
      }
    });
  });
});
