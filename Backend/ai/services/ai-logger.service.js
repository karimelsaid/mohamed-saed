const AIConfig = require('../config/ai.config');
const AutomationLog = require('../../models/AutomationLog.model');

/**
 * AI Logging & Monitoring Service
 * Logs all AI operations for monitoring, cost tracking, and debugging
 */
class AILogger {
  constructor() {
    this.config = AIConfig;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      totalExecutionTime: 0,
      byProvider: {},
      byTask: {},
      byModel: {}
    };
  }

  /**
   * Log AI execution
   * @param {Object} result - AI execution result
   * @param {Object} metadata - Additional metadata
   */
  async logExecution(result, metadata = {}) {
    const monitoringConfig = this.config.getMonitoringConfig();
    
    if (!monitoringConfig.enabled) {
      return;
    }

    // Update metrics
    this.metrics.totalRequests++;
    
    if (result.success) {
      this.metrics.successfulRequests++;
      
      if (result.tokens) {
        this.metrics.totalTokens += result.tokens.total || 0;
      }
      
      if (result.cost) {
        this.metrics.totalCost += result.cost || 0;
      }
      
      if (result.executionTime) {
        this.metrics.totalExecutionTime += result.executionTime || 0;
      }
      
      // Update by provider
      const provider = result.provider || 'unknown';
      if (!this.metrics.byProvider[provider]) {
        this.metrics.byProvider[provider] = {
          requests: 0,
          successful: 0,
          failed: 0,
          tokens: 0,
          cost: 0,
          executionTime: 0
        };
      }
      
      this.metrics.byProvider[provider].requests++;
      this.metrics.byProvider[provider].successful++;
      this.metrics.byProvider[provider].tokens += result.tokens?.total || 0;
      this.metrics.byProvider[provider].cost += result.cost || 0;
      this.metrics.byProvider[provider].executionTime += result.executionTime || 0;
      
      // Update by task
      const task = result.task || 'unknown';
      if (!this.metrics.byTask[task]) {
        this.metrics.byTask[task] = {
          requests: 0,
          successful: 0,
          failed: 0,
          tokens: 0,
          cost: 0,
          executionTime: 0
        };
      }
      
      this.metrics.byTask[task].requests++;
      this.metrics.byTask[task].successful++;
      this.metrics.byTask[task].tokens += result.tokens?.total || 0;
      this.metrics.byTask[task].cost += result.cost || 0;
      this.metrics.byTask[task].executionTime += result.executionTime || 0;
      
      // Update by model
      const model = result.model || 'unknown';
      if (!this.metrics.byModel[model]) {
        this.metrics.byModel[model] = {
          requests: 0,
          successful: 0,
          failed: 0,
          tokens: 0,
          cost: 0,
          executionTime: 0
        };
      }
      
      this.metrics.byModel[model].requests++;
      this.metrics.byModel[model].successful++;
      this.metrics.byModel[model].tokens += result.tokens?.total || 0;
      this.metrics.byModel[model].cost += result.cost || 0;
      this.metrics.byModel[model].executionTime += result.executionTime || 0;
    } else {
      this.metrics.failedRequests++;
      
      // Update failed counts
      const provider = result.provider || 'unknown';
      if (this.metrics.byProvider[provider]) {
        this.metrics.byProvider[provider].requests++;
        this.metrics.byProvider[provider].failed++;
      }
      
      const task = result.task || 'unknown';
      if (this.metrics.byTask[task]) {
        this.metrics.byTask[task].requests++;
        this.metrics.byTask[task].failed++;
      }
      
      const model = result.model || 'unknown';
      if (this.metrics.byModel[model]) {
        this.metrics.byModel[model].requests++;
        this.metrics.byModel[model].failed++;
      }
    }

    // Log to database if enabled
    if (monitoringConfig.logLevel === 'debug' || monitoringConfig.logLevel === 'info') {
      try {
        await AutomationLog.create({
          type: 'ai_execution',
          platform: result.provider || 'unknown',
          status: result.success ? 'success' : 'failed',
          title: `AI Task: ${result.task || 'unknown'}`,
          details: {
            task: result.task,
            model: result.model,
            provider: result.provider,
            tokens: result.tokens,
            cost: result.cost,
            executionTime: result.executionTime,
            cached: result.cached,
            error: result.error,
            ...metadata
          },
          metadata: {
            userId: metadata.userId,
            sessionId: metadata.sessionId,
            requestId: metadata.requestId
          }
        });
      } catch (dbError) {
        console.error('Failed to log AI execution to database:', dbError.message);
      }
    }
  }

  /**
   * Get current metrics
   * @returns {Object} - Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalRequests > 0 
        ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2)
        : 0,
      averageExecutionTime: this.metrics.successfulRequests > 0
        ? (this.metrics.totalExecutionTime / this.metrics.successfulRequests).toFixed(2)
        : 0,
      averageCostPerRequest: this.metrics.successfulRequests > 0
        ? (this.metrics.totalCost / this.metrics.successfulRequests).toFixed(4)
        : 0
    };
  }

  /**
   * Get metrics by provider
   * @param {string} provider - Provider name
   * @returns {Object} - Provider metrics
   */
  getProviderMetrics(provider) {
    return this.metrics.byProvider[provider] || null;
  }

  /**
   * Get metrics by task
   * @param {string} task - Task name
   * @returns {Object} - Task metrics
   */
  getTaskMetrics(task) {
    return this.metrics.byTask[task] || null;
  }

  /**
   * Get metrics by model
   * @param {string} model - Model name
   * @returns {Object} - Model metrics
   */
  getModelMetrics(model) {
    return this.metrics.byModel[model] || null;
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      totalExecutionTime: 0,
      byProvider: {},
      byTask: {},
      byModel: {}
    };
  }

  /**
   * Get cost report for a time period
   * @param {number} hours - Number of hours to look back
   * @returns {Promise<Object>} - Cost report
   */
  async getCostReport(hours = 24) {
    try {
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - hours);

      const logs = await AutomationLog.find({
        type: 'ai_execution',
        status: 'success',
        createdAt: { $gte: startDate }
      });

      let totalCost = 0;
      let totalTokens = 0;
      const byProvider = {};
      const byTask = {};
      const byModel = {};

      logs.forEach(log => {
        const details = log.details || {};
        
        totalCost += details.cost || 0;
        totalTokens += details.tokens?.total || 0;
        
        const provider = details.provider || 'unknown';
        if (!byProvider[provider]) {
          byProvider[provider] = { cost: 0, tokens: 0, requests: 0 };
        }
        byProvider[provider].cost += details.cost || 0;
        byProvider[provider].tokens += details.tokens?.total || 0;
        byProvider[provider].requests++;
        
        const task = details.task || 'unknown';
        if (!byTask[task]) {
          byTask[task] = { cost: 0, tokens: 0, requests: 0 };
        }
        byTask[task].cost += details.cost || 0;
        byTask[task].tokens += details.tokens?.total || 0;
        byTask[task].requests++;
        
        const model = details.model || 'unknown';
        if (!byModel[model]) {
          byModel[model] = { cost: 0, tokens: 0, requests: 0 };
        }
        byModel[model].cost += details.cost || 0;
        byModel[model].tokens += details.tokens?.total || 0;
        byModel[model].requests++;
      });

      return {
        period: `${hours} hours`,
        totalCost,
        totalTokens,
        totalRequests: logs.length,
        byProvider,
        byTask,
        byModel
      };
    } catch (error) {
      console.error('Error getting cost report:', error.message);
      return {
        period: `${hours} hours`,
        totalCost: 0,
        totalTokens: 0,
        totalRequests: 0,
        byProvider: {},
        byTask: {},
        byModel: {}
      };
    }
  }

  /**
   * Get performance report
   * @param {number} hours - Number of hours to look back
   * @returns {Promise<Object>} - Performance report
   */
  async getPerformanceReport(hours = 24) {
    try {
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - hours);

      const logs = await AutomationLog.find({
        type: 'ai_execution',
        createdAt: { $gte: startDate }
      });

      const totalRequests = logs.length;
      const successfulRequests = logs.filter(l => l.status === 'success').length;
      const failedRequests = logs.filter(l => l.status === 'failed').length;
      
      const totalExecutionTime = logs.reduce((sum, log) => {
        return sum + (log.details?.executionTime || 0);
      }, 0);

      const avgExecutionTime = successfulRequests > 0 
        ? totalExecutionTime / successfulRequests 
        : 0;

      const byProvider = {};
      const byTask = {};

      logs.forEach(log => {
        const details = log.details || {};
        
        const provider = details.provider || 'unknown';
        if (!byProvider[provider]) {
          byProvider[provider] = { total: 0, successful: 0, failed: 0, avgTime: 0 };
        }
        byProvider[provider].total++;
        if (log.status === 'success') {
          byProvider[provider].successful++;
          byProvider[provider].avgTime += details.executionTime || 0;
        } else {
          byProvider[provider].failed++;
        }
        
        const task = details.task || 'unknown';
        if (!byTask[task]) {
          byTask[task] = { total: 0, successful: 0, failed: 0, avgTime: 0 };
        }
        byTask[task].total++;
        if (log.status === 'success') {
          byTask[task].successful++;
          byTask[task].avgTime += details.executionTime || 0;
        } else {
          byTask[task].failed++;
        }
      });

      // Calculate average times
      Object.keys(byProvider).forEach(provider => {
        const successful = byProvider[provider].successful;
        byProvider[provider].avgTime = successful > 0 
          ? byProvider[provider].avgTime / successful 
          : 0;
      });

      Object.keys(byTask).forEach(task => {
        const successful = byTask[task].successful;
        byTask[task].avgTime = successful > 0 
          ? byTask[task].avgTime / successful 
          : 0;
      });

      return {
        period: `${hours} hours`,
        totalRequests,
        successfulRequests,
        failedRequests,
        successRate: totalRequests > 0 
          ? (successfulRequests / totalRequests * 100).toFixed(2)
          : 0,
        avgExecutionTime: avgExecutionTime.toFixed(2),
        byProvider,
        byTask
      };
    } catch (error) {
      console.error('Error getting performance report:', error.message);
      return {
        period: `${hours} hours`,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        successRate: 0,
        avgExecutionTime: 0,
        byProvider: {},
        byTask: {}
      };
    }
  }

  /**
   * Get error report
   * @param {number} hours - Number of hours to look back
   * @returns {Promise<Object>} - Error report
   */
  async getErrorReport(hours = 24) {
    try {
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - hours);

      const logs = await AutomationLog.find({
        type: 'ai_execution',
        status: 'failed',
        createdAt: { $gte: startDate }
      });

      const errors = logs.map(log => ({
        task: log.details?.task,
        provider: log.details?.provider,
        model: log.details?.model,
        error: log.details?.error,
        timestamp: log.createdAt
      }));

      const byProvider = {};
      const byTask = {};

      errors.forEach(err => {
        const provider = err.provider || 'unknown';
        if (!byProvider[provider]) {
          byProvider[provider] = 0;
        }
        byProvider[provider]++;
        
        const task = err.task || 'unknown';
        if (!byTask[task]) {
          byTask[task] = 0;
        }
        byTask[task]++;
      });

      return {
        period: `${hours} hours`,
        totalErrors: errors.length,
        byProvider,
        byTask,
        recentErrors: errors.slice(0, 10)
      };
    } catch (error) {
      console.error('Error getting error report:', error.message);
      return {
        period: `${hours} hours`,
        totalErrors: 0,
        byProvider: {},
        byTask: {},
        recentErrors: []
      };
    }
  }
}

// Singleton instance
const aiLogger = new AILogger();

// Export both class and singleton for testing
module.exports = aiLogger;
module.exports.AILoggerClass = AILogger;
