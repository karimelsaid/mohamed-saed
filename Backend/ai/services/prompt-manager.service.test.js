const promptManager = require('./prompt-manager.service');

describe('Prompt Manager Service', () => {
  beforeEach(() => {
    // Reset prompts to default state before each test
    promptManager.prompts = {
      marketing: {
        generate_caption: {
          system: 'System prompt for caption generation',
          user_template: 'Product: {{name}}, Price: {{price}}'
        },
        generate_hashtags: {
          system: 'System prompt for hashtags',
          user_template: 'Category: {{category}}'
        }
      },
      sales: {
        analyze_intent: {
          system: 'System prompt for intent analysis',
          user_template: 'Message: {{message}}'
        }
      }
    };
  });

  describe('getSystemPrompt', () => {
    it('should return system prompt for valid domain and task', () => {
      const prompt = promptManager.getSystemPrompt('marketing', 'generate_caption');
      expect(prompt).toBe('System prompt for caption generation');
    });

    it('should throw error for invalid domain', () => {
      expect(() => {
        promptManager.getSystemPrompt('invalid', 'generate_caption');
      }).toThrow('Prompt not found for domain: invalid, task: generate_caption');
    });

    it('should throw error for invalid task', () => {
      expect(() => {
        promptManager.getSystemPrompt('marketing', 'invalid_task');
      }).toThrow('Prompt not found for domain: marketing, task: invalid_task');
    });
  });

  describe('getUserPromptTemplate', () => {
    it('should return user prompt template for valid domain and task', () => {
      const template = promptManager.getUserPromptTemplate('marketing', 'generate_caption');
      expect(template).toBe('Product: {{name}}, Price: {{price}}');
    });

    it('should throw error for invalid domain', () => {
      expect(() => {
        promptManager.getUserPromptTemplate('invalid', 'generate_caption');
      }).toThrow('Prompt not found for domain: invalid, task: generate_caption');
    });

    it('should throw error for invalid task', () => {
      expect(() => {
        promptManager.getUserPromptTemplate('marketing', 'invalid_task');
      }).toThrow('Prompt not found for domain: marketing, task: invalid_task');
    });
  });

  describe('renderTemplate', () => {
    it('should replace single variable', () => {
      const template = 'Hello {{name}}';
      const rendered = promptManager.renderTemplate(template, { name: 'John' });
      expect(rendered).toBe('Hello John');
    });

    it('should replace multiple variables', () => {
      const template = 'Product: {{name}}, Price: {{price}}';
      const rendered = promptManager.renderTemplate(template, { name: 'Book', price: 100 });
      expect(rendered).toBe('Product: Book, Price: 100');
    });

    it('should handle missing variables gracefully', () => {
      const template = 'Product: {{name}}, Price: {{price}}';
      const rendered = promptManager.renderTemplate(template, { name: 'Book' });
      expect(rendered).toBe('Product: Book, Price: {{price}}');
    });

    it('should replace all occurrences of same variable', () => {
      const template = '{{name}} loves {{name}}';
      const rendered = promptManager.renderTemplate(template, { name: 'John' });
      expect(rendered).toBe('John loves John');
    });

    it('should handle empty variables object', () => {
      const template = 'Product: {{name}}';
      const rendered = promptManager.renderTemplate(template, {});
      expect(rendered).toBe('Product: {{name}}');
    });

    it('should handle template with no variables', () => {
      const template = 'Hello World';
      const rendered = promptManager.renderTemplate(template, { name: 'John' });
      expect(rendered).toBe('Hello World');
    });
  });

  describe('getFullPrompt', () => {
    it('should return full prompt with system and rendered user', () => {
      const fullPrompt = promptManager.getFullPrompt('marketing', 'generate_caption', {
        name: 'Book',
        price: 100
      });

      expect(fullPrompt.system).toBe('System prompt for caption generation');
      expect(fullPrompt.user).toBe('Product: Book, Price: 100');
    });

    it('should handle empty variables', () => {
      const fullPrompt = promptManager.getFullPrompt('marketing', 'generate_caption', {});

      expect(fullPrompt.system).toBe('System prompt for caption generation');
      expect(fullPrompt.user).toBe('Product: {{name}}, Price: {{price}}');
    });

    it('should throw error for invalid domain', () => {
      expect(() => {
        promptManager.getFullPrompt('invalid', 'generate_caption', {});
      }).toThrow('Prompt not found for domain: invalid, task: generate_caption');
    });
  });

  describe('setPrompt', () => {
    it('should add new prompt to existing domain', () => {
      promptManager.setPrompt('marketing', 'new_task', {
        system: 'New system prompt',
        user_template: 'New template {{var}}'
      });

      const system = promptManager.getSystemPrompt('marketing', 'new_task');
      const template = promptManager.getUserPromptTemplate('marketing', 'new_task');

      expect(system).toBe('New system prompt');
      expect(template).toBe('New template {{var}}');
    });

    it('should add new domain and prompt', () => {
      promptManager.setPrompt('new_domain', 'new_task', {
        system: 'New system prompt',
        user_template: 'New template {{var}}'
      });

      const system = promptManager.getSystemPrompt('new_domain', 'new_task');
      const template = promptManager.getUserPromptTemplate('new_domain', 'new_task');

      expect(system).toBe('New system prompt');
      expect(template).toBe('New template {{var}}');
    });

    it('should update existing prompt', () => {
      promptManager.setPrompt('marketing', 'generate_caption', {
        system: 'Updated system prompt',
        user_template: 'Updated template {{var}}'
      });

      const system = promptManager.getSystemPrompt('marketing', 'generate_caption');
      const template = promptManager.getUserPromptTemplate('marketing', 'generate_caption');

      expect(system).toBe('Updated system prompt');
      expect(template).toBe('Updated template {{var}}');
    });
  });

  describe('listPrompts', () => {
    it('should return all prompts', () => {
      const allPrompts = promptManager.listPrompts();

      expect(allPrompts).toHaveProperty('marketing');
      expect(allPrompts).toHaveProperty('sales');
      expect(allPrompts.marketing).toHaveProperty('generate_caption');
      expect(allPrompts.marketing).toHaveProperty('generate_hashtags');
      expect(allPrompts.sales).toHaveProperty('analyze_intent');
    });
  });

  describe('listDomainPrompts', () => {
    it('should return prompts for specific domain', () => {
      const marketingPrompts = promptManager.listDomainPrompts('marketing');

      expect(marketingPrompts).toHaveProperty('generate_caption');
      expect(marketingPrompts).toHaveProperty('generate_hashtags');
      expect(marketingPrompts).not.toHaveProperty('analyze_intent');
    });

    it('should return empty object for non-existent domain', () => {
      const invalidPrompts = promptManager.listDomainPrompts('invalid');

      expect(invalidPrompts).toEqual({});
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle marketing caption generation with real data', () => {
      const fullPrompt = promptManager.getFullPrompt('marketing', 'generate_caption', {
        name: 'The Great Book',
        description: 'An amazing story',
        price: '150',
        category: 'روايات',
        tone: 'emotional'
      });

      expect(fullPrompt.system).toBeDefined();
      expect(fullPrompt.user).toContain('The Great Book');
      expect(fullPrompt.user).toContain('150');
      expect(fullPrompt.user).toContain('روايات');
      expect(fullPrompt.user).toContain('emotional');
    });

    it('should handle sales intent analysis with real data', () => {
      const fullPrompt = promptManager.getFullPrompt('sales', 'analyze_intent', {
        message: 'I want to buy this book',
        platform: 'facebook'
      });

      expect(fullPrompt.system).toBeDefined();
      expect(fullPrompt.user).toContain('I want to buy this book');
      expect(fullPrompt.user).toContain('facebook');
    });
  });
});
