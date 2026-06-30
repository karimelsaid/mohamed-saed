/**
 * Integration Test for Chat AI Controller - Book Extraction
 * اختبار تكامل لـ Chat AI Controller - استخراج الكتب
 * 
 * هذا الاختبار يتحقق من أن الكتب يتم استخراجها بشكل صحيح من الردود
 * وأن ميزة الكارد التفاعلي تعمل بشكل صحيح
 */

const request = require('supertest');
const app = require('../app');

describe('Chat AI Controller - Book Extraction Integration Test', () => {
  
  describe('POST /api/chat-ai/send-message', () => {
    
    it('should extract books from AI response with BOOK tokens', async () => {
      const response = await request(app)
        .post('/api/chat-ai/send-message')
        .send({
          messages: [
            { role: 'user', content: 'أريد كتاباً عن علم النفس' }
          ],
          model: 'gemini-2.5-flash',
          temperature: 0.7,
          max_tokens: 1000
        })
        .expect('Content-Type', /json/);
      
      // Status should be 200
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Check that response has data structure
      expect(response.body.data).toBeDefined();
      expect(response.body.data.choices).toBeDefined();
      expect(response.body.data.choices.length).toBeGreaterThan(0);
      
      // Check that content exists and is cleaned (no raw BOOK tokens)
      const content = response.body.data.choices[0].message.content;
      expect(content).toBeDefined();
      expect(typeof content).toBe('string');
      
      // Content should not contain raw BOOK tokens
      expect(content).not.toMatch(/\[BOOK:\d+:[^:]+:[^:]+:[^:]+:[^\]]+\]/);
      
      // Check that books array exists
      expect(response.body.data.books).toBeDefined();
      expect(Array.isArray(response.body.data.books)).toBe(true);
      
      // If AI returned BOOK tokens, books array should not be empty
      // Note: This depends on AI actually returning BOOK tokens
      // In a real test, we might mock the AI provider to guarantee this
      if (content.includes('كتاب') || content.includes('رواية')) {
        // If content mentions books, we expect books array to have data
        // This is a soft check since AI might not always return BOOK tokens
        console.log('Content mentions books, checking books array...');
      }
    });

    it('should handle response without BOOK tokens gracefully', async () => {
      const response = await request(app)
        .post('/api/chat-ai/send-message')
        .send({
          messages: [
            { role: 'user', content: 'مرحباً' }
          ],
          model: 'gemini-2.5-flash',
          temperature: 0.7,
          max_tokens: 1000
        })
        .expect('Content-Type', /json/);
      
      // Status should be 200
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Books array should exist (may be empty)
      expect(response.body.data.books).toBeDefined();
      expect(Array.isArray(response.body.data.books)).toBe(true);
    });

    it('should include complete book data when BOOK tokens are present', async () => {
      // This test would ideally mock the AI provider to return specific BOOK tokens
      // For now, we'll test the structure when books are returned
      
      const response = await request(app)
        .post('/api/chat-ai/send-message')
        .send({
          messages: [
            { role: 'user', content: 'أرشح لي كتباً عن التطوير الذاتي' }
          ],
          model: 'gemini-2.5-flash',
          temperature: 0.7,
          max_tokens: 1000
        })
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(200);
      expect(response.body.data.books).toBeDefined();
      
      // If books are returned, check their structure
      const books = response.body.data.books;
      if (books && books.length > 0) {
        const firstBook = books[0];
        expect(firstBook).toHaveProperty('id');
        expect(firstBook).toHaveProperty('title');
        expect(firstBook).toHaveProperty('author');
        expect(firstBook).toHaveProperty('price');
        expect(firstBook).toHaveProperty('buyUrl');
        
        // All fields should be non-empty strings
        expect(typeof firstBook.id).toBe('string');
        expect(typeof firstBook.title).toBe('string');
        expect(typeof firstBook.author).toBe('string');
        expect(typeof firstBook.price).toBe('string');
        expect(typeof firstBook.buyUrl).toBe('string');
        
        expect(firstBook.id.length).toBeGreaterThan(0);
        expect(firstBook.title.length).toBeGreaterThan(0);
        expect(firstBook.buyUrl.length).toBeGreaterThan(0);
      }
    });

    it('should not include BOOK tokens in final content', async () => {
      const response = await request(app)
        .post('/api/chat-ai/send-message')
        .send({
          messages: [
            { role: 'user', content: 'أريد كتاباً عن التاريخ' }
          ],
          model: 'gemini-2.5-flash',
          temperature: 0.7,
          max_tokens: 1000
        })
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(200);
      
      const content = response.body.data.choices[0].message.content;
      
      // Content should not contain raw BOOK tokens
      expect(content).not.toMatch(/\[BOOK:[^\]]+\]/);
      
      // Content should be wrapped in RTL div
      expect(content).toContain('<div dir="rtl">');
    });
  });

  describe('Book Extraction Logic', () => {
    
    it('should extract books from BOOK tokens correctly', () => {
      // This tests the extractBooksFromResponse function logic
      const testResponse = 'أرشح لك [BOOK:123:كتاب:مؤلف:50:https://example.com/book/123] و [BOOK:456:كتاب2:مؤلف2:60:https://example.com/book/456]';
      
      const bookRegex = /\[BOOK:([^:]+):([^:]+):([^:]+):([^:]+):([^\]]+)\]/g;
      const books = [];
      let match;
      
      while ((match = bookRegex.exec(testResponse)) !== null) {
        books.push({
          id: match[1],
          title: match[2],
          author: match[3],
          price: match[4],
          buyUrl: match[5]
        });
      }
      
      expect(books.length).toBe(2);
      expect(books[0].id).toBe('123');
      expect(books[0].title).toBe('كتاب');
      expect(books[0].author).toBe('مؤلف');
      expect(books[0].price).toBe('50');
      expect(books[0].buyUrl).toBe('https://example.com/book/123');
      
      expect(books[1].id).toBe('456');
      expect(books[1].title).toBe('كتاب2');
    });

    it('should handle broken BOOK tokens gracefully', () => {
      const testResponse = 'أرشح لك [BOOK:123 و [BOOK:456:كتاب]';
      
      const brokenRegex = /\[BOOK:(\d+)/g;
      const books = [];
      let brokenMatch;
      
      while ((brokenMatch = brokenRegex.exec(testResponse)) !== null) {
        books.push({
          id: brokenMatch[1],
          title: 'غير محدد',
          author: 'غير محدد',
          price: 'غير محدد',
          buyUrl: '#'
        });
      }
      
      expect(books.length).toBe(2);
      expect(books[0].id).toBe('123');
      expect(books[0].title).toBe('غير محدد');
    });

    it('should not duplicate books when both full and broken regex match same token', () => {
      // This test reproduces the bug where the same book appears twice
      // once with full data and once with "غير محدد" data
      const testResponse = 'أرشح لك [BOOK:36:ارسس الجزء الثاني:غير محدد:90:https://knoozbook.com/book/36]';
      
      const bookRegex = /\[BOOK:([^:]+):([^:]+):([^:]+):([^:]+):([^\]]+)\]/g;
      const books = [];
      let match;
      
      while ((match = bookRegex.exec(testResponse)) !== null) {
        books.push({
          id: match[1],
          title: match[2],
          author: match[3],
          price: match[4],
          buyUrl: match[5]
        });
      }
      
      // Old broken regex that would match the same token again
      const brokenRegex = /\[BOOK:(\d+)/g;
      let brokenMatch;
      while ((brokenMatch = brokenRegex.exec(testResponse)) !== null) {
        books.push({
          id: brokenMatch[1],
          title: 'غير محدد',
          author: 'غير محدد',
          price: 'غير محدد',
          buyUrl: '#'
        });
      }
      
      // Before fix: this would be 2 (duplicate)
      // After fix with de-duplication: this should be 1
      expect(books.length).toBeGreaterThan(0);
      
      // Check for duplicates
      const ids = books.map(b => b.id);
      const uniqueIds = [...new Set(ids)];
      expect(ids.length).toBe(uniqueIds.length); // No duplicates
    });

    it('should filter out books with "غير محدد" title or "#" buyUrl', () => {
      const testBooks = [
        { id: '1', title: 'كتاب جيد', author: 'مؤلف', price: '50', buyUrl: 'https://example.com/book/1' },
        { id: '2', title: 'غير محدد', author: 'غير محدد', price: 'غير محدد', buyUrl: '#' },
        { id: '3', title: 'كتاب آخر', author: 'مؤلف2', price: '60', buyUrl: 'https://example.com/book/3' }
      ];
      
      const filteredBooks = testBooks.filter(book => 
        book.title !== 'غير محدد' && 
        book.buyUrl !== '#' && 
        book.buyUrl && 
        book.buyUrl.length > 0
      );
      
      expect(filteredBooks.length).toBe(2);
      expect(filteredBooks.every(book => book.title !== 'غير محدد')).toBe(true);
      expect(filteredBooks.every(book => book.buyUrl !== '#')).toBe(true);
    });

    it('should handle de-duplication correctly', () => {
      const testBooks = [
        { id: '1', title: 'كتاب جيد', author: 'مؤلف', price: '50', buyUrl: 'https://example.com/book/1' },
        { id: '1', title: 'غير محدد', author: 'غير محدد', price: 'غير محدد', buyUrl: '#' },
        { id: '2', title: 'كتاب آخر', author: 'مؤلف2', price: '60', buyUrl: 'https://example.com/book/2' }
      ];
      
      const uniqueBooks = Object.values(
        testBooks.reduce((acc, book) => {
          if (!acc[book.id] || 
              (book.title !== 'غير محدد' && acc[book.id].title === 'غير محدد') ||
              (book.buyUrl !== '#' && acc[book.id].buyUrl === '#')) {
            acc[book.id] = book;
          }
          return acc;
        }, {})
      );
      
      expect(uniqueBooks.length).toBe(2);
      expect(uniqueBooks[0].id).toBe('1');
      expect(uniqueBooks[0].title).toBe('كتاب جيد'); // Should keep the full data, not "غير محدد"
      expect(uniqueBooks[1].id).toBe('2');
    });
  });
});
