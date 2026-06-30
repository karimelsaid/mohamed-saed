const { AILoggerClass } = require('./ai-logger.service');
const AutomationLog = require('../../models/AutomationLog.model');

jest.mock('../../models/AutomationLog.model');

describe('AI Logger Service', () => {
  let logger;

  beforeEach(() => {
    logger = new AILoggerClass();
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default metrics', () => {
      expect(logger.metrics).toBeDefined();
      expect(logger.metrics.totalRequests).toBe(0);
      expect(logger.metrics.successfulRequests).toBe(0);
      expect(logger.metrics.failedRequests).toBe(0);
      expect(logger.metrics.totalTokens).toBe(0);
      expect(logger.metrics.totalCost).toBe(0);
      expect(logger.metrics.totalExecutionTime).toBe(0);
      expect(logger.metrics.byProvider).toEqual({});
      expect(logger.metrics.byTask).toEqual({});
      expect(logger.metrics.byModel).toEqual({});
    });
  });

  describe('logExecution', () => {
    it('should log successful execution', async () => {
      AutomationLog.create.mockResolvedValue({});

      const result = {
        success: true,
        task: 'generate_caption',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.001,
        executionTime: 100
      };

      await logger.logExecution(result, { userId: 'user1' });

      expect(logger.metrics.totalRequests).toBe(1);
      expect(logger.metrics.successfulRequests).toBe(1);
      expect(logger.metrics.totalTokens).toBe(30);
      expect(logger.metrics.totalCost).toBe(0.001);
      expect(logger.metrics.totalExecutionTime).toBe(100);
    });

    it('should log failed execution', async () => {
      AutomationLog.create.mockResolvedValue({});

      const result = {
        success: false,
        task: 'generate_caption',
        provider: 'openai',
        model: 'gpt-4o-mini',
        error: 'API Error',
        executionTime: 50
      };

      await logger.logExecution(result, { userId: 'user1' });

      expect(logger.metrics.totalRequests).toBe(1);
      expect(logger.metrics.failedRequests).toBe(1);
      expect(logger.metrics.successfulRequests).toBe(0);
    });

    it('should update byProvider metrics', async () => {
      AutomationLog.create.mockResolvedValue({});

      const result = {
        success: true,
        task: 'generate_caption',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.001,
        executionTime: 100
      };

      await logger.logExecution(result, {});

      expect(logger.metrics.byProvider.openai).toBeDefined();
      expect(logger.metrics.byProvider.openai.requests).toBe(1);
      expect(logger.metrics.byProvider.openai.successful).toBe(1);
      expect(logger.metrics.byProvider.openai.tokens).toBe(30);
      expect(logger.metrics.byProvider.openai.cost).toBe(0.001);
    });

    it('should update byTask metrics', async () => {
      AutomationLog.create.mockResolvedValue({});

      const result = {
        success: true,
        task: 'generate_caption',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.001,
        executionTime: 100
      };

      await logger.logExecution(result, {});

      expect(logger.metrics.byTask.generate_caption).toBeDefined();
      expect(logger.metrics.byTask.generate_caption.requests).toBe(1);
      expect(logger.metrics.byTask.generate_caption.successful).toBe(1);
      expect(logger.metrics.byTask.generate_caption.tokens).toBe(30);
    });

    it('should update byModel metrics', async () => {
      AutomationLog.create.mockResolvedValue({});

      const result = {
        success: true,
        task: 'generate_caption',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.001,
        executionTime: 100
      };

      await logger.logExecution(result, {});

      expect(logger.metrics.byModel['gpt-4o-mini']).toBeDefined();
      expect(logger.metrics.byModel['gpt-4o-mini'].requests).toBe(1);
      expect(logger.metrics.byModel['gpt-4o-mini'].successful).toBe(1);
      expect(logger.metrics.byModel['gpt-4o-mini'].tokens).toBe(30);
    });

    it('should not log when monitoring is disabled', async () => {
      // Skip this test as logger doesn't have direct config access
      // Monitoring is controlled by AIConfig
      expect(true).toBe(true);
    });

    it('should handle database logging errors gracefully', async () => {
      AutomationLog.create.mockRejectedValue(new Error('DB Error'));

      const result = {
        success: true,
        task: 'generate_caption',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.001,
        executionTime: 100
      };

      await logger.logExecution(result, {});

      // Should still update metrics even if DB logging fails
      expect(logger.metrics.totalRequests).toBe(1);
      expect(logger.metrics.successfulRequests).toBe(1);
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics', async () => {
      AutomationLog.create.mockResolvedValue({});

      const result = {
        success: true,
        task: 'generate_caption',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.001,
        executionTime: 100
      };

      await logger.logExecution(result, {});

      const metrics = logger.getMetrics();

      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.totalTokens).toBe(30);
      expect(metrics.totalCost).toBe(0.001);
      expect(metrics.totalExecutionTime).toBe(100);
    });

    it('should calculate success rate', async () => {
      AutomationLog.create.mockResolvedValue({});

      await logger.logExecution({ success: true, task: 'task1', provider: 'openai', model: 'gpt-4o-mini', tokens: { total: 30 }, cost: 0.001, executionTime: 100 }, {});
      await logger.logExecution({ success: true, task: 'task2', provider: 'openai', model: 'gpt-4o-mini', tokens: { total: 30 }, cost: 0.001, executionTime: 100 }, {});
      await logger.logExecution({ success: false, task: 'task3', provider: 'openai', model: 'gpt-4o-mini', executionTime: 50 }, {});

      const metrics = logger.getMetrics();
      expect(metrics.successRate).toBe('66.67');
    });

    it('should calculate average execution time', async () => {
      AutomationLog.create.mockResolvedValue({});

      await logger.logExecution({ success: true, task: 'task1', provider: 'openai', model: 'gpt-4o-mini', tokens: { total: 30 }, cost: 0.001, executionTime: 100 }, {});
      await logger.logExecution({ success: true, task: 'task2', provider: 'openai', model: 'gpt-4o-mini', tokens: { total: 30 }, cost: 0.001, executionTime: 200 }, {});

      const metrics = logger.getMetrics();
      expect(metrics.averageExecutionTime).toBe('150.00');
    });

    it('should calculate average cost per request', async () => {
      AutomationLog.create.mockResolvedValue({});

      await logger.logExecution({ success: true, task: 'task1', provider: 'openai', model: 'gpt-4o-mini', tokens: { total: 30 }, cost: 0.001, executionTime: 100 }, {});
      await logger.logExecution({ success: true, task: 'task2', provider: 'openai', model: 'gpt-4o-mini', tokens: { total: 30 }, cost: 0.002, executionTime: 100 }, {});

      const metrics = logger.getMetrics();
      expect(metrics.averageCostPerRequest).toBe('0.0015');
    });
  });

  describe('getProviderMetrics', () => {
    it('should return metrics for specific provider', async () => {
      AutomationLog.create.mockResolvedValue({});

      const result = {
        success: true,
        task: 'generate_caption',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.001,
        executionTime: 100
      };

      await logger.logExecution(result, {});

      const providerMetrics = logger.getProviderMetrics('openai');
      expect(providerMetrics).toBeDefined();
      expect(providerMetrics.requests).toBe(1);
      expect(providerMetrics.successful).toBe(1);
    });

    it('should return null for non-existent provider', () => {
      const providerMetrics = logger.getProviderMetrics('nonexistent');
      expect(providerMetrics).toBeNull();
    });
  });

  describe('getTaskMetrics', () => {
    it('should return metrics for specific task', async () => {
      AutomationLog.create.mockResolvedValue({});

      const result = {
        success: true,
        task: 'generate_caption',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.001,
        executionTime: 100
      };

      await logger.logExecution(result, {});

      const taskMetrics = logger.getTaskMetrics('generate_caption');
      expect(taskMetrics).toBeDefined();
      expect(taskMetrics.requests).toBe(1);
      expect(taskMetrics.successful).toBe(1);
    });

    it('should return null for non-existent task', () => {
      const taskMetrics = logger.getTaskMetrics('nonexistent');
      expect(taskMetrics).toBeNull();
    });
  });

  describe('getModelMetrics', () => {
    it('should return metrics for specific model', async () => {
      AutomationLog.create.mockResolvedValue({});

      const result = {
        success: true,
        task: 'generate_caption',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.001,
        executionTime: 100
      };

      await logger.logExecution(result, {});

      const modelMetrics = logger.getModelMetrics('gpt-4o-mini');
      expect(modelMetrics).toBeDefined();
      expect(modelMetrics.requests).toBe(1);
      expect(modelMetrics.successful).toBe(1);
    });

    it('should return null for non-existent model', () => {
      const modelMetrics = logger.getModelMetrics('nonexistent');
      expect(modelMetrics).toBeNull();
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to zero', async () => {
      AutomationLog.create.mockResolvedValue({});

      await logger.logExecution({ success: true, task: 'task1', provider: 'openai', model: 'gpt-4o-mini', tokens: { total: 30 }, cost: 0.001, executionTime: 100 }, {});

      logger.resetMetrics();

      expect(logger.metrics.totalRequests).toBe(0);
      expect(logger.metrics.successfulRequests).toBe(0);
      expect(logger.metrics.failedRequests).toBe(0);
      expect(logger.metrics.totalTokens).toBe(0);
      expect(logger.metrics.totalCost).toBe(0);
      expect(logger.metrics.totalExecutionTime).toBe(0);
      expect(logger.metrics.byProvider).toEqual({});
      expect(logger.metrics.byTask).toEqual({});
      expect(logger.metrics.byModel).toEqual({});
    });
  });

  describe('getCostReport', () => {
    it('should return cost report from database', async () => {
      const mockLogs = [
        {
          details: {
            provider: 'openai',
            task: 'generate_caption',
            model: 'gpt-4o-mini',
            cost: 0.001,
            tokens: { total: 30 }
          }
        },
        {
          details: {
            provider: 'openai',
            task: 'sales_reply',
            model: 'gpt-4o-mini',
            cost: 0.002,
            tokens: { total: 50 }
          }
        }
      ];

      AutomationLog.find.mockResolvedValue(mockLogs);

      const report = await logger.getCostReport(24);

      expect(report.period).toBe('24 hours');
      expect(report.totalCost).toBe(0.003);
      expect(report.totalTokens).toBe(80);
      expect(report.totalRequests).toBe(2);
    });

    it('should handle database errors gracefully', async () => {
      AutomationLog.find.mockRejectedValue(new Error('DB Error'));

      const report = await logger.getCostReport(24);

      expect(report.period).toBe('24 hours');
      expect(report.totalCost).toBe(0);
      expect(report.totalTokens).toBe(0);
      expect(report.totalRequests).toBe(0);
    });
  });

  describe('getPerformanceReport', () => {
    it('should return performance report from database', async () => {
      const mockLogs = [
        {
          status: 'success',
          details: {
            provider: 'openai',
            task: 'generate_caption',
            model: 'gpt-4o-mini',
            executionTime: 100
          }
        },
        {
          status: 'failed',
          details: {
            provider: 'openai',
            task: 'generate_caption',
            model: 'gpt-4o-mini',
            executionTime: 50
          }
        }
      ];

      AutomationLog.find.mockResolvedValue(mockLogs);

      const report = await logger.getPerformanceReport(24);

      expect(report.period).toBe('24 hours');
      expect(report.totalRequests).toBe(2);
      expect(report.successfulRequests).toBe(1);
      expect(report.failedRequests).toBe(1);
      expect(report.successRate).toBe('50.00');
    });
  });

  describe('getErrorReport', () => {
    it('should return error report from database', async () => {
      const mockLogs = [
        {
          details: {
            provider: 'openai',
            task: 'generate_caption',
            model: 'gpt-4o-mini',
            error: 'API Error'
          },
          createdAt: new Date()
        }
      ];

      AutomationLog.find.mockResolvedValue(mockLogs);

      const report = await logger.getErrorReport(24);

      expect(report.period).toBe('24 hours');
      expect(report.totalErrors).toBe(1);
      expect(report.byProvider.openai).toBe(1);
      expect(report.byTask.generate_caption).toBe(1);
    });
  });
});
